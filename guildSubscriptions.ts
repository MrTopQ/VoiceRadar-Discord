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

import { findStoreLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildChannelStore, GuildStore } from "@webpack/common";

import { type ApiHealth, clearReported, HealthReport, isFn, reportBroken } from "./apiHealth";
import { getVoiceInfo } from "./channels";
import { T } from "./i18n";
import { getWatchedServerLimit } from "./settings";
import { getUsers } from "./store";

/** Discord only sends voice states for servers it is subscribed to, so the plugin subscribes to them. */
const REFRESH_MS = 15 * 60_000;

const WATCHDOG_MS = 60_000;

/** Kept well under the gateway limit of about two commands a second. */
const SPACING_MS = 1200;

/** The client sends everything queued in one task as a single bulk command. */
const SERVERS_PER_BULK_STEP = 10;

const watchedServerLimit = () => getWatchedServerLimit();

const MIN_PASS_GAP_MS = 60_000;

/** Lets the client resubscribe its own server first. */
const AFTER_RECONNECT_MS = 5000;

/** Discord is busiest while logging in, so the first pass waits. */
const FIRST_PASS_DELAY_MS = 12_000;

/** A shorter wait when Discord is already logged in, such as after a reload. */
const FIRST_PASS_AFTER_LOGIN_MS = 3000;

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let firstPassTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

/** Lets a pass that is still running notice that the plugin was stopped. */
let sessionGeneration = 0;

const watched = new Set<string>();

const GuildSubscriptionsStore = findStoreLazy("GuildSubscriptionsStore");

const GatewayConnectionStore = findStoreLazy("GatewayConnectionStore");

function gatewaySocket(): any {
    try {
        return (GatewayConnectionStore as any)?.getSocket?.() ?? null;
    } catch {
        return null;
    }
}

function clientSendsInBulk(): boolean {
    return typeof gatewaySocket()?.updateGuildSubscriptions === "function";
}

/** While logging in the client marks servers as watched but drops the command. */
function stillLoggingIn(): boolean {
    const socket = gatewaySocket();
    if (typeof socket?.isSessionEstablished !== "function") return false;

    try {
        return socket.isSessionEstablished() !== true;
    } catch {
        return false;
    }
}

function alreadyWatching(guildId: string): boolean {
    try {
        if (!canTellSubscribed()) return false;
        return (GuildSubscriptionsStore as any).isSubscribedToThreads(guildId) === true;
    } catch {
        return false;
    }
}

function canTellSubscribed(): boolean {
    try {
        return typeof (GuildSubscriptionsStore as any)?.isSubscribedToThreads === "function";
    } catch {
        return false;
    }
}

export function subscriptionProblems(): ApiHealth {
    return new HealthReport()
        .nice(canTellSubscribed, T.apiGuildSubscriptions)
        .nice(() => isFn((GuildStore as any)?.getGuildIds), T.apiServerList);
}

let lastRun: { guilds: number; mine: number; skipped: number; capped: number; at: number; } | null = null;

let progress: { done: number; total: number; } | null = null;

const progressListeners = new Set<() => void>();

export function subscribeToSubscriptionProgress(listener: () => void): () => void {
    progressListeners.add(listener);
    return () => progressListeners.delete(listener);
}

function reportProgress() {
    for (const listener of progressListeners) {
        try {
            listener();
        } catch (error) {
            console.warn("[VoiceRadar-Discord] a progress listener threw:", error);
        }
    }
}

export function getSubscriptionStatus() {
    return lastRun;
}

/** Whether Discord keeps sending this server's voice changes, so somebody missing from it has really left. */
export function isWatchingVoiceOf(guildId: string): boolean {
    if (!lastRun) return false;
    return canTellSubscribed() ? alreadyWatching(guildId) : watched.has(guildId);
}

export function isSubscriptionGuarded(): boolean {
    return canTellSubscribed();
}

export function getSubscriptionProgress(): { done: number; total: number; } | null {
    return progress;
}

