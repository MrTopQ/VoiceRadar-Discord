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
import { createRoot, FluxDispatcher, Modal, openModal, useEffect, useRef, useState } from "@webpack/common";

import { type ApiHealth, getApiHealth, HealthReport, isFound, isProven, proveWorking, reportBroken } from "../apiHealth";
import { getVoiceInfo } from "../channels";
import { subscribeToSubscriptionProgress } from "../guildSubscriptions";
import { isHotkeyCaptureActive } from "../hotkey";
import { T } from "../i18n";
import { inTabOrder, recentTabUsers } from "../listOrder";
import { needsFullRestart } from "../mainProcess";
import { getSearchText, normalizeSearch, warmUpUsers } from "../names";
import { requestPresences } from "../presence";
import { subscribeToQueue } from "../queue";
import { radarPress } from "../radarPress";
import { askToRestartDiscord } from "../restart";
import { getHistoryLimit, settings } from "../settings";
import { getTrackedUser, getVisibleUsers, pinnedPositionOf, refreshLimit, reorderPinned, subscribeToStore, TrackedUser } from "../store";
import { throttle } from "../throttle";
import { toast, ToastType } from "../toast";
import { sweepCurrentChannel } from "../tracker";
import { ActivityFilterChoice, ActivityList, useActivityFilter } from "./ActivityList";
import { cl } from "./common";
import { RadarIcon } from "./icons";
import { EverywhereToggle, FollowCard, Footer, isLiveOnly, isSearchingEverywhere, LiveFilter, PendingChips, SearchBox, type Tab, Tabs } from "./RadarControls";
import { Header, readState, WINDOW_LABEL } from "./RadarHeader";
import { canPopOut, closeRadarPopout, hideRadarPopout, isRadarPopoutFocused, isRadarPopoutShown, isRadarPoppedOut, minimizeRadarPopout, opensInOwnWindow, PopOutButton, PopoutControls, popOutRadar } from "./RadarPopout";
import { SizeButton } from "./SizePanel";
import { type DragHandlers, getMemoUserRow, rowSharedKey, rowSignature } from "./UserRow";
import { VoiceSearchResults } from "./VoiceSearchResults";
import { closeWindow, isWindowOpen, openWindow } from "./Window";
import { WithYou } from "./WithYou";

const LIVE_REFRESH_MS = 15000;
const REDRAW_THROTTLE_MS = 400;
const FIRST_ROWS = 14;
const ROWS_PER_FRAME = 20;

let lastTab: Tab | null = null;

const countLive = (users: TrackedUser[]) => users.filter(user => getVoiceInfo(user.id)).length;

const isWithMe = (userId: string) => getVoiceInfo(userId)?.isMyChannel === true;

type ListTab = Exclude<Tab, "activity">;

/** Long lists are drawn a batch per frame, so opening never stalls. */
function useRowsToDraw(total: number, tab: Tab): number {
    const [drawn, setDrawn] = useState({ tab, count: FIRST_ROWS });
    const count = drawn.tab === tab ? drawn.count : FIRST_ROWS;

    // After a tab switch the count is already the first batch, so the next one has to be asked for right here.
    useEffect(() => {
        if (count >= total) return;

        const frame = requestAnimationFrame(() => setDrawn({ tab, count: count + ROWS_PER_FRAME }));
        return () => cancelAnimationFrame(frame);
    }, [tab, count, total]);

    return count;
}

function usePinnedDrag(onChanged: () => void): DragHandlers {
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);

    const dragging = draggingId != null && overId != null && draggingId !== overId
        ? { from: pinnedPositionOf(draggingId), to: pinnedPositionOf(overId) }
        : null;
    const dropAfter = dragging != null && dragging.from >= 0 && dragging.from < dragging.to;

    return {
        draggingId,
        overId,
        dropAfter,
        onDragStart: setDraggingId,
        onDragOver: setOverId,
        onDrop: (targetId: string) => {
            if (draggingId && draggingId !== targetId) {
                reorderPinned(draggingId, targetId);
                onChanged();
            }
            setDraggingId(null);
            setOverId(null);
        },
        onDragEnd: () => {
            setDraggingId(null);
            setOverId(null);
        }
    };
}

const popRadarWindow = () => popOutRadar(close => <RadarWindow onClose={close} popout />);

function popRadarOut() {
    closeRadarModal();
    popRadarWindow();
}

function popRadarBackIn() {
    closeRadarPopout();
    // After Discord has let go of the popout, so it does not just come forward again.
    setTimeout(openInDiscord, 0);
}

