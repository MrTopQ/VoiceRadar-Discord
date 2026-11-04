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

import { createRoot, useEffect, useLayoutEffect, useRef, useState } from "@webpack/common";

import { T } from "../i18n";
import { cl } from "./common";
import { asElement } from "./dom";

export interface MenuPerson {
    id: string;
    name: string;
    avatar: string;
}

export interface MenuChoice {
    label: string;
    /** A quieter second line, such as how many people it touches. */
    hint?: string;
    /** Who the choice moves, shown as faces and names under the hint. */
    people?: MenuPerson[];
    disabled?: boolean;
    onSelect: () => void;
}

/** Space kept between the menu and the edges of the window. */
const EDGE_GAP = 8;
const ANCHOR_GAP = 6;
const PEOPLE_SHOWN = 6;

function PeoplePreview({ people }: { people: MenuPerson[]; }) {
    const shown = people.slice(0, PEOPLE_SHOWN);
    const hidden = people.length - shown.length;

    return (
        <span className={cl("menu-people")}>
            <span className={cl("menu-faces")}>
                {shown.map(person => <img key={person.id} className={cl("menu-face")} src={person.avatar} alt="" />)}
                {hidden > 0 && <span className={cl("menu-face") + " " + cl("menu-face-more")}>+{hidden}</span>}
            </span>
            <span className={cl("menu-names")}>{T.listNames(shown.map(person => person.name), hidden)}</span>
        </span>
    );
}

let closeOpenMenu: (() => void) | null = null;

/** A press on the button of the open menu closes it, and the click that follows must not open it again. */
let closedByItsButton: Element | null = null;

function MenuBox({ anchor, view, choices, close }: { anchor: Element; view: Window; choices: MenuChoice[]; close: () => void; }) {
    const ref = useRef<HTMLDivElement>(null);
    const [place, setPlace] = useState<{ left: number; top: number; } | null>(null);

    // Under the button and flush with its right edge, flipped above when the window ends first.
    useLayoutEffect(() => {
        const box = ref.current;
        if (!box) return;

        const { width, height } = box.getBoundingClientRect();
        const spot = anchor.getBoundingClientRect();
        const below = spot.bottom + ANCHOR_GAP;
        const top = below + height + EDGE_GAP > view.innerHeight ? spot.top - ANCHOR_GAP - height : below;
        const left = Math.min(Math.max(EDGE_GAP, spot.right - width), view.innerWidth - width - EDGE_GAP);

        setPlace({ left, top: Math.max(EDGE_GAP, top) });
        box.querySelector<HTMLElement>("button:not([aria-disabled='true'])")?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            // Not instanceof, the popped out radar's nodes come from another window.
            const target = asElement(event.target);
            if (target && ref.current?.contains(target)) return;

            if (target && anchor.contains(target)) closedByItsButton = anchor;
            close();
        };

        const onKeyDown = (event: KeyboardEvent) => {
            const box = ref.current;
            if (!box) return;

            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
            }

            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();

            const items = [...box.querySelectorAll<HTMLElement>("button:not([aria-disabled='true'])")];
            if (!items.length) return;

            const at = items.indexOf(box.ownerDocument.activeElement as HTMLElement);
            const step = event.key === "ArrowDown" ? 1 : -1;
            items[(at + step + items.length) % items.length].focus();
        };

        view.addEventListener("pointerdown", onPointerDown, true);
        view.addEventListener("keydown", onKeyDown, true);
        view.addEventListener("blur", close);
        view.addEventListener("resize", close);

        return () => {
            view.removeEventListener("pointerdown", onPointerDown, true);
            view.removeEventListener("keydown", onKeyDown, true);
            view.removeEventListener("blur", close);
            view.removeEventListener("resize", close);
        };
    }, []);

    return (
        <div
            ref={ref}
            className={cl("menu")}
            role="menu"
            style={place ?? { left: 0, top: 0, visibility: "hidden" }}
        >
            {choices.map(choice => (
                <button
                    key={choice.label}
                    className={cl("menu-item")}
                    role="menuitem"
                    aria-disabled={choice.disabled}
                    onClick={() => {
                        if (choice.disabled) return;
                        close();
                        choice.onSelect();
                    }}
                >
                    <span>{choice.label}</span>
                    {choice.hint && <span className={cl("menu-hint")}>{choice.hint}</span>}
                    {choice.people?.length ? <PeoplePreview people={choice.people} /> : null}
                </button>
            ))}
        </div>
    );
}

/** A small menu drawn in whatever window the button sits in, since Discord's menus open only in its main window. */
export function openPopoverMenu(anchor: Element, choices: MenuChoice[]) {
    if (closedByItsButton === anchor) {
        closedByItsButton = null;
        return;
    }

    closedByItsButton = null;
    closeOpenMenu?.();
    if (!choices.length) return;

    const own = anchor.ownerDocument;
    const view = own.defaultView ?? window;

    const host = own.createElement("div");
    host.className = cl("menu-host");
    own.body.appendChild(host);

    let root: ReturnType<typeof createRoot>;
    try {
        root = createRoot(host);
    } catch (error) {
        host.remove();
        throw error;
    }

    let open = true;
    const close = () => {
        if (!open) return;
        open = false;
        if (closeOpenMenu === close) closeOpenMenu = null;
        // Not inside the click that closes it, which React is still handling.
        setTimeout(() => {
            root.unmount();
            host.remove();
        }, 0);
    };

    closeOpenMenu = close;
    root.render(<MenuBox anchor={anchor} view={view} choices={choices} close={close} />);
}
