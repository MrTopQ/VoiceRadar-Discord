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

import { useForceUpdater } from "@utils/react";
import { FluxDispatcher, React, useEffect } from "@webpack/common";

import { channelLabel, getVoiceInfo, openChannel, type VoiceInfo } from "../channels";
import { T } from "../i18n";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName } from "../names";
import { getPresenceInfo, type PresenceInfo } from "../presence";
import { getProfileFacts, type GuildBadge, guildIconUrl, guildInitials, type ProfileFacts } from "../profileFacts";
import { getSightings, type Sighting } from "../sightings";
import { getTrackedUser, type TrackedUser } from "../store";
import { throttle } from "../throttle";
import { formatRelativeTime } from "../time";
import { toast, ToastType } from "../toast";
import { cl, StatusDot } from "./common";
import { SpeakerIcon } from "./icons";
import { closeWindow, openWindow, WindowHead } from "./Window";

const INFO_WINDOW = "person-info";
const REDRAW_THROTTLE_MS = 400;
const LIVE_REFRESH_MS = 15_000;
const DAY_MS = 24 * 60 * 60_000;
const WEEK_MS = 7 * DAY_MS;

const pad = (value: number) => String(value).padStart(2, "0");

const formatTime = (at: number) => `${pad(new Date(at).getHours())}:${pad(new Date(at).getMinutes())}`;

function formatDate(at: number): string {
    const date = new Date(at);
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatAge(at: number): string {
    const days = Math.floor((Date.now() - at) / DAY_MS);
    if (days >= 365) return T.infoAgeYears(Math.floor(days / 365));
    if (days >= 30) return T.infoAgeMonths(Math.floor(days / 30));
    return T.infoAgeDays(Math.max(0, days));
}

function dayHeading(at: number): string {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    if (at >= startOfToday) return T.infoToday;
    if (at >= startOfToday - DAY_MS) return T.infoYesterday;
    return formatDate(at);
}

const STATUS_LABELS: Record<string, () => string> = {
    online: () => T.statusOnline,
    idle: () => T.statusIdle,
    dnd: () => T.statusDnd,
    offline: () => T.statusOffline,
    invisible: () => T.statusOffline
};

const KIND_LABELS: Record<Sighting["kind"], () => string> = {
    joined: () => T.infoKindJoined,
    moved: () => T.infoKindMoved,
    left: () => T.infoKindLeft
};

function inChannelSince(lines: Sighting[], channelId: string): number | null {
    const latest = lines.find(line => line.kind !== "left");
    return latest?.channelId === channelId ? latest.at : null;
}

function openChannelOrSay(channelId: string | null) {
    if (channelId) openChannel(channelId);
    else toast(T.noChannelAccess, ToastType.FAILURE);
}

function copyId(userId: string) {
    navigator.clipboard?.writeText(userId)
        .then(() => toast(T.infoIdCopied, ToastType.SUCCESS))
        .catch(() => toast(T.infoIdCopyFailed, ToastType.FAILURE));
}

function LiveCard({ voice, since, user }: { voice: VoiceInfo | null; since: number | null; user: TrackedUser | undefined; }) {
    if (!voice) {
        return (
            <div className={cl("info-live") + " " + cl("info-live-off")}>
                <div className={cl("info-live-label")}>{T.infoOfflineTitle}</div>
                {user?.lastChannelName && (
                    <div className={cl("dim")}>{T.infoOfflineLast(user.lastChannelName)}</div>
                )}
            </div>
        );
    }

    return (
        <div className={cl("info-live")}>
            <div className={cl("info-live-label")}>{T.infoLiveTitle}</div>
            <div
                className={cl("info-live-channel")}
                role="button"
                tabIndex={0}
                onClick={() => openChannelOrSay(voice.channelId)}
                title={T.tooltipOpenChannel}
            >
                <SpeakerIcon />
                {channelLabel(voice)}
            </div>
            <div className={cl("dim")}>
                {since != null ? T.infoLiveSince(formatRelativeTime(since)) : T.infoLivePeople(voice.memberCount)}
            </div>
        </div>
    );
}

function Tile({ label, value, sub, wide, onClick }: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    wide?: boolean;
    onClick?: () => void;
}) {
    return (
        <div
            className={cl("info-tile") + (wide ? " " + cl("info-tile-wide") : "") + (onClick ? " " + cl("info-tile-click") : "")}
            onClick={onClick}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            <div className={cl("info-tile-label")}>{label}</div>
            <div className={cl("info-tile-value")}>{value}</div>
            {sub && <div className={cl("info-tile-sub")}>{sub}</div>}
        </div>
    );
}

