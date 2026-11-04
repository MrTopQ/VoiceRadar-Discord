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

import { findModuleFactory, wreq } from "@webpack";
import { ChannelStore, ContextMenuApi, UserStore } from "@webpack/common";
import type { ComponentType, MouseEvent } from "react";

import { proveWorking, reportBroken } from "./apiHealth";
import { getVoiceInfo } from "./channels";
import { menuOptionsFor } from "./components/RadarPopout";
import { T } from "./i18n";
import { toast, ToastType } from "./toast";

const MENUS = {
    voice: "GuildChannelUserContextMenu",
    generic: "UserGenericContextMenu"
} as const;

type MenuKind = keyof typeof MENUS;

const MAX_LOADER_SPAN = 4000;

/** Plain string searches, because a complex pattern over this big module could freeze Discord when it fails to match. */
function locate(name: string): { chunks: string[]; entry: string; } | null {
    let factory: unknown;
    try {
        factory = findModuleFactory(`"${name}"`);
    } catch {
        return null;
    }
    if (!factory) return null;

    const source = String(factory);
    const at = source.indexOf(`"${name}"`);
    const bind = source.lastIndexOf(".bind(", at);
    const all = source.lastIndexOf("Promise.all([", bind);
    if (bind < 0 || all < 0 || at - all > MAX_LOADER_SPAN) return null;

    const entry = /^\.bind\([\w$]+,"?(\d+)"?\)/.exec(source.slice(bind, bind + 40))?.[1];
    if (!entry) return null;

    const chunks = Array.from(source.slice(all, bind).matchAll(/\.e\("?(\d+)"?\)/g), match => match[1]);
    return { chunks, entry };
}

const loading = new Map<MenuKind, Promise<ComponentType<any>>>();

function loadMenu(kind: MenuKind): Promise<ComponentType<any>> {
    const known = loading.get(kind);
    if (known) return known;

    const attempt = (async () => {
        const place = locate(MENUS[kind]);
        if (!place) throw new Error(`could not find where Discord loads ${MENUS[kind]}`);

        await Promise.all(place.chunks.map(id => wreq.e(id as any)));

        const menu = wreq(place.entry as any)?.default;
        if (menu == null) throw new Error(`${MENUS[kind]} loaded without a component`);
        return menu as ComponentType<any>;
    })();

    loading.set(kind, attempt);
    attempt.catch(() => loading.delete(kind));
    return attempt;
}

const noInteraction = () => { };

export function openUserMenu(event: MouseEvent, userId: string) {
    const user = UserStore.getUser(userId);
    event.preventDefault();
    if (!user) return;

    // In the popped out radar the menu opens there, through the layer that window carries.
    const options = menuOptionsFor(event.currentTarget);
    if (options === null) return;

    const voice = getVoiceInfo(userId);
    const channel = voice?.guildId ? ChannelStore.getChannel(voice.channelId) as any : null;
    const kind: MenuKind = channel ? "voice" : "generic";

    (ContextMenuApi as any).openContextMenuLazy(event, async () => {
        try {
            const Menu = await loadMenu(kind);
            proveWorking(T.apiUserMenu);

            return (props: any) => (
                <Menu
                    {...props}
                    user={user}
                    showMediaItems
                    onInteraction={noInteraction}
                    {...(channel && {
                        guildId: channel.guild_id,
                        channel,
                        showStageChannelItems: channel.isGuildStageVoice?.() === true
                    })}
                />
            );
        } catch (error) {
            console.warn("[VoiceRadar-Discord] could not open Discord's menu for a person:", error);
            reportBroken(T.apiUserMenu);
            toast(T.userMenuUnavailable, ToastType.FAILURE);
            return (() => null) as any;
        }
    }, options);
}
