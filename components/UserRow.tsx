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

import { Parser, React } from "@webpack/common";
import type { ReactNode } from "react";

import { toggleAutoJoinFor, toggleMagnetFor } from "../actions";
import { TtlCache } from "../cache";
import { getMyChannelId, getMyGuildId, getVoiceInfo, openChannel, type VoiceInfo } from "../channels";
import { T } from "../i18n";
import { joinVoiceChannel } from "../join";
import { getReturnChannel, sendUserBack } from "../moveHistory";
import { canShowMagnet, canShowStickyMute, getMoveAccess, muteAccessForChannel } from "../movePermissions";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName, openProfile } from "../names";
import { getPresenceInfo } from "../presence";
import { pullToMyChannel } from "../pull";
import { cancelQueue, isQueuedFor, queueForChannel } from "../queue";
import { settings } from "../settings";
import { getLastLeave } from "../sightings";
import { isStickyMuteLimitReached, MAX_STICKY_MUTED, toggleStickyMuteFor } from "../stickyMute";
import { removeUser, toggleNotify, togglePin, type TrackedUser } from "../store";
import { formatRelativeTime } from "../time";
import { toast, ToastType } from "../toast";
import { openUserMenu } from "../userMenu";
import { ActionButton, cl, PlatformIcons, StatusDot } from "./common";
import { Hint } from "./Hint";
import {
    BellIcon,
    CameraIcon,
    ClockIcon,
    DeafIcon,
    InfoIcon,
    JoinIcon,
    LockedSpeakerIcon,
    LockIcon,
    MagnetIcon,
    MicOffIcon,
    PinIcon,
    PullIcon,
    ReturnIcon,
    SpeakerIcon,
    TargetIcon,
    TrashIcon
} from "./icons";
import { openPersonInfo } from "./PersonInfoModal";
import { StreamIndicator } from "./StreamPreview";

const TOOLTIP_MAX_MEMBERS = 10;

const MENTION_CACHE_MS = 60_000;
const MENTION_MAX_ENTRIES = 200;
const mentionCache = new TtlCache<ReactNode>(MENTION_CACHE_MS, MENTION_MAX_ENTRIES);

function channelMention(channelId: string): ReactNode {
    const cached = mentionCache.get(channelId);
    if (cached !== undefined) return cached;

    try {
        return mentionCache.set(channelId, Parser.parse(`<#${channelId}>`));
    } catch {
        return mentionCache.set(channelId, null);
    }
}

function ChannelMention({ voice }: { voice: VoiceInfo; }) {
    const parsed = channelMention(voice.channelId);
    if (parsed) return <>{parsed}</>;

    return (
        <span className={cl("channel-name")}>
            {voice.guildName ? `${voice.guildName} › ` : ""}{voice.channelName}
        </span>
    );
}

function ChannelTooltip({ voice }: { voice: VoiceInfo; }) {
    const memberIds = voice.participantIds;

    return (
        <div className={cl("vc-tooltip")}>
            <div className={cl("vc-tooltip-title")}>{T.tooltipInVoiceChat}</div>
            <div className={cl("vc-tooltip-channel")}>
                {voice.guildName ? `${voice.guildName} › ` : ""}{voice.channelName}
            </div>
            {memberIds.slice(0, TOOLTIP_MAX_MEMBERS).map(id => (
                <div key={id} className={cl("vc-tooltip-row")}>
                    <img
                        className={cl("tip-avatar")}
                        src={getAvatarUrl(id) ?? DEFAULT_AVATAR_URL}
                        alt=""
                    />
                    {getUserDisplayName(id)}
                </div>
            ))}
            {memberIds.length > TOOLTIP_MAX_MEMBERS && (
                <div className={cl("dim")}>{T.tooltipAndMore(memberIds.length - TOOLTIP_MAX_MEMBERS)}</div>
            )}
            {(voice.isDeafened || voice.isMuted) && (
                <div className={cl("dim")}>
                    {voice.isDeafened ? T.tooltipDeafened : T.tooltipMuted}
                </div>
            )}
            <div className={cl("vc-tooltip-hint")}>
                {voice.canView ? T.tooltipOpenChannel : T.tooltipNoChannelAccess}
            </div>
        </div>
    );
}

function ChannelChip({ voice }: { voice: VoiceInfo; }) {
    const Icon = voice.canJoin && !voice.isFull ? SpeakerIcon : LockedSpeakerIcon;

    const onClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        if (!voice.canView) {
            toast(T.noChannelAccess, ToastType.FAILURE);
            return;
        }

        openChannel(voice.channelId);
    };

    return (
        <Hint text={<ChannelTooltip voice={voice} />}>
            {hintProps => (
                <span
                    {...hintProps}
                    className={cl("channel") + (voice.canJoin && !voice.isFull ? "" : " " + cl("channel-locked"))}
                    role="button"
                    onClickCapture={onClick}
                >
                    <Icon />
                    <ChannelMention voice={voice} />
                    <span className={cl("dim")}>· {voice.memberCount}{voice.isFull ? T.channelFull : ""}</span>
                    {voice.isDeafened
                        ? <DeafIcon size={14} className={cl("state-icon")} />
                        : voice.isMuted && <MicOffIcon size={14} className={cl("state-icon")} />}
                    {voice.selfVideo && <CameraIcon size={14} className={cl("state-icon")} />}
                    {voice.isMyChannel && <span className={cl("badge") + " " + cl("badge-here")}>{T.badgeWithYou}</span>}
                </span>
            )}
        </Hint>
    );
}