function statusValue(presence: PresenceInfo): React.ReactNode {
    if (!presence.known) return T.infoStatusUnknown;

    return (
        <span className={cl("info-status")}>
            <StatusDot status={presence.status} mobile={presence.isMobile} known />
            {STATUS_LABELS[presence.status]?.() ?? presence.status}
        </span>
    );
}

function friendValue(facts: ProfileFacts): string | null {
    if (facts.isBlocked) return T.infoFriendBlocked;
    if (facts.isFriend == null) return null;
    return facts.isFriend ? T.infoYes : T.infoNo;
}

function GuildChip({ guild }: { guild: GuildBadge; }) {
    const icon = guildIconUrl(guild);

    return (
        <span className={cl("guild-chip")} title={guild.name}>
            {icon
                ? <img className={cl("guild-icon")} src={icon} alt="" />
                : <span className={cl("guild-icon") + " " + cl("guild-icon-initials")}>{guildInitials(guild.name)}</span>}
            <span className={cl("guild-chip-name")}>{guild.name}</span>
        </span>
    );
}

function MutualTile({ facts }: { facts: ProfileFacts; }) {
    const mutual = facts.mutualGuilds;
    if (!mutual || (!mutual.count && !mutual.complete)) return null;

    const rest = mutual.count - mutual.guilds.length;
    const count = mutual.complete ? String(mutual.count) : T.infoAtLeast(mutual.count);

    return (
        <Tile
            label={`${T.infoMutualTitle} · ${count}`}
            value={mutual.count
                ? (
                    <span className={cl("guild-chips")}>
                        {mutual.guilds.map(guild => <GuildChip key={guild.id} guild={guild} />)}
                        {rest > 0 && <span className={cl("guild-chip") + " " + cl("guild-chip-more")}>+{rest}</span>}
                    </span>
                )
                : T.infoNo}
            sub={mutual.complete ? undefined : T.infoMutualPartial}
            wide
        />
    );
}

function Tiles({ userId, user, presence, lines, guildId }: {
    userId: string;
    user: TrackedUser | undefined;
    presence: PresenceInfo;
    lines: Sighting[];
    guildId: string | null;
}) {
    const facts = getProfileFacts(userId, guildId);
    const friend = friendValue(facts);
    const joinsThisWeek = lines.filter(line => line.kind !== "left" && Date.now() - line.at < WEEK_MS).length;

    return (
        <div className={cl("info-grid")}>
            <Tile
                label={T.infoWithYou}
                value={user?.sharedVoice ? formatRelativeTime(user.lastSeen) : T.infoWithYouNever}
                sub={user?.sharedVoice
                    ? `${formatDate(user.lastSeen)}, ${formatTime(user.lastSeen)}${user.lastChannelName ? ` · ${user.lastChannelName}` : ""}`
                    : undefined}
            />
            <Tile label={T.infoWeek} value={String(joinsThisWeek)} sub={T.infoWeekSub} />
            <Tile label={T.infoStatus} value={statusValue(presence)} sub={presence.activity ?? undefined} />

            {facts.createdAt != null && (
                <Tile label={T.infoCreated} value={formatDate(facts.createdAt)} sub={formatAge(facts.createdAt)} />
            )}
            {facts.currentGuild && facts.joinedCurrentGuildAt != null && (
                <Tile
                    label={T.infoJoinedGuild}
                    value={<GuildChip guild={facts.currentGuild} />}
                    sub={T.infoJoinedGuildSince(formatDate(facts.joinedCurrentGuildAt), formatAge(facts.joinedCurrentGuildAt))}
                />
            )}
            {friend && <Tile label={T.infoFriend} value={friend} />}

            <MutualTile facts={facts} />
        </div>
    );
}

