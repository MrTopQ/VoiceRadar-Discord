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

/** When the plugin was actually watching, so the journal never claims anything about the time the computer was off. */
export interface WatchSpan {
    start: number;
    end: number;
}

const DATASTORE_KEY = "VoiceRadar-Discord_Watched";
const MAX_SPANS = 500;
export const HEARTBEAT_MS = 60_000;
/** A heartbeat this late means the computer slept or Discord hung, so the watch did not really go on. */
const STALE_MS = HEARTBEAT_MS * 4;
const SAVE_DEBOUNCE_MS = 2000;

let spans: WatchSpan[] = [];
let watching = false;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let loaded = false;
let generation = 0;

function isSpan(value: any): value is WatchSpan {
    return value != null && Number.isFinite(value.start) && Number.isFinite(value.end) && value.end >= value.start;
}

function scheduleSave() {
    if (!loaded) return;
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        void DataStore.set(DATASTORE_KEY, spans).catch(error =>
            console.error("[VoiceRadar-Discord] could not save when the plugin was watching:", error));
    }, SAVE_DEBOUNCE_MS);
}

function openSpan(at: number) {
    spans = [...spans, { start: at, end: at }].slice(-MAX_SPANS);
}

/** Moves the end of the current watch to now, or starts a new one after a sleep. */
export function touchWatch(now = Date.now()) {
    if (!watching) return;

    const last = spans[spans.length - 1];
    if (!last || now - last.end > STALE_MS) openSpan(now);
    else if (now > last.end) spans = [...spans.slice(0, -1), { ...last, end: now }];

    scheduleSave();
}

export function startWatch(at = Date.now()) {
    if (watching) return;
    watching = true;
    openSpan(at);
    scheduleSave();

    heartbeat ??= setInterval(() => touchWatch(), HEARTBEAT_MS);
}

/** Discord replays everything it missed when a connection resumes, so the watch before the drop simply goes on. */
export function resumeWatch(now = Date.now()) {
    if (watching) return;

    const last = spans[spans.length - 1];
    if (!last) {
        startWatch(now);
        return;
    }

    watching = true;
    if (now > last.end) spans = [...spans.slice(0, -1), { ...last, end: now }];
    scheduleSave();

    heartbeat ??= setInterval(() => touchWatch(), HEARTBEAT_MS);
}

export function stopWatch(now = Date.now()) {
    if (!watching) return;

    // After a sleep the watch already ended at its last heartbeat.
    const last = spans[spans.length - 1];
    if (last && now - last.end <= STALE_MS) touchWatch(now);
    watching = false;
    scheduleSave();

    if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
    }
}

/** The watches with the current one reaching up to now, unless its heartbeat has gone stale. */
export function getWatchSpans(now = Date.now()): WatchSpan[] {
    const last = spans[spans.length - 1];
    if (!watching || !last || now - last.end > STALE_MS) return spans;
    return [...spans.slice(0, -1), { ...last, end: Math.max(last.end, now) }];
}

export function spanAt(watched: WatchSpan[], at: number): WatchSpan | null {
    return watched.find(span => at >= span.start && at <= span.end) ?? null;
}

/** Whether the plugin watched without a break from one moment to the other. */
export function watchedThrough(watched: WatchSpan[], from: number, to: number): boolean {
    const span = spanAt(watched, from);
    return span != null && to <= span.end;
}

export async function loadWatchLog(): Promise<void> {
    const mine = ++generation;
    loaded = false;

    try {
        const stored = await DataStore.get<unknown[]>(DATASTORE_KEY);
        if (mine !== generation) return;

        spans = [...(Array.isArray(stored) ? stored.filter(isSpan) : []), ...spans].slice(-MAX_SPANS);
        loaded = true;
    } catch (error) {
        if (mine !== generation) return;
        console.error("[VoiceRadar-Discord] could not read when the plugin was watching:", error);
    }
}

export async function shutdownWatchLog(): Promise<void> {
    stopWatch();
    const wasLoaded = loaded;
    generation++;

    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    if (wasLoaded) {
        await DataStore.set(DATASTORE_KEY, spans).catch(error =>
            console.error("[VoiceRadar-Discord] could not save when the plugin was watching:", error));
    }

    spans = [];
    loaded = false;
}
