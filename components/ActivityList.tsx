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
import { useEffect, useRef, UserStore, useState } from "@webpack/common";

import { type ActivityEntry, type ActivityFilter, buildActivity, byDay, filterActivity } from "../activityFeed";
import { T } from "../i18n";
import { placeName } from "../journalTimeline";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName } from "../names";
import { allSightings, type Sighting, subscribeToSightings } from "../sightings";
import { getTrackedUser, subscribeToStore } from "../store";
import { throttle } from "../throttle";
import { formatClockSeconds } from "../time";
import { getWatchSpans } from "../watchLog";
import { cl } from "./common";
import { Hint } from "./Hint";
import { ChevronDownIcon, InfoIcon } from "./icons";
import { channelOpener, dayHeading, rowHeading, RowIcon, rowLabel, RowNotes, rowTone } from "./Journal";
import { openPersonInfo } from "./PersonInfoModal";
import { DeviceMark, personActions, PlaceHint } from "./VoicePeople";

const ROWS_PER_PAGE = 60;
const REDRAW_THROTTLE_MS = 400;
const FACES_SHOWN = 6;

/** Kept for the next time the tab opens. */
let lastFilter: ActivityFilter = "recent";

export function useActivityFilter(): [ActivityFilter, (filter: ActivityFilter) => void] {
    const [filter, setFilter] = useState(lastFilter);

    return [filter, next => {
        lastFilter = next;
        setFilter(next);
    }];
}

export function ActivityFilterChoice({ filter, onChoose }: { filter: ActivityFilter; onChoose: (filter: ActivityFilter) => void; }) {
    const option = (value: ActivityFilter, label: string) => (
        <button
            className={cl("segment") + " " + cl("activity-choice") + (filter === value ? " " + cl("segment-on") : "")}
            aria-pressed={filter === value}
            onClick={() => onChoose(value)}
        >
            {label}
        </button>
    );

    return (
        <div className={cl("activity-filter")}>
            <div className={cl("segments")} role="group" aria-label={T.activityFilterLabel}>
                {option("pinned", T.sectionPinned)}
                {option("recent", T.sectionRecent)}
            </div>
            <span className={cl("activity-filter-hint")}>{T.activityHint}</span>
        </div>
    );
}

const isPinned = (userId: string) => !!getTrackedUser(userId)?.pinned;

const nameOf = (userId: string) => getUserDisplayName(userId, getTrackedUser(userId)?.name);

const avatarOf = (userId: string) => getAvatarUrl(userId) ?? DEFAULT_AVATAR_URL;

function placeOf(line: Sighting): string {
    const place = line.channelLabel ?? T.unknownChannel;
    return line.kind === "moved" && line.fromLabel ? `${placeName(line.fromLabel, place)} → ${place}` : place;
}

/** How many people the channel held at that moment, as far as the line says. */
function headcount(line: Sighting): string | null {
    if (!line.with) return null;

    const others = line.withCount ?? line.with.length;
    if (line.kind !== "left") return T.activityInChannel(others + 1);

    return others ? T.activityStayed(others) : T.journalStayedNobody;
}

function Faces({ ids, total }: { ids: string[]; total: number; }) {
    const hidden = total - Math.min(ids.length, FACES_SHOWN);

    return (
        <span className={cl("activity-faces")}>
            {ids.slice(0, FACES_SHOWN).map(id => (
                <img key={id} {...personActions(id)} className={cl("activity-face")} src={avatarOf(id)} alt={nameOf(id)} title={nameOf(id)} />
            ))}
            {hidden > 0 && <span className={cl("dim")}>+{hidden}</span>}
        </span>
    );
}

