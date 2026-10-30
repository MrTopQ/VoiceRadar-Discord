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
import "./list.css";
import "./windows.css";

import { addGlobalContextMenuPatch, removeGlobalContextMenuPatch } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

import { type ApiHealth, HealthReport, reportBroken, resetApiHealth, setApiHealth, setHealthChecker } from "./apiHealth";
import { channelProblems, resetChannelCaches } from "./channels";
import { closeJoinCards, showJoinCard } from "./components/JoinCard";
import { closeJoinedModal, openJoinedModal } from "./components/JoinedModal";
import { panelButtonProblems, VoiceRadarPanelButton } from "./components/PanelButton";
import { closePersonInfo } from "./components/PersonInfoModal";
import { closeRadarModal, openRadarModal, windowProblems } from "./components/RadarModal";
import { channelContextPatch, userContextPatch } from "./contextMenus";
import { forgetCustomSound, loadCustomSound } from "./customSound";
import { keepTimersAwake, releaseGlobalHotkey, revealDiscord, syncGlobalHotkey } from "./globalHotkey";
import { startGuildSubscriptions, stopGuildSubscriptions, subscriptionProblems } from "./guildSubscriptions";
import { registerHotkey, unregisterHotkey } from "./hotkey";
import { T } from "./i18n";
import { cancelPendingVoiceActions, joinProblems } from "./join";
import { setJoinCardShower } from "./joinAlert";
import { lookupProblems, migrateLookupUrl } from "./lookup";
import { forgetMagnetState } from "./magnet";
import { forgetMenuWatch, watchMenus } from "./menuWatch";
import { modViewProblems, resetModView } from "./modView";
import { cancelBatches, forgetClicks, moveApiProblems } from "./moveApi";
import { forgetMoveHistory } from "./moveHistory";
import { forgetMoveAccess, movePermissionProblems } from "./movePermissions";
import { nameProblems, resetUserLookups } from "./names";
import { presenceProblems, resetPresenceRequests } from "./presence";
import { profileProblems } from "./profileFacts";
import { resetQueue } from "./queue";
import { migrateJoinAlert, settings } from "./settings";
import { loadSightings, shutdownSightings } from "./sightings";
import { forgetSoundState } from "./sound";
import { speakingProblems } from "./speaking";
import { forgetStickyMuteState, startStickyMuteSweeps } from "./stickyMute";
import { loadStore, shutdownStore } from "./store";
import { resetStreamCache, streamProblems } from "./streams";
import { setJoinedListOpener, startTracking, stopTracking, trackerProblems } from "./tracker";
import { loadWatchLog, shutdownWatchLog } from "./watchLog";

/** The panel patch stays until a restart, so the button hides itself while the plugin is off. */
let isRunning = false;

let panelButtonRendered = false;

function PanelButtonGate(props: { nameplate?: any; }) {
    panelButtonRendered = true;

    const { showPanelButton } = settings.use(["showPanelButton"]);

    if (!isRunning) return null;
    if (!showPanelButton) return null;

    return <VoiceRadarPanelButton {...props} />;
}

const PATCH_CHECK_DELAY_MS = 15_000;
const PATCH_CHECK_ATTEMPTS = 4;
let patchCheckTimer: ReturnType<typeof setTimeout> | null = null;

function verifyPanelButtonPatch(attemptsLeft: number) {
    patchCheckTimer = setTimeout(() => {
        patchCheckTimer = null;

        if (!isRunning || panelButtonRendered) return;

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
        .merge(windowProblems())
        .merge(panelButtonProblems())
        .merge(speakingProblems())
        .merge(profileProblems())
        .merge(lookupProblems())
        .merge(modViewProblems());
}

// The build script reads the name from this line, so it stays a literal and comes first.
export default definePlugin({
    name: "VoiceRadar-Discord",
    // A getter, so the plugin card follows the language.
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
            // Inserted before the account buttons, next to mic and headphones.
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

        // The hotkey goes first, so the window stays reachable if anything below fails.
        registerHotkey(openRadarModal);
        syncGlobalHotkey(openRadarModal);
        migrateLookupUrl();
        migrateJoinAlert();
        setJoinCardShower(showJoinCard);
        addGlobalContextMenuPatch(watchMenus);
        void loadCustomSound();

        try {
            await loadStore();
        } catch (error) {
            console.error("[VoiceRadar-Discord] failed to load saved users:", error);
        }

        void loadSightings();
        void loadWatchLog();

        setJoinedListOpener(userIds => {
            revealDiscord();
            openJoinedModal(userIds);
        });

        try {
            startTracking();
        } catch (error) {
            console.error("[VoiceRadar-Discord] failed to start voice tracking.", error);

            reportBroken(T.apiVoiceEvents, true);
        }

        // A minimised window slows its timers, and everything here runs on them.
        keepTimersAwake(!!settings.store.keepTimersAwake);

        startGuildSubscriptions();

        startStickyMuteSweeps();

        if (settings.store.showPanelButton) verifyPanelButtonPatch(PATCH_CHECK_ATTEMPTS);

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
        setJoinCardShower(null);
        removeGlobalContextMenuPatch(watchMenus);
        forgetMenuWatch();
        closeJoinCards();
        stopTracking();
        resetQueue();

        cancelBatches();

        forgetStickyMuteState();
        forgetMoveHistory();
        forgetMagnetState();
        forgetMoveAccess();
        forgetClicks();
        resetModView();

        resetPresenceRequests();
        resetUserLookups();
        resetChannelCaches();
        resetStreamCache();
        forgetSoundState();
        forgetCustomSound();
        setHealthChecker(null);
        resetApiHealth();

        cancelPendingVoiceActions();

        for (const close of [closeRadarModal, closeJoinedModal, closePersonInfo]) {
            try {
                close();
            } catch (error) {
                console.warn("[VoiceRadar-Discord] could not close a window on stop:", error);
            }
        }

        await shutdownSightings();
        await shutdownWatchLog();
        await shutdownStore();
    }
});
