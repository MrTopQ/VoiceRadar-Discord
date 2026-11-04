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

import { getStoreState, isTracked } from "./store";
import { watchedThrough, type WatchSpan } from "./watchLog";

/**
 * The you- kinds are your own moves into and out of the person's channel. Seen and gone are what the
 * plugin found on looking without catching the move itself, such as right after Discord started.
 */
export type SightingKind =
    | "joined" | "moved" | "left" | "you-joined" | "you-left"
    | "seen" | "gone" | "stream-on" | "stream-off" | "video-on" | "video-off";

const KINDS: SightingKind[] = [
    "joined", "moved", "left", "you-joined", "you-left", "seen", "gone", "stream-on", "stream-off", "video-on", "video-off"
];

export interface Sighting {
    at: number;
    kind: SightingKind;
    channelId: string | null;
    channelLabel: string | null;
    /** For a leave it means they left your channel. */
    withYou: boolean;
    /** They moved out of your channel. */
    fromYou?: boolean;
    /** Where a move came from, missing on lines older than this field. */
    fromLabel?: string | null;
    fromId?: string | null;
    /** The first few of the others who sat in that channel at the moment, empty when nobody did. Missing on lines older than this field. */
    with?: string[];
    /** How many others there were, only when more than the ones named. */
    withCount?: number;
    /** It happened at some moment after this and before at, which is all that is known. */
    after?: number;
    /** Found right after the plugin started watching again, after Discord was closed or offline. */
    onReturn?: boolean;
}

/** Each person's journal is a key of its own, so a save writes only the people who moved. */
const KEY_PREFIX = "VoiceRadar-Discord_Sightings:";
/** Where every journal sat in one value, read once and moved to the keys above. */
const LEGACY_KEY = "VoiceRadar-Discord_Sightings";

const keyFor = (userId: string) => KEY_PREFIX + userId;

export const MAX_SIGHTINGS_PER_PERSON = 200;

const SAVE_DEBOUNCE_MS = 2000;

let log = new Map<string, Sighting[]>();
let dirty = new Set<string>();
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/** Nothing is saved before the saved log has been read. */
let loaded = false;
let generation = 0;

function isSighting(value: any): value is Sighting {
    return value != null
        && Number.isFinite(value.at)
        && KINDS.includes(value.kind);
}

function validLines(value: unknown): Sighting[] {
    return Array.isArray(value) ? value.filter(isSighting).slice(-MAX_SIGHTINGS_PER_PERSON) : [];
}

/** Writes the journals that changed and drops those of people taken off the list. */
async function persist(): Promise<void> {
    const changed = dirty;
    dirty = new Set();

    // Before the list is read every person looks untracked, so nobody is dropped then.
    if (getStoreState() === "ready") {
        for (const userId of [...log.keys()]) {
            if (isTracked(userId)) continue;
            log.delete(userId);
            changed.add(userId);
        }
    }

    const writes: [string, Sighting[]][] = [];
    const removals: string[] = [];
    for (const userId of changed) {
        const lines = log.get(userId);
        if (lines?.length) writes.push([keyFor(userId), lines]);
        else removals.push(keyFor(userId));
    }

    await Promise.all([
        writes.length ? DataStore.setMany(writes) : null,
        removals.length ? DataStore.delMany(removals) : null
    ]);
}

function scheduleSave() {
    if (!loaded) return;
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        void persist().catch(error =>
            console.error("[VoiceRadar-Discord] could not save the sightings log:", error));
    }, SAVE_DEBOUNCE_MS);
}

async function readSaved(): Promise<{ saved: Map<string, Sighting[]>; legacy: boolean; }> {
    const keys = (await DataStore.keys()).filter((key): key is string => typeof key === "string" && key.startsWith(KEY_PREFIX));
    const [values, legacy] = await Promise.all([
        DataStore.getMany<unknown>(keys),
        DataStore.get<Record<string, unknown>>(LEGACY_KEY)
    ]);

    const saved = new Map<string, Sighting[]>();
    const keep = (userId: string, value: unknown) => {
        const lines = validLines(value);
        if (lines.length) saved.set(userId, lines);
    };

    for (const [userId, lines] of Object.entries(legacy ?? {})) keep(userId, lines);
    keys.forEach((key, index) => keep(key.slice(KEY_PREFIX.length), values[index]));

    return { saved, legacy: legacy !== undefined };
}

export async function loadSightings(): Promise<void> {
    const mine = ++generation;
    loaded = false;

    try {
        const { saved, legacy } = await readSaved();
        if (mine !== generation) return;

        if (legacy) {
            await DataStore.setMany([...saved].map(([userId, lines]) => [keyFor(userId), lines]));
            await DataStore.del(LEGACY_KEY);
            if (mine !== generation) return;
        }

        for (const [userId, lines] of log) {
            saved.set(userId, [...(saved.get(userId) ?? []), ...lines].slice(-MAX_SIGHTINGS_PER_PERSON));
        }

        log = saved;
        loaded = true;
        if (dirty.size) scheduleSave();
    } catch (error) {
        if (mine !== generation) return;
        console.error("[VoiceRadar-Discord] could not read the sightings log, it will not be written this session:", error);
    }
}

