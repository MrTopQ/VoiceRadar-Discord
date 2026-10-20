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
import { useEffect } from "@webpack/common";

import { getApiHealth, refreshApiHealth } from "../apiHealth";
import { getVoiceCoverage, getVoiceInfo } from "../channels";
import { type FeatureLevel, featureRows } from "../features";
import { getHotkeyReach, getTimersState, isHotkeyReachSettled } from "../globalHotkey";
import { getSubscriptionProgress, getSubscriptionStatus, isSubscriptionGuarded } from "../guildSubscriptions";
import { formatHotkey, parseHotkey } from "../hotkey";
import { T } from "../i18n";
import { DEFAULT_HOTKEY, settings } from "../settings";
import { getStoreState, getUsers } from "../store";
import { formatRelativeTime } from "../time";
import { getTrackerStats } from "../tracker";
import { cl } from "./common";
import { RadarIcon } from "./icons";
import { openWindow, WindowHead } from "./Window";

const HEALTH_WINDOW = "health";

function discordBuild(): string | null {
    try {
        const env = (window as any).GLOBAL_ENV;
        const build = env?.SENTRY_TAGS?.buildId;
        if (!build) return null;

        const version = (window as any).DiscordNative?.app?.getVersion?.();
        const short = String(build).slice(0, 7);

        return T.healthBuildLine(
            String(env?.RELEASE_CHANNEL ?? "stable"),
            version ? `${version} ${short}` : short
        );
    } catch {
        return null;
    }
}

const QUIET_TOO_LONG_MS = 15 * 60_000;

const LIVE_REFRESH_MS = 2000;

type Level = FeatureLevel;

interface Row {
    title: string;
    detail: string;
    level: Level;
}

function featureSection(): Row[] {
    const rows = featureRows();
    const after = rows.findIndex(row => row.title === T.healthPresenceTitle);

    rows.splice(after < 0 ? rows.length : after + 1, 0, serversRow());

    return rows;
}

function serversRow(): Row {
    const progress = getSubscriptionProgress();
    const subscriptions = getSubscriptionStatus();
    const { broken, degraded } = getApiHealth();
    const subscriptionIssues = [T.apiGuildSubscriptions, T.apiServerList, T.apiGuildSubscriptionAction]
        .filter(part => broken.includes(part) || degraded.includes(part));
    const subscriptionBroken = subscriptionIssues.length > 0;
    const capped = subscriptions?.capped ?? 0;

    return {
        title: T.healthServersTitle,
        level: subscriptionBroken || capped ? "waiting" : subscriptions ? "good" : "waiting",
        detail: subscriptionBroken
            ? T.healthFeatureWeak(subscriptionIssues.join(", "))
            : progress
                ? T.statusSubscribing(progress.done, progress.total)
                : subscriptions
                    ? [
                        T.healthServersLine(
                            subscriptions.guilds,
                            subscriptions.mine,
                            subscriptions.skipped,
                            formatRelativeTime(subscriptions.at)
                        ),
                        capped ? T.healthServersCapped(capped) : "",
                        isSubscriptionGuarded() ? T.healthServersGuard : T.healthServersGuardOff
                    ].filter(Boolean).join(" ")
                    : T.statusServersWaiting
    };
}

function environmentSection(): Row[] {
    const rows: Row[] = [];
    const people = getUsers();
    const live = people.filter(user => getVoiceInfo(user.id)).length;

    const store = getStoreState();
    rows.push({
        title: T.healthListTitle,
        level: store === "ready" ? "good" : store === "loading" ? "waiting" : "bad",
        detail: store === "ready"
            ? T.statusStoreLoaded(people.length, live)
            : store === "loading" ? T.statusStoreLoading : T.statusListLostLine
    });

    const reach = getHotkeyReach();
    const combo = formatHotkey(parseHotkey(settings.store.hotkey || DEFAULT_HOTKEY));
    rows.push({
        title: T.healthHotkeyTitle,
        level: isHotkeyReachSettled(reach) ? "good" : "waiting",
        detail: `${combo}. ${T.statusHotkey[reach]}`
    });

    const style = settings.store.notifyStyle;
    const usesSystemNotifications = style !== "toast";
    const permission = usesSystemNotifications && typeof Notification !== "undefined"
        ? Notification.permission
        : "granted";
    const styleLabel = style === "toast"
        ? T.notifyStyleToast
        : style === "both" ? T.notifyStyleBoth : T.notifyStyleNotification;

    const { startedAt, lastEventAt, lastNotifyAt, announced } = getTrackerStats();

    rows.push({
        title: T.healthNotifyTitle,
        level: permission === "denied" ? "bad" : permission === "granted" ? "good" : "waiting",
        detail: [
            !usesSystemNotifications
                ? T.healthNotifyToastOnly
                : permission === "denied"
                    ? T.healthNotifyDenied
                    : permission === "granted" ? T.healthNotifyReady : T.healthNotifyAsk,
            T.healthNotifyStyle(styleLabel),
            lastNotifyAt
                ? T.healthNotifyLast(announced, formatRelativeTime(lastNotifyAt))
                : T.healthNotifyNone
        ].join(" ")
    });

    const timers = getTimersState();
    rows.push({
        title: T.healthTimersTitle,
        level: timers === "awake" || timers === "off"
            ? "good"
            : timers === "refused" ? "bad" : "waiting",
        detail: T.healthTimers[timers]
    });

    const coverage = getVoiceCoverage();
    const since = lastEventAt || startedAt;
    const quiet = since > 0 && Date.now() - since > QUIET_TOO_LONG_MS;
    rows.push({
        title: T.healthVoiceTitle,
        level: coverage.guilds && !quiet ? "good" : "waiting",
        detail: !coverage.guilds
            ? T.healthVoiceNone
            : lastEventAt
                ? T.healthVoiceLine(coverage.guilds, coverage.states, formatRelativeTime(lastEventAt))
                : T.healthVoiceQuiet(coverage.guilds, coverage.states)
    });

    rows.push({
        title: T.healthBuildTitle,
        level: "good",
        detail: discordBuild() ?? T.healthBuildUnknown
    });

    return rows;
}

function Section({ title, rows }: { title: string; rows: Row[]; }) {
    return (
        <>
            <div className={cl("health-group")}>{title}</div>
            {rows.map(row => (
                <div key={row.title} className={cl("health-row")}>
                    <span className={cl("status-dot-small") + " " + cl("status-" + row.level)} />
                    <div>
                        <div className={cl("health-name")}>{row.title}</div>
                        <div className={cl("health-detail")}>{row.detail}</div>
                    </div>
                </div>
            ))}
        </>
    );
}

function HealthPage({ embedded, onClose }: { embedded: boolean; onClose: () => void; }) {
    const forceUpdate = useForceUpdater();

    useEffect(() => {
        const interval = setInterval(forceUpdate, LIVE_REFRESH_MS);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <WindowHead
                embedded={embedded}
                onClose={onClose}
                leading={<div className={cl("head-icon")}><RadarIcon size={22} /></div>}
                title={T.healthTitle}
            />

            <div className={cl("window-body")}>
                <div className={cl("health")}>
                    <Section title={T.healthGroupFeatures} rows={featureSection()} />
                    <Section title={T.healthGroupAround} rows={environmentSection()} />
                </div>
            </div>
        </>
    );
}

export function openHealthModal() {
    refreshApiHealth();

    openWindow(HEALTH_WINDOW, {
        label: T.healthTitle,
        size: "lg",
        render: (close, embedded) => <HealthPage embedded={embedded} onClose={close} />
    });
}
