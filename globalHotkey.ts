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

/**
 * The system wide half of the hotkey. The listener in hotkey.ts only ever sees keys Discord itself
 * received, so it is deaf while you are in a game. Claiming the combination in the main process is
 * the only way around that, and it is off by default because it takes the combination away from
 * every other program on the machine.
 *
 * Nothing here exists in the browser build, which has no main process to ask.
 */
const Native = (typeof VencordNative !== "undefined"
    ? (VencordNative.pluginHelpers as any)?.[PLUGIN_NAME]
    : undefined) as PluginNative<typeof import("./native")> | undefined;

/** The main process reaches the window through this, so it is only here while the plugin runs. */
const BRIDGE = "$VoiceRadarHotkey";

let onTrigger: (() => boolean) | null = null;

/**
 * What became of the claim, not merely whether it worked.
 *
 * A plain boolean folded three different situations into one. Nothing was asked, the answer has not
 * come back yet, and the combination is held by another program all read as "not claimed", and the
 * window turned that into a green "the hotkey works while Discord is focused". For the last of the
 * three that is a lie by omission: the switch is on, the reader asked for the whole machine, and
 * they were refused. The toast that said so is gone within seconds, and the window they would go to
 * afterwards is exactly this one.
 */
type Claim = "idle" | "asking" | "held" | "taken";
let claim: Claim = "idle";

/**
 * Which request an answer belongs to. Rebinding sends these over IPC and nothing promises they come
 * back in order, so a refusal for the previous combination must not settle on the current one.
 */
let claimRequest = 0;

export type HotkeyReach = "global" | "window" | "needs-restart" | "taken" | "asking";

/** The two that mean the hotkey is doing what was asked of it. Everything else is worth a colour. */
export function isHotkeyReachSettled(reach: HotkeyReach): boolean {
    return reach === "global" || reach === "window";
}

export function getHotkeyReach(): HotkeyReach {
    if (!settings.store.globalHotkey) return "window";
    if (!Native) return "needs-restart";

    switch (claim) {
        case "held": return "global";
        case "taken": return "taken";
        // nothing has come back yet, which is a moment rather than a state, but a window opened
        // inside that moment should say so instead of guessing either way
        default: return "asking";
    }
}

/**
 * What became of the ask, not merely whether one was made.
 *
 * A plain boolean folded four different situations into one, exactly as it did for the hotkey
 * claim. Nothing was asked, nothing could be asked because this page has no main-process half, the
 * answer has not come back yet, and the main process tried and could not, all read as "not awake",
 * and the window turned that into one amber line telling the reader to restart Discord. For two of
 * the four that is the wrong instruction and for one of them it is a lie.
 */
type TimerClaim = "idle" | "asking" | "landed" | "refused";
let timerClaim: TimerClaim = "idle";

/**
 * The states the diagnostics row can be in, which are not the same as the states of the switch.
 *
 * "off" is a choice and reads green. "needs-restart" is the one a restart actually fixes, because
 * Discord hands the main-process half to the page when it loads and a reload of the page does not
 * get it. "refused" is the main process having tried and failed, which no restart is promised to
 * cure and which used to be reported as success.
 */
export type TimersState = "awake" | "off" | "needs-restart" | "refused" | "asking";

export function getTimersState(): TimersState {
    if (!settings.store.keepTimersAwake) return "off";
    if (!Native) return "needs-restart";

    switch (timerClaim) {
        case "landed": return "awake";
        case "refused": return "refused";
        // nothing has come back yet, which is a moment rather than a state, but a window opened
        // inside that moment should say so instead of guessing either way
        default: return "asking";
    }
}

/**
 * Which request the answer below belongs to. Stopping and starting the plugin sends two of these
 * back to back, over IPC, and nothing promises they come back in the order they went out. The later
 * request is the true one whichever answer lands first.
 */
let throttlingRequest = 0;

/**
 * Keeps the window's timers running at their normal pace while Discord sits in the background. See
 * setBackgroundThrottling in native.ts for what it costs and why it is worth it.
 */
