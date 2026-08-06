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

export interface Throttled {
    (): void;
    cancel(): void;
}

/**
 * Runs immediately, swallows further calls for `delay` ms, then replays the last one at the end of
 * the window. Voice events arrive in bursts, so one burst costs two redraws instead of dozens.
 */
export function throttle(callback: () => void, delay: number): Throttled {
    let lastRun = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
        lastRun = Date.now();
        timeout = null;
        callback();
    };

    const throttled = (() => {
        const elapsed = Date.now() - lastRun;

        if (elapsed >= delay) {
            run();
            return;
        }

        timeout ??= setTimeout(run, delay - elapsed);
    }) as Throttled;

    throttled.cancel = () => {
        if (!timeout) return;
        clearTimeout(timeout);
        timeout = null;
    };

    return throttled;
}
