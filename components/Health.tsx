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
import { closeModal, Modal, openModal, useEffect } from "@webpack/common";

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

const MODAL_KEY = "voice-radar-health";

/**
 * Which Discord this is, for the day something here stops working and the answer is "they changed it".
 * Every piece of it is optional, since none of the plugin leans on any of it.
 */
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

/** How long the voice picture may sit still before it is worth a colour. See the row that uses it. */
const QUIET_TOO_LONG_MS = 15 * 60_000;

/**
 * How often the page is redrawn while it is open.
 *
 * Everything here was read once and then stood still for as long as somebody looked at it, which is
 * the wrong behaviour for the one page whose whole job is to say what is true now. The subscription
 * row is the plainest case: a pass steps a server every SPACING_MS and runs for a couple of minutes,
 * so "asking server 12 of 100" was a number frozen at the moment the window opened.
 *
 * Paced against that step rather than against the eye, so the count is seen moving. Nothing on this
 * tick asks Discord anything. The probes are the expensive half and they stay where they were, on
 * opening the window, which is the moment somebody actually asked. See refreshApiHealth.
 */
const LIVE_REFRESH_MS = 2000;

type Level = FeatureLevel;

interface Row {
    title: string;
    detail: string;
    level: Level;
}

/**
 * Whether Discord still has what each feature is built on.
 *
 * One row per feature rather than one row for the whole pile, because "18 parts checked" answers a
 * question nobody has. The question is which of the things the plugin offers still work after an
 * update, and only a list of them can answer it. The mapping itself lives in features.ts.
 */
function featureSection(): Row[] {
    /*
     * Asking servers to keep sending voice states is a feature like any other, but it is the one
     * with live numbers behind it, so it is built here rather than in the generic list. It belongs
     * next to the three rows about reading people, since it is what makes those three see anything
     * outside the servers you happen to have open, and it is found by name so that reordering the
     * list in features.ts cannot quietly move it somewhere that makes no sense.
     */
    const rows = featureRows();
    const after = rows.findIndex(row => row.title === T.healthPresenceTitle);

    rows.splice(after < 0 ? rows.length : after + 1, 0, serversRow());

    return rows;
}

/**
 * The one feature whose answer is a running count rather than a yes or no. A probe can say the
 * question is still askable, and only the pass itself can say how many servers it got round.
 */
function serversRow(): Row {
    const progress = getSubscriptionProgress();
    const subscriptions = getSubscriptionStatus();
    /*
     * Read the same way every other feature is, out of the shared report, rather than by probing
     * this one module again. The probes answer "is the question still askable", and the third label
     * here is the one no probe can reach, where the request goes out, nothing comes of it, and only the
     * pass that watched it land can say so. Asking the module directly skipped exactly that one.
     */
    const { broken, degraded } = getApiHealth();
    const subscriptionIssues = [T.apiGuildSubscriptions, T.apiServerList, T.apiGuildSubscriptionAction]
        .filter(part => broken.includes(part) || degraded.includes(part));
    const subscriptionBroken = subscriptionIssues.length > 0;
    /**
     * Servers with voice channels that the limit left out. This is the only thing here that turns
     * into "he joined and nothing happened", so it is worth a colour of its own rather than a line
     * somebody has to read to the end.
     */
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

/**
 * What the plugin runs inside, which no probe can move but which decides just as much.
 *
 * Deliberately kept apart from the features above. These are answers about the machine and about
 * this session, and a reader looking for "did an update break something" should not have to sort
 * them out of that list.
 */
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
        // green only when the hotkey reaches as far as it was asked to. A refused system wide claim
        // used to land in the same branch as never having asked for one
        level: isHotkeyReachSettled(reach) ? "good" : "waiting",
        detail: `${combo}. ${T.statusHotkey[reach]}`
    });

    /*
     * The one thing here that is nobody's bug. A notification Windows or Discord refused to grant
     * simply never appears, and there is nothing in the plugin to see it in.
     *
     * Only worth asking about at all when corner notifications are what you picked. Toasts are
     * drawn by Discord inside its own window and need no permission from anybody, so judging that
     * choice by an operating system prompt painted the row red and announced that nothing would
     * reach the reader, over a setting that was working exactly as asked.
     */
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
            // the count is the evidence that any of this actually fires, which no permission can be
            lastNotifyAt
                ? T.healthNotifyLast(announced, formatRelativeTime(lastNotifyAt))
                : T.healthNotifyNone
        ].join(" ")
    });

    /*
     * Four states rather than two. Switched off is a choice and reads green, being asked is a
     * moment, and the two failures want opposite things from the reader: one is fixed by a restart
     * and the other is the main process having refused, which a restart is not promised to cure.
     * Rolling all of it into one amber line told most of them to restart Discord for nothing.
     */
    const timers = getTimersState();
    rows.push({
        title: T.healthTimersTitle,
        level: timers === "awake" || timers === "off"
            ? "good"
            : timers === "refused" ? "bad" : "waiting",
        detail: T.healthTimers[timers]
    });

    /*
     * What the subscriptions above are actually worth. A server count is a promise, this is the answer,
     * and the time of the last update is the one line that says whether anything is still arriving.
     */
    const coverage = getVoiceCoverage();
    /*
     * Voice events arrive constantly while the client is holding voice for even a handful of servers,
     * since every mute, join and leave is one. A long silence with servers still on the books is what
     * subscriptions quietly going away looks like, and the line already says when the last one was.
     *
     * Measured from the start of the session when nothing has arrived at all, since a client that
     * has been running for an hour without a single voice event is the same fault, and reading
     * lastEventAt alone made that case look like a plugin that had only just started.
     */
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

function HealthModal({ modalProps }: { modalProps: any; }) {
    const forceUpdate = useForceUpdater();

    useEffect(() => {
        const interval = setInterval(forceUpdate, LIVE_REFRESH_MS);
        return () => clearInterval(interval);
    }, []);

    return (
        <Modal
            {...modalProps}
            size="lg"
            title={
                <span className={cl("header")}>
                    <RadarIcon size={18} />
                    {T.healthTitle}
                </span>
            }
        >
            <div className={cl("health")}>
                <Section title={T.healthGroupFeatures} rows={featureSection()} />
                <Section title={T.healthGroupAround} rows={environmentSection()} />
            </div>
        </Modal>
    );
}

const WrappedModal = ErrorBoundary.wrap(HealthModal, { noop: true });

export function openHealthModal() {
    // the startup answer was taken seconds after launch and never revisited. Somebody opening this
    // window is asking what is true now, which is the one moment worth paying for the probes again
    refreshApiHealth();

    closeModal(MODAL_KEY);
    openModal(modalProps => <WrappedModal modalProps={modalProps} />, { modalKey: MODAL_KEY });
}
