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

export interface RadarState {
    /** The option to open straight in the separate window. */
    direct: boolean;
    /** The option to hide that window instead of closing it. */
    hide: boolean;
    inDiscord: boolean;
    ownWindow: boolean;
    /** Up on screen, so not minimised or hidden. */
    ownWindowShown: boolean;
}

export type RadarPress = "open-in-discord" | "close-in-discord" | "show-own-window" | "close-own-window" | "hide-own-window";

/** What the hotkey or the panel button should do right now. */
export function radarPress({ direct, hide, inDiscord, ownWindow, ownWindowShown }: RadarState): RadarPress {
    if (direct) {
        if (inDiscord) return "close-in-discord";
        if (!ownWindowShown) return "show-own-window";
        return hide ? "hide-own-window" : "close-own-window";
    }

    if (ownWindow) return "show-own-window";
    return inDiscord ? "close-in-discord" : "open-in-discord";
}
