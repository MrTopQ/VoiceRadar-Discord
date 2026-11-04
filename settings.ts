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
import { renderCustomSoundPicker, renderJoinTest } from "./settingsRows";

export const DEFAULT_HISTORY_LIMIT = 15;
export const MIN_HISTORY_LIMIT = 5;
export const MAX_HISTORY_LIMIT = 200;
export const DEFAULT_LOOKUP_URL = "https://discord-sensor.com/members/{id}";
export const DEFAULT_HOTKEY = "Alt+2";

export type MovePace = "careful" | "fast" | "instant";

export const MOVE_PACES: Record<MovePace, BatchPace> = {
    careful: { parallel: 1, spacingMs: 600 },
    fast: { parallel: 4, spacingMs: 150 },
    instant: { parallel: 8, spacingMs: 0 }
};

export const DEFAULT_MOVE_PACE: MovePace = "fast";

export const CHIME_SOUND = "chime";
export const CUSTOM_SOUND = "custom";
export const ALERT_OFF = "off";
export const DEFAULT_JOIN_ALERT = CHIME_SOUND;
const JOIN_ALERTS = [CHIME_SOUND, CUSTOM_SOUND, ALERT_OFF];
export const DEFAULT_JOIN_SOUND_VOLUME = 60;

export const DEFAULT_RECENT_MARK_MINUTES = 1;
export const MAX_RECENT_MARK_MINUTES = 5;

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
        markers: [MIN_HISTORY_LIMIT, ...makeRange(25, MAX_HISTORY_LIMIT, 25)],
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
        default: 0
    },
    joinAlert: {
        type: OptionType.SELECT,
        get description() {
            return T.settingJoinAlert;
        },
        get options() {
            return [
                { label: T.joinAlertChime, value: CHIME_SOUND, default: true },
                { label: T.joinAlertCustom, value: CUSTOM_SOUND },
                { label: T.joinAlertOff, value: ALERT_OFF }
            ];
        }
    },
    joinSoundFile: {
        type: OptionType.COMPONENT,
        hidden() {
            return getJoinAlert() !== CUSTOM_SOUND;
        },
        component: () => renderCustomSoundPicker()
    },
    joinSoundVolume: {
        type: OptionType.SLIDER,
        hidden() {
            return getJoinAlert() === ALERT_OFF;
        },
        get description() {
            return T.settingJoinSoundVolume;
        },
        markers: makeRange(0, 100, 10),
        default: DEFAULT_JOIN_SOUND_VOLUME,
        stickToMarkers: false
    },
    joinTest: {
        type: OptionType.COMPONENT,
        hidden() {
            return getJoinAlert() === ALERT_OFF;
        },
        component: () => renderJoinTest()
    },
    recentMarkMinutes: {
        type: OptionType.SLIDER,
        get description() {
            return T.settingRecentMarkMinutes;
        },
        markers: makeRange(1, MAX_RECENT_MARK_MINUTES, 1),
        default: DEFAULT_RECENT_MARK_MINUTES,
        stickToMarkers: true
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
        default: true
    },
    lookupUrl: {
        type: OptionType.STRING,
        get description() {
            return T.settingLookupUrl;
        },
        default: DEFAULT_LOOKUP_URL
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
    },
    // Not shown in the settings, it holds where each window was dragged to.
    windowPlaces: {
        type: OptionType.CUSTOM,
        default: {}
    }
});

export function getWatchedServerLimit(): number {
    const raw = Number(settings.store.watchedServerLimit);
    if (!Number.isFinite(raw)) return DEFAULT_WATCHED_SERVERS;
    return Math.min(MAX_WATCHED_SERVERS, Math.max(MIN_WATCHED_SERVERS, Math.floor(raw)));
}

/** The sound and the notification used to be two settings, Discord's own sounds among the choices. */
export function migrateJoinAlert() {
    const store = settings.store as any;
    if (store.joinSound === undefined && store.notifyStyle === undefined) return;

    if (store.joinSound === ALERT_OFF) store.joinAlert = ALERT_OFF;
    else if (store.joinSound === CUSTOM_SOUND) store.joinAlert = CUSTOM_SOUND;

    delete store.joinSound;
    delete store.notifyStyle;
}

/** Vencord saves a default the first time it is read, so the old 5 seconds sit in everybody's settings. Runs once, so 5 can still be chosen by hand. */
export function migrateAutoJoinCooldown() {
    const store = settings.store as any;
    if (store.autoJoinCooldownMoved) return;

    if (Number(store.autoJoinCooldown) === OLD_DEFAULT_COOLDOWN_SECONDS) store.autoJoinCooldown = 0;
    store.autoJoinCooldownMoved = true;
}

export function getJoinAlert(): string {
    const raw = String(settings.store.joinAlert ?? DEFAULT_JOIN_ALERT);
    return JOIN_ALERTS.includes(raw) ? raw : DEFAULT_JOIN_ALERT;
}

export function getRecentMarkMs(): number {
    const raw = Number(settings.store.recentMarkMinutes);
    const minutes = Number.isFinite(raw) ? Math.min(MAX_RECENT_MARK_MINUTES, Math.max(1, Math.round(raw))) : DEFAULT_RECENT_MARK_MINUTES;
    return minutes * 60_000;
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

/** 0 follows at once, nobody hops channels faster than a person can click anyway. */
export const MIN_AUTO_JOIN_GAP_MS = 0;

export const MAX_AUTO_JOIN_GAP_MS = 5 * 60_000;

const DEFAULT_AUTO_JOIN_GAP_MS = 0;

const OLD_DEFAULT_COOLDOWN_SECONDS = 5;

/** What the setting holds, before the floor and the ceiling. */
export function getAutoJoinCooldownSettingMs(): number {
    const raw = Number(settings.store.autoJoinCooldown);
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw * 1000) : DEFAULT_AUTO_JOIN_GAP_MS;
}

export function getAutoJoinCooldownMs(): number {
    return Math.min(MAX_AUTO_JOIN_GAP_MS, Math.max(MIN_AUTO_JOIN_GAP_MS, getAutoJoinCooldownSettingMs()));
}
