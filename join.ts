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

import { findByPropsLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, MediaEngineStore, UserStore } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn, probe, reportBroken } from "./apiHealth";
import { getChannelAccess, getChannelParticipantIds, getMyChannelId, isChannelFull, voiceStateForUser } from "./channels";
import { T } from "./i18n";
import { settings } from "./settings";
import { toast, ToastType } from "./toast";

// kept as proxies. The lazy find resolves on first property access, when the action is used
const ChannelActions = findByPropsLazy("selectVoiceChannel", "selectChannel");
const VoiceActions = findByPropsLazy("toggleSelfMute");

/** Never fire two mute actions back to back. With the toggle a stale read would unmute us. */
const MUTE_TOGGLE_GUARD_MS = 900;
/**
 * Discord needs a moment to build the connection before the mute state sticks.
 *
 * Spaced wider than the guard above on purpose. At 500ms the second attempt was refused by it, so
 * what looked like three chances was really two.
 */
const MUTE_RETRY_DELAYS_MS = [0, 1000, 2000];

/** Returns null when the mute state cannot be determined (not connected / store shape changed). */
export function readSelfMute(): boolean | null {
    try {
        const engine = MediaEngineStore as any;
        if (typeof engine?.isSelfMute === "function") return !!engine.isSelfMute();
    } catch {
        /* fall through to the voice state */
    }

    try {
        const myId = UserStore.getCurrentUser()?.id;
        const state = myId ? voiceStateForUser(myId) : null;
        if (state) return !!state.selfMute;
    } catch {
        /* unknown */
    }

    return null;
}

let lastMuteToggleAt = 0;
/**
 * Set once setSelfMute turns out not to do what it says, and from then on only the toggle is used.
 * It is not a name Discord promises, so the shape it expects is checked by its effect, once.
 */
let isSetterBroken = false;

/**
 * Asks for the mic to be off, preferring the idempotent setter over the toggle.
 *
 * The toggle is the dangerous one, because it means invert. Firing it while the mute has landed but
 * the store still reads as open switches the mic back on. That window is what the retry below cannot
 * rule out, and a setter has no such failure mode.
 */
function sendSelfMute(): boolean {
    const actions = VoiceActions as any;

    try {
        // the lookup itself is inside the try, because reading a property off a lazy find whose
        // module has moved throws rather than answering undefined
        if (!isSetterBroken && typeof actions?.setSelfMute === "function") {
            actions.setSelfMute(true);

            // still open right after the call means the setter wants a different shape. Noticed
            // once, and never tried again for the rest of the session
            if (readSelfMute() !== false) return true;
            isSetterBroken = true;
        }
    } catch (error) {
        isSetterBroken = true;
        console.warn("[VoiceRadar-Discord] setSelfMute failed, falling back to the toggle:", error);
    }

    try {
        if (typeof actions?.toggleSelfMute === "function") {
            actions.toggleSelfMute({ context: "default" });
            return true;
        }
    } catch (error) {
        console.warn("[VoiceRadar-Discord] toggleSelfMute action failed, falling back to dispatch:", error);
    }

    try {
        FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_SELF_MUTE", context: "default" } as any);
        return true;
    } catch (error) {
        console.error("[VoiceRadar-Discord] failed to mute:", error);
        reportBroken(T.apiSilentJoin);
        return false;
    }
}

function muteSelf(): boolean {
    if (Date.now() - lastMuteToggleAt < MUTE_TOGGLE_GUARD_MS) return false;
    lastMuteToggleAt = Date.now();

    return sendSelfMute();
}

let muteChecks: ReturnType<typeof setTimeout>[] = [];

/**
 * Mutes once and then only verifies. Hopping between channels used to restart the whole retry dance
 * on every join. Now an already muted mic means nothing to do, and the checks left over from the
 * previous jump are dropped instead of stacking up.
 */
