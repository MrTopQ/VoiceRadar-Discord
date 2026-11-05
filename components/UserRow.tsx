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

import { Parser, React, UserStore } from "@webpack/common";
import type { ComponentType, ReactNode } from "react";

import { TtlCache } from "../cache";
import { getChannelParticipantIds, getMyChannelId, getMyGuildId, getVoiceInfo, type VoiceInfo } from "../channels";
import { spotlightChannel } from "../channelSpotlight";
import { T } from "../i18n";
import { joinVoiceChannel } from "../join";
import { canOpenModViewEverywhere, isModeratorIn } from "../modView";
import { getReturnableBatch, getReturnChannel, sendBatchBack, sendUserBack } from "../moveHistory";
import { canShowMagnet, getMoveAccess } from "../movePermissions";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName, openProfile } from "../names";
import { getPresenceInfo } from "../presence";
import { canMoveGroupTo, moveGroupTo, pullableUsers, pullTheirChannelToMe, pullToMyChannel } from "../pull";
import { cancelQueue, isQueuedFor, queueForChannel } from "../queue";
import { getRecentMarkMs, settings } from "../settings";
import { getLastLeave, getRecentChange, lastSeenTogether } from "../sightings";
import { removeUser, type TrackedUser } from "../store";
import { getStreamFor } from "../streams";
import { formatMoment } from "../time";
import { toast, ToastType } from "../toast";
import { openUserMenu } from "../userMenu";
import { ActionButton, cl, PlatformIcons, StatusDot } from "./common";
import { Hint } from "./Hint";
import {
    CameraIcon,
    ChevronDownIcon,
    ClockIcon,
    DeafIcon,
    InfoIcon,
    JoinIcon,
    LockedSpeakerIcon,
    LockIcon,
    MicOffIcon,
    PullIcon,
    ReturnIcon,
    ShieldIcon,
    SpeakerIcon,
    TrashIcon
} from "./icons";
import { openModViewServerMenu, showModViewForPerson } from "./ModViewMenu";
import { AutoJoinButton, MagnetButton, NotifyButton, PinButton } from "./PersonButtons";
import { openPersonInfo } from "./PersonInfoModal";
import { type MenuChoice, type MenuPerson, openPopoverMenu } from "./PopoverMenu";
import { StreamIndicator } from "./StreamPreview";
import { PeopleRows, SpeakingAvatar } from "./VoicePeople";
import { closeAllWindows } from "./Window";

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
            <PeopleRows ids={memberIds} max={TOOLTIP_MAX_MEMBERS} />
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

