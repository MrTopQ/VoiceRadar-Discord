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

/** A channel's own name when the other side of a move sits in the same server, so such a move reads short. */
export function placeName(label: string, other: string | null | undefined): string {
    const cut = label.lastIndexOf(" · ");
    const otherCut = other?.lastIndexOf(" · ") ?? -1;
    const sameServer = cut > 0 && otherCut > 0 && label.slice(cut) === other!.slice(otherCut);

    return sameServer ? label.slice(0, cut) : label;
}
