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

import { TtlCache } from "./cache";
import { getVoiceSnapshot } from "./channels";
import { normalizeSearch } from "./names";

export const MIN_QUERY_LENGTH = 2;
export const MAX_MATCHES = 20;

/** Typing reuses one look at every voice channel instead of building it again on each key. */
const INDEX_TTL_MS = 2000;

const ID_PATTERN = /^\d{15,22}$/;

export interface VoiceMatch {
    userId: string;
    channelId: string;
    guildId: string | null;
    name: string;
}

export interface VoiceSearchResult {
    matches: VoiceMatch[];
    more: number;
    tooShort: boolean;
}

interface Entry extends VoiceMatch {
    words: string[];
    text: string;
}

const indexCache = new TtlCache<Entry[]>(INDEX_TTL_MS, 1);

function read<T>(get: () => T | null | undefined): T | null {
    try {
        return get() ?? null;
    } catch {
        return null;
    }
}

function entryFor(userId: string, channelId: string): Entry {
    const common = Common as any;
    const guildId = read<string>(() => common.ChannelStore?.getChannel?.(channelId)?.guild_id);
    const user = read<any>(() => common.UserStore?.getUser?.(userId));

    const names = [
        guildId ? read<string>(() => common.GuildMemberStore?.getNick?.(guildId, userId)) : null,
        read<string>(() => common.RelationshipStore?.getNickname?.(userId)),
        user?.globalName,
        user?.username
    ].filter((name): name is string => typeof name === "string" && name.length > 0);

    const text = normalizeSearch(names.join(" "));
    return { userId, channelId, guildId, name: names[0] ?? userId, words: text.split(/\s+/), text };
}

function voiceIndex(): Entry[] {
    const cached = indexCache.get("all");
    if (cached) return cached;

    const entries = [...getVoiceSnapshot()].map(([userId, channelId]) => entryFor(userId, channelId));
    return indexCache.set("all", entries);
}

/** Everybody in voice on the watched servers whose name or ID fits, apart from the people already on screen. */
export function findInVoice(query: string, skip: ReadonlySet<string>): VoiceSearchResult {
    const needle = normalizeSearch(query.trim());
    if (needle.length < MIN_QUERY_LENGTH) return { matches: [], more: 0, tooShort: true };

    const me = read<string>(() => (Common as any).UserStore?.getCurrentUser?.()?.id);
    const fits = ID_PATTERN.test(needle)
        ? (entry: Entry) => entry.userId === needle
        : (entry: Entry) => entry.text.includes(needle);

    const startsAWord = (entry: Entry) => entry.words.some(word => word.startsWith(needle));

    const found = voiceIndex()
        .filter(entry => entry.userId !== me && !skip.has(entry.userId) && fits(entry))
        .sort((a, b) => Number(startsAWord(b)) - Number(startsAWord(a)) || a.name.localeCompare(b.name));

    return {
        matches: found.slice(0, MAX_MATCHES).map(({ userId, channelId, guildId, name }) => ({ userId, channelId, guildId, name })),
        more: Math.max(0, found.length - MAX_MATCHES),
        tooShort: false
    };
}

export function forgetVoiceSearch() {
    indexCache.clear();
}
