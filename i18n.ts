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

import { PlainSettings } from "@api/Settings";
import { LocaleStore } from "@webpack/common";

import { en, type Messages } from "./locales/en";
import { ru } from "./locales/ru";

/** Must match the plugin's `name`, since that is the key its settings live under. */
export const PLUGIN_NAME = "VoiceRadar-Discord";

export const AUTO_LANGUAGE = "auto";
const FALLBACK_LOCALE = "en-US";

/** A new language means a dictionary here and a label in LANGUAGE_LABELS. */
const dictionaries: Record<string, Messages> = {
    "en-US": en,
    ru
};

/** Shown in the dropdown in the language itself, because nobody looks for "Russian". */
export const LANGUAGE_LABELS: Record<string, string> = {
    "en-US": "English",
    ru: "Русский"
};

export const LANGUAGE_CODES = Object.keys(dictionaries);

/**
 * Every language's wording for "no name". Names are stored untranslated, but an entry written by an
 * older build can carry a translated one, and the store needs to recognise it as a placeholder
 * rather than as somebody's actual name.
 */
export const UNKNOWN_USER_LABELS: readonly string[] =
    Object.values(dictionaries).map(dictionary => dictionary.unknownUser);

/**
 * Deliberately the unproxied settings, and deliberately not the plugin's own `settings` object.
 *
 * Going through `settings` would be an import cycle, since settings.ts needs translated descriptions
 * at module load. Going through the proxied `Settings` would be worse. For a SELECT with nothing
 * stored yet, Vencord resolves the default by reading `options`, which is a getter that asks for a
 * translation, which asks for the language again. That recursion never ends on a first launch. The
 * plain object skips the defaulting, and an unset value already means "auto".
 */
function preferredLanguage(): string {
    try {
        return (PlainSettings as any).plugins?.[PLUGIN_NAME]?.language || AUTO_LANGUAGE;
    } catch {
        return AUTO_LANGUAGE;
    }
}

/**
 * LocaleStore is filled in asynchronously, so it can still be undefined while this plugin's modules
 * are evaluated. Discord keeps the same value in localStorage, readable immediately, which is the
 * only reason the fallback below exists.
 */
function discordLocale(): string {
    try {
        const fromStore = (LocaleStore as any)?.locale;
        if (fromStore) return fromStore;
    } catch {
        /* the store is not there yet */
    }

    try {
        const stored = window.localStorage?.getItem("locale");
        if (stored) return JSON.parse(stored);
    } catch {
        /* no access, or something that is not JSON */
    }

    return FALLBACK_LOCALE;
}

/** "ru-RU" and "ru" both land on the ru dictionary, anything unknown on English. */
function resolveLocale(): string {
    const preferred = preferredLanguage();
    const wanted = preferred === AUTO_LANGUAGE ? discordLocale() : preferred;

    if (dictionaries[wanted]) return wanted;

    const base = String(wanted).split("-")[0];
    return LANGUAGE_CODES.find(code => code.split("-")[0] === base) ?? FALLBACK_LOCALE;
}

/**
 * The resolution is worth caching for a moment. It reads the settings file and the locale store, and
 * it used to run on every key access. A hundred rows reading a dozen labels each meant thousands of
 * identical resolutions per redraw.
 *
 * A second collapses a whole render pass and still makes a language switch look instant.
 */
const LOCALE_CACHE_MS = 1000;
let cachedLocale = "";
let cachedAt = 0;

function activeDictionary(): Messages {
    const now = Date.now();

    if (now - cachedAt > LOCALE_CACHE_MS) {
        cachedLocale = resolveLocale();
        cachedAt = now;
    }

    return dictionaries[cachedLocale] ?? en;
}

/**
 * Resolved per property access rather than once at import, because the language can change while
 * Discord runs. A key the active dictionary lacks falls back to English instead of "undefined".
 */
export const T: Messages = new Proxy({} as Messages, {
    get(_target, key: string | symbol) {
        const active = activeDictionary();
        return (active as any)[key] ?? (en as any)[key];
    }
});
