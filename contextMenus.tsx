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

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Menu, UserStore } from "@webpack/common";
import type { ReactElement } from "react";

import { toggleAutoJoinFor, toggleMagnetFor } from "./actions";
import { getChannelInfo, getVoiceInfo } from "./channels";
import { modViewMenuItems } from "./components/ModViewMenu";
import { openPersonInfo } from "./components/PersonInfoModal";
import { openRadarModal } from "./components/RadarModal";
import { refreshGuildSubscriptions } from "./guildSubscriptions";
import { T } from "./i18n";
import { joinVoiceChannel } from "./join";
import { noteOurMenu } from "./menuWatch";
import { getReturnableBatch, sendBatchBack } from "./moveHistory";
import { canMoveUser, canShowMagnet, canShowStickyMute, isModeratorMode } from "./movePermissions";
import { getStoredName, getUserDisplayName, UNKNOWN_NAME } from "./names";
import { pullTheirChannelToMe, pullToMyChannel, pullUsersToMe } from "./pull";
import { cancelQueue, isQueuedFor, queueForChannel } from "./queue";
import { settings } from "./settings";
import { isStickyMuteLimitReached, toggleStickyMuteFor } from "./stickyMute";
import { addUser, addUsers, getTrackedUser, removeUser, toggleNotify, togglePin } from "./store";
import { toast, ToastType } from "./toast";

interface UserContextProps {
    user?: { id: string; username?: string; };
    guildId?: string;
}

const MENU_ANCHORS = [
    { id: "volume", loose: true },
    { id: "close-dm", loose: false },
    { id: "leave-channel", loose: false }
];

function insertNearAnchor(children: any[], ...items: ReactElement[]) {
    for (const anchor of MENU_ANCHORS) {
        const group = findGroupChildrenByChildId(anchor.id, children, anchor.loose);
        if (!group) continue;

        const index = group.findIndex(child => (anchor.loose
            ? typeof child?.props?.id === "string" && child.props.id.includes(anchor.id)
            : child?.props?.id === anchor.id));

        if (index < 0) continue;

        group.splice(index + 1, 0, ...items);
        return;
    }

    children.splice(Math.max(1, children.length - 1), 0, ...items);
}

/** Resolved when a menu is built, because a Discord update can move these. */
function menuParts() {
    const menu = Menu as any;
    return {
        CheckboxItem: menu.MenuCheckboxItem ?? menu.MenuItem,
        Separator: menu.MenuSeparator ?? (() => null)
    };
}