export function keepTimersAwake(awake: boolean): void {
    if (!Native) {
        // nothing was asked, and getTimersState answers for that out of Native itself
        timerClaim = "idle";
        return;
    }

    const request = ++throttlingRequest;
    timerClaim = "asking";

    /*
     * The main process now says whether the window took it, rather than resolving either way. It
     * used to catch its own failure and answer nothing, so this marked the timers awake on the
     * strength of the call not having exploded, which is the one report this row exists to avoid.
     */
    void Native.setBackgroundThrottling(!awake).then(worked => {
        if (request !== throttlingRequest) return;
        timerClaim = worked ? "landed" : "refused";
    }).catch(() => {
        if (request !== throttlingRequest) return;
        timerClaim = "refused";
    });
}

/**
 * Follows the setting, and does nothing at all for a plugin that is not running.
 *
 * The switch can be flipped from a switched-off plugin's card, and this one reaches past the plugin
 * into the whole renderer, so acting on it there would leave every timer in Discord running at full
 * speed on behalf of something that is not there. onTrigger is the same evidence syncGlobalHotkey
 * uses, since start installs it and stop takes it away.
 */
export function syncBackgroundTimers(): void {
    if (!onTrigger) return;
    keepTimersAwake(!!settings.store.keepTimersAwake);
}

/**
 * Brings Discord forward, for a click that opens something in it. Silently does nothing in a browser
 * or before a restart has handed the page this half of the plugin, which is right, because in both
 * cases there is no minimised window to raise.
 */
export function revealDiscord(): void {
    void Native?.revealWindow();
}

/**
 * Claims or releases the combination to match the setting. Safe to call as often as you like, and
 * called again whenever the combination itself is rebound.
 */
export function syncGlobalHotkey(trigger?: () => boolean): void {
    if (trigger) onTrigger = trigger;

    /*
     * Nothing is claimed on behalf of a plugin that is not running.
     *
     * Vencord opens the settings panel from a switched-off plugin's card too, and the switch below
     * answers through an onChange that lands here. Flipping it there used to take the combination
     * away from the whole machine with nothing behind it, and worse, the press reached a page whose
     * bridge had been taken away, the main process read that silence as "the radar is shut", and
     * minimised Discord.
     *
     * onTrigger is the evidence, because start is what installs it and stop is what takes it away.
     */
    if (!onTrigger) return;

    if (!Native) {
        /*
         * The list of main process methods is handed to the page when it loads, so a page that
         * reloaded while Discord itself kept running does not know about this one yet. Saying so is
         * the whole point of this branch, since the switch would otherwise sit there doing nothing.
         */
        if (settings.store.globalHotkey && typeof IS_DISCORD_DESKTOP !== "undefined" && IS_DISCORD_DESKTOP) {
            toast(T.globalHotkeyNeedsRestart, ToastType.FAILURE);
        }
        return;
    }

    // the answer travels back to the main process, which decides what to do with the window
    (window as any)[BRIDGE] = () => onTrigger?.() ?? false;

    if (!settings.store.globalHotkey) {
        // nothing was asked for, so there is no verdict to keep. Bumped as well, so an answer to
        // the previous request cannot land afterwards and claim there is one
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

        // a combination another program already holds is refused rather than shared, and a hotkey
        // that quietly does nothing is worse than one that says why
        if (!claimed) toast(T.globalHotkeyTaken(combo), ToastType.FAILURE);
        else console.log("[VoiceRadar-Discord] the hotkey is now claimed system wide.", combo);
    });
}

/**
 * How long to let the typing settle before the combination is claimed again.
 *
 * Vencord's text field answers on every keystroke, so a combination typed by hand arrives one
 * character at a time. Claiming each of those meant asking the operating system for "A", then "Al",
 * and being refused by it twice with a red message each, on the way to a combination that was fine.
 * The recorder in the window needs none of this, because it hands over a whole combination at once.
 */
const SETTLE_MS = 600;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

/** For the settings field, where the value arrives a character at a time. See SETTLE_MS. */
export function scheduleGlobalHotkeySync(): void {
    if (settleTimer) clearTimeout(settleTimer);

    settleTimer = setTimeout(() => {
        settleTimer = null;
        syncGlobalHotkey();
    }, SETTLE_MS);
}

export function releaseGlobalHotkey(): void {
    onTrigger = null;
    // a verdict about this session, and an answer still in the air belongs to it too
    claimRequest++;
    claim = "idle";
    delete (window as any)[BRIDGE];

    // a claim still waiting out its delay belongs to a plugin that is no longer running
    if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
    }

    if (Native) void Native.unregisterGlobalHotkey();
}
