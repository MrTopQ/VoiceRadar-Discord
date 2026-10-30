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
import { getAutoPullTarget, getTrackedUser } from "./store";

export function isModeratorMode(): boolean {
    return !!settings.store.moderatorMode;
}

export type MoveAccess = "yes" | "no" | "unknown";

const ACCESS_TTL_MS = 200;
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

function canAskAboutMoving(): boolean {
    return probe(() => typeof (PermissionStore as any)?.can === "function"
        && typeof PermissionsBits?.MOVE_MEMBERS === "bigint");
}

/** Discord wants Move Members in both channels. */
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
    if (!voice?.guildId) return "no";

    return moveAccessBetween(voice.channelId, getMyChannelId());
}

export function canMoveUser(userId: string): boolean {
    return getMoveAccess(userId) !== "no";
}

/** The magnet needs the right only where the person sits, and waits while you are somewhere it cannot pull them to. */
export function canShowMagnet(userId: string): boolean {
    if (!isModeratorMode()) return false;
    if (getAutoPullTarget()?.id === userId) return true;

    const voice = getVoiceInfo(userId);
    return voice?.guildId != null && moveAccessForChannel(voice.channelId) !== "no";
}

const muteCache = new TtlCache<MoveAccess>(ACCESS_TTL_MS, ACCESS_MAX_ENTRIES);

function canAskAboutMuting(): boolean {
    return probe(() => typeof (PermissionStore as any)?.can === "function"
        && typeof PermissionsBits?.MUTE_MEMBERS === "bigint");
}

export function muteAccessForChannel(channelId: string): MoveAccess {
    const cached = muteCache.get(channelId);
    if (cached !== undefined) return cached;

    const channel = ChannelStore.getChannel(channelId);
    let access: MoveAccess;

    if (!channel) access = "no";
    else if (!canAskAboutMuting()) access = "unknown";
    else {
        try {
            access = PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel) ? "yes" : "no";
        } catch (error) {
            console.warn("[VoiceRadar-Discord] mute permission check failed:", error);
            access = "unknown";
        }
    }

    return muteCache.set(channelId, access);
}

export function getMuteAccess(userId: string): MoveAccess {
    if (!isModeratorMode()) return "no";

    const voice = getVoiceInfo(userId);
    if (!voice?.guildId) return "no";

    return muteAccessForChannel(voice.channelId);
}

export function canShowStickyMute(userId: string): boolean {
    if (getTrackedUser(userId)?.stickyMute) return true;
    return getMuteAccess(userId) !== "no";
}

export function forgetMoveAccess(): void {
    accessCache.clear();
    muteCache.clear();
}

export function movePermissionProblems(): ApiHealth {
    return new HealthReport()
        .nice(() => typeof (PermissionsBits as any)?.MOVE_MEMBERS === "bigint", T.apiMoveMembersFlag)
        .nice(() => typeof (PermissionsBits as any)?.MUTE_MEMBERS === "bigint", T.apiMuteMembersFlag);
}
