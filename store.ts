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
    name: string;
    pinned: boolean;
    notify: boolean;
    autoJoin: boolean;
    autoPull: boolean;
    /** Last shared voice channel, or when they were added. */
    lastSeen: number;
    /** Whether lastSeen comes from sharing a voice channel. */
    sharedVoice: boolean;
    lastChannelId: string | null;
    lastChannelName: string | null;
    manual: boolean;
    order: number | null;
    stickyMute: boolean;
    stickyMuteGuildId: string | null;
}

export interface VisibleUsers {
    pinned: TrackedUser[];
    recent: TrackedUser[];
    historyCapacity: number;
}

let users: TrackedUser[] = [];
let usersById = new Map<string, TrackedUser>();
let pinnedOrder = new Map<string, number>();
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/** Writes wait for the saved list to load, so an empty list never overwrites it. */
let loaded = false;

let storeGeneration = 0;

const listeners = new Set<() => void>();

let loadFailed = false;

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
    if (!loaded) return;

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

    if (!loaded) return;

    await DataStore.set(DATASTORE_KEY, users).catch(error =>
        console.error("[VoiceRadar-Discord] failed to flush users:", error));
}

function isPlaceholderName(name: string | undefined): boolean {
    return !name || name === UNKNOWN_NAME || UNKNOWN_USER_LABELS.includes(name);
}

function bestName(incoming: string | undefined, existing?: string): string {
    if (!isPlaceholderName(incoming)) return incoming!;
    if (!isPlaceholderName(existing)) return existing!;
    return UNKNOWN_NAME;
}

function normalize(raw: Partial<TrackedUser>): TrackedUser | null {
    if (!raw?.id) return null;
    return {
        id: String(raw.id),
        name: bestName(raw.name),
        pinned: !!raw.pinned,
        notify: !!raw.notify,
        autoJoin: !!raw.autoJoin,
        autoPull: !!raw.autoPull,
        lastSeen: Number(raw.lastSeen) || Date.now(),
        sharedVoice: raw.sharedVoice ?? !raw.manual,
        lastChannelId: raw.lastChannelId ?? null,
        lastChannelName: raw.lastChannelName ?? null,
        manual: !!raw.manual,
        order: Number.isFinite(raw.order as number) ? Number(raw.order) : null,
        stickyMute: !!raw.stickyMute,
        stickyMuteGuildId: raw.stickyMuteGuildId ?? null
    };
}

function comparePinned(a: TrackedUser, b: TrackedUser): number {
    if (a.order != null && b.order != null) return a.order - b.order;
    if (a.order != null) return -1;
    if (b.order != null) return 1;
    return b.lastSeen - a.lastSeen;
}

function isProtected(user: TrackedUser): boolean {
    return user.pinned || user.notify || user.autoJoin || user.autoPull || user.manual || user.stickyMute;
}

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
        if (generation !== storeGeneration) return;

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
        // Not marked as loaded, so nothing overwrites the saved list.
        loadFailed = true;
    }
}

function resetStore() {
    storeGeneration++;
    loaded = false;

    loadFailed = false;

    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    users = [];
    usersById.clear();
    pinnedOrder.clear();

}

/** Save and reset as one step, because a quick off and on runs them at the same time. */
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

const LAST_SEEN_THROTTLE_MS = 30_000;

export function touchUsers(entries: TouchEntry[]) {
    if (!entries.length) return;

    const now = Date.now();
    const replaced = new Map<string, TrackedUser>();
    const added = new Map<string, TrackedUser>();

    for (const entry of entries) {
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

        (added.has(entry.id) ? added : replaced).set(entry.id, merged);
    }

    if (!replaced.size && !added.size) return;

    commit([
        ...users.map(user => replaced.get(user.id) ?? user),
        ...added.values()
    ]);
}

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

export function updateLastChannel(id: string, name: string, channelId: string | null, channelName: string | null) {
    if (!isTracked(id)) return;
    upsert(id, { name, lastChannelId: channelId, lastChannelName: channelName });
}

export function addUser(id: string, name: string, patch: Partial<TrackedUser> = {}) {
    upsert(id, { name, manual: true, lastSeen: Date.now(), sharedVoice: false, ...patch });
}

export function addUsers(entries: { id: string; name: string; }[]): number {
    if (!entries.length) return 0;

    const now = Date.now();
    let room = Math.max(0, getHistoryLimit() - users.filter(isProtected).length);

    const replaced = new Map<string, TrackedUser>();
    const added = new Map<string, TrackedUser>();

    for (const entry of entries) {
        const existing = replaced.get(entry.id) ?? added.get(entry.id) ?? usersById.get(entry.id);

        if (existing) {
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

export function setStickyMute(id: string, on: boolean, guildId: string | null = null) {
    const user = getTrackedUser(id);
    if (!user) return;
    if (user.stickyMute === on && (!on || user.stickyMuteGuildId === guildId)) return;

    commit(users.map(entry => (entry.id === id
        ? { ...entry, stickyMute: on, stickyMuteGuildId: on ? guildId : null }
        : entry)));
}

export function rememberStickyMuteGuild(id: string, guildId: string) {
    const user = getTrackedUser(id);
    if (!user?.stickyMute || user.stickyMuteGuildId === guildId) return;

    commit(users.map(entry => (entry.id === id ? { ...entry, stickyMuteGuildId: guildId } : entry)));
}

export function getStickyMuted(): TrackedUser[] {
    return users.filter(user => user.stickyMute);
}

export function toggleNotify(id: string) {
    const user = getTrackedUser(id);
    if (!user) return;
    commit(users.map(entry => (entry.id === id ? { ...entry, notify: !entry.notify } : entry)));
}

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

export function pinnedPositionOf(id: string): number {
    return pinnedOrder.get(id) ?? -1;
}

export function setAutoJoinTarget(id: string) {
    if (!isTracked(id)) return;
    commit(users.map(user => ({
        ...user,
        autoJoin: user.id === id,
        autoPull: user.id === id ? false : user.autoPull
    })));
}

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

export function clearHistory() {
    commit(users.filter(user => user.pinned));
}

export function refreshLimit() {
    if (trim(users).length === users.length) return;
    commit([...users]);
}
