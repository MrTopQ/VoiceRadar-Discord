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

// The whole module, so exports that Vencord removes do not break the build.
import * as Common from "@webpack/common";

import { proveWorking, reportBroken } from "./apiHealth";
import { T } from "./i18n";

export const ToastType = {
    MESSAGE: "message",
    SUCCESS: "success",
    FAILURE: "failure"
} as const;

export type ToastKind = typeof ToastType[keyof typeof ToastType];

const REPLACE_WINDOW_MS = 3500;

const VARIANTS: Record<ToastKind, string> = {
    message: "default",
    success: "success",
    failure: "critical"
};

let ourToastShownAt = 0;

function showWithAnyApi(message: string, type: ToastKind) {
    const common = Common as any;
    const toasts = common.Toasts;

    if (typeof common.createToast === "function" && typeof toasts?.show === "function") {
        toasts.show(common.createToast({ message, type }));
        return;
    }

    if (typeof toasts?.create === "function" && typeof toasts?.show === "function") {
        toasts.show(toasts.create(message, type));
        return;
    }

    if (typeof common.showToast !== "function") {
        throw new Error("this Vencord has no toast API the plugin knows");
    }

    common.showToast({ text: message, variant: VARIANTS[type] });
}

function dismissOurLastToast() {
    try {
        const pop = (Common as any).Toasts?.pop;
        if (typeof pop === "function") pop();
    } catch {
    }
}

export function toast(message: string, type: ToastKind = ToastType.MESSAGE) {
    if (Date.now() - ourToastShownAt < REPLACE_WINDOW_MS) dismissOurLastToast();

    ourToastShownAt = Date.now();

    try {
        showWithAnyApi(message, type);
        proveWorking(T.apiToasts);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not show a toast:", message, error);

        reportBroken(T.apiToasts);
    }
}
