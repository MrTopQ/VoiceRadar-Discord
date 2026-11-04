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

/** Discord can send several voice updates for one move. */
const PULL_COOLDOWN_MS = 300;
const USER_WINDOW_MS = 60_000;

export const MAX_RETURNS_PER_MINUTE = 10;

export const GIVE_UP_COOLDOWN_MS = 30_000;
const gaveUpAt = new Map<string, number>();

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

    for (const [id, stamps] of pullHistory) {
        if (id !== userId && !recent(stamps, USER_WINDOW_MS).length) pullHistory.delete(id);
    }
}

export function forgetPullHistory(userId?: string) {
    if (userId) pullHistory.delete(userId);
    else pullHistory.clear();
}

export function keepUserHere(userId: string) {
    if (!canMoveUser(userId)) return;
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
    void movePersonToMe(userId).then(forbidden => {
        if (!forbidden) return;

        clearAutoPull();
        gaveUpAt.set(userId, Date.now());
        toast(T.magnetOffNoPermission(getUserDisplayName(userId)), ToastType.FAILURE);
    });
}

export function forgetMagnetState() {
    pullHistory.clear();
    gaveUpAt.clear();
}
