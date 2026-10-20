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

import { getChannelName, getMyChannelId, getVoiceInfo } from "./channels";
import { T } from "./i18n";
import { batchToken, beginBatch, endBatch, isBatchCurrent, isBatchRunning, isRepeatClick, moveMember } from "./moveApi";
import { type BatchTally, runMoveBatch } from "./moveBatch";
import { canMoveUser, moveAccessForChannel } from "./movePermissions";
import { getUserDisplayName } from "./names";
import { getMovePace } from "./settings";
import { clearAutoPull, getAutoPullTarget } from "./store";
import { toast, ToastType } from "./toast";

const cameFrom = new Map<string, { from: string; to: string; }>();

export interface ReturnTarget {
    channelId: string;
    name: string;
}

export function rememberMove(userId: string, from: string, to: string) {
    cameFrom.set(userId, { from, to });
}

export function getReturnChannel(userId: string): ReturnTarget | null {
    const record = cameFrom.get(userId);
    if (!record) return null;

    const voice = getVoiceInfo(userId);
    if (!voice || voice.channelId !== record.to || voice.channelId !== getMyChannelId()) return null;

    const channel = ChannelStore.getChannel(record.from) as any;
    if (!channel || !canMoveUser(userId) || moveAccessForChannel(record.from) === "no") return null;

    return { channelId: record.from, name: getChannelName(channel) };
}

export function pruneMoveHistory() {
    for (const userId of [...cameFrom.keys()]) {
        if (!getReturnChannel(userId)) cameFrom.delete(userId);
    }
}

function releaseMagnet(userId: string) {
    if (getAutoPullTarget()?.id === userId) clearAutoPull();
}

export async function sendUserBack(userId: string) {
    if (isRepeatClick("back", userId)) return;

    const target = getReturnChannel(userId);
    const guildId = getVoiceInfo(userId)?.guildId;
    if (!target || !guildId) return;

    releaseMagnet(userId);

    const name = getUserDisplayName(userId);
    const outcome = await moveMember(guildId, userId, target.channelId, name, getMyChannelId());

    if (!outcome.ok) {
        toast(outcome.problem!, ToastType.FAILURE);
        return;
    }

    cameFrom.delete(userId);
    toast(T.sentUserBack(name, target.name), ToastType.SUCCESS);
}

export function getReturnableBatch(): string[] {
    return [...cameFrom.keys()].filter(id => getReturnChannel(id) !== null);
}

export async function sendBatchBack() {
    if (isBatchRunning()) return;

    const ids = [...getReturnableBatch()];
    if (!ids.length) return;

    const token = batchToken();
    if (!beginBatch()) return;

    let tally: BatchTally = { done: 0, abandoned: 0 };

    try {
        tally = await runMoveBatch(
            ids,
            getMovePace(),
            async userId => {
                const target = getReturnChannel(userId);
                const guildId = getVoiceInfo(userId)?.guildId;
                if (!target || !guildId) return null;

                releaseMagnet(userId);

                const outcome = await moveMember(guildId, userId, target.channelId, getUserDisplayName(userId), getMyChannelId());

                if (outcome.ok) {
                    cameFrom.delete(userId);
                    return { ok: true, rateLimited: false };
                }

                toast(outcome.problem!, ToastType.FAILURE);
                return { ok: false, rateLimited: outcome.retryAfterMs > 0 };
            },
            () => isBatchCurrent(token)
        );
    } finally {
        endBatch(token);
    }

    if (!isBatchCurrent(token)) return;
    if (!tally.done && !tally.abandoned) return;

    toast(
        tally.abandoned ? T.sentBatchBackStopped(tally.done, tally.abandoned) : T.sentBatchBack(tally.done),
        tally.abandoned ? ToastType.MESSAGE : ToastType.SUCCESS
    );
}

export function forgetMoveHistory() {
    cameFrom.clear();
}
