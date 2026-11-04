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

const GAP_PX = 8;
const EDGE_PX = 8;
/** Discord's title bar sits above everything. */
const TOP_RESERVED_PX = 40;
const ARROW_INSET_PX = 12;

export interface HintPlacement {
    left: number;
    top: number;
    below: boolean;
    arrow: number;
}

export function placeHint(
    anchor: { left: number; top: number; width: number; height: number; },
    size: { width: number; height: number; },
    viewportWidth: number,
    viewportHeight = Infinity
): HintPlacement {
    const roomAbove = anchor.top - GAP_PX - TOP_RESERVED_PX;
    const roomBelow = viewportHeight - (anchor.top + anchor.height + GAP_PX) - EDGE_PX;
    // Above when it fits, otherwise on whichever side has more room.
    const below = size.height > roomAbove && roomBelow > roomAbove;
    const centre = anchor.left + anchor.width / 2;

    const left = Math.max(EDGE_PX, Math.min(centre - size.width / 2, viewportWidth - size.width - EDGE_PX));
    const arrow = Math.min(Math.max(centre - left, ARROW_INSET_PX), Math.max(ARROW_INSET_PX, size.width - ARROW_INSET_PX));
    const top = below ? anchor.top + anchor.height + GAP_PX : anchor.top - GAP_PX - size.height;

    return {
        left,
        // A hint taller than either side is pushed back inside the window.
        top: Math.max(TOP_RESERVED_PX, Math.min(top, viewportHeight - size.height - EDGE_PX)),
        below,
        arrow
    };
}
