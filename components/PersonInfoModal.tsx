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

import { channelLabel, getVoiceInfo, type VoiceInfo } from "../channels";
import { T } from "../i18n";
import { lookupLink, openLookup } from "../lookup";
import { canOpenModView, pickModViewGuild } from "../modView";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName } from "../names";
import { getPresenceInfo, type PresenceInfo } from "../presence";
import { getProfileFacts, type GuildBadge, guildIconUrl, guildInitials, isLoadingMutualGuilds, loadMutualGuilds, type ProfileFacts } from "../profileFacts";
import { getSightings, lastSeenTogether, MAX_SIGHTINGS_PER_PERSON, placeAfter, type Sighting } from "../sightings";
import { getTrackedUser, type TrackedUser } from "../store";
import { throttle } from "../throttle";
import { calendarAge, dayStart, formatDayStamp, formatMoment, formatOnDay } from "../time";
import { toast, ToastType } from "../toast";
import { getWatchSpans, watchedThrough } from "../watchLog";
import { cl, StatusDot } from "./common";
import { Hint } from "./Hint";
import { ChevronDownIcon, ExternalIcon, ShieldIcon, SpeakerIcon } from "./icons";
import { Journal, openChannelOrSay } from "./Journal";
import { openModViewServerMenu, showModView } from "./ModViewMenu";
import { AvatarStack } from "./VoicePeople";
import { closeWindow, openWindow, WindowHead } from "./Window";

const INFO_WINDOW = "person-info";
const REDRAW_THROTTLE_MS = 400;
const LIVE_REFRESH_MS = 15_000;
const WEEK_DAYS = 7;
const LIVE_AVATARS = 12;

const pad = (value: number) => String(value).padStart(2, "0");

