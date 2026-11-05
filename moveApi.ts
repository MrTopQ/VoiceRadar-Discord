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

interface MoveContext {
    fromChannelId?: string | null;
    toChannelId?: string | null;
    /** What to say when Discord refuses something other than a move. */
    refusal?: string;
}

const channelNameOf = (channelId: string) => getChannelName(ChannelStore.getChannel(channelId));

function describeForbidden(name: string, { fromChannelId, toChannelId, refusal }: MoveContext, discordMessage?: string): string {
    if (toChannelId && moveAccessForChannel(toChannelId) === "no") {
        return T.refusalCannotMoveInto(name, channelNameOf(toChannelId));
    }

    if (fromChannelId && moveAccessForChannel(fromChannelId) === "no") {
        return T.refusalCannotMoveFrom(name, channelNameOf(fromChannelId));
    }

    if (discordMessage) return T.refusalWithMessage(name, discordMessage);
    if (refusal) return refusal;

    return toChannelId ? T.refusalTargetCannotJoin(name) : T.refusalForbidden(name);
}

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
    return message ? T.refusalWithMessage(name, message) : context.refusal ?? T.refusalGeneric(name);
}

function isForbidden(error: any): boolean {
    return error?.status === 403 || error?.body?.code === 50013;
}

export interface MoveOutcome {
    ok: boolean;
    retryAfterMs: number;
    problem: string | null;
    forbidden: boolean;
}

const DEFAULT_RETRY_AFTER_MS = 1000;
const MAX_RETRY_AFTER_MS = 10_000;

/** A 429 carries retry_after in seconds, possibly fractional. */
function readRetryAfter(error: any): number {
    const seconds = Number(error?.body?.retry_after ?? error?.retry_after);
    const ms = Number.isFinite(seconds) && seconds > 0
        ? Math.ceil(seconds * 1000)
        : DEFAULT_RETRY_AFTER_MS;

    return Math.min(ms, MAX_RETRY_AFTER_MS);
}

async function patchMember(guildId: string, userId: string, body: Record<string, unknown>, name: string, context: MoveContext): Promise<MoveOutcome> {
    try {
        await RestAPI.patch({
            url: `/guilds/${guildId}/members/${userId}`,
            body
        });
        return { ok: true, retryAfterMs: 0, problem: null, forbidden: false };
    } catch (error: any) {
        console.error("[VoiceRadar-Discord] moderator action failed:", {
            status: error?.status,
            code: error?.body?.code,
            message: error?.body?.message,
            guildId,
            userId,
            body,
            error
        });

        if (!probe(() => isFn((RestAPI as any)?.patch))) reportBroken(T.apiModeratorActions);

        return {
            ok: false,
            retryAfterMs: error?.status === 429 ? readRetryAfter(error) : 0,
            problem: describeRefusal(error, name, context),
            forbidden: isForbidden(error)
        };
    }
}

/** A rate limit is waited out once and never more. */
async function patchPatiently(guildId: string, userId: string, body: Record<string, unknown>, name: string, context: MoveContext): Promise<MoveOutcome> {
    const attempt = await patchMember(guildId, userId, body, name, context);
    if (attempt.ok || !attempt.retryAfterMs) return attempt;

    await sleep(attempt.retryAfterMs);
    return patchMember(guildId, userId, body, name, context);
}

export function moveMember(guildId: string, userId: string, toChannelId: string, name: string, fromChannelId?: string | null): Promise<MoveOutcome> {
    return patchPatiently(guildId, userId, { channel_id: toChannelId }, name, { fromChannelId, toChannelId });
}

export type VoiceChange = { mute: boolean; } | { deaf: boolean; } | { channel_id: null; };

/** One request per click, nothing here ever repeats a change on its own. */
export function changeMemberVoice(guildId: string, userId: string, change: VoiceChange, name: string): Promise<MoveOutcome> {
    return patchPatiently(guildId, userId, change, name, { refusal: T.refusalVoiceAction });
}

let batchRunning = false;

let batchGeneration = 0;

export const isBatchRunning = () => batchRunning;

export function batchToken(): number {
    return batchGeneration;
}

export function isBatchCurrent(token: number): boolean {
    return token === batchGeneration;
}

export function beginBatch(): boolean {
    if (batchRunning) return false;
    batchRunning = true;
    return true;
}

export function endBatch(token: number): void {
    if (!isBatchCurrent(token)) return;
    batchRunning = false;
}

export function cancelBatches(): void {
    batchGeneration++;
    batchRunning = false;
}

/** Only swallows a double click or a held button. */
const CLICK_COOLDOWN_MS = 300;
const lastClickAt = new Map<string, number>();

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
