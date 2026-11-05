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

import { ChannelStore, FluxDispatcher, PresenceStore, RelationshipStore } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn } from "./apiHealth";
import { voiceStateForUser } from "./channels";
import { T } from "./i18n";
import { getTrackedUser, getUsers } from "./store";

export interface PlatformPresence {
    platform: string;
    status: string;
}

export type ActivityKind = "playing" | "streaming" | "listening" | "watching" | "competing" | "custom";

export interface PresenceInfo {
    status: string;
    platforms: PlatformPresence[];
    isMobile: boolean;
    activity: string | null;
    activityKind: ActivityKind | null;
    /** False when Discord never sent a presence for this person. */
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

function hasPresenceData(userId: string): boolean {
    try {
        const statuses = (PresenceStore as any)?.getState?.()?.statuses;
        if (!statuses) return true;
        return statuses[userId] !== undefined;
    } catch {
        return true;
    }
}

const PLATFORM_ORDER = ["desktop", "mobile", "web", "embedded", "vr"];

function getPlatforms(userId: string, status: string): PlatformPresence[] {
    if (status === "offline") return [];

    try {
        const byPlatform = (PresenceStore as any)?.getClientStatus?.(userId);

        if (byPlatform) {
            return Object.entries(byPlatform as Record<string, string>)
                .map(([platform, platformStatus]) => ({
                    platform,
                    status: String(platformStatus || status)
                }))
                .sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
        }
    } catch {
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
        activityKind: activity ? ACTIVITY_KINDS[primary?.type] ?? "playing" : null,
        known
    };
}

export const INVISIBLE_NOTE = "invisible";

/** What somebody is on right now, in short enough for a journal line, empty when Discord does not say. */
export function deviceNote(userId: string): string {
    const { status, platforms, known } = getPresenceInfo(userId);
    if (platforms.length) return platforms.map(entry => `${entry.platform}:${entry.status}`).join(",");

    // Discord reports on friends by itself, so only then does a missing status mean offline.
    const reported = known || !!(RelationshipStore as any)?.isFriend?.(userId);
    return status === "offline" && reported && voiceStateForUser(userId) ? INVISIBLE_NOTE : "";
}

export function readDeviceNote(note: string): PlatformPresence[] {
    if (!note || note === INVISIBLE_NOTE) return [];

    return note.split(",").map(entry => {
        const [platform, status] = entry.split(":");
        return { platform, status };
    });
}

const PRESENCE_REQUEST_COOLDOWN_MS = 60_000;
const PRESENCE_REQUEST_GAP_MS = 5000;
const MAX_USERS_PER_REQUEST = 100;
const MAX_GUILDS_PER_REQUEST = 10;
const presenceRequestedAt = new Map<string, number>();
let lastPresenceRequestAt = 0;

const guildIdOfChannel = (channelId: string | null | undefined): string | null =>
    (channelId ? (ChannelStore.getChannel(channelId) as any)?.guild_id ?? null : null);

function guildIdOfUser(userId: string): string | null {
    return guildIdOfChannel(voiceStateForUser(userId)?.channelId)
        ?? guildIdOfChannel(getTrackedUser(userId)?.lastChannelId);
}

function guildIdsFor(userIds: string[]): string[] {
    const wanted = new Set<string>();

    const room = () => wanted.size < MAX_GUILDS_PER_REQUEST;

    for (const userId of userIds) {
        const guildId = guildIdOfUser(userId);
        if (guildId) wanted.add(guildId);
    }

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

    // Discord reports on friends by itself, so one without data is simply offline.
    const missing = userIds
        .filter(userId => !hasPresenceData(userId) && !(RelationshipStore as any)?.isFriend?.(userId))
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

export function resetPresenceRequests(): void {
    presenceRequestedAt.clear();
    lastPresenceRequestAt = 0;
}

export function presenceProblems(): ApiHealth {
    return new HealthReport()
        .nice(() => isFn((PresenceStore as any)?.getStatus), T.apiStatuses)
        .nice(
            () => isFn((PresenceStore as any)?.getClientStatus) || isFn((PresenceStore as any)?.isMobileOnline),
            T.apiDevices
        );
}
