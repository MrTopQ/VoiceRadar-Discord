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

/** A move inside one server names the server once, after the new channel. */
export function moveLabel(fromLabel: string | null | undefined, toLabel: string): string {
    if (!fromLabel) return toLabel;

    const fromCut = fromLabel.lastIndexOf(" · ");
    const toCut = toLabel.lastIndexOf(" · ");
    const sameServer = fromCut > 0 && toCut > 0 && fromLabel.slice(fromCut) === toLabel.slice(toCut);

    return `${sameServer ? fromLabel.slice(0, fromCut) : fromLabel} → ${toLabel}`;
}
