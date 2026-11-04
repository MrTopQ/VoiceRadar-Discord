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

import { plugins } from "@api/PluginManager";
import { openPluginModal } from "@components/settings";

import { PLUGIN_NAME, T } from "../i18n";
import { settings } from "../settings";
import { toast, ToastType } from "../toast";

export type SettingKey = keyof typeof settings.def;

const FIND_FOR_MS = 2000;
const FIND_STEP_MS = 50;
const FLASH_MS = 1800;

/** Opens the plugin's settings, scrolled to one of them when asked, and says so when Vencord cannot. */
export function openPluginSettings(focus?: SettingKey) {
    const plugin = plugins[PLUGIN_NAME];
    try {
        if (!plugin) throw new Error(`no plugin named ${PLUGIN_NAME}`);
        openPluginModal(plugin);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not open the plugin settings:", error);
        toast(T.settingsUnavailable, ToastType.FAILURE);
        return;
    }

    const description = focus ? String((settings.def[focus] as { description?: string; }).description ?? "").trim() : "";
    if (description) showSetting(description, Date.now() + FIND_FOR_MS);
}

/** Vencord draws the settings a moment after the window opens, and names each one only by its description. */
function showSetting(description: string, until: number) {
    const section = findSection(description);
    if (!section) {
        if (Date.now() < until) setTimeout(() => showSetting(description, until), FIND_STEP_MS);
        return;
    }

    section.scrollIntoView({ block: "center", behavior: "smooth" });
    section.classList.add("vr-setting-flash");
    setTimeout(() => section.classList.remove("vr-setting-flash"), FLASH_MS);
}

function findSection(description: string): HTMLElement | null {
    for (const text of document.querySelectorAll(".vc-plugins-setting-description")) {
        if (text.textContent?.trim() === description) return text.closest<HTMLElement>(".vc-plugins-setting-section");
    }
    return null;
}
