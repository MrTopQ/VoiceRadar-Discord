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
import { useEffect, useRef, useState } from "@webpack/common";

import { toggleAutoJoinFor } from "../actions";
import { channelLabel, getVoiceInfo } from "../channels";
import { confirmFirst } from "../confirm";
import { syncGlobalHotkey } from "../globalHotkey";
import { formatHotkey, hotkeyFromEvent, parseHotkey, setHotkeyCaptureActive } from "../hotkey";
import { T } from "../i18n";
import { getReturnableBatch, sendBatchBack } from "../moveHistory";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName } from "../names";
import { cancelQueue, getQueueEntry } from "../queue";
import { DEFAULT_HOTKEY, settings } from "../settings";
import { clearHistory, getAutoJoinTarget } from "../store";
import { toast, ToastType } from "../toast";
import { cl } from "./common";
import { Hint } from "./Hint";
import { ClockIcon, CloseIcon, GearIcon, GlobeIcon, KeyboardIcon, MicIcon, MicOffIcon, ReturnIcon, SearchIcon, TargetIcon, TrashIcon } from "./icons";
import { TYPE_TARGET_ATTRIBUTE } from "./Overlay";
import { openPluginSettings } from "./pluginSettings";

function HotkeyRecorder() {
    const [recording, setRecording] = useState(false);
    const forceUpdate = useForceUpdater();
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!recording) return;

        // The keys arrive in the window the button sits in, which may be the popped out radar.
        const view = buttonRef.current?.ownerDocument.defaultView ?? window;

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
            syncGlobalHotkey();
            setRecording(false);
            forceUpdate();
            toast(T.hotkeySaved(combo), ToastType.SUCCESS);
        };

        view.addEventListener("keydown", onKeyDown, { capture: true });
        return () => {
            setHotkeyCaptureActive(false);
            view.removeEventListener("keydown", onKeyDown, { capture: true });
        };
    }, [recording]);

    const current = formatHotkey(parseHotkey(settings.store.hotkey || DEFAULT_HOTKEY));

    return (
        <Hint text={recording ? null : T.hotkeyHint}>
            {hintProps => (
                <button
                    {...hintProps}
                    ref={buttonRef}
                    className={cl("chip") + (recording ? " " + cl("chip-on") : "")}
                    onClick={() => setRecording(value => !value)}
                >
                    <KeyboardIcon />
                    {recording ? T.pressKeys : <>{T.hotkeyLabel}<kbd className={cl("kbd")}>{current}</kbd></>}
                </button>
            )}
        </Hint>
    );
}

function SilentJoinToggle({ onChanged }: { onChanged: () => void; }) {
    const silent = settings.store.silentJoin;

    return (
        <button
            className={cl("chip") + (silent ? " " + cl("chip-on") : "")}
            aria-pressed={silent}
            onClick={() => {
                settings.store.silentJoin = !silent;
                onChanged();
            }}
        >
            {silent ? <MicOffIcon size={16} /> : <MicIcon />}
            {T.silentJoinLabel}
            <span className={cl("chip-value") + (silent ? " " + cl("chip-value-on") : "")}>
                {silent ? T.infoYes : T.infoNo}
            </span>
        </button>
    );
}

let liveOnly = false;

export const isLiveOnly = () => liveOnly;

export function LiveFilter({ onChanged }: { onChanged: () => void; }) {
    const option = (value: boolean, label: string) => (
        <button
            className={cl("segment") + (liveOnly === value ? " " + cl("segment-on") : "") + (value ? " " + cl("segment-live") : "")}
            aria-pressed={liveOnly === value}
            onClick={() => {
                if (liveOnly === value) return;
                liveOnly = value;
                onChanged();
            }}
        >
            {value && <span className={cl("live-dot")} />}
            {label}
        </button>
    );

    return (
        <div className={cl("segments")} role="group" aria-label={T.filterLabel}>
            {option(false, T.filterAll)}
            {option(true, T.filterLive)}
        </div>
    );
}

let searchEverywhere = false;

export const isSearchingEverywhere = () => searchEverywhere;

/** Widens the search from the list to everybody in voice on the watched servers. */
export function EverywhereToggle({ onChanged }: { onChanged: () => void; }) {
    return (
        <Hint text={searchEverywhere ? T.everywhereOnHint : T.everywhereOffHint}>
            {hintProps => (
                <button
                    {...hintProps}
                    className={cl("chip") + " " + cl("everywhere") + (searchEverywhere ? " " + cl("chip-on") : "")}
                    aria-pressed={searchEverywhere}
                    onClick={() => {
                        searchEverywhere = !searchEverywhere;
                        onChanged();
                    }}
                >
                    <GlobeIcon />
                    {T.everywhereLabel}
                </button>
            )}
        </Hint>
    );
}

