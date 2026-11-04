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
import { ReactDOM, useEffect, useLayoutEffect, useRef, useState } from "@webpack/common";
import type { ReactNode, SyntheticEvent } from "react";

import { type HintPlacement, placeHint } from "./hintPlacement";

// Its own factory, because common.tsx imports this file.
const cl = classNameFactory("vr-");

const SHOW_DELAY_MS = 120;
/** Long enough to move the pointer onto the hint and read it. */
const HIDE_DELAY_MS = 300;
const WARM_WINDOW_MS = 400;

let lastHiddenAt = 0;
let openHint: { close(): void; } | null = null;

/** For a click inside a hint that opens something, which the hint would otherwise cover. */
export function closeOpenHint() {
    openHint?.close();
}

export interface HintTargetProps {
    onMouseEnter(event: SyntheticEvent<HTMLElement>): void;
    onMouseLeave(): void;
    onFocus(event: SyntheticEvent<HTMLElement>): void;
    onBlur(): void;
}

/** Where the hovered button lives, which is a separate Discord window when the radar is popped out. */
interface Anchor {
    rect: DOMRect;
    view: Window;
    target: HTMLElement;
}

interface BubbleHandlers {
    keep(): void;
    leave(): void;
    close(): void;
}

const stopClick = (event: SyntheticEvent) => event.stopPropagation();

function Bubble({ anchor, text, handlers }: { anchor: Anchor; text: ReactNode; handlers: BubbleHandlers; }) {
    const ref = useRef<HTMLDivElement>(null);
    const [place, setPlace] = useState<HintPlacement | null>(null);

    useLayoutEffect(() => {
        const bubble = ref.current;
        if (!bubble) return;

        const measure = () => {
            const { width, height } = bubble.getBoundingClientRect();
            setPlace(placeHint(anchor.rect, { width, height }, anchor.view.innerWidth, anchor.view.innerHeight));
        };

        measure();

        // A stream preview grows once its picture loads.
        const observer = new ResizeObserver(measure);
        observer.observe(bubble);
        return () => observer.disconnect();
    }, [anchor]);

    return (
        <div
            ref={ref}
            className={cl("hint") + (place?.below ? " " + cl("hint-below") : "")}
            role="tooltip"
            onMouseEnter={handlers.keep}
            onMouseLeave={handlers.leave}
            onWheel={handlers.close}
            onClick={stopClick}
            onMouseDown={stopClick}
            style={place
                ? { left: place.left, top: place.top, ["--vr-hint-arrow" as string]: `${place.arrow}px` }
                : { left: 0, top: 0, visibility: "hidden" }}
        >
            {text}
        </div>
    );
}

/** Discord's Tooltip draws nothing outside Discord's React tree, so the windows use this one. */
export function Hint({ text, children }: { text: ReactNode; children: (props: HintTargetProps) => ReactNode; }) {
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const self = useRef<{ close(): void; }>({ close: () => void 0 });

    const close = () => {
        clearTimeout(showTimer.current);
        clearTimeout(hideTimer.current);
        if (openHint === self.current) {
            openHint = null;
            lastHiddenAt = Date.now();
        }
        setAnchor(null);
    };
    self.current.close = close;

    const keep = () => clearTimeout(hideTimer.current);

    const leave = () => {
        clearTimeout(showTimer.current);
        clearTimeout(hideTimer.current);
        if (openHint === self.current) hideTimer.current = setTimeout(close, HIDE_DELAY_MS);
    };

    const show = (event: SyntheticEvent<HTMLElement>) => {
        if (!text) return;

        const target = event.currentTarget;
        const reveal = () => {
            if (!target.isConnected) return;
            if (openHint && openHint !== self.current) openHint.close();
            openHint = self.current;
            clearTimeout(hideTimer.current);
            setAnchor({ rect: target.getBoundingClientRect(), view: target.ownerDocument.defaultView ?? window, target });
        };

        clearTimeout(showTimer.current);
        // Another hint still open waits a moment, so crossing a neighbour on the way to it does not swap it.
        const warm = !openHint && Date.now() - lastHiddenAt < WARM_WINDOW_MS;
        if (openHint === self.current || warm) reveal();
        else showTimer.current = setTimeout(reveal, SHOW_DELAY_MS);
    };

    useEffect(() => {
        if (!anchor) return;

        const { view } = anchor;
        // Discord's own lists scroll all the time, only a scroll that moves this target matters.
        const onScroll = (event: Event) => {
            const source = event.target as Node | null;
            if (!source || typeof source.contains !== "function" || source.contains(anchor.target)) close();
        };

        view.addEventListener("scroll", onScroll, true);
        view.addEventListener("resize", close);
        view.addEventListener("blur", close);
        return () => {
            view.removeEventListener("scroll", onScroll, true);
            view.removeEventListener("resize", close);
            view.removeEventListener("blur", close);
        };
    }, [anchor]);

    useEffect(() => () => {
        clearTimeout(showTimer.current);
        clearTimeout(hideTimer.current);
        if (openHint === self.current) openHint = null;
    }, []);

    const target = children({ onMouseEnter: show, onMouseLeave: leave, onFocus: show, onBlur: leave });
    if (!anchor || !text) return <>{target}</>;

    let bubble: ReactNode = null;
    try {
        bubble = ReactDOM.createPortal(
            <Bubble anchor={anchor} text={text} handlers={{ keep, leave, close }} />,
            anchor.view.document.body
        );
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not draw a hint:", error);
    }

    return <>{target}{bubble}</>;
}
