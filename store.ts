/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { DataStore } from "@api/index";

import { UNKNOWN_USER_LABELS } from "./i18n";
import { UNKNOWN_NAME } from "./names";
import { getHistoryLimit, settings } from "./settings";

const DATASTORE_KEY = "VoiceRadar-Discord_Users";
const SAVE_DEBOUNCE_MS = 750;

export interface TrackedUser {
    id: string;
    /** cached display name, used while the user object is not in Discord's cache */
    name: string;
    pinned: boolean;
    notify: boolean;
    autoJoin: boolean;
    /** moderator mode. Drag them into your channel whenever they show up in voice */
    autoPull: boolean;
    /** last time we shared a voice channel, or when they were added if that never happened */
    lastSeen: number;
    /**
     * Whether lastSeen is a sighting. Somebody added by hand has never been sat with, so calling that
     * "seen 2 days ago" would be untrue. It is when they went into the list.
     */
    sharedVoice: boolean;
    lastChannelId: string | null;
    lastChannelName: string | null;
    /** added by hand rather than picked up from a voice channel. The limit leaves them alone */
    manual: boolean;
    /** manual position among the pinned people. Null until you drag them around */
    order: number | null;
}

export interface VisibleUsers {
    pinned: TrackedUser[];
    recent: TrackedUser[];
    /**
     * The ceiling for plain history once the people you set up by hand are counted, not the
     * remainder. How many slots are actually free is `limit - (pinned + recent)`.
     */
    historyCapacity: number;
}

let users: TrackedUser[] = [];
/** Same people, keyed by id. Lookups run on every voice event, scanning the array was waste. */
let usersById = new Map<string, TrackedUser>();
/**
 * The pinned people in their stored order, id to position.
 *
 * Built once per change rather than per question. Every row asks where it sits while a drag is in
 * progress, and answering that with a filter and a sort of the whole list meant one of each per row
 * per frame.
 */
let pinnedOrder = new Map<string, number>();
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Whether the saved list has actually been read. Nothing is written back before it has been. A failed
 * read leaves the store empty, and writing that emptiness back would turn one bad read into permanent
 * data loss. Instead the read is retried next start, with the stored list still intact.
 */
let loaded = false;

/**
 * Bumped by every load and every reset. Switching the plugin off and on again overlaps the two, since
 * `stop` is still flushing while `start` is already loading. Without this the late shutdown would
 * blank a list the new session had just read.
 */
let storeGeneration = 0;

const listeners = new Set<() => void>();

/** Set when the read itself failed, which is a real fault rather than a slow start. */
let loadFailed = false;

/** What the window shows in its corner. Reading is a slow start, failing to read is a fault. */
export function getStoreState(): "loading" | "ready" | "failed" {
    if (loaded) return "ready";
    return loadFailed ? "failed" : "loading";
}

export function subscribeToStore(listener: () => void): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

function emit() {
    listeners.forEach(listener => {
        try {
            listener();
        } catch (error) {
            console.error("[VoiceRadar-Discord] listener failed:", error);
        }
    });
}

function scheduleSave() {
    if (!loaded) return; // see `loaded`

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        void DataStore.set(DATASTORE_KEY, users).catch(error =>
            console.error("[VoiceRadar-Discord] failed to save users:", error));
    }, SAVE_DEBOUNCE_MS);
}

async function flushStore(): Promise<void> {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    if (!loaded) return; // see `loaded`

    await DataStore.set(DATASTORE_KEY, users).catch(error =>
        console.error("[VoiceRadar-Discord] failed to flush users:", error));
}

/**
 * Anything that means "no name", in any language.
 *
 * The sentinel is what gets stored, but an entry written by an older build can carry a translated
 * placeholder, and treating that as a real name is how a good name used to get overwritten. Checking
 * every dictionary heals those entries as they are read.
 */
function isPlaceholderName(name: string | undefined): boolean {
    return !name || name === UNKNOWN_NAME || UNKNOWN_USER_LABELS.includes(name);
}