export function recordSighting(userId: string, sighting: Omit<Sighting, "at"> & { at?: number; }) {
    const line: Sighting = { ...sighting, at: sighting.at ?? Date.now() };
    const lines = log.get(userId) ?? [];

    log.set(userId, [...lines, line].slice(-MAX_SIGHTINGS_PER_PERSON));
    dirty.add(userId);
    scheduleSave();
}

export function getSightings(userId: string): Sighting[] {
    return [...(log.get(userId) ?? [])].reverse();
}

/** The newest line, which also says where the journal last put the person. */
export function getLatestSighting(userId: string): Sighting | null {
    const lines = log.get(userId);
    return lines?.[lines.length - 1] ?? null;
}

/** The channel a line leaves the person in, null once they are out of voice. */
export function placeAfter(line: Sighting): string | null {
    return line.kind === "left" || line.kind === "gone" ? null : line.channelId;
}

export function isTheirMove(line: Sighting): boolean {
    return line.kind === "joined" || line.kind === "moved";
}

export function startsTogether(line: Sighting): boolean {
    return line.kind === "you-joined" || ((isTheirMove(line) || line.kind === "seen") && line.withYou);
}

export function endsTogether(line: Sighting): boolean {
    return line.kind === "you-left" || (line.kind === "left" && line.withYou) || (line.kind === "moved" && line.fromYou === true);
}

/** Where the plugin only found the person, so it cannot tell what happened just before. */
const isFound = (line: Sighting) => line.kind === "seen" || line.kind === "gone";

const isExact = (line: Sighting) => line.after == null;

/** The time together this line closes and the line it began on, for lines that are newest first, only when the plugin saw all of it. */
export function togetherSpan(lines: Sighting[], index: number, watched?: WatchSpan[]): { start: Sighting; ms: number; } | null {
    const end = lines[index];
    if (!end || !endsTogether(end) || !isExact(end)) return null;

    for (let older = index + 1; older < lines.length; older++) {
        const line = lines[older];
        if (startsTogether(line)) {
            const seen = isExact(line) && (!watched || watchedThrough(watched, line.at, end.at));
            return seen ? { start: line, ms: end.at - line.at } : null;
        }
        if (endsTogether(line) || isFound(line)) return null;
    }

    return null;
}

export function togetherBefore(lines: Sighting[], index: number, watched?: WatchSpan[]): number | null {
    return togetherSpan(lines, index, watched)?.ms ?? null;
}

const MEDIA_STARTS: Partial<Record<SightingKind, SightingKind>> = { "stream-off": "stream-on", "video-off": "video-on" };

/** How long the stream or camera this line turns off was on, when the plugin saw all of it. */
export function mediaDuration(lines: Sighting[], index: number, watched?: WatchSpan[]): number | null {
    const end = lines[index];
    const start = end && isExact(end) ? MEDIA_STARTS[end.kind] : undefined;
    if (!start) return null;

    for (let older = index + 1; older < lines.length; older++) {
        const line = lines[older];
        if (line.kind === start) return isExact(line) && (!watched || watchedThrough(watched, line.at, end.at)) ? end.at - line.at : null;
        if (line.kind === end.kind || line.kind === "left" || isFound(line)) return null;
    }

    return null;
}

export type RecentChange = { kind: "joined" | "left"; at: number; };

/** The newest time somebody came into your channel or left it inside the window, your own moves aside. */
export function getRecentChange(userId: string, withinMs: number, now = Date.now()): RecentChange | null {
    const lines = log.get(userId) ?? [];

    for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index];
        if (now - line.at > withinMs) return null;
        if (!isTheirMove(line) && line.kind !== "left") continue;

        if (startsTogether(line)) return { kind: "joined", at: line.at };
        if (endsTogether(line)) return { kind: "left", at: line.at };
    }

    return null;
}

/** Only when leaving was the last thing seen and its moment is known. */
export function getLastLeave(userId: string): Sighting | null {
    const last = getLatestSighting(userId);
    return last?.kind === "left" && isExact(last) ? last : null;
}

/** The last moment the plugin saw you two together, from the list's own record or a line where it ended. */
export function lastSeenTogether(userId: string, lastSeen: number): number {
    const lines = log.get(userId) ?? [];

    for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index];
        if (line.at <= lastSeen) break;
        if (endsTogether(line) && isExact(line)) return line.at;
    }

    return lastSeen;
}

export async function shutdownSightings(): Promise<void> {
    const wasLoaded = loaded;
    generation++;

    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    if (wasLoaded) {
        await persist().catch(error =>
            console.error("[VoiceRadar-Discord] could not save the sightings log:", error));
    }

    log = new Map();
    dirty = new Set();
    loaded = false;
}
