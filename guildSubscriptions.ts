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

/**
 * Discord only holds the voice states of servers the client is subscribed to, and it subscribes to a
 * server when you open it. Everything else is dropped, which is why somebody sitting in a server you
 * have not visited this session reads as "not in voice" and never sets off a notification.
 *
 * Its own store answers a plain flux action for exactly this, `GUILD_SUBSCRIPTIONS: e =>
 * subscribeToGuild(e.guildId)`, so this asks for the same thing the client asks for on your behalf
 * when you click a server. Nothing is invented here, it is the client's own path.
 *
 * The subscriptions do not last. Going idle or losing the connection makes the client drop every one
 * of them except the server you are looking at, so they are taken again at exactly those two moments.
 * The timer below is only a backstop for a third case nobody has thought of, which is why it is slow.
 *
 * Every server you are in is asked for, rather than only the ones your people are known to sit in.
 * Working out the second list means asking Discord which servers you share with each person, and a
 * list built that way can be wrong in the one direction that matters. A person who joins a server
 * the plugin never learned about goes unnoticed, which is the exact failure this file exists to
 * prevent. Watching a few servers too many costs a stream of typing events nobody reads. Watching
 * one too few costs the notification you installed this for.
 */
const REFRESH_MS = 15 * 60_000;

/**
 * How often the subscriptions are checked rather than assumed.
 *
 * The two events above are what the client does today. A watchdog that reads the client's own answer
 * needs no such knowledge, so a third way of dropping subscriptions, or a renamed event, costs a
 * minute of blindness instead of everything. It reads a store and sends nothing.
 */
const WATCHDOG_MS = 60_000;

/**
 * One dispatch per server, spaced well under the gateway's budget of roughly two commands a second.
 *
 * The client collects subscriptions and sends them in batches, so the real number of commands is
 * lower than the number of dispatches, but that is its business and not a promise. Going over the
 * budget is answered with a disconnect, and a plugin that drops your connection to watch a list is
 * worse than one that takes half a minute about it.
 *
 * Deliberately not sitting just under the ceiling either. The budget is shared with everything the
 * client itself sends, and a pass that fills it on its own leaves nothing for the client's own
 * traffic at the exact moment it is busiest, which is right after a reconnect.
 */
const SPACING_MS = 1200;

/**
 * The stop for somebody who is in a lot of servers, and a setting rather than a number here, because
 * the cost of getting it wrong is asymmetric.
 *
 * Too high and the client holds more subscriptions than it would on its own. Too low and a server
 * past the cut is one the plugin cannot see into at all, so somebody joining voice there is invisible,
 * no notification fires, and nothing says why. The order below puts the servers your people were
 * last seen in first, so the limit only ever decides what happens after those, and the window says
 * out loud how many did not fit.
 */
const watchedServerLimit = () => getWatchedServerLimit();

/**
 * The floor under how often a pass may start, whatever asked for it.
 *
 * Three things ask, the slow timer, a reconnect, and going idle. Only the timer is rare. IDLE fires
 * every time the screen locks or you walk away, and a reconnect is a reconnect, so a bad afternoon
 * used to mean a full pass every few minutes, each one a burst of gateway commands. Worse, a pass
 * that itself provoked the disconnect would be started again by that very disconnect.
 */
const MIN_PASS_GAP_MS = 60_000;

/**
 * A reconnect arrives before the client has re-subscribed to the server you are looking at, and
 * piling our own on top of that is the worst possible moment. This lets it settle first.
 */
const AFTER_RECONNECT_MS = 5000;

/**
 * The plugin starts while Discord is still logging in, which is the busiest the gateway ever is,
 * the client is identifying, catching up on every guild and subscribing to the one you had open.
 * Adding our own stream of commands to that is asking for the one thing worth avoiding, a refused
 * connection, and it buys nothing, because nobody is looking at the list a second after launch.
 *
 * Somebody added to the list before this fires still gets their server asked for straight away, so
 * the wait is only ever paid by a session nobody is using yet.
 */
