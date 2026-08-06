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

/**
 * The hotkey inside the window is an ordinary keydown listener, which the operating system only
 * delivers while Discord has focus. This file runs in the main process, where Electron can claim the
 * combination system wide, so it also works while you are in a game or in another program.
 *
 * The radar itself still lives in Discord's window, so opening it means bringing that window up.
 * A window of our own would need its own copy of Discord's client to talk to, which is not a thing
 * a plugin can have.
 */

/** What the plugin asked for last, so a rebind can release the previous combination. */
let registered: string | null = null;

/** The plugin writes Meta, Electron wants Super, and everything else is spelled the same way. */
function toAccelerator(hotkey: string): string {
    return hotkey
        .split("+")
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => (part.toLowerCase() === "meta" ? "Super" : part))
        .join("+");
}

/**
 * Whether this opening of the radar is also what brought Discord up. A window that was already on
 * screen is left alone when the radar closes, since putting away something the reader never asked to
 * be put away is not the hotkey's business.
 */
let raisedByHotkey = false;

/**
 * A window that sat hidden for a while comes back showing whatever frame the compositor still had,
 * and once Chromium has thrown that away, what comes back is a black rectangle. It repaints itself as
 * soon as anything else touches the window, which is why clicking the tray icon "fixed" it, so the
 * window is simply told to repaint instead of waiting for that.
 *
 * Asked more than once because the first ask can land before the window is on screen, and it costs
 * nothing when the picture was fine to begin with.
 */
const REPAINT_DELAYS_MS = [0, 120, 400];

function repaint(window: BrowserWindow) {
    for (const delay of REPAINT_DELAYS_MS) {
        setTimeout(() => {
            if (!window.isDestroyed()) window.webContents.invalidate();
        }, delay);
    }
}

/**
 * How long the window stays pinned on top before the pin is taken away again. See forceToFront.
 *
 * Long enough for the window manager to have acted on it, short enough that nobody sees Discord
 * sitting over their game.
 */
const ON_TOP_RELEASE_MS = 300;

/**
 * Puts the window in front, for the case where simply asking is refused.
 *
 * Windows does not let a process take the foreground unless the user is interacting with it, so
 * focus() from the background restores the window but leaves it behind whatever was already there,
 * flashing its taskbar button instead. The hotkey never ran into this, because pressing a combination the
 * process itself registered is exactly the interaction that grants the right. A click on a
 * notification is handled by the shell, and the right does not reliably come with it, which is why
 * answering a "somebody joined voice" popup left Discord exactly where it was.
 *
 * Pinning the window on top for a moment is the way round it, because the pin needs no such right
 * and focus() then lands on a window that is already in front. Whoever deliberately keeps Discord
 * on top keeps it, since the previous setting is read first and only a false one is put back.
 */
function forceToFront(window: BrowserWindow) {
    const wasOnTop = window.isAlwaysOnTop();

    window.setAlwaysOnTop(true);
    window.moveTop();
    window.focus();

    if (wasOnTop) return;

    // released on a timer rather than immediately, or the raise is undone in the same breath it was
    // asked for, on the window managers that need this in the first place
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
        // an unhandled throw here would travel back over IPC as a rejected call the page ignores,
        // so the only symptom would be a window that did not move and no idea why
        console.error("[VoiceRadar-Discord] could not bring the window forward:", error);
    }

    repaint(window);
}

function reveal(window: BrowserWindow) {
    /*
     * Answered afresh on every opening rather than remembered from the first one. Opening the radar
     * with the key, closing it with the mouse and opening it again is a perfectly ordinary thing to
     * do, and by then Discord is on screen because you are using it. Keeping the old answer meant the
     * next press put away a window you were working in.
     *
     * Read before the window moves, because afterwards there is nothing left to tell.
     */
    raisedByHotkey = !window.isVisible() || window.isMinimized();

    bringUp(window);
}

/**
 * Brings Discord forward for something that is not the hotkey, which today means clicking a
 * notification about somebody joining voice. Opening a window inside a minimised Discord left the
 * reader looking at their game while the list waited unseen behind it.
 *
 * Deliberately does not claim the window as the hotkey's, so a later press of the key leaves it
 * alone. The key only ever puts back what the key itself brought up.
 */
export function revealWindow(event: IpcMainInvokeEvent): void {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) bringUp(window);
}

/**
 * Minimised rather than hidden, even when the hotkey took Discord out of the tray in the first
 * place. A minimised window is still on the taskbar and one click away, while a hidden one is gone
 * from it and has to be hunted for in the tray.
 */
function putBack(window: BrowserWindow) {
    if (!raisedByHotkey) return;

    window.minimize();
    raisedByHotkey = false;
}

/**
 * @returns false when the combination is already held by another program, which Electron reports
 * rather than throwing, and which the plugin turns into a message instead of silence.
 */
export function registerGlobalHotkey(event: IpcMainInvokeEvent, hotkey: string): boolean {
    unregisterGlobalHotkey();

    const accelerator = toAccelerator(hotkey);
    if (!accelerator) return false;

    const { sender } = event;

    try {
        const claimed = globalShortcut.register(accelerator, () => {
            const window = BrowserWindow.fromWebContents(sender);
            if (!window) return;

            /*
             * The window is asked to toggle first and answers whether the radar ended up open. Doing
             * it in this order means a press that closes the radar never flashes Discord on screen
             * on its way to being hidden again, which is what showing it first would do.
             *
             * The renderer installs this bridge while the plugin runs and drops it when it stops.
             */
            sender.executeJavaScript("window.$VoiceRadarHotkey?.()")
                .then(open => {
                    /*
                     * Anything other than a plain yes or no means there was nobody to ask. The page
                     * reloaded, or the plugin stopped without the main process hearing about it, and
                     * the bridge is gone. Reading that silence as "the radar is shut" and minimising
                     * Discord is the one answer that is certainly wrong.
                     */
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

/**
 * Chromium slows the timers of a window nobody is looking at, and after a few minutes in the
 * background it slows them to about one a minute. Everything this plugin does while you are away is
 * built on timers, so a notification that should arrive in three seconds arrived in five minutes,
 * and a silent join could hold its mute retries for just as long.
 *
 * Turning the throttling off costs the small amount of work Discord does between events, and buys
 * back the only thing the plugin is for while it sits in the tray, which is telling you in time.
 */
/**
 * @returns whether the window actually took it.
 *
 * It used to answer nothing at all and swallow its own failure, so the page could not tell a call
 * that worked from one that threw, and the diagnostics row said the timers were awake either way.
 * That is the one thing that row exists not to do.
 */
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
    // whatever Discord was doing before, it is no longer this key's business
    raisedByHotkey = false;

    if (!registered) return;

    try {
        globalShortcut.unregister(registered);
    } catch (error) {
        console.error("[VoiceRadar-Discord] could not release the hotkey:", error);
    }

    registered = null;
}
