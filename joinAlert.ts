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

import { showNotification } from "@api/Notifications";
import { Settings } from "@api/Settings";
import { UserStore } from "@webpack/common";

import { proveWorking, reportBroken } from "./apiHealth";
import { T } from "./i18n";
import { getAvatarUrl, getUserDisplayName } from "./names";
import { ALERT_OFF, getJoinAlert } from "./settings";
import { playJoinSound } from "./sound";

export interface JoinCard {
    /** A newer card with the same key replaces the old one. */
    key: string;
    title: string;
    body: string;
    icon?: string;
    onOpen?: () => void;
    onJoin?: () => void;
}

let showCard: ((card: JoinCard) => void) | null = null;

export function setJoinCardShower(show: ((card: JoinCard) => void) | null) {
    showCard = show;
}

function discordHasFocus(): boolean {
    return typeof document !== "undefined" && document.hasFocus();
}

/** The card inside Discord always shows, since Windows hides its own notifications during a game. */
export function announceJoin(card: JoinCard) {
    if (getJoinAlert() === ALERT_OFF) return;
    playJoinSound();

    let cardShown = false;
    try {
        if (showCard) {
            showCard(card);
            cardShown = true;
            proveWorking(T.apiJoinCard);
        }
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not show the join card:", error);
        reportBroken(T.apiJoinCard);
    }

    // Without the card Vencord's own notification is the only thing you would see, so it goes out whatever the setting says.
    if (!cardShown) {
        void showNotification({ title: card.title, body: card.body, icon: card.icon, onClick: card.onOpen });
        return;
    }

    if (discordHasFocus()) return;
    if ((Settings as any).notifications?.useNative === "never") return;

    void showNotification({ title: card.title, body: card.body, icon: card.icon, onClick: card.onOpen });
}

export function previewJoinAlert() {
    const me = UserStore.getCurrentUser();
    const name = me ? getUserDisplayName(me.id, T.someone) : T.someone;

    announceJoin({
        key: "preview",
        title: T.notifyTitle(name),
        body: T.joinPreviewBody,
        icon: (me && getAvatarUrl(me.id)) ?? undefined
    });
}
