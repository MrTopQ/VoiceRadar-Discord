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

/** "just now", "5 minutes ago", and so on up to weeks, which is as far as this list ever reaches. */
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
