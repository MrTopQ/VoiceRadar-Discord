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

const DISCORD_EPOCH_MS = 1420070400000n;

const SHOWN_MUTUAL_GUILDS = 8;

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

function mutualGuilds(userId: string): ProfileFacts["mutualGuilds"] {
    const common = Common as any;

    const fromProfile = read<any[]>(() => common.UserProfileStore?.getMutualGuilds?.(userId));
    if (Array.isArray(fromProfile)) {
        const guilds = fromProfile.map(entry => badgeOf(entry?.guild)).filter(isBadge);
        return { guilds: guilds.slice(0, SHOWN_MUTUAL_GUILDS), count: fromProfile.length, complete: true };
    }

    return read(() => {
        const guilds = Object.values<any>(common.GuildStore?.getGuilds?.() ?? {});
        const shared = guilds.filter(guild => common.GuildMemberStore?.isMember?.(guild.id, userId));

        return {
            guilds: shared.map(badgeOf).filter(isBadge).slice(0, SHOWN_MUTUAL_GUILDS),
            count: shared.length,
            complete: false
        };
    });
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
