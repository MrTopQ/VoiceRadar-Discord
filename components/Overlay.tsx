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
import { createRoot, useEffect, useLayoutEffect, useRef, useState } from "@webpack/common";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { isTypingKey } from "../hotkey";
import { type Edge, EDGES, fitPlace, movePlace, resizePlace, savedPlace, savePlace, type Size, type WindowPlace } from "../windowPlace";
import { asElement, takesText, zoomOf } from "./dom";

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


/** What a press on the title bar should still reach instead of starting a drag. */
const CONTROLS = "button, a, input, textarea, select, label, [role='button'], [role='tab'], [contenteditable='true']";

type Gesture = "move" | Edge;

const GESTURE_CURSORS: Record<Gesture, string> = {
    move: "grabbing",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize"
};

interface GestureStart {
    gesture: Gesture;
    pointerId: number;
    x: number;
    y: number;
    zoom: number;
    place: WindowPlace;
    size: Size;
    area: Size;
}

/** The part of the backdrop a window may use, inside its padding. */
function freeArea(overlay: HTMLElement): Size {
    const style = (overlay.ownerDocument.defaultView ?? window).getComputedStyle(overlay);
    return {
        width: overlay.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        height: overlay.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    };
}

function placeStyle(place: WindowPlace | null) {
    if (!place) return undefined;
    return {
        translate: `${place.x}px ${place.y}px`,
        ...(place.width != null ? { width: place.width } : {}),
        ...(place.height != null ? { height: place.height } : {})
    };
}

interface Room {
    size: Size;
    area: Size;
}

const sameSize = (a: Size, b: Size) => a.width === b.width && a.height === b.height;

/** Lets a window be dragged by its title and resized by any edge, and remembers where it was left. */
function usePlace(placeKey: string | undefined, windowRef: { current: HTMLElement | null; }) {
    // Only a drag changes where the window should be, a smaller Discord only squeezes what is shown.
    const [wanted, setWanted] = useState<WindowPlace | null>(() => (placeKey ? savedPlace(placeKey) : null));
    const [room, setRoom] = useState<Room | null>(null);
    const [gesture, setGesture] = useState<Gesture | null>(null);
    const start = useRef<GestureStart | null>(null);
    const latest = useRef<WindowPlace | null>(null);
    const frame = useRef(0);

    const measure = () => {
        const box = windowRef.current;
        const overlay = box?.parentElement;
        if (!box || !overlay) return null;
        return { box, size: { width: box.offsetWidth, height: box.offsetHeight }, area: freeArea(overlay) };
    };

    const place = wanted && room ? fitPlace(wanted, room.size, room.area) : wanted;

    useLayoutEffect(() => {
        if (!placeKey) return;

        const remeasure = () => {
            // A drag sets the size itself, and a render now would pull the window back under the cursor.
            if (start.current) return;

            const measured = measure();
            if (!measured) return;
            setRoom(current => (current && sameSize(current.size, measured.size) && sameSize(current.area, measured.area)
                ? current
                : { size: measured.size, area: measured.area }));
        };

        remeasure();

        // Covers both Discord's window changing size and the window's own content growing.
        const observer = new ResizeObserver(remeasure);
        const box = windowRef.current;
        if (box) observer.observe(box);
        if (box?.parentElement) observer.observe(box.parentElement);

        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame.current);
        };
    }, [placeKey]);

    const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
        const target = asElement(event.target);
        if (!placeKey || event.button !== 0 || !target) return;

        const edge = target.closest("[data-vr-edge]")?.getAttribute("data-vr-edge") as Edge | null;
        const onTitle = target.closest(`.${cl("head")}`) != null && target.closest(CONTROLS) == null;
        if (!edge && !onTitle) return;

        const measured = measure();
        if (!measured) return;

        event.preventDefault();
        measured.box.setPointerCapture(event.pointerId);

        start.current = {
            gesture: edge ?? "move",
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            zoom: zoomOf(measured.box),
            place: fitPlace(place ?? { x: 0, y: 0 }, measured.size, measured.area),
            size: measured.size,
            area: measured.area
        };
        latest.current = null;
        setGesture(edge ?? "move");
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        const begun = start.current;
        if (!begun || event.pointerId !== begun.pointerId) return;

        // The pointer moves in screen pixels, the window in its own scaled ones.
        const dx = (event.clientX - begun.x) / begun.zoom;
        const dy = (event.clientY - begun.y) / begun.zoom;
        const next = begun.gesture === "move"
            ? movePlace(begun.place, dx, dy)
            : resizePlace(begun.place, begun.size, begun.gesture, dx, dy, begun.area);

        latest.current = fitPlace(next, begun.size, begun.area);

        // Straight on the element, so a drag costs no React render per frame.
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            const box = windowRef.current;
            const shown = latest.current;
            if (!box || !shown) return;

            box.style.translate = `${shown.x}px ${shown.y}px`;
            if (shown.width != null) box.style.width = `${shown.width}px`;
            if (shown.height != null) box.style.height = `${shown.height}px`;
        });
    };

    const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
        const begun = start.current;
        if (!begun || event.pointerId !== begun.pointerId) return;

        start.current = null;
        setGesture(null);
        windowRef.current?.releasePointerCapture?.(event.pointerId);

        const finished = latest.current;
        if (!finished || !placeKey) return;

        const measured = measure();
        if (measured) setRoom({ size: measured.size, area: measured.area });

        setWanted(finished);
        savePlace(placeKey, finished);
    };

    const onDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
        const target = asElement(event.target);
        if (!placeKey || !target) return;
        if (target.closest(`.${cl("head")}`) == null || target.closest(CONTROLS) != null) return;

        setWanted(null);
        savePlace(placeKey, null);
    };

    return {
        place,
        gesture,
        handlers: placeKey
            ? { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onDoubleClick }
            : {}
    };
}

