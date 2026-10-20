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

import { voiceStateForUser } from "./channels";
import { T } from "./i18n";
import { setMemberMute } from "./moveApi";
import { muteAccessForChannel } from "./movePermissions";
import { getUserDisplayName } from "./names";
import { addUser, getStickyMuted, getTrackedUser, isTracked, rememberStickyMuteGuild, setStickyMute, subscribeToStore } from "./store";
import { toast, ToastType } from "./toast";

const RECHECK_DELAYS = [400, 1200, 3000];
const MIN_CALL_GAP_MS = 400;
const SWEEP_INTERVAL_MS = 1000;
const REFUSAL_COOLDOWN_MS = 60_000;

const FAILURE_COOLDOWN_MS = 15_000;

/** Each person under it is a fight with whoever keeps lifting the mute, so only a couple at a time. */
export const MAX_STICKY_MUTED = 2;

const inFlight = new Set<string>();
const lastCallAt = new Map<string, number>();
const refusedAt = new Map<string, number>();
const failedAt = new Map<string, number>();
const warnedAbout = new Set<string>();
const timers = new Set<ReturnType<typeof setTimeout>>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;

function guildOfChannel(channelId: string): string | null {
    return ChannelStore.getChannel(channelId)?.guild_id ?? null;
}

function currentChannelId(userId: string): string | null {
    return voiceStateForUser(userId)?.channelId ?? null;
}

function refusalKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
}

function forgetRefusals(userId: string) {
    for (const key of [...refusedAt.keys()]) {
        if (key.endsWith(`:${userId}`)) refusedAt.delete(key);
    }
    for (const key of [...failedAt.keys()]) {
        if (key.endsWith(`:${userId}`)) failedAt.delete(key);
    }
    for (const key of [...warnedAbout]) {
        if (key.endsWith(`:${userId}`)) warnedAbout.delete(key);
    }
}

function isServerMuted(userId: string): boolean {
    return voiceStateForUser(userId)?.mute === true;
}

function later(callback: () => void, delay: number) {
    const id = setTimeout(() => {
        timers.delete(id);
        callback();
    }, delay);
    timers.add(id);
}

async function pushMute(userId: string, guildId: string, announce: boolean) {
    const user = getTrackedUser(userId);
    if (!user?.stickyMute) return;
    if (inFlight.has(userId)) return;

    const key = refusalKey(guildId, userId);
    if (Date.now() - (refusedAt.get(key) ?? 0) < REFUSAL_COOLDOWN_MS) return;
    if (Date.now() - (failedAt.get(key) ?? 0) < FAILURE_COOLDOWN_MS) return;

    const now = Date.now();
    if (now - (lastCallAt.get(userId) ?? 0) < MIN_CALL_GAP_MS) return;

    lastCallAt.set(userId, now);
    inFlight.add(userId);

    const name = getUserDisplayName(userId, user.name);

    try {
        const outcome = await setMemberMute(guildId, userId, true, name);

        if (outcome.ok) {
            refusedAt.delete(key);
            failedAt.delete(key);
            warnedAbout.delete(key);
            if (announce) toast(T.stickyMuteRestored(name), ToastType.SUCCESS);
            return;
        }

        if (outcome.forbidden) {
            refusedAt.set(key, Date.now());
            if (!warnedAbout.has(key)) {
                warnedAbout.add(key);
                toast(T.stickyMuteNoPermission(name), ToastType.FAILURE);
            }
            return;
        }

        if (outcome.problem && !failedAt.has(key)) toast(outcome.problem, ToastType.FAILURE);
        failedAt.set(key, Date.now());
    } finally {
        inFlight.delete(userId);
    }
}

function enforceNow(userId: string, channelId: string, announce: boolean) {
    const user = getTrackedUser(userId);
    if (!user?.stickyMute) return;

    const guildId = guildOfChannel(channelId);
    if (!guildId) return;
    if (muteAccessForChannel(channelId) === "no") return;

    if (!user.stickyMuteGuildId) rememberStickyMuteGuild(userId, guildId);
    if (isServerMuted(userId)) return;

    void pushMute(userId, guildId, announce);
}

