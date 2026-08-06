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
import { getAutoJoinCooldownMs, settings } from "./settings";
import { getAutoJoinTarget, getAutoPullTarget, getTrackedUser, touchUser, touchUsers, updateLastChannel } from "./store";
import { toast, ToastType } from "./toast";

interface VoiceState {
    userId: string;
    channelId?: string | null;
    oldChannelId?: string | null;
    guildId?: string | null;
}

/** Enough to answer "is anything still arriving" in the diagnostics window. */
let startedAt = 0;
let lastEventAt = 0;
let lastNotifyAt = 0;
let announced = 0;

export function getTrackerStats() {
    return { startedAt, lastEventAt, lastNotifyAt, announced };
}

/** Our own snapshot of "who was where", because oldChannelId is not always present in the payload. */
const lastChannels = new Map<string, string | null>();
let lastAutoJoinAt = 0;

/** Safety net on top of the flux events, so the history fills even if an update is missed. */
const SWEEP_INTERVAL_MS = 8000;
let sweepInterval: ReturnType<typeof setInterval> | null = null;

/**
 * After a reconnect Discord replays the voice state of everyone at once. Without this window every
 * person already sitting in a channel would look like a fresh join, firing a burst of notifications
 * and, worse, dragging you into your auto-join target's channel.
 */
const RECONNECT_QUIET_MS = 8000;
let quietUntil = 0;

/**
 * Channel hopping used to queue one popup per hop, so you kept reading about channels the person had
 * already left. Now a join waits a moment, every further hop resets that wait, and the channel is
 * read fresh when it fires. One popup, for the place they settled in.
 */
const NOTIFY_DEBOUNCE_MS = 2500;
const pendingNotifications = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Vencord shows corner notifications one after another, each for a few seconds. A group sitting down
 * together used to become a queue marching across the screen for a minute, with the last popups
 * announcing something long past, and every one of them fired its own user lookup at once.
 *
 * Joins that land close together are collected and announced once. The window is measured from the
 * first arrival rather than reset by each new one, so a steady trickle still gets announced promptly
 * instead of being held back forever.
 */
const NOTIFY_BATCH_MS = 1200;
const MAX_NAMES_IN_SUMMARY = 3;
/** Only who to announce. Where they are is read fresh at flush time, never remembered. */
const notifyBatch = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Set by the plugin at startup. Kept as a callback rather than importing the modal, because the
 * modal already imports this file and a cycle between them is not worth a single click handler.
 */
let openJoinedList: ((userIds: string[]) => void) | null = null;

export function setJoinedListOpener(open: ((userIds: string[]) => void) | null) {
    openJoinedList = open;
}

/** Learn where everybody is before listening to changes, so nothing looks like a fresh join. */
function primeSnapshot() {
    lastChannels.clear();
    for (const [userId, channelId] of getVoiceSnapshot()) lastChannels.set(userId, channelId);
}

function handleConnectionOpen() {
    primeSnapshot();
    quietUntil = Date.now() + RECONNECT_QUIET_MS;
}

function notifyJoin(userId: string, channelId: string) {
    const name = getUserDisplayName(userId, getTrackedUser(userId)?.name ?? T.someone);
    const where = describeChannel(channelId);
    const style = settings.store.notifyStyle;

    if (style === "toast" || style === "both") {
        toast(T.notifyToast(name, where), ToastType.MESSAGE);
    }

    if (style === "notification" || style === "both") {
        showNotification({
            title: T.notifyTitle(name),
            body: where,
            icon: getAvatarUrl(userId) ?? undefined,
            // the same list a group gets, and for the same reason. A popup is easy to hit by
            // accident, and a row you can act on beats being dropped straight into a voice call
            onClick: () => openJoinedList?.([userId])
        });
    }
}

/** Announces several people at once, so a group sitting down costs one popup instead of N. */
function notifyBatchJoined(entries: [string, string][]) {
    const names = entries.map(([userId]) =>
        getUserDisplayName(userId, getTrackedUser(userId)?.name ?? T.someone));

    const shown = T.notifyBatchNames(
        names.slice(0, MAX_NAMES_IN_SUMMARY).join(", "),
        Math.max(0, names.length - MAX_NAMES_IN_SUMMARY)
    );
    const style = settings.store.notifyStyle;

    if (style === "toast" || style === "both") {
        toast(T.notifyBatchToast(shown), ToastType.MESSAGE);
    }

    if (style === "notification" || style === "both") {
        showNotification({
            title: T.notifyBatchTitle(names.length),
            body: shown,
            // no avatar and no lookups, since there is no one face to show. The radar would
            // answer "who joined" with the whole history, so the click opens just this group
            onClick: () => openJoinedList?.(entries.map(([userId]) => userId))
        });
    }
}