function Frame({ label, size, placeKey, onClose, keysTaken, isTop, children }: {
    label: string;
    size: OverlaySize;
    placeKey?: string;
    onClose: () => void;
    keysTaken: () => boolean;
    isTop: () => boolean;
    children: ReactNode;
}) {
    const windowRef = useRef<HTMLElement>(null);
    const pressedOnBackdrop = useRef(false);
    const { place, gesture, handlers } = usePlace(placeKey, windowRef);

    useEffect(() => {
        const box = windowRef.current;
        if (box && !box.contains(box.ownerDocument.activeElement)) box.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        // The window this one was drawn in, which is the popped out radar when it was opened from there.
        const own = windowRef.current?.ownerDocument ?? document;
        const view = own.defaultView ?? window;

        const onKeyDown = (event: KeyboardEvent) => {
            const box = windowRef.current;
            if (!box || event.defaultPrevented) return;

            if (!isTop()) return;

            if (keysTaken()) return;

            // Events sent to window directly have no element target.
            const target = asElement(event.target);
            const inside = target != null && box.contains(target);
            const onBarePage = target == null || target === own.body || target === own.documentElement;
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
                const active = own.activeElement;

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

        view.addEventListener("keydown", onKeyDown, true);
        return () => view.removeEventListener("keydown", onKeyDown, true);
    }, [onClose]);

    return (
        <div
            className={cl("overlay")}
            // Pointer, not mouse, because a drag cancels the mouse half and would leave an old answer here.
            onPointerDown={event => {
                pressedOnBackdrop.current = event.target === event.currentTarget;
            }}
            onClick={event => {
                if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
            }}
        >
            <section
                ref={windowRef}
                className={cl("window") + " " + cl("window-" + size) + (placeKey ? " " + cl("window-movable") : "")}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
                style={placeStyle(place)}
                {...handlers}
            >
                {children}
                {placeKey && EDGES.map(edge => (
                    <div key={edge} className={cl("resize") + " " + cl("resize-" + edge)} data-vr-edge={edge} aria-hidden="true" />
                ))}
            </section>
            {gesture && <div className={cl("gesture-shield")} style={{ cursor: GESTURE_CURSORS[gesture] }} />}
        </div>
    );
}

/** Draws a window in its own React root, without Discord's modals, which are slow to open. */
export function openOverlay({ label, size, placeKey, render, onClosed, keysTaken = () => false, own = document }: {
    label: string;
    size: OverlaySize;
    placeKey?: string;
    render: (close: () => void) => ReactNode;
    onClosed: () => void;
    keysTaken?: () => boolean;
    /** The document to draw in, the popped out radar's when the window is opened from there. */
    own?: Document;
}): Overlay {
    const host = own.createElement("div");
    host.className = cl("root");
    own.body.appendChild(host);

    let root: ReturnType<typeof createRoot>;
    try {
        root = createRoot(host);
    } catch (error) {
        host.remove();
        throw error;
    }

    const active = own.activeElement as HTMLElement | null;
    const previousFocus = typeof active?.focus === "function" ? active : null;
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
            <Frame label={label} size={size} placeKey={placeKey} onClose={close} keysTaken={keysTaken} isTop={isTop}>
                {render(close)}
            </Frame>
        );
    } catch (error) {
        destroy();
        throw error;
    }

    return { close, destroy };
}
