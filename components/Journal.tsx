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

import { useState } from "@webpack/common";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";

import { spotlightChannel } from "../channelSpotlight";
import { T } from "../i18n";
import { buildJournal, type JournalRow, type StayPart } from "../journalStays";
import { placeName } from "../journalTimeline";
import type { Sighting, SightingKind } from "../sightings";
import { dayStart, formatClock, formatOnDay } from "../time";
import { toast, ToastType } from "../toast";
import { getWatchSpans } from "../watchLog";
import { cl } from "./common";
import { Hint } from "./Hint";
import { CameraIcon, CameraOffIcon, ChevronDownIcon, EyeIcon, JoinIcon, LeaveIcon, PlugIcon, SpeakerIcon, StreamIcon, StreamOffIcon, UserIcon } from "./icons";
import { NowHint, PlaceHint, YouTag } from "./VoicePeople";
import { closeAllWindows } from "./Window";

/** The journal opens on its newest days and shows this many more with each press. */
const DAYS_PER_PAGE = 3;

const minutesOf = (ms: number) => Math.floor(ms / 60_000);

const pad = (value: number) => String(value).padStart(2, "0");

function fullDate(at: number): string {
    const date = new Date(at);
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function openChannelOrSay(channelId: string | null) {
    if (!channelId) {
        toast(T.noChannelAccess, ToastType.FAILURE);
        return;
    }

    closeAllWindows();
    void spotlightChannel(channelId);
}

export function channelOpener(channelId: string | null) {
    return {
        role: "button",
        tabIndex: 0,
        onClick: () => openChannelOrSay(channelId),
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openChannelOrSay(channelId);
        }
    };
}

export function dayHeading(day: number): string {
    if (day === dayStart(Date.now())) return T.infoToday;
    if (day === dayStart(Date.now(), -1)) return T.infoYesterday;
    return fullDate(day);
}

/** What a row shows of a line, which is all the activity feed has too. */
type LineRow = Pick<JournalRow, "line" | "role" | "leaving">;

export function rowLabel({ line, role, leaving }: LineRow): ReactNode {
    switch (line.kind) {
        case "joined": return T.infoKindJoined;
        case "moved": return leaving
            ? T.infoKindMovedTo(placeName(line.channelLabel ?? T.unknownChannel, line.fromLabel))
            : T.infoKindMovedFrom(placeName(line.fromLabel ?? T.unknownChannel, line.channelLabel));
        case "left":
        case "gone": return T.infoKindLeft;
        case "seen": return role === "inside" ? T.infoKindSeenAgain : T.infoKindSeen;
        case "you-joined": return <><YouTag />{T.infoKindYouJoined}</>;
        case "you-left": return <><YouTag />{T.infoKindYouLeft}</>;
        case "stream-on": return T.infoKindStreamOn;
        case "stream-off": return T.infoKindStreamOff;
        case "video-on": return T.infoKindVideoOn;
        case "video-off": return T.infoKindVideoOff;
    }
}

const TONES: Record<SightingKind, string> = {
    joined: "in",
    moved: "move",
    left: "out",
    gone: "out",
    seen: "in",
    "you-joined": "you",
    "you-left": "you",
    "stream-on": "stream",
    "stream-off": "out",
    "video-on": "camera",
    "video-off": "out"
};

const ICONS: Record<SightingKind, ComponentType<{ size?: number; }>> = {
    joined: JoinIcon,
    moved: JoinIcon,
    left: LeaveIcon,
    gone: LeaveIcon,
    seen: EyeIcon,
    "you-joined": UserIcon,
    "you-left": UserIcon,
    "stream-on": StreamIcon,
    "stream-off": StreamOffIcon,
    "video-on": CameraIcon,
    "video-off": CameraOffIcon
};

export function rowTone({ line, leaving }: LineRow): string {
    return leaving ? "out" : TONES[line.kind];
}

/** The row that brought the person in, where the line up to the channel's name begins. */
const entersStay = ({ line, role }: JournalRow) => role === "start" && (line.kind === "joined" || line.kind === "moved");

export function RowIcon({ row }: { row: LineRow; }) {
    const Icon = row.leaving ? LeaveIcon : row.line.kind === "seen" && row.role === "inside" ? PlugIcon : ICONS[row.line.kind];
    return <span className={cl("stay-icon")}><Icon size={15} /></span>;
}

/** The exact moment, or why only a range is known. */
export function rowHeading(line: Sighting): string {
    const stamp = `${fullDate(line.at)}, ${formatClock(line.at)}`;
    if (line.after == null) return stamp;
    return line.kind === "gone" ? T.infoGoneTitle(stamp) : T.infoLateTitle;
}

