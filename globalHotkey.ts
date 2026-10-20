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

import type { PluginNative } from "@utils/types";

import { formatHotkey, parseHotkey } from "./hotkey";
import { PLUGIN_NAME, T } from "./i18n";
import { DEFAULT_HOTKEY, settings } from "./settings";
import { toast, ToastType } from "./toast";

const Native = (typeof VencordNative !== "undefined"
    ? (VencordNative.pluginHelpers as any)?.[PLUGIN_NAME]
    : undefined) as PluginNative<typeof import("./native")> | undefined;

/** The main process calls the window through this. */
const BRIDGE = "$VoiceRadarHotkey";

let onTrigger: (() => boolean) | null = null;

type Claim = "idle" | "asking" | "held" | "taken";
let claim: Claim = "idle";

let claimRequest = 0;

export type HotkeyReach = "global" | "window" | "needs-restart" | "taken" | "asking";

export function isHotkeyReachSettled(reach: HotkeyReach): boolean {
    return reach === "global" || reach === "window";
}

export function getHotkeyReach(): HotkeyReach {
    if (!settings.store.globalHotkey) return "window";
    if (!Native) return "needs-restart";

    switch (claim) {
        case "held": return "global";
        case "taken": return "taken";
        default: return "asking";
    }
}

type TimerClaim = "idle" | "asking" | "landed" | "refused";
let timerClaim: TimerClaim = "idle";

export type TimersState = "awake" | "off" | "needs-restart" | "refused" | "asking";

export function getTimersState(): TimersState {
    if (!settings.store.keepTimersAwake) return "off";
    if (!Native) return "needs-restart";

    switch (timerClaim) {
        case "landed": return "awake";
        case "refused": return "refused";
        default: return "asking";
    }
}

let throttlingRequest = 0;

export function keepTimersAwake(awake: boolean): void {
    if (!Native) {
        timerClaim = "idle";
        return;
    }

    const request = ++throttlingRequest;
    timerClaim = "asking";

    void Native.setBackgroundThrottling(!awake).then(worked => {
        if (request !== throttlingRequest) return;
        timerClaim = worked ? "landed" : "refused";
    }).catch(() => {
        if (request !== throttlingRequest) return;
        timerClaim = "refused";
    });
}

export function syncBackgroundTimers(): void {
    if (!onTrigger) return;
    keepTimersAwake(!!settings.store.keepTimersAwake);
}

export function revealDiscord(): void {
    void Native?.revealWindow();
}

export function syncGlobalHotkey(trigger?: () => boolean): void {
    if (trigger) onTrigger = trigger;

    if (!onTrigger) return;

    if (!Native) {
        // After a reload the page only knows the main process methods from the last full start.
        if (settings.store.globalHotkey && typeof IS_DISCORD_DESKTOP !== "undefined" && IS_DISCORD_DESKTOP) {
            toast(T.globalHotkeyNeedsRestart, ToastType.FAILURE);
        }
        return;
    }

    (window as any)[BRIDGE] = () => onTrigger?.() ?? false;

    if (!settings.store.globalHotkey) {
        claimRequest++;
        claim = "idle";
        void Native.unregisterGlobalHotkey();
        return;
    }

    const combo = formatHotkey(parseHotkey(settings.store.hotkey || DEFAULT_HOTKEY));
    const request = ++claimRequest;

    claim = "asking";

    void Native.registerGlobalHotkey(combo).then(claimed => {
        if (request !== claimRequest) return;

        claim = claimed ? "held" : "taken";

        if (!claimed) toast(T.globalHotkeyTaken(combo), ToastType.FAILURE);
        else console.log("[VoiceRadar-Discord] the hotkey is now claimed system wide.", combo);
    });
}

const SETTLE_MS = 600;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleGlobalHotkeySync(): void {
    if (settleTimer) clearTimeout(settleTimer);

    settleTimer = setTimeout(() => {
        settleTimer = null;
        syncGlobalHotkey();
    }, SETTLE_MS);
}

export function releaseGlobalHotkey(): void {
    onTrigger = null;
    claimRequest++;
    claim = "idle";
    delete (window as any)[BRIDGE];

    if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
    }

    if (Native) void Native.unregisterGlobalHotkey();
}
