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

import { getMyGuildId, getVoiceInfo } from "../channels";
import { refreshGuildSubscriptions } from "../guildSubscriptions";
import { T } from "../i18n";
import { joinVoiceChannel } from "../join";
import { canMoveUser } from "../movePermissions";
import { DEFAULT_AVATAR_URL, getAvatarUrl, openProfile } from "../names";
import { pullToMyChannel } from "../pull";
import { cancelQueue, isQueuedFor, queueForChannel } from "../queue";
import { addUser, isTracked } from "../store";
import { toast, ToastType } from "../toast";
import { openUserMenu } from "../userMenu";
import { findInVoice, type VoiceMatch } from "../voiceSearch";
import { ActionButton, cl } from "./common";
import { ClockIcon, GlobeIcon, JoinIcon, LockIcon, PlusIcon, PullIcon } from "./icons";
import { ChannelChip } from "./UserRow";

function FoundRow({ match, onChanged }: { match: VoiceMatch; onChanged: () => void; }) {
    const voice = getVoiceInfo(match.userId);
    const tracked = isTracked(match.userId);
    const avatar = getAvatarUrl(match.userId) ?? DEFAULT_AVATAR_URL;

    const queued = voice != null && isQueuedFor(voice.channelId);
    const canQueue = voice != null && voice.isFull && voice.canJoin && !voice.isMyChannel;
    const blocked = voice != null && !voice.canJoin;

    const joinTooltip = queued ? T.joinQueued
        : !voice ? T.joinNotInVoice
            : voice.isMyChannel ? T.joinAlreadyThere
                : blocked ? T.joinNoPermission
                    : voice.isFull ? T.joinChannelFull
                        : voice.fullButAllowed ? T.joinFullWithRights : T.join;

    const join = () => {
        if (!voice) return;
        if (queued) cancelQueue(T.queueCancelled);
        else if (canQueue) queueForChannel(voice.channelId, true);
        else joinVoiceChannel(voice.channelId);
        onChanged();
    };

    const track = () => {
        addUser(match.userId, match.name);
        // Their server may not be watched yet, so it is asked for now.
        refreshGuildSubscriptions();
        toast(T.userAddedToRadar(match.name), ToastType.SUCCESS);
        onChanged();
    };

    // Discord moves people only inside one server, into a channel you sit in.
    const canPull = voice != null && !voice.isMyChannel && voice.guildId != null && voice.guildId === getMyGuildId() && canMoveUser(match.userId);

    // Somebody worth pulling over is worth keeping on the radar too.
    const pull = () => {
        if (!tracked) addUser(match.userId, match.name);
        void pullToMyChannel(match.userId);
        onChanged();
    };

    const openThisProfile = () => openProfile(match.userId);

    return (
        <div className={cl("row") + (voice ? " " + cl("row-live") : "")} onContextMenu={event => openUserMenu(event, match.userId)}>
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
                aria-label={match.name}
            >
                <img className={cl("avatar")} src={avatar} alt={match.name} />
            </div>

            <div className={cl("info")}>
                <div className={cl("name-line")}>
                    <span className={cl("name")} onClick={openThisProfile}>{match.name}</span>
                    {tracked && <span className={cl("badge")}>{T.badgeTracked}</span>}
                </div>
                <div className={cl("meta-line")}>
                    {voice ? <ChannelChip voice={voice} /> : <span className={cl("dim")}>{T.notInVoice}</span>}
                </div>
            </div>

            <div className={cl("actions")}>
                <div className={cl("action-group")}>
                    <ActionButton
                        icon={queued || canQueue ? <ClockIcon /> : blocked ? <LockIcon /> : <JoinIcon />}
                        tooltip={joinTooltip}
                        active={queued}
                        extraClass={voice?.fullButAllowed && !voice.isMyChannel ? cl("action-pass") : undefined}
                        onClick={join}
                        disabled={!queued && (!voice || voice.isMyChannel || blocked)}
                    />
                    {canPull && (
                        <ActionButton
                            icon={<PullIcon />}
                            tooltip={tracked ? T.pullToMyChannel : T.foundPull}
                            onClick={pull}
                        />
                    )}
                    {!tracked && <ActionButton icon={<PlusIcon />} tooltip={T.menuAddToRadar} onClick={track} />}
                </div>
            </div>
        </div>
    );
}

/** People in voice anywhere on the watched servers, for when the search is widened past the list. */
export function VoiceSearchResults({ query, shownIds, onChanged }: {
    query: string;
    shownIds: ReadonlySet<string>;
    onChanged: () => void;
}) {
    const { matches, more, tooShort } = findInVoice(query, shownIds);

    return (
        <section className={cl("found")} aria-label={T.foundTitle}>
            <div className={cl("found-title")}>
                <GlobeIcon size={14} />
                {T.foundTitle}
                {matches.length > 0 && <span className={cl("count")}>{matches.length + more}</span>}
            </div>

            {tooShort
                ? <div className={cl("found-note")}>{T.foundTooShort}</div>
                : matches.length
                    ? matches.map(match => <FoundRow key={match.userId} match={match} onChanged={onChanged} />)
                    : <div className={cl("found-note")}>{T.foundNone}</div>}

            {more > 0 && <div className={cl("found-note")}>{T.foundMore(more)}</div>}
        </section>
    );
}
