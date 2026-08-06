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

import { sleep } from "@utils/misc";
import { Alerts, ChannelStore, UserStore } from "@webpack/common";

import { getMyChannelId, getVoiceInfo } from "./channels";
import { T } from "./i18n";
import { batchToken, beginBatch, endBatch, isBatchCurrent, isBatchRunning, isRepeatClick, MOVE_SPACING_MS, moveMember } from "./moveApi";
import { rememberMove } from "./moveHistory";
import { canMoveUser } from "./movePermissions";
import { getUserDisplayName } from "./names";
import { toast, ToastType } from "./toast";

/** What a button or a menu entry calls. The magnet goes straight to movePersonToMe instead. */
export async function pullToMyChannel(userId: string) {
    if (isRepeatClick("pull", userId)) return;
    await movePersonToMe(userId);
}

/** Resolves to true when the refusal was about permissions, so a repeat would be refused too. */
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

    // the target channel must be in the same server, Discord cannot move people across servers
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

/** How many one click may move. Whoever is left over is named in the toast, and one more click takes them. */
const MAX_PULL_AT_ONCE = 20;

/**
 * Past this many people the click is confirmed first.
 *
 * Gathering a handful is the everyday use and a dialog in front of it would be in the way. A whole
 * channel is a different thing. It is a line per person in the server's audit log, it takes long
 * enough that a misclick cannot be caught halfway, and it is the one action here nobody wants to
 * discover they made by accident on somebody else's server.
 */
const CONFIRM_ABOVE = 8;

interface PullCandidates {
    /** who can actually be moved into your channel right now */
    targets: string[];
    /** somebody was there, but your own channel belongs to a different server */
    otherGuild: boolean;
    /** somebody was there, in the right server, and Move Members says no */
    blocked: boolean;
}

/**
 * Who of these can be moved, and when the answer is nobody, what stood in the way. An empty result
 * cannot tell an empty channel from a server where the entry was never yours to use, and reporting
 * the first for the second reads as a plugin that does not work.
 */
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

        // same server only, Discord cannot move anyone across servers
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

/** Who of these can actually be moved into your channel right now. */
export function pullableUsers(userIds: string[]): string[] {
    return pullCandidates(userIds).targets;
}

/**
 * Gathering people is the thing Discord has no button for, it only lets you drag one person at a
 * time. This is the same move request, run over a whole group.
 */
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
        // the permission is the most useful thing to say, and the most likely to be the real
        // answer on somebody else's server, where the entry shows but was never yours to use
        if (blocked) toast(T.noMovePermissionHere(what), ToastType.FAILURE);
        else if (otherGuild) toast(T.sameGuildOnly, ToastType.FAILURE);
        else toast(T.nobodyToPull(what), ToastType.MESSAGE);
        return;
    }

    // taken here rather than inside the run, because the dialog below can sit on screen for as long
    // as it likes and the plugin can be switched off while it does
    const token = batchToken();

    if (targets.length > CONFIRM_ABOVE) {
        // Alerts answers through a callback rather than a promise, so the run starts from there and
        // this call is done. Nothing else waits on it
        Alerts.show({
            title: T.pullConfirmTitle,
            body: T.pullConfirmBody(targets.length, what, Math.ceil(targets.length * MOVE_SPACING_MS / 1000)),
            confirmText: T.pullConfirmButton(targets.length),
            cancelText: T.cancel,
            onConfirm: () => void runPull(targets, myChannelId, what, skipped, token)
        });
        return;
    }

    await runPull(targets, myChannelId, what, skipped, token);
}

/**
 * @param skipped how many were left out by the cap before the run started, so the summary can name
 * them next to whatever the run itself did not get to.
 */
async function runPull(targets: string[], myChannelId: string, what: string, skipped: number, token: number) {
    // switched off while the confirmation was on screen, so the click confirms nothing
    if (!isBatchCurrent(token)) return;
    if (!beginBatch()) return;

    const guildId = (ChannelStore.getChannel(myChannelId) as any)?.guild_id;
    let moved = 0;
    /** how many of the batch never got a request at all, because a rate limit ended the run */
    let abandoned = 0;

    try {
        for (const [index, userId] of targets.entries()) {
            // the plugin was switched off mid-run, and every step of this is a visible move in
            // somebody's server
            if (!isBatchCurrent(token)) break;

            // check again, the channel may have emptied while we were working through the list
            if (getMyChannelId() !== myChannelId) break;

            const from = getVoiceInfo(userId)?.channelId;
            const outcome = await moveMember(guildId, userId, myChannelId, getUserDisplayName(userId), from);

            if (outcome.ok) {
                // they moved either way, so the count must say so. Only the undo needs to know
                // where from, so a channel we failed to read costs the undo and nothing else
                if (from) rememberMove(userId, from, myChannelId);
                moved++;
            } else {
                toast(outcome.problem!, ToastType.FAILURE);

                // still rate limited after waiting it out, so something is wrong. Stop pushing
                if (outcome.retryAfterMs) {
                    abandoned = targets.length - index - 1;
                    break;
                }
            }

            await sleep(MOVE_SPACING_MS);
        }
    } finally {
        endBatch(token);
    }

    // a run called off half way owes nobody a summary, since there is no window left to read it in
    if (!isBatchCurrent(token)) return;

    // a run that moved nobody and gave up on somebody still owes an answer. See sendBatchBack
    if (!moved && !abandoned) return;

    // the cap used to be silent, so a channel of forty people looked like the action had decided
    // fifteen of them did not count. A run cut short by a rate limit needs the same, and needs it
    // more, because its red toast is replaced by this one a moment later
    const left = skipped + abandoned;

    toast(
        abandoned ? T.pulledUsersStopped(moved, what, left)
            : left ? T.pulledUsersCapped(moved, what, left)
                : T.pulledUsers(moved, what),
        abandoned ? ToastType.MESSAGE : ToastType.SUCCESS
    );
}

/** Everyone sitting in that person's channel comes over. */
export async function pullTheirChannelToMe(userId: string) {
    const voice = getVoiceInfo(userId);
    if (!voice) return;

    await pullUsersToMe(voice.participantIds, voice.channelName);
}
