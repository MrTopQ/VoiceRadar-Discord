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

import { getVoiceInfo } from "./channels";
import { T } from "./i18n";
import { forgetPullHistory, magnetCooldownLeft } from "./magnet";
import { getUserDisplayName } from "./names";
import { pullToMyChannel } from "./pull";
import { cancelQueue, getQueueEntry } from "./queue";
import { settings } from "./settings";
import {
    addUser,
    getAutoJoinTarget,
    getAutoPullTarget,
    isTracked,
    setAutoJoinTarget,
    setAutoPullTarget,
    toggleAutoJoin,
    toggleAutoPull
} from "./store";
import { toast, ToastType } from "./toast";
import { forgetFollowRefusals, keepFollowing } from "./tracker";

/**
 * "on" and "off" are the new state of the magnet. "cooling" means it was refused because it had just
 * given up on this person, and a toast has already said so.
 */
export type MagnetResult = "on" | "off" | "cooling";

/**
 * The magnet is the mirror image of auto-join. One takes you to them, the other brings them to you,
 * and all three of these plus a slot queue decide where somebody ends up, so arming one disarms the
 * others.
 *
 * State change only. What a click additionally does lives in toggleMagnetFor, so both entry points
 * behave the same.
 *
 * @param fallbackName the name to store if Discord has not cached this user. Must be a stored name,
 * never a displayed one, or a translated placeholder ends up in the saved list.
 */
export function armMagnet(userId: string, fallbackName: string): MagnetResult {
    // arming wipes the pull history, so right after giving up it would hand out a fresh budget
    const cooldown = magnetCooldownLeft(userId);
    if (cooldown > 0) {
        toast(T.magnetCoolingDown(getUserDisplayName(userId, fallbackName), cooldown), ToastType.MESSAGE);
        return "cooling";
    }

    forgetPullHistory(userId);

    if (!isTracked(userId)) {
        addUser(userId, fallbackName, { autoPull: true });
        setAutoPullTarget(userId);
    } else {
        toggleAutoPull(userId);
    }

    const holding = getAutoPullTarget()?.id === userId;
    if (!holding) return "off";

    const queued = getQueueEntry();
    if (queued) cancelQueue(T.queueCancelledForMagnet(queued.channelLabel, getUserDisplayName(userId, fallbackName)));

    return "on";
}

/** @param fallbackName a stored name, never a displayed one. See armMagnet. */
export function armAutoJoin(userId: string, fallbackName: string): boolean {
    if (!isTracked(userId)) {
        // the flag goes in right away so the limit cannot drop them, then the pass below switches
        // the previous target off
        addUser(userId, fallbackName, { autoJoin: true });
        setAutoJoinTarget(userId);
    } else {
        toggleAutoJoin(userId);
    }

    const following = getAutoJoinTarget()?.id === userId;
    if (!following) return false;

    const queued = getQueueEntry();
    if (queued) {
        cancelQueue(T.queueCancelledForAutoJoin(queued.channelLabel, getUserDisplayName(userId, fallbackName)));
    }

    /*
     * Arming it also means go to them now, not only the next time they move. The magnet has always
     * worked that way and this did not, so setting the marker on somebody already sitting in a
     * channel, and a full one above all, looked like a switch that did nothing.
     *
     * The refusals are dropped first, since a click is a newer instruction than either of them.
     * Without that, arming on somebody whose channel you had just stepped out of did nothing at
     * all, which is the same silent switch this was written to fix.
     */
    forgetFollowRefusals();
    keepFollowing();

    return true;
}

/**
 * What a click on the magnet does, wherever it was clicked. The row button and the menu entry used
 * to behave differently, and from the menu it looked like nothing had happened.
 *
 * @param storedName the name to save if Discord has not cached this user. See armMagnet.
 */
export function toggleMagnetFor(userId: string, storedName: string) {
    const result = armMagnet(userId, storedName);

    // "cooling" already said why, and another toast would replace that one
    if (result === "cooling") return;

    const name = getUserDisplayName(userId, storedName);

    if (result === "off") {
        toast(T.magnetOffFor(name), ToastType.MESSAGE);
        return;
    }

    // arming it also means bring them here now, not only the next time they move
    const voice = getVoiceInfo(userId);
    if (voice && !voice.isMyChannel) void pullToMyChannel(userId);

    toast(T.magnetOnFor(name), ToastType.SUCCESS);
}

/** What a click on auto-join does, wherever it was clicked. See toggleMagnetFor. */
export function toggleAutoJoinFor(userId: string, storedName: string) {
    const following = armAutoJoin(userId, storedName);
    const name = getUserDisplayName(userId, storedName);

    if (!following) {
        toast(T.autoJoinCleared, ToastType.SUCCESS);
        return;
    }

    // claiming success while the master switch is off would be a lie, nothing would follow
    if (!settings.store.autoJoinEnabled) {
        toast(T.autoJoinTargetSetButOff(name), ToastType.MESSAGE);
        return;
    }

    toast(T.autoJoinTargetSet(name), ToastType.SUCCESS);
}