function ActivityRow({ entry, day, isNew }: { entry: ActivityEntry; day: number; isNew: boolean; }) {
    const { row, userIds } = entry;
    const { line } = row;
    const isMine = line.kind === "you-joined" || line.kind === "you-left";
    const who = isMine ? UserStore.getCurrentUser()?.id ?? userIds[0] : userIds[0];
    const faces = isMine ? userIds : line.with ?? [];
    const count = isMine ? null : headcount(line);

    return (
        <div className={[cl("row"), cl("activity-row"), isNew && cl("activity-row-new")].filter(Boolean).join(" ")}>
            <span {...personActions(who)} className={cl("avatar-wrap")}>
                <img className={cl("avatar")} src={avatarOf(who)} alt={nameOf(who)} />
            </span>

            <div className={cl("info")}>
                <div className={cl("name-line")}>
                    <span {...personActions(who)} className={cl("name")}>{nameOf(who)}</span>
                    {!isMine && <DeviceMark note={line.devices?.[0] ?? ""} />}
                </div>

                <div className={cl("meta-line")}>
                    <span className={cl("activity-kind") + " " + cl("stay-tone-" + rowTone(row))}>
                        <RowIcon row={row} />
                        <span className={cl("stay-kind")}>{line.kind === "moved" ? T.activityKindMoved : rowLabel(row)}</span>
                    </span>
                    <Hint interactive={line.channelId != null} text={line.channelId ? <PlaceHint line={line} userId={userIds[0]} heading={rowHeading(line)} /> : rowHeading(line)}>
                        {hintProps => (
                            <span {...hintProps} {...channelOpener(line.channelId)} className={cl("activity-place")}>{placeOf(line)}</span>
                        )}
                    </Hint>
                </div>

                <div className={cl("meta-line")}>
                    {count && <span className={cl("dim")}>{count}</span>}
                    <RowNotes row={row} day={day} />
                    {!isMine && (
                        <button className={cl("info-button")} onClick={() => openPersonInfo(who)} title={T.infoButtonHint}>
                            <InfoIcon />
                            {T.infoButton}
                        </button>
                    )}
                </div>
            </div>

            <div className={cl("activity-side")}>
                <span className={cl("activity-time")}>{line.after == null ? formatClockSeconds(line.at) : "?"}</span>
                {faces.length > 0 && <Faces ids={faces} total={isMine ? faces.length : line.withCount ?? faces.length} />}
            </div>
        </div>
    );
}

/** Everything the plugin wrote down about the people on the list, as it happens. */
export function ActivityList({ filter, matches }: { filter: ActivityFilter; matches: (userId: string) => boolean; }) {
    const forceUpdate = useForceUpdater();
    const [shown, setShown] = useState(ROWS_PER_PAGE);
    const openedAt = useRef(Date.now());

    useEffect(() => {
        const redraw = throttle(forceUpdate, REDRAW_THROTTLE_MS);
        const stopLines = subscribeToSightings(redraw);
        const stopPeople = subscribeToStore(redraw);

        return () => {
            stopLines();
            stopPeople();
            redraw.cancel();
        };
    }, []);

    const everything = buildActivity(allSightings(), getWatchSpans());
    const entries = filterActivity(everything, userId => matches(userId) && (filter === "recent" || isPinned(userId)));
    const hidden = entries.length - shown;

    return (
        <div className={cl("list")}>
            {entries.length ? byDay(entries.slice(0, shown)).map(({ day, entries: ofDay }) => (
                <div key={day} className={cl("activity-day")}>
                    <div className={cl("info-day-heading")}>{dayHeading(day)}</div>
                    {ofDay.map(entry => (
                        <ActivityRow
                            key={`${entry.row.line.at}-${entry.row.line.kind}-${entry.userIds[0]}`}
                            entry={entry}
                            day={day}
                            isNew={entry.row.line.at > openedAt.current}
                        />
                    ))}
                </div>
            )) : (
                <div className={cl("empty-tab")}>{everything.length ? T.activityEmptyFiltered : T.activityEmpty}</div>
            )}
            {hidden > 0 && (
                <button className={cl("chip") + " " + cl("info-more")} onClick={() => setShown(count => count + ROWS_PER_PAGE)}>
                    <ChevronDownIcon />
                    {T.infoShowMore(hidden)}
                </button>
            )}
        </div>
    );
}
