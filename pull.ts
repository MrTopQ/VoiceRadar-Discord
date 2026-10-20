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

import { ChannelStore, UserStore } from "@webpack/common";

import { getMyChannelId, getVoiceInfo } from "./channels";
import { confirmFirst } from "./confirm";
import { T } from "./i18n";
import { batchToken, beginBatch, endBatch, isBatchCurrent, isBatchRunning, isRepeatClick, moveMember } from "./moveApi";
import { type BatchTally, estimateBatchSeconds, runMoveBatch } from "./moveBatch";
import { rememberMove } from "./moveHistory";
import { canMoveUser } from "./movePermissions";
import { getUserDisplayName } from "./names";
import { getMovePace } from "./settings";
import { toast, ToastType } from "./toast";

export async function pullToMyChannel(userId: string) {
    if (isRepeatClick("pull", userId)) return;
    await movePersonToMe(userId);
}

export async function movePersonToMe(userId: string): Promise<boolean> {
    const target = getVoiceInfo(userId);
    const myChannelId = getMyChannelId();
    const name = getUserDisplayName(userId);

    if (!target?.guildId) return false;

    if (!myChannelId) {
        toast(T.joinChannelFirst, ToastType.FAILURE);
        return false;
    }

    if (myChannelId === target.channelId) {
        toast(T.userAlreadyWithYou(name), ToastType.MESSAGE);
        return false;
    }

    const myChannel = ChannelStore.getChannel(myChannelId) as any;
    if (myChannel?.guild_id !== target.guildId) {
        toast(T.sameGuildOnly, ToastType.FAILURE);
        return false;
    }

    const outcome = await moveMember(target.guildId, userId, myChannelId, name, target.channelId);

    if (!outcome.ok) {
        toast(outcome.problem!, ToastType.FAILURE);
        return outcome.forbidden;
    }

    rememberMove(userId, target.channelId, myChannelId);
    toast(T.userPulled(name), ToastType.SUCCESS);
    return false;
}

const MAX_PULL_AT_ONCE = 99;

const CONFIRM_ABOVE = 8;

interface PullCandidates {
    targets: string[];
    otherGuild: boolean;
    blocked: boolean;
}

function pullCandidates(userIds: string[]): PullCandidates {
    const myChannelId = getMyChannelId();
    const myGuildId = myChannelId ? (ChannelStore.getChannel(myChannelId) as any)?.guild_id : null;
    const me = UserStore.getCurrentUser()?.id;

    const targets: string[] = [];
    let otherGuild = false;
    let blocked = false;

    for (const userId of userIds) {
        if (userId === me) continue;

        const voice = getVoiceInfo(userId);
        if (!voice || voice.channelId === myChannelId) continue;

        if (!myGuildId || voice.guildId !== myGuildId) {
            otherGuild = true;
            continue;
        }

        if (!canMoveUser(userId)) {
            blocked = true;
            continue;
        }

        targets.push(userId);
    }

    return { targets, otherGuild, blocked };
}

export function pullableUsers(userIds: string[]): string[] {
    return pullCandidates(userIds).targets;
}

export async function pullUsersToMe(userIds: string[], what: string) {
    if (isBatchRunning()) return;

    const myChannelId = getMyChannelId();

    if (!myChannelId) {
        toast(T.joinChannelFirst, ToastType.FAILURE);
        return;
    }

    const { targets: pullable, otherGuild, blocked } = pullCandidates(userIds);
    const targets = pullable.slice(0, MAX_PULL_AT_ONCE);
    const skipped = pullable.length - targets.length;

    if (!targets.length) {
        if (blocked) toast(T.noMovePermissionHere(what), ToastType.FAILURE);
        else if (otherGuild) toast(T.sameGuildOnly, ToastType.FAILURE);
        else toast(T.nobodyToPull(what), ToastType.MESSAGE);
        return;
    }

    // Taken before the dialog, because the plugin can be stopped while it is open.
    const token = batchToken();

    if (targets.length > CONFIRM_ABOVE) {
        confirmFirst({
            title: T.pullConfirmTitle,
            body: T.pullConfirmBody(targets.length, what, estimateBatchSeconds(targets.length, getMovePace())),
            confirmText: T.pullConfirmButton(targets.length),
            cancelText: T.cancel,
            onConfirm: () => void runPull(targets, myChannelId, what, skipped, token)
        });
        return;
    }

    await runPull(targets, myChannelId, what, skipped, token);
}

async function runPull(targets: string[], myChannelId: string, what: string, skipped: number, token: number) {
    if (!isBatchCurrent(token)) return;
    if (!beginBatch()) return;

    const guildId = (ChannelStore.getChannel(myChannelId) as any)?.guild_id;
    let tally: BatchTally = { done: 0, abandoned: 0 };

    try {
        tally = await runMoveBatch(
            targets,
            getMovePace(),
            async userId => {
                const from = getVoiceInfo(userId)?.channelId;
                const outcome = await moveMember(guildId, userId, myChannelId, getUserDisplayName(userId), from);

                if (outcome.ok) {
                    if (from) rememberMove(userId, from, myChannelId);
                    return { ok: true, rateLimited: false };
                }

                toast(outcome.problem!, ToastType.FAILURE);
                return { ok: false, rateLimited: outcome.retryAfterMs > 0 };
            },
            () => isBatchCurrent(token) && getMyChannelId() === myChannelId
        );
    } finally {
        endBatch(token);
    }

    if (!isBatchCurrent(token)) return;
    if (!tally.done && !tally.abandoned) return;

    const left = skipped + tally.abandoned;

    toast(
        tally.abandoned ? T.pulledUsersStopped(tally.done, what, left)
            : left ? T.pulledUsersCapped(tally.done, what, left)
                : T.pulledUsers(tally.done, what),
        tally.abandoned ? ToastType.MESSAGE : ToastType.SUCCESS
    );
}

export async function pullTheirChannelToMe(userId: string) {
    const voice = getVoiceInfo(userId);
    if (!voice) return;

    await pullUsersToMe(voice.participantIds, voice.channelName);
}