export function RowNotes({ row, day }: { row: JournalRow; day: number; }) {
    const { line, together, lasted, role } = row;
    const startsHere = role === "start" && !row.leaving;

    return (
        <span className={cl("stay-notes")}>
            {line.after != null && (
                <span className={cl("stay-note")}>{T.infoBetween(formatOnDay(line.after, day), formatOnDay(line.at, day))}</span>
            )}
            {startsHere && (line.kind === "joined" || line.kind === "moved") && line.withYou && (
                <span className={cl("badge") + " " + cl("badge-here")}>{T.infoCameToYou}</span>
            )}
            {startsHere && line.kind === "seen" && line.withYou && (
                <span className={cl("badge") + " " + cl("badge-here")}>{T.infoSeenWithYou}</span>
            )}
            {line.kind === "seen" && line.onReturn && <span className={cl("stay-note")}>{T.infoAfterConnect}</span>}
            {together && (
                <span className={cl("badge") + " " + cl("badge-here")}>
                    {together.since != null
                        ? T.infoTogetherSince(formatClock(together.since), minutesOf(together.ms))
                        : T.infoTogether(minutesOf(together.ms))}
                </span>
            )}
            {lasted != null && <span className={cl("stay-note")}>{T.infoLasted(minutesOf(lasted))}</span>}
        </span>
    );
}

function StayRow({ row, day, userId }: { row: JournalRow; day: number; userId: string; }) {
    const { line } = row;
    const className = [
        cl("stay-row"),
        cl("stay-row-" + row.role),
        cl("stay-tone-" + rowTone(row)),
        entersStay(row) ? cl("stay-row-enter") : "",
        row.shared ? cl("stay-row-shared") : "",
        row.gapBefore ? cl("stay-row-gap") : ""
    ].filter(Boolean).join(" ");

    return (
        <Hint interactive={line.channelId != null} text={line.channelId ? <PlaceHint line={line} userId={userId} heading={rowHeading(line)} /> : rowHeading(line)}>
            {hintProps => (
                <div {...hintProps} {...channelOpener(line.channelId)} className={className}>
                    {line.after == null
                        ? <span className={cl("stay-when")}>{formatClock(line.at)}</span>
                        : <span className={cl("stay-when") + " " + cl("stay-when-unknown")}>?</span>}
                    <RowIcon row={row} />
                    <span className={cl("stay-kind")}>{rowLabel(row)}</span>
                    <RowNotes row={row} day={day} />
                </div>
            )}
        </Hint>
    );
}

/** The way up from the older block below, so the order of events carries across blocks. */
function BlockLink({ link }: { link: number | "move"; }) {
    if (link === "move") return <span className={cl("stay-link")} />;

    return (
        <span className={cl("stay-link") + " " + cl("stay-link-pause")}>
            <span className={cl("stay-link-note")}>{T.infoPause(minutesOf(link))}</span>
        </span>
    );
}

function StayBlock({ part, day, userId }: { part: StayPart; day: number; userId: string; }) {
    const { channelId, link } = part;
    const enter = part.rows.find(entersStay);
    const headClass = [
        cl("stay-head"),
        part.rows[0]?.shared ? cl("stay-head-shared") : "",
        enter ? cl("stay-head-enter") + " " + cl("stay-arrow-" + rowTone(enter)) : ""
    ].filter(Boolean).join(" ");

    return (
        <div className={cl("stay") + (link != null ? " " + cl("stay-linked") : "")}>
            <Hint interactive text={channelId ? <NowHint channelId={channelId} /> : null}>
                {hintProps => (
                    <div {...hintProps} {...channelOpener(channelId)} className={headClass}>
                        <SpeakerIcon size={14} />
                        <span className={cl("stay-head-name")}>{part.channelLabel ?? T.unknownChannel}</span>
                    </div>
                )}
            </Hint>
            {part.rows.map(row => (
                <StayRow key={`${row.line.at}-${row.line.kind}-${row.role}`} row={row} day={day} userId={userId} />
            ))}
            {link != null && <BlockLink link={link} />}
        </div>
    );
}

export function Journal({ lines, userId }: { lines: Sighting[]; userId: string; }) {
    const [shownDays, setShownDays] = useState(DAYS_PER_PAGE);

    if (!lines.length) {
        return (
            <div className={cl("info-empty")}>
                <div className={cl("info-empty-title")}>{T.infoLogEmptyTitle}</div>
                <div className={cl("dim")}>{T.infoLogEmpty}</div>
            </div>
        );
    }

    const days = buildJournal(lines, getWatchSpans());
    const hidden = days.slice(shownDays).reduce((count, day) => count + day.rows, 0);

    return (
        <div className={cl("info-log")}>
            {days.slice(0, shownDays).map(day => (
                <div key={day.start} className={cl("info-day")}>
                    <div className={cl("info-day-heading")}>{dayHeading(day.start)}</div>
                    {day.parts.map(part => <StayBlock key={part.key} part={part} day={day.start} userId={userId} />)}
                </div>
            ))}
            {hidden > 0 && (
                <button className={cl("chip") + " " + cl("info-more")} onClick={() => setShownDays(count => count + DAYS_PER_PAGE)}>
                    <ChevronDownIcon />
                    {T.infoShowMore(hidden)}
                </button>
            )}
        </div>
    );
}
