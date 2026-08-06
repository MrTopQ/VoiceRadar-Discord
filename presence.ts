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

import { ChannelStore, FluxDispatcher, PresenceStore } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn } from "./apiHealth";
import { voiceStateForUser } from "./channels";
import { T } from "./i18n";
import { getTrackedUser, getUsers } from "./store";

/** One device Discord says they are online from, with the status that device reports. */
export interface PlatformPresence {
    /** desktop, mobile, web, embedded or vr, whatever Discord names it */
    platform: string;
    status: string;
}

/** What the person is doing, so the row can colour it. Discord's activity types, by name. */
export type ActivityKind = "playing" | "streaming" | "listening" | "watching" | "competing" | "custom";

export interface PresenceInfo {
    status: string;
    /** every device at once, in a fixed order, so a phone plus a PC shows both */
    platforms: PlatformPresence[];
    /** derived from `platforms`, and only still here because the status dot's tooltip names it */
    isMobile: boolean;
    activity: string | null;
    /** null together with `activity`, set to its kind otherwise */
    activityKind: ActivityKind | null;
    /**
     * False when Discord never sent us a presence for this person, which happens for somebody who
     * is not a friend and sits in no loaded member list. getStatus() answers "offline" there, and
     * that is a lie, so the list shows "unknown" instead.
     */
    known: boolean;
}

const ACTIVITY_KINDS: Record<number, ActivityKind> = {
    0: "playing",
    1: "streaming",
    2: "listening",
    3: "watching",
    4: "custom",
    5: "competing"
};

function formatActivity(activity: any): string | null {
    if (!activity) return null;

    switch (activity.type) {
        case 0:
            return `🎮 ${activity.name}`;
        case 1:
            return `🔴 ${activity.details || activity.name}`;
        case 2:
            return `🎧 ${activity.details || activity.name}`;
        case 3:
            return `📺 ${activity.details || activity.name}`;
        case 4:
            return activity.state ? `💬 ${activity.state}` : null;
        case 5:
            return `🏆 ${activity.name}`;
        default:
            return activity.name ?? null;
    }
}

/**
 * Whether Discord actually sent us a presence for this person, as opposed to getStatus() defaulting
 * to "offline" for somebody it knows nothing about.
 *
 * When the store's shape cannot be read at all, this answers yes. Taking the status at face value
 * costs one possibly wrong dot, answering no would paint every row as unknown and lose the real
 * statuses with it.
 */
function hasPresenceData(userId: string): boolean {
    try {
        const statuses = (PresenceStore as any)?.getState?.()?.statuses;
        if (!statuses) return true;
        return statuses[userId] !== undefined;
    } catch {
        return true;
    }
}

/** The order the icons are drawn in, so a row does not reshuffle them between redraws. */
const PLATFORM_ORDER = ["desktop", "mobile", "web", "embedded", "vr"];

/**
 * Which devices they are online from, straight out of the store. The same source Vencord's own
 * PlatformIndicators reads, so an icon here means what the same icon means in the member list.
 *
 * Deliberately not isMobileOnline. That answers one bit, cannot report a phone and a PC at once, and
 * PlatformIndicators patches it to ignore the status entirely. This asks per device instead, and
 * keeps the flag only as a fallback for the day getClientStatus moves.
 */
function getPlatforms(userId: string, status: string): PlatformPresence[] {
    // an offline (or invisible) person has no device worth drawing, whatever the store still holds
    if (status === "offline") return [];

    try {
        const byPlatform = (PresenceStore as any)?.getClientStatus?.(userId);

        if (byPlatform) {
            return Object.entries(byPlatform as Record<string, string>)
                .map(([platform, platformStatus]) => ({
                    platform,
                    // a device with no status of its own still belongs to the person's overall one
                    status: String(platformStatus || status)
                }))
                .sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
        }
    } catch {
        /* fall back to the flag */
    }

    return (PresenceStore as any)?.isMobileOnline?.(userId)
        ? [{ platform: "mobile", status }]
        : [];
}

export function getPresenceInfo(userId: string): PresenceInfo {
    const presence = PresenceStore as any;
    const status: string = presence?.getStatus?.(userId) ?? "offline";
    const activities: any[] = presence?.getActivities?.(userId) ?? [];
    const known = hasPresenceData(userId);
    const platforms = getPlatforms(userId, status);

    const primary =
        activities.find(activity => activity.type === 1) ??
        activities.find(activity => activity.type === 0) ??
        activities.find(activity => activity.type === 2 || activity.type === 3) ??
        activities.find(activity => activity.type === 4);

    const activity = formatActivity(primary);

    return {
        status,
        platforms,
        isMobile: platforms.some(entry => entry.platform === "mobile"),
        activity,
        // a type Discord adds later still gets the plain treatment rather than no colour at all
        activityKind: activity ? ACTIVITY_KINDS[primary?.type] ?? "playing" : null,
        known
    };
}

