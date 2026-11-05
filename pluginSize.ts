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

import { getPluginScale, settings } from "./settings";

const STYLE_ID = "vr-size";

const popouts = new Set<Document>();

const drawnIn = () => [document, ...popouts];

function writeSize(own: Document) {
    let style = own.getElementById(STYLE_ID);
    if (!style) {
        style = own.createElement("style");
        style.id = STYLE_ID;
        own.head.appendChild(style);
    }

    style.textContent = `:root { --vr-scale: ${getPluginScale()}; }`;
}

/** A style tag of its own, because Discord rewrites the style attribute of the root element. */
export function applyPluginSize() {
    drawnIn().forEach(writeSize);
}

export function setPluginSize(percent: number) {
    try {
        settings.store.sizePercent = percent;
    } finally {
        // The store takes the value before it saves, so a failed save still shows.
        applyPluginSize();
    }
}

export function clearPluginSize() {
    for (const own of drawnIn()) own.getElementById(STYLE_ID)?.remove();
}

/** The popped out radar is a document of its own, and the slider reaches it until it closes. */
export function sizePopout(own: Document): () => void {
    popouts.add(own);
    writeSize(own);
    return () => void popouts.delete(own);
}