export function SearchBox({ query, setQuery }: { query: string; setQuery: (value: string) => void; }) {
    return (
        <label className={cl("search")}>
            <SearchIcon />
            <input
                {...{ [TYPE_TARGET_ATTRIBUTE]: true }}
                className={cl("search-input")}
                placeholder={T.searchPlaceholder}
                value={query}
                onChange={event => setQuery(event.currentTarget.value)}
                onKeyDown={event => {
                    if (event.key !== "Escape" || !query) return;
                    event.stopPropagation();
                    setQuery("");
                }}
                autoFocus
            />
            {query && (
                <button className={cl("search-clear")} aria-label={T.searchClear} onClick={() => setQuery("")}>
                    <CloseIcon size={14} />
                </button>
            )}
        </label>
    );
}

export function PendingChips({ onChanged }: { onChanged: () => void; }) {
    const queue = getQueueEntry();
    const returnable = getReturnableBatch().length;

    return (
        <>
            {returnable > 0 && (
                <button className={cl("chip") + " " + cl("chip-amber")} onClick={() => void sendBatchBack().then(onChanged)}>
                    <ReturnIcon size={16} />
                    {T.chipSendBack(returnable)}
                </button>
            )}

            {queue && (
                <button
                    className={cl("chip") + " " + cl("chip-amber")}
                    onClick={() => {
                        cancelQueue(T.queueCancelled);
                        onChanged();
                    }}
                >
                    <ClockIcon size={16} />
                    {T.chipWaitingForSlot(queue.channelLabel)}
                    <CloseIcon size={14} />
                </button>
            )}
        </>
    );
}

export function FollowCard({ onChanged }: { onChanged: () => void; }) {
    const target = getAutoJoinTarget();
    if (!target) return null;

    const name = getUserDisplayName(target.id, target.name);
    const voice = getVoiceInfo(target.id);

    return (
        <div className={cl("follow") + (voice ? " " + cl("follow-live") : "")}>
            <div className={cl("follow-avatar-wrap")}>
                <img className={cl("follow-avatar")} src={getAvatarUrl(target.id) ?? DEFAULT_AVATAR_URL} alt="" />
                <span className={cl("follow-mark")}><TargetIcon size={12} /></span>
            </div>
            <div className={cl("follow-info")}>
                <div className={cl("follow-title")}>{T.followTitle(name)}</div>
                <div className={cl("follow-where")}>
                    {voice ? T.followWhere(channelLabel(voice)) : T.followNotInVoice}
                </div>
            </div>
            <button
                className={cl("follow-remove")}
                onClick={() => {
                    toggleAutoJoinFor(target.id, target.name);
                    onChanged();
                }}
            >
                {T.followRemove}
            </button>
        </div>
    );
}

export type Tab = "pinned" | "recent";

interface TabCounts {
    total: number;
    live: number;
}

export function Tabs({ tab, setTab, pinned, recent }: {
    tab: Tab;
    setTab: (tab: Tab) => void;
    pinned: TabCounts;
    recent: TabCounts;
}) {
    const button = (value: Tab, label: string, counts: TabCounts) => (
        <button
            className={cl("segment") + " " + cl("tab") + (tab === value ? " " + cl("segment-on") : "")}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
        >
            {label}
            <span className={cl("count")}>{counts.total}</span>
            {counts.live > 0 && (
                <span className={cl("count") + " " + cl("count-live")} title={T.tabLiveHint}>
                    {counts.live}
                </span>
            )}
        </button>
    );

    return (
        <div className={cl("segments")} role="tablist">
            {button("pinned", T.sectionPinned, pinned)}
            {button("recent", T.sectionRecent, recent)}
        </div>
    );
}

function SettingsButton() {
    return (
        <button className={cl("chip")} onClick={() => openPluginSettings()}>
            <GearIcon />
            {T.settingsButton}
        </button>
    );
}

export function Footer({ pinned, recent, total, limit, onChanged }: {
    pinned: number;
    recent: number;
    total: number;
    limit: number;
    onChanged: () => void;
}) {
    return (
        <footer className={cl("foot")}>
            {/* Redraw the whole window, every join button says whether it mutes you. */}
            <SilentJoinToggle onChanged={onChanged} />
            <HotkeyRecorder />
            <SettingsButton />

            <span className={cl("foot-count")}>{T.modalSubtitle(pinned, recent, total, limit)}</span>

            <button
                className={cl("clear")}
                disabled={!recent}
                onClick={() => void confirmFirst({
                    title: T.clearHistoryTitle,
                    body: T.clearHistoryBody(recent),
                    confirmText: T.clearHistoryConfirm,
                    cancelText: T.cancel,
                    confirmColor: "red",
                    onConfirm: () => {
                        clearHistory();
                        toast(T.historyCleared, ToastType.SUCCESS);
                    }
                })}
            >
                <TrashIcon size={16} />
                {T.clearHistory}
            </button>
        </footer>
    );
}
