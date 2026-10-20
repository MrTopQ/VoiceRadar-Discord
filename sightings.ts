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

import { isTracked } from "./store";

export type SightingKind = "joined" | "moved" | "left";

export interface Sighting {
    at: number;
    kind: SightingKind;
    channelId: string | null;
    channelLabel: string | null;
    withYou: boolean;
}

const DATASTORE_KEY = "VoiceRadar-Discord_Sightings";

export const MAX_SIGHTINGS_PER_PERSON = 60;

const SAVE_DEBOUNCE_MS = 2000;

let log = new Map<string, Sighting[]>();
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/** Nothing is saved before the saved log has been read. */
let loaded = false;
let generation = 0;

function isSighting(value: any): value is Sighting {
    return value != null
        && Number.isFinite(value.at)
        && (value.kind === "joined" || value.kind === "moved" || value.kind === "left");
}

function prunedForSaving(): Record<string, Sighting[]> {
    const out: Record<string, Sighting[]> = {};

    for (const [userId, lines] of log) {
        if (!isTracked(userId) || !lines.length) continue;
        out[userId] = lines.slice(-MAX_SIGHTINGS_PER_PERSON);
    }

    return out;
}

function scheduleSave() {
    if (!loaded) return;
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        void DataStore.set(DATASTORE_KEY, prunedForSaving()).catch(error =>
            console.error("[VoiceRadar-Discord] could not save the sightings log:", error));
    }, SAVE_DEBOUNCE_MS);
}

export async function loadSightings(): Promise<void> {
    const mine = ++generation;
    loaded = false;

    try {
        const stored = await DataStore.get<Record<string, unknown[]>>(DATASTORE_KEY);
        if (mine !== generation) return;

        const fresh = new Map<string, Sighting[]>();
        for (const [userId, lines] of Object.entries(stored ?? {})) {
            if (!Array.isArray(lines)) continue;

            const valid = lines.filter(isSighting).slice(-MAX_SIGHTINGS_PER_PERSON);
            if (valid.length) fresh.set(userId, valid);
        }

        for (const [userId, lines] of log) {
            fresh.set(userId, [...(fresh.get(userId) ?? []), ...lines].slice(-MAX_SIGHTINGS_PER_PERSON));
        }

        log = fresh;
        loaded = true;
    } catch (error) {
        if (mine !== generation) return;
        console.error("[VoiceRadar-Discord] could not read the sightings log, it will not be written this session:", error);
    }
}

export function recordSighting(userId: string, sighting: Omit<Sighting, "at"> & { at?: number; }) {
    const line: Sighting = { ...sighting, at: sighting.at ?? Date.now() };
    const lines = log.get(userId) ?? [];

    log.set(userId, [...lines, line].slice(-MAX_SIGHTINGS_PER_PERSON));
    scheduleSave();
}

export function getSightings(userId: string): Sighting[] {
    return [...(log.get(userId) ?? [])].reverse();
}

/** Only when leaving was the last thing seen, otherwise its time is unknown. */
export function getLastLeave(userId: string): Sighting | null {
    const lines = log.get(userId);
    const last = lines?.[lines.length - 1];
    return last?.kind === "left" ? last : null;
}

export async function shutdownSightings(): Promise<void> {
    const wasLoaded = loaded;
    generation++;

    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    if (wasLoaded) {
        await DataStore.set(DATASTORE_KEY, prunedForSaving()).catch(error =>
            console.error("[VoiceRadar-Discord] could not save the sightings log:", error));
    }

    log = new Map();
    loaded = false;
}
