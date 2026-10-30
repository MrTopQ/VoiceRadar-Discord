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

import { isPluginEnabled } from "@api/PluginManager";
import { Settings } from "@api/Settings";
import { findLazy, findStoreLazy } from "@webpack";
// The whole module, so exports that Vencord removes do not break the build.
import * as Common from "@webpack/common";

import { type ApiHealth, HealthReport, isFn, probe, proveWorking, reportBroken } from "./apiHealth";
import { TtlCache } from "./cache";
import { getVoiceInfo, openChannel } from "./channels";
import { T } from "./i18n";
import { getUserDisplayName } from "./names";
import { sharedGuildIds } from "./profileFacts";
import { getTrackedUser } from "./store";
import { toast, ToastType } from "./toast";

/** The stock Vencord plugin that turns the same rights check off for the whole of Discord. */
const SHOW_HIDDEN_THINGS = "ShowHiddenThings";

/** Discord's number for the moderator panel, for when its list of panel kinds cannot be found. */
const MOD_VIEW_PANEL_FALLBACK = 4;

/** Without the rights Discord shuts the panel at once, so a look after this long tells whether it stayed. */
const CLOSED_CHECK_MS = 1500;

/** Discord may check the rights before the panel is up, so a fresh opening counts for this long. */
const OPENING_GRACE_MS = 3000;

/** Servers where the radar put the panel up without the rights, with when it did. */
const openedHere = new Map<string, number>();

/** Set once Discord shut such a panel anyway, after which only real rights count. */
let bypassFailed = false;

/** The rights Discord asks for before it shows the panel. */
const MODERATOR_PERMISSIONS = ["ADMINISTRATOR", "MANAGE_GUILD", "BAN_MEMBERS", "KICK_MEMBERS", "MODERATE_MEMBERS"];

const TEXT_CHANNEL_TYPES = new Set([0, 5]);

const MODERATOR_CACHE_MS = 30_000;
const MODERATOR_CACHE_ENTRIES = 300;
const moderatorIn = new TtlCache<boolean>(MODERATOR_CACHE_MS, MODERATOR_CACHE_ENTRIES);

const ChannelSectionStore = findStoreLazy("ChannelSectionStore");
const GuildSidebarKinds = findLazy(module =>
    typeof module?.GUILD_MEMBER_MOD_VIEW === "number" && module[module.GUILD_MEMBER_MOD_VIEW] === "GUILD_MEMBER_MOD_VIEW");

function read<T>(get: () => T | null | undefined): T | null {
    try {
        return get() ?? null;
    } catch {
        return null;
    }
}

export function showHiddenThingsOpensModView(): boolean {
    return probe(() => isPluginEnabled(SHOW_HIDDEN_THINGS)
        && (Settings.plugins as any)[SHOW_HIDDEN_THINGS]?.showModView !== false);
}

export function canOpenModViewEverywhere(): boolean {
    return showHiddenThingsOpensModView() || !bypassFailed;
}

function guildIdOf(context: any): string | null {
    if (typeof context === "string") return context;
    const id = context?.guild_id ?? context?.id;
    return typeof id === "string" ? id : null;
}

/** Discord's rights check for the panel asks here first, and only panels the radar put up get through. */
export function allowsModView(context: any): boolean {
    if (!openedHere.size) return false;

    try {
        const guildId = guildIdOf(context);
        const openedAt = guildId ? openedHere.get(guildId) : undefined;
        if (!guildId || openedAt == null) return false;

        if (Date.now() - openedAt < OPENING_GRACE_MS || panelUser(guildId) != null) return true;

        openedHere.delete(guildId);
        return false;
    } catch {
        return false;
    }
}

/** Discord reads the highest role off its members page, which only moderators load, so it comes from the member here. */
export function highestModViewRole(props: any, roles: any) {
    try {
        const roleId = props?.member?.highestRoleId;
        return Array.isArray(roles) ? roles.find(role => role?.id === roleId) : undefined;
    } catch {
        return undefined;
    }
}

export function isModeratorIn(guildId: string): boolean {
    const cached = moderatorIn.get(guildId);
    if (cached !== undefined) return cached;

    const common = Common as any;
    const guild = read(() => common.GuildStore?.getGuild?.(guildId));
    const allowed = guild != null && MODERATOR_PERMISSIONS.some(name => probe(() => {
        const bit = common.PermissionsBits?.[name];
        return typeof bit === "bigint" && common.PermissionStore?.can?.(bit, guild) === true;
    }));

    return moderatorIn.set(guildId, allowed);
}

export function canOpenModView(guildId: string): boolean {
    return canOpenModViewEverywhere() || isModeratorIn(guildId);
}

function guildOfChannel(channelId: string | null | undefined): string | null {
    if (!channelId) return null;
    return read(() => (Common as any).ChannelStore?.getChannel?.(channelId)?.guild_id);
}

/**
 * The server a menu was opened in comes first, then where they sit now, the server on screen,
 * where they were last seen, and the rest.
 */
