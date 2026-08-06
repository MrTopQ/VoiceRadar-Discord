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

import { ChannelStore, PermissionsBits, PermissionStore } from "@webpack/common";

import { type ApiHealth, HealthReport, probe } from "./apiHealth";
import { TtlCache } from "./cache";
import { getMyChannelId, getVoiceInfo } from "./channels";
import { T } from "./i18n";
import { settings } from "./settings";
import { getAutoPullTarget } from "./store";

export function isModeratorMode(): boolean {
    return !!settings.store.moderatorMode;
}

/** "no" hides the buttons, "unknown" shows them and lets the server have the last word. */
export type MoveAccess = "yes" | "no" | "unknown";

/**
 * Everything moderator mode offers is built on moving members, so that is the only permission worth
 * asking about, and it belongs to the channel rather than to the person. Hence the per-channel cache.
 * A row asks twice, and a full list in one voice channel used to mean hundreds of identical
 * computations per redraw.
 *
 * A plain no hides the buttons. A broken check does not. If a Discord update moves the permission
 * API, losing the feature outright would be worse than trying and being told no by the server, which
 * is the real authority anyway.
 */
const ACCESS_TTL_MS = 200;
/** More channels than a single redraw can ask about, so the ceiling never costs a real check. */
const ACCESS_MAX_ENTRIES = 200;
const accessCache = new TtlCache<MoveAccess>(ACCESS_TTL_MS, ACCESS_MAX_ENTRIES);

export function moveAccessForChannel(channelId: string): MoveAccess {
    const cached = accessCache.get(channelId);
    if (cached !== undefined) return cached;

    const channel = ChannelStore.getChannel(channelId);
    let access: MoveAccess;

    if (!channel) access = "no";
    else if (!canAskAboutMoving()) access = "unknown";
    else {
        try {
            access = PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel) ? "yes" : "no";
        } catch (error) {
            console.warn("[VoiceRadar-Discord] moderator permission check failed:", error);
            access = "unknown";
        }
    }

    return accessCache.set(channelId, access);
}

/** Whether the question can be put at all, which a Discord update can take away. */
function canAskAboutMoving(): boolean {
    return probe(() => typeof (PermissionStore as any)?.can === "function"
        && typeof PermissionsBits?.MOVE_MEMBERS === "bigint");
}

/**
 * Discord wants Move Members in both channels, the one they sit in and the one they are going to.
 * Asking only about theirs was the whole bug behind a move that looked perfectly allowed being
 * refused. The permission was there where you were looking and missing in your own channel.
 *
 * Not being connected anywhere is not a refusal. The action says "join a channel first", which beats
 * a button that quietly disappears.
 */
function moveAccessBetween(fromChannelId: string, toChannelId: string | null): MoveAccess {
    const from = moveAccessForChannel(fromChannelId);
    if (from === "no" || !toChannelId) return from;

    const to = moveAccessForChannel(toChannelId);
    if (to === "no") return "no";

    return from === "unknown" || to === "unknown" ? "unknown" : "yes";
}

export function getMoveAccess(userId: string): MoveAccess {
    if (!isModeratorMode()) return "no";

    const voice = getVoiceInfo(userId);
    if (!voice?.guildId) return "no"; // DMs and group calls have no moderators

    return moveAccessBetween(voice.channelId, getMyChannelId());
}

export function canMoveUser(userId: string): boolean {
    return getMoveAccess(userId) !== "no";
}

/**
 * Whether the magnet control belongs on this person at all.
 *
 * canMoveUser answers whether they can be moved right now, which is false for anybody out of voice.
 * Hiding the magnet on that basis made an armed magnet unreachable the moment its target left, with
 * nowhere in the UI to switch the flag off. The magnet is a stored intention rather than an immediate
 * action, so once it is on it stays operable.
 */
export function canShowMagnet(userId: string): boolean {
    if (canMoveUser(userId)) return true;
    return isModeratorMode() && getAutoPullTarget()?.id === userId;
}

export function forgetMoveAccess(): void {
    accessCache.clear();
}

export function movePermissionProblems(): ApiHealth {
    return new HealthReport()
        .nice(() => typeof (PermissionsBits as any)?.MOVE_MEMBERS === "bigint", T.apiMoveMembersFlag);
}