export function ChannelChip({ voice }: { voice: VoiceInfo; }) {
    const Icon = voice.canJoin && !voice.isFull ? SpeakerIcon : LockedSpeakerIcon;

    const onClick = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        if (!voice.canView) {
            toast(T.noChannelAccess, ToastType.FAILURE);
            return;
        }

        closeAllWindows();
        void spotlightChannel(voice.channelId);
    };

    return (
        <Hint interactive text={<ChannelTooltip voice={voice} />}>
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
                ? T.leftAt(formatMoment(leave.at), channel)
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

interface UserRowProps {
    user: TrackedUser;
    drag?: DragHandlers;
    signature?: string;
}

/** What every row shows that does not belong to one person, worked out once per redraw. */
export function rowSharedKey(): string {
    return [getMyChannelId(), getMyGuildId(), settings.store.silentJoin, settings.store.autoJoinCooldown, getReturnableBatch().length, canOpenModViewEverywhere(), T.infoButton, Math.floor(Date.now() / 60_000)].join("|");
}

/** Shown only where it can work, so most people without the rights never see a dead button. */
function showsModView(voice: VoiceInfo | null): boolean {
    return canOpenModViewEverywhere() || (voice?.guildId != null && isModeratorIn(voice.guildId));
}

/** The shield opens the server they sit on, the arrow beside it lists the other shared servers. */
/** Pulls the person, and the arrow offers their whole channel or taking yours over to them. */
function menuPerson(id: string): MenuPerson {
    return { id, name: getUserDisplayName(id), avatar: getAvatarUrl(id) ?? DEFAULT_AVATAR_URL };
}

function menuPeople(ids: readonly string[], firstId?: string): MenuPerson[] {
    const ordered = firstId && ids.includes(firstId) ? [firstId, ...ids.filter(id => id !== firstId)] : ids;
    return ordered.map(menuPerson);
}

function PullSplit({ userId, voice, note }: { userId: string; voice: VoiceInfo | null; note: string; }) {
    const canAct = voice != null && !voice.isMyChannel;
    const there = voice?.participantIds.length ?? 0;
    const groupMove = voice != null && canMoveGroupTo(voice.channelId);
    const hasMore = canAct;

    const pullButton = (
        <ActionButton
            icon={<PullIcon />}
            tooltip={(voice?.isMyChannel ? T.pullAlreadyHere : T.pullToMyChannel) + note}
            extraClass={hasMore ? cl("split-main") : undefined}
            onClick={() => void pullToMyChannel(userId)}
            disabled={!canAct}
        />
    );

    if (!hasMore || !voice) return pullButton;

    const choices = (): MenuChoice[] => {
        const myChannelId = getMyChannelId();
        const me = UserStore.getCurrentUser()?.id;
        const company = myChannelId ? getChannelParticipantIds(myChannelId).filter(id => id !== me) : [];
        const moving = pullableUsers(voice.participantIds);

        return [
            {
                label: T.menuPullChannel(voice.channelName),
                hint: moving.length === there ? T.peopleThere(there)
                    : moving.length ? T.pullSomeOfThem(moving.length, there)
                        : T.pullNobodyMovable,
                people: menuPeople(moving, userId),
                onSelect: () => void pullTheirChannelToMe(userId)
            },
            ...(groupMove ? [{
                label: T.menuMoveGroupTo(voice.channelName),
                hint: T.groupMoveHint(company.length),
                people: [...(me ? [{ ...menuPerson(me), name: T.menuYou }] : []), ...menuPeople(company)],
                onSelect: () => moveGroupTo(voice.channelId)
            }] : [])
        ];
    };

    return (
        <div className={cl("split")}>
            {pullButton}
            <ActionButton
                icon={<ChevronDownIcon />}
                tooltip={T.pullMoreHint}
                extraClass={cl("split-more")}
                onClick={event => openPopoverMenu(event.currentTarget as Element, choices())}
            />
        </div>
    );
}

/** Sends the person back, and the arrow sends back everybody the radar moved. */
function ReturnSplit({ userId, channelName, note }: { userId: string; channelName: string; note: string; }) {
    const batch = getReturnableBatch().length;

    const returnButton = (
        <ActionButton
            icon={<ReturnIcon />}
            tooltip={T.sendBackTo(channelName) + note}
            warn
            extraClass={batch >= 2 ? cl("split-main") : undefined}
            onClick={() => void sendUserBack(userId)}
        />
    );

    if (batch < 2) return returnButton;

    return (
        <div className={cl("split")}>
            {returnButton}
            <ActionButton
                icon={<ChevronDownIcon />}
                tooltip={T.returnMoreHint}
                extraClass={cl("split-more")}
                onClick={event => openPopoverMenu(event.currentTarget as Element, [{
                    label: T.returnAllLabel,
                    hint: T.peopleCount(batch),
                    onSelect: () => void sendBatchBack()
                }])}
            />
        </div>
    );
}

function ModViewSplit({ userId, voice }: { userId: string; voice: VoiceInfo | null; }) {
    return (
        <div className={cl("split") + " " + cl("modview-split")}>
            <ActionButton
                icon={<ShieldIcon />}
                tooltip={voice?.guildName ? T.modViewGuildHint(voice.guildName) : T.modViewRowHint}
                extraClass={cl("split-main")}
                onClick={() => showModViewForPerson(userId)}
            />
            <ActionButton
                icon={<ChevronDownIcon />}
                tooltip={T.modViewOtherHint}
                extraClass={cl("split-more")}
                onClick={event => openModViewServerMenu(event, userId)}
            />
        </div>
    );
}

/** Everything a row shows, as one string, so a row whose string did not change can skip redrawing. */
export function rowSignature(user: TrackedUser, sharedKey: string): string {
    const voice = getVoiceInfo(user.id);
    const presence = getPresenceInfo(user.id);

    return [
        sharedKey,
        getUserDisplayName(user.id, user.name),
        getAvatarUrl(user.id),
        voice && [voice.channelId, voice.memberCount, voice.participantIds.join(","), voice.isMuted, voice.isDeafened, voice.selfVideo, voice.selfStream, voice.canView, voice.canJoin, voice.isFull, voice.isMyChannel].join(","),
        presence.status, presence.isMobile, presence.known, presence.activity, presence.activityKind,
        presence.platforms.map(entry => entry.platform + entry.status).join(","),
        getMoveAccess(user.id), getReturnChannel(user.id)?.name, canShowMagnet(user.id),
        isQueuedFor(voice?.channelId ?? user.lastChannelId ?? ""),
        getLastLeave(user.id)?.at,
        getRecentChange(user.id, getRecentMarkMs())?.at,
        getStreamFor(user.id) != null,
        showsModView(voice)
    ].join("|");
}

const sameDrag = (a?: DragHandlers, b?: DragHandlers) =>
    a === b || (!!a && !!b && a.draggingId === b.draggingId && a.overId === b.overId && a.dropAfter === b.dropAfter);

let memoRow: ComponentType<UserRowProps> | null = null;

/** Made on first use, because React is not loaded yet when this module is. */
export function getMemoUserRow(): ComponentType<UserRowProps> {
    memoRow ??= React.memo(UserRow, (a, b) => a.user === b.user && a.signature === b.signature && sameDrag(a.drag, b.drag));
    return memoRow;
}

export function UserRow({ user, drag }: UserRowProps) {
    const name = getUserDisplayName(user.id, user.name);
    const presence = getPresenceInfo(user.id);
    const voice = getVoiceInfo(user.id);
    const avatar = getAvatarUrl(user.id) ?? DEFAULT_AVATAR_URL;
    const recent = getRecentChange(user.id, getRecentMarkMs());

    const dropClass = drag && drag.overId === user.id && drag.draggingId !== user.id
        ? cl(drag.dropAfter ? "row-drop-after" : "row-drop-before")
        : null;

    const rowClass = [
        cl("row"),
        voice && cl("row-live"),
        voice?.isMyChannel && cl("row-here"),
        recent && cl("row-recent-" + recent.kind),
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

    const queuedChannelId = voice?.channelId ?? user.lastChannelId;
    const queued = queuedChannelId != null && isQueuedFor(queuedChannelId);
    const canQueue = voice != null && voice.isFull && voice.canJoin && !voice.isMyChannel;
    const joinBlocked = voice != null && !voice.canJoin;

    const joinTooltip = queued ? T.joinQueued
        : !voice ? T.joinNotInVoice
            : voice.isMyChannel ? T.joinAlreadyThere
                : !voice.canJoin ? T.joinNoPermission
                    : voice.isFull ? T.joinChannelFull
                        : voice.fullButAllowed ? T.joinFullWithRights
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
    const buttonProps = { userId: user.id, storedName: user.name, tracked: user };

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
                {voice?.isMyChannel
                    ? <SpeakingAvatar userId={user.id} src={avatar} alt={name} />
                    : <img className={cl("avatar")} src={avatar} alt={name} />}
                <StatusDot status={presence.status} mobile={presence.isMobile} known={presence.known} />
            </div>

            <div className={cl("info")}>
                <div className={cl("name-line")}>
                    <span className={cl("name")} onClick={openThisProfile}>{name}</span>
                    {recent && (
                        <span className={cl("badge") + " " + cl("badge-recent-" + recent.kind)}>
                            {(recent.kind === "joined" ? T.badgeRecentJoined : T.badgeRecentLeft)(formatMoment(recent.at))}
                        </span>
                    )}
                    {user.autoJoin && <span className={cl("badge") + " " + cl("badge-auto")}>{T.badgeAuto}</span>}
                    <PlatformIcons platforms={presence.platforms} />
                </div>

                <div className={cl("meta-line")}>
                    {voice ? <ChannelChip voice={voice} /> : <NotInVoice user={user} />}
                    <StreamIndicator userId={user.id} name={name} />
                </div>

                <div className={cl("meta-line")}>
                    <span className={cl("dim")}>
                        {user.sharedVoice
                            ? T.seenAt(formatMoment(lastSeenTogether(user.id, user.lastSeen)))
                            : T.addedAt(formatMoment(user.lastSeen))}
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
                        extraClass={voice?.fullButAllowed && !voice.isMyChannel ? cl("action-pass") : undefined}
                        onClick={handleJoin}
                        disabled={!queued && (!voice || voice.isMyChannel || joinBlocked)}
                    />
                    {canMove && (returnTo
                        ? <ReturnSplit userId={user.id} channelName={returnTo.name} note={uncheckedNote} />
                        : <PullSplit userId={user.id} voice={voice} note={uncheckedNote} />
                    )}
                    <MagnetButton {...buttonProps} />
                </div>

                <div className={cl("action-group")}>
                    <PinButton {...buttonProps} />
                    <NotifyButton {...buttonProps} />
                    <AutoJoinButton {...buttonProps} />
                    {showsModView(voice) && <ModViewSplit userId={user.id} voice={voice} />}
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