export function modViewGuilds(userId: string, contextGuildId?: string | null): string[] {
    const common = Common as any;
    const shared = sharedGuildIds(userId);
    const isShared = (guildId: string) => shared.includes(guildId)
        || probe(() => common.GuildMemberStore?.isMember?.(guildId, userId) === true);

    const voiceGuild = getVoiceInfo(userId)?.guildId ?? null;
    const preferred = [
        contextGuildId,
        voiceGuild,
        read(() => common.SelectedGuildStore?.getGuildId?.()),
        guildOfChannel(getTrackedUser(userId)?.lastChannelId)
    ].filter((guildId): guildId is string => !!guildId && (guildId === voiceGuild || isShared(guildId)));

    return [...new Set([...preferred, ...shared])];
}

export interface ModViewGuild {
    id: string;
    name: string;
    icon: string | null;
    canOpen: boolean;
    theyAreHere: boolean;
}

export function modViewGuildList(userId: string, contextGuildId?: string | null): ModViewGuild[] {
    const common = Common as any;
    const voiceGuild = getVoiceInfo(userId)?.guildId ?? null;

    return modViewGuilds(userId, contextGuildId).map(id => {
        const guild = read<any>(() => common.GuildStore?.getGuild?.(id));
        return {
            id,
            name: String(guild?.name ?? id),
            icon: guild?.icon ?? null,
            canOpen: canOpenModView(id),
            theyAreHere: id === voiceGuild
        };
    });
}

export type ModViewChoice =
    | { guildId: string; guildName: string; problem?: undefined; }
    | { guildId?: undefined; guildName?: undefined; problem: string; };

export function pickModViewGuild(userId: string, contextGuildId?: string | null): ModViewChoice {
    const guilds = modViewGuilds(userId, contextGuildId);
    if (!guilds.length) return { problem: T.modViewNoSharedGuild(getUserDisplayName(userId)) };

    const guildId = guilds.find(canOpenModView);
    if (!guildId) return { problem: T.modViewNoAccess };

    return { guildId, guildName: read<string>(() => (Common as any).GuildStore?.getGuild?.(guildId)?.name) ?? guildId };
}

function isTextChannelIn(channelId: string | null, guildId: string): boolean {
    if (!channelId) return false;
    const channel = read(() => (Common as any).ChannelStore?.getChannel?.(channelId));
    return channel?.guild_id === guildId && TEXT_CHANNEL_TYPES.has(channel.type);
}

/** The panel lives beside a server's chat, so a text channel of that server has to be on screen. */
function channelToShowIn(guildId: string): string | null {
    const common = Common as any;
    const candidates = [
        read<string>(() => common.SelectedChannelStore?.getChannelId?.()),
        read<string>(() => common.SelectedChannelStore?.getChannelId?.(guildId)),
        read<string>(() => common.GuildChannelStore?.getDefaultChannel?.(guildId)?.id)
    ];

    return candidates.find(channelId => isTextChannelIn(channelId, guildId)) ?? null;
}

function panelKind(): number {
    const kind = read(() => GuildSidebarKinds.GUILD_MEMBER_MOD_VIEW);
    if (typeof kind === "number") return kind;

    reportBroken(T.apiModViewKind);
    return MOD_VIEW_PANEL_FALLBACK;
}

function panelUser(guildId: string): string | null {
    return read(() => ChannelSectionStore.getGuildSidebarState(guildId)?.details?.userId);
}

/** Opens Discord's own panel, the one behind its "Open in Mod View" menu item, beside that server's chat. */
export function openModView(userId: string, guildId: string): boolean {
    const channelId = channelToShowIn(guildId);
    if (!channelId) {
        toast(T.modViewNoChannel, ToastType.FAILURE);
        return false;
    }

    const needsBypass = !showHiddenThingsOpensModView() && !isModeratorIn(guildId);
    if (needsBypass) openedHere.set(guildId, Date.now());

    try {
        if (read(() => (Common as any).SelectedChannelStore?.getChannelId?.()) !== channelId) openChannel(channelId);

        (Common as any).FluxDispatcher.dispatch({
            type: "SIDEBAR_VIEW_GUILD",
            sidebarType: panelKind(),
            guildId,
            baseChannelId: channelId,
            details: { guildId, userId }
        });
    } catch (error) {
        console.error("[VoiceRadar-Discord] could not open the moderator panel:", error);
    }

    if (panelUser(guildId) !== userId) {
        reportBroken(T.apiModView);
        toast(T.modViewFailed, ToastType.FAILURE);
        return false;
    }

    proveWorking(T.apiModView);
    setTimeout(() => checkPanelStayed(guildId, needsBypass), CLOSED_CHECK_MS);

    return true;
}

function checkPanelStayed(guildId: string, neededBypass: boolean) {
    if (panelUser(guildId) != null) {
        if (neededBypass) proveWorking(T.apiModViewBypass);
        return;
    }

    if (!neededBypass) {
        toast(T.modViewClosed, ToastType.FAILURE);
        return;
    }

    bypassFailed = true;
    openedHere.delete(guildId);
    reportBroken(T.apiModViewBypass);
    toast(T.modViewClosedByDiscord, ToastType.FAILURE);
}

export function resetModView() {
    moderatorIn.clear();
    openedHere.clear();
    bypassFailed = false;
}

export function modViewProblems(): ApiHealth {
    const common = Common as any;

    return new HealthReport()
        .nice(() => isFn(common.FluxDispatcher?.dispatch) && isFn(ChannelSectionStore.getGuildSidebarState), T.apiModView)
        .nice(() => isFn(common.ContextMenuApi?.openContextMenu), T.apiModViewMenu);
}
