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
import { useForceUpdater } from "@utils/react";
import type { RenderModalProps } from "@vencord/discord-types";
import { Alerts, closeModal, FluxDispatcher, Modal, openModal, Tooltip, useEffect, useRef, useState } from "@webpack/common";

import { type ApiHealth, getApiHealth, HealthReport, isResolvedComponent, reportBroken } from "../apiHealth";
import { getVoiceInfo } from "../channels";
import { getHotkeyReach, isHotkeyReachSettled, syncGlobalHotkey } from "../globalHotkey";
import { getSubscriptionProgress, getSubscriptionStatus } from "../guildSubscriptions";
import { formatHotkey, hotkeyFromEvent, parseHotkey, setHotkeyCaptureActive } from "../hotkey";
import { T } from "../i18n";
import { getReturnableBatch, sendBatchBack } from "../moveHistory";
import { getSearchText, getUserDisplayName, normalizeSearch, warmUpUsers } from "../names";
import { requestPresences } from "../presence";
import { cancelQueue, getQueueEntry, subscribeToQueue } from "../queue";
import { DEFAULT_HOTKEY, getHistoryLimit, settings } from "../settings";
import {
    clearHistory,
    getAutoJoinTarget,
    getStoreState,
    getVisibleUsers,
    pinnedPositionOf,
    refreshLimit,
    reorderPinned,
    subscribeToStore,
    TrackedUser
} from "../store";
import { throttle } from "../throttle";
import { formatRelativeTime } from "../time";
import { toast, ToastType } from "../toast";
import { sweepCurrentChannel } from "../tracker";
import { cl } from "./common";
import { openHealthModal } from "./Health";
import { RadarIcon } from "./icons";
import { type DragHandlers, UserRow } from "./UserRow";

const MODAL_KEY = "vc-voice-radar-topq";
const LIVE_REFRESH_MS = 15000;
const REDRAW_THROTTLE_MS = 400;

let isModalOpen = false;

function HotkeyRecorder() {
    const [recording, setRecording] = useState(false);
    const forceUpdate = useForceUpdater();

    useEffect(() => {
        if (!recording) return;

        setHotkeyCaptureActive(true);

        const onKeyDown = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (event.key === "Escape") {
                setRecording(false);
                return;
            }

            const combo = hotkeyFromEvent(event);
            if (!combo) return;

            settings.store.hotkey = combo;
            // the system wide claim is for the old combination, so it has to be taken again
            syncGlobalHotkey();
            setRecording(false);
            forceUpdate();
            toast(T.hotkeySaved(combo), ToastType.SUCCESS);
        };

        window.addEventListener("keydown", onKeyDown, { capture: true });
        return () => {
            setHotkeyCaptureActive(false);
            window.removeEventListener("keydown", onKeyDown, { capture: true });
        };
    }, [recording]);

    const current = formatHotkey(parseHotkey(settings.store.hotkey || DEFAULT_HOTKEY));

    return (
        <button
            className={cl("chip") + (recording ? " " + cl("chip-active") : "")}
            onClick={() => setRecording(value => !value)}
        >
            {recording ? T.pressKeys : T.hotkeyChip(current)}
        </button>
    );
}

/**
 * Whether the list is narrowed to the people who are in a voice channel this second.
 *
 * Kept in memory beside lastTab, and for the same reason: it is a view state rather than a
 * preference, and a fresh Discord may as well show everybody. Hiding people is the one thing here
 * that could read as a broken list, so nothing about it is silent. The chip says which of the two
 * states it is in words, and the counts beside each tab go on reporting what the tab actually
 * holds, so what is hidden is a subtraction anybody can do on screen.
 */
let liveOnly = false;

