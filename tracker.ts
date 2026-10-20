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

import { showNotification } from "@api/Notifications";
import { FluxDispatcher, UserStore } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn } from "./apiHealth";
import {
    channelLabel,
    describeChannel,
    getChannelInfo,
    getMyChannelId,
    getVoiceInfo,
    getVoiceSnapshot
} from "./channels";
import { T } from "./i18n";
import { joinVoiceChannel } from "./join";
import { keepUserHere } from "./magnet";
import { pruneMoveHistory } from "./moveHistory";
import { ensureUserCachedSpaced, getAvatarUrl, getStoredName, getUserDisplayName } from "./names";
import { cancelQueue, checkQueue, getQueueEntry, type QueueEntry, queueForChannel } from "./queue";
import {
    canTellMyMovesApart,
    isMyMoveInFlight,
    startWatchingMyChoices,
    stopWatchingMyChoices,
    wasMyOwnDoing
} from "./selfMoves";
import { getAutoJoinCooldownMs, settings } from "./settings";
import { recordSighting } from "./sightings";
import { playJoinSound } from "./sound";
import { watchVoiceState } from "./stickyMute";
import {
    clearAutoJoin,
    getAutoJoinTarget,
    getAutoPullTarget,
    getTrackedUser,
    touchUser,
    touchUsers,
    updateLastChannel
} from "./store";
import { toast, ToastType } from "./toast";

interface VoiceState {
    userId: string;
    channelId?: string | null;
    oldChannelId?: string | null;
    guildId?: string | null;
}

let startedAt = 0;
let lastEventAt = 0;
let lastNotifyAt = 0;
let announced = 0;

export function getTrackerStats() {
    return { startedAt, lastEventAt, lastNotifyAt, announced };
}

/** oldChannelId is not always in the payload, so we keep our own copy. */
const lastChannels = new Map<string, string | null>();
let lastAutoJoinAt = 0;

let myLastChannelId: string | null = null;

/** Backup sweep in case a voice event is missed. */
const SWEEP_INTERVAL_MS = 8000;
let sweepInterval: ReturnType<typeof setInterval> | null = null;

/** Discord replays every voice state after a reconnect, so changes in this window are not real. */
const RECONNECT_QUIET_MS = 8000;
let quietUntil = 0;

/** Hops within this time count as one join. */
const NOTIFY_DEBOUNCE_MS = 2500;
const pendingNotifications = new Map<string, ReturnType<typeof setTimeout>>();

/** Joins within this time share one popup. */
const NOTIFY_BATCH_MS = 1200;
const MAX_NAMES_IN_SUMMARY = 3;
const notifyBatch = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

let openJoinedList: ((userIds: string[]) => void) | null = null;

export function setJoinedListOpener(open: ((userIds: string[]) => void) | null) {
    openJoinedList = open;
}

/** Read where everybody is first, so nobody looks like a fresh join. */
function primeSnapshot() {
    lastChannels.clear();
    for (const [userId, channelId] of getVoiceSnapshot()) lastChannels.set(userId, channelId);

    myLastChannelId = getMyChannelId();
}

function handleConnectionOpen() {
    primeSnapshot();
    quietUntil = Date.now() + RECONNECT_QUIET_MS;
}

function notifyJoin(userId: string, channelId: string) {
    const name = getUserDisplayName(userId, getTrackedUser(userId)?.name ?? T.someone);
    const where = describeChannel(channelId);
    const style = settings.store.notifyStyle;

    playJoinSound();

    if (style === "toast" || style === "both") {
        toast(T.notifyToast(name, where), ToastType.MESSAGE);
    }

    if (style === "notification" || style === "both") {
        showNotification({
            title: T.notifyTitle(name),
            body: where,
            icon: getAvatarUrl(userId) ?? undefined,
            onClick: () => openJoinedList?.([userId])
        });
    }
}

function notifyBatchJoined(entries: [string, string][]) {
    const names = entries.map(([userId]) =>
        getUserDisplayName(userId, getTrackedUser(userId)?.name ?? T.someone));

    const shown = T.notifyBatchNames(
        names.slice(0, MAX_NAMES_IN_SUMMARY).join(", "),
        Math.max(0, names.length - MAX_NAMES_IN_SUMMARY)
    );
    const style = settings.store.notifyStyle;

    playJoinSound();

    if (style === "toast" || style === "both") {
        toast(T.notifyBatchToast(shown), ToastType.MESSAGE);
    }

    if (style === "notification" || style === "both") {
        showNotification({
            title: T.notifyBatchTitle(names.length),
            body: shown,
            onClick: () => openJoinedList?.(entries.map(([userId]) => userId))
        });
    }
}

function flushNotifyBatch() {
    batchTimer = null;

    const entries: [string, string][] = [];

    for (const userId of notifyBatch) {
        const channelId = whereIs(userId);
        if (!channelId || channelId === getMyChannelId()) continue;
        entries.push([userId, channelId]);
    }

    notifyBatch.clear();

    if (!entries.length) return;

    announced += entries.length;
    lastNotifyAt = Date.now();

    if (entries.length === 1) {
        const [userId, channelId] = entries[0];
        void ensureUserCachedSpaced(userId)
            .then(() => notifyJoin(userId, channelId))
            .catch(error => console.warn("[VoiceRadar-Discord] could not announce a join:", error));
        return;
    }

    notifyBatchJoined(entries);
}

