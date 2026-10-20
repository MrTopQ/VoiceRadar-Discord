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

import { FluxDispatcher } from "@webpack/common";

/** Tells your own voice moves apart from moves made for you. */

const CHOICE_WINDOW_MS = 10_000;

let wantedChannelId: string | null = null;
let wantedAt = 0;

let everHeardAChoice = false;

function forgetMyChoice() {
    wantedChannelId = null;
    wantedAt = 0;
}

function handleChannelSelect(event: { channelId?: string | null; }) {
    wantedChannelId = event?.channelId ?? null;
    wantedAt = Date.now();
    everHeardAChoice = true;
}

export function startWatchingMyChoices() {
    stopWatchingMyChoices();
    FluxDispatcher.subscribe("VOICE_CHANNEL_SELECT", handleChannelSelect);
}

export function stopWatchingMyChoices() {
    FluxDispatcher.unsubscribe("VOICE_CHANNEL_SELECT", handleChannelSelect);
    forgetMyChoice();
    everHeardAChoice = false;
}

export function canTellMyMovesApart(): boolean {
    return everHeardAChoice;
}

export function wasMyOwnDoing(channelId: string | null): boolean {
    if (Date.now() - wantedAt > CHOICE_WINDOW_MS) return false;
    if (wantedChannelId !== channelId) return false;

    forgetMyChoice();
    return true;
}

export function isMyMoveInFlight(): boolean {
    return wantedChannelId != null && Date.now() - wantedAt <= CHOICE_WINDOW_MS;
}
