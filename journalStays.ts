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

import { mediaDuration, type Sighting, togetherSpan } from "./sightings";
import { watchedThrough, type WatchSpan } from "./watchLog";

/** A stay is the time the person spent in one channel, from the line that put them there to the one that took them out. */
export type RowRole = "start" | "end" | "inside";

export interface JournalRow {
    line: Sighting;
    role: RowRole;
    /** A move shown in the stay it closes, as leaving for the other channel. */
    leaving: boolean;
    /** You sat in that channel too at this point. */
    shared: boolean;
    /** The plugin was not watching for part of the time since the row before. */
    gapBefore: boolean;
    /** The time together this row closes, with its start when that stretch began on finding them again. */
    together: { ms: number; since: number | null; } | null;
    /** How long the stream or camera this row turns off was on. */
    lasted: number | null;
}

/** How the block below leads to this one: a move, or a pause the plugin watched in full, in milliseconds. */
export type StayLink = "move" | number | null;

export interface StayPart {
    key: string;
    channelId: string | null;
    channelLabel: string | null;
    /** Newest first. */
    rows: JournalRow[];
    link: StayLink;
}

export interface JournalDay {
    start: number;
    /** Newest first. */
    parts: StayPart[];
    /** Journal lines in the day, a move counted once. */
    rows: number;
}

interface Stay {
    channelId: string | null;
    channelLabel: string | null;
    rows: JournalRow[];
    link: StayLink;
}

const dayOf = (at: number) => new Date(at).setHours(0, 0, 0, 0);

/** A line whose moment is a range sits in the day it surely came after. */
const placedAt = (line: Sighting) => line.after ?? line.at;

function closesStay(stay: Stay | null, line: Sighting): stay is Stay {
    if (!stay) return false;
    if (line.fromId) return stay.channelId === line.fromId;
    return line.fromLabel != null && stay.channelLabel === line.fromLabel;
}

/** Whether you shared the channel at the moment of this row. */
function sharedAt(line: Sighting, leaving: boolean): boolean {
    if (leaving) return line.fromYou === true;
    if (line.kind === "you-left") return true;
    if (line.kind === "gone") return false;
    return line.withYou;
}

/** Splits each stay where the day changes, so every part sits under its own day heading. */
function splitByDay(stays: Stay[]): JournalDay[] {
    const days: JournalDay[] = [];

    stays.forEach((stay, stayIndex) => {
        let part: StayPart | null = null;
        let partDay = 0;

        for (const row of stay.rows) {
            const day = dayOf(placedAt(row.line));
            if (!part || day !== partDay) {
                const last = days[days.length - 1];
                const sameDay = last?.start === day;

                // Only the first part of a stay follows the block before it, and only with one on the same day.
                part = {
                    key: `${stayIndex}-${row.line.at}-${row.role}`,
                    channelId: stay.channelId,
                    channelLabel: stay.channelLabel,
                    rows: [],
                    link: !part && sameDay ? stay.link : null
                };
                partDay = day;

                if (sameDay) last.parts.push(part);
                else days.push({ start: day, parts: [part], rows: 0 });
            }

            part.rows.push(row);
            // A move fills two rows but is one line of the journal.
            if (!row.leaving) days[days.length - 1].rows++;
        }
    });

    return days
        .map(day => ({ ...day, parts: day.parts.map(part => ({ ...part, rows: [...part.rows].reverse() })).reverse() }))
        .reverse();
}

/** Groups journal lines, newest first, into stays per channel and those into days. */
export function buildJournal(lines: Sighting[], watched?: WatchSpan[]): JournalDay[] {
    const stays: Stay[] = [];
    let stay: Stay | null = null;
    // Lines that found the person again in the stay they were already in.
    const foundAgain = new Set<Sighting>();

    const open = (line: Sighting, link: StayLink = null): Stay => {
        const next: Stay = { channelId: line.channelId, channelLabel: line.channelLabel, rows: [], link };
        stays.push(next);
        return next;
    };

    /** The time between a leave and the next join, only when both are exact and the plugin watched all of it. */
    const pauseBefore = (line: Sighting, older: Sighting | undefined): number | null => {
        if (older?.kind !== "left" || older.after != null || line.after != null) return null;
        return watched && watchedThrough(watched, older.at, line.at) ? line.at - older.at : null;
    };

    const add = (target: Stay, line: Sighting, index: number, role: RowRole, leaving = false) => {
        const previous = target.rows[target.rows.length - 1];
        // A move shows its time together once, in the stay it closes.
        const span = role === "start" && line.kind === "moved" ? null : togetherSpan(lines, index, watched);

        target.rows.push({
            line,
            role,
            leaving,
            shared: sharedAt(line, leaving),
            gapBefore: previous != null && watched != null && !watchedThrough(watched, previous.line.at, line.at),
            together: span ? { ms: span.ms, since: foundAgain.has(span.start) ? span.start.at : null } : null,
            lasted: mediaDuration(lines, index, watched)
        });
    };

    for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index];
        const here = stay != null && stay.channelId === line.channelId ? stay : null;

        switch (line.kind) {
            case "joined":
                stay = open(line, pauseBefore(line, lines[index + 1]));
                add(stay, line, index, "start");
                break;
            case "moved": {
                const closes = closesStay(stay, line);
                if (closes) add(stay!, line, index, "end", true);
                stay = open(line, closes ? "move" : null);
                add(stay, line, index, "start");
                break;
            }
            case "left":
            case "gone":
                add(here ?? open(line), line, index, "end");
                stay = null;
                break;
            default:
                if (here) {
                    if (line.kind === "seen") foundAgain.add(line);
                    add(here, line, index, "inside");
                } else {
                    stay = open(line);
                    add(stay, line, index, "start");
                }
        }
    }

    return splitByDay(stays);
}