function whereIs(userId: string): string | null {
    return getVoiceInfo(userId)?.channelId ?? lastChannels.get(userId) ?? null;
}

function scheduleNotify(userId: string) {
    const pending = pendingNotifications.get(userId);
    if (pending) clearTimeout(pending);

    pendingNotifications.set(userId, setTimeout(() => {
        pendingNotifications.delete(userId);

        const channelId = whereIs(userId);
        if (!channelId) return;
        if (channelId === getMyChannelId()) return;

        notifyBatch.add(userId);
        if (!batchTimer) batchTimer = setTimeout(flushNotifyBatch, NOTIFY_BATCH_MS);
    }, NOTIFY_DEBOUNCE_MS));
}

let refusedChannelId: string | null = null;

/** The channel you walked out of while the target stayed in it. */
let declinedChannelId: string | null = null;

/** Window for counting how often a forced move was undone. */
const FORCED_RETURN_WINDOW_MS = 60_000;
const MAX_FORCED_RETURNS = 6;
let forcedReturns: number[] = [];

function isBeingRemovedTooOften(): boolean {
    forcedReturns = forcedReturns.filter(at => Date.now() - at < FORCED_RETURN_WINDOW_MS);
    return forcedReturns.length >= MAX_FORCED_RETURNS;
}

export function keepFollowing() {
    noteMyMove();

    const target = getAutoJoinTarget();

    if (!target) {
        dropFollowQueue(queue => T.queueFollowStopped(queue.channelLabel));
        return;
    }

    if (Date.now() < quietUntil) return;

    const where = getVoiceInfo(target.id);
    const name = getUserDisplayName(target.id, target.name);

    if (!where) {
        refusedChannelId = null;
        dropFollowQueue(queue => T.queueFollowGone(name, queue.channelLabel));
        return;
    }

    if (refusedChannelId !== where.channelId) refusedChannelId = null;

    if (declinedChannelId !== where.channelId) declinedChannelId = null;

    const myChannelId = getMyChannelId();

    if (where.channelId === myChannelId) {
        declinedChannelId = null;
        dropFollowQueue();
        return;
    }

    if (declinedChannelId === where.channelId) {
        dropFollowQueue();
        return;
    }

    if (settings.store.autoJoinOnlyWhenIdle && myChannelId) return;

    if (where.isFull) {
        if (!settings.store.queueForFullChannels || !where.canJoin) return;

        queueForChannel(where.channelId, false, target.id);
        return;
    }

    dropFollowQueue();

    if (refusedChannelId === where.channelId) return;

    if (Date.now() - lastAutoJoinAt < getAutoJoinCooldownMs()) return;

    const result = joinVoiceChannel(where.channelId);
    if (result === "busy") return;

    lastAutoJoinAt = Date.now();

    if (result === "refused") {
        refusedChannelId = where.channelId;
        return;
    }

    toast(
        T.followingUser(name, channelLabel(where), !!settings.store.silentJoin),
        ToastType.SUCCESS
    );
}

function dropFollowQueue(reason?: (queue: QueueEntry) => string) {
    const queue = getQueueEntry();
    if (!queue?.followingUserId) return;

    cancelQueue(reason?.(queue));
}

function tryAutoPull(userId: string, channelId: string) {
    const myChannelId = getMyChannelId();
    if (!myChannelId || channelId === myChannelId) return;

    keepUserHere(userId);
}

function rememberChannelMates(channelId: string) {
    const me = UserStore.getCurrentUser();
    if (!me) return;

    const info = getChannelInfo(channelId);
    const label = channelLabel(info);

    touchUsers(
        info.participantIds
            .filter(participantId => participantId !== me.id)
            .map(participantId => ({
                // Use the stored name, a translated placeholder must not be saved.
                id: participantId,
                name: getStoredName(participantId),
                channelId,
                channelName: label
            }))
    );
}

function handleUserJoined(userId: string, channelId: string) {
    const tracked = getTrackedUser(userId);
    const myChannelId = getMyChannelId();

    if (!tracked && channelId !== myChannelId) return;

    const label = channelLabel(getChannelInfo(channelId));

    if (channelId === myChannelId) {
        touchUser(userId, getStoredName(userId), channelId, label);
    } else {
        updateLastChannel(userId, getStoredName(userId), channelId, label);
    }

    if (!tracked) return;

    if (Date.now() < quietUntil) return;

    if (tracked.notify) scheduleNotify(userId);

    if (tracked.autoPull) tryAutoPull(userId, channelId);
}

export function forgetFollowRefusals() {
    refusedChannelId = null;
    declinedChannelId = null;

    forcedReturns = [];
}