function Toolbar({ query, setQuery, onChanged }: { query: string; setQuery: (value: string) => void; onChanged: () => void; }) {
    const target = getAutoJoinTarget();
    const silent = settings.store.silentJoin;
    const queue = getQueueEntry();
    const returnable = getReturnableBatch().length;

    return (
        <div className={cl("toolbar")}>
            <input
                className={cl("search")}
                placeholder={T.searchPlaceholder}
                value={query}
                onChange={event => setQuery(event.currentTarget.value)}
            />

            {/* beside the search, since both of them narrow the same list */}
            <button
                className={cl("chip") + " " + cl("chip-live") + (liveOnly ? " " + cl("chip-active") : "")}
                onClick={() => {
                    liveOnly = !liveOnly;
                    onChanged();
                }}
            >
                {liveOnly ? T.chipLiveOnlyOn : T.chipLiveOnlyOff}
            </button>

            <button
                className={cl("chip") + (silent ? " " + cl("chip-active") : "")}
                onClick={() => {
                    settings.store.silentJoin = !silent;
                    onChanged();
                }}
            >
                {silent ? T.chipSilentJoinOn : T.chipSilentJoinOff}
            </button>

            <button
                className={cl("chip") + (settings.store.autoJoinEnabled ? " " + cl("chip-active") : "")}
                onClick={() => {
                    settings.store.autoJoinEnabled = !settings.store.autoJoinEnabled;
                    onChanged();
                }}
            >
                {!settings.store.autoJoinEnabled
                    ? T.chipAutoJoinDisabled(target ? getUserDisplayName(target.id, target.name) : null)
                    : target
                        ? T.chipAutoJoinTarget(getUserDisplayName(target.id, target.name))
                        : T.chipAutoJoinNobody}
            </button>

            <HotkeyRecorder />

            {returnable > 0 && (
                <button
                    className={cl("chip") + " " + cl("chip-return")}
                    onClick={() => void sendBatchBack().then(onChanged)}
                >
                    {T.chipSendBack(returnable)}
                </button>
            )}

            {queue && (
                <button
                    className={cl("chip") + " " + cl("chip-queue")}
                    onClick={() => {
                        cancelQueue(T.queueCancelled);
                        onChanged();
                    }}
                >
                    {T.chipWaitingForSlot(queue.channelLabel)}
                </button>
            )}
        </div>
    );
}

/**
 * What the plugin is doing right now, in the corner of the window it belongs in.
 *
 * The parts do not all come up at once. The saved list is read from the database, the servers are
 * subscribed to one at a time, and the hotkey may or may not have been claimed system wide. Without
 * this the reader has to guess which of those is why the list looks empty or a person looks offline.
 */
/**
 * Green means the plugin can do everything it was asked to. Amber means it is still getting there, or
 * something is weaker than you asked for but still works, like a hotkey that only reaches inside
 * Discord. Red is kept for the two faults that stop it doing its job at all, a Discord update having
 * moved what it reads, and the saved list failing to come out of the database.
 */
function readState(): { state: "good" | "waiting" | "bad"; label: string; } {
    const { broken, degraded } = getApiHealth();
    if (broken.length) return { state: "bad", label: T.statusProblems(broken.length) };

    const store = getStoreState();
    if (store === "failed") return { state: "bad", label: T.statusListLost };
    if (store === "loading") return { state: "waiting", label: T.statusLoading };

    /*
     * Starting up lasts until the first pass has finished, not merely while one is running.
     *
     * The first pass waits out a delay before it begins, because the gateway is at its busiest
     * while Discord is still logging in. Asking whether a pass was in progress made that delay
     * read as "ready", so the window opened green, claimed to be done, and then went back to
     * "starting up" once the pass actually began. Wrong, and in the wrong order.
     *
     * It is also untrue in the way that matters. Until that pass has run, not one server has been
     * asked to keep sending voice states, which is the whole of what lets the plugin see somebody
     * join a server you have not opened this session.
     *
     * Only the first one counts. Once it has finished the plugin is working, and every later pass
     * is a top-up, for servers that finished loading after the first one or for a server you have
     * just joined. Treating those as a startup is how a window that had been ready for minutes
     * still said it was starting, on and off, for the rest of the session.
     */
    if (!getSubscriptionStatus()) {
        return { state: "waiting", label: T.statusLoading };
    }

    /*
     * Below the startup, so the two agree with the line under the title, which reports the phase
     * before the standing conditions for the same reason. Neither of these hides anything: the
     * broken and degraded parts are spelled out in their own banners inside the window.
     */
    if (degraded.length) return { state: "waiting", label: T.statusDegraded(degraded.length) };

    /*
     * Amber, and worth saying. A combination the machine refused is the one of these that used to
     * be silent here, because the reach it actually has, inside Discord only, is the same reach
     * somebody who never asked for more would have, and the chip read them as the same thing.
     */
    const reach = getHotkeyReach();
    if (!isHotkeyReachSettled(reach)) {
        return {
            state: "waiting",
            label: reach === "taken" ? T.statusHotkeyTaken
                : reach === "asking" ? T.statusLoading
                    : T.statusNeedsRestart
        };
    }

    return { state: "good", label: T.statusReady };
}