function SightingLine({ line }: { line: Sighting; }) {
    return (
        <div className={cl("info-line")}>
            <span className={cl("info-dot") + " " + cl("info-dot-" + line.kind)} />
            <span className={cl("info-when")} title={`${formatDate(line.at)}, ${formatTime(line.at)}`}>
                {formatTime(line.at)}
            </span>
            <span className={cl("info-kind") + " " + cl("info-kind-" + line.kind)}>{KIND_LABELS[line.kind]()}</span>
            <span
                className={cl("info-where")}
                role="button"
                tabIndex={0}
                onClick={() => openChannelOrSay(line.channelId)}
            >
                {line.channelLabel ?? T.unknownChannel}
            </span>
            {line.withYou && <span className={cl("badge") + " " + cl("badge-here")}>{T.badgeWithYou}</span>}
        </div>
    );
}

function Journal({ lines }: { lines: Sighting[]; }) {
    if (!lines.length) {
        return (
            <div className={cl("info-empty")}>
                <div className={cl("info-empty-title")}>{T.infoLogEmptyTitle}</div>
                <div className={cl("dim")}>{T.infoLogEmpty}</div>
            </div>
        );
    }

    const days: { heading: string; lines: Sighting[]; }[] = [];
    for (const line of lines) {
        const heading = dayHeading(line.at);
        const last = days[days.length - 1];

        if (last?.heading === heading) last.lines.push(line);
        else days.push({ heading, lines: [line] });
    }

    return (
        <div className={cl("info-log")}>
            {days.map(day => (
                <div key={day.heading} className={cl("info-day")}>
                    <div className={cl("info-day-heading")}>{day.heading}</div>
                    {day.lines.map(line => <SightingLine key={`${line.at}-${line.kind}`} line={line} />)}
                </div>
            ))}
        </div>
    );
}

function PersonInfo({ userId, embedded, onClose }: { userId: string; embedded: boolean; onClose: () => void; }) {
    const forceUpdate = useForceUpdater();

    useEffect(() => {
        const redraw = throttle(forceUpdate, REDRAW_THROTTLE_MS);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", redraw);
        const interval = setInterval(forceUpdate, LIVE_REFRESH_MS);

        return () => {
            redraw.cancel();
            FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", redraw);
            clearInterval(interval);
        };
    }, []);

    const user = getTrackedUser(userId);
    const name = getUserDisplayName(userId, user?.name);
    const voice = getVoiceInfo(userId);
    const presence = getPresenceInfo(userId);
    const lines = getSightings(userId);
    const facts = getProfileFacts(userId, null);

    const since = voice ? inChannelSince(lines, voice.channelId) : null;

    return (
        <>
            <WindowHead
                embedded={embedded}
                onClose={onClose}
                leading={
                    <span className={cl("info-header-avatar")}>
                        <img src={getAvatarUrl(userId) ?? DEFAULT_AVATAR_URL} alt="" />
                        <StatusDot status={presence.status} mobile={presence.isMobile} known={presence.known} />
                    </span>
                }
                title={<>{name}{facts.isBot && <span className={cl("badge")}>{T.infoBot}</span>}</>}
                subtitle={
                    <>
                        {facts.username && `@${facts.username} · `}
                        <span
                            className={cl("info-id")}
                            role="button"
                            tabIndex={0}
                            title={T.infoIdCopy}
                            onClick={() => copyId(userId)}
                        >
                            ID {userId}
                        </span>
                    </>
                }
            />

            <div className={cl("window-body")}>
                <LiveCard voice={voice} since={since} user={user} />

                <Tiles userId={userId} user={user} presence={presence} lines={lines} guildId={voice?.guildId ?? null} />

                <div className={cl("info-section-title")}>{T.infoLogTitle(lines.length)}</div>
                <Journal lines={lines} />
            </div>
        </>
    );
}

export function openPersonInfo(userId: string) {
    const opened = openWindow(INFO_WINDOW, {
        label: T.infoWindowLabel,
        size: "lg",
        render: (close, embedded) => <PersonInfo userId={userId} embedded={embedded} onClose={close} />
    });

    if (!opened) toast(T.couldNotOpenWindow, ToastType.FAILURE);
}

export function closePersonInfo() {
    closeWindow(INFO_WINDOW);
}
