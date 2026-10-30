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

import { BrowserWindow, globalShortcut, type IpcMainInvokeEvent } from "electron";

/** The in-window hotkey only works while Discord has focus, so it is also registered system wide here. */

let registered: string | null = null;

function toAccelerator(hotkey: string): string {
    return hotkey
        .split("+")
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => (part.toLowerCase() === "meta" ? "Super" : part))
        .join("+");
}

let raisedByHotkey = false;

/** A window that was hidden can show a stale frame until it repaints. */
const REPAINT_DELAYS_MS = [0, 120, 400];

function repaint(window: BrowserWindow) {
    for (const delay of REPAINT_DELAYS_MS) {
        setTimeout(() => {
            if (!window.isDestroyed()) window.webContents.invalidate();
        }, delay);
    }
}

const ON_TOP_RELEASE_MS = 300;

function forceToFront(window: BrowserWindow) {
    const wasOnTop = window.isAlwaysOnTop();

    window.setAlwaysOnTop(true);
    window.moveTop();
    window.focus();

    if (wasOnTop) return;

    setTimeout(() => {
        if (!window.isDestroyed()) window.setAlwaysOnTop(false);
    }, ON_TOP_RELEASE_MS);
}

function bringUp(window: BrowserWindow) {
    try {
        if (window.isMinimized()) window.restore();
        if (!window.isVisible()) window.show();

        forceToFront(window);
    } catch (error) {
        console.error("[VoiceRadar-Discord] could not bring the window forward:", error);
    }

    repaint(window);
}

function reveal(window: BrowserWindow) {
    raisedByHotkey = !window.isVisible() || window.isMinimized();

    bringUp(window);
}

export function revealWindow(event: IpcMainInvokeEvent): void {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) bringUp(window);
}

function putBack(window: BrowserWindow) {
    if (!raisedByHotkey) return;

    window.minimize();
    raisedByHotkey = false;
}

export function registerGlobalHotkey(event: IpcMainInvokeEvent, hotkey: string): boolean {
    unregisterGlobalHotkey();

    const accelerator = toAccelerator(hotkey);
    if (!accelerator) return false;

    const { sender } = event;

    try {
        const claimed = globalShortcut.register(accelerator, () => {
            const window = BrowserWindow.fromWebContents(sender);
            if (!window) return;

            sender.executeJavaScript("window.$VoiceRadarHotkey?.()")
                .then(open => {
                    // Anything but true or false means the page did not answer.
                    if (typeof open !== "boolean") return;

                    if (open) reveal(window);
                    else putBack(window);
                })
                .catch(() => void 0);
        });

        if (claimed) registered = accelerator;
        return claimed;
    } catch (error) {
        console.error("[VoiceRadar-Discord] could not claim the hotkey system wide:", error);
        return false;
    }
}

/** Chromium slows the timers of a background window to about one a minute. */
export function setBackgroundThrottling(event: IpcMainInvokeEvent, throttled: boolean): boolean {
    try {
        event.sender.setBackgroundThrottling(throttled);
        console.log("[VoiceRadar-Discord] background throttling:", throttled);
        return true;
    } catch (error) {
        console.error("[VoiceRadar-Discord] could not change background throttling:", error);
        return false;
    }
}

export function unregisterGlobalHotkey(): void {
    raisedByHotkey = false;

    if (!registered) return;

    try {
        globalShortcut.unregister(registered);
    } catch (error) {
        console.error("[VoiceRadar-Discord] could not release the hotkey:", error);
    }

    registered = null;
}

/** Its own saved session, so signing in to the site in this window never touches Discord's. */
const LOOKUP_PARTITION = "persist:voiceradar-lookup";

let lookupWindow: BrowserWindow | null = null;

export function openLookupWindow(_event: IpcMainInvokeEvent, url: string, title: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== "https:") return false;

    if (!lookupWindow || lookupWindow.isDestroyed()) {
        const webPreferences = { partition: LOOKUP_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false };

        lookupWindow = new BrowserWindow({
            width: 1100,
            height: 820,
            title,
            autoHideMenuBar: true,
            backgroundColor: "#111214",
            webPreferences
        });

        // Sign-in popups stay in the same isolated session.
        lookupWindow.webContents.setWindowOpenHandler(() => ({
            action: "allow",
            overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences }
        }));
        lookupWindow.on("closed", () => {
            lookupWindow = null;
        });
    }

    void lookupWindow.loadURL(parsed.href);
    if (lookupWindow.isMinimized()) lookupWindow.restore();
    lookupWindow.show();
    lookupWindow.focus();
    return true;
}