function muteAfterJoin() {
    muteChecks.forEach(clearTimeout);
    muteChecks = [];

    // already muted, and the connection carries that over, so no toggle and no retries
    if (readSelfMute() === true) return;

    let toggled = false;

    const attempt = () => {
        const current = readSelfMute();
        if (current === true) return; // done, nothing left to fix

        // unknown state means we are still connecting, so act once and let the checks confirm
        if (current === null && toggled) return;

        toggled = true;
        muteSelf();
    };

    muteChecks = MUTE_RETRY_DELAYS_MS.map(delay => setTimeout(attempt, delay));
}

/** A join is already scheduled for this channel. Never queue the same jump twice. */
let pendingJoinChannelId: string | null = null;
let joinTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Drops the deferred join and the mute retries. Both are timers of up to a couple of seconds, and a
 * plugin that has been switched off must not still be connecting you somewhere or reaching for your
 * microphone a moment later.
 */
export function cancelPendingVoiceActions(): void {
    muteChecks.forEach(clearTimeout);
    muteChecks = [];

    if (joinTimeout) {
        clearTimeout(joinTimeout);
        joinTimeout = null;
    }

    pendingJoinChannelId = null;
    // the floor under the next session's first join must not be a timestamp from this one
    lastJoinRequestAt = 0;
}

/**
 * The floor under every way of asking for a voice connection. It sits below every deliberate
 * cooldown above it, so it changes none of them and only catches repeats no deliberate action
 * produces. A join button clicked four times before the connection lands used to be four requests.
 */
const MIN_JOIN_GAP_MS = 500;
let lastJoinRequestAt = 0;

/**
 * Why a join did not happen, for callers that have a cooldown of their own.
 *
 * "busy" is about timing and nothing else, a join already in flight or the floor below. Spending a
 * five second auto-join cooldown on one of those would skip the target's next hop, which might be a
 * channel we could have followed. "refused" is about this channel, no permission or full, and a toast
 * has already said so, which makes it worth a cooldown, because it repeats on every hop.
 */
export type JoinResult = "joined" | "busy" | "refused";

/**
 * Jumps into a voice channel. With silent join on, the mic is muted right away, then verified a few
 * times, because the mute can be overwritten while the connection is set up.
 *
 * The selectVoiceChannel call is deferred by a tick on purpose. Auto-join runs inside a
 * VOICE_STATE_UPDATES dispatch and that action creator dispatches again, and dispatching from inside
 * a dispatch is what made the client fall over when the cooldown was set to 0.
 */
export function joinVoiceChannel(channelId: string | null, silent = settings.store.silentJoin): JoinResult {
    if (!channelId) {
        toast(T.targetNotInVoice, ToastType.FAILURE);
        return "refused";
    }

    if (channelId === getMyChannelId() || channelId === pendingJoinChannelId) return "busy";
    if (Date.now() - lastJoinRequestAt < MIN_JOIN_GAP_MS) return "busy";

    const channel = ChannelStore.getChannel(channelId) as any;

    if (!getChannelAccess(channel).canJoin) {
        toast(T.cannotJoinChannel, ToastType.FAILURE);
        return "refused";
    }

    if (isChannelFull(channel, getChannelParticipantIds(channelId).length)) {
        toast(T.channelIsFull, ToastType.FAILURE);
        return "refused";
    }

    pendingJoinChannelId = channelId;
    lastJoinRequestAt = Date.now();

    joinTimeout = setTimeout(() => {
        pendingJoinChannelId = null;
        joinTimeout = null;

        try {
            (ChannelActions as any).selectVoiceChannel(channelId);
        } catch (error) {
            console.error("[VoiceRadar-Discord] failed to join channel:", error);
            reportBroken(T.apiJoinChannel, true);
            toast(T.couldNotJoinChannel, ToastType.FAILURE);
            return;
        }

        if (silent) muteAfterJoin();
    }, 0);

    return "joined";
}

export function joinProblems(): ApiHealth {
    return new HealthReport()
        // the join button is the point of the list, so losing it is losing the plugin
        .vital(() => isFn((ChannelActions as any)?.selectVoiceChannel), T.apiJoinChannel)
        .nice(
            () => probe(() => isFn((VoiceActions as any)?.setSelfMute))
                || probe(() => isFn((VoiceActions as any)?.toggleSelfMute)),
            T.apiSilentJoin
        );
}
