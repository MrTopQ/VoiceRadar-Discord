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

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

import { type ApiHealth, HealthReport, reportBroken, resetApiHealth, setApiHealth, setHealthChecker } from "./apiHealth";
import { channelProblems, resetChannelCaches } from "./channels";
import { closeJoinedModal, openJoinedModal } from "./components/JoinedModal";
import { panelButtonProblems, VoiceRadarPanelButton } from "./components/PanelButton";
import { closeRadarModal, openRadarModal, windowProblems } from "./components/RadarModal";
import { channelContextPatch, userContextPatch } from "./contextMenus";
import { keepTimersAwake, releaseGlobalHotkey, revealDiscord, syncGlobalHotkey } from "./globalHotkey";
import { startGuildSubscriptions, stopGuildSubscriptions, subscriptionProblems } from "./guildSubscriptions";
import { registerHotkey, unregisterHotkey } from "./hotkey";
import { T } from "./i18n";
import { cancelPendingVoiceActions, joinProblems } from "./join";
import { forgetMagnetState } from "./magnet";
import { cancelBatches, forgetClicks, moveApiProblems } from "./moveApi";
import { forgetMoveHistory } from "./moveHistory";
import { forgetMoveAccess, movePermissionProblems } from "./movePermissions";
import { nameProblems, resetUserLookups } from "./names";
import { presenceProblems, resetPresenceRequests } from "./presence";
import { resetQueue } from "./queue";
import { settings } from "./settings";
import { loadStore, shutdownStore } from "./store";
import { resetStreamCache, streamProblems } from "./streams";
import { setJoinedListOpener, startTracking, stopTracking, trackerProblems } from "./tracker";

/**
 * The account-panel patch cannot be undone without restarting Discord, so the button stays on screen
 * after the plugin is switched off, and it stayed clickable, opening the radar of something that was
 * no longer running. It checks this instead, and comes back once the plugin is enabled again.
 */
let isRunning = false;

/**
 * Whether Discord has ever rendered what the patch injects.
 *
 * The patch itself is the one thing here that cannot be probed by asking whether a name still
 * exists. It either matched Discord's code or it did not, and a miss is answered by silence. The
 * call below is the evidence, since Discord can only reach it through the patch.
 */
let panelButtonRendered = false;

function PanelButtonGate(props: { nameplate?: any; }) {
    panelButtonRendered = true;

    /*
     * The setting is marked as needing a restart, and for switching the button on that is simply
     * true: the patch is applied once, behind a predicate read at that moment, so a panel Discord
     * has already built has nowhere to put it. Switching it off is not the same question. The patch
     * is spent either way, and what it injects is this, so the button can go the moment it is asked
     * to rather than sitting there until the next restart ignoring the switch beside it.
     *
     * Subscribed rather than read, and above the returns below because that is where a hook has to
     * be. Nothing else here would ever redraw the account panel, so a plain read would have left the
     * button sitting there until some unrelated thing happened to, which is a slower and stranger
     * answer than the restart it replaces.
     */
    const { showPanelButton } = settings.use(["showPanelButton"]);

    if (!isRunning) return null;
    if (!showPanelButton) return null;

    return <VoiceRadarPanelButton {...props} />;
}

/**
 * How long to give Discord to draw the account panel before its absence means anything, and how many
 * times to ask. Generous on purpose, because this is a diagnostic and a wrong "the patch did not go in" is
 * worse than a late right one.
 */
const PATCH_CHECK_DELAY_MS = 15_000;
const PATCH_CHECK_ATTEMPTS = 4;
let patchCheckTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Says out loud that the button will never appear, instead of leaving a window that claims everything
 * is fine next to a panel that has no button in it.
 */
function verifyPanelButtonPatch(attemptsLeft: number) {
    patchCheckTimer = setTimeout(() => {
        patchCheckTimer = null;

        if (!isRunning || panelButtonRendered) return;

        /*
         * There is no account panel on the login screen, so its absence proves nothing yet, and an
         * attempt spent there is an attempt wasted. Waiting costs nothing but time, and the check
         * used to give up outright if the last of them happened to land before the login finished,
         * which on a slow one meant the diagnostic never ran at all.
         */
        if (!UserStore.getCurrentUser()) {
            verifyPanelButtonPatch(attemptsLeft);
            return;
        }

        if (attemptsLeft > 1) {
            verifyPanelButtonPatch(attemptsLeft - 1);
            return;
        }

        console.warn(
            "[VoiceRadar-Discord] the account panel was drawn without our button, so the patch did not"
            + " go in, and a Discord update probably changed that panel. The window still opens from"
            + " the hotkey and the right-click menus."
        );
        reportBroken(T.apiPanelButtonPatch);
    }, PATCH_CHECK_DELAY_MS);
}

/**
 * Everything the plugin leans on, asked once at startup.
 *
 * Each part answers for itself, because the string that finds a thing belongs next to the thing it
 * finds. Every probe inside a report is already guarded, and this whole assembly is guarded again by
 * its caller, since a check that brings the plugin down on the very update it exists to report would
 * be worse than no check at all.
 */