const FIRST_PASS_DELAY_MS = 12_000;

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let firstPassTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

/**
 * Bumped every time the subscriptions are stopped, so a pass already under way can tell that it no
 * longer belongs to anybody.
 *
 * A pass is a chain of awaits that runs for as long as the server limit times the spacing, which at
 * the default is a couple of minutes, and the plugin can be switched off at any point inside one.
 * The timers below are cleared by stopping, but the loop is not, and it carried on dispatching to
 * the gateway, refilling the set stopping had just emptied, and writing what it managed, all on
 * behalf of a plugin that was no longer running.
 *
 * The second half is worse than the noise. `running` stayed true until that loop finished on its
 * own, and the first pass of a session started inside that window was refused by it and never
 * retried, so switching the plugin off and straight back on left it blind until the slow timer came
 * round a quarter of an hour later, the exact failure this file exists to prevent.
 */
let sessionGeneration = 0;

/**
 * What the last pass asked for, so the watchdog knows what should still be true.
 *
 * Rebuilt by every pass rather than added to, because the watchdog reads it as "these should be
 * subscribed right now". A server that has left the wanted list, because you left it, its voice
 * channels were deleted, or the limit was lowered past it, can never be subscribed again. Leaving
 * it in here made the watchdog find a permanently missing subscription and order a full pass every
 * couple of minutes, with a log line each time, for the rest of the session.
 */
const watched = new Set<string>();

/**
 * The store that answers the action below. Dispatching to nobody would fail in complete silence, and
 * the only visible symptom would be people in unvisited servers quietly staying invisible, which is
 * exactly the bug this whole file exists to fix.
 */
const GuildSubscriptionsStore = findStoreLazy("GuildSubscriptionsStore");

/**
 * Whether the client already holds this server, so the pass can skip it.
 *
 * subscribeToGuild takes typing, activities and threads together, so any one of them answers for all
 * three. Asking first turns the usual pass into nothing at all, and the burst of a fresh start into
 * the only time anything is sent. Not knowing the answer means sending, since a server watched twice
 * costs a message and a server watched never costs the notification.
 */
function alreadyWatching(guildId: string): boolean {
    try {
        if (!canTellSubscribed()) return false;
        return (GuildSubscriptionsStore as any).isSubscribedToThreads(guildId) === true;
    } catch {
        return false;
    }
}

/**
 * Whether the client can still be asked what it holds.
 *
 * The watchdog reads that answer, so it has to know the difference between "the subscriptions are
 * gone" and "the question is gone". Without this check a Discord update that renames the method would
 * turn a quiet minute of watching into a full pass every minute, forever.
 */
function canTellSubscribed(): boolean {
    try {
        return typeof (GuildSubscriptionsStore as any)?.isSubscribedToThreads === "function";
    } catch {
        return false;
    }
}

/**
 * Named in the window's warning banner when a Discord update has moved the store out from under us.
 *
 * Deliberately the same question canTellSubscribed asks, and not a different method on the same
 * store. Probing one name while the code calls another means the banner can be green while the
 * watchdog is blind, which is the one failure this whole file is here to prevent.
 */
export function subscriptionProblems(): ApiHealth {
    return new HealthReport()
        .nice(canTellSubscribed, T.apiGuildSubscriptions)
        /*
         * Degraded rather than broken, because the servers your people are already known to sit in
         * are still watched and the list itself is unaffected. What is lost is everything past
         * them, which is precisely the case the subscriptions exist for, so it has to be named
         * rather than left to be inferred from a server count that looks low.
         */
        .nice(() => isFn((GuildStore as any)?.getGuildIds), T.apiServerList);
}

/** What the last pass managed, so the window can show whether this is working at all. */
let lastRun: { guilds: number; mine: number; skipped: number; capped: number; at: number; } | null = null;

/** How far the current pass has got, so the window can say what it is busy with. */
let progress: { done: number; total: number; } | null = null;

export function getSubscriptionStatus() {
    return lastRun;
}

