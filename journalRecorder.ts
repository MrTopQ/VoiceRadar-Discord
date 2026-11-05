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

import { ChannelStore } from "@webpack/common";

import { channelLabel, getChannelInfo, getChannelParticipantIds, getMyChannelId, voiceStateForUser } from "./channels";
import { isWatchingVoiceOf } from "./guildSubscriptions";
import { deviceNote } from "./presence";
import { getLatestSighting, placeAfter, recordSighting, type Sighting } from "./sightings";
import { getTrackedUser, getUsers } from "./store";
import { getWatchSpans, watchedThrough, type WatchSpan } from "./watchLog";

/** How many of the others in the channel a line names, the count says the rest. */
const COMPANIONS_KEPT = 8;

/** A find this soon after the watch began again was made on coming back. */
const RETURN_WINDOW_MS = 2 * 60_000;

const STREAM = 1;
const VIDEO = 2;

export const mediaOf = (state: any): number => (state?.selfStream ? STREAM : 0) | (state?.selfVideo ? VIDEO : 0);

function companions(channelId: string, userId: string): Pick<Sighting, "with" | "withCount" | "devices"> {
    const others = getChannelParticipantIds(channelId).filter(id => id !== userId);
    const named = others.slice(0, COMPANIONS_KEPT);
    const devices = [userId, ...named].map(deviceNote);

    return {
        with: named,
        ...(others.length > named.length ? { withCount: others.length } : {}),
        ...(devices.some(Boolean) ? { devices } : {})
    };
}

function where(channelId: string): Pick<Sighting, "channelId" | "channelLabel" | "withYou"> {
    return { channelId, channelLabel: channelLabel(getChannelInfo(channelId)), withYou: channelId === getMyChannelId() };
}

/** Discord hands an event over a little after it happens, more so while busy. */
const DELIVERY_MARGIN_MS = 5000;

/**
 * Events Discord replays after a dropped connection arrive late, so such a line keeps the moment it
 * surely came after: the last live event, or the person's own previous line when that is later.
 */
function lateBound(userId: string, after: number | undefined): Pick<Sighting, "after"> {
    if (after == null) return {};
    return { after: Math.max(after, getLatestSighting(userId)?.at ?? 0) - DELIVERY_MARGIN_MS };
}

export function noteSighting(userId: string, from: string | null, to: string | null, after?: number) {
    if (!getTrackedUser(userId)) return;

    const channelId = to ?? from;
    if (!channelId) return;

    try {
        recordSighting(userId, {
            kind: !to ? "left" : from ? "moved" : "joined",
            ...where(channelId),
            ...companions(channelId, userId),
            ...(to && from && from === getMyChannelId() ? { fromYou: true } : {}),
            ...(to && from ? { fromId: from, fromLabel: channelLabel(getChannelInfo(from)) } : {}),
            ...lateBound(userId, after)
        });
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not note a sighting:", error);
    }
}

/** Your own move goes into the journal of everybody on the list who sits in that channel. */
export function noteMySighting(myId: string, from: string | null, to: string | null, after?: number) {
    const record = (channelId: string, kind: "you-joined" | "you-left") => {
        const label = channelLabel(getChannelInfo(channelId));

        for (const userId of getChannelParticipantIds(channelId)) {
            if (userId === myId || !getTrackedUser(userId)) continue;
            recordSighting(userId, {
                kind,
                channelId,
                channelLabel: label,
                withYou: kind === "you-joined",
                ...companions(channelId, userId),
                ...lateBound(userId, after)
            });
        }
    };

    try {
        if (from) record(from, "you-left");
        if (to) record(to, "you-joined");
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not note your own move:", error);
    }
}

/** A stream or a camera going on or off inside the same channel. */
export function noteMediaChange(userId: string, channelId: string, before: number, after: number, late?: number) {
    if (before === after || !getTrackedUser(userId)) return;

    try {
        const base = { ...where(channelId), ...companions(channelId, userId), ...lateBound(userId, late) };
        if ((before ^ after) & STREAM) recordSighting(userId, { kind: after & STREAM ? "stream-on" : "stream-off", ...base });
        if ((before ^ after) & VIDEO) recordSighting(userId, { kind: after & VIDEO ? "video-on" : "video-off", ...base });
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not note a stream or camera change:", error);
    }
}

/** Only a server whose voice changes keep arriving proves that somebody missing from it really left. */
function absenceIsReal(channelId: string): boolean {
    const guildId = (ChannelStore.getChannel(channelId) as any)?.guild_id;
    return typeof guildId === "string" && isWatchingVoiceOf(guildId);
}

/** The last moment the person was surely still in the channel, from their line or from sitting with you. */
function lastSeenIn(userId: string, channelId: string, last: Sighting): number {
    const user = getTrackedUser(userId);
    const together = user?.sharedVoice && user.lastChannelId === channelId ? user.lastSeen : 0;
    return Math.max(last.at, together);
}

function checkPerson(userId: string, now: number, watched: WatchSpan[], justBack: boolean) {
    const state = voiceStateForUser(userId);
    const channelId: string | null = state?.channelId ?? null;
    const last = getLatestSighting(userId);
    const place = last ? placeAfter(last) : null;
    const followed = last != null && watchedThrough(watched, last.at, now);
    const onReturn = justBack && !followed ? { onReturn: true } : {};

    if (channelId) {
        if (followed && place === channelId) return;

        recordSighting(userId, { kind: "seen", at: now, ...where(channelId), ...companions(channelId, userId), ...onReturn });
        return;
    }

    if (last && place && absenceIsReal(place)) {
        recordSighting(userId, {
            kind: "gone",
            at: now,
            after: lastSeenIn(userId, place, last),
            channelId: place,
            channelLabel: last.channelLabel,
            withYou: false,
            ...onReturn
        });
    }
}

/** Writes down what no event showed, such as somebody already in voice when Discord came up, or gone by then. */
export function checkJournal(now = Date.now()) {
    const watched = getWatchSpans(now);
    const current = watched[watched.length - 1];

    // A line outside the watch would never count as followed, and the next pass would write it again.
    if (!current || current.start > now || current.end < now) return;

    const justBack = now - current.start < RETURN_WINDOW_MS;

    for (const user of getUsers()) {
        try {
            checkPerson(user.id, now, watched, justBack);
        } catch (error) {
            console.warn("[VoiceRadar-Discord] could not check the journal of", user.id, error);
        }
    }
}
