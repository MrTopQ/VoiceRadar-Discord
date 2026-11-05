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

/** The recent tab lists everybody, pinned or not, by when they were last seen. */
export function recentTabUsers<T extends { lastSeen: number; }>(pinned: T[], recent: T[]): T[] {
    return [...pinned, ...recent].sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Pinned rows keep the order you gave them, since the column beside the list shows who is with you. */
export function inTabOrder<T extends { id: string; }>(users: T[], tab: "pinned" | "recent", isWithMe: (id: string) => boolean): T[] {
    if (tab === "pinned") return users;

    const withMe = users.filter(user => isWithMe(user.id));
    return withMe.length ? [...withMe, ...users.filter(user => !isWithMe(user.id))] : users;
}
