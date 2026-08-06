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
import { ChannelStore, RestAPI } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn, probe, reportBroken } from "./apiHealth";
import { getChannelName } from "./channels";
import { T } from "./i18n";
import { moveAccessForChannel } from "./movePermissions";

/** Which two channels a move was between, so a refusal can name the one that blocked it. */
interface MoveContext {
    fromChannelId?: string | null;
    toChannelId?: string | null;
}

const channelNameOf = (channelId: string) => getChannelName(ChannelStore.getChannel(channelId));

/**
 * "Either you lack the permission, or they cannot enter" is three problems in one sentence, and the
 * reader checks the half that is fine and concludes the plugin is broken. Two of the three are
 * answerable right here, whether Move Members is missing in your channel and whether it is missing in
 * theirs. Only when both are in place is it about the other person.
 */
function describeForbidden(name: string, { fromChannelId, toChannelId }: MoveContext, discordMessage?: string): string {
    if (toChannelId && moveAccessForChannel(toChannelId) === "no") {
        return T.refusalCannotMoveInto(name, channelNameOf(toChannelId));
    }

    if (fromChannelId && moveAccessForChannel(fromChannelId) === "no") {
        return T.refusalCannotMoveFrom(name, channelNameOf(fromChannelId));
    }

    // both permissions are in place, so whatever is left is Discord's to explain. A guess of ours
    // only sends the reader after the wrong thing
    if (discordMessage) return T.refusalWithMessage(name, discordMessage);

    return toChannelId ? T.refusalTargetCannotJoin(name) : T.refusalForbidden(name);
}

/** Discord says no in several different ways, and one "could not move" hides which it was. */
function describeRefusal(error: any, name: string, context: MoveContext): string {
    const status = error?.status;
    const code = error?.body?.code;

    if (code === 40032) return T.refusalNotConnected(name);
    if (code === 10007) return T.refusalNotInGuild(name);
    if (status === 403 || code === 50013) return describeForbidden(name, context, error?.body?.message);
    if (status === 401 || code === 50001) return T.refusalNoGuildAccess;
    if (status === 404) return T.refusalGone(name);
    if (status === 429) return T.refusalRateLimited;

    const message = error?.body?.message;
    return message ? T.refusalWithMessage(name, message) : T.refusalGeneric(name);
}

/** A permission refusal will refuse again, which the callers that keep retrying want to know. */
function isForbidden(error: any): boolean {
    return error?.status === 403 || error?.body?.code === 50013;
}

export interface MoveOutcome {
    ok: boolean;
    /** What Discord asked us to wait before trying again. 0 when the refusal was not a rate limit. */
    retryAfterMs: number;
    /** Ready to show. Null when the move worked. */
    problem: string | null;
    /** A permissions refusal. Trying the same move again cannot end differently. */
    forbidden: boolean;
}

/** Used when Discord rate limits us without saying for how long, and as an upper bound when it does. */
const DEFAULT_RETRY_AFTER_MS = 1000;
const MAX_RETRY_AFTER_MS = 10_000;

/** A 429 carries retry_after, in seconds, and it can be fractional. */
function readRetryAfter(error: any): number {
    const seconds = Number(error?.body?.retry_after ?? error?.retry_after);
    const ms = Number.isFinite(seconds) && seconds > 0
        ? Math.ceil(seconds * 1000)
        : DEFAULT_RETRY_AFTER_MS;

    return Math.min(ms, MAX_RETRY_AFTER_MS);
}

/** All moderator actions are the same call Discord makes, a guild member patch. */
async function patchMember(guildId: string, userId: string, body: Record<string, unknown>, name: string, context: MoveContext): Promise<MoveOutcome> {
    try {
        await RestAPI.patch({
            url: `/guilds/${guildId}/members/${userId}`,
            body
        });
        return { ok: true, retryAfterMs: 0, problem: null, forbidden: false };
    } catch (error: any) {
        // spelled out rather than dumped, because a refusal is diagnosed from the status, the code
        // and Discord's own wording, and digging those out of a collapsed object every time is work
        console.error("[VoiceRadar-Discord] moderator action failed:", {
            status: error?.status,
            code: error?.body?.code,
            message: error?.body?.message,
            guildId,
            userId,
            body,
            error
        });

        // deliberately not "any failure without a status". Being offline for a moment looks exactly
        // like that, and it would leave the window claiming a Discord update for the rest of the
        // session. The only thing worth reporting is the call itself no longer being there
        if (!probe(() => isFn((RestAPI as any)?.patch))) reportBroken(T.apiModeratorActions);

        return {
            ok: false,
            retryAfterMs: error?.status === 429 ? readRetryAfter(error) : 0,
            problem: describeRefusal(error, name, context),
            forbidden: isForbidden(error)
        };
    }
}

