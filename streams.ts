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

import { ApplicationStreamingStore, ApplicationStreamPreviewStore, ChannelStore, RestAPI } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn } from "./apiHealth";
import { TtlCache } from "./cache";
import { voiceStateForUser } from "./channels";
import { T } from "./i18n";

export interface StreamRef {
    guildId: string | null;
    channelId: string;
    ownerId: string;
}

export function getStreamFor(userId: string): StreamRef | null {
    const state = voiceStateForUser(userId);

    if (!state?.channelId || !state.selfStream) return null;

    try {
        const stream = (ApplicationStreamingStore as any)?.getAnyStreamForUser?.(userId);
        if (stream?.channelId === state.channelId) return stream;
    } catch {
    }

    const channel = ChannelStore.getChannel(state.channelId) as any;
    return { guildId: channel?.guild_id ?? null, channelId: state.channelId, ownerId: userId };
}

function streamKeyOf(stream: StreamRef): string {
    return stream.guildId
        ? `guild:${stream.guildId}:${stream.channelId}:${stream.ownerId}`
        : `call:${stream.channelId}:${stream.ownerId}`;
}

const PREVIEW_CACHE_MS = 60_000;
const PREVIEW_MISS_CACHE_MS = 30_000;
const PREVIEW_MAX_ENTRIES = 64;
const previewCache = new TtlCache<string | null>(PREVIEW_CACHE_MS, PREVIEW_MAX_ENTRIES);

export async function getStreamPreviewUrl(stream: StreamRef): Promise<string | null> {
    const store = ApplicationStreamPreviewStore as any;
    const cacheKey = streamKeyOf(stream);

    const cached = previewCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const remember = (url: string | null) =>
        previewCache.set(cacheKey, url, url ? PREVIEW_CACHE_MS : PREVIEW_MISS_CACHE_MS);

    try {
        const url = await store?.getPreviewURL?.(stream.guildId, stream.channelId, stream.ownerId);
        if (url) return remember(url);
    } catch {
    }

    try {
        const url = await store?.getPreviewURLForStreamKey?.(cacheKey);
        if (url) return remember(url);
    } catch {
    }

    try {
        const { body } = await RestAPI.get({ url: `/streams/${encodeURIComponent(cacheKey)}/preview` });
        return remember((body as any)?.url ?? null);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not load stream preview:", error);
        return remember(null);
    }
}

export function resetStreamCache(): void {
    previewCache.clear();
}

export function streamProblems(): ApiHealth {
    return new HealthReport()
        .nice(() => isFn((ApplicationStreamPreviewStore as any)?.getPreviewURL), T.apiStreamPreviews);
}
