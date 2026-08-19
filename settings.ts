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

import { definePluginSettings } from "@api/Settings";
import { makeRange, OptionType } from "@utils/types";

/*
 * hotkey.ts imports this file back, which is a cycle on paper and not one in practice. Neither side
 * touches the other while the modules are being evaluated, and parseHotkey is a plain declaration.
 * The alternative was a second copy of the parsing rule here, and two rules that can drift apart is
 * the worse of the two problems.
 */
import { parseHotkey } from "./hotkey";
import { AUTO_LANGUAGE, LANGUAGE_CODES, LANGUAGE_LABELS, T } from "./i18n";
import type { BatchPace } from "./moveBatch";

export const DEFAULT_HISTORY_LIMIT = 15;
export const MIN_HISTORY_LIMIT = 5;
export const MAX_HISTORY_LIMIT = 100;
export const DEFAULT_HOTKEY = "Alt+2";

export type MovePace = "careful" | "fast" | "instant";

export const MOVE_PACES: Record<MovePace, BatchPace> = {
    careful: { parallel: 1, spacingMs: 600 },
    fast: { parallel: 4, spacingMs: 150 },
    instant: { parallel: 8, spacingMs: 0 }
};

export const DEFAULT_MOVE_PACE: MovePace = "fast";

/**
 * How many servers may be asked to keep sending voice states.
 *
 * The servers your people were last seen in are asked first, so the limit only ever decides what
 * happens past them. Every one of these is a subscription the client would not otherwise hold, and
 * they are taken one at a time, over a second apart, so a high number costs a slow trickle after a
 * reconnect rather than a burst. Blindness is the thing worth avoiding, so the default is generous.
 */
export const DEFAULT_WATCHED_SERVERS = 100;
export const MIN_WATCHED_SERVERS = 10;
export const MAX_WATCHED_SERVERS = 200;

/**
 * Descriptions and option labels are getters on purpose. Vencord keeps this object by reference and
 * reads the fields while rendering, so a getter runs after the locale store exists, and again right
 * after you pick another language. That is what makes the panel translate itself without a restart.
 */
