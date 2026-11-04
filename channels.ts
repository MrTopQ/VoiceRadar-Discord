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

import { ChannelRouter, ChannelStore, GuildStore, PermissionsBits, PermissionStore, SelectedChannelStore, VoiceStateStore } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn, reportBroken } from "./apiHealth";
import { TtlCache } from "./cache";
import { T } from "./i18n";
import { toast, ToastType } from "./toast";

export interface VoiceInfo {
    channelId: string;
    channelName: string;
    guildId: string | null;
    guildName: string | null;
    memberCount: number;
    participantIds: string[];
    isMuted: boolean;
    isDeafened: boolean;
    selfVideo: boolean;
    selfStream: boolean;
    isMyChannel: boolean;
    canView: boolean;
    canJoin: boolean;
    isFull: boolean;
    /** At its user limit, yet you may join, since Move Members lets you past it. */
    fullButAllowed: boolean;
}

export function getMyChannelId(): string | null {
    try {
        return SelectedChannelStore?.getVoiceChannelId?.() ?? null;
    } catch {
        return null;
    }
}

export function getMyGuildId(): string | null {
    const channelId = getMyChannelId();
    if (!channelId) return null;
    return (ChannelStore.getChannel(channelId) as any)?.guild_id ?? null;
}

export function getChannelName(channel: any): string {
    if (!channel) return T.unknownChannel;
    if (channel.name) return channel.name;
    if (channel.type === 3) return T.groupCall;
    if (channel.type === 1) return T.directCall;
    return T.unknownChannel;
}

export function channelLabel(info: VoiceInfo): string {
    return info.guildName ? `${info.channelName} · ${info.guildName}` : info.channelName;
}

export function describeChannel(channelId: string): string {
    return channelLabel(getChannelInfo(channelId));
}

/** Vencord fills the store exports later, so the binding is read inside the call. */
const voiceStore = () => VoiceStateStore as any;

function voiceStatesForChannel(channelId: string): Record<string, any> {
    const store = voiceStore();

    if (typeof store?.getVoiceStatesForChannel === "function") {
        return store.getVoiceStatesForChannel(channelId) ?? {};
    }

    reportBroken(T.apiChannelMembers);

    const all = store?.getAllVoiceStates?.();
    if (!all) return {};

    const states: Record<string, any> = {};
    for (const guildStates of Object.values<any>(all)) {
        for (const [userId, state] of Object.entries<any>(guildStates ?? {})) {
            if (state?.channelId === channelId) states[userId] = state;
        }
    }
    return states;
}

const ALL_STATES_TTL_MS = 200;
const allStatesCache = new TtlCache<Map<string, any>>(ALL_STATES_TTL_MS, 1);

function allVoiceStatesByUser(): Map<string, any> {
    const cached = allStatesCache.get("all");
    if (cached) return cached;

    const states = new Map<string, any>();
    const all = voiceStore()?.getAllVoiceStates?.();

    for (const guildStates of Object.values<any>(all ?? {})) {
        for (const [userId, state] of Object.entries<any>(guildStates ?? {})) {
            states.set(userId, state);
        }
    }

    return allStatesCache.set("all", states);
}

export function voiceStateForUser(userId: string): any | null {
    const store = voiceStore();

    if (typeof store?.getVoiceStateForUser === "function") {
        return store.getVoiceStateForUser(userId) ?? null;
    }

    reportBroken(T.apiWhoIsInVoice);
    return allVoiceStatesByUser().get(userId) ?? null;
}

export function getVoiceSnapshot(): Map<string, string> {
    const snapshot = new Map<string, string>();
    const all = voiceStore()?.getAllVoiceStates?.();
    if (!all) return snapshot;

    for (const guildStates of Object.values<any>(all)) {
        for (const [userId, state] of Object.entries<any>(guildStates ?? {})) {
            if (state?.channelId) snapshot.set(userId, state.channelId);
        }
    }

    return snapshot;
}

export function getVoiceInfo(userId: string): VoiceInfo | null {
    const state = voiceStateForUser(userId);
    if (!state?.channelId) return null;

    return getChannelInfo(state.channelId, state);
}

export function getChannelAccess(channel: any): { canView: boolean; canJoin: boolean; } {
    if (!channel) return { canView: false, canJoin: false };
    if (channel.type === 1 || channel.type === 3) return { canView: true, canJoin: true };

    try {
        const canView = !!PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel);
        const canJoin = canView && !!PermissionStore.can(PermissionsBits.CONNECT, channel);
        return { canView, canJoin };
    } catch (error) {
        console.warn("[VoiceRadar-Discord] permission check failed:", error);
        reportBroken(T.apiPermissions);
        return { canView: true, canJoin: true };
    }
}

