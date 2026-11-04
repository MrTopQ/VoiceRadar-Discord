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

import { getMyGuildId, getVoiceInfo } from "./channels";
import { T } from "./i18n";
import { forgetPullHistory, magnetCooldownLeft } from "./magnet";
import { getUserDisplayName } from "./names";
import { pullToMyChannel } from "./pull";
import { cancelQueue, getQueueEntry } from "./queue";
import { getAutoJoinCooldownMs, getAutoJoinCooldownSettingMs } from "./settings";
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
import { forgetFollowRefusals, keepFollowing, MAX_FORCED_RETURNS } from "./tracker";

const inSeconds = (ms: number) => Math.round(ms / 100) / 10;

/** Says what the setting holds and what the plugin really waits, since the floor and ceiling can differ from it. */
export function describeAutoJoinPace(): string {
    const wanted = inSeconds(getAutoJoinCooldownSettingMs());
    const used = inSeconds(getAutoJoinCooldownMs());

    const pace = wanted > used ? T.autoJoinPaceCeiling(wanted, used)
        : used === 0 ? T.autoJoinNoPause
            : T.autoJoinPace(used);

    return `${pace} ${T.autoJoinReturns(MAX_FORCED_RETURNS)}`;
}

export type MagnetResult = "on" | "off" | "cooling";

export function armMagnet(userId: string, fallbackName: string): MagnetResult {
    // Arming wipes the pull history, so the cooldown is checked first.
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

export function armAutoJoin(userId: string, fallbackName: string): boolean {
    if (!isTracked(userId)) {
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

    forgetFollowRefusals();
    keepFollowing();

    return true;
}

export function toggleMagnetFor(userId: string, storedName: string) {
    const result = armMagnet(userId, storedName);

    if (result === "cooling") return;

    const name = getUserDisplayName(userId, storedName);

    if (result === "off") {
        toast(T.magnetOffFor(name), ToastType.MESSAGE);
        return;
    }

    // Pulling only works inside one server, elsewhere the magnet waits and its button says why.
    const voice = getVoiceInfo(userId);
    if (voice && !voice.isMyChannel && voice.guildId === getMyGuildId()) void pullToMyChannel(userId);

    toast(T.magnetOnFor(name), ToastType.SUCCESS);
}

export function toggleAutoJoinFor(userId: string, storedName: string) {
    const following = armAutoJoin(userId, storedName);
    const name = getUserDisplayName(userId, storedName);

    if (!following) {
        toast(T.autoJoinCleared, ToastType.SUCCESS);
        return;
    }

    toast(T.autoJoinTargetSet(name), ToastType.SUCCESS);
}