function NotInVoice({ user }: { user: TrackedUser; }) {
    const leave = getLastLeave(user.id);
    const channel = leave?.channelLabel ?? user.lastChannelName;

    return (
        <span className={cl("dim")} title={leave ? new Date(leave.at).toLocaleString() : undefined}>
            {leave
                ? T.leftAgo(formatRelativeTime(leave.at), channel)
                : <>{T.notInVoice}{user.lastChannelName && T.lastChannel(user.lastChannelName)}</>}
        </span>
    );
}

export interface DragHandlers {
    onDragStart(id: string): void;
    onDragOver(id: string): void;
    onDrop(id: string): void;
    onDragEnd(): void;
    draggingId: string | null;
    overId: string | null;
    dropAfter: boolean;
}

export function UserRow({ user, drag }: { user: TrackedUser; drag?: DragHandlers; }) {
    const name = getUserDisplayName(user.id, user.name);
    const presence = getPresenceInfo(user.id);
    const voice = getVoiceInfo(user.id);
    const avatar = getAvatarUrl(user.id) ?? DEFAULT_AVATAR_URL;

    const dropClass = drag && drag.overId === user.id && drag.draggingId !== user.id
        ? cl(drag.dropAfter ? "row-drop-after" : "row-drop-before")
        : null;

    const rowClass = [
        cl("row"),
        voice && cl("row-live"),
        voice?.isMyChannel && cl("row-here"),
        drag && cl("row-draggable"),
        drag?.draggingId === user.id && cl("row-dragging"),
        dropClass
    ].filter(Boolean).join(" ");

    const dragProps = drag && {
        draggable: true,
        onDragStart: (event: React.DragEvent) => {
            event.dataTransfer.effectAllowed = "move";
            // Some drop targets refuse a drag with no payload.
            event.dataTransfer.setData("text/plain", user.id);
            drag.onDragStart(user.id);
        },
        onDragOver: (event: React.DragEvent) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            drag.onDragOver(user.id);
        },
        onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            drag.onDrop(user.id);
        },
        onDragEnd: () => drag.onDragEnd()
    };

    const moveAccess = getMoveAccess(user.id);
    const canMove = moveAccess !== "no";
    const uncheckedNote = moveAccess === "unknown" ? T.permissionUnchecked : "";
    const returnTo = canMove ? getReturnChannel(user.id) : null;
    const showMagnet = canShowMagnet(user.id);
    const showStickyMute = canShowStickyMute(user.id);

    const stickyMuteFull = !user.stickyMute && isStickyMuteLimitReached();
    const stickyMuteTooltip = stickyMuteFull
        ? T.stickyMuteLimitReached(MAX_STICKY_MUTED)
        : !user.stickyMute
            ? T.stickyMuteOff
        : !voice
            ? T.stickyMuteWaiting
            : muteAccessForChannel(voice.channelId) === "no"
                ? T.stickyMuteNoPermissionHere
                : T.stickyMuteOn;

    const magnetTooltip = !user.autoPull
        ? T.magnetOff
        : moveAccess === "no"
            ? T.magnetIdleNoPermission
            : !getMyChannelId()
                ? T.magnetIdleNotConnected
                : !voice
                    ? T.magnetIdleTargetOffline
                    : voice.guildId !== getMyGuildId()
                        ? T.magnetIdleOtherGuild
                        : T.magnetActive;

    const queuedChannelId = voice?.channelId ?? user.lastChannelId;
    const queued = queuedChannelId != null && isQueuedFor(queuedChannelId);
    const canQueue = voice != null && voice.isFull && voice.canJoin && !voice.isMyChannel;
    const joinBlocked = voice != null && !voice.canJoin;

    const joinTooltip = queued ? T.joinQueued
        : !voice ? T.joinNotInVoice
            : voice.isMyChannel ? T.joinAlreadyThere
                : !voice.canJoin ? T.joinNoPermission
                    : voice.isFull ? T.joinChannelFull
                        : settings.store.silentJoin ? T.joinMuted : T.join;

    const handleJoin = () => {
        if (queued) {
            cancelQueue(T.queueCancelled);
            return;
        }
        if (!voice) {
            toast(T.userNotInVoice(name), ToastType.FAILURE);
            return;
        }
        if (voice.isMyChannel) {
            toast(T.alreadyWithUser(name), ToastType.MESSAGE);
            return;
        }
        if (canQueue) {
            queueForChannel(voice.channelId, true);
            return;
        }
        joinVoiceChannel(voice.channelId);
    };

    // user.name, not the display name, because a translated placeholder must not be saved.
    const handleMagnet = () => toggleMagnetFor(user.id, user.name);
    const handleStickyMute = () => toggleStickyMuteFor(user.id, user.name);
    const handleAutoJoin = () => toggleAutoJoinFor(user.id, user.name);

    const openThisProfile = () => openProfile(user.id);

    return (
        <div className={rowClass} {...dragProps} onContextMenu={event => openUserMenu(event, user.id)}>
            <div
                className={cl("avatar-wrap")}
                onClick={openThisProfile}
                onKeyDown={event => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    openThisProfile();
                }}
                role="button"
                tabIndex={0}
                aria-label={name}
            >
                <img className={cl("avatar")} src={avatar} alt={name} />
                <StatusDot status={presence.status} mobile={presence.isMobile} known={presence.known} />
            </div>

            <div className={cl("info")}>
                <div className={cl("name-line")}>
                    <span className={cl("name")} onClick={openThisProfile}>{name}</span>
                    {user.autoJoin && <span className={cl("badge") + " " + cl("badge-auto")}>{T.badgeAuto}</span>}
                    {user.stickyMute && <span className={cl("badge") + " " + cl("badge-muted")}>{T.badgeMuted}</span>}
                    <PlatformIcons platforms={presence.platforms} />
                </div>

                <div className={cl("meta-line")}>
                    {voice ? <ChannelChip voice={voice} /> : <NotInVoice user={user} />}
                    <StreamIndicator userId={user.id} name={name} />
                </div>

                <div className={cl("meta-line")}>
                    <span className={cl("dim")}>
                        {user.sharedVoice
                            ? T.seenAgo(formatRelativeTime(user.lastSeen))
                            : T.addedAgo(formatRelativeTime(user.lastSeen))}
                    </span>
                    <button
                        className={cl("info-button")}
                        onClick={event => {
                            event.stopPropagation();
                            openPersonInfo(user.id);
                        }}
                        title={T.infoButtonHint}
                    >
                        <InfoIcon />
                        {T.infoButton}
                    </button>
                    {presence.activity && (
                        <span className={cl("activity") + " " + cl("activity-" + presence.activityKind)}>
                            {presence.activity}
                        </span>
                    )}
                </div>
            </div>

            <div className={cl("actions")}>
                <div className={cl("action-group")}>
                    <ActionButton
                        icon={queued ? <ClockIcon /> : joinBlocked ? <LockIcon /> : canQueue ? <ClockIcon /> : <JoinIcon />}
                        tooltip={joinTooltip}
                        active={queued}
                        onClick={handleJoin}
                        disabled={!queued && (!voice || voice.isMyChannel || joinBlocked)}
                    />
                    {canMove && (returnTo
                        ? <ActionButton
                            icon={<ReturnIcon />}
                            tooltip={T.sendBackTo(returnTo.name) + uncheckedNote}
                            warn
                            onClick={() => void sendUserBack(user.id)}
                        />
                        : <ActionButton
                            icon={<PullIcon />}
                            tooltip={(voice?.isMyChannel ? T.pullAlreadyHere : T.pullToMyChannel) + uncheckedNote}
                            onClick={() => void pullToMyChannel(user.id)}
                            disabled={!voice || voice.isMyChannel}
                        />
                    )}
                    {showMagnet && (
                        <ActionButton
                            icon={<MagnetIcon />}
                            tooltip={magnetTooltip + uncheckedNote}
                            active={user.autoPull}
                            onClick={handleMagnet}
                        />
                    )}
                    {showStickyMute && (
                        <ActionButton
                            icon={<MicOffIcon />}
                            tooltip={stickyMuteTooltip + uncheckedNote}
                            active={user.stickyMute}
                            danger={user.stickyMute}
                            disabled={stickyMuteFull}
                            onClick={handleStickyMute}
                        />
                    )}
                </div>

                <div className={cl("action-group")}>
                    <ActionButton
                        icon={<PinIcon />}
                        tooltip={user.pinned ? T.unpin : T.pin}
                        active={user.pinned}
                        onClick={() => togglePin(user.id)}
                    />
                    <ActionButton
                        icon={<BellIcon />}
                        tooltip={user.notify ? T.notifyOn : T.notifyOff}
                        active={user.notify}
                        onClick={() => toggleNotify(user.id)}
                    />
                    <ActionButton
                        icon={<TargetIcon />}
                        tooltip={user.autoJoin ? T.autoJoinOn : T.autoJoinOff}
                        active={user.autoJoin}
                        onClick={handleAutoJoin}
                    />
                    <ActionButton
                        icon={<TrashIcon />}
                        tooltip={T.removeFromList}
                        danger
                        onClick={() => removeUser(user.id)}
                    />
                </div>
            </div>
        </div>
    );
}