/** Never trade a name we already know for the placeholder Discord gives us for uncached users. */
function bestName(incoming: string | undefined, existing?: string): string {
    if (!isPlaceholderName(incoming)) return incoming!;
    if (!isPlaceholderName(existing)) return existing!;
    return UNKNOWN_NAME;
}

function normalize(raw: Partial<TrackedUser>): TrackedUser | null {
    if (!raw?.id) return null;
    return {
        id: String(raw.id),
        // bestName rather than a plain fallback, so a translated placeholder from an older build
        // collapses back onto the sentinel instead of sticking around as a name
        name: bestName(raw.name),
        pinned: !!raw.pinned,
        notify: !!raw.notify,
        autoJoin: !!raw.autoJoin,
        autoPull: !!raw.autoPull,
        lastSeen: Number(raw.lastSeen) || Date.now(),
        // for entries saved before this flag existed. Everything that got in on its own did so by
        // being seen, everything added by hand had not been. A hand-added person you did sit with
        // reads as "added" once, then corrects itself the next time you share a channel
        sharedVoice: raw.sharedVoice ?? !raw.manual,
        lastChannelId: raw.lastChannelId ?? null,
        lastChannelName: raw.lastChannelName ?? null,
        manual: !!raw.manual,
        order: Number.isFinite(raw.order as number) ? Number(raw.order) : null
    };
}

/** Dragged pins keep their manual order, the rest follow by recency, after them. */
function comparePinned(a: TrackedUser, b: TrackedUser): number {
    if (a.order != null && b.order != null) return a.order - b.order;
    if (a.order != null) return -1;
    if (b.order != null) return 1;
    return b.lastSeen - a.lastSeen;
}

/** Anything you switched on by hand outlives the limit, which only caps plain history. */
function isProtected(user: TrackedUser): boolean {
    return user.pinned || user.notify || user.autoJoin || user.autoPull || user.manual;
}

/**
 * Drops the oldest plain-history entries that no longer fit into the limit. People you pinned,
 * gave a bell or made the auto-join target are never dropped, otherwise adding someone while pinned
 * people already fill the limit would silently undo itself.
 */
function trim(list: TrackedUser[]): TrackedUser[] {
    const limit = getHistoryLimit();
    const kept = list.filter(isProtected);
    const historyCapacity = Math.max(0, limit - kept.length);
    const recent = list
        .filter(user => !isProtected(user))
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, historyCapacity);

    return [...kept, ...recent];
}

function commit(next: TrackedUser[], { save = true } = {}) {
    users = trim(next);
    usersById = new Map(users.map(user => [user.id, user]));
    pinnedOrder = new Map(users
        .filter(user => user.pinned)
        .sort(comparePinned)
        .map((user, index) => [user.id, index]));

    if (save) scheduleSave();
    emit();
}

/** The pinned people in their stored order. Insertion order is that order. See pinnedOrder. */
function pinnedInOrder(): TrackedUser[] {
    return [...pinnedOrder.keys()]
        .map(id => usersById.get(id))
        .filter((user): user is TrackedUser => user !== undefined);
}

export async function loadStore(): Promise<void> {
    const generation = ++storeGeneration;
    loadFailed = false;

    try {
        const stored = await DataStore.get<TrackedUser[]>(DATASTORE_KEY);
        if (generation !== storeGeneration) return; // a newer load, or a shutdown, took over

        const parsed = Array.isArray(stored)
            ? stored.map(normalize).filter((user): user is TrackedUser => user !== null)
            : [];
        commit(parsed, { save: false });
        loaded = true;
        loadFailed = false;
    } catch (error) {
        console.error(
            "[VoiceRadar-Discord] failed to load saved users, so the list will stay empty this session,"
            + " and nothing is written back so the stored one survives.",
            error
        );
        if (generation !== storeGeneration) return;
        commit([], { save: false });
        // deliberately not marking as loaded. See `loaded`
        loadFailed = true;
    }
}

