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

/**
 * Whether your own last voice move was your own doing.
 *
 * Discord never says who moved you. It says where you are, and the very same event arrives whether
 * you clicked a channel, clicked disconnect, or a moderator did one of those to you. What tells them
 * apart is what happened just before: VOICE_CHANNEL_SELECT is this client asking to be somewhere, and
 * it is only ever dispatched for a choice made on this machine. Somebody else moving you produces a
 * voice state and nothing in front of it.
 *
 * Order is what makes that safe rather than lucky. Your own click dispatches the select first and the
 * gateway confirms it afterwards, while a move made for you arrives from the gateway with nothing
 * before it, so reading this from inside the voice state dispatch sees a choice only where there was
 * one. It is also the same signal every anti-move plugin is built on, for the same reason.
 */

/**
 * How long a choice stays recognisable.
 *
 * It only has to outlive the round trip to the gateway, a fraction of a second on a normal connection
 * and a second or two on a bad one. Long enough to cover the bad one, short enough that something you
 * asked for a while ago cannot be mistaken for the reason behind something happening now.
 */
const CHOICE_WINDOW_MS = 10_000;

/** Where you last asked to be. Null is a deliberate disconnect, which is a choice like any other. */
let wantedChannelId: string | null = null;
let wantedAt = 0;

/**
 * Whether this client has ever been heard making a choice.
 *
 * The event name is Discord's, not a promise to anybody, and everything here reads a *missing* choice
 * as somebody else having moved you. If an update ever renamed it, every move would read that way,
 * including walking out of voice, and the reader would be dragged back into a call they had just
 * left. One choice heard, at any point in the session, is proof the signal still exists.
 */
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
    // subscribing twice would leave the first subscription behind for the rest of the session
    stopWatchingMyChoices();
    FluxDispatcher.subscribe("VOICE_CHANNEL_SELECT", handleChannelSelect);
}

export function stopWatchingMyChoices() {
    FluxDispatcher.unsubscribe("VOICE_CHANNEL_SELECT", handleChannelSelect);
    forgetMyChoice();
    everHeardAChoice = false;
}

/**
 * Whether a move made for you can be told from one you made, at all.
 *
 * False until this client has been heard picking a channel or leaving one. Callers that would read
 * silence as somebody else's doing have to ask this first, because before the first choice of a
 * session, and after an update that renamed the event, silence means nothing of the kind.
 */
export function canTellMyMovesApart(): boolean {
    return everHeardAChoice;
}

/**
 * Whether ending up in `channelId` is what you asked for. Null means out of voice altogether.
 *
 * A match spends the record, because one choice explains one move. Discord sends the same change more
 * than once often enough, and a second copy must not read as a decision of its own.
 */
export function wasMyOwnDoing(channelId: string | null): boolean {
    if (Date.now() - wantedAt > CHOICE_WINDOW_MS) return false;
    if (wantedChannelId !== channelId) return false;

    forgetMyChoice();
    return true;
}

/**
 * You have asked to be in a channel and are not there yet.
 *
 * Switching servers is two voice states rather than one, because the state belongs to the server you
 * are leaving as much as to the one you are entering, and the client can be out of voice for the
 * moment between them. That gap is not a decision to leave voice and it is not somebody throwing you
 * out, so nothing may be read into it while the move you asked for is still on its way.
 */
export function isMyMoveInFlight(): boolean {
    return wantedChannelId != null && Date.now() - wantedAt <= CHOICE_WINDOW_MS;
}
