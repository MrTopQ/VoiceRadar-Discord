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

import ErrorBoundary from "@components/ErrorBoundary";
import { findByPropsLazy, findComponentByCodeLazy, findStoreLazy, mapMangledModuleLazy } from "@webpack";
import { createRoot, FluxDispatcher, React, ReactDOM, useEffect, useLayoutEffect, useMemo, useRef, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { proveWorking, reportBroken } from "../apiHealth";
import type { ConfirmOptions } from "../confirm";
import { isTypingKey } from "../hotkey";
import { T } from "../i18n";
import { Native } from "../mainProcess";
import { sizePopout } from "../pluginSize";
import { getPluginScale, settings } from "../settings";
import { toast, type ToastKind, ToastType } from "../toast";
import { cl, HeadButton } from "./common";
import { asElement, takesText } from "./dom";
import { OnTopIcon, PopInIcon, PopOutIcon } from "./icons";
import { TYPE_TARGET_ATTRIBUTE } from "./Overlay";
import { PopoutOptionsButton } from "./PopoutOptions";

/** Discord's main process opens a popout only when its name starts like Discord's own. */
const POPOUT_KEY = "DISCORD_VoiceRadar";

const DEFAULT_WIDTH = 880;
const DEFAULT_HEIGHT = 780;

const PopoutWindowStore = findStoreLazy("PopoutWindowStore");

/** Discord's main context, so what a menu entry opens, a profile or a dialog, still opens in Discord's main window. */
const MENU_CONTEXT = "APP";

/**
 * Tells Discord's menus which window and context they are in.
 * The context alone, not Discord's wrapper, which would also register the window and send Discord's modals there with nobody to draw them.
 */
const WindowContext = mapMangledModuleLazy("renderWindow:window,windowDispatch:", {
    Context: (value: any) => value?.Provider != null && value?.Consumer != null
});

/** The layer each Discord window draws its open right-click menu in. */
const ContextMenuLayer = findComponentByCodeLazy(".getContextMenu(),version:", "closeContextMenu:");

/** Set once the radar window carries Discord's menu layer, so right clicks there can open menus. */
let menusReady = false;

/** Discord's modal store, whose growth means one of Discord's own windows just opened. */
const Modals = findByPropsLazy("useModalsStore", "openModalLazy");

/** Opening a chat or Mod View happens in Discord's main window. */
const MAIN_WINDOW_ACTIONS = ["CHANNEL_SELECT", "SIDEBAR_VIEW_GUILD"];

let stopWatching: (() => void) | null = null;

function modalCount(state: unknown): number {
    return Object.values(state ?? {}).reduce<number>((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
}

/** Brings Discord's main window up when something clicked in the radar window opens there, instead of opening it out of sight. */
export function watchMainWindowOpens(reveal: () => void) {
    stopWatchingMainWindow();

    const onAction = () => {
        if (isRadarPopoutFocused()) reveal();
    };
    for (const type of MAIN_WINDOW_ACTIONS) FluxDispatcher.subscribe(type as any, onAction);

    let unsubscribeModals: (() => void) | null = null;
    try {
        const store = Modals.useModalsStore;
        let seen = modalCount(store.getState());

        unsubscribeModals = store.subscribe((state: unknown) => {
            const count = modalCount(state);
            if (count > seen && isRadarPopoutFocused()) reveal();
            seen = count;
        });
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not watch Discord's windows opening:", error);
    }

    stopWatching = () => {
        for (const type of MAIN_WINDOW_ACTIONS) FluxDispatcher.unsubscribe(type as any, onAction);
        unsubscribeModals?.();
    };
}

export function stopWatchingMainWindow() {
    stopWatching?.();
    stopWatching = null;
}

const nativeWindow = () => (window as any).DiscordNative?.window;

function read<T>(get: () => T | null | undefined): T | null {
    try {
        return get() ?? null;
    } catch {
        return null;
    }
}

/**
 * What Discord's menu needs to open where the click was.
 * Nothing extra in the main window, the main context in the radar window, null when menus cannot show there.
 */
export function menuOptionsFor(target: unknown): { context: string; } | null | undefined {
    const own = (target as Node | null)?.ownerDocument;
    if (!own || own === document) return undefined;
    return menusReady ? { context: MENU_CONTEXT } : null;
}

export function canPopOut(): boolean {
    return typeof IS_DISCORD_DESKTOP !== "undefined" && IS_DISCORD_DESKTOP && typeof nativeWindow()?.minimize === "function";
}

/** Whether the hotkey and the panel button open the radar straight in its own window. */
export function opensInOwnWindow(): boolean {
    return !!settings.store.openInOwnWindow && canPopOut();
}

export function isRadarPopoutFocused(): boolean {
    return read(() => PopoutWindowStore.getWindowFocused(POPOUT_KEY)) === true;
}

export function minimizeRadarPopout() {
    nativeWindow()?.minimize?.(POPOUT_KEY);
}

/** The popped out radar's document while you are working in it, where the plugin's windows and messages should appear. */
export function focusedPopoutDocument(): Document | null {
    if (!isRadarPopoutFocused()) return null;

    const own = read<Window>(() => PopoutWindowStore.getWindow(POPOUT_KEY))?.document;
    return own?.body ? own : null;
}

const TOAST_SHOWN_MS = 3500;
const TOAST_FADE_MS = 200;

/** A plain message at the bottom of the popped out radar, since Discord's toasts appear only in its main window. */
export function toastInPopout(message: string, type: ToastKind): boolean {
    const own = focusedPopoutDocument();
    if (!own) return false;

    let host = own.querySelector<HTMLElement>(`.${cl("toast-host")}`);
    if (!host) {
        host = own.createElement("div");
        host.className = cl("toast-host");
        own.body.appendChild(host);
    }

    // One message at a time, the newest replaces the last.
    host.replaceChildren();

    const item = own.createElement("div");
    item.className = cl("toast") + " " + cl("toast-" + type);
    item.setAttribute("role", "status");
    item.textContent = message;
    host.appendChild(item);

    setTimeout(() => {
        item.classList.add(cl("toast-leaving"));
        setTimeout(() => item.remove(), TOAST_FADE_MS);
    }, TOAST_SHOWN_MS);

    return true;
}

export function isRadarPoppedOut(): boolean {
    return read(() => PopoutWindowStore.getWindowOpen(POPOUT_KEY)) === true;
}

/** A hidden window stays alive with nothing drawn in it, so it costs no redraws. */
let hiddenAway = false;
let setShellAwake: ((awake: boolean) => void) | null = null;

/** Open and not minimised or hidden. */
export function isRadarPopoutShown(): boolean {
    return isRadarPoppedOut() && !hiddenAway && read(() => PopoutWindowStore.getWindowVisible(POPOUT_KEY)) !== false;
}

let renderRadar: ((close: () => void) => ReactNode) | null = null;

export function closeRadarPopout() {
    try {
        FluxDispatcher.dispatch({ type: "POPOUT_WINDOW_CLOSE", key: POPOUT_KEY } as any);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not close the radar window:", error);
    }
}

/** Minimizes instead while Discord still runs a main process half older than this option. */
export async function hideRadarPopout() {
    hiddenAway = true;

    const hidden = await Native?.hideRadarWindow?.().catch(() => false);
    if (!hidden) {
        hiddenAway = false;
        minimizeRadarPopout();
        return;
    }

    if (hiddenAway) setShellAwake?.(false);
}

function showHiddenRadar() {
    hiddenAway = false;
    ReactDOM.flushSync(() => setShellAwake?.(true));

    Native?.showRadarWindow?.().catch(error => console.warn("[VoiceRadar-Discord] could not show the radar window:", error));
}

/** The close button hides too, or the next press would build the window again. */
function leaveRadarPopout() {
    if (settings.store.hideOwnWindow && opensInOwnWindow()) void hideRadarPopout();
    else closeRadarPopout();
}

/** Vencord adds plugin styles as style tags, and Discord carries only its stylesheet links into a popout. */
function copyStyles(target: Document) {
    for (const style of document.querySelectorAll("style")) {
        if (style.textContent?.includes(".vr-")) target.head.appendChild(target.importNode(style, true));
    }
}

/** Discord's menus take their colours from the theme classes on the root element, which a popout never gets. */
function mirrorTheme(target: Document): () => void {
    const copy = () => {
        target.documentElement.className = document.documentElement.className;
        target.documentElement.style.cssText = document.documentElement.style.cssText;
    };
    copy();

    const observer = new MutationObserver(copy);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
}

function PopoutShell() {
    const ref = useRef<HTMLElement>(null);
    const [styled, setStyled] = useState(false);
    const [awake, setAwake] = useState(true);

    useEffect(() => {
        setShellAwake = setAwake;

        return () => {
            setShellAwake = null;
            hiddenAway = false;
        };
    }, []);

    useLayoutEffect(() => {
        const own = ref.current?.ownerDocument;
        setStyled(true);
        if (!own || own === document) return;

        copyStyles(own);
        const stopSizing = sizePopout(own);
        const stopMirroring = mirrorTheme(own);

        return () => {
            stopSizing();
            stopMirroring();
        };
    }, []);

    // Typing anywhere goes into the search, as it does in the window inside Discord.
    useEffect(() => {
        const box = ref.current;
        const view = box?.ownerDocument.defaultView;
        if (!box || !view) return;

        const onKeyDown = (event: KeyboardEvent) => {
            const target = asElement(event.target);
            if (!isTypingKey(event) || takesText(target)) return;
            // A plugin window open over the radar handles its own keys.
            if (box.ownerDocument.querySelector(`.${cl("root")}`)) return;
            box.querySelector<HTMLElement>(`[${TYPE_TARGET_ATTRIBUTE}]`)?.focus();
        };

        view.addEventListener("keydown", onKeyDown, true);
        return () => view.removeEventListener("keydown", onKeyDown, true);
    }, []);

    const radar = (
        <section ref={ref} className={cl("window") + " " + cl("window-popout")} style={styled ? undefined : { visibility: "hidden" }}>
            {awake && renderRadar?.(leaveRadarPopout)}
        </section>
    );

    // With the window's context and Discord's menu layer, right clicks open their menu here.
    const view = read<Window>(() => PopoutWindowStore.getWindow(POPOUT_KEY));
    const Context = read<any>(() => WindowContext.Context);
    menusReady = view != null && Context?.Provider != null;
    if (!menusReady) return radar;

    return (
        <MenuWindow Context={Context} view={view!}>
            {radar}
            <ErrorBoundary noop onError={() => void (menusReady = false)}>
                <ContextMenuLayer />
            </ErrorBoundary>
            {/* Discord's menus look this element up in their own window and draw nothing without it. */}
            <div id="popover-portal" />
        </MenuWindow>
    );
}

function MenuWindow({ Context, view, children }: { Context: any; view: Window; children: ReactNode; }) {
    // Nothing wraps the radar's root, so this is Discord's default for the main window, which keeps its dispatcher.
    const base = React.useContext(Context) as object;
    const value = useMemo(() => ({ ...base, appContext: MENU_CONTEXT, renderWindow: view }), [base, view]);

    return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Opens the radar in a window of its own, which Discord places, sizes and remembers, or brings it forward. */
export function popOutRadar(render: (close: () => void) => ReactNode): boolean {
    renderRadar = render;

    if (hiddenAway && isRadarPoppedOut()) {
        showHiddenRadar();
        return true;
    }

    // Discord only focuses an open popout, and a minimised one has to come back first.
    if (isRadarPoppedOut() && read(() => PopoutWindowStore.getWindowVisible(POPOUT_KEY)) === false) {
        nativeWindow()?.restore?.(POPOUT_KEY);
    }

    try {
        FluxDispatcher.dispatch({
            type: "POPOUT_WINDOW_OPEN",
            key: POPOUT_KEY,
            features: {
                defaultWidth: Math.round(DEFAULT_WIDTH * getPluginScale()),
                defaultHeight: Math.round(DEFAULT_HEIGHT * getPluginScale()),
                defaultAlwaysOnTop: false
            },
            render: () => <ErrorBoundary noop><PopoutShell /></ErrorBoundary>
        } as any);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] Discord would not open the radar in its own window:", error);
    }

    if (isRadarPoppedOut()) {
        proveWorking(T.apiPopout);
        return true;
    }

    reportBroken(T.apiPopout);
    toast(T.popoutFailed, ToastType.FAILURE);
    return false;
}

function ConfirmDialog({ options, close }: { options: ConfirmOptions; close: () => void; }) {
    const confirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const button = confirmRef.current;
        button?.focus();

        const view = button?.ownerDocument.defaultView;
        if (!view) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            close();
        };

        view.addEventListener("keydown", onKeyDown, true);
        return () => view.removeEventListener("keydown", onKeyDown, true);
    }, []);

    return (
        <div className={cl("confirm-backdrop")} onMouseDown={event => event.target === event.currentTarget && close()}>
            <div className={cl("confirm")} role="alertdialog" aria-modal="true" aria-label={options.title}>
                <div className={cl("confirm-title")}>{options.title}</div>
                <div className={cl("confirm-body")}>{options.body}</div>
                <div className={cl("confirm-buttons")}>
                    <button className={cl("chip")} onClick={close}>{options.cancelText}</button>
                    <button
                        ref={confirmRef}
                        className={cl("chip") + " " + cl("confirm-go") + (options.confirmColor === "red" ? " " + cl("confirm-danger") : "")}
                        onClick={() => {
                            close();
                            options.onConfirm();
                        }}
                    >
                        {options.confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Shows the question over the popped out radar while that window has the focus, since Discord's dialog would open behind. */
export function confirmInPopout(options: ConfirmOptions): boolean {
    const own = focusedPopoutDocument();
    if (!own) return false;

    const host = own.createElement("div");
    host.className = cl("confirm-host");
    own.body.appendChild(host);

    let root: ReturnType<typeof createRoot>;
    try {
        root = createRoot(host);
    } catch (error) {
        host.remove();
        throw error;
    }

    const close = () => {
        root.unmount();
        host.remove();
    };

    root.render(<ConfirmDialog options={options} close={close} />);
    return true;
}

export function PopOutButton({ onPopOut }: { onPopOut: () => void; }) {
    return (
        <div className={cl("head-split")}>
            <HeadButton icon={<PopOutIcon />} label={T.popOut} extraClass={cl("head-split-main")} onClick={onPopOut} />
            <PopoutOptionsButton />
        </div>
    );
}

export function PopoutControls({ onPopIn }: { onPopIn: () => void; }) {
    const [onTop, setOnTop] = useState(() => read(() => PopoutWindowStore.getIsAlwaysOnTop(POPOUT_KEY)) === true);

    const toggleOnTop = () => {
        const next = !onTop;
        FluxDispatcher.dispatch({ type: "POPOUT_WINDOW_SET_ALWAYS_ON_TOP", key: POPOUT_KEY, alwaysOnTop: next } as any);
        setOnTop(next);
    };

    return (
        <>
            <HeadButton icon={<OnTopIcon />} label={onTop ? T.popoutOnTopOn : T.popoutOnTop} active={onTop} onClick={toggleOnTop} />
            <div className={cl("head-split")}>
                <HeadButton icon={<PopInIcon />} label={T.popIn} extraClass={cl("head-split-main")} onClick={onPopIn} />
                <PopoutOptionsButton />
            </div>
        </>
    );
}
