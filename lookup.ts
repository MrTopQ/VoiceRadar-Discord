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

import { type ApiHealth, HealthReport, isFn } from "./apiHealth";
import { T } from "./i18n";
import { Native, needsFullRestart } from "./mainProcess";
import { DEFAULT_LOOKUP_URL, settings } from "./settings";
import { toast, ToastType } from "./toast";

/** The first default, which the site read as a username and so showed somebody else. */
const BROKEN_DEFAULT_URL = "https://discord-sensor.com/users/{id}";

export function migrateLookupUrl() {
    if (settings.store.lookupUrl === BROKEN_DEFAULT_URL) settings.store.lookupUrl = DEFAULT_LOOKUP_URL;
}

/** The window lives in Vencord's main process helper, and a helper still waiting for a full restart is not a break. */
export function lookupProblems(): ApiHealth {
    return new HealthReport().nice(() => needsFullRestart() || isFn(Native?.openLookupWindow), T.apiLookupWindow);
}

export interface LookupLink {
    url: string;
    host: string;
}

/** The page for this person on the site from the settings, or null when there is no usable address. */
export function lookupLink(userId: string, template = String(settings.store.lookupUrl ?? "")): LookupLink | null {
    const trimmed = template.trim();
    if (!trimmed.includes("{id}") || !/^\d+$/.test(userId)) return null;

    let url: URL;
    try {
        url = new URL(trimmed.replaceAll("{id}", userId));
    } catch {
        return null;
    }

    if (url.protocol !== "https:") return null;
    return { url: url.href, host: url.hostname.replace(/^www\./, "") };
}

function openInBrowser(url: string) {
    try {
        VencordNative.native.openExternal(url);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not open the lookup page:", error);
        toast(T.lookupFailed, ToastType.FAILURE);
    }
}

/** Opens the page in the plugin's own window inside Discord, or in the browser until Discord has been fully restarted. */
export function openLookup(userId: string) {
    const link = lookupLink(userId);
    if (!link) return;

    const inApp = Native?.openLookupWindow;
    if (typeof inApp !== "function") {
        toast(T.lookupNeedsRestart, ToastType.MESSAGE);
        openInBrowser(link.url);
        return;
    }

    void inApp(link.url, link.host)
        .then(opened => {
            if (!opened) openInBrowser(link.url);
        })
        .catch(() => openInBrowser(link.url));
}
