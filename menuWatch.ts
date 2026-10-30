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

import { proveWorking, reportBroken } from "./apiHealth";
import { T } from "./i18n";

export const USER_MENUS = ["user-context", "user-profile-actions"];
export const CHANNEL_MENUS = ["channel-context"];

/** Three menus about a person or a voice channel under a name we do not patch mean Discord renamed ours. */
const STRANGE_MENUS_BEFORE_REPORT = 3;

/** Discord draws one open menu several times, and those draws count as one opening. */
const SAME_OPENING_MS = 1500;

interface Watch {
    ours: string[];
    /** A renamed menu keeps this word, while menus that only carry a person or a channel along, like the stream menu, do not have it. */
    word: string;
    label: () => string;
    ran: boolean;
    strange: number;
    lastStrangeAt: number;
}

const watches = {
    user: { ours: USER_MENUS, word: "user", label: () => T.apiUserMenuEntries, ran: false, strange: 0, lastStrangeAt: 0 } as Watch,
    channel: { ours: CHANNEL_MENUS, word: "channel", label: () => T.apiChannelMenuEntries, ran: false, strange: 0, lastStrangeAt: 0 } as Watch
};

export function noteOurMenu(kind: keyof typeof watches) {
    const watch = watches[kind];
    watch.ran = true;
    watch.strange = 0;
    proveWorking(watch.label());
}

function isUser(value: any): boolean {
    return typeof value?.id === "string" && typeof value?.username === "string";
}

function isVoiceChannel(value: any): boolean {
    return typeof value?.id === "string" && (value?.type === 2 || value?.type === 13);
}

function noteStrange(watch: Watch, navId: string) {
    if (watch.ran || watch.ours.includes(navId) || !navId.includes(watch.word)) return;

    const now = Date.now();
    const sameOpening = now - watch.lastStrangeAt < SAME_OPENING_MS;
    watch.lastStrangeAt = now;
    if (sameOpening) return;

    watch.strange++;
    if (watch.strange < STRANGE_MENUS_BEFORE_REPORT) return;

    console.warn(`[VoiceRadar-Discord] Discord's menu for this is now called "${navId}", so the Voice Radar entries are missing from it.`);
    reportBroken(watch.label());
}

/** Sees every menu Discord opens, to notice when the ones we add to stop showing up. */
export function watchMenus(navId: string, _children: unknown, props?: any) {
    // A person in a voice channel brings the channel along, and that is still a menu about the person.
    if (isUser(props?.user)) noteStrange(watches.user, navId);
    else if (isVoiceChannel(props?.channel)) noteStrange(watches.channel, navId);
}

export function forgetMenuWatch() {
    for (const watch of Object.values(watches)) {
        watch.ran = false;
        watch.strange = 0;
        watch.lastStrangeAt = 0;
    }
}