/**
 * Asks the gateway for members and presences Discord never pushed to us. The same op 8 request the
 * client fires when you scroll a member list, and what Vencord's own plugins use. No REST call, no
 * rate limit, up to 100 users in one message.
 */
const PRESENCE_REQUEST_COOLDOWN_MS = 60_000;
/** Opening and closing the window in a hurry must not turn into a stream of gateway requests. */
const PRESENCE_REQUEST_GAP_MS = 5000;
const MAX_USERS_PER_REQUEST = 100;
/**
 * How many servers one request may name.
 *
 * The client asks about the one server whose member list you are looking at. Naming every server you
 * are in is a different kind of request, and it is the shape a scraper has. The list below is built
 * from where these people actually are, or were last seen, so it is short by construction, and the
 * cap is only there for somebody whose list spans dozens of servers.
 */
const MAX_GUILDS_PER_REQUEST = 10;
const presenceRequestedAt = new Map<string, number>();
let lastPresenceRequestAt = 0;

const guildIdOfChannel = (channelId: string | null | undefined): string | null =>
    (channelId ? (ChannelStore.getChannel(channelId) as any)?.guild_id ?? null : null);

/** Where this person is sitting, or where the list last saw them. Null when neither is known. */
function guildIdOfUser(userId: string): string | null {
    return guildIdOfChannel(voiceStateForUser(userId)?.channelId)
        ?? guildIdOfChannel(getTrackedUser(userId)?.lastChannelId);
}

/**
 * The servers worth naming for this batch, in order of how likely they are to be the right one.
 * where these people are sitting, where the list last saw them, and failing both, the servers the
 * rest of the list lives in.
 *
 * That last step is what keeps somebody added straight from their profile from being a dead end.
 * They have no voice history of their own, but the people you watch share servers, so the answer is
 * almost always in there, and it costs a short list rather than every server on the account.
 *
 * Naming every server was what this used to do, and it is the one request here that looks nothing
 * like the client's own, which asks about the one server whose member list you are looking at.
 */
function guildIdsFor(userIds: string[]): string[] {
    const wanted = new Set<string>();

    const room = () => wanted.size < MAX_GUILDS_PER_REQUEST;

    for (const userId of userIds) {
        const guildId = guildIdOfUser(userId);
        if (guildId) wanted.add(guildId);
    }

    // the circle these people belong to, for the ones who came in without a channel behind them
    for (const user of getUsers()) {
        if (!room()) break;

        const guildId = guildIdOfUser(user.id);
        if (guildId) wanted.add(guildId);
    }

    return [...wanted].slice(0, MAX_GUILDS_PER_REQUEST);
}

export function requestPresences(userIds: string[]): void {
    const now = Date.now();
    if (now - lastPresenceRequestAt < PRESENCE_REQUEST_GAP_MS) return;

    const missing = userIds
        .filter(userId => !hasPresenceData(userId))
        .filter(userId => now - (presenceRequestedAt.get(userId) ?? 0) > PRESENCE_REQUEST_COOLDOWN_MS)
        .slice(0, MAX_USERS_PER_REQUEST);

    if (!missing.length) return;

    const guildIds = guildIdsFor(missing);
    if (!guildIds.length) return;

    missing.forEach(userId => presenceRequestedAt.set(userId, now));
    lastPresenceRequestAt = now;

    try {
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBERS_REQUEST",
            guildIds,
            userIds: missing,
            presences: true
        } as any);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] presence request failed:", error);
    }
}

/** Everything this file remembers about who it has already asked for, dropped on shutdown. */
export function resetPresenceRequests(): void {
    presenceRequestedAt.clear();
    lastPresenceRequestAt = 0;
}

export function presenceProblems(): ApiHealth {
    return new HealthReport()
        .nice(() => isFn((PresenceStore as any)?.getStatus), T.apiStatuses)
        // one of the two is enough, since the flag is the fallback the device icons already use
        .nice(
            () => isFn((PresenceStore as any)?.getClientStatus) || isFn((PresenceStore as any)?.isMobileOnline),
            T.apiDevices
        );
}
