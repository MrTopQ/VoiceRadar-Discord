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

import { buildJournal, type JournalRow } from "./journalStays";
import type { Sighting } from "./sightings";
import { dayStart } from "./time";
import type { WatchSpan } from "./watchLog";

/** Your own move is written for everybody in the channel in one pass, so it lands within a moment. */
const SAME_MOVE_MS = 1000;

export interface ActivityEntry {
    /** One person, or everybody your own move was written down for. */
    userIds: string[];
    row: JournalRow;
}

export type ActivityFilter = "pinned" | "recent";

const rowsByJournal = new WeakMap<Sighting[], JournalRow[]>();

/** One row per line, since the journal draws a move in both channels and keeps the time together on the leaving half. */
function rowsOf(lines: Sighting[], watched?: WatchSpan[]): JournalRow[] {
    const known = rowsByJournal.get(lines);
    if (known) return known;

    const byLine = new Map<Sighting, JournalRow>();

    for (const day of buildJournal([...lines].reverse(), watched)) {
        for (const row of day.parts.flatMap(part => part.rows)) {
            const twin = byLine.get(row.line);
            byLine.set(row.line, twin ? { ...(row.leaving ? twin : row), together: twin.together ?? row.together } : row);
        }
    }

    const rows = [...byLine.values()];
    rowsByJournal.set(lines, rows);
    return rows;
}

const isMyMove = ({ kind }: Sighting) => kind === "you-joined" || kind === "you-left";

function sameMove(a: Sighting, b: Sighting): boolean {
    return isMyMove(a) && a.kind === b.kind && a.channelId === b.channelId && Math.abs(a.at - b.at) < SAME_MOVE_MS;
}

/** Everybody's lines in one list, newest first. */
export function buildActivity(log: Iterable<[string, Sighting[]]>, watched?: WatchSpan[]): ActivityEntry[] {
    const rows = [...log]
        .flatMap(([userId, lines]) => rowsOf(lines, watched).map(row => ({ userId, row })))
        .sort((a, b) => b.row.line.at - a.row.line.at);

    const entries: ActivityEntry[] = [];

    for (const { userId, row } of rows) {
        const last = entries[entries.length - 1];
        if (last && sameMove(last.row.line, row.line)) last.userIds.push(userId);
        else entries.push({ userIds: [userId], row });
    }

    return entries;
}

/** Your own move stays for the people that fit, so its faces match the choice. */
export function filterActivity(entries: ActivityEntry[], keep: (userId: string) => boolean): ActivityEntry[] {
    return entries.flatMap(entry => {
        const userIds = entry.userIds.filter(keep);
        return userIds.length ? [{ ...entry, userIds }] : [];
    });
}

export function byDay(entries: ActivityEntry[]): { day: number; entries: ActivityEntry[]; }[] {
    const days: { day: number; entries: ActivityEntry[]; }[] = [];

    for (const entry of entries) {
        const day = dayStart(entry.row.line.at);
        const last = days[days.length - 1];
        if (last?.day === day) last.entries.push(entry);
        else days.push({ day, entries: [entry] });
    }

    return days;
}