export const userContextPatch: NavContextMenuPatchCallback = (children, { user, guildId }: UserContextProps) => {
    noteOurMenu("user");
    const { CheckboxItem, Separator } = menuParts();
    if (!user?.id) return;
    if (user.id === UserStore.getCurrentUser()?.id) return;

    const tracked = getTrackedUser(user.id);
    const storedName = getStoredName(user.id, user.username ?? UNKNOWN_NAME);
    const name = getUserDisplayName(user.id, storedName);
    const voice = getVoiceInfo(user.id);
    const canMove = canMoveUser(user.id);
    const returnable = getReturnableBatch().length;
    const showStickyMute = canShowStickyMute(user.id);
    const showModeration = (voice != null && canMove) || canShowMagnet(user.id) || showStickyMute;

    insertNearAnchor(children, (
        <Menu.MenuItem id="voice-radar" key="voice-radar" label={T.menuRoot}>
            <Menu.MenuItem
                id="voice-radar-track"
                label={tracked ? T.menuRemoveFromRadar : T.menuAddToRadar}
                action={() => {
                    if (tracked) {
                        removeUser(user.id);
                        toast(T.userRemovedFromRadar(name), ToastType.SUCCESS);
                    } else {
                        addUser(user.id, storedName);
                        // Their server may not be watched yet, so it is asked for now.
                        refreshGuildSubscriptions();
                        toast(T.userAddedToRadar(name), ToastType.SUCCESS);
                    }
                }}
            />
            <CheckboxItem
                id="voice-radar-pin"
                label={T.menuPin}
                checked={!!tracked?.pinned}
                action={() => {
                    if (!tracked) addUser(user.id, storedName, { pinned: true });
                    else togglePin(user.id);
                }}
            />
            <CheckboxItem
                id="voice-radar-notify"
                label={T.menuNotify}
                checked={!!tracked?.notify}
                action={() => {
                    if (!tracked) addUser(user.id, storedName, { notify: true });
                    else toggleNotify(user.id);
                }}
            />
            <CheckboxItem
                id="voice-radar-autojoin"
                label={T.menuAutoJoin}
                checked={!!tracked?.autoJoin}
                action={() => toggleAutoJoinFor(user.id, storedName)}
            />
            <Separator />
            <Menu.MenuItem
                id="voice-radar-jump"
                label={settings.store.silentJoin ? T.menuJumpMuted : T.menuJump}
                disabled={!voice || voice.isMyChannel || voice.isFull || !voice.canJoin}
                action={() => joinVoiceChannel(voice?.channelId ?? null)}
            />
            {voice?.isFull && voice.canJoin && !voice.isMyChannel && (
                <Menu.MenuItem
                    id="voice-radar-queue"
                    label={isQueuedFor(voice.channelId)
                        ? T.menuStopWaitingTheirChannel
                        : T.menuWaitTheirChannel}
                    action={() => (isQueuedFor(voice.channelId)
                        ? cancelQueue(T.queueCancelled)
                        : queueForChannel(voice.channelId, true))}
                />
            )}
            <Menu.MenuItem
                id="voice-radar-open"
                label={T.menuOpenRadar}
                action={openRadarModal}
            />
            {showModeration && (
                <Menu.MenuItem id="voice-radar-moderation" label={T.menuModerator}>
                    {voice && canMove && (
                        <Menu.MenuItem
                            id="voice-radar-pull"
                            label={T.menuPullUser}
                            disabled={voice.isMyChannel}
                            action={() => void pullToMyChannel(user.id)}
                        />
                    )}
                    {voice && canMove && (
                        <Menu.MenuItem
                            id="voice-radar-pull-channel"
                            label={T.menuPullChannel(voice.channelName)}
                            disabled={voice.isMyChannel}
                            action={() => void pullTheirChannelToMe(user.id)}
                        />
                    )}
                    {returnable >= 2 && (
                        <Menu.MenuItem
                            id="voice-radar-send-back"
                            label={T.menuSendBatchBack(returnable)}
                            action={() => void sendBatchBack()}
                        />
                    )}
                    {((voice && canMove) || returnable >= 2) && <Separator />}
                    <CheckboxItem
                        id="voice-radar-autopull"
                        label={T.menuMagnet}
                        checked={!!tracked?.autoPull}
                        action={() => toggleMagnetFor(user.id, storedName)}
                    />
                    {showStickyMute && (
                        <CheckboxItem
                            id="voice-radar-sticky-mute"
                            label={T.menuStickyMute}
                            checked={!!tracked?.stickyMute}
                            disabled={!tracked?.stickyMute && isStickyMuteLimitReached()}
                            action={() => toggleStickyMuteFor(user.id, storedName)}
                        />
                    )}
                </Menu.MenuItem>
            )}
        </Menu.MenuItem>
    ), (
        <Menu.MenuItem
            id="voice-radar-history"
            key="voice-radar-history"
            label={T.menuHistory}
            action={() => openPersonInfo(user.id)}
        />
    ), ...modViewMenuItems(user.id, guildId));
};

interface ChannelContextProps {
    channel?: { id: string; type: number; };
}

export const channelContextPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => {
    noteOurMenu("channel");
    const { CheckboxItem, Separator } = menuParts();
    // 2 is a voice channel, 13 a stage.
    if (!channel?.id || (channel.type !== 2 && channel.type !== 13)) return;

    const info = getChannelInfo(channel.id);
    const queued = isQueuedFor(channel.id);
    const canPull = isModeratorMode() && !info.isMyChannel && info.participantIds.length > 0;
    const returnable = getReturnableBatch().length;

    children.splice(-1, 0, (
        <Menu.MenuItem id="voice-radar-channel" key="voice-radar-channel" label={T.menuRoot}>
            {info.isFull && info.canJoin && !info.isMyChannel && (
                <Menu.MenuItem
                    id="voice-radar-channel-queue"
                    label={queued ? T.menuStopWaiting : T.menuWait}
                    action={() => (queued
                        ? cancelQueue(T.queueCancelled)
                        : queueForChannel(channel.id, true))}
                />
            )}
            {info.participantIds.length > 0 && (
                <Menu.MenuItem
                    id="voice-radar-channel-track"
                    label={T.menuTrackChannel(info.participantIds.length)}
                    action={() => {
                        const me = UserStore.getCurrentUser()?.id;
                        const wanted = info.participantIds
                            .filter(participantId => participantId !== me)
                            .map(participantId => ({
                                id: participantId,
                                name: getStoredName(participantId)
                            }));

                        const added = addUsers(wanted);
                        const left = wanted.length - added;

                        refreshGuildSubscriptions();
                        toast(
                            left ? T.addedToRadarCapped(added, left) : T.addedToRadar(added),
                            left ? ToastType.MESSAGE : ToastType.SUCCESS
                        );
                    }}
                />
            )}
            {canPull && (
                <Menu.MenuItem
                    id="voice-radar-channel-pull"
                    label={T.menuPullEveryoneHere}
                    action={() => void pullUsersToMe(info.participantIds, info.channelName)}
                />
            )}
            {returnable >= 2 && (
                <Menu.MenuItem
                    id="voice-radar-channel-send-back"
                    label={T.menuSendBatchBack(returnable)}
                    action={() => void sendBatchBack()}
                />
            )}
            <Menu.MenuItem
                id="voice-radar-channel-open"
                label={T.menuOpenRadar}
                action={openRadarModal}
            />
        </Menu.MenuItem>
    ));
};