function noteMyMove() {
    const to = getMyChannelId();
    if (to === myLastChannelId) return;

    // Mid server switch the old state arrives before the new one.
    if (!to && isMyMoveInFlight()) return;

    const from = myLastChannelId;
    myLastChannelId = to;

    const target = getAutoJoinTarget();
    if (!target) return;

    const theirs = whereIs(target.id);
    if (!theirs) return;

    // A move we cannot explain is treated as yours.
    if (wasMyOwnDoing(to) || !canTellMyMovesApart()) {
        if (!to) {
            declinedChannelId = theirs;
            dropFollowQueue();
            return;
        }

        // Only leaving the target's channel counts as declining it.
        if (from === theirs && to !== theirs) declinedChannelId = theirs;
        return;
    }

    if (Date.now() < quietUntil) return;

    if (from !== theirs || to === theirs) return;

    if (isBeingRemovedTooOften()) {
        clearAutoJoin();
        dropFollowQueue();
        toast(T.followGaveUpBeingRemoved(getUserDisplayName(target.id, target.name)), ToastType.FAILURE);
        return;
    }

    forcedReturns.push(Date.now());

    lastAutoJoinAt = 0;
}

function handleVoiceStateUpdates(event: { voiceStates: VoiceState[]; }) {
    try {
        processVoiceStates(event);
    } catch (error) {
        console.error("[VoiceRadar-Discord] voice state handler failed:", error);
    }
}

function noteSighting(userId: string, from: string | null, to: string | null) {
    if (Date.now() < quietUntil) return;
    if (!getTrackedUser(userId)) return;

    const channelId = to ?? from;
    if (!channelId) return;

    try {
        recordSighting(userId, {
            kind: !to ? "left" : from ? "moved" : "joined",
            channelId,
            channelLabel: channelLabel(getChannelInfo(channelId)),
            withYou: channelId === getMyChannelId()
        });
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not note a sighting:", error);
    }
}

function processVoiceStates({ voiceStates }: { voiceStates: VoiceState[]; }) {
    lastEventAt = Date.now();

    const me = UserStore.getCurrentUser();
    if (!me || !Array.isArray(voiceStates)) return;

    for (const state of voiceStates) {
        const { userId } = state;
        if (!userId) continue;

        const channelId = state.channelId ?? null;
        const knownOld = lastChannels.has(userId) ? lastChannels.get(userId)! : state.oldChannelId ?? null;

        if (channelId) lastChannels.set(userId, channelId);
        else lastChannels.delete(userId);

        if (userId !== me.id) watchVoiceState(userId, channelId);

        // Mute, deafen and video changes also land here.
        if (channelId === knownOld) continue;

        if (userId !== me.id) noteSighting(userId, knownOld, channelId);

        if (userId === me.id) {
            if (channelId) {
                rememberChannelMates(channelId);
                const held = getAutoPullTarget();
                if (held) keepUserHere(held.id);
            }
            continue;
        }

        if (channelId) handleUserJoined(userId, channelId);
    }

    noteMyMove();
    checkQueue();
    keepFollowing();
    pruneMoveHistory();
}

export function sweepCurrentChannel() {
    try {
        const myChannelId = getMyChannelId();
        if (myChannelId) rememberChannelMates(myChannelId);
    } catch (error) {
        console.error("[VoiceRadar-Discord] channel sweep failed:", error);
    }

    try {
        checkQueue();
        keepFollowing();
        pruneMoveHistory();
    } catch (error) {
        console.error("[VoiceRadar-Discord] queue check failed:", error);
    }
}

export function startTracking() {
    teardownTracking();

    primeSnapshot();
    startedAt = Date.now();
    quietUntil = Date.now() + RECONNECT_QUIET_MS;

    FluxDispatcher.subscribe("VOICE_STATE_UPDATES", handleVoiceStateUpdates);
    FluxDispatcher.subscribe("CONNECTION_OPEN", handleConnectionOpen);
    startWatchingMyChoices();

    sweepCurrentChannel();
    sweepInterval = setInterval(sweepCurrentChannel, SWEEP_INTERVAL_MS);
}

function teardownTracking() {
    FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", handleVoiceStateUpdates);
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", handleConnectionOpen);
    stopWatchingMyChoices();

    if (sweepInterval) {
        clearInterval(sweepInterval);
        sweepInterval = null;
    }

    pendingNotifications.forEach(timeout => clearTimeout(timeout));
    pendingNotifications.clear();

    if (batchTimer) {
        clearTimeout(batchTimer);
        batchTimer = null;
    }
    notifyBatch.clear();

    lastChannels.clear();
    lastAutoJoinAt = 0;
    quietUntil = 0;
    myLastChannelId = null;

    refusedChannelId = null;
    declinedChannelId = null;

    forcedReturns = [];

    startedAt = 0;
    lastEventAt = 0;
    lastNotifyAt = 0;
    announced = 0;
}

export function stopTracking() {
    teardownTracking();

    openJoinedList = null;
}

export function trackerProblems(): ApiHealth {
    return new HealthReport()
        .vital(
            () => isFn((FluxDispatcher as any)?.subscribe) && isFn((FluxDispatcher as any)?.unsubscribe),
            T.apiVoiceEvents
        );
}

