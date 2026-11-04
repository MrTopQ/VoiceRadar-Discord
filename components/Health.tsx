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
import { useEffect, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { getApiHealth, refreshApiHealth } from "../apiHealth";
import { getVoiceCoverage, getVoiceInfo } from "../channels";
import { type FeatureRow, featureRows, type HealthGroup, type HealthIcon } from "../features";
import { getHotkeyReach, getTimersState, isHotkeyReachSettled } from "../globalHotkey";
import { getSubscriptionProgress, getSubscriptionStatus, isSubscriptionGuarded } from "../guildSubscriptions";
import { formatHotkey, parseHotkey } from "../hotkey";
import { T } from "../i18n";
import { needsFullRestart } from "../mainProcess";
import { askToRestartDiscord } from "../restart";
import { ALERT_OFF, CUSTOM_SOUND, DEFAULT_HOTKEY, getJoinAlert, settings } from "../settings";
import { getStoreState, getUsers } from "../store";
import { formatRelativeTime } from "../time";
import { getTrackerStats } from "../tracker";
import { cl } from "./common";
import {
    AlertIcon, BellIcon, BulbIcon, CardIcon, CheckCircleIcon, ChipIcon, ClockIcon, DatabaseIcon, GearIcon, GlobeIcon, JoinIcon, KeyboardIcon, ListIcon, LockIcon, MessageIcon, MicIcon, MicOffIcon, MusicIcon, PanelIcon,
    PeopleIcon, PlatformIcon, PullIcon, PulseIcon, RadarIcon, RefreshIcon, RouteIcon, ServerIcon, ShieldIcon,
    SpeakerIcon, StreamIcon, TargetIcon, WindowIcon
} from "./icons";
import { openPluginSettings, type SettingKey } from "./pluginSettings";
import { openWindow, WindowHead } from "./Window";

const HEALTH_WINDOW = "health";

const QUIET_TOO_LONG_MS = 15 * 60_000;

const LIVE_REFRESH_MS = 2000;

const ROW_ICON_SIZE = 17;
const GROUP_ICON_SIZE = 14;
const SUMMARY_ICON_SIZE = 28;

const GROUPS: { id: HealthGroup; icon: HealthIcon; }[] = [
    { id: "voice", icon: "voice" },
    { id: "people", icon: "people" },
    { id: "join", icon: "join" },
    { id: "windows", icon: "window" },
    { id: "moderation", icon: "shield" },
    { id: "alerts", icon: "bell" },
    { id: "system", icon: "chip" }
];

const ICONS: Record<HealthIcon, (size: number) => ReactNode> = {
    voice: size => <SpeakerIcon size={size} />,
    route: size => <RouteIcon size={size} />,
    servers: size => <ServerIcon size={size} />,
    mic: size => <MicIcon size={size} />,
    stream: size => <StreamIcon size={size} />,
    pulse: size => <PulseIcon size={size} />,
    people: size => <PeopleIcon size={size} />,
    devices: size => <PlatformIcon platform="desktop" size={size} />,
    join: size => <JoinIcon size={size} />,
    micOff: size => <MicOffIcon size={size} />,
    target: size => <TargetIcon size={size} />,
    lock: size => <LockIcon size={size} />,
    menu: size => <ListIcon size={size} />,
    radar: size => <RadarIcon size={size} />,
    window: size => <WindowIcon size={size} />,
    panel: size => <PanelIcon size={size} />,
    globe: size => <GlobeIcon size={size} />,
    shield: size => <ShieldIcon size={size} />,
    pull: size => <PullIcon size={size} />,
    card: size => <CardIcon size={size} />,
    music: size => <MusicIcon size={size} />,
    message: size => <MessageIcon size={size} />,
    bell: size => <BellIcon size={size} />,
    database: size => <DatabaseIcon size={size} />,
    chip: size => <ChipIcon size={size} />,
    keyboard: size => <KeyboardIcon size={size} />,
    clock: size => <ClockIcon size={size} />,
    alert: size => <AlertIcon size={size} />
};

interface Row extends FeatureRow {
    setting?: SettingKey;
    action?: { label: string; onClick: () => void; };
}

type Pill = "good" | "off" | "pending" | "waiting" | "bad";

const pillOf = (row: Row): Pill => row.off ? "off" : row.level;

/** Broken, half working, or waiting on something only the user can do. */
const needsLook = (row: Row) => row.level === "bad" || row.level === "waiting" || row.action != null;

const restartAction = () => ({ label: T.restartButton, onClick: askToRestartDiscord });

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
        icon: "servers",
        group: "voice",
        level: subscriptionBroken || capped ? "waiting" : subscriptions ? "good" : "pending",
        fix: subscriptionBroken ? T.healthFixUpdate : capped ? T.healthFixServersCapped : undefined,
        setting: !subscriptionBroken && capped ? "watchedServerLimit" : undefined,
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

function voiceDataRow(): Row {
    const { startedAt, lastEventAt } = getTrackerStats();
    const coverage = getVoiceCoverage();
    const since = lastEventAt || startedAt;
    const quiet = since > 0 && Date.now() - since > QUIET_TOO_LONG_MS;
    const level = coverage.guilds && !quiet ? "good" : !coverage.guilds && !getSubscriptionStatus() ? "pending" : "waiting";

    return {
        title: T.healthVoiceTitle,
        icon: "pulse",
        group: "voice",
        level,
        detail: !coverage.guilds
            ? T.healthVoiceNone
            : lastEventAt
                ? T.healthVoiceLine(coverage.guilds, coverage.states, formatRelativeTime(lastEventAt))
                : T.healthVoiceQuiet(coverage.guilds, coverage.states),
        fix: level === "waiting" ? T.healthFixVoiceQuiet : undefined
    };
}

function notifyRow(): Row {
    const style = getJoinAlert();
    const usesSystemNotifications = style !== ALERT_OFF;
    const permission = usesSystemNotifications && typeof Notification !== "undefined"
        ? Notification.permission
        : "granted";
    const styleLabel = style === ALERT_OFF ? T.joinAlertOff : style === CUSTOM_SOUND ? T.joinAlertCustom : T.joinAlertChime;
    const { lastNotifyAt, announced } = getTrackerStats();
    const denied = permission === "denied";

    return {
        title: T.healthNotifyTitle,
        icon: "bell",
        group: "alerts",
        level: denied ? "bad" : permission === "granted" ? "good" : "pending",
        detail: [
            !usesSystemNotifications
                ? T.healthNotifyToastOnly
                : denied
                    ? T.healthNotifyDenied
                    : permission === "granted" ? T.healthNotifyReady : T.healthNotifyAsk,
            T.healthNotifyStyle(styleLabel),
            lastNotifyAt
                ? T.healthNotifyLast(announced, formatRelativeTime(lastNotifyAt))
                : T.healthNotifyNone
        ].join(" "),
        fix: denied ? T.healthFixNotifyDenied : undefined,
        setting: denied ? "joinAlert" : undefined
    };
}

function listRow(): Row {
    const people = getUsers();
    const live = people.filter(user => getVoiceInfo(user.id)).length;
    const store = getStoreState();
    const lost = store !== "ready" && store !== "loading";

    return {
        title: T.healthListTitle,
        icon: "database",
        group: "system",
        level: store === "ready" ? "good" : store === "loading" ? "pending" : "bad",
        detail: store === "ready"
            ? T.statusStoreLoaded(people.length, live)
            : store === "loading" ? T.statusStoreLoading : T.statusListLostLine,
        fix: lost ? T.healthFixListLost : undefined,
        action: lost ? restartAction() : undefined
    };
}

function mainProcessRow(): Row | null {
    if (typeof IS_DISCORD_DESKTOP === "undefined" || !IS_DISCORD_DESKTOP) return null;

    const missing = needsFullRestart();
    return {
        title: T.healthMainProcessTitle,
        icon: "chip",
        group: "system",
        level: missing ? "pending" : "good",
        detail: missing ? T.healthMainProcessMissing : T.healthMainProcessOk,
        action: missing ? restartAction() : undefined
    };
}

function hotkeyRow(): Row {
    const reach = getHotkeyReach();
    const combo = formatHotkey(parseHotkey(settings.store.hotkey || DEFAULT_HOTKEY));
    const level = isHotkeyReachSettled(reach) ? "good" : reach === "asking" || reach === "needs-restart" ? "pending" : "waiting";

    return {
        title: T.healthHotkeyTitle,
        icon: "keyboard",
        group: "system",
        level,
        detail: `${combo}. ${T.statusHotkey[reach]}`,
        setting: level === "waiting" ? "hotkey" : undefined
    };
}

function timersRow(): Row {
    const timers = getTimersState();

    return {
        title: T.healthTimersTitle,
        icon: "clock",
        group: "system",
        level: timers === "awake" || timers === "off" ? "good" : timers === "refused" ? "bad" : "pending",
        detail: T.healthTimers[timers],
        action: timers === "refused" ? restartAction() : undefined
    };
}

function healthRows(): Row[] {
    const mainProcess = mainProcessRow();

    return [
        ...featureRows(),
        serversRow(),
        voiceDataRow(),
        notifyRow(),
        listRow(),
        ...(mainProcess ? [mainProcess] : []),
        hotkeyRow(),
        timersRow()
    ];
}

function Summary({ rows }: { rows: Row[]; }) {
    const count = (pill: Pill) => rows.filter(row => pillOf(row) === pill).length;
    const counts = { good: count("good"), off: count("off"), pending: count("pending"), waiting: count("waiting"), bad: count("bad") };
    const issues = rows.filter(needsLook).length;

    const tone = issues ? (counts.bad ? "bad" : "waiting") : counts.pending ? "pending" : "good";
    const title = issues ? T.healthSummaryIssues(issues) : counts.pending ? T.healthSummaryStarting : T.healthSummaryGood;
    const icon = issues
        ? <AlertIcon size={SUMMARY_ICON_SIZE} />
        : counts.pending ? <ClockIcon size={SUMMARY_ICON_SIZE} /> : <CheckCircleIcon size={SUMMARY_ICON_SIZE} />;
    const build = discordBuild();

    return (
        <div className={cl("health-summary") + " " + cl("health-tone-" + tone)}>
            <span className={cl("health-summary-icon")}>{icon}</span>
            <div className={cl("health-text")}>
                <div className={cl("health-summary-title")}>{title}</div>
                <div className={cl("health-detail")}>{T.healthSummaryCounts(counts)}</div>
            </div>
            {build && <div className={cl("health-summary-meta")}>{build}</div>}
        </div>
    );
}

function Remedy({ row }: { row: Row; }) {
    const { fix, setting, action } = row;

    return (
        <>
            {fix && (
                <div className={cl("health-fix")}>
                    <BulbIcon />
                    <span>{fix}</span>
                </div>
            )}
            {(action || setting) && (
                <div className={cl("health-buttons")}>
                    {action && (
                        <button className={cl("chip") + " " + cl("confirm-go")} onClick={action.onClick}>
                            {action.label}
                        </button>
                    )}
                    {setting && (
                        <button className={cl("chip")} onClick={() => openPluginSettings(setting)}>
                            <GearIcon />
                            {T.healthOpenSetting}
                        </button>
                    )}
                </div>
            )}
        </>
    );
}

function HealthCard({ row, open }: { row: Row; open?: boolean; }) {
    const pill = pillOf(row);

    return (
        <div className={cl("health-card") + " " + cl("health-card-" + pill)}>
            <span className={cl("health-icon")}>{ICONS[row.icon](ROW_ICON_SIZE)}</span>
            <div className={cl("health-text")}>
                <div className={cl("health-name")}>{row.title}</div>
                <div className={cl("health-detail")}>{row.detail}</div>
                {open && <Remedy row={row} />}
            </div>
            <span className={cl("health-pill") + " " + cl("health-pill-" + pill)}>{T.healthPill[pill]}</span>
        </div>
    );
}

function GroupHead({ icon, title, count }: { icon: HealthIcon; title: string; count?: string; }) {
    return (
        <div className={cl("health-group")}>
            {ICONS[icon](GROUP_ICON_SIZE)}
            <span>{title}</span>
            {count && <span className={cl("health-group-count")}>{count}</span>}
        </div>
    );
}

/** Problems sit in their own block at the top, so a group lists only the rest but counts them all. */
function GroupSection({ group, rows }: { group: typeof GROUPS[number]; rows: Row[]; }) {
    const all = rows.filter(row => row.group === group.id);
    const calm = all.filter(row => !needsLook(row));
    if (!calm.length) return null;

    const working = all.filter(row => row.level === "good").length;

    return (
        <section className={cl("health-section")}>
            <GroupHead icon={group.icon} title={T.healthGroups[group.id]} count={T.healthGroupCount(working, all.length)} />
            {calm.map(row => <HealthCard key={row.title} row={row} />)}
        </section>
    );
}

function HealthPage({ embedded, onClose }: { embedded: boolean; onClose: () => void; }) {
    const forceUpdate = useForceUpdater();
    const [checkedAt, setCheckedAt] = useState(Date.now);

    useEffect(() => {
        const interval = setInterval(forceUpdate, LIVE_REFRESH_MS);
        return () => clearInterval(interval);
    }, []);

    const recheck = () => {
        refreshApiHealth();
        setCheckedAt(Date.now());
    };

    const rows = healthRows();
    const problems = rows.filter(needsLook);

    return (
        <>
            <WindowHead
                embedded={embedded}
                onClose={onClose}
                leading={<div className={cl("head-icon")}><RadarIcon size={22} /></div>}
                title={T.healthTitle}
                trailing={
                    <div className={cl("health-recheck")}>
                        <span className={cl("health-checked")}>{T.healthChecked(formatRelativeTime(checkedAt))}</span>
                        <button className={cl("chip")} onClick={recheck}>
                            <RefreshIcon />
                            {T.healthRecheck}
                        </button>
                    </div>
                }
            />

            <div className={cl("window-body")}>
                <div className={cl("health")}>
                    <Summary rows={rows} />

                    {problems.length > 0 && (
                        <section className={cl("health-section") + " " + cl("health-attention")}>
                            <GroupHead icon="alert" title={T.healthAttention} />
                            {problems.map(row => <HealthCard key={row.title} row={row} open />)}
                        </section>
                    )}

                    {GROUPS.map(group => <GroupSection key={group.id} group={group} rows={rows} />)}
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