function RadarWindow({ onClose, embedded = false, popout = false }: { onClose: () => void; embedded?: boolean; popout?: boolean; }) {
    const forceUpdate = useForceUpdater();
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState<Tab>(() =>
        lastTab ?? (getVisibleUsers().pinned.length ? "pinned" : "recent"));
    const [activityFilter, setActivityFilter] = useActivityFilter();

    const openTab = (next: Tab) => {
        lastTab = next;
        setTab(next);
    };

    /** The order is frozen while the window is open, so rows do not jump under the cursor. */
    const frozenOrder = useRef<Record<ListTab, Map<string, number>> | null>(null);

    const snapshotOrder = () => {
        const { pinned, recent } = getVisibleUsers();
        const positions = (users: TrackedUser[]) => new Map(users.map((user, index) => [user.id, index]));
        frozenOrder.current = { pinned: positions(pinned), recent: positions(recentTabUsers(pinned, recent)) };
    };

    const applyFrozenOrder = (list: TrackedUser[], listTab: ListTab) => {
        const order = frozenOrder.current?.[listTab];
        if (!order) return list;
        return [...list].sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1));
    };

    const pinnedDrag = usePinnedDrag(() => {
        snapshotOrder();
        forceUpdate();
    });

    // Opening the window proves it works, which clears an older warning.
    useEffect(() => {
        if (isProven(T.apiWindow)) return;

        proveWorking(T.apiWindow);
        forceUpdate();
    }, []);

    useEffect(() => {
        snapshotOrder();

        const redraw = throttle(forceUpdate, REDRAW_THROTTLE_MS);
        const unsubscribe = subscribeToStore(redraw);
        const unsubscribeQueue = subscribeToQueue(redraw);
        const unsubscribeProgress = subscribeToSubscriptionProgress(redraw);

        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", redraw);
        FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK_BATCH", redraw);
        const interval = setInterval(forceUpdate, LIVE_REFRESH_MS);

        let open = true;

        // Lookups wait until after the first frame.
        const warmUp = setTimeout(() => {
            const { pinned, recent } = getVisibleUsers();
            const shown = [...pinned, ...recent].map(user => user.id);

            void warmUpUsers(shown, forceUpdate, () => open);

            requestPresences(shown);
        }, 0);

        return () => {
            open = false;
            clearTimeout(warmUp);
            redraw.cancel();
            unsubscribe();
            unsubscribeQueue();
            unsubscribeProgress();
            FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", redraw);
            FluxDispatcher.unsubscribe("GUILD_MEMBERS_CHUNK_BATCH", redraw);
            clearInterval(interval);
        };
    }, []);

    const { pinned, recent, historyCapacity } = getVisibleUsers();
    const limit = getHistoryLimit();
    const total = pinned.length + recent.length;
    const freeSlots = Math.max(0, limit - total);
    const health = getApiHealth();

    const filter = (users: TrackedUser[]) => {
        const normalized = normalizeSearch(query.trim());
        if (!normalized) return users;
        return users.filter(user => getSearchText(user.id, user.name).includes(normalized));
    };

    const pinnedMatching = filter(pinned);
    const recentMatching = filter(recentTabUsers(pinned, recent));

    // Counted before the live filter, so the counts describe the whole tab.
    const livePinned = countLive(pinnedMatching);
    const liveRecent = countLive(recentMatching);
    const live = liveRecent;

    const inVoiceOnly = (users: TrackedUser[]) =>
        (isLiveOnly() ? users.filter(user => getVoiceInfo(user.id)) : users);

    const listTab: ListTab = tab === "pinned" ? "pinned" : "recent";
    const shownList = inTabOrder(applyFrozenOrder(inVoiceOnly(listTab === "pinned" ? pinnedMatching : recentMatching), listTab), listTab, isWithMe);

    /** The search and the voice filter stay on the activity tab too. */
    const matchesControls = (userId: string) => {
        const normalized = normalizeSearch(query.trim());
        const found = !normalized || getSearchText(userId, getTrackedUser(userId)?.name ?? "").includes(normalized);
        return found && (!isLiveOnly() || getVoiceInfo(userId) != null);
    };
    const rowsToDraw = useRowsToDraw(shownList.length, tab);
    const Row = getMemoUserRow();
    const sharedKey = rowSharedKey();

    const isEmpty = !pinnedMatching.length && !recentMatching.length;
    const status = readState();

    return (
        <>
            <Header
                status={status}
                people={total}
                live={live}
                embedded={embedded}
                controls={
                    <>
                        {!embedded && <SizeButton />}
                        {popout
                            ? <PopoutControls onPopIn={popRadarBackIn} />
                            : !embedded && canPopOut() && <PopOutButton onPopOut={popRadarOut} />}
                    </>
                }
                onClose={onClose}
            />

            <div className={cl("controls")}>
                <Tabs
                    tab={tab}
                    setTab={openTab}
                    pinned={{ total: pinnedMatching.length, live: livePinned }}
                    recent={{ total: recentMatching.length, live: liveRecent }}
                />
                <SearchBox query={query} setQuery={setQuery} />
                {tab !== "activity" && <EverywhereToggle onChanged={forceUpdate} />}
                <LiveFilter onChanged={forceUpdate} />
                <PendingChips onChanged={forceUpdate} />
            </div>

            <FollowCard onChanged={forceUpdate} />

            {health.broken.length > 0 && (
                <div className={cl("warning") + " " + cl("warning-bad")}>
                    {T.warnApiProblems(health.broken.join(", "))}
                </div>
            )}

            {health.degraded.length > 0 && (
                <div className={cl("warning")}>{T.warnApiDegraded(health.degraded.join(", "))}</div>
            )}

            {needsFullRestart() && (
                <div className={cl("warning") + " " + cl("notice")}>
                    <span>{T.restartNotice}</span>
                    <button className={cl("chip")} onClick={askToRestartDiscord}>{T.restartButton}</button>
                </div>
            )}

            {(historyCapacity === 0 || total > limit) && (
                <div className={cl("warning")}>{T.warnOverLimit(total, limit, freeSlots)}</div>
            )}

            {tab === "activity"
                ? <ActivityFilterChoice filter={activityFilter} onChoose={setActivityFilter} />
                : !isEmpty && (
                    <div className={cl("list-hint")}>
                        {tab === "pinned"
                            ? T.sectionPinnedHint(pinned.length, limit)
                            : T.sectionRecentHint(freeSlots)}
                    </div>
                )}

            <div className={cl("list-area")}>
                {tab === "activity" ? <ActivityList filter={activityFilter} matches={matchesControls} /> : <div className={cl("list")}>
                    {isEmpty ? (
                        <div className={cl("empty")}>
                            <div className={cl("empty-icon")}><RadarIcon size={34} /></div>
                            <div className={cl("empty-title")}>{T.emptyTitle}</div>
                            <div className={cl("empty-hint")}>{T.emptyHint}</div>
                        </div>
                    ) : shownList.length ? (
                        shownList.slice(0, rowsToDraw).map(user => (
                            <Row
                                key={user.id}
                                user={user}
                                signature={rowSignature(user, sharedKey)}
                                drag={tab === "pinned" ? pinnedDrag : undefined}
                            />
                        ))
                    ) : (
                        <div className={cl("empty-tab")}>
                            {isLiveOnly() ? T.tabEmptyLive : T.tabEmpty}
                        </div>
                    )}

                    {isSearchingEverywhere() && query.trim() && (
                        <VoiceSearchResults query={query} shownIds={new Set(shownList.map(user => user.id))} onChanged={forceUpdate} />
                    )}
                </div>}

                <WithYou />
            </div>

            <Footer pinned={pinned.length} recent={recent.length} total={total} limit={limit} onChanged={forceUpdate} />
        </>
    );
}