function resetStore() {
    storeGeneration++;
    loaded = false;

    /*
     * And a verdict about the session that has ended, not about the one starting.
     *
     * `start` registers the hotkey before it reads the list, so the window can be opened inside that
     * gap, and a failure left behind by the previous session greeted it in red with "the saved list
     * could not be read" over a list that was merely still loading.
     */
    loadFailed = false;

    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    users = [];
    usersById.clear();
    pinnedOrder.clear();

    // the listener set is deliberately left alone. Every subscriber removes itself in its own
    // cleanup, and clearing it here cut off components that outlive the plugin. The account-panel
    // button is patched in and stays mounted, so it never got its subscription back
}

/**
 * Write what is in memory, then let go of it, as one step, because a plugin toggled off and on again
 * runs the two halves concurrently. If the next session has already loaded by the time the write
 * finishes, the reset is skipped. The list on screen belongs to that session now.
 */
export async function shutdownStore(): Promise<void> {
    const generation = storeGeneration;

    await flushStore();

    if (generation !== storeGeneration) return;
    resetStore();
}

export function getUsers(): readonly TrackedUser[] {
    return users;
}

export function getTrackedUser(id: string): TrackedUser | undefined {
    return usersById.get(id);
}

export function isTracked(id: string): boolean {
    return usersById.has(id);
}

export function getVisibleUsers(): VisibleUsers {
    const limit = getHistoryLimit();
    const pinned = pinnedInOrder();
    const recent = users.filter(user => !user.pinned).sort((a, b) => b.lastSeen - a.lastSeen);

    // the stored list is already capped, so this is only "how much plain history still fits"
    const protectedCount = users.filter(isProtected).length;

    return { pinned, recent, historyCapacity: Math.max(0, limit - protectedCount) };
}

export function getAutoJoinTarget(): TrackedUser | undefined {
    return users.find(user => user.autoJoin);
}

function upsert(id: string, patch: Partial<TrackedUser>) {
    const existing = getTrackedUser(id);

    if (existing) {
        const merged = { ...existing, ...patch, name: bestName(patch.name, existing.name) };
        commit(users.map(user => (user.id === id ? merged : user)));
        return;
    }

    const created = normalize({
        id,
        name: UNKNOWN_NAME,
        lastSeen: Date.now(),
        ...patch
    });
    if (created) commit([...users, created]);
}

export interface TouchEntry {
    id: string;
    name: string;
    channelId: string | null;
    channelName: string | null;
}

/** How stale lastSeen has to be before a periodic sweep is allowed to rewrite it. */
const LAST_SEEN_THROTTLE_MS = 30_000;

/**
 * Batched version of touchUser for the periodic sweep. One commit for the whole channel instead of
 * one per person, and a complete no-op when nothing changed, so sitting in a voice channel does not
 * cost a re-render and an IndexedDB write every few seconds.
 */
export function touchUsers(entries: TouchEntry[]) {
    if (!entries.length) return;

    const now = Date.now();
    /**
     * Replacements for people already in the list, and brand new ones, kept apart so the list is
     * rebuilt exactly once at the end. Copying the whole array per changed person meant a channel
     * of a hundred cost a hundred copies of a hundred entries every sweep.
     */
    const replaced = new Map<string, TrackedUser>();
    const added = new Map<string, TrackedUser>();

    for (const entry of entries) {
        // a second entry for the same person in one batch must merge onto the fresh copy, not onto
        // the one this loop started with
        const existing = replaced.get(entry.id) ?? added.get(entry.id) ?? usersById.get(entry.id);

        if (!existing) {
            if (!settings.store.trackAutomatically) continue;

            const created = normalize({
                id: entry.id,
                name: entry.name,
                lastSeen: now,
                sharedVoice: true,
                lastChannelId: entry.channelId,
                lastChannelName: entry.channelName
            });
            if (created) added.set(created.id, created);
            continue;
        }

        const bumpLastSeen = now - existing.lastSeen > LAST_SEEN_THROTTLE_MS;
        const channelChanged = existing.lastChannelId !== entry.channelId
            || existing.lastChannelName !== entry.channelName;
        const name = bestName(entry.name, existing.name);
        // a sighting, so somebody added by hand stops being merely "added". Worth a write of its
        // own even when nothing else about them changed
        const firstSighting = !existing.sharedVoice;

        if (!bumpLastSeen && !channelChanged && !firstSighting && existing.name === name) continue;

        const merged: TrackedUser = {
            ...existing,
            name,
            lastSeen: bumpLastSeen ? now : existing.lastSeen,
            sharedVoice: true,
            lastChannelId: entry.channelId,
            lastChannelName: entry.channelName
        };

        // somebody created earlier in this same batch is not in the list yet, so they stay on the
        // side that gets appended, because `replaced` only covers what is already in the list
        (added.has(entry.id) ? added : replaced).set(entry.id, merged);
    }

    if (!replaced.size && !added.size) return;

    commit([
        ...users.map(user => replaced.get(user.id) ?? user),
        ...added.values()
    ]);
}

