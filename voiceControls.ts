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

import { ChannelStore, FluxDispatcher, MediaEngineStore, PermissionsBits, PermissionStore } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn } from "./apiHealth";
import { getVoiceInfo, voiceStateForUser } from "./channels";
import { T } from "./i18n";
import { changeMemberVoice, isRepeatClick, type VoiceChange } from "./moveApi";
import { isModeratorMode } from "./movePermissions";
import { getUserDisplayName } from "./names";
import { toast, ToastType } from "./toast";

export interface VoiceRights {
    mute: boolean;
    deafen: boolean;
    disconnect: boolean;
}

const NO_RIGHTS: VoiceRights = { mute: false, deafen: false, disconnect: false };

function holds(bit: bigint, channel: any): boolean {
    try {
        return PermissionStore.can(bit, channel);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] moderator permission check failed:", error);
        return false;
    }
}

/** What you may do to the people in a channel, which is nothing outside a server. */
export function voiceRightsIn(channelId: string): VoiceRights {
    const channel = ChannelStore.getChannel(channelId) as any;
    if (!isModeratorMode() || !channel?.guild_id) return NO_RIGHTS;

    return {
        mute: holds(PermissionsBits.MUTE_MEMBERS, channel),
        deafen: holds(PermissionsBits.DEAFEN_MEMBERS, channel),
        disconnect: holds(PermissionsBits.MOVE_MEMBERS, channel)
    };
}

export function isLocallyMuted(userId: string): boolean {
    try {
        return MediaEngineStore.isLocalMute(userId) === true;
    } catch {
        return false;
    }
}

export function toggleLocalMute(userId: string) {
    FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_LOCAL_MUTE", context: "default", userId } as any);
}

/** Calls back when Discord's audio settings change, and returns how to stop listening. */
export function watchLocalMutes(onChange: () => void): () => void {
    if (!isFn((MediaEngineStore as any)?.addChangeListener)) return () => { };

    MediaEngineStore.addChangeListener(onChange);
    return () => MediaEngineStore.removeChangeListener?.(onChange);
}

async function changeVoice(action: string, userId: string, change: VoiceChange) {
    if (isRepeatClick(action, userId)) return;

    const voice = getVoiceInfo(userId);
    if (!voice?.guildId) return;

    const outcome = await changeMemberVoice(voice.guildId, userId, change, getUserDisplayName(userId));
    if (!outcome.ok) toast(outcome.problem!, ToastType.FAILURE);
}

export const toggleServerMute = (userId: string) => changeVoice("mute", userId, { mute: !voiceStateForUser(userId)?.mute });

export const toggleServerDeaf = (userId: string) => changeVoice("deaf", userId, { deaf: !voiceStateForUser(userId)?.deaf });

export const disconnectFromVoice = (userId: string) => changeVoice("disconnect", userId, { channel_id: null });

export function voiceControlProblems(): ApiHealth {
    return new HealthReport()
        .nice(() => isFn((MediaEngineStore as any)?.isLocalMute), T.apiLocalMute)
        .nice(() => typeof (PermissionsBits as any)?.MUTE_MEMBERS === "bigint" && typeof (PermissionsBits as any)?.DEAFEN_MEMBERS === "bigint", T.apiMuteFlags);
}
