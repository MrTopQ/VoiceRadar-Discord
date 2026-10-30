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

import { createRoot, useEffect, useRef, useState } from "@webpack/common";

import { T } from "../i18n";
import type { JoinCard as JoinCardData } from "../joinAlert";
import { cl } from "./common";
import { CloseIcon, RadarIcon } from "./icons";

const VISIBLE_MS = 8000;
const MAX_CARDS = 3;

interface ShownCard extends JoinCardData {
    id: number;
}

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let cards: ShownCard[] = [];
let nextId = 1;

function isDiscordInView() {
    return document.hasFocus() && !document.hidden;
}

function useDiscordInView() {
    const [inView, setInView] = useState(isDiscordInView);

    useEffect(() => {
        const update = () => setInView(isDiscordInView());
        window.addEventListener("focus", update);
        window.addEventListener("blur", update);
        document.addEventListener("visibilitychange", update);
        return () => {
            window.removeEventListener("focus", update);
            window.removeEventListener("blur", update);
            document.removeEventListener("visibilitychange", update);
        };
    }, []);

    return inView;
}

/** The countdown only runs while you look at Discord, so a card shown during a game waits for you. */
function Card({ card, inView }: { card: ShownCard; inView: boolean; }) {
    const [hovered, setHovered] = useState(false);
    const remaining = useRef(VISIBLE_MS);
    const running = inView && !hovered;
    const dismiss = () => dismissCard(card.id);

    useEffect(() => {
        if (!running) return;

        const startedAt = Date.now();
        const timer = setTimeout(dismiss, remaining.current);
        return () => {
            clearTimeout(timer);
            remaining.current -= Date.now() - startedAt;
        };
    }, [running]);

    return (
        <div
            className={cl("card")}
            role="status"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <button
                className={cl("card-main")}
                onClick={() => {
                    card.onOpen?.();
                    dismiss();
                }}
            >
                {card.icon
                    ? <img className={cl("card-avatar")} src={card.icon} alt="" />
                    : <span className={cl("card-avatar", "card-avatar-empty")}><RadarIcon size={20} /></span>}
                <span className={cl("card-text")}>
                    <span className={cl("card-title")}>{card.title}</span>
                    <span className={cl("card-body")}>{card.body}</span>
                </span>
            </button>
            {card.onJoin && (
                <button
                    className={cl("chip", "card-join")}
                    onClick={() => {
                        card.onJoin!();
                        dismiss();
                    }}
                >
                    {T.cardJoin}
                </button>
            )}
            <button className={cl("card-close")} onClick={dismiss} aria-label={T.cardDismiss}>
                <CloseIcon size={16} />
            </button>
            <span
                className={cl("card-timer", { "card-timer-paused": !running })}
                style={{ animationDuration: `${VISIBLE_MS}ms` }}
            />
        </div>
    );
}

function CardStack({ shown }: { shown: ShownCard[]; }) {
    const inView = useDiscordInView();
    return <>{shown.map(card => <Card key={card.id} card={card} inView={inView} />)}</>;
}

function draw() {
    if (!root) {
        host = document.createElement("div");
        host.className = cl("cards");
        document.body.appendChild(host);
        root = createRoot(host);
    }

    root.render(<CardStack shown={cards} />);
}

function dismissCard(id: number) {
    cards = cards.filter(card => card.id !== id);
    draw();
}

export function showJoinCard(card: JoinCardData) {
    cards = [...cards.filter(shown => shown.key !== card.key), { ...card, id: nextId++ }].slice(-MAX_CARDS);
    draw();
}

export function closeJoinCards() {
    cards = [];

    try {
        root?.unmount();
    } finally {
        host?.remove();
        root = null;
        host = null;
    }
}