/** Refreshes (or creates) an entry after seeing the person in voice. */
export function touchUser(id: string, name: string, channelId: string | null, channelName: string | null) {
    if (!isTracked(id) && !settings.store.trackAutomatically) return;

    upsert(id, {
        name,
        lastSeen: Date.now(),
        sharedVoice: true,
        lastChannelId: channelId,
        lastChannelName: channelName
    });
}

/** Updates cached channel info without bumping lastSeen, for people we only watch. */
export function updateLastChannel(id: string, name: string, channelId: string | null, channelName: string | null) {
    if (!isTracked(id)) return;
    upsert(id, { name, lastChannelId: channelId, lastChannelName: channelName });
}

/**
 * Adding by hand always sticks. The entry is marked manual, so the limit never drops it.
 *
 * Adding somebody who is already in the list counts as the same deliberate act, so it moves them to
 * the top rather than leaving them wherever they had sunk to. The row then reads "added just now"
 * instead of claiming you just saw them, because adding is what actually happened. The next time you
 * do share a channel, the sweep marks them as seen again.
 */
export function addUser(id: string, name: string, patch: Partial<TrackedUser> = {}) {
    upsert(id, { name, manual: true, lastSeen: Date.now(), sharedVoice: false, ...patch });
}

/**
 * Adds a whole channel's worth of people in one go, without letting one click push the list past
 * its limit for good.
 *
 * Adding by hand marks somebody manual, and the limit never drops a manual entry. That is right for
 * one person you picked out and wrong for ninety picked up at once from a busy channel, because nothing
 * would ever remove them, the saved list would sit permanently over its ceiling, and every voice
 * event would rebuild an array that had no business being that long. Only as many as still fit go
 * in, and the caller says out loud how many did not.
 *
 * @returns how many were added or marked, so the rest can be accounted for.
 */
export function addUsers(entries: { id: string; name: string; }[]): number {
    if (!entries.length) return 0;

    const now = Date.now();
    /** protected entries are the ones the limit cannot touch, so they are what the room is for */
    let room = Math.max(0, getHistoryLimit() - users.filter(isProtected).length);

    const replaced = new Map<string, TrackedUser>();
    /**
     * Keyed rather than a list, exactly as in touchUsers, because the same id can arrive twice in
     * one call. Nothing created here is in the list yet, so the lookup below cannot find it any
     * other way, and a second copy used to become a second entry: one person counted twice against
     * the limit, and two rows sharing an id in the window.
     */
    const added = new Map<string, TrackedUser>();

    for (const entry of entries) {
        const existing = replaced.get(entry.id) ?? added.get(entry.id) ?? usersById.get(entry.id);

        if (existing) {
            // already beyond the limit's reach, so this costs nothing and changes nothing
            if (isProtected(existing)) continue;
            if (room <= 0) continue;

            replaced.set(entry.id, {
                ...existing,
                manual: true,
                name: bestName(entry.name, existing.name)
            });
            room--;
            continue;
        }

        if (room <= 0) continue;

        const created = normalize({
            id: entry.id,
            name: entry.name,
            manual: true,
            lastSeen: now,
            sharedVoice: false
        });
        if (!created) continue;

        added.set(created.id, created);
        room--;
    }

    if (!replaced.size && !added.size) return 0;

    commit([...users.map(user => replaced.get(user.id) ?? user), ...added.values()]);
    return replaced.size + added.size;
}

export function removeUser(id: string) {
    commit(users.filter(user => user.id !== id));
}

