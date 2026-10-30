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

// The whole module, so exports that Vencord removes do not break the build.
import * as Common from "@webpack/common";

import { type ApiHealth, HealthReport, isFn, proveWorking, reportBroken } from "./apiHealth";
import { T } from "./i18n";

const DISCORD_EPOCH_MS = 1420070400000n;

const SHOWN_MUTUAL_GUILDS = 24;

/** One profile request per person per this long, however often the info window is opened. */
const MUTUAL_CACHE_MS = 10 * 60_000;

const UNKNOWN_USER = 10013;

const fetchedMutual = new Map<string, { ids: string[]; at: number; }>();
const mutualRequests = new Map<string, Promise<boolean>>();

export interface GuildBadge {
    id: string;
    name: string;
    icon: string | null;
}

export interface ProfileFacts {
    createdAt: number | null;
    username: string | null;
    globalName: string | null;
    isFriend: boolean | null;
    isBlocked: boolean | null;
    isBot: boolean | null;
    mutualGuilds: { guilds: GuildBadge[]; count: number; complete: boolean; } | null;
    currentGuild: GuildBadge | null;
    joinedCurrentGuildAt: number | null;
}

function read<T>(get: () => T | null | undefined): T | null {
    try {
        return get() ?? null;
    } catch {
        return null;
    }
}

export function createdAtFromId(userId: string): number | null {
    return read(() => {
        if (!/^\d{15,22}$/.test(userId)) return null;
        return Number((BigInt(userId) >> 22n) + DISCORD_EPOCH_MS);
    });
}

function badgeOf(guild: any): GuildBadge | null {
    if (!guild?.id) return null;
    return { id: String(guild.id), name: String(guild.name ?? guild.id), icon: guild.icon ?? null };
}

const isBadge = (badge: GuildBadge | null): badge is GuildBadge => badge !== null;

/** Asks Discord for every shared server, the same request its own profile makes, and says whether anything new arrived. */
export function loadMutualGuilds(userId: string): Promise<boolean> {
    const known = fetchedMutual.get(userId);
    if (known && Date.now() - known.at < MUTUAL_CACHE_MS) return Promise.resolve(false);

    const pending = mutualRequests.get(userId);
    if (pending) return pending;

    const request = (async () => {
        const common = Common as any;
        const url = read<string>(() => common.Constants?.Endpoints?.USER_PROFILE?.(userId)) ?? `/users/${userId}/profile`;
        const { body } = await common.RestAPI.get({
            url,
            query: { with_mutual_guilds: true, with_mutual_friends_count: false },
            oldFormErrors: true
        });

        if (!Array.isArray(body?.mutual_guilds)) {
            reportBroken(T.apiMutualGuilds);
            return false;
        }

        fetchedMutual.set(userId, { ids: body.mutual_guilds.map((entry: any) => String(entry?.id)), at: Date.now() });
        proveWorking(T.apiMutualGuilds);
        return true;
    })()
        .catch(error => {
            // Discord answers Unknown User when you no longer share a server or a friendship.
            if (error?.status === 404 && error?.body?.code === UNKNOWN_USER) {
                fetchedMutual.set(userId, { ids: [], at: Date.now() });
                return true;
            }

            // A refusal for one person or a rate limit says nothing about the request itself.
            if (error?.status !== 429 && error?.status !== 403) reportBroken(T.apiMutualGuilds);

            console.warn("[VoiceRadar-Discord] could not load shared servers:", error?.status ?? "", error?.body?.message ?? error);
            return false;
        })
        .finally(() => mutualRequests.delete(userId));

    mutualRequests.set(userId, request);
    return request;
}

export function profileProblems(): ApiHealth {
    return new HealthReport().nice(() => isFn((Common as any).RestAPI?.get), T.apiMutualGuilds);
}

export function isLoadingMutualGuilds(userId: string): boolean {
    return mutualRequests.has(userId);
}

function knownSharedGuilds(userId: string): { ids: string[]; complete: boolean; } | null {
    const common = Common as any;

    const fetched = fetchedMutual.get(userId);
    if (fetched) return { ids: fetched.ids, complete: true };

    const fromProfile = read<any[]>(() => common.UserProfileStore?.getMutualGuilds?.(userId));
    if (Array.isArray(fromProfile)) {
        return { ids: fromProfile.map(entry => entry?.guild?.id).filter(Boolean).map(String), complete: true };
    }

    return read(() => ({
        ids: Object.keys(common.GuildStore?.getGuilds?.() ?? {}).filter(id => common.GuildMemberStore?.isMember?.(id, userId)),
        complete: false
    }));
}

export function sharedGuildIds(userId: string): string[] {
    return knownSharedGuilds(userId)?.ids ?? [];
}

function mutualGuilds(userId: string): ProfileFacts["mutualGuilds"] {
    const known = knownSharedGuilds(userId);
    if (!known) return null;

    const guilds = known.ids.map(id => read(() => badgeOf((Common as any).GuildStore?.getGuild?.(id)))).filter(isBadge);
    return { guilds: guilds.slice(0, SHOWN_MUTUAL_GUILDS), count: known.ids.length, complete: known.complete };
}

export function getProfileFacts(userId: string, currentGuildId: string | null): ProfileFacts {
    const common = Common as any;
    const user = read<any>(() => common.UserStore?.getUser?.(userId));

    const joined = currentGuildId
        ? read(() => common.GuildMemberStore?.getMember?.(currentGuildId, userId)?.joinedAt)
        : null;
    const joinedAt = joined != null ? new Date(joined).getTime() : NaN;

    return {
        createdAt: createdAtFromId(userId),
        username: read(() => user?.username),
        globalName: read(() => user?.globalName),
        isFriend: read(() => common.RelationshipStore?.isFriend?.(userId)),
        isBlocked: read(() => common.RelationshipStore?.isBlocked?.(userId)),
        isBot: read(() => user?.bot),
        mutualGuilds: mutualGuilds(userId),
        currentGuild: currentGuildId ? read(() => badgeOf(common.GuildStore?.getGuild?.(currentGuildId))) : null,
        joinedCurrentGuildAt: Number.isFinite(joinedAt) ? joinedAt : null
    };
}

export function guildIconUrl(guild: GuildBadge, size = 32): string | null {
    if (!guild.icon) return null;

    const animated = guild.icon.startsWith("a_");
    return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${animated ? "gif" : "webp"}?size=${size}`;
}

export function guildInitials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 3).map(word => [...word][0]).join("").toUpperCase();
}
