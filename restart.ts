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

import { getMyChannelId } from "./channels";
import { confirmFirst } from "./confirm";
import { T } from "./i18n";
import { shutdownSightings } from "./sightings";
import { shutdownStore } from "./store";
import { toast, ToastType } from "./toast";
import { shutdownWatchLog } from "./watchLog";

function relauncher(): (() => void) | null {
    const relaunch = (window as any).DiscordNative?.app?.relaunch;
    return typeof relaunch === "function" ? relaunch : null;
}

/** A relaunch ends the page without the plugin's usual stop, so what still waits on a timer is written first. */
async function restartNow() {
    const relaunch = relauncher();
    if (!relaunch) {
        toast(T.restartByHand, ToastType.FAILURE);
        return;
    }

    await Promise.allSettled([shutdownSightings(), shutdownWatchLog(), shutdownStore()]);
    relaunch();
}

export function askToRestartDiscord() {
    if (!getMyChannelId()) {
        void restartNow();
        return;
    }

    confirmFirst({
        title: T.restartConfirmTitle,
        body: T.restartConfirmBody,
        confirmText: T.restartConfirmButton,
        cancelText: T.cancel,
        onConfirm: () => void restartNow()
    });
}