export const settings = definePluginSettings({
    language: {
        type: OptionType.SELECT,
        get description() {
            return T.settingLanguage;
        },
        get options() {
            return [
                { label: T.settingLanguageAuto, value: AUTO_LANGUAGE, default: true },
                ...LANGUAGE_CODES.map(code => ({ label: LANGUAGE_LABELS[code] ?? code, value: code }))
            ];
        }
    },
    historyLimit: {
        type: OptionType.SLIDER,
        get description() {
            return T.settingHistoryLimit;
        },
        markers: makeRange(MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT, 5),
        default: DEFAULT_HISTORY_LIMIT,
        stickToMarkers: false
    },
    hotkey: {
        type: OptionType.STRING,
        get description() {
            return T.settingHotkey;
        },
        default: DEFAULT_HOTKEY,
        /*
         * A combination with no key in it can never fire, and half of one is what this field holds
         * for most of the time somebody is typing into it. Saying so under the field beats storing
         * it and leaving the hotkey quietly dead.
         */
        isValid: (value: string) => (parseHotkey(value) ? true : T.settingHotkeyInvalid),
        /*
         * The listener inside Discord reads the stored string on every key, so it needs no telling.
         * The system wide claim is the opposite, it was handed one combination and holds it until
         * somebody takes it back. The recorder in the window already does this, and typing a new
         * combination straight into the field here used to leave the machine answering the old one.
         *
         * Deferred, because this field answers on every keystroke. See scheduleGlobalHotkeySync.
         */
        onChange: () => void import("./globalHotkey").then(module => module.scheduleGlobalHotkeySync())
    },
    silentJoin: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingSilentJoin;
        },
        default: false
    },
    autoJoinEnabled: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingAutoJoinEnabled;
        },
        default: true
    },
    autoJoinOnlyWhenIdle: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingAutoJoinOnlyWhenIdle;
        },
        default: false
    },
    autoJoinCooldown: {
        type: OptionType.NUMBER,
        get description() {
            return T.settingAutoJoinCooldown;
        },
        default: 5
    },
    notifyStyle: {
        type: OptionType.SELECT,
        get description() {
            return T.settingNotifyStyle;
        },
        get options() {
            return [
                { label: T.notifyStyleNotification, value: "notification", default: true },
                { label: T.notifyStyleToast, value: "toast" },
                { label: T.notifyStyleBoth, value: "both" }
            ];
        }
    },
    queueForFullChannels: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingQueueForFullChannels;
        },
        default: true
    },
    trackAutomatically: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingTrackAutomatically;
        },
        default: true
    },
    /**
     * The one setting whose right answer depends on the account rather than on taste. Discord only
     * holds voice states for servers the client is subscribed to, so a server outside this number is
     * one the plugin is blind to until you open it.
     */
    watchedServerLimit: {
        type: OptionType.SLIDER,
        get description() {
            return T.settingWatchedServerLimit;
        },
        markers: makeRange(MIN_WATCHED_SERVERS, MAX_WATCHED_SERVERS, 10),
        default: DEFAULT_WATCHED_SERVERS,
        stickToMarkers: false
    },
    /**
     * On by default, because without it a notification meant to arrive in three seconds arrives in
     * five minutes, which is most of the point of the plugin while Discord sits in the tray.
     *
     * Worth being able to switch off all the same. It is the one thing here that reaches past the
     * plugin and changes the whole renderer, so while you are in a game every timer in Discord keeps
     * running at full speed rather than being slowed the way Chromium would slow them, and that is
     * work the machine does while something else wants the processor.
     */
    keepTimersAwake: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingKeepTimersAwake;
        },
        default: true,
        onChange: () => void import("./globalHotkey").then(module => module.syncBackgroundTimers())
    },
    movePace: {
        type: OptionType.SELECT,
        get description() {
            return T.settingMovePace;
        },
        get options() {
            return [
                { label: T.movePaceCareful, value: "careful" },
                { label: T.movePaceFast, value: "fast", default: true },
                { label: T.movePaceInstant, value: "instant" }
            ];
        }
    },
    moderatorMode: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingModeratorMode;
        },
        default: false
    },
    showPanelButton: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingShowPanelButton;
        },
        default: true,
        restartNeeded: true
    },
    /**
     * Off by default on purpose. It takes the combination away from every other program on the
     * machine, which is exactly the point and exactly the reason not to do it behind your back.
     */
    globalHotkey: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingGlobalHotkey;
        },
        default: false,
        onChange: () => void import("./globalHotkey").then(module => module.syncGlobalHotkey())
    }
});

export function getWatchedServerLimit(): number {
    const raw = Number(settings.store.watchedServerLimit);
    if (!Number.isFinite(raw)) return DEFAULT_WATCHED_SERVERS;
    return Math.min(MAX_WATCHED_SERVERS, Math.max(MIN_WATCHED_SERVERS, Math.floor(raw)));
}

export function getMovePace(): BatchPace {
    return MOVE_PACES[settings.store.movePace as MovePace] ?? MOVE_PACES[DEFAULT_MOVE_PACE];
}

export function getHistoryLimit(): number {
    const raw = Number(settings.store.historyLimit);
    if (!Number.isFinite(raw)) return DEFAULT_HISTORY_LIMIT;
    return Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.floor(raw)));
}

/**
 * Switching voice channels is a gateway event and the gateway counts them, so even "0 seconds" keeps
 * a floor. Following someone who hops every 300ms would otherwise pile up events until Discord drops
 * the connection.
 *
 * Two seconds rather than the fraction of one it used to be. The connection itself takes about that
 * long, so nothing waits on this in practice, and a client that answers somebody else's hop inside a
 * few hundred milliseconds, over and over, is not doing anything a person at a keyboard does.
 */
const MIN_AUTO_JOIN_GAP_MS = 2000;

/**
 * The ceiling, because this is the one setting you type rather than drag.
 *
 * A slider cannot be wrong by a factor of a hundred and a number field can. 500 meant to be 5 is an
 * eight minute cooldown, during which auto-join simply never happens and nothing anywhere says why.
 * Five minutes is longer than any deliberate use of this and short enough to notice.
 */
const MAX_AUTO_JOIN_GAP_MS = 5 * 60_000;

export function getAutoJoinCooldownMs(): number {
    const raw = Number(settings.store.autoJoinCooldown);
    if (!Number.isFinite(raw) || raw < 0) return 5000;

    const wanted = Math.floor(raw * 1000);
    return Math.min(MAX_AUTO_JOIN_GAP_MS, Math.max(MIN_AUTO_JOIN_GAP_MS, wanted));
}
