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

import { channelLabel, getChannelInfo, getMyChannelId } from "./channels";
import { T } from "./i18n";
import { joinVoiceChannel } from "./join";
import { getUserDisplayName } from "./names";
import { clearAutoJoin, getAutoJoinTarget } from "./store";
import { toast, ToastType } from "./toast";

/**
 * Connecting takes a moment, and meanwhile every voice event from every server runs the queue again.
 * A stranger unmuting three servers away is enough. Without this the free slot would be asked for
 * over and over until the connection landed, a burst no human could produce.
 *
 * It costs nothing, because the connection is slower than the wait anyway.
 */
const JOIN_RETRY_COOLDOWN_MS = 2000;

/**
 * A queue you started by hand is about the channel, not about whoever made you want it. Two things
 * end it. You get into that channel, or you cancel it. Connecting somewhere else meanwhile does not.
 *
 * One auto-join started is the other thing entirely, and `followingUserId` is what tells them apart.
 * That one is about the person: it moves to whatever full channel they move to, and it goes when
 * they leave voice, because a wait for a channel they have walked out of would take you to the one
 * place they are not.
 */
export interface QueueEntry {
    channelId: string;
    channelLabel: string;
    /** whose channel this is a wait for, or null when you asked for the channel yourself */
    followingUserId: string | null;
}

let entry: QueueEntry | null = null;
let lastAttemptAt = 0;

/**
 * How many times the queue may ask for a channel that looks open before it stops asking.
 *
 * The wait itself has no deadline, and that is right: a busy channel can be full for an hour and
 * the queue costs nothing while it is. What is counted here is the other thing entirely, a channel
 * that reads as open and joinable while the connection never lands. Every check used to answer that
 * by asking Discord to connect again, every two seconds, for as long as the queue stood.
 *
 * That is the shape of a client stuck on "connecting to RTC", and asking it to select the same
 * voice channel again thirty times a minute is the least helpful thing to do to one. Nothing here
 * can see the connection fail, since the client never says so, but a channel that stays open while
 * we stay out of it is the same evidence read from the outside.
 */
const MAX_ATTEMPTS = 8;
let attempts = 0;
const listeners = new Set<() => void>();

export function subscribeToQueue(listener: () => void): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

function emit() {
    listeners.forEach(listener => {
        try {
            listener();
        } catch (error) {
            console.error("[VoiceRadar-Discord] queue listener failed:", error);
        }
    });
}

export function getQueueEntry(): QueueEntry | null {
    return entry;
}

export function isQueuedFor(channelId: string): boolean {
    return entry?.channelId === channelId;
}

/**
 * @param stopFollowing set when you asked for the queue yourself. Following someone else at the same
 * time would drag you out of the lobby a second before your slot opens. Auto-join passes false,
 * because the queue is for its own target's channel and there is nothing to switch off.
 * @param followingUserId set by auto-join, and what makes this a wait for a person rather than for
 * a channel. See QueueEntry.
 */
export function queueForChannel(channelId: string, stopFollowing = false, followingUserId: string | null = null) {
    // re-queueing for the same channel must not spam another toast
    if (entry?.channelId === channelId) return;

    const label = channelLabel(getChannelInfo(channelId));
    const target = stopFollowing ? getAutoJoinTarget() : undefined;
    const replaced = entry?.channelLabel;

    if (target) clearAutoJoin();

    // deliberately does not reset lastAttemptAt. Cancelling and re-queueing is two clicks, and if
    // that handed back the right to attempt at once, the cooldown would last only while nobody
    // clicked. The cost is a two second wait on a queue started right after an attempt.
    entry = { channelId, channelLabel: label, followingUserId };
    attempts = 0;
    emit();

    const extras = [
        target && T.queueAutoJoinDropped(getUserDisplayName(target.id, target.name)),
        replaced && T.queueReplaced(replaced)
    ].filter(Boolean);

    toast(T.queueWaiting(label, extras.join(", ")), ToastType.MESSAGE);
}

export function cancelQueue(reason?: string) {
    if (!entry) return;

    entry = null;
    attempts = 0;
    emit();

    if (reason) toast(reason, ToastType.MESSAGE);
}

/**
 * Runs on every voice state batch, because the event that says somebody left a full channel is the
 * one that lets us take their place. No deadline. The chip in the toolbar is visible the whole time
 * and one click drops it.
 */
export function checkQueue() {
    if (!entry) return;

    if (getMyChannelId() === entry.channelId) {
        const label = entry.channelLabel;
        entry = null;
        attempts = 0;
        emit();
        toast(T.queueGotSlot(label), ToastType.SUCCESS);
        return;
    }

    const info = getChannelInfo(entry.channelId);
    if (info.isFull || !info.canJoin) {
        /*
         * Full again means somebody else took the slot, which is an ordinary near miss and the
         * whole reason to keep waiting. Only a channel that stays open while we stay out of it is
         * evidence of anything, so the count starts over here rather than climbing over an evening.
         */
        attempts = 0;
        return;
    }

    // the previous attempt is probably still connecting. See JOIN_RETRY_COOLDOWN_MS
    if (Date.now() - lastAttemptAt < JOIN_RETRY_COOLDOWN_MS) return;

    if (attempts >= MAX_ATTEMPTS) {
        const label = entry.channelLabel;
        entry = null;
        attempts = 0;
        emit();
        toast(T.queueStuck(label), ToastType.FAILURE);
        return;
    }

    // a slot opened up, go for it
    lastAttemptAt = Date.now();
    attempts++;

    /*
     * A refusal is about this channel and will be the same next time, either no permission to connect, or
     * full after all. The check above reads a channel snapshot that is a fraction of a second old,
     * so the two can disagree, and the result was a red toast every couple of seconds for as long
     * as the queue stood, a queue with no way of ever ending, complaining the whole time. It ends
     * instead, and says which channel it gave up on.
     */
    if (joinVoiceChannel(entry.channelId) !== "refused") return;

    const label = entry.channelLabel;
    entry = null;
    attempts = 0;
    emit();
    toast(T.queueRefused(label), ToastType.FAILURE);
}

export function resetQueue() {
    entry = null;
    lastAttemptAt = 0;
    attempts = 0;

    // the listener set is left alone on purpose. See resetStore for why
}