const RADAR_WINDOW = "radar";

/** The system wide hotkey, which leaves Discord's main window alone while the radar has a window of its own. */
export function toggleRadarFromHotkey(): boolean | undefined {
    if (opensInOwnWindow()) {
        openRadarModal();
        return undefined;
    }

    if (!isRadarPoppedOut()) return openRadarModal();

    if (isRadarPopoutFocused()) minimizeRadarPopout();
    else popRadarWindow();

    return undefined;
}

export function openRadarModal(): boolean {
    const press = radarPress({
        direct: opensInOwnWindow(),
        hide: !!settings.store.hideOwnWindow,
        inDiscord: isWindowOpen(RADAR_WINDOW),
        ownWindow: isRadarPoppedOut(),
        ownWindowShown: isRadarPopoutShown()
    });

    switch (press) {
        case "close-in-discord":
            closeWindow(RADAR_WINDOW, { animate: true });
            return false;
        case "close-own-window":
            closeRadarPopout();
            return false;
        case "hide-own-window":
            void hideRadarPopout();
            return false;
        case "show-own-window":
            return showOwnWindow();
        case "open-in-discord":
            return openInDiscord();
    }
}

/** For menus, where opening must not close a radar that is already up. */
export function showRadar() {
    if (isRadarPopoutShown()) popRadarWindow();
    else openRadarModal();
}

function showOwnWindow(): boolean {
    refreshLimit();
    sweepCurrentChannel();

    return popRadarWindow() || openInDiscord();
}

function openInDiscord(): boolean {
    refreshLimit();
    sweepCurrentChannel();

    const opened = openWindow(RADAR_WINDOW, {
        label: WINDOW_LABEL,
        size: "xl",
        keysTaken: isHotkeyCaptureActive,
        render: (close, embedded) => <RadarWindow onClose={close} embedded={embedded} />,
        onCrash: () => reportBroken(T.apiWindow, true)
    });

    if (!opened) {
        reportBroken(T.apiWindow, true);
        toast(T.couldNotOpenWindow, ToastType.FAILURE);
    }

    return opened;
}

export function windowProblems(): ApiHealth {
    return new HealthReport()
        .vital(() => isFound(createRoot) || (isFound(Modal) && isFound(openModal)), T.apiWindow);
}

export function closeRadarModal() {
    closeWindow(RADAR_WINDOW);
}
