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

import { ContextMenuApi, Menu } from "@webpack/common";
import type { MouseEvent, ReactElement } from "react";

import { proveWorking, reportBroken } from "../apiHealth";
import { T } from "../i18n";
import { type ModViewGuild, modViewGuildList, openModView, pickModViewGuild } from "../modView";
import { closeProfile } from "../names";
import { guildIconUrl, guildInitials } from "../profileFacts";
import { toast, ToastType } from "../toast";
import { cl } from "./common";
import { menuOptionsFor } from "./RadarPopout";
import { closeAllWindows } from "./Window";

export function showModView(userId: string, guildId: string) {
    closeAllWindows();
    closeProfile();
    openModView(userId, guildId);
}

/** Opens it on the server the buttons prefer, or says why there is none. */
export function showModViewForPerson(userId: string) {
    const choice = pickModViewGuild(userId);
    if (choice.guildId === undefined) toast(choice.problem, ToastType.FAILURE);
    else showModView(userId, choice.guildId);
}

function initialsIcon(name: string) {
    return () => <span className={cl("menu-guild-initials")}>{guildInitials(name)}</span>;
}

function guildItem(userId: string, guild: ModViewGuild): ReactElement {
    const icon = guildIconUrl(guild, 64);

    return (
        <Menu.MenuItem
            id={`voice-radar-mod-view-${guild.id}`}
            key={guild.id}
            label={guild.name}
            subtext={guild.theyAreHere ? T.modViewTheyAreHere : guild.canOpen ? undefined : T.modViewNoRightsHere}
            leadingAccessory={icon ? { type: "image", src: icon } : { type: "icon", icon: initialsIcon(guild.name) }}
            disabled={!guild.canOpen}
            action={() => showModView(userId, guild.id)}
        />
    );
}

function otherGuildItems(userId: string, exceptGuildId: string, contextGuildId?: string | null): ReactElement[] {
    return modViewGuildList(userId, contextGuildId)
        .filter(guild => guild.id !== exceptGuildId)
        .map(guild => guildItem(userId, guild));
}

/** Two entries side by side in a person's menu, this server and a list of the others. */
export function modViewMenuItems(userId: string, contextGuildId?: string | null): ReactElement[] {
    const here = pickModViewGuild(userId, contextGuildId);
    if (here.guildId === undefined) return [];

    const others = otherGuildItems(userId, here.guildId, contextGuildId);

    return [
        <Menu.MenuItem
            id="voice-radar-mod-view"
            key="voice-radar-mod-view"
            label={T.menuModView}
            subtext={here.guildName}
            action={() => showModView(userId, here.guildId)}
        />,
        ...(others.length
            ? [
                <Menu.MenuItem id="voice-radar-mod-view-other" key="voice-radar-mod-view-other" label={T.menuModViewOther}>
                    {others}
                </Menu.MenuItem>
            ]
            : [])
    ];
}

/** The second half of the double button, a list of the shared servers the first half does not open. */
export function openModViewServerMenu(event: MouseEvent, userId: string) {
    const here = pickModViewGuild(userId);
    const items = here.guildId === undefined ? [] : otherGuildItems(userId, here.guildId);

    if (!items.length) {
        toast(here.guildId === undefined ? here.problem : T.modViewNoOtherGuild, ToastType.MESSAGE);
        return;
    }

    // In the popped out radar the list opens there, through the menu layer that window carries.
    const options = menuOptionsFor(event.currentTarget);
    if (options === null) return;

    try {
        (ContextMenuApi as any).openContextMenu(event, () => (
            <Menu.Menu navId="voice-radar-mod-view-servers" onClose={ContextMenuApi.closeContextMenu} aria-label={T.menuModViewOther}>
                {items}
            </Menu.Menu>
        ), options);
        proveWorking(T.apiModViewMenu);
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not show the server list for Mod View:", error);
        reportBroken(T.apiModViewMenu);
        toast(T.modViewMenuFailed, ToastType.FAILURE);
    }
}
