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

import { Parser, React, Tooltip } from "@webpack/common";

import { toggleAutoJoinFor, toggleMagnetFor } from "../actions";
import { getMyChannelId, getMyGuildId, getVoiceInfo, openChannel, type VoiceInfo } from "../channels";
import { T } from "../i18n";
import { joinVoiceChannel } from "../join";
import { getReturnChannel, sendUserBack } from "../moveHistory";
import { canShowMagnet, getMoveAccess } from "../movePermissions";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName, openProfile } from "../names";
import { getPresenceInfo } from "../presence";
import { pullToMyChannel } from "../pull";
import { cancelQueue, isQueuedFor, queueForChannel } from "../queue";
import { settings } from "../settings";
import { removeUser, toggleNotify, togglePin, type TrackedUser } from "../store";
import { formatRelativeTime } from "../time";
import { toast, ToastType } from "../toast";
import { ActionButton, cl, PlatformIcons, StatusDot } from "./common";
import {
    BellIcon,
    CameraIcon,
    ClockIcon,
    DeafIcon,
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
import { StreamIndicator } from "./StreamPreview";

const TOOLTIP_MAX_MEMBERS = 10;

/** Discord's own channel chip ("Guild › Channel"), with a plain-text fallback. */
function ChannelMention({ voice }: { voice: VoiceInfo; }) {
    try {
        return <>{Parser.parse(`<#${voice.channelId}>`)}</>;
    } catch {
        return (
            <span className={cl("channel-name")}>
                {voice.guildName ? `${voice.guildName} › ` : ""}{voice.channelName}
            </span>
        );
    }
}

function ChannelChip({ voice }: { voice: VoiceInfo; }) {
    const memberIds = voice.participantIds;
    const Icon = voice.canJoin && !voice.isFull ? SpeakerIcon : LockedSpeakerIcon;

    const tooltip = (
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

    // clicking the chip only navigates, joining is what the button on the right is for
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
        <Tooltip text={tooltip}>
            {tooltipProps => (
                <span
                    {...tooltipProps}
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
        </Tooltip>
    );
}

export interface DragHandlers {
    onDragStart(id: string): void;
    onDragOver(id: string): void;
    onDrop(id: string): void;
    onDragEnd(): void;
    draggingId: string | null;
    overId: string | null;
    /**
     * Which edge of the row under the cursor the drop line belongs on. Dragging downwards lands
     * after that row, upwards before it, and a line drawn on the wrong side points at a gap the
     * row will not go into.
     */
    dropAfter: boolean;
}

export function UserRow({ user, drag }: { user: TrackedUser; drag?: DragHandlers; }) {
    const name = getUserDisplayName(user.id, user.name);
    const presence = getPresenceInfo(user.id);
    const voice = getVoiceInfo(user.id);
    const avatar = getAvatarUrl(user.id) ?? DEFAULT_AVATAR_URL;

    // the line marking the gap this row would be pushed into, on the edge the drop actually uses
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

    // pinned rows can be reordered by hand, everything else is ordered by time
    const dragProps = drag && {
        draggable: true,
        onDragStart: (event: React.DragEvent) => {
            event.dataTransfer.effectAllowed = "move";
            // some drop targets refuse a drag with no payload
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

    // moderator actions only exist where the permission is, but a permission check that itself
    // broke leaves the buttons in place and lets the server answer
    const moveAccess = getMoveAccess(user.id);
    const canMove = moveAccess !== "no";
    const uncheckedNote = moveAccess === "unknown" ? T.permissionUnchecked : "";
    // pulled them over? then the same button offers to put them back, until they leave you
    const returnTo = canMove ? getReturnChannel(user.id) : null;
    // an armed magnet outlives the target's voice session, so its button has to as well
    const showMagnet = canShowMagnet(user.id);

    /*
     * The magnet cannot reach across servers, needs you to be sitting somewhere, and has nobody to
     * move while they are out of voice. Say which it is instead of quietly doing nothing.
     *
     * The permission comes first of all, because the button is deliberately kept on screen for an
     * armed magnet whose target cannot be moved, so that there is somewhere left to switch it off.
     * Everything below it describes a magnet that would fire once the way is clear, and with the
     * permission missing none of them ever will, so the row promised a pull that could not happen.
     */
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

    /*
     * A queue belongs to the channel, not to the person who made you want it, so it outlives them
     * leaving. Reading it off their live channel alone meant the row went quiet the moment they
     * walked out, while the toolbar chip still said you were waiting, for a channel nothing on
     * screen connected to any more. Their last known channel is what keeps the two agreeing.
     */
    const queuedChannelId = voice?.channelId ?? user.lastChannelId;
    const queued = queuedChannelId != null && isQueuedFor(queuedChannelId);
    // a full channel is not a dead end any more, you can hold a spot instead
    const canQueue = voice != null && voice.isFull && voice.canJoin && !voice.isMyChannel;
    const joinBlocked = voice != null && !voice.canJoin;

    // the queue reads first, because it is the one state that survives them leaving voice, and the
    // button has to stay a way to call it off rather than turning into "they are not in voice"
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

    // user.name rather than the display name, because these persist it if the person is not
    // tracked yet, and the displayed one can be a translated placeholder. See getStoredName
    const handleMagnet = () => toggleMagnetFor(user.id, user.name);
    const handleAutoJoin = () => toggleAutoJoinFor(user.id, user.name);

    const openThisProfile = () => openProfile(user.id);

    return (
        <div className={rowClass} {...dragProps}>
            <div
                className={cl("avatar-wrap")}
                onClick={openThisProfile}
                // role="button" promises it works from the keyboard, so it has to
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
                    {user.pinned && <span className={cl("badge")}>{T.badgePinned}</span>}
                    {user.autoJoin && <span className={cl("badge") + " " + cl("badge-auto")}>{T.badgeAuto}</span>}
                    <PlatformIcons platforms={presence.platforms} />
                </div>

                <div className={cl("meta-line")}>
                    {voice ? <ChannelChip voice={voice} /> : (
                        <span className={cl("dim")}>
                            {T.notInVoice}
                            {user.lastChannelName && T.lastChannel(user.lastChannelName)}
                        </span>
                    )}
                    <StreamIndicator userId={user.id} name={name} />
                </div>

                <div className={cl("meta-line")}>
                    <span className={cl("dim")}>
                        {user.sharedVoice
                            ? T.seenAgo(formatRelativeTime(user.lastSeen))
                            : T.addedAgo(formatRelativeTime(user.lastSeen))}
                    </span>
                    {presence.activity && (
                        <span className={cl("activity") + " " + cl("activity-" + presence.activityKind)}>
                            {presence.activity}
                        </span>
                    )}
                </div>
            </div>

            <div className={cl("actions")}>
                <ActionButton
                    icon={queued ? <ClockIcon /> : joinBlocked ? <LockIcon /> : canQueue ? <ClockIcon /> : <JoinIcon />}
                    tooltip={joinTooltip}
                    active={queued}
                    onClick={handleJoin}
                    // a queue stays cancellable from here even after they have walked off
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
                    // an armed target with the master switch off follows nobody, and saying it is
                    // on was the row promising something the settings had already ruled out
                    tooltip={!user.autoJoin
                        ? T.autoJoinOff
                        : settings.store.autoJoinEnabled ? T.autoJoinOn : T.autoJoinOnButDisabled}
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
    );
}
