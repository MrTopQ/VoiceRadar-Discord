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

import { settings } from "./settings";

/** Where a window sits, as its offset from the middle of the screen, and its size once dragged. */
export interface WindowPlace {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

export interface Size {
    width: number;
    height: number;
}

export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const EDGES: Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export const MIN_WINDOW_WIDTH = 480;
export const MIN_WINDOW_HEIGHT = 320;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function isPlace(value: any): value is WindowPlace {
    return value != null && isNumber(value.x) && isNumber(value.y)
        && (value.width == null || isNumber(value.width))
        && (value.height == null || isNumber(value.height));
}

/** Keeps the whole window inside the free area, so its title can always be grabbed again. */
export function fitPlace(place: WindowPlace, size: Size, area: Size): WindowPlace {
    const fitted: WindowPlace = { x: 0, y: 0 };

    if (place.width != null) fitted.width = clamp(place.width, Math.min(MIN_WINDOW_WIDTH, area.width), area.width);
    if (place.height != null) fitted.height = clamp(place.height, Math.min(MIN_WINDOW_HEIGHT, area.height), area.height);

    const roomX = Math.max(0, (area.width - Math.min(fitted.width ?? size.width, area.width)) / 2);
    const roomY = Math.max(0, (area.height - Math.min(fitted.height ?? size.height, area.height)) / 2);

    fitted.x = Math.round(clamp(place.x, -roomX, roomX));
    fitted.y = Math.round(clamp(place.y, -roomY, roomY));
    return fitted;
}

export function movePlace(start: WindowPlace, dx: number, dy: number): WindowPlace {
    return { ...start, x: start.x + dx, y: start.y + dy };
}

/** Moves only the grabbed edges, so the opposite side of the window stays where it was. */
export function resizePlace(start: WindowPlace, size: Size, edge: Edge, dx: number, dy: number, area: Size): WindowPlace {
    const minWidth = Math.min(MIN_WINDOW_WIDTH, area.width);
    const minHeight = Math.min(MIN_WINDOW_HEIGHT, area.height);

    let left = start.x - size.width / 2;
    let right = start.x + size.width / 2;
    let top = start.y - size.height / 2;
    let bottom = start.y + size.height / 2;

    if (edge.includes("e")) right = clamp(right + dx, left + minWidth, area.width / 2);
    if (edge.includes("w")) left = clamp(left + dx, -area.width / 2, right - minWidth);
    if (edge.includes("s")) bottom = clamp(bottom + dy, top + minHeight, area.height / 2);
    if (edge.includes("n")) top = clamp(top + dy, -area.height / 2, bottom - minHeight);

    return {
        x: Math.round((left + right) / 2),
        y: Math.round((top + bottom) / 2),
        width: Math.round(right - left),
        height: Math.round(bottom - top)
    };
}

export function savedPlace(name: string): WindowPlace | null {
    const place = (settings.store.windowPlaces as Record<string, unknown> | undefined)?.[name];
    return isPlace(place) ? place : null;
}

export function savePlace(name: string, place: WindowPlace | null) {
    const { [name]: _old, ...others } = (settings.store.windowPlaces ?? {}) as Record<string, WindowPlace>;
    settings.store.windowPlaces = place ? { ...others, [name]: place } : others;
}