/**
 * A rate limit is Discord saying wait, not no, and it says exactly how long. Sitting that out and
 * trying once more is the difference between a group that all arrives and one where half are left
 * behind. A second refusal is taken at face value, because at that point something is genuinely
 * wrong and hammering it would make it worse.
 */
export async function moveMember(guildId: string, userId: string, toChannelId: string, name: string, fromChannelId?: string | null): Promise<MoveOutcome> {
    const body = { channel_id: toChannelId };
    const context: MoveContext = { fromChannelId, toChannelId };

    const attempt = await patchMember(guildId, userId, body, name, context);
    if (attempt.ok || !attempt.retryAfterMs) return attempt;

    await sleep(attempt.retryAfterMs);
    return patchMember(guildId, userId, body, name, context);
}

/**
 * Moving people one by one is a request each, so they are spaced out.
 *
 * The gap is not what keeps us inside Discord's limit. That one is dynamic, announced in the response
 * headers, and the client's own REST layer already queues by bucket, so it cannot be outrun anyway.
 * What the loop buys is control. A rate limit that survives its retry stops the rest of the batch,
 * leaving your channel stops it too, each refusal names the person it was about, and the undo records
 * are written one by one so they survive a half finished run.
 *
 * The gap itself is about what the run looks like from the other side. Every one of these is a
 * MEMBER_MOVE line in the server's audit log, and a whole channel arriving inside a couple of seconds
 * is the shape of a raid tool rather than of a moderator gathering people. It costs a few seconds and
 * takes that away.
 */
export const MOVE_SPACING_MS = 600;

/** Two group operations at once would interleave over the same people, each undoing the other. */
let batchRunning = false;

/**
 * Bumped whenever group operations are called off, so a run already under way can tell that it no
 * longer belongs to anybody.
 *
 * Every step of a run is a member patch, a person actually moved between voice channels and a line
 * in that server's audit log, under your name. A gathering of twenty takes twelve seconds at the
 * spacing above, and minutes once a rate limit makes it wait, and switching the plugin off did not
 * stop any of it. That is worse than a stray request, because it is an action other people see.
 *
 * The token is taken before the confirmation dialog rather than when the run starts, since the
 * dialog can sit on screen for as long as it likes and the plugin can be switched off while it
 * does. Confirming afterwards used to start a whole run on a plugin that was no longer there.
 */
let batchGeneration = 0;

export const isBatchRunning = () => batchRunning;

/** Taken before anything that might have to wait, and handed back to the run that acts on it. */
export function batchToken(): number {
    return batchGeneration;
}

/** Whether the run holding this token still belongs to a running plugin. */
export function isBatchCurrent(token: number): boolean {
    return token === batchGeneration;
}

/** @returns false when another group operation is already running, and this one must not start. */
export function beginBatch(): boolean {
    if (batchRunning) return false;
    batchRunning = true;
    return true;
}

/**
 * @param token the one the run began with. A run that has been called off must not clear the flag
 * of whichever run owns it now, which after a restart is a different one entirely.
 */
export function endBatch(token: number): void {
    if (!isBatchCurrent(token)) return;
    batchRunning = false;
}

/**
 * Calls off whatever is in flight and refuses whatever has not started yet.
 *
 * The run notices at its next step, so the move already in the air still lands. Threading this
 * further, into the request itself, would buy one member patch and cost every caller a cancellation
 * argument it has nothing to do with.
 */
export function cancelBatches(): void {
    batchGeneration++;
    batchRunning = false;
}

/**
 * A human cannot click meaningfully faster than this, so it only swallows a double click, a bouncing
 * mouse or a held button. Each of those would otherwise be a request of its own, spent out of the
 * budget the group actions need.
 */
const CLICK_COOLDOWN_MS = 300;
const lastClickAt = new Map<string, number>();

/**
 * @param action keeps the two directions apart. With one key per person, pulling somebody over and
 * immediately undoing it had the second click swallowed as if it were a bounce, even though it was
 * two different buttons.
 */
export function isRepeatClick(action: string, userId: string): boolean {
    const key = `${action}:${userId}`;
    if (Date.now() - (lastClickAt.get(key) ?? 0) < CLICK_COOLDOWN_MS) return true;

    lastClickAt.set(key, Date.now());
    return false;
}

export function forgetClicks(): void {
    lastClickAt.clear();
}

export function moveApiProblems(): ApiHealth {
    return new HealthReport()
        .nice(() => isFn((RestAPI as any)?.patch), T.apiModeratorActions);
}