export function togglePin(id: string) {
    const user = getTrackedUser(id);
    if (!user) return;
    commit(users.map(entry => (entry.id === id ? { ...entry, pinned: !entry.pinned } : entry)));
}

export function toggleNotify(id: string) {
    const user = getTrackedUser(id);
    if (!user) return;
    commit(users.map(entry => (entry.id === id ? { ...entry, notify: !entry.notify } : entry)));
}

/** Auto-join is exclusive. Enabling it for someone disables it for everyone else. */
export function toggleAutoJoin(id: string) {
    const user = getTrackedUser(id);
    if (!user) return;

    const next = !user.autoJoin;
    commit(users.map(entry => ({
        ...entry,
        autoJoin: entry.id === id ? next : false,
        autoPull: entry.id === id && next ? false : entry.autoPull
    })));
}

/**
 * Moves the dragged pin next to the one it was released on. Every pin gets a fresh position
 * afterwards, so the order is stable no matter how many of them had never been dragged before.
 *
 * Deliberately computed against the *stored* order, not the one on screen. The window floats people
 * sitting with you to the top of the section, and rewriting positions from that view baked the
 * float into the saved order. A single drag reshuffled every other pin, so whoever happened to share
 * your channel at that moment ended up permanently first. A drop means "put this one next to that
 * one", and that relationship is the same in both views.
 *
 * Dragging downwards lands after the target and upwards before it. That is the plain result of
 * removing before inserting, and the only reason the last position is reachable at all. The row being
 * dropped on draws its hint on the matching edge, so the two agree.
 */
export function reorderPinned(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;

    const pinned = pinnedInOrder();
    const from = pinned.findIndex(user => user.id === draggedId);
    const to = pinned.findIndex(user => user.id === targetId);
    if (from < 0 || to < 0) return;

    const [dragged] = pinned.splice(from, 1);
    pinned.splice(to, 0, dragged);

    const positions = new Map(pinned.map((user, index) => [user.id, index]));
    commit(users.map(user => (positions.has(user.id)
        ? { ...user, order: positions.get(user.id)! }
        : user)));
}

/**
 * Where a pin sits in the stored order, which is what the drag hint needs to know which way the drop
 * goes. -1 for anyone who is not pinned.
 */
export function pinnedPositionOf(id: string): number {
    return pinnedOrder.get(id) ?? -1;
}

/** Makes this person the one and only auto-join target, whatever the previous state was. */
export function setAutoJoinTarget(id: string) {
    if (!isTracked(id)) return;
    commit(users.map(user => ({
        ...user,
        autoJoin: user.id === id,
        autoPull: user.id === id ? false : user.autoPull
    })));
}

/** Only one person can be magnetised, exactly like auto-join, and never the same one as both. */
export function toggleAutoPull(id: string) {
    const user = getTrackedUser(id);
    if (!user) return;

    const next = !user.autoPull;
    commit(users.map(entry => (entry.id === id
        ? { ...entry, autoPull: next, autoJoin: next ? false : entry.autoJoin }
        : { ...entry, autoPull: false })));
}

export function setAutoPullTarget(id: string) {
    if (!isTracked(id)) return;
    commit(users.map(user => ({
        ...user,
        autoPull: user.id === id,
        autoJoin: user.id === id ? false : user.autoJoin
    })));
}

export function getAutoPullTarget(): TrackedUser | undefined {
    return users.find(user => user.autoPull);
}

export function clearAutoPull() {
    if (!users.some(user => user.autoPull)) return;
    commit(users.map(user => ({ ...user, autoPull: false })));
}

export function clearAutoJoin() {
    if (!users.some(user => user.autoJoin)) return;
    commit(users.map(user => ({ ...user, autoJoin: false })));
}

/** Removes everything that is not pinned. */
export function clearHistory() {
    commit(users.filter(user => user.pinned));
}

/**
 * Re-applies the limit, for example after the setting changed. A no-op when nothing has to go. This
 * runs on every open of the radar, and committing unconditionally meant a redraw and an IndexedDB
 * write each time even though the list was already within the limit.
 */
export function refreshLimit() {
    if (trim(users).length === users.length) return;
    commit([...users]);
}