/** One line under the title saying what the plugin is doing this second. */
function statusLine(people: number, live: number): string {
    const { broken, degraded } = getApiHealth();
    if (broken.length) return T.statusBroken(broken.join(", "));

    const store = getStoreState();
    if (store === "failed") return T.statusListLostLine;
    if (store === "loading") return T.statusStoreLoading;

    const progress = getSubscriptionProgress();
    if (progress) return T.statusSubscribing(progress.done, progress.total);

    /*
     * The same startup the chip above is showing, in the stretch before the first pass begins.
     * Without this the line answered with the ready sentence, "92 people in the list, 10 in voice
     * right now", which reads as fully up and running next to a chip that says it is still
     * starting. See readState for why that stretch is a startup rather than the end of one.
     */
    if (!getSubscriptionStatus()) return T.statusServersWaiting;

    if (degraded.length) return T.statusDegradedLine(degraded.join(", "));

    const reach = getHotkeyReach();
    if (!isHotkeyReachSettled(reach)) return T.statusHotkey[reach];

    return T.statusStoreLoaded(people, live);
}

function StatusTooltip({ people, live }: { people: number; live: number; }) {
    const subscriptions = getSubscriptionStatus();

    /*
     * A pass in progress has to be said here too, because the status above it is already saying so
     * and the two sat side by side contradicting each other, "asking, 12 of 64" over "the servers
     * have not been asked yet". The second was reading the last *finished* pass, which during the
     * first one is nothing at all.
     */
    const passRunning = getSubscriptionProgress() != null;

    const serversLine = subscriptions
        ? T.statusServers(subscriptions.guilds, formatRelativeTime(subscriptions.at))
        : passRunning ? T.statusServersFirstPass : T.statusServersWaiting;

    return (
        <div className={cl("vc-tooltip")}>
            <div className={cl("vc-tooltip-title")}>{T.statusTitle}</div>
            <div>{statusLine(people, live)}</div>
            <div>{serversLine}</div>
            <div>{T.statusHotkey[getHotkeyReach()]}</div>
        </div>
    );
}

function StatusChip({ people, live }: { people: number; live: number; }) {
    const { state, label } = readState();

    return (
        <Tooltip text={<StatusTooltip people={people} live={live} />}>
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    className={cl("status") + " " + cl("status-" + state)}
                    onClick={openHealthModal}
                >
                    <span className={cl("status-dot-small")} />
                    {label}
                </button>
            )}
        </Tooltip>
    );
}

type Tab = "pinned" | "recent";

/**
 * The tab the window was closed on, so it opens where you left it. Kept in memory rather than saved,
 * because it is a view state and not a preference, and a fresh Discord may as well start on the
 * pinned people.
 */
let lastTab: Tab | null = null;

/** How many the tab holds, and how many of those are in a voice channel at this moment. */
interface TabCounts {
    total: number;
    live: number;
}

/**
 * One list at a time, full width. Both at once was tried side by side and the row does not survive
 * half a window. It carries an avatar, a name, a channel chip, two lines of detail and seven
 * buttons, and all of that starts wrapping long before the columns are comfortable.
 */
