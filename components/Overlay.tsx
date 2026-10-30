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

import { classNameFactory } from "@utils/css";
import { createRoot, useEffect, useRef } from "@webpack/common";
import type { ReactNode } from "react";

import { isTypingKey } from "../hotkey";

const cl = classNameFactory("vr-");

/** Matches the closing animation in styles.css. */
const CLOSE_ANIMATION_MS = 120;

export const TYPE_TARGET_ATTRIBUTE = "data-vr-type-target";

const FOCUSABLE = "button:not([tabindex='-1']), input, [tabindex='0']";

export interface Overlay {
    close(): void;
    destroy(): void;
}

export type OverlaySize = "lg" | "xl";

/** Open windows, last on top, and only the top one handles keys. */
const stack: object[] = [];

const leaveStack = (entry: object) => {
    const at = stack.indexOf(entry);
    if (at >= 0) stack.splice(at, 1);
};

const prefersLessMotion = () => {
    try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
        return false;
    }
};

const takesText = (element: Element | null) =>
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || (element as HTMLElement | null)?.isContentEditable === true;

function Frame({ label, size, onClose, keysTaken, isTop, children }: {
    label: string;
    size: OverlaySize;
    onClose: () => void;
    keysTaken: () => boolean;
    isTop: () => boolean;
    children: ReactNode;
}) {
    const windowRef = useRef<HTMLElement>(null);
    const pressedOnBackdrop = useRef(false);

    useEffect(() => {
        const box = windowRef.current;
        if (box && !box.contains(document.activeElement)) box.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const box = windowRef.current;
            if (!box || event.defaultPrevented) return;

            if (!isTop()) return;

            if (keysTaken()) return;

            // Events sent to window directly have no element target.
            const target = event.target instanceof Element ? event.target : null;
            const inside = target != null && box.contains(target);
            const onBarePage = target == null || target === document.body || target === document.documentElement;
            const inOneOfOurs = target?.closest(`.${cl("root")}`) != null;

            // Focus is elsewhere, usually in a Discord window on top.
            if (!inside && !onBarePage && !inOneOfOurs) return;

            if (event.key === "Escape") {
                // The first Esc clears a filled field, the next one closes.
                if (takesText(target) && (target as HTMLInputElement).value) return;

                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
            }

            if (event.key === "Tab") {
                const focusable = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => element.offsetParent !== null);
                if (!focusable.length) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                const active = document.activeElement;

                if (!inside || (event.shiftKey ? active === first : active === last)) {
                    event.preventDefault();
                    (event.shiftKey ? last : first).focus();
                }
                return;
            }

            // Discord would send stray keys into the hidden chat box, so they go to the search instead.
            if (isTypingKey(event) && !takesText(target)) {
                box.querySelector<HTMLElement>(`[${TYPE_TARGET_ATTRIBUTE}]`)?.focus();
                event.stopPropagation();
            }
        };

        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [onClose]);

    return (
        <div
            className={cl("overlay")}
            onMouseDown={event => {
                pressedOnBackdrop.current = event.target === event.currentTarget;
            }}
            onClick={event => {
                if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
            }}
        >
            <section
                ref={windowRef}
                className={cl("window") + " " + cl("window-" + size)}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
            >
                {children}
            </section>
        </div>
    );
}

/** Draws a window in its own React root, without Discord's modals, which are slow to open. */
export function openOverlay({ label, size, render, onClosed, keysTaken = () => false }: {
    label: string;
    size: OverlaySize;
    render: (close: () => void) => ReactNode;
    onClosed: () => void;
    keysTaken?: () => boolean;
}): Overlay {
    const host = document.createElement("div");
    host.className = cl("root");
    document.body.appendChild(host);

    let root: ReturnType<typeof createRoot>;
    try {
        root = createRoot(host);
    } catch (error) {
        host.remove();
        throw error;
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let state: "open" | "closing" | "gone" = "open";

    const entry = {};
    stack.push(entry);
    const isTop = () => stack[stack.length - 1] === entry;

    const destroy = () => {
        if (state === "gone") return;
        state = "gone";
        leaveStack(entry);

        try {
            root.unmount();
        } finally {
            host.remove();
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
            onClosed();
        }
    };

    const close = () => {
        if (state !== "open") return;
        state = "closing";
        leaveStack(entry);

        if (prefersLessMotion()) {
            destroy();
            return;
        }

        host.classList.add(cl("root-closing"));
        setTimeout(destroy, CLOSE_ANIMATION_MS);
    };

    try {
        root.render(
            <Frame label={label} size={size} onClose={close} keysTaken={keysTaken} isTop={isTop}>
                {render(close)}
            </Frame>
        );
    } catch (error) {
        destroy();
        throw error;
    }

    return { close, destroy };
}
