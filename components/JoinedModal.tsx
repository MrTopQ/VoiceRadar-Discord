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

import { FluxDispatcher, useEffect, useState } from "@webpack/common";

import { T } from "../i18n";
import { warmUpUsers } from "../names";
import { requestPresences } from "../presence";
import { subscribeToQueue } from "../queue";
import { getTrackedUser, subscribeToStore } from "../store";
import { throttle } from "../throttle";
import { cl } from "./common";
import { RadarIcon } from "./icons";
import { UserRow } from "./UserRow";
import { closeWindow, openWindow, WindowHead } from "./Window";

const JOINED_WINDOW = "joined";
const REDRAW_THROTTLE_MS = 400;
const LIVE_REFRESH_MS = 5000;

export function closeJoinedModal() {
    closeWindow(JOINED_WINDOW);
}

function JoinedList({ userIds, embedded, onClose }: { userIds: string[]; embedded: boolean; onClose: () => void; }) {
    const [, setTick] = useState(0);
    const forceUpdate = () => setTick(tick => tick + 1);

    useEffect(() => {
        const redraw = throttle(forceUpdate, REDRAW_THROTTLE_MS);
        const unsubscribe = subscribeToStore(redraw);
        const unsubscribeQueue = subscribeToQueue(redraw);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", redraw);
        FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK_BATCH", redraw);
        const interval = setInterval(forceUpdate, LIVE_REFRESH_MS);

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

    const users = userIds.map(getTrackedUser).filter(Boolean) as NonNullable<ReturnType<typeof getTrackedUser>>[];

    return (
        <>
            <WindowHead
                embedded={embedded}
                onClose={onClose}
                leading={<div className={cl("head-icon")}><RadarIcon size={22} /></div>}
                title={T.notifyBatchTitle(users.length || userIds.length)}
                subtitle={T.joinedModalHint}
            />

            <div className={cl("window-body")}>
                {users.length ? (
                    <div className={cl("section")}>
                        {users.map(user => <UserRow key={user.id} user={user} />)}
                    </div>
                ) : (
                    <div className={cl("empty")}>
                        <div className={cl("empty-icon")}><RadarIcon size={34} /></div>
                        <div className={cl("empty-title")}>{T.joinedModalGone}</div>
                    </div>
                )}
            </div>
        </>
    );
}

export function openJoinedModal(userIds: string[]) {
    if (!userIds.length) return;

    openWindow(JOINED_WINDOW, {
        label: T.notifyBatchTitle(userIds.length),
        size: "xl",
        render: (close, embedded) => <JoinedList userIds={userIds} embedded={embedded} onClose={close} />
    });
}
