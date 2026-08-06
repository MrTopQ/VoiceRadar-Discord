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
    /** everyone sitting in that channel, resolved once and reused by the row and its tooltip */
    participantIds: string[];
    /** mic off, either by themselves or muted by a moderator */
    isMuted: boolean;
    /** headphones off, so they hear nothing at all, and are muted too */
    isDeafened: boolean;
    selfVideo: boolean;
    selfStream: boolean;
    isMyChannel: boolean;
    /** you are allowed to see the channel */
    canView: boolean;
    /** you are allowed to actually connect to it */
    canJoin: boolean;
    /** user limit reached and you have no Move Members to bypass it */
    isFull: boolean;
}

export function getMyChannelId(): string | null {
    return SelectedChannelStore.getVoiceChannelId() ?? null;
}

/** The server your own voice channel belongs to. Null in a DM call or when not connected. */
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

/** "Guild · Channel", the one label every list, tooltip and toast in the plugin uses. */
export function channelLabel(info: VoiceInfo): string {
    return info.guildName ? `${info.channelName} · ${info.guildName}` : info.channelName;
}

export function describeChannel(channelId: string): string {
    return channelLabel(getChannelInfo(channelId));
}

/**
 * Vencord fills the store exports in asynchronously, so the binding must be read inside the call.
 * Caching it at module level would capture undefined forever.
 */
const voiceStore = () => VoiceStateStore as any;

/**
 * getVoiceStatesForChannel is the backbone of this plugin. If a Discord update ever renames it,
 * fall back to scanning all voice states instead of silently showing an empty list.
 */
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

/**
 * Everybody's voice state in one map, for the day getVoiceStateForUser is not there any more.
 *
 * Flattening every server is far too much work to do per row, and this is asked once per row per
 * redraw, so the answer is held for the length of one render pass exactly like the channel info
 * below. It is only ever built on the fallback path, so an intact Discord never pays for it.
 */
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

/** Where one person is, with the same two ways of answering that a channel's members have. */
export function voiceStateForUser(userId: string): any | null {
    const store = voiceStore();

    if (typeof store?.getVoiceStateForUser === "function") {
        return store.getVoiceStateForUser(userId) ?? null;
    }

    reportBroken(T.apiWhoIsInVoice);
    return allVoiceStatesByUser().get(userId) ?? null;
}

/** "Who is in which channel" across every guild we know about, used to prime the tracker. */
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

/** DMs and group calls have no overwrites. Everything else is checked against your roles. */
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

/** A full channel refuses the connection, unless you can move members. */
export function isChannelFull(channel: any, memberCount: number): boolean {
    const limit = Number(channel?.userLimit) || 0;
    if (limit <= 0 || memberCount < limit) return false;

    try {
        return !PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel);
    } catch {
        return true;
    }
}

/**
 * Rows in the same channel would each redo the permission checks and the member scan. A very short
 * cache collapses one render pass into a single lookup per channel. At a 100 person limit that is the
 * difference between hundreds of permission checks per redraw and a handful.
 */
const CHANNEL_INFO_TTL_MS = 200;
/** Far more channels than one render pass can touch, so the ceiling never costs a real lookup. */
const CHANNEL_INFO_MAX_ENTRIES = 200;
const channelInfoCache = new TtlCache<VoiceInfo>(CHANNEL_INFO_TTL_MS, CHANNEL_INFO_MAX_ENTRIES);

function baseChannelInfo(channelId: string): VoiceInfo {
    return channelInfoCache.get(channelId) ?? channelInfoCache.set(channelId, buildChannelInfo(channelId));
}

export function getChannelInfo(channelId: string, state?: any): VoiceInfo {
    const base = baseChannelInfo(channelId);

    // per-person flags are never cached, they change with every mute click
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

/** Channel-wide facts only. Per-person voice flags are layered on top by getChannelInfo. */
function buildChannelInfo(channelId: string): VoiceInfo {
    const channel = ChannelStore.getChannel(channelId) as any;
    const guildId = channel?.guild_id ?? null;
    const guild = guildId ? GuildStore.getGuild(guildId) : null;
    const memberStates = voiceStatesForChannel(channelId);
    const participantIds = Object.keys(memberStates);
    const { canView, canJoin } = getChannelAccess(channel);

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
        isFull: isChannelFull(channel, participantIds.length)
    };
}

/** Opens the channel in Discord, the sidebar and chat view. Does NOT connect to it. */
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

/**
 * How much of Discord's voice picture the client is actually holding. A number well under your server
 * count is the shape of the problem the subscriptions exist to fix, so it is worth showing.
 */
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
        /* nothing to report, which the caller shows as zero */
    }

    return { guilds, states };
}

/** Short-lived by design, but there is no reason to keep them alive past the plugin either. */
export function resetChannelCaches(): void {
    channelInfoCache.clear();
    allStatesCache.clear();
}

export function channelProblems(): ApiHealth {
    const store = voiceStore();

    return new HealthReport()
        // either way of answering will do, since both of these fall back to the whole-store scan
        .vital(
            () => isFn(store?.getVoiceStateForUser) || isFn(store?.getAllVoiceStates),
            T.apiWhoIsInVoice
        )
        .vital(
            () => isFn(store?.getVoiceStatesForChannel) || isFn(store?.getAllVoiceStates),
            T.apiChannelMembers
        )
        .vital(() => isFn(SelectedChannelStore?.getVoiceChannelId), T.apiMyChannel)
        // without this one nothing reads as broken, it just quietly turns every channel into
        // "unknown" and every row into a locked one, which looks like the plugin deciding you have
        // no access
        .vital(() => isFn((ChannelStore as any)?.getChannel), T.apiChannelInfo)
        .nice(() => isFn((ChannelRouter as any)?.transitionToChannel), T.apiOpenChannel)
        .nice(() => isFn((PermissionStore as any)?.can), T.apiPermissions);
}
