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

import { getApiHealth } from "../apiHealth";
import type { FeatureLevel } from "../features";
import { getHotkeyReach, isHotkeyReachSettled } from "../globalHotkey";
import { getSubscriptionProgress, getSubscriptionStatus } from "../guildSubscriptions";
import { T } from "../i18n";
import { getStoreState } from "../store";
import { formatRelativeTime } from "../time";
import { cl } from "./common";
import { openHealthModal } from "./Health";
import { Hint } from "./Hint";
import { CloseIcon, RadarIcon } from "./icons";

export const WINDOW_LABEL = "Voice Radar";

export interface PluginState {
    state: FeatureLevel;
    label: string;
}

export function readState(): PluginState {
    const { broken, degraded } = getApiHealth();
    if (broken.length) return { state: "bad", label: T.statusProblems(broken.length) };

    const store = getStoreState();
    if (store === "failed") return { state: "bad", label: T.statusListLost };
    if (store === "loading") return { state: "pending", label: T.statusLoading };

    // Startup lasts until the first pass has finished.
    if (!getSubscriptionStatus()) {
        return { state: "pending", label: T.statusLoading };
    }

    if (degraded.length) return { state: "waiting", label: T.statusDegraded(degraded.length) };

    const reach = getHotkeyReach();
    if (reach === "asking") return { state: "pending", label: T.statusLoading };
    if (!isHotkeyReachSettled(reach)) {
        return { state: "waiting", label: reach === "taken" ? T.statusHotkeyTaken : T.statusNeedsRestart };
    }

    return { state: "good", label: T.statusReady };
}

function statusLine(people: number, live: number): string {
    const { broken, degraded } = getApiHealth();
    if (broken.length) return T.statusBroken(broken.join(", "));

    const store = getStoreState();
    if (store === "failed") return T.statusListLostLine;
    if (store === "loading") return T.statusStoreLoading;

    const progress = getSubscriptionProgress();
    if (progress) return T.statusSubscribing(progress.done, progress.total);

    if (!getSubscriptionStatus()) return T.statusServersWaiting;

    if (degraded.length) return T.statusDegradedLine(degraded.join(", "));

    const reach = getHotkeyReach();
    if (!isHotkeyReachSettled(reach)) return T.statusHotkey[reach];

    return T.statusStoreLoaded(people, live);
}

function StatusTooltip({ people, live }: { people: number; live: number; }) {
    const subscriptions = getSubscriptionStatus();

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

function StatusChip({ status, people, live }: { status: PluginState; people: number; live: number; }) {
    return (
        <Hint text={<StatusTooltip people={people} live={live} />}>
            {hintProps => (
                <button
                    {...hintProps}
                    className={cl("status") + " " + cl("status-" + status.state)}
                    onClick={openHealthModal}
                >
                    <span className={cl("status-dot-small")} />
                    {status.label}
                </button>
            )}
        </Hint>
    );
}

export function Header({ status, people, live, embedded, onClose }: {
    status: PluginState;
    people: number;
    live: number;
    embedded: boolean;
    onClose: () => void;
}) {
    return (
        <header className={cl("head") + (embedded ? " " + cl("head-embedded") : "")}>
            {!embedded && <div className={cl("head-icon")}><RadarIcon size={22} /></div>}
            <div className={cl("head-text")}>
                {!embedded && <div className={cl("head-title")}>{WINDOW_LABEL}</div>}
                <div className={cl("head-line") + " " + cl("status-" + status.state)}>
                    {statusLine(people, live)}
                </div>
            </div>
            <StatusChip status={status} people={people} live={live} />
            {!embedded && (
                <button className={cl("close")} onClick={onClose} aria-label={T.closeWindow}>
                    <CloseIcon />
                </button>
            )}
        </header>
    );
}
