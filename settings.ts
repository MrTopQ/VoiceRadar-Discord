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

export const CHIME_SOUND = "chime";
export const DEFAULT_JOIN_SOUND = CHIME_SOUND;
export const JOIN_SOUNDS = ["off", CHIME_SOUND, "user_join", "message1"];
export const DEFAULT_JOIN_SOUND_VOLUME = 60;

export const DEFAULT_WATCHED_SERVERS = 100;
export const MIN_WATCHED_SERVERS = 10;
export const MAX_WATCHED_SERVERS = 200;

/** Descriptions are getters so they follow the language. */
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
        isValid: (value: string) => (parseHotkey(value) ? true : T.settingHotkeyInvalid),
        onChange: () => void import("./globalHotkey").then(module => module.scheduleGlobalHotkeySync())
    },
    silentJoin: {
        type: OptionType.BOOLEAN,
        get description() {
            return T.settingSilentJoin;
        },
        default: false
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
    joinSound: {
        type: OptionType.SELECT,
        get description() {
            return T.settingJoinSound;
        },
        get options() {
            return [
                { label: T.joinSoundChime, value: CHIME_SOUND, default: true },
                { label: T.joinSoundJoin, value: "user_join" },
                { label: T.joinSoundPing, value: "message1" },
                { label: T.joinSoundOff, value: "off" }
            ];
        }
    },
    joinSoundVolume: {
        type: OptionType.SLIDER,
        get description() {
            return T.settingJoinSoundVolume;
        },
        markers: makeRange(0, 100, 10),
        default: DEFAULT_JOIN_SOUND_VOLUME,
        stickToMarkers: false
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
    watchedServerLimit: {
        type: OptionType.SLIDER,
        get description() {
            return T.settingWatchedServerLimit;
        },
        markers: makeRange(MIN_WATCHED_SERVERS, MAX_WATCHED_SERVERS, 10),
        default: DEFAULT_WATCHED_SERVERS,
        stickToMarkers: false
    },
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

export function getJoinSound(): string {
    const raw = String(settings.store.joinSound ?? DEFAULT_JOIN_SOUND);
    return JOIN_SOUNDS.includes(raw) ? raw : DEFAULT_JOIN_SOUND;
}

export function getJoinSoundVolume(): number {
    const raw = Number(settings.store.joinSoundVolume);
    if (!Number.isFinite(raw)) return DEFAULT_JOIN_SOUND_VOLUME / 100;

    return Math.min(100, Math.max(0, raw)) / 100;
}

export function getMovePace(): BatchPace {
    return MOVE_PACES[settings.store.movePace as MovePace] ?? MOVE_PACES[DEFAULT_MOVE_PACE];
}

export function getHistoryLimit(): number {
    const raw = Number(settings.store.historyLimit);
    if (!Number.isFinite(raw)) return DEFAULT_HISTORY_LIMIT;
    return Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.floor(raw)));
}

/** Switching channels is a gateway event, so even 0 seconds keeps a floor. */
const MIN_AUTO_JOIN_GAP_MS = 2000;

const MAX_AUTO_JOIN_GAP_MS = 5 * 60_000;

export function getAutoJoinCooldownMs(): number {
    const raw = Number(settings.store.autoJoinCooldown);
    if (!Number.isFinite(raw) || raw < 0) return 5000;

    const wanted = Math.floor(raw * 1000);
    return Math.min(MAX_AUTO_JOIN_GAP_MS, Math.max(MIN_AUTO_JOIN_GAP_MS, wanted));
}
