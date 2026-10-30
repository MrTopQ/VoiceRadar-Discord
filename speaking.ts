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

import { findStoreLazy } from "@webpack";

import { type ApiHealth, HealthReport } from "./apiHealth";
import { T } from "./i18n";

/** Discord only knows who is speaking in the channel you are connected to. */
const SpeakingStore = findStoreLazy("SpeakingStore");

function store(): any {
    try {
        return typeof (SpeakingStore as any)?.isSpeaking === "function" ? SpeakingStore : null;
    } catch {
        return null;
    }
}

export function speakingProblems(): ApiHealth {
    return new HealthReport().nice(() => store() != null, T.apiSpeaking);
}

export function isSpeaking(userId: string): boolean {
    try {
        return store()?.isSpeaking(userId) === true;
    } catch {
        return false;
    }
}

/** Calls back whenever anyone in your channel starts or stops speaking, and returns how to stop listening. */
export function watchSpeaking(onChange: () => void): () => void {
    const speaking = store();
    if (typeof speaking?.addChangeListener !== "function") return () => { };

    speaking.addChangeListener(onChange);
    return () => speaking.removeChangeListener?.(onChange);
}