export function watchVoiceState(userId: string, channelId: string | null) {
    if (!channelId) return;
    if (!getTrackedUser(userId)?.stickyMute) return;

    enforceNow(userId, channelId, true);

    for (const delay of RECHECK_DELAYS) {
        later(() => {
            const nowChannel = currentChannelId(userId);
            if (nowChannel) enforceNow(userId, nowChannel, false);
        }, delay);
    }
}

export function sweepStickyMutes(announce = false) {
    for (const user of getStickyMuted()) {
        const channelId = currentChannelId(user.id);
        if (channelId) enforceNow(user.id, channelId, announce);
    }
}

export function isStickyMuteLimitReached(): boolean {
    return getStickyMuted().length >= MAX_STICKY_MUTED;
}

export function armStickyMute(userId: string, fallbackName: string): boolean {
    if (!getTrackedUser(userId)?.stickyMute && isStickyMuteLimitReached()) return false;

    const channelId = currentChannelId(userId);
    const guildId = channelId ? guildOfChannel(channelId) : null;

    forgetRefusals(userId);
    lastCallAt.delete(userId);

    if (!isTracked(userId)) addUser(userId, fallbackName, { stickyMute: true, stickyMuteGuildId: guildId });
    else setStickyMute(userId, true, guildId);

    if (channelId) enforceNow(userId, channelId, false);
    return true;
}

export async function disarmStickyMute(userId: string, fallbackName: string) {
    const user = getTrackedUser(userId);
    const guildId = user?.stickyMuteGuildId ?? (currentChannelId(userId) ? guildOfChannel(currentChannelId(userId)!) : null);

    setStickyMute(userId, false);
    forgetRefusals(userId);
    lastCallAt.delete(userId);

    if (!guildId || !isServerMuted(userId)) return;

    const name = getUserDisplayName(userId, fallbackName);
    const outcome = await setMemberMute(guildId, userId, false, name);
    if (!outcome.ok && outcome.problem) toast(outcome.problem, ToastType.FAILURE);
}

export function toggleStickyMuteFor(userId: string, fallbackName: string) {
    const name = getUserDisplayName(userId, fallbackName);

    if (getTrackedUser(userId)?.stickyMute) {
        void disarmStickyMute(userId, fallbackName);
        toast(T.stickyMuteOffFor(name), ToastType.MESSAGE);
        return;
    }

    if (!armStickyMute(userId, fallbackName)) {
        toast(T.stickyMuteLimitReached(MAX_STICKY_MUTED), ToastType.FAILURE);
        return;
    }
    toast(T.stickyMuteOnFor(name), ToastType.SUCCESS);
}

let unsubscribeStore: (() => void) | null = null;

function syncSweep() {
    const anyoneMuted = getStickyMuted().length > 0;

    if (anyoneMuted && sweepTimer == null) {
        sweepStickyMutes();
        sweepTimer = setInterval(() => sweepStickyMutes(), SWEEP_INTERVAL_MS);
        return;
    }

    if (!anyoneMuted) stopStickyMuteSweeps();
}

export function isStickyMuteSweepRunning(): boolean {
    return sweepTimer != null;
}

export function startStickyMuteSweeps() {
    stopStickyMuteSweeps();
    unsubscribeStore?.();
    unsubscribeStore = subscribeToStore(syncSweep);
    syncSweep();
}

export function stopStickyMuteSweeps() {
    if (sweepTimer == null) return;

    clearInterval(sweepTimer);
    sweepTimer = null;
}

export function forgetStickyMuteState() {
    unsubscribeStore?.();
    unsubscribeStore = null;
    stopStickyMuteSweeps();
    timers.forEach(clearTimeout);
    timers.clear();
    inFlight.clear();
    lastCallAt.clear();
    refusedAt.clear();
    failedAt.clear();
    warnedAbout.clear();
}
