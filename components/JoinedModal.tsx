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

import ErrorBoundary from "@components/ErrorBoundary";
import { closeModal, FluxDispatcher, Modal, openModal, useEffect, useState } from "@webpack/common";

import { T } from "../i18n";
import { warmUpUsers } from "../names";
import { requestPresences } from "../presence";
import { subscribeToQueue } from "../queue";
import { getTrackedUser, subscribeToStore } from "../store";
import { throttle } from "../throttle";
import { cl } from "./common";
import { RadarIcon } from "./icons";
import { UserRow } from "./UserRow";

const MODAL_KEY = "voice-radar-joined";
const REDRAW_THROTTLE_MS = 400;
const LIVE_REFRESH_MS = 5000;

/** One list at a time. A second batch landing behind the first would stack popups. */
let isOpen = false;

function close() {
    if (!isOpen) return;
    closeModal(MODAL_KEY);
    isOpen = false;
}

/**
 * Shuts the list when the plugin stops. The radar is closed the same way, and this one was left
 * behind, so its rows read a store that stop() has just emptied, and every button on them belongs to
 * something no longer running.
 */
export function closeJoinedModal() {
    close();
}

/**
 * Who a batch notification was about. The same rows the radar shows, with the same buttons, narrowed
 * to those people. Only the ids are remembered, never the channels they were in, because by the time
 * the popup is clicked the group may have moved on and every row reads where they are now.
 */
function JoinedModal({ modalProps, userIds }: { modalProps: any; userIds: string[]; }) {
    const [, setTick] = useState(0);
    const forceUpdate = () => setTick(tick => tick + 1);

    useEffect(() => {
        // the same live wiring the radar uses, so a row pulled or muted updates in place
        const redraw = throttle(forceUpdate, REDRAW_THROTTLE_MS);
        const unsubscribe = subscribeToStore(redraw);
        // the rows carry the queue button too, so its state has to be live here as well
        const unsubscribeQueue = subscribeToQueue(redraw);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", redraw);
        FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK_BATCH", redraw);
        const interval = setInterval(forceUpdate, LIVE_REFRESH_MS);

        // names and avatars for people Discord never cached, one at a time, dropped on close
        let open = true;
        void warmUpUsers(userIds, forceUpdate, () => open);
        requestPresences(userIds);

        return () => {
            open = false;
            redraw.cancel();
            unsubscribe();
            unsubscribeQueue();
            FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", redraw);
            FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK_BATCH", redraw);
            clearInterval(interval);
        };
    }, []);

    // notifications only fire for tracked people, but one can be removed while the popup waits
    const users = userIds.map(getTrackedUser).filter(Boolean) as NonNullable<ReturnType<typeof getTrackedUser>>[];

    return (
        <Modal
            {...modalProps}
            size="xl"
            title={
                <span className={cl("header")}>
                    <RadarIcon size={20} />
                    {/* count what is actually listed below, or the header claims five and shows three */}
                    {T.notifyBatchTitle(users.length || userIds.length)}
                </span>
            }
            subtitle={T.joinedModalHint}
        >
            {users.length ? (
                <div className={cl("section")}>
                    {users.map(user => <UserRow key={user.id} user={user} />)}
                </div>
            ) : (
                <div className={cl("empty")}>
                    <RadarIcon size={40} />
                    <div>{T.joinedModalGone}</div>
                </div>
            )}
        </Modal>
    );
}

const WrappedModal = ErrorBoundary.wrap(JoinedModal, { noop: true });

/** Opens the list a batch notification stands for. */
export function openJoinedModal(userIds: string[]) {
    if (!userIds.length) return;

    close(); // a newer batch replaces the one still on screen rather than opening beside it
    isOpen = true;

    try {
        openModal(
            modalProps => <WrappedModal modalProps={modalProps} userIds={userIds} />,
            {
                modalKey: MODAL_KEY,
                onCloseCallback: () => {
                    isOpen = false;
                }
            }
        );
    } catch (error) {
        isOpen = false;
        // this is reached from a click on a notification, which is no place for a throw nobody
        // catches. The radar itself reports a missing window, so this only has to not make it worse
        console.error("[VoiceRadar-Discord] could not open the joined list:", error);
    }
}