/** Whether the watchdog can still ask the client what it holds, which the window spells out. */
export function isSubscriptionGuarded(): boolean {
    return canTellSubscribed();
}

export function getSubscriptionProgress(): { done: number; total: number; } | null {
    return progress;
}

/**
 * A server with no voice channels can never hold anybody in voice, so it is not worth watching.
 *
 * "No answer" is not the same as "no voice channels", and treating it as one was quietly dropping
 * servers the store had simply not been asked about yet. Only a real, empty answer counts.
 */
function hasVoiceChannels(guildId: string): boolean {
    try {
        const vocal = (GuildChannelStore as any)?.getChannels?.(guildId)?.VOCAL;
        if (!Array.isArray(vocal)) return true;
        return vocal.length > 0;
    } catch {
        // the shape moved, and watching one server too many beats missing one
        return true;
    }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Every server you are in that has a voice channel, with the ones your people were last seen in first.
 *
 * The order only matters for somebody past the cap. Servers with no voice channel at all are left
 * out, since nobody can be in voice there.
 */
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

        // an answer of the wrong shape is the same problem as no answer, and the filter below would
        // throw on it and take the whole pass down with it
        if (!Array.isArray(ids)) throw new TypeError("getGuildIds did not answer with an array");

        mine = ids;
        // it answered, so whatever was said about it before is no longer true
        clearReported(T.apiServerList);
    } catch (error) {
        /*
         * The pass carries on with what the list already knows, but never in silence again.
         *
         * Without the full server list the only ones watched are those somebody has already been
         * seen in, so a person joining voice anywhere else goes unnoticed, the exact failure this
         * whole file exists to prevent. It used to be the one thing here that produced no banner,
         * no colour and no log line, so it looked like the plugin working on a short list rather
         * than like the list being gone.
         */
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
        // servers with voice channels that the limit left out, which is the one thing here that
        // turns into "he joined and nothing happened"
        capped: worth.length - list.length
    };
}

/** When the last pass started, which is what MIN_PASS_GAP_MS is measured from. */
let lastPassStartedAt = 0;

/**
 * Set when a pass asked for subscriptions and not one of them landed.
 *
 * The dispatch is fire and forget. Nothing comes back, so a renamed action would be answered by
 * silence, and the watchdog reads that silence as "the subscriptions were dropped" and asks again.
 * Every two minutes, forever, for nothing. This is the difference between not having them and not
 * being able to have them.
 */
let actionLooksDead = false;

/**
 * How many unanswered attempts it takes before the action is called dead.
 *
 * The client collects subscriptions and sends them in batches, so a single unconfirmed one means
 * nothing. Several in a row, each given the spacing below to land, is evidence. Being wrong here
 * costs the watchdog and nothing else, since the slow timer keeps trying either way.
 */
const DEAD_ACTION_EVIDENCE = 5;

/**
 * @param force only for the pass at startup and for somebody just added to the list. Both are a
 * person waiting for an answer, and neither can repeat on its own.
 */