function checkDiscordApis(): ApiHealth {
    return new HealthReport()
        .merge(channelProblems())
        .merge(nameProblems())
        .merge(joinProblems())
        .merge(presenceProblems())
        .merge(streamProblems())
        .merge(moveApiProblems())
        .merge(movePermissionProblems())
        .merge(subscriptionProblems())
        .merge(trackerProblems())
        // a missing window is fatal, a missing panel button is not, since the window opens from the
        // hotkey and the menus anyway
        .merge(windowProblems())
        .merge(panelButtonProblems());
}

/*
 * The name is a literal rather than PLUGIN_NAME, and it is the very first property, because the build
 * script reads it out of this file with a regular expression before anything is compiled. That is
 * what names the main process half of the plugin. It must stay the same string as PLUGIN_NAME in
 * i18n.ts, and nothing may sit between the brace and it.
 */
export default definePlugin({
    name: "VoiceRadar-Discord",
    // a getter, so the card in the plugin list follows the language too. definePlugin keeps this
    // object by reference and Vencord reads the field while rendering
    get description() {
        return T.pluginDescription;
    },
    authors: [
        {
            name: "TopQ",
            id: 523800559791374356n
        }
    ],

    settings,

    patches: [
        {
            // button in the account panel, next to mic / headphones.
            // the lookahead (instead of capturing everything up to accountContainerRef) keeps this
            // patch compatible with other plugins that inject their own button into the same array
            predicate: () => settings.store.showPanelButton,
            find: "#{intl::USER_PROFILE_ACCOUNT_POPOUT_BUTTON_A11Y_LABEL}",
            replacement: {
                match: /(children:\[)(?=.{0,300}?accountContainerRef)/,
                replace: "$1$self.VoiceRadarPanelButton(arguments[0]),"
            }
        }
    ],

    VoiceRadarPanelButton: ErrorBoundary.wrap(PanelButtonGate, { noop: true }),

    get toolboxActions() {
        return { [T.menuOpenRadar]: openRadarModal };
    },

    contextMenus: {
        "user-context": userContextPatch,
        "user-profile-actions": userContextPatch,
        "channel-context": channelContextPatch
    },

    async start() {
        isRunning = true;

        // the hotkey goes first on purpose, so the window stays reachable if anything below fails
        registerHotkey(openRadarModal);
        // and the same combination system wide, when that is switched on
        syncGlobalHotkey(openRadarModal);

        try {
            await loadStore();
        } catch (error) {
            console.error("[VoiceRadar-Discord] failed to load saved users:", error);
        }

        // lets a "5 people joined voice" popup list those five without the tracker importing the modal.
        // The click also brings Discord forward, since a notification is answered from wherever you are
        setJoinedListOpener(userIds => {
            revealDiscord();
            openJoinedModal(userIds);
        });

        try {
            startTracking();
        } catch (error) {
            console.error("[VoiceRadar-Discord] failed to start voice tracking.", error);

            /*
             * Nothing else would ever notice this. The catch kept the rest of the plugin alive,
             * which is right, but it also left a window that reported everything as fine next to a
             * list that would never grow, notifications that would never fire, and an auto-join
             * that would never follow anybody. Vital, because that is the plugin not working.
             */
            reportBroken(T.apiVoiceEvents, true);
        }

        // a minimised window has its timers slowed to a crawl, and everything here runs on timers.
        // A setting, because it is also the one thing the plugin changes for the whole renderer
        keepTimersAwake(!!settings.store.keepTimersAwake);

        // ask Discord to keep sending the voice states of the servers these people sit in
        startGuildSubscriptions();

        // the patch answers later than everything else, because it answers by being drawn
        if (settings.store.showPanelButton) verifyPanelButtonPatch(PATCH_CHECK_ATTEMPTS);

        // so the diagnostics window can ask for a fresh answer rather than reading one taken
        // seconds after launch, which is the one moment the probes are least likely to be right
        setHealthChecker(checkDiscordApis);

        try {
            const health = checkDiscordApis();
            setApiHealth(health);

            const problems = [...health.broken, ...health.degraded];
            if (problems.length) {
                console.warn(
                    "[VoiceRadar-Discord] these Discord internals were not found, and a Discord update probably moved them.",
                    problems.join(", ")
                );
            }
        } catch (error) {
            console.error("[VoiceRadar-Discord] the startup check itself failed:", error);
        }
    },

    async stop() {
        isRunning = false;

        if (patchCheckTimer) {
            clearTimeout(patchCheckTimer);
            patchCheckTimer = null;
        }

        unregisterHotkey();
        releaseGlobalHotkey();
        stopGuildSubscriptions();
        keepTimersAwake(false);
        setJoinedListOpener(null);
        stopTracking();
        resetQueue();

        // a gathering of twenty runs for a good few seconds, and minutes once a rate limit makes it
        // wait. Every step of it moves somebody in a server other people are sitting in, so it must
        // not carry on past the switch, and a confirmation still on screen must not start one
        cancelBatches();

        // everything moderator mode remembers between actions, one owner at a time
        forgetMoveHistory();
        forgetMagnetState();
        forgetMoveAccess();
        forgetClicks();

        // and everything the lookups remember, so a new session starts on Discord's answers
        resetPresenceRequests();
        resetUserLookups();
        resetChannelCaches();
        resetStreamCache();
        setHealthChecker(null);
        resetApiHealth();

        // a deferred join or a mute retry left over from the last jump must not still fire
        cancelPendingVoiceActions();
        closeRadarModal();
        closeJoinedModal();
        await shutdownStore();
    }
});