function formatDate(at: number): string {
    const date = new Date(at);
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** Counted on the calendar in whole units, so nothing is rounded up. */
function formatAge(at: number): string {
    const { years, months, days } = calendarAge(at);
    return T.infoAge(years, months, days);
}

const STATUS_LABELS: Record<string, () => string> = {
    online: () => T.statusOnline,
    idle: () => T.statusIdle,
    dnd: () => T.statusDnd,
    offline: () => T.statusOffline,
    invisible: () => T.statusOffline
};

/**
 * Since when the person surely sits where they are: from the line that brought them in, as far back as
 * the plugin watched without a break. Only a join or a move gives the moment they came in.
 */
function liveDetail(voice: VoiceInfo, lines: Sighting[]): string {
    const watched = getWatchSpans();
    const now = Date.now();
    let since: Sighting | null = null;

    for (const line of lines) {
        if (placeAfter(line) !== voice.channelId || line.after != null || !watchedThrough(watched, line.at, now)) break;
        since = line;
        if (line.kind === "joined" || line.kind === "moved") break;
    }

    if (!since) return T.infoLivePeople(voice.memberCount);
    return since.kind === "joined" || since.kind === "moved"
        ? T.infoLiveSince(formatMoment(since.at, now))
        : T.infoLiveFound(formatDayStamp(since.at, now));
}

function copyId(userId: string) {
    navigator.clipboard?.writeText(userId)
        .then(() => toast(T.infoIdCopied, ToastType.SUCCESS))
        .catch(() => toast(T.infoIdCopyFailed, ToastType.FAILURE));
}

function LiveCard({ userId, voice, lines, user }: { userId: string; voice: VoiceInfo | null; lines: Sighting[]; user: TrackedUser | undefined; }) {
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
            <div className={cl("dim")}>{liveDetail(voice, lines)}</div>
            <AvatarStack ids={voice.participantIds.filter(id => id !== userId)} max={LIVE_AVATARS} />
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

/** With a person given, a server where Mod View can open becomes a button for it. */
function GuildChip({ guild, userId }: { guild: GuildBadge; userId?: string; }) {
    const icon = guildIconUrl(guild);
    const content = (
        <>
            {icon
                ? <img className={cl("guild-icon")} src={icon} alt="" />
                : <span className={cl("guild-icon") + " " + cl("guild-icon-initials")}>{guildInitials(guild.name)}</span>}
            <span className={cl("guild-chip-name")}>{guild.name}</span>
        </>
    );

    if (!userId || !canOpenModView(guild.id)) {
        return <span className={cl("guild-chip")} title={guild.name}>{content}</span>;
    }

    return (
        <Hint text={T.modViewGuildHint(guild.name)}>
            {hintProps => (
                <span
                    {...hintProps}
                    className={cl("guild-chip") + " " + cl("guild-chip-click")}
                    role="button"
                    tabIndex={0}
                    onClick={() => showModView(userId, guild.id)}
                    onKeyDown={event => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        showModView(userId, guild.id);
                    }}
                >
                    {content}
                </span>
            )}
        </Hint>
    );
}

function MutualTile({ userId, facts, loading }: { userId: string; facts: ProfileFacts; loading: boolean; }) {
    const mutual = facts.mutualGuilds;
    if (!mutual || (!mutual.count && !mutual.complete && !loading)) return null;

    const rest = mutual.count - mutual.guilds.length;
    const count = mutual.complete ? String(mutual.count) : T.infoAtLeast(mutual.count);

    return (
        <Tile
            label={`${T.infoMutualTitle} · ${count}`}
            value={mutual.count
                ? (
                    <span className={cl("guild-chips")}>
                        {mutual.guilds.map(guild => <GuildChip key={guild.id} guild={guild} userId={userId} />)}
                        {rest > 0 && <span className={cl("guild-chip") + " " + cl("guild-chip-more")}>+{rest}</span>}
                    </span>
                )
                : T.infoNo}
            sub={mutual.complete ? undefined : loading ? T.infoMutualLoading : T.infoMutualPartial}
            wide
        />
    );
}

function lastTogetherValue(userId: string, user: TrackedUser | undefined, voice: VoiceInfo | null): string {
    if (voice?.isMyChannel) return T.infoWithYouNow;
    if (!user?.sharedVoice) return T.infoWithYouNever;
    return formatOnDay(lastSeenTogether(userId, user.lastSeen), null);
}

/** Joins and moves the journal holds for the last seven days, which it only has while Discord runs. */
function weekCounts(lines: Sighting[]): { joins: number; moves: number; } {
    const from = dayStart(Date.now(), 1 - WEEK_DAYS);
    const recent = lines.filter(line => (line.after ?? line.at) >= from);
    return {
        joins: recent.filter(line => line.kind === "joined").length,
        moves: recent.filter(line => line.kind === "moved").length
    };
}

function Tiles({ userId, user, presence, lines, voice }: {
    userId: string;
    user: TrackedUser | undefined;
    presence: PresenceInfo;
    lines: Sighting[];
    voice: VoiceInfo | null;
}) {
    const facts = getProfileFacts(userId, voice?.guildId ?? null);
    const friend = friendValue(facts);
    const week = weekCounts(lines);

    return (
        <div className={cl("info-grid")}>
            <Tile
                label={T.infoWithYou}
                value={lastTogetherValue(userId, user, voice)}
                sub={user?.sharedVoice && !voice?.isMyChannel ? user.lastChannelName ?? undefined : undefined}
            />
            <Tile label={T.infoWeek} value={T.infoWeekValue(week.joins, week.moves)} sub={T.infoWeekSub} />
            <Tile label={T.infoStatus} value={statusValue(presence)} sub={presence.activity ?? undefined} />

            {facts.createdAt != null && (
                <Tile label={T.infoCreated} value={formatDate(facts.createdAt)} sub={formatAge(facts.createdAt)} />
            )}
            {facts.currentGuild && facts.joinedCurrentGuildAt != null && (
                <Tile
                    label={T.infoJoinedGuild}
                    value={<GuildChip guild={facts.currentGuild} userId={userId} />}
                    sub={T.infoJoinedGuildSince(formatDate(facts.joinedCurrentGuildAt), formatAge(facts.joinedCurrentGuildAt))}
                />
            )}
            {friend && <Tile label={T.infoFriend} value={friend} />}

            <MutualTile userId={userId} facts={facts} loading={isLoadingMutualGuilds(userId)} />
        </div>
    );
}

function PersonInfo({ userId, embedded, onClose }: { userId: string; embedded: boolean; onClose: () => void; }) {
    const forceUpdate = useForceUpdater();

    useEffect(() => {
        let open = true;
        void loadMutualGuilds(userId).then(() => {
            if (open) forceUpdate();
        });
        return () => {
            open = false;
        };
    }, [userId]);

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

    return (
        <>
            <WindowHead
                embedded={embedded}
                onClose={onClose}
                trailing={<><ModViewButton userId={userId} /><LookupButton userId={userId} /></>}
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
                <LiveCard userId={userId} voice={voice} lines={lines} user={user} />

                <Tiles userId={userId} user={user} presence={presence} lines={lines} voice={voice} />

                <div className={cl("info-section-title")}>
                    {T.infoLogTitle(lines.length, MAX_SIGHTINGS_PER_PERSON)}
                    <span className={cl("info-section-note")}>{T.infoLogOrder}</span>
                </div>
                <Journal key={userId} lines={lines} userId={userId} />
            </div>
        </>
    );
}

/** Stays visible even when it cannot work, so its hint can say what is missing. */
function ModViewButton({ userId }: { userId: string; }) {
    const choice = pickModViewGuild(userId);
    const off = choice.guildId === undefined;

    return (
        <span className={cl("chip-split")}>
            <Hint text={off ? choice.problem : T.modViewHint(choice.guildName)}>
                {hintProps => (
                    <button
                        {...hintProps}
                        className={cl("chip") + " " + cl(off ? "chip-off" : "chip-split-main")}
                        aria-disabled={off}
                        onClick={() => {
                            if (choice.guildId === undefined) toast(choice.problem, ToastType.FAILURE);
                            else showModView(userId, choice.guildId);
                        }}
                    >
                        <ShieldIcon size={16} />
                        {T.modViewButton}
                    </button>
                )}
            </Hint>
            {!off && (
                <Hint text={T.modViewOtherHint}>
                    {hintProps => (
                        <button
                            {...hintProps}
                            className={cl("chip") + " " + cl("chip-split-more")}
                            aria-label={T.modViewOtherHint}
                            onClick={event => openModViewServerMenu(event, userId)}
                        >
                            <ChevronDownIcon />
                        </button>
                    )}
                </Hint>
            )}
        </span>
    );
}

function LookupButton({ userId }: { userId: string; }) {
    const link = lookupLink(userId);
    if (!link) return null;

    return (
        <Hint text={T.lookupHint(link.host)}>
            {hintProps => (
                <button {...hintProps} className={cl("chip")} onClick={() => openLookup(userId)}>
                    <ExternalIcon />
                    {link.host}
                </button>
            )}
        </Hint>
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