async function refresh(force = false) {
    if (running) return;
    if (!force && Date.now() - lastPassStartedAt < MIN_PASS_GAP_MS) return;

    const generation = sessionGeneration;
    /** Whether this pass still belongs to a running plugin. See sessionGeneration. */
    const stillOurs = () => generation === sessionGeneration;

    running = true;
    lastPassStartedAt = Date.now();

    try {
        const { list: wanted, mine, skipped, capped } = guildsWorthWatching();
        progress = { done: 0, total: wanted.length };

        // whatever this pass no longer wants is no longer the watchdog's business. See `watched`
        const stillWanted = new Set(wanted);
        for (const guildId of watched) {
            if (!stillWanted.has(guildId)) watched.delete(guildId);
        }

        /** asked for, and of those, how many the client actually holds afterwards */
        let asked = 0;
        let landed = 0;

        for (const guildId of wanted) {
            // switched off while this pass was sitting out its spacing, so it stops where it is
            if (!stillOurs()) return;

            progress.done++;

            watched.add(guildId);

            // nothing to send and nothing to wait for, which is what most of a pass looks like
            if (alreadyWatching(guildId)) continue;

            try {
                FluxDispatcher.dispatch({ type: "GUILD_SUBSCRIPTIONS", guildId } as any);
                asked++;
            } catch (error) {
                console.warn("[VoiceRadar-Discord] could not subscribe to a server:", guildId, error);
            }

            await wait(SPACING_MS);

            if (!stillOurs()) return;

            // asked after the wait, which is the client's own batching window and then some
            if (alreadyWatching(guildId)) landed++;
        }

        // a verdict and a report about this session, so neither is filed against the next one
        if (!stillOurs()) return;

        judgeTheAction(asked, landed);
        lastRun = { guilds: wanted.length, mine, skipped, capped, at: Date.now() };
    } finally {
        /*
         * Cleared unconditionally, even by a pass that has been abandoned. The guard at the top is
         * what keeps two passes from overlapping, so whoever is in here owns both of these, and a
         * stale pass that left `running` set would lock the feature for the rest of the session.
         */
        progress = null;
        running = false;
    }
}

/**
 * Whether asking for subscriptions still does anything, judged by what the client holds afterwards
 * rather than by whether the dispatch threw.
 *
 * Only ever answered when the client can be asked at all. Without that question there is no evidence
 * either way, and calling the action dead on no evidence would switch the watchdog off for nothing.
 */