function flushNotifyBatch() {
    batchTimer = null;

    // where everyone is now, not where they were when the wait started. Somebody who moved on
    // during that second is still worth announcing, in the channel they settled in. Only leaving
    // voice altogether, or landing in your own channel, drops them
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
        // one person is worth their avatar, and that is the only lookup this path ever makes
        void ensureUserCachedSpaced(userId)
            .then(() => notifyJoin(userId, channelId))
            .catch(error => console.warn("[VoiceRadar-Discord] could not announce a join:", error));
        return;
    }

    notifyBatchJoined(entries);
}

/**
 * Where they are now, as far as anything here knows.
 *
 * Discord's store is asked first, and our own snapshot answers when that comes back empty. Voice
 * states of a server you have not opened this session are dropped by the client, so somebody who
 * joins one of those reads as "not in voice" a moment after the very event that said they joined,
 * and the notification about them was thrown away on that basis.
 *
 * The snapshot is safe to trust here. It is built from those same events and the leave event is what
 * empties it, so an empty answer really does mean they left.
 */
function whereIs(userId: string): string | null {
    return getVoiceInfo(userId)?.channelId ?? lastChannels.get(userId) ?? null;
}

function scheduleNotify(userId: string) {
    const pending = pendingNotifications.get(userId);
    if (pending) clearTimeout(pending);

    pendingNotifications.set(userId, setTimeout(() => {
        pendingNotifications.delete(userId);

        // read the channel now, not the one from the event that started this timer
        const channelId = whereIs(userId);
        if (!channelId) return; // they hopped out again, nothing worth announcing
        if (channelId === getMyChannelId()) return; // they came to you, you can see and hear them

        notifyBatch.add(userId);
        if (!batchTimer) batchTimer = setTimeout(flushNotifyBatch, NOTIFY_BATCH_MS);
    }, NOTIFY_DEBOUNCE_MS));
}

/**
 * The channel a follow was refused for, so the same refusal is not repeated on every tick.
 *
 * Cleared the moment the target is somewhere else, since moving is the only thing that can change
 * the answer. Without it a target sitting in a channel you have no right to connect to meant a red
 * toast every few seconds for as long as they stayed there.
 */
let refusedChannelId: string | null = null;

/**
 * The channel you walked out of while the target was still in it.
 *
 * The marker means be where they are, and reading that from the live state is what makes it work on
 * somebody who has no reason to move again. It also made leaving impossible. Stepping out of their
 * channel is a move of your own, the next tick saw them there and you not, and it put you straight
 * back. Your own leave event fires that tick, so the door shut before you were through it, and the
 * only way out was to disarm the marker.
 *
 * A departure is an answer too. It says "not this room", so the room is remembered and following
 * into it stops. It says nothing about the next one, so the moment they move anywhere else the
 * marker means what it meant before. That is the difference between following somebody and being
 * tethered to them.
 */
let declinedChannelId: string | null = null;

/**
 * Where the auto-join target is, and what it takes to be there too.
 *
 * Deliberately reads the live state rather than acting on the event that woke it. That is the same
 * choice the subscription watchdog makes, and for the same reason: an event says what happened, and
 * this needs to know what is true. Three things used to fall out of the gap between those.
 *
 * The marker used to do nothing at the moment you set it. It armed a flag and waited for the target
 * to move again, so arming it on somebody already sitting in a full channel looked like a switch
 * that did not work. The magnet has always acted at once, and this now does too.
 *
 * A queue used to belong to the channel it was started for even when auto-join started it. The
 * target moved on and the wait stayed behind, so you were queued for a room they had left, and the
 * moment a slot opened there you were taken to it. Now the wait moves with them.
 *
 * And the cooldown used to be spent on joining a queue, which costs the gateway nothing. A target
 * who hopped inside those five seconds was simply missed. Only a real connection pays it now.
 */
