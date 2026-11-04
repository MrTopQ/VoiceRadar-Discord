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
import { useEffect, UserStore } from "@webpack/common";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import { getChannelInfo } from "../channels";
import { T } from "../i18n";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName, openProfile, warmUpUsers } from "../names";
import { requestPresences } from "../presence";
import type { Sighting } from "../sightings";
import { openUserMenu } from "../userMenu";
import { cl } from "./common";
import { closeOpenHint, Hint } from "./Hint";

const HINT_MAX_PEOPLE = 10;
/** Two lists side by side in a hint, so each stays short. */
const PLACE_HINT_PEOPLE = 8;

/** Someone from a journal line may be unknown to Discord by now, so one gateway request asks for them all, and only whoever it missed is fetched one by one while the list stays open. */
function useKnownUsers(ids: string[]) {
    const forceUpdate = useForceUpdater();

    useEffect(() => {
        const missing = ids.filter(id => !UserStore.getUser(id));
        if (!missing.length) return;

        let open = true;
        const redraw = () => {
            if (open) forceUpdate();
        };

        requestPresences(missing);
        void warmUpUsers(missing, redraw, () => open).then(redraw);

        return () => {
            open = false;
        };
    }, [ids.join(",")]);
}

/** Marks what is about the user themself, so it never reads as the other person. */
export function YouTag() {
    return <span className={cl("you-tag")}>{T.youTag}</span>;
}

/** A left click opens the person's profile and a right click Discord's menu for them, as on a radar row. */
function personActions(id: string) {
    const open = () => {
        closeOpenHint();
        openProfile(id);
    };

    return {
        role: "button",
        tabIndex: 0,
        onClick: (event: MouseEvent) => {
            event.stopPropagation();
            open();
        },
        onContextMenu: (event: MouseEvent) => {
            event.stopPropagation();
            openUserMenu(event, id);
            closeOpenHint();
        },
        onKeyDown: (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            open();
        }
    };
}

/** Avatar and name a line each, for the hints. */
export function PeopleRows({ ids, total = ids.length, max = HINT_MAX_PEOPLE }: { ids: string[]; total?: number; max?: number; }) {
    const shown = ids.slice(0, max);
    useKnownUsers(shown);

    const rest = total - shown.length;
    const me = UserStore.getCurrentUser()?.id;

    return (
        <>
            {shown.map(id => (
                <div key={id} {...personActions(id)} className={cl("vc-tooltip-row") + " " + cl("person")}>
                    <img className={cl("tip-avatar")} src={getAvatarUrl(id) ?? DEFAULT_AVATAR_URL} alt="" />
                    {getUserDisplayName(id)}
                    {id === me && <YouTag />}
                </div>
            ))}
            {rest > 0 && <div className={cl("dim")}>{T.tooltipAndMore(rest)}</div>}
        </>
    );
}

function NowColumn({ channelId }: { channelId: string; }) {
    const now = getChannelInfo(channelId);

    return (
        <div className={cl("place-hint-column")}>
            <div className={cl("vc-tooltip-title")}>{T.journalNow}</div>
            {now.participantIds.length
                ? <PeopleRows ids={now.participantIds} max={PLACE_HINT_PEOPLE} />
                : <div className={cl("dim")}>{T.journalNowEmpty}</div>}
        </div>
    );
}

function OpenHint({ channelId }: { channelId: string; }) {
    return <div className={cl("vc-tooltip-hint")}>{getChannelInfo(channelId).canView ? T.tooltipOpenChannel : T.tooltipNoChannelAccess}</div>;
}

/** Who sits in a channel right now. */
export function NowHint({ channelId }: { channelId: string; }) {
    return (
        <div className={cl("vc-tooltip")}>
            <NowColumn channelId={channelId} />
            <OpenHint channelId={channelId} />
        </div>
    );
}

/** The people a line saw in the channel. The person it belongs to was there too, unless the line is them leaving. */
function ThenColumn({ line, userId }: { line: Sighting; userId: string; }) {
    const others = line.with ?? [];
    const left = line.kind === "left";
    const ids = left ? others : [userId, ...others];
    const total = (line.withCount ?? others.length) + (left ? 0 : 1);

    return (
        <div className={cl("place-hint-column")}>
            <div className={cl("vc-tooltip-title")}>{left ? T.journalStayed : T.journalThen}</div>
            {ids.length
                ? <PeopleRows ids={ids} total={total} max={PLACE_HINT_PEOPLE} />
                : <div className={cl("dim")}>{T.journalStayedNobody}</div>}
        </div>
    );
}

/** Who sat in a journal line's channel back then, and who sits there now, under what the line itself needs said. */
export function PlaceHint({ line, userId, heading }: { line: Sighting; userId: string; heading?: ReactNode; }) {
    return (
        <div className={cl("vc-tooltip")}>
            {heading && <div className={cl("place-hint-heading")}>{heading}</div>}
            <div className={cl("place-hint") + (line.with ? " " + cl("place-hint-split") : "")}>
                {line.with && <ThenColumn line={line} userId={userId} />}
                <NowColumn channelId={line.channelId!} />
            </div>
            <OpenHint channelId={line.channelId!} />
        </div>
    );
}

/** A row of avatars with each name on hover. */
export function AvatarStack({ ids, max }: { ids: string[]; max: number; }) {
    const shown = ids.slice(0, max);
    useKnownUsers(shown);

    return (
        <div className={cl("avatar-stack")}>
            {shown.map(id => (
                <Hint key={id} text={getUserDisplayName(id)}>
                    {hintProps => (
                        <img
                            {...hintProps}
                            {...personActions(id)}
                            className={cl("stack-avatar")}
                            src={getAvatarUrl(id) ?? DEFAULT_AVATAR_URL}
                            alt={getUserDisplayName(id)}
                        />
                    )}
                </Hint>
            ))}
            {ids.length > shown.length && <span className={cl("stack-more")}>+{ids.length - shown.length}</span>}
        </div>
    );
}
