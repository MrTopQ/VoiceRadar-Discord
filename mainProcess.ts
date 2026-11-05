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

import { PLUGIN_NAME } from "./i18n";

/** Everything native.ts exports, so a helper left over from an older version counts as missing too. */
export const MAIN_PROCESS_METHODS = [
    "revealWindow",
    "hideRadarWindow",
    "showRadarWindow",
    "registerGlobalHotkey",
    "setBackgroundThrottling",
    "unregisterGlobalHotkey",
    "openLookupWindow"
];

function readHelper() {
    return (typeof VencordNative !== "undefined"
        ? (VencordNative.pluginHelpers as any)?.[PLUGIN_NAME]
        : undefined) as PluginNative<typeof import("./native")> | undefined;
}

export const Native = readHelper();

/** The desktop app hands this half over only on a full start, so after an install or an update a reload of the page still runs without it. */
export function needsFullRestart(): boolean {
    if (typeof IS_DISCORD_DESKTOP === "undefined" || !IS_DISCORD_DESKTOP) return false;

    const helper = readHelper() as any;
    return MAIN_PROCESS_METHODS.some(name => typeof helper?.[name] !== "function");
}