export function keepFollowing() {
    const target = getAutoJoinTarget();

    if (!target || !settings.store.autoJoinEnabled) {
        dropFollowQueue(queue => T.queueFollowStopped(queue.channelLabel));
        return;
    }

    /*
     * Right after a reconnect Discord replays where everybody already was. Acting on that would
     * drag you into the target's channel on the strength of an event that reports no movement at
     * all, which is the whole reason the quiet window exists.
     */
    if (Date.now() < quietUntil) return;

    const where = getVoiceInfo(target.id);
    const name = getUserDisplayName(target.id, target.name);

    // out of voice altogether, so there is no slot left worth holding
    if (!where) {
        refusedChannelId = null;
        declinedChannelId = null;
        dropFollowQueue(queue => T.queueFollowGone(name, queue.channelLabel));
        return;
    }

    // they are somewhere else now, so whatever was refused about the last channel says nothing
    if (refusedChannelId !== where.channelId) refusedChannelId = null;

    /*
     * And neither does your having left it. Moving is what makes the marker mean something again,
     * so a target who goes anywhere else is followed exactly as before.
     */
    if (declinedChannelId !== where.channelId) declinedChannelId = null;

    /*
     * You are not in their room because you chose not to be. Checked before everything below,
     * including the wait for a full one, since a queue that survives your leaving would take you
     * back the moment a slot opened and undo the same decision a step later.
     */
    if (declinedChannelId === where.channelId) {
        dropFollowQueue();
        return;
    }

    const myChannelId = getMyChannelId();

    // already with them, which is the whole point of the marker
    if (where.channelId === myChannelId) {
        dropFollowQueue();
        return;
    }

    // opt-in guard against being yanked out of a call you are already in
    if (settings.store.autoJoinOnlyWhenIdle && myChannelId) return;

    // a full channel is no failure. Hold a spot and take the first one that frees up, and hold it
    // for where they are now rather than for wherever they were when the wait began
    if (where.isFull) {
        // no point waiting for a room that would refuse us at the door anyway
        if (!settings.store.queueForFullChannels || !where.canJoin) return;

        // deliberately outside the cooldown. Pointing a wait somewhere is not a connection and
        // costs the gateway nothing, and falling one hop behind is the thing this exists to stop
        queueForChannel(where.channelId, false, target.id);
        return;
    }

    // an open channel, so there is nothing left to wait for
    dropFollowQueue();

    if (refusedChannelId === where.channelId) return;

    // a join refused for timing alone leaves the cooldown unspent. It says nothing about this
    // channel, and burning five seconds on it would skip the target's next hop
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

/**
 * Drops a wait that only existed to follow somebody. One you started by hand is left exactly where
 * it is, because that one was never about them.
 *
 * @param reason built from the entry, so the message can name the channel being given up on, and
 * so nothing is built at all when there is no such queue.
 */
function dropFollowQueue(reason?: (queue: QueueEntry) => string) {
    const queue = getQueueEntry();
    if (!queue?.followingUserId) return;

    cancelQueue(reason?.(queue));
}

/** The magnet. They get dragged back every time they show up elsewhere, until you stop it. */
function tryAutoPull(userId: string, channelId: string) {
    const myChannelId = getMyChannelId();
    if (!myChannelId || channelId === myChannelId) return;

    keepUserHere(userId);
}

/** Everyone sharing a voice channel with us goes into the history, in one batched update. */
function rememberChannelMates(channelId: string) {
    const me = UserStore.getCurrentUser();
    if (!me) return;

    const info = getChannelInfo(channelId);
    const label = channelLabel(info);

    touchUsers(
        info.participantIds
            .filter(participantId => participantId !== me.id)
            .map(participantId => ({
                // getStoredName, not the display one, because this goes into the saved list and
                // a translated placeholder would overwrite a name we already knew
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

    // strangers moving around other servers are none of our business, so bail before the
    // permission checks and member scan that describing a channel costs
    if (!tracked && channelId !== myChannelId) return;

    const label = channelLabel(getChannelInfo(channelId));

    // both of these persist the name, so neither may use the translated placeholder
    if (channelId === myChannelId) {
        touchUser(userId, getStoredName(userId), channelId, label);
    } else {
        updateLastChannel(userId, getStoredName(userId), channelId, label);
    }

    if (!tracked) return;

    // right after a reconnect these are replays, not real joins
    if (Date.now() < quietUntil) return;

    if (tracked.notify) scheduleNotify(userId);

    // auto-join is deliberately not answered from here. It is decided once per batch, from where
    // the target actually is, rather than per event. See keepFollowing
    if (tracked.autoPull) tryAutoPull(userId, channelId);
}

/**
 * Forgets both of the answers that hold a follow back, because setting the marker outranks them.
 *
 * Each of them exists to keep a decision from being asked again every few seconds, and neither is
 * meant to survive the reader saying "take me to this person" out loud. Arming on somebody whose
 * room you walked out of ten seconds ago is the plainest case: you have changed your mind, and the
 * click is how you said so.
 */
export function forgetFollowRefusals() {
    refusedChannelId = null;
    declinedChannelId = null;
}

/**
 * Notices that you have just walked out on the target.
 *
 * Answered from where you came *from* rather than from where they are now, and the difference is
 * the whole of it. "I am not with them" is true of every moment before the marker has caught up,
 * and reading that as a decision would stop a follow that had simply not happened yet. "I was with
 * them and now I am not" cannot be anything else.
 *
 * Leaving voice and stepping into another channel are the same answer, so both count. Being moved
 * out by a moderator counts too, and deliberately so: putting yourself straight back would be
 * arguing with them several times a minute.
 */
function noteMyMove(from: string | null, to: string | null) {
    const target = getAutoJoinTarget();
    if (!target) return;

    const theirs = getVoiceInfo(target.id)?.channelId ?? null;
    if (!theirs) return;

    if (from === theirs && to !== theirs) declinedChannelId = theirs;
}

function handleVoiceStateUpdates(event: { voiceStates: VoiceState[]; }) {
    try {
        processVoiceStates(event);
    } catch (error) {
        console.error("[VoiceRadar-Discord] voice state handler failed:", error);
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

        // people who left are dropped from the snapshot, otherwise it grows for the whole session
        if (channelId) lastChannels.set(userId, channelId);
        else lastChannels.delete(userId);

        // mute, deafen and video updates fire here too, only channel changes matter
        if (channelId === knownOld) continue;

        if (userId === me.id) {
            noteMyMove(knownOld, channelId);

            if (channelId) {
                rememberChannelMates(channelId);
                // you moved, so whoever is on the magnet comes with you
                const held = getAutoPullTarget();
                if (held) keepUserHere(held.id);
            }
            continue;
        }

        // on leave nothing is written. The stored channel stays as the "last seen in" hint, and
        // whether they are in voice right now is read live from the store, not from here
        if (channelId) handleUserJoined(userId, channelId);
    }

    // somebody just moved, which is exactly when a slot in a full channel can appear
    checkQueue();
    // once per batch rather than once per event, and from where the target is rather than from
    // what any one of these said. See keepFollowing
    keepFollowing();
    // and exactly when an undo can stop making sense, because they walked off on their own
    pruneMoveHistory();
}

/** Records everyone in your current voice channel. Safe to call at any time. */
export function sweepCurrentChannel() {
    try {
        const myChannelId = getMyChannelId();
        if (myChannelId) rememberChannelMates(myChannelId);
    } catch (error) {
        console.error("[VoiceRadar-Discord] channel sweep failed:", error);
    }

    /*
     * Voice events are the fast path for both of these. This one is the backstop, and the reason
     * it matters is that a voice event is not the only way to end up behind the target. Their
     * server may not have been subscribed to yet, the batch may have been missed, or the marker
     * may have been set on somebody who was already sitting in a full channel and had no reason
     * to move again. Reading where they actually are, every few seconds, answers all three.
     */
    try {
        checkQueue();
        keepFollowing();
        pruneMoveHistory();
    } catch (error) {
        console.error("[VoiceRadar-Discord] queue check failed:", error);
    }
}

export function startTracking() {
    // starting twice would double every subscription and orphan the previous interval. Deliberately
    // not stopTracking(), which also drops the joined-list opener that the plugin installs first
    teardownTracking();

    primeSnapshot();
    startedAt = Date.now();
    quietUntil = Date.now() + RECONNECT_QUIET_MS;

    FluxDispatcher.subscribe("VOICE_STATE_UPDATES", handleVoiceStateUpdates);
    FluxDispatcher.subscribe("CONNECTION_OPEN", handleConnectionOpen);

    sweepCurrentChannel();
    sweepInterval = setInterval(sweepCurrentChannel, SWEEP_INTERVAL_MS);
}

/** Everything a restart has to undo. The subscriptions, the timers, the remembered state. */
function teardownTracking() {
    FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", handleVoiceStateUpdates);
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", handleConnectionOpen);

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

    // both of these are answers about one channel in one session, and neither is worth carrying
    // into the next one
    refusedChannelId = null;
    declinedChannelId = null;

    /*
     * The counters above the window reads are about a session, and startTracking already gives
     * startedAt a fresh one. Leaving the other three behind put a count of announcements and the
     * time of an event from the previous session next to a start time from this one, so a plugin
     * switched off and on again claimed to have announced things it had not, and the row that says
     * whether voice events are still arriving answered for a connection that no longer existed.
     */
    startedAt = 0;
    lastEventAt = 0;
    lastNotifyAt = 0;
    announced = 0;
}

export function stopTracking() {
    teardownTracking();

    // a popup still on screen must not be able to open a window belonging to a stopped plugin
    openJoinedList = null;
}

/**
 * The one subscription everything else here is built on.
 *
 * Nothing in this plugin polls Discord for who moved. It is told, through these two calls, and if
 * they are gone the list never grows, no join is ever announced, and neither auto-join nor the
 * magnet nor the slot queue can fire. The sweep on its timer keeps the history of your own channel
 * alive and that is all, so the failure looks like a plugin that works while you are sitting in
 * voice and ignores the rest of Discord.
 */
export function trackerProblems(): ApiHealth {
    return new HealthReport()
        .vital(
            () => isFn((FluxDispatcher as any)?.subscribe) && isFn((FluxDispatcher as any)?.unsubscribe),
            T.apiVoiceEvents
        );
}

