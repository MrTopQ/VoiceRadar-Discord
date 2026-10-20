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
const WARM_WINDOW_MS = 400;

let lastHiddenAt = 0;

export interface HintTargetProps {
    onMouseEnter(event: SyntheticEvent<HTMLElement>): void;
    onMouseLeave(): void;
    onFocus(event: SyntheticEvent<HTMLElement>): void;
    onBlur(): void;
}

function Bubble({ anchor, text }: { anchor: DOMRect; text: ReactNode; }) {
    const ref = useRef<HTMLDivElement>(null);
    const [place, setPlace] = useState<HintPlacement | null>(null);

    useLayoutEffect(() => {
        const bubble = ref.current;
        if (!bubble) return;

        const measure = () => {
            const { width, height } = bubble.getBoundingClientRect();
            setPlace(placeHint(anchor, { width, height }, window.innerWidth));
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
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const shown = useRef(false);

    const hide = () => {
        clearTimeout(timer.current);
        if (shown.current) lastHiddenAt = Date.now();
        shown.current = false;
        setAnchor(null);
    };

    const show = (event: SyntheticEvent<HTMLElement>) => {
        if (!text) return;

        const target = event.currentTarget;
        const reveal = () => {
            if (!target.isConnected) return;
            shown.current = true;
            setAnchor(target.getBoundingClientRect());
        };

        clearTimeout(timer.current);
        if (Date.now() - lastHiddenAt < WARM_WINDOW_MS) reveal();
        else timer.current = setTimeout(reveal, SHOW_DELAY_MS);
    };

    useEffect(() => {
        if (!anchor) return;

        window.addEventListener("scroll", hide, true);
        window.addEventListener("resize", hide);
        window.addEventListener("blur", hide);
        return () => {
            window.removeEventListener("scroll", hide, true);
            window.removeEventListener("resize", hide);
            window.removeEventListener("blur", hide);
        };
    }, [anchor]);

    useEffect(() => () => clearTimeout(timer.current), []);

    const target = children({ onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide });
    if (!anchor || !text) return <>{target}</>;

    let bubble: ReactNode = null;
    try {
        bubble = ReactDOM.createPortal(<Bubble anchor={anchor} text={text} />, document.body);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not draw a hint:", error);
    }

    return <>{target}{bubble}</>;
}
