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

import { T } from "./i18n";

export function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return T.timeJustNow;

    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return T.timeMinutes(minutes);

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return T.timeHours(hours);

    const days = Math.floor(hours / 24);
    if (days < 7) return T.timeDays(days);

    return T.timeWeeks(Math.floor(days / 7));
}

const pad = (value: number) => String(value).padStart(2, "0");

export const formatClock = (at: number) => `${pad(new Date(at).getHours())}:${pad(new Date(at).getMinutes())}`;

export const formatClockSeconds = (at: number) => `${formatClock(at)}:${pad(new Date(at).getSeconds())}`;

/** Midnight of the day a moment falls on, with a whole number of days added. */
export function dayStart(at: number, plusDays = 0): number {
    const date = new Date(at);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + plusDays);
    return date.getTime();
}

function formatDate(at: number, now: number): string {
    const date = new Date(at);
    const day = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
    return date.getFullYear() === new Date(now).getFullYear() ? day : `${day}.${date.getFullYear()}`;
}

/** An exact moment with its day unless that is today, never rounded to "minutes ago". */
export function formatMoment(at: number, now = Date.now()): string {
    const time = formatClock(at);
    if (at >= dayStart(now)) return T.momentToday(time);
    if (at >= dayStart(now, -1)) return T.momentYesterday(time);
    return T.momentOn(formatDate(at, now), time);
}

/** A moment as its time alone when it falls on the given day, with its day in front otherwise or with no day given. */
export function formatOnDay(at: number, day: number | null, now = Date.now()): string {
    const time = formatClock(at);
    if (day != null && dayStart(at) === dayStart(day)) return time;
    if (at >= dayStart(now)) return T.dayToday(time);
    if (at >= dayStart(now, -1)) return T.dayYesterday(time);
    return `${formatDate(at, now)} ${time}`;
}

/** The time alone today, otherwise the date and time, for wording like "since 02.11 20:46". */
export function formatDayStamp(at: number, now = Date.now()): string {
    return dayStart(at) === dayStart(now) ? formatClock(at) : `${formatDate(at, now)} ${formatClock(at)}`;
}

/** The same moment some months later, on the last day of the month when that one is shorter. */
function addMonths(at: Date, count: number): Date {
    const result = new Date(at.getFullYear(), at.getMonth() + count, 1, at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds());
    result.setDate(Math.min(at.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
    return result;
}

/** Whole years, months and days from one moment to another, counted on the calendar. */
export function calendarAge(from: number, to = Date.now()): { years: number; months: number; days: number; } {
    const start = new Date(from);
    const end = new Date(to);
    if (end < start) return { years: 0, months: 0, days: 0 };

    let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
    if (addMonths(start, months) > end) months--;

    const cursor = addMonths(start, months);
    let days = 0;
    for (cursor.setDate(cursor.getDate() + 1); cursor <= end; cursor.setDate(cursor.getDate() + 1)) days++;

    return { years: Math.floor(months / 12), months: months % 12, days };
}
