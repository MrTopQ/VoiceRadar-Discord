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

import { getApiHealth } from "./apiHealth";
import { T } from "./i18n";
import { needsFullRestart } from "./mainProcess";
import { ALERT_OFF, CUSTOM_SOUND, getJoinAlert, settings } from "./settings";

/** Pending is a normal wait during startup, waiting means something needs a look. */
export type FeatureLevel = "good" | "pending" | "waiting" | "bad";

export type HealthGroup = "voice" | "people" | "join" | "windows" | "moderation" | "alerts" | "system";

export type HealthIcon =
    | "voice" | "route" | "servers" | "mic" | "stream" | "pulse" | "people" | "devices" | "join" | "micOff"
    | "target" | "lock" | "menu" | "radar" | "window" | "panel" | "globe" | "shield" | "pull" | "card"
    | "music" | "message" | "bell" | "database" | "chip" | "keyboard" | "clock" | "alert";

export interface FeatureRow {
    title: string;
    detail: string;
    level: FeatureLevel;
    icon: HealthIcon;
    group: HealthGroup;
    /** Switched off in the settings, which is working as asked. */
    off?: boolean;
    /** What the user can do about a problem. */
    fix?: string;
}

interface Feature {
    title: string;
    icon: HealthIcon;
    group: HealthGroup;
    works: string;
    parts: string[];
    off?: () => boolean;
    /** What the feature still waits for, which is not a break. */
    pending?: () => string | null;
}

/** Read on every open, because the language can change while Discord runs. */
function features(): Feature[] {
    return [
        {
            title: T.healthWhoIsWhereTitle,
            icon: "voice",
            group: "voice",
            works: T.healthWhoIsWhereOk,
            parts: [T.apiWhoIsInVoice, T.apiChannelMembers, T.apiMyChannel, T.apiChannelInfo]
        },
        {
            title: T.healthTrackerTitle,
            icon: "route",
            group: "voice",
            works: T.healthTrackerOk,
            parts: [T.apiVoiceEvents]
        },
        {
            title: T.healthNamesTitle,
            icon: "people",
            group: "people",
            works: T.healthNamesOk,
            parts: [T.apiUserInfo]
        },
        {
            title: T.healthPresenceTitle,
            icon: "devices",
            group: "people",
            works: T.healthPresenceOk,
            parts: [T.apiStatuses, T.apiDevices]
        },
        {
            title: T.healthJoinTitle,
            icon: "join",
            group: "join",
            works: T.healthJoinOk,
            parts: [T.apiJoinChannel]
        },
        {
            title: T.healthSilentJoinTitle,
            icon: "micOff",
            group: "join",
            works: T.healthSilentJoinOk,
            parts: [T.apiSilentJoin],
            off: () => !settings.store.silentJoin
        },
        {
            title: T.healthOpenChannelTitle,
            icon: "target",
            group: "join",
            works: T.healthOpenChannelOk,
            parts: [T.apiShowChannel, T.apiOpenChannel]
        },
        {
            title: T.healthUserMenuTitle,
            icon: "menu",
            group: "windows",
            works: T.healthUserMenuOk,
            parts: [T.apiUserMenu]
        },
        {
            title: T.healthMenuEntriesTitle,
            icon: "radar",
            group: "windows",
            works: T.healthMenuEntriesOk,
            parts: [T.apiUserMenuEntries, T.apiChannelMenuEntries]
        },
        {
            title: T.healthSpeakingTitle,
            icon: "mic",
            group: "voice",
            works: T.healthSpeakingOk,
            parts: [T.apiSpeaking]
        },
        {
            title: T.healthMutualTitle,
            icon: "servers",
            group: "people",
            works: T.healthMutualOk,
            parts: [T.apiMutualGuilds]
        },
        {
            title: T.healthModViewTitle,
            icon: "shield",
            group: "moderation",
            works: T.healthModViewOk,
            parts: [T.apiModView, T.apiModViewKind, T.apiModViewMenu, T.apiModViewBypass]
        },
        {
            title: T.healthLookupTitle,
            icon: "globe",
            group: "windows",
            works: T.healthLookupOk,
            parts: [T.apiLookupWindow],
            off: () => !String(settings.store.lookupUrl ?? "").trim(),
            pending: () => needsFullRestart() ? T.healthLookupNeedsRestart : null
        },
        {
            title: T.healthPermissionsTitle,
            icon: "lock",
            group: "join",
            works: T.healthPermissionsOk,
            parts: [T.apiPermissions]
        },
        {
            title: T.healthStreamsTitle,
            icon: "stream",
            group: "voice",
            works: T.healthStreamsOk,
            parts: [T.apiStreamPreviews]
        },
        {
            title: T.healthModerationTitle,
            icon: "pull",
            group: "moderation",
            works: T.healthModerationOk,
            parts: [T.apiModeratorActions, T.apiMoveMembersFlag],
            off: () => !settings.store.moderatorMode
        },
        {
            title: T.healthWindowTitle,
            icon: "window",
            group: "windows",
            works: T.healthWindowOk,
            parts: [T.apiWindow, T.apiPopout]
        },
        {
            title: T.healthPanelButtonTitle,
            icon: "panel",
            group: "windows",
            works: T.healthPanelButtonOk,
            parts: [T.apiPanelButton, T.apiPanelButtonPatch],
            off: () => !settings.store.showPanelButton
        },
        {
            title: T.healthJoinCardTitle,
            icon: "card",
            group: "alerts",
            works: `${T.healthJoinCardOk} ${T.healthJoinCardWindows}`,
            parts: [T.apiJoinCard],
            off: () => getJoinAlert() === ALERT_OFF
        },
        {
            title: T.healthJoinSoundTitle,
            icon: "music",
            group: "alerts",
            works: getJoinAlert() === CUSTOM_SOUND ? T.healthJoinSoundCustom : T.healthJoinSoundChime,
            parts: [],
            off: () => getJoinAlert() === ALERT_OFF
        },
        {
            title: T.healthToastsTitle,
            icon: "message",
            group: "alerts",
            works: T.healthToastsOk,
            parts: [T.apiToasts]
        }
    ];
}

export function featureRows(): FeatureRow[] {
    const { broken, degraded, checked } = getApiHealth();

    return features().map(feature => {
        const row = { title: feature.title, icon: feature.icon, group: feature.group };

        if (!checked) return { ...row, level: "waiting" as const, detail: T.healthFeatureUnchecked, fix: T.healthFixUpdate };

        if (feature.off?.()) return { ...row, level: "good" as const, detail: T.healthFeatureOff, off: true };

        const waitingFor = feature.pending?.();
        if (waitingFor) return { ...row, level: "pending" as const, detail: waitingFor };

        const dead = feature.parts.filter(part => broken.includes(part));
        if (dead.length) {
            return { ...row, level: "bad" as const, detail: T.healthFeatureBroken(dead.join(", ")), fix: T.healthFixUpdate };
        }

        const weak = feature.parts.filter(part => degraded.includes(part));
        if (weak.length) {
            return { ...row, level: "waiting" as const, detail: T.healthFeatureWeak(weak.join(", ")), fix: T.healthFixUpdate };
        }

        return { ...row, level: "good" as const, detail: feature.works };
    });
}
