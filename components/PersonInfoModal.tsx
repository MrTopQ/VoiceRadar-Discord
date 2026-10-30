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
import { spotlightChannel } from "../channelSpotlight";
import { T } from "../i18n";
import { moveLabel } from "../journalTimeline";
import { lookupLink, openLookup } from "../lookup";
import { canOpenModView, pickModViewGuild } from "../modView";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName } from "../names";
import { getPresenceInfo, type PresenceInfo } from "../presence";
import { getProfileFacts, type GuildBadge, guildIconUrl, guildInitials, isLoadingMutualGuilds, loadMutualGuilds, type ProfileFacts } from "../profileFacts";
import { getSightings, isTheirMove, type Sighting, startsTogether, togetherBefore } from "../sightings";
import { getTrackedUser, type TrackedUser } from "../store";
import { throttle } from "../throttle";
import { formatRelativeTime } from "../time";
import { toast, ToastType } from "../toast";
import { gapBetween, getWatchSpans, watchedThrough,type WatchSpan } from "../watchLog";
import { cl, StatusDot } from "./common";
import { Hint } from "./Hint";
import { ChevronDownIcon, ExternalIcon, ShieldIcon, SpeakerIcon } from "./icons";
import { openModViewServerMenu, showModView } from "./ModViewMenu";
import { closeAllWindows, closeWindow, openWindow, WindowHead } from "./Window";

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
    left: () => T.infoKindLeft,
    "you-joined": () => T.infoKindYouJoined,
    "you-left": () => T.infoKindYouLeft
};

/** Only when the plugin saw them sit there all along, since a closed Discord could have missed them leaving and coming back. */
function inChannelSince(lines: Sighting[], channelId: string): number | null {
    const latest = lines.find(isTheirMove);
    if (latest?.channelId !== channelId) return null;
    return watchedThrough(getWatchSpans(), latest.at, Date.now()) ? latest.at : null;
}

function openChannelOrSay(channelId: string | null) {
    if (!channelId) {
        toast(T.noChannelAccess, ToastType.FAILURE);
        return;
    }

    closeAllWindows();
    void spotlightChannel(channelId);
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

function Tiles({ userId, user, presence, lines, guildId }: {
    userId: string;
    user: TrackedUser | undefined;
    presence: PresenceInfo;
    lines: Sighting[];
    guildId: string | null;
}) {
    const facts = getProfileFacts(userId, guildId);
    const friend = friendValue(facts);
    const joinsThisWeek = lines.filter(line => isTheirMove(line) && Date.now() - line.at < WEEK_MS).length;

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
                    value={<GuildChip guild={facts.currentGuild} userId={userId} />}
                    sub={T.infoJoinedGuildSince(formatDate(facts.joinedCurrentGuildAt), formatAge(facts.joinedCurrentGuildAt))}
                />
            )}
            {friend && <Tile label={T.infoFriend} value={friend} />}

            <MutualTile userId={userId} facts={facts} loading={isLoadingMutualGuilds(userId)} />
        </div>
    );
}

function TogetherBadge({ line, together }: { line: Sighting; together: number | null; }) {
    if (together != null) {
        // A move names the new channel, while the time together was spent in the one before it.
        const text = line.kind === "moved" ? T.infoTogetherBefore : T.infoTogether;
        return <span className={cl("badge") + " " + cl("badge-here")}>{text(Math.floor(together / 60_000))}</span>;
    }
    if (line.kind !== "you-joined" && startsTogether(line)) return <span className={cl("badge") + " " + cl("badge-here")}>{T.infoCameToYou}</span>;
    return null;
}

function GapLine({ gap }: { gap: WatchSpan; }) {
    const sameDay = new Date(gap.start).toDateString() === new Date(gap.end).toDateString();
    const stamp = (at: number) => sameDay ? formatTime(at) : `${formatDate(at)} ${formatTime(at)}`;

    return <div className={cl("info-gap")}>{T.infoGap(stamp(gap.start), stamp(gap.end))}</div>;
}

function SightingLine({ line, together }: { line: Sighting; together: number | null; }) {
    const where = line.channelLabel ?? T.unknownChannel;

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
                {line.kind === "moved" ? moveLabel(line.fromLabel, where) : where}
            </span>
            <TogetherBadge line={line} together={together} />
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

    const watched = getWatchSpans();

    const days: { start: number; entries: { line: Sighting; together: number | null; gap: WatchSpan | null; }[]; }[] = [];
    lines.forEach((line, index) => {
        const start = new Date(line.at).setHours(0, 0, 0, 0);
        const last = days[days.length - 1];
        const older = lines[index + 1];
        const entry = {
            line,
            together: togetherBefore(lines, index, watched),
            gap: older ? gapBetween(watched, older.at, line.at) : null
        };

        if (last?.start === start) last.entries.push(entry);
        else days.push({ start, entries: [entry] });
    });

    return (
        <div className={cl("info-log")}>
            {days.map(day => (
                <div key={day.start} className={cl("info-day")}>
                    <div className={cl("info-day-heading")}>{dayHeading(day.start)}</div>
                    {day.entries.map(({ line, together, gap }) => (
                        <React.Fragment key={`${line.at}-${line.kind}`}>
                            <SightingLine line={line} together={together} />
                            {gap && <GapLine gap={gap} />}
                        </React.Fragment>
                    ))}
                </div>
            ))}
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

    const since = voice ? inChannelSince(lines, voice.channelId) : null;

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
                <LiveCard voice={voice} since={since} user={user} />

                <Tiles userId={userId} user={user} presence={presence} lines={lines} guildId={voice?.guildId ?? null} />

                <div className={cl("info-section-title")}>{T.infoLogTitle(lines.length)}</div>
                <Journal lines={lines} />
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