function Tabs({ tab, setTab, pinned, recent, hint }: {
    tab: Tab;
    setTab: (tab: Tab) => void;
    pinned: TabCounts;
    recent: TabCounts;
    hint: string;
}) {
    const button = (value: Tab, label: string, counts: TabCounts) => (
        <button
            className={cl("tab") + (tab === value ? " " + cl("tab-active") : "")}
            onClick={() => setTab(value)}
        >
            {label}
            <span className={cl("tab-count")}>{counts.total}</span>
            {/* only when there is somebody, so an empty green nought never sits there looking live */}
            {counts.live > 0 && (
                <span className={cl("tab-count") + " " + cl("tab-live")} title={T.tabLiveHint}>
                    {counts.live}
                </span>
            )}
        </button>
    );

    return (
        <div className={cl("tabs")}>
            {button("pinned", T.sectionPinned, pinned)}
            {button("recent", T.sectionRecent, recent)}
            <span className={cl("dim")}>{hint}</span>
        </div>
    );
}

const countLive = (users: TrackedUser[]) => users.filter(user => getVoiceInfo(user.id)).length;

/**
 * People sitting in your voice channel right now rise to the top of their own section and hold that
 * spot while they are there, so leaving and coming back does not push them down. Everyone else keeps
 * the order they had, which makes this a stable partition rather than a re-sort. Pinned people stay
 * above recent ones either way.
 */
function withMeFirst(users: TrackedUser[]): TrackedUser[] {
    const withMe: TrackedUser[] = [];
    const rest: TrackedUser[] = [];

    for (const user of users) {
        (getVoiceInfo(user.id)?.isMyChannel ? withMe : rest).push(user);
    }

    return withMe.length ? [...withMe, ...rest] : users;
}

/** Drag-and-drop state for the pinned section, kept here so a row stays a dumb component. */
function usePinnedDrag(onChanged: () => void): DragHandlers {
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);

    /**
     * Read from the stored order, because that is the order the drop is computed against. The
     * section floats people sitting with you to the top, and taking the direction from what is on
     * screen would put the line on the wrong edge exactly when the two views disagree.
     */
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

function RadarModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const forceUpdate = useForceUpdater();
    const [query, setQuery] = useState("");
    // where you left off, or the pinned people, since those are the ones you set up on purpose
    const [tab, setTab] = useState<Tab>(() =>
        lastTab ?? (getVisibleUsers().pinned.length ? "pinned" : "recent"));

    const openTab = (next: Tab) => {
        lastTab = next;
        setTab(next);
    };

    /**
     * The order is frozen while the window is open. Joining someone makes them your freshest
     * contact, which used to re-sort the list under your cursor mid click. New people still appear
     * on top, and the real order is picked up again next time you open the radar.
     */
    const frozenOrder = useRef<Map<string, number> | null>(null);

    const snapshotOrder = () => {
        const { pinned, recent } = getVisibleUsers();
        frozenOrder.current = new Map([...pinned, ...recent].map((user, index) => [user.id, index]));
    };

    const applyFrozenOrder = (list: TrackedUser[]) => {
        const order = frozenOrder.current;
        if (!order) return list;
        return [...list].sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1));
    };

    const pinnedDrag = usePinnedDrag(() => {
        snapshotOrder();
        forceUpdate();
    });

    useEffect(() => {
        snapshotOrder();

        // voice events fire for every server you are in, so bursts are coalesced into one redraw
        const redraw = throttle(forceUpdate, REDRAW_THROTTLE_MS);
        const unsubscribe = subscribeToStore(redraw);
        const unsubscribeQueue = subscribeToQueue(redraw);

        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", redraw);
        // fired when the gateway answers our presence request
        FluxDispatcher.subscribe("GUILD_MEMBERS_CHUNK_BATCH", redraw);
        // the slow tick only keeps "seen X ago" and status changes fresh
        const interval = setInterval(forceUpdate, LIVE_REFRESH_MS);

        const { pinned, recent } = getVisibleUsers();
        const shown = [...pinned, ...recent];

        // avatars and names for people Discord has not cached, fetched one at a time and
        // abandoned the moment the window closes
        let open = true;
        void warmUpUsers(shown.map(user => user.id), forceUpdate, () => open);

        // one batched gateway request for everyone whose status Discord never sent us
        requestPresences(shown.map(user => user.id));

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

    const { pinned, recent, historyCapacity } = getVisibleUsers();
    const limit = getHistoryLimit();
    const total = pinned.length + recent.length;
    // what is left, not what history may grow to. The capacity is mostly occupied already
    const freeSlots = Math.max(0, limit - total);
    const health = getApiHealth();

    const filter = (users: TrackedUser[]) => {
        const normalized = normalizeSearch(query.trim());
        if (!normalized) return users;
        // nickname, display name, username and the cached name all count as a match
        return users.filter(user => getSearchText(user.id, user.name).includes(normalized));
    };

    /*
     * What each tab holds once the search has had its say, which is what its counts describe and
     * what "the window is empty" is judged on.
     *
     * The store already hands them over newest first and already capped to the limit. Slicing
     * again here would hide people it deliberately kept, like bells and the auto-join target.
     */
    const pinnedMatching = filter(pinned);
    const recentMatching = filter(recent);

    /*
     * Worked out once, and deliberately before the live filter rather than after it. Each of these
     * walks a list asking Discord where every person is, and the pair used to be spelled out twice,
     * once for the chip in the title and once for the line under it, with readState() run a third
     * time beside them. At a hundred rows that was three passes a redraw for two numbers that
     * cannot differ.
     *
     * Counting first is also what keeps the green number honest while the filter is on. It answers
     * "how many of this tab are in voice", and counting the already filtered list would have it
     * answer "how many of the ones I am showing you", which is every one of them.
     */
    const livePinned = countLive(pinnedMatching);
    const liveRecent = countLive(recentMatching);
    const live = livePinned + liveRecent;

    const inVoiceOnly = (users: TrackedUser[]) =>
        (liveOnly ? users.filter(user => getVoiceInfo(user.id)) : users);

    const pinnedList = withMeFirst(applyFrozenOrder(inVoiceOnly(pinnedMatching)));
    const recentList = withMeFirst(applyFrozenOrder(inVoiceOnly(recentMatching)));

    // the list having nobody in it and the filter hiding everybody are different answers, and only
    // the first of them is worth the big "nobody here yet, go and add somebody" panel
    const isEmpty = !pinnedMatching.length && !recentMatching.length;
    const shownList = tab === "pinned" ? pinnedList : recentList;
    const { state } = readState();

    return (
        <Modal
            {...modalProps}
            size="xl"
            title={
                <span className={cl("header")}>
                    <RadarIcon size={20} />
                    Voice Radar
                    <StatusChip people={total} live={live} />
                </span>
            }
            subtitle={T.modalSubtitle(pinned.length, recent.length, total, limit)}
            actions={[
                {
                    text: T.clearHistory,
                    variant: "critical-primary",
                    disabled: !recent.length,
                    onClick: () => Alerts.show({
                        title: T.clearHistoryTitle,
                        body: T.clearHistoryBody(recent.length),
                        confirmText: T.clearHistoryConfirm,
                        cancelText: T.cancel,
                        confirmColor: "red",
                        onConfirm: () => {
                            clearHistory();
                            toast(T.historyCleared, ToastType.SUCCESS);
                        }
                    })
                }
            ]}
        >
            <Toolbar query={query} setQuery={setQuery} onChanged={forceUpdate} />

            {/* what it is busy with this second, in words rather than in a colour */}
            <div className={cl("status-line") + " " + cl("status-" + state)}>
                {statusLine(total, live)}
            </div>

            {health.broken.length > 0 && (
                <div className={cl("warning") + " " + cl("warning-bad")}>
                    {T.warnApiProblems(health.broken.join(", "))}
                </div>
            )}

            {/* a part is gone, the plugin is not. Told in the softer colour it deserves */}
            {health.degraded.length > 0 && (
                <div className={cl("warning")}>{T.warnApiDegraded(health.degraded.join(", "))}</div>
            )}

            {/* capacity 0 means the people you set up by hand already fill the limit on their own */}
            {(historyCapacity === 0 || total > limit) && (
                <div className={cl("warning")}>{T.warnOverLimit(total, limit, freeSlots)}</div>
            )}

            {isEmpty ? (
                <div className={cl("empty")}>
                    <RadarIcon size={40} />
                    <div>{T.emptyTitle}</div>
                    <div className={cl("dim")}>{T.emptyHint}</div>
                </div>
            ) : (
                <>
                    {/* the counts are what each tab holds, not what the live filter is letting
                        through, so the two of them together say how many are being hidden */}
                    <Tabs
                        tab={tab}
                        setTab={openTab}
                        pinned={{ total: pinnedMatching.length, live: livePinned }}
                        recent={{ total: recentMatching.length, live: liveRecent }}
                        hint={tab === "pinned"
                            ? T.sectionPinnedHint(pinned.length, limit)
                            : T.sectionRecentHint(freeSlots)}
                    />

                    {shownList.length ? (
                        // the drag handles belong to the pinned order and to nothing else
                        shownList.map(user => (
                            <UserRow
                                key={user.id}
                                user={user}
                                drag={tab === "pinned" ? pinnedDrag : undefined}
                            />
                        ))
                    ) : (
                        <div className={cl("empty-tab")}>
                            {liveOnly ? T.tabEmptyLive : T.tabEmpty}
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
}

const WrappedModal = ErrorBoundary.wrap(RadarModal, { noop: true });

/**
 * Opens the radar, or closes it if it is already open, so the hotkey toggles.
 *
 * @returns whether the radar is open afterwards. The system wide hotkey needs to know, because it
 * puts Discord back where it found it when the radar is the thing that closed.
 */
export function openRadarModal(): boolean {
    if (isModalOpen) {
        closeModal(MODAL_KEY);
        isModalOpen = false;
        return false;
    }

    refreshLimit(); // the limit setting may have changed since the last commit
    sweepCurrentChannel(); // people you are sitting with right now show up immediately

    /*
     * The flag goes up before the call, because onCloseCallback belongs to the window from the
     * moment it exists, and it comes back down if opening threw. openModal is the one thing here
     * that windowProblems() exists to predict, and a throw used to leave the flag stuck on, so every
     * further press took the branch above, so the window could never be opened again for the rest
     * of the session. The toggle has to survive the failure it was warned about.
     */
    isModalOpen = true;

    try {
        openModal(
            modalProps => <WrappedModal modalProps={modalProps} />,
            {
                modalKey: MODAL_KEY,
                onCloseCallback: () => {
                    isModalOpen = false;
                }
            }
        );
    } catch (error) {
        isModalOpen = false;

        console.error("[VoiceRadar-Discord] the radar window could not be opened:", error);
        // vital, because without the window there is no radar left to speak of
        reportBroken(T.apiWindow, true);
        toast(T.couldNotOpenWindow, ToastType.FAILURE);

        return false;
    }

    return true;
}

/**
 * Without these the window cannot open at all, which is the worst way for an update to land.
 *
 * `typeof Modal === "function"` used to be half of this and it could never fail. Modal is a lazy
 * component, and Vencord hands one of those back whether or not the search behind it found anything,
 * so the test was true even with the component gone. Only the resolver knows.
 */
export function windowProblems(): ApiHealth {
    return new HealthReport()
        .vital(() => isResolvedComponent(Modal) && typeof openModal === "function", T.apiWindow);
}

export function closeRadarModal() {
    if (!isModalOpen) return;
    closeModal(MODAL_KEY);
    isModalOpen = false;
}
