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

import { Toasts } from "@webpack/common";

import { reportBroken } from "./apiHealth";
import { T } from "./i18n";

/** A toast lives about three seconds. Inside that window ours is still on screen. */
const REPLACE_WINDOW_MS = 3500;

let ourToastShownAt = 0;

/**
 * Ours replace each other instead of queueing, so a row of clicks does not keep popping for a
 * minute. Only inside the window above, where the visible toast is ours, so nobody else's is eaten.
 *
 * Showing can fail, because Vencord finds these functions by matching mangled code. A toast only
 * ever describes an action, so its failure must not take the action down with it.
 */
export function toast(message: string, type: string = Toasts.Type.MESSAGE) {
    if (Date.now() - ourToastShownAt < REPLACE_WINDOW_MS) {
        try {
            Toasts.pop();
        } catch {
            /* nothing to dismiss */
        }
    }

    ourToastShownAt = Date.now();

    try {
        Toasts.show(Toasts.create(message, type));
    } catch (error) {
        // the console is the only place left for it
        console.warn("[VoiceRadar-Discord] could not show a toast:", message, error);

        /*
         * No startup probe stands in for this. Toasts are found by matching mangled code and handed
         * over as a lazy proxy, and every test short of showing one comes back true whether or not
         * the search ever found anything, so the failure itself is the only honest report.
         */
        reportBroken(T.apiToasts);
    }
}

export const ToastType = Toasts.Type;