function judgeTheAction(asked: number, landed: number) {
    if (!canTellSubscribed()) return;

    if (landed > 0) {
        // something stuck, so whatever was said about this before is no longer true
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

/**
 * Whether the client knows about more servers now than the last pass managed to see.
 *
 * The first pass is timed rather than told, and a timer cannot know when the client has finished
 * digesting READY. On an account with a lot of servers the list is still filling at twelve seconds,
 * so the pass walked the handful it could see, in practice only the ones somebody had already been
 * seen in, wrote that down and finished. Nothing looked wrong, no error, no empty answer, just a
 * small number, and it stayed small until the slow timer came round a quarter of an hour later.
 *
 * Comparing what the store says now against what that pass saw costs one property read a minute and
 * turns those fifteen minutes into two. It doubles as the answer for joining a new server, which is
 * a new place people can be and until now was not looked at until the next slow tick either.
 */
function serverListHasGrown(): boolean {
    if (!lastRun) return false;

    try {
        const ids = GuildStore.getGuildIds();
        return Array.isArray(ids) && ids.length > lastRun.mine;
    } catch {
        // the store cannot be read, which the pass itself reports. Nothing to compare
        return false;
    }
}

/**
 * Notices that the subscriptions are gone, whatever took them, and takes them again.
 *
 * This is the answer to "what if Discord changes something". The events are the fast path and this is
 * the one that cannot be out of date, because it looks at what is true rather than at what happened.
 */
function watchdog() {
    if (running || !canTellSubscribed()) return;

    // asking again is the whole of what this does, and asking has been shown not to work. The slow
    // timer still tries, so a wrong verdict costs minutes rather than the feature
    if (actionLooksDead) return;

    /*
     * Checked before the subscription scan below, and deliberately ahead of the `watched` guard,
     * because a pass that ran too early leaves a short list behind and the scan has nothing to say
     * about servers no pass has ever looked at. A first pass that saw nothing at all leaves that
     * set empty, which used to mean the watchdog returned here forever.
     *
     * Not forced, because the floor inside refresh is what keeps a client that is still loading from being
     * walked once a minute, and two minutes is already the point of this.
     */
    if (serverListHasGrown()) {
        console.log("[VoiceRadar-Discord] more servers have loaded since the last pass, asking again");
        void refresh();
        return;
    }

    if (watched.size === 0) return;

    // a wrong answer costs a slow trickle rather than a full pass every minute. The gap inside
    // refresh covers this too, and this one keeps the log line below from repeating meanwhile
    if (lastRun && Date.now() - lastRun.at < WATCHDOG_MS * 2) return;

    for (const guildId of watched) {
        if (alreadyWatching(guildId)) continue;

        console.log("[VoiceRadar-Discord] the subscriptions were dropped, taking them again");
        void refresh();
        return;
    }
}

/**
 * How much churn the client may go through before the plugin stops adding to it.
 *
 * A pass is up to one gateway command per server, spaced out but sustained for a minute or two, and
 * the two events below are the ones that make a pass expensive, because the client has just thrown
 * every subscription away and every server has to be asked again. That is fine once. It is not fine
 * on a connection that keeps dropping, or on an evening of going idle and coming back, where the
 * plugin would keep feeding commands into a socket that is already struggling.
 *
 * Nothing here can see a voice connection fail, and a client stuck on "connecting to RTC" after its
 * gateway went down is exactly the situation where the least useful thing is a stream of our own
 * traffic on top. The floor inside refresh keeps this to one pass a minute, which is the right
 * ceiling for a healthy client and far too generous for one in trouble.
 *
 * Giving up costs a quarter of an hour at worst, since the slow timer asks anyway, and it only
 * gives up while the churn is actually happening.
 */
const CHURN_WINDOW_MS = 5 * 60_000;
const CHURN_LIMIT = 3;
let recentChurn: number[] = [];

/** @returns true when the client has been thrashing enough that a pass would make it worse. */
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

/**
 * A reconnect drops every subscription, so they are asked for again once the client is back, after
 * a pause, and never twice in quick succession, because a connection that keeps dropping is the one
 * case where asking again immediately makes everything worse.
 */
function onConnectionOpen() {
    if (clientIsThrashing()) return;
    setTimeout(() => void refresh(), AFTER_RECONNECT_MS);
}

/**
 * Going idle is the moment the client throws every subscription away, and it is also the moment you
 * are most likely to want to be told about a voice channel, since you are no longer looking at
 * Discord. The wait is for the client to finish its own clearing first.
 */
const AFTER_IDLE_MS = 3000;

function onIdle(event: any) {
    if (!event?.idle) return;
    // going idle and coming back all evening is the same churn a flapping connection is. See above
    if (clientIsThrashing()) return;

    setTimeout(() => void refresh(), AFTER_IDLE_MS);
}

export function startGuildSubscriptions() {
    stopGuildSubscriptions();

    // deliberately not straight away. See FIRST_PASS_DELAY_MS
    firstPassTimer = setTimeout(() => void refresh(true), FIRST_PASS_DELAY_MS);
    refreshTimer = setInterval(() => void refresh(), REFRESH_MS);
    watchdogTimer = setInterval(watchdog, WATCHDOG_MS);
    FluxDispatcher.subscribe("CONNECTION_OPEN", onConnectionOpen);
    FluxDispatcher.subscribe("IDLE", onIdle);
}

export function stopGuildSubscriptions() {
    // first, so a pass already under way stops at its next step instead of outliving everything
    // below it. See sessionGeneration
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
    // a verdict about this Discord, not about the next one
    actionLooksDead = false;
    lastPassStartedAt = 0;
    // and churn this connection went through, which the next session has not
    recentChurn = [];

    /*
     * And a report about this session, not about the next one. The window reads this to decide
     * whether the plugin is still starting up, so a leftover one had a fresh session claiming a
     * hundred servers had been asked minutes ago while it had in fact asked for nothing yet.
     * `serverListHasGrown` compares against it too, and a count from the previous session is not
     * a comparison worth making.
     */
    lastRun = null;

    FluxDispatcher.unsubscribe("CONNECTION_OPEN", onConnectionOpen);
    FluxDispatcher.unsubscribe("IDLE", onIdle);
}

/**
 * Called when somebody is added to the list, so their server is watched without waiting for the slow
 * timer. Deliberately subject to the gap above, since adding ten people one after another is ten of these,
 * and one pass covers all ten anyway.
 */
export function refreshGuildSubscriptions() {
    void refresh();
}