export function isAtUserLimit(channel: any, memberCount: number): boolean {
    const limit = Number(channel?.userLimit) || 0;
    return limit > 0 && memberCount >= limit;
}

export function isChannelFull(channel: any, memberCount: number): boolean {
    if (!isAtUserLimit(channel, memberCount)) return false;

    try {
        return !PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel);
    } catch {
        // If the check breaks, treat the channel as open and let the server decide.
        return false;
    }
}

/** A short cache so rows in the same channel share one lookup. */
const CHANNEL_INFO_TTL_MS = 200;
const CHANNEL_INFO_MAX_ENTRIES = 200;
const channelInfoCache = new TtlCache<VoiceInfo>(CHANNEL_INFO_TTL_MS, CHANNEL_INFO_MAX_ENTRIES);

function baseChannelInfo(channelId: string): VoiceInfo {
    return channelInfoCache.get(channelId) ?? channelInfoCache.set(channelId, buildChannelInfo(channelId));
}

export function getChannelInfo(channelId: string, state?: any): VoiceInfo {
    const base = baseChannelInfo(channelId);

    return state
        ? {
            ...base,
            isMuted: !!state.selfMute || !!state.mute,
            isDeafened: !!state.selfDeaf || !!state.deaf,
            selfVideo: !!state.selfVideo,
            selfStream: !!state.selfStream
        }
        : base;
}

function buildChannelInfo(channelId: string): VoiceInfo {
    const channel = ChannelStore.getChannel(channelId) as any;
    const guildId = channel?.guild_id ?? null;
    const guild = guildId ? (() => {
        try {
            return GuildStore?.getGuild?.(guildId) ?? null;
        } catch {
            return null;
        }
    })() : null;
    const memberStates = voiceStatesForChannel(channelId);
    const participantIds = Object.keys(memberStates);
    const { canView, canJoin } = getChannelAccess(channel);
    const isFull = isChannelFull(channel, participantIds.length);

    return {
        channelId,
        channelName: getChannelName(channel),
        guildId,
        guildName: (guild as any)?.name ?? null,
        memberCount: participantIds.length,
        participantIds,
        isMuted: false,
        isDeafened: false,
        selfVideo: false,
        selfStream: false,
        isMyChannel: channelId === getMyChannelId(),
        canView,
        canJoin,
        isFull,
        fullButAllowed: !isFull && isAtUserLimit(channel, participantIds.length)
    };
}

export function openChannel(channelId: string): void {
    try {
        (ChannelRouter as any).transitionToChannel(channelId);
    } catch (error) {
        console.error("[VoiceRadar-Discord] failed to open channel:", error);
        reportBroken(T.apiOpenChannel);
        toast(T.couldNotOpenChannel, ToastType.FAILURE);
    }
}

export function getChannelParticipantIds(channelId: string): string[] {
    return Object.keys(voiceStatesForChannel(channelId));
}

export function getVoiceCoverage(): { guilds: number; states: number; } {
    let guilds = 0;
    let states = 0;

    try {
        const all = voiceStore()?.getAllVoiceStates?.() ?? {};

        for (const guildStates of Object.values<any>(all)) {
            const count = Object.keys(guildStates ?? {}).length;
            if (!count) continue;

            guilds++;
            states += count;
        }
    } catch {
    }

    return { guilds, states };
}

export function resetChannelCaches(): void {
    channelInfoCache.clear();
    allStatesCache.clear();
}

export function channelProblems(): ApiHealth {
    const store = voiceStore();

    return new HealthReport()
        .vital(
            () => isFn(store?.getVoiceStateForUser) || isFn(store?.getAllVoiceStates),
            T.apiWhoIsInVoice
        )
        .vital(
            () => isFn(store?.getVoiceStatesForChannel) || isFn(store?.getAllVoiceStates),
            T.apiChannelMembers
        )
        .vital(() => isFn(SelectedChannelStore?.getVoiceChannelId), T.apiMyChannel)
        .vital(() => isFn((ChannelStore as any)?.getChannel), T.apiChannelInfo)
        .nice(() => isFn((ChannelRouter as any)?.transitionToChannel), T.apiOpenChannel)
        .nice(() => isFn((PermissionStore as any)?.can), T.apiPermissions);
}
