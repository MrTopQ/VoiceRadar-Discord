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

const ChannelActions = findByPropsLazy("selectVoiceChannel", "selectChannel");
const VoiceActions = findByPropsLazy("toggleSelfMute");

const MUTE_TOGGLE_GUARD_MS = 900;
/** Discord needs a moment to connect before the mute sticks. */
const MUTE_RETRY_DELAYS_MS = [0, 1000, 2000];

export function readSelfMute(): boolean | null {
    try {
        const engine = MediaEngineStore as any;
        if (typeof engine?.isSelfMute === "function") return !!engine.isSelfMute();
    } catch {
    }

    try {
        const myId = UserStore.getCurrentUser()?.id;
        const state = myId ? voiceStateForUser(myId) : null;
        if (state) return !!state.selfMute;
    } catch {
    }

    return null;
}

let lastMuteToggleAt = 0;
let isSetterBroken = false;

function sendSelfMute(): boolean {
    const actions = VoiceActions as any;

    try {
        // Reading a moved lazy find throws, so the lookup is inside the try.
        if (!isSetterBroken && typeof actions?.setSelfMute === "function") {
            actions.setSelfMute(true);

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

function muteAfterJoin() {
    muteChecks.forEach(clearTimeout);
    muteChecks = [];

    if (readSelfMute() === true) return;

    let toggled = false;

    const attempt = () => {
        const current = readSelfMute();
        if (current === true) return;

        if (current === null && toggled) return;

        toggled = true;
        muteSelf();
    };

    muteChecks = MUTE_RETRY_DELAYS_MS.map(delay => setTimeout(attempt, delay));
}

let pendingJoinChannelId: string | null = null;
let joinTimeout: ReturnType<typeof setTimeout> | null = null;

export function cancelPendingVoiceActions(): void {
    muteChecks.forEach(clearTimeout);
    muteChecks = [];

    if (joinTimeout) {
        clearTimeout(joinTimeout);
        joinTimeout = null;
    }

    pendingJoinChannelId = null;
    lastJoinRequestAt = 0;
}

const MIN_JOIN_GAP_MS = 500;
let lastJoinRequestAt = 0;

export type JoinResult = "joined" | "busy" | "refused";

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
        .vital(() => isFn((ChannelActions as any)?.selectVoiceChannel), T.apiJoinChannel)
        .nice(
            () => probe(() => isFn((VoiceActions as any)?.setSelfMute))
                || probe(() => isFn((VoiceActions as any)?.toggleSelfMute)),
            T.apiSilentJoin
        );
}
