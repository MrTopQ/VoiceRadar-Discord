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

const JOIN_RETRY_COOLDOWN_MS = 2000;

export interface QueueEntry {
    channelId: string;
    channelLabel: string;
    followingUserId: string | null;
}

let entry: QueueEntry | null = null;
let lastAttemptAt = 0;

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

export function queueForChannel(channelId: string, stopFollowing = false, followingUserId: string | null = null) {
    if (entry?.channelId === channelId) return;

    const label = channelLabel(getChannelInfo(channelId));
    const target = stopFollowing ? getAutoJoinTarget() : undefined;
    const replaced = entry?.channelLabel;

    if (target) clearAutoJoin();

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
        attempts = 0;
        return;
    }

    if (Date.now() - lastAttemptAt < JOIN_RETRY_COOLDOWN_MS) return;

    if (attempts >= MAX_ATTEMPTS) {
        const label = entry.channelLabel;
        entry = null;
        attempts = 0;
        emit();
        toast(T.queueStuck(label), ToastType.FAILURE);
        return;
    }

    lastAttemptAt = Date.now();
    attempts++;

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

}
