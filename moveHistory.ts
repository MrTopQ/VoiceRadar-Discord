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

/**
 * Where each person sat before you pulled them over. Kept in memory only, because undoing a move
 * makes sense while they are still sitting with you and no longer.
 */
const cameFrom = new Map<string, { from: string; to: string; }>();

export interface ReturnTarget {
    channelId: string;
    name: string;
}

/** Written the moment a move lands, one by one, so a half finished run is still undoable. */
export function rememberMove(userId: string, from: string, to: string) {
    cameFrom.set(userId, { from, to });
}

/**
 * The channel to send them back to, or null when there is nothing to undo. An undo only makes sense
 * while they are still sitting with you, since chasing someone who walked off would not be an undo.
 *
 * Deliberately read-only. It is called from render, for the button, its tooltip and the menu, and
 * dropping records here made rendering mutate state. Stale records are pruned by pruneMoveHistory,
 * from the voice events that are the reason they go stale.
 */
export function getReturnChannel(userId: string): ReturnTarget | null {
    const record = cameFrom.get(userId);
    if (!record) return null;

    const voice = getVoiceInfo(userId);
    if (!voice || voice.channelId !== record.to || voice.channelId !== getMyChannelId()) return null;

    // canMoveUser covers where they sit now, with you. Sending them back also needs the permission
    // in the channel they came from, which is the destination this time
    const channel = ChannelStore.getChannel(record.from) as any;
    if (!channel || !canMoveUser(userId) || moveAccessForChannel(record.from) === "no") return null;

    return { channelId: record.from, name: getChannelName(channel) };
}

/** Forgets whoever can no longer be sent back. Safe at any time, since reads are filtered. */
export function pruneMoveHistory() {
    for (const userId of [...cameFrom.keys()]) {
        if (!getReturnChannel(userId)) cameFrom.delete(userId);
    }
}

/**
 * Sending somebody back and magnetising them are opposite instructions, and the magnet used to win.
 * The move landed, the voice state came back, the magnet dragged them in again, and the button looked
 * broken. A click is the newer instruction, so it releases the magnet, before the request, so the
 * voice update the move causes cannot arrive first and undo it.
 */
function releaseMagnet(userId: string) {
    if (getAutoPullTarget()?.id === userId) clearAutoPull();
}

/** A full channel is no obstacle here. Moving members is the permission that ignores it. */
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

/**
 * Everyone you pulled over who is still sitting with you, one by one or in a group. Whoever has since
 * wandered off is filtered out rather than deleted. See getReturnChannel.
 */
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

/** Everything the undo remembers between actions. Dropped when the plugin stops. */
export function forgetMoveHistory() {
    cameFrom.clear();
}
