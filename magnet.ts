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

import { T } from "./i18n";
import { canMoveUser } from "./movePermissions";
import { getUserDisplayName } from "./names";
import { movePersonToMe, pullableUsers } from "./pull";
import { clearAutoPull } from "./store";
import { toast, ToastType } from "./toast";

/**
 * Discord often emits several voice state updates for a single move, and without this window the
 * same move would become three identical requests. Short enough to feel instant.
 */
const PULL_COOLDOWN_MS = 300;
const USER_WINDOW_MS = 60_000;

/**
 * A magnet only works on somebody who is not fighting it. Past this many returns in a minute they are
 * plainly leaving faster than they can be brought back, the magnet has already lost, and every
 * further attempt is a request spent on nothing. Metering it would keep that going forever at a
 * slower pace, so it gives up instead, and says so. A magnet that quietly stopped working is
 * indistinguishable from a broken one.
 *
 * Worth knowing what this number is, because the magnet is the one thing here that acts without a click
 * behind it, and every attempt is a MEMBER_MOVE line in the server's audit log. Ten a minute is a
 * deliberate ceiling rather than a shy one, and the cooldown after giving up is what keeps it from
 * starting over a second later.
 */
const MAX_RETURNS_PER_MINUTE = 10;

/**
 * Arming the magnet wipes the history, which is right for a magnet put on somebody minutes later and
 * wrong immediately after giving up. The counter would reset and hand out a fresh budget every few
 * seconds, a faster storm than the one giving up was meant to end. It is also almost never
 * deliberate, because the message reads like a glitch and the reflex is to click again.
 */
const GIVE_UP_COOLDOWN_MS = 30_000;
const gaveUpAt = new Map<string, number>();

/** Whole seconds before the magnet may go back on this person. 0 when it may go on now. */
export function magnetCooldownLeft(userId: string): number {
    const at = gaveUpAt.get(userId);
    if (at == null) return 0;

    const left = GIVE_UP_COOLDOWN_MS - (Date.now() - at);
    if (left <= 0) {
        gaveUpAt.delete(userId);
        return 0;
    }

    return Math.ceil(left / 1000);
}

const pullHistory = new Map<string, number[]>();

const recent = (stamps: number[], window: number) => stamps.filter(at => Date.now() - at < window);

/** Several voice states for one move. The second and third are not new information. */
function isDuplicateEvent(userId: string): boolean {
    const mine = recent(pullHistory.get(userId) ?? [], USER_WINDOW_MS);
    const last = mine[mine.length - 1];

    return last != null && Date.now() - last < PULL_COOLDOWN_MS;
}

function hasLostTheTugOfWar(userId: string): boolean {
    return recent(pullHistory.get(userId) ?? [], USER_WINDOW_MS).length >= MAX_RETURNS_PER_MINUTE;
}

function rememberPull(userId: string) {
    const mine = recent(pullHistory.get(userId) ?? [], USER_WINDOW_MS);
    mine.push(Date.now());
    pullHistory.set(userId, mine);

    // every entry here goes cold after a minute, and only the writer ever comes back to look at it,
    // so without this sweep the map keeps one dead array per person the magnet ever touched
    for (const [id, stamps] of pullHistory) {
        if (id !== userId && !recent(stamps, USER_WINDOW_MS).length) pullHistory.delete(id);
    }
}

export function forgetPullHistory(userId?: string) {
    if (userId) pullHistory.delete(userId);
    else pullHistory.clear();
}

/** The magnet. Called every time the person turns up somewhere that is not your channel. */
export function keepUserHere(userId: string) {
    if (!canMoveUser(userId)) return;
    // having given up on this person, nothing pulls them again until it wears off. The callers
    // already stop asking, but the promise should not depend on all of them remembering
    if (magnetCooldownLeft(userId) > 0) return;
    if (!pullableUsers([userId]).length) return;
    if (isDuplicateEvent(userId)) return;

    if (hasLostTheTugOfWar(userId)) {
        const name = getUserDisplayName(userId);
        clearAutoPull();
        gaveUpAt.set(userId, Date.now());
        toast(T.magnetGaveUp(name), ToastType.FAILURE);
        return;
    }

    rememberPull(userId);
    // straight past the click guard, since the magnet has its own stricter throttle above
    void movePersonToMe(userId).then(forbidden => {
        // a permissions refusal is settled. Every further attempt would be the same request and the
        // same red toast, over and over, until the tug of war counter happened to run out
        if (!forbidden) return;

        clearAutoPull();
        gaveUpAt.set(userId, Date.now());
        toast(T.magnetOffNoPermission(getUserDisplayName(userId)), ToastType.FAILURE);
    });
}

/**
 * Everything the magnet remembers between actions, dropped when the plugin stops. Leaving the tug of
 * war counter behind meant a magnet armed after a restart started out with a budget that had already
 * been spent.
 */
export function forgetMagnetState() {
    pullHistory.clear();
    gaveUpAt.clear();
}