function hasVoiceChannels(guildId: string): boolean {
    try {
        const vocal = (GuildChannelStore as any)?.getChannels?.(guildId)?.VOCAL;
        if (!Array.isArray(vocal)) return true;
        return vocal.length > 0;
    } catch {
        // Watching one server too many beats missing one.
        return true;
    }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function guildsWorthWatching(): { list: string[]; mine: number; skipped: number; capped: number; } {
    const seenIn = new Set<string>();

    for (const user of getUsers()) {
        const channelId = getVoiceInfo(user.id)?.channelId ?? user.lastChannelId;
        const guildId = channelId ? (ChannelStore.getChannel(channelId) as any)?.guild_id : null;
        if (guildId && GuildStore.getGuild(guildId)) seenIn.add(guildId);
    }

    let mine: string[] = [];
    try {
        const ids = GuildStore.getGuildIds();

        if (!Array.isArray(ids)) throw new TypeError("getGuildIds did not answer with an array");

        mine = ids;
        clearReported(T.apiServerList);
    } catch (error) {
        console.warn(
            "[VoiceRadar-Discord] could not read the list of your servers, so only the ones your"
            + " people were last seen in are watched:",
            error
        );
        reportBroken(T.apiServerList);
    }

    const rest = mine.filter(guildId => !seenIn.has(guildId) && hasVoiceChannels(guildId));
    const skipped = mine.length - seenIn.size - rest.length;
    const worth = [...seenIn, ...rest];
    const list = worth.slice(0, watchedServerLimit());

    return {
        list,
        mine: mine.length,
        skipped: Math.max(0, skipped),
        capped: worth.length - list.length
    };
}

let lastPassStartedAt = 0;

/** Set when no subscription stuck, which means Discord renamed the action. */
let actionLooksDead = false;

const DEAD_ACTION_EVIDENCE = 5;

async function refresh(force = false) {
    if (running) return;
    if (!force && Date.now() - lastPassStartedAt < MIN_PASS_GAP_MS) return;
    if (stillLoggingIn()) return;

    const generation = sessionGeneration;
    const stillOurs = () => generation === sessionGeneration;

    running = true;
    lastPassStartedAt = Date.now();

    try {
        const { list: wanted, mine, skipped, capped } = guildsWorthWatching();
        progress = { done: 0, total: wanted.length };

        const stillWanted = new Set(wanted);
        for (const guildId of watched) {
            if (!stillWanted.has(guildId)) watched.delete(guildId);
        }

        let asked = 0;
        let landed = 0;

        const perStep = clientSendsInBulk() ? SERVERS_PER_BULK_STEP : 1;
        let step: string[] = [];

        const settle = async () => {
            reportProgress();
            await wait(SPACING_MS);
            landed += step.filter(alreadyWatching).length;
            step = [];
        };

        for (const guildId of wanted) {
            if (!stillOurs()) return;

            progress.done++;

            watched.add(guildId);

            if (alreadyWatching(guildId)) continue;

            try {
                FluxDispatcher.dispatch({ type: "GUILD_SUBSCRIPTIONS", guildId } as any);
                asked++;
                step.push(guildId);
            } catch (error) {
                console.warn("[VoiceRadar-Discord] could not subscribe to a server:", guildId, error);
            }

            if (step.length < perStep) continue;

            await settle();
            if (!stillOurs()) return;
        }

        if (step.length) {
            await settle();
            if (!stillOurs()) return;
        }

        if (!stillOurs()) return;

        judgeTheAction(asked, landed);
        lastRun = { guilds: wanted.length, mine, skipped, capped, at: Date.now() };
    } finally {
        progress = null;
        running = false;
        reportProgress();
    }
}

function judgeTheAction(asked: number, landed: number) {
    if (!canTellSubscribed()) return;

    if (landed > 0) {
        actionLooksDead = false;
        clearReported(T.apiGuildSubscriptionAction);
        return;
    }

    if (asked < DEAD_ACTION_EVIDENCE) return;

    if (!actionLooksDead) {
        console.warn(
            `[VoiceRadar-Discord] asked ${asked} servers for voice states and none of them stuck, so`
            + " a Discord update probably renamed the action. Not asking again until something lands."
        );
    }

    actionLooksDead = true;
    reportBroken(T.apiGuildSubscriptionAction);
}

function serverListHasGrown(): boolean {
    if (!lastRun) return false;

    try {
        const ids = GuildStore.getGuildIds();
        return Array.isArray(ids) && ids.length > lastRun.mine;
    } catch {
        return false;
    }
}

function watchdog() {
    if (running || !canTellSubscribed()) return;

    if (actionLooksDead) return;

    if (serverListHasGrown()) {
        console.log("[VoiceRadar-Discord] more servers have loaded since the last pass, asking again");
        void refresh();
        return;
    }

    if (watched.size === 0) return;

    if (lastRun && Date.now() - lastRun.at < WATCHDOG_MS * 2) return;

    for (const guildId of watched) {
        if (alreadyWatching(guildId)) continue;

        console.log("[VoiceRadar-Discord] the subscriptions were dropped, taking them again");
        void refresh();
        return;
    }
}

/** Stop adding passes while the connection keeps dropping. */
const CHURN_WINDOW_MS = 5 * 60_000;
const CHURN_LIMIT = 3;
let recentChurn: number[] = [];

function clientIsThrashing(): boolean {
    const now = Date.now();

    recentChurn = recentChurn.filter(at => now - at < CHURN_WINDOW_MS);
    recentChurn.push(now);

    if (recentChurn.length <= CHURN_LIMIT) return false;

    console.warn(
        "[VoiceRadar-Discord] the client keeps dropping and retaking its subscriptions, so this pass"
        + " is being left out rather than adding to it. The slow timer will pick it up."
    );
    return true;
}

function onConnectionOpen() {
    if (clientIsThrashing()) return;
    setTimeout(() => void refresh(), AFTER_RECONNECT_MS);
}

/** Going idle drops every subscription, so they are taken again. */
const AFTER_IDLE_MS = 3000;

function onIdle(event: any) {
    if (!event?.idle) return;
    if (clientIsThrashing()) return;

    setTimeout(() => void refresh(), AFTER_IDLE_MS);
}

export function startGuildSubscriptions() {
    stopGuildSubscriptions();

    firstPassTimer = setTimeout(() => void refresh(true), stillLoggingIn() ? FIRST_PASS_DELAY_MS : FIRST_PASS_AFTER_LOGIN_MS);
    refreshTimer = setInterval(() => void refresh(), REFRESH_MS);
    watchdogTimer = setInterval(watchdog, WATCHDOG_MS);
    FluxDispatcher.subscribe("CONNECTION_OPEN", onConnectionOpen);
    FluxDispatcher.subscribe("IDLE", onIdle);
}

export function stopGuildSubscriptions() {
    sessionGeneration++;

    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }

    if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
    }

    if (firstPassTimer) {
        clearTimeout(firstPassTimer);
        firstPassTimer = null;
    }

    watched.clear();
    actionLooksDead = false;
    lastPassStartedAt = 0;
    recentChurn = [];

    lastRun = null;

    FluxDispatcher.unsubscribe("CONNECTION_OPEN", onConnectionOpen);
    FluxDispatcher.unsubscribe("IDLE", onIdle);
}

export function refreshGuildSubscriptions() {
    void refresh();
}
