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

/** The live stream this person is broadcasting, if any. */
export function getStreamFor(userId: string): StreamRef | null {
    const state = voiceStateForUser(userId);

    // the voice state is the only source of truth here. It carries the live flag and Discord clears
    // it the moment someone stops sharing, while the streaming store can keep a finished stream
    // around and leave a LIVE badge on somebody who is done
    if (!state?.channelId || !state.selfStream) return null;

    // the store's object is preferred when it agrees, since it already carries the right guild
    try {
        const stream = (ApplicationStreamingStore as any)?.getAnyStreamForUser?.(userId);
        if (stream?.channelId === state.channelId) return stream;
    } catch {
        /* build the reference ourselves */
    }

    // built by hand for streams the client never subscribed to. That is why previews used to work
    // only from inside the channel
    const channel = ChannelStore.getChannel(state.channelId) as any;
    return { guildId: channel?.guild_id ?? null, channelId: state.channelId, ownerId: userId };
}

/** Discord's own key for a stream. Guild screenshares and DM calls are encoded differently. */
function streamKeyOf(stream: StreamRef): string {
    return stream.guildId
        ? `guild:${stream.guildId}:${stream.channelId}:${stream.ownerId}`
        : `call:${stream.channelId}:${stream.ownerId}`;
}

/**
 * The streamer's client uploads a thumbnail every few minutes, so a preview exists for any live
 * stream you may watch. The store hands it over only once Discord has fetched it for you, which it
 * does for your own channel, so when it comes back empty we ask the API directly.
 */
const PREVIEW_CACHE_MS = 60_000;
const PREVIEW_MISS_CACHE_MS = 30_000;
/** Nobody hovers more than a handful of live streams inside one cache window. */
const PREVIEW_MAX_ENTRIES = 64;
const previewCache = new TtlCache<string | null>(PREVIEW_CACHE_MS, PREVIEW_MAX_ENTRIES);

export async function getStreamPreviewUrl(stream: StreamRef): Promise<string | null> {
    const store = ApplicationStreamPreviewStore as any;
    const cacheKey = streamKeyOf(stream);

    // hovering back and forth must not turn into a burst of requests. A remembered *miss* is a
    // meaningful null, so only undefined means "nothing cached".
    const cached = previewCache.get(cacheKey);
    if (cached !== undefined) return cached;

    // a miss is worth less time than a hit, the streamer may not have uploaded a frame yet
    const remember = (url: string | null) =>
        previewCache.set(cacheKey, url, url ? PREVIEW_CACHE_MS : PREVIEW_MISS_CACHE_MS);

    try {
        const url = await store?.getPreviewURL?.(stream.guildId, stream.channelId, stream.ownerId);
        if (url) return remember(url);
    } catch {
        /* try the remaining paths */
    }

    try {
        const url = await store?.getPreviewURLForStreamKey?.(cacheKey);
        if (url) return remember(url);
    } catch {
        /* try the REST call */
    }

    try {
        const { body } = await RestAPI.get({ url: `/streams/${encodeURIComponent(cacheKey)}/preview` });
        return remember((body as any)?.url ?? null);
    } catch (error) {
        // not reported as a moved API. A stream whose owner has not uploaded a frame yet answers 404,
        // which is ordinary and would otherwise light up the window every time somebody goes live
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
