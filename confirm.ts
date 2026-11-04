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

import * as Common from "@webpack/common";

import { reportBroken } from "./apiHealth";
import { T } from "./i18n";
import { toast, ToastType } from "./toast";

export interface ConfirmOptions {
    title: string;
    body: string;
    confirmText: string;
    cancelText: string;
    confirmColor?: string;
    onConfirm: () => void;
}

/** Asks inside the popped out radar when that window is in use, and says whether it did. */
let askInOwnWindow: ((options: ConfirmOptions) => boolean) | null = null;

export function setOwnWindowConfirm(ask: ((options: ConfirmOptions) => boolean) | null) {
    askInOwnWindow = ask;
}

export function confirmFirst(options: ConfirmOptions): boolean {
    // Discord draws its dialogs only in its main window, out of sight of the popped out radar.
    try {
        if (askInOwnWindow?.(options)) return true;
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not ask inside the radar window:", error);
    }

    try {
        const show = (Common as any).Alerts?.show;
        if (typeof show !== "function") throw new Error("Alerts.show is gone");

        show(options);
        return true;
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not show a confirmation:", error);
        reportBroken(T.apiConfirm);
        toast(T.confirmUnavailable, ToastType.FAILURE);
        return false;
    }
}
