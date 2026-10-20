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
import { CHIME_SOUND, getJoinSound, settings } from "./settings";
import { getStickyMuted } from "./store";

export type FeatureLevel = "good" | "waiting" | "bad";

export interface FeatureRow {
    title: string;
    detail: string;
    level: FeatureLevel;
}

interface Feature {
    title: string;
    works: string;
    parts: string[];
    off?: () => boolean;
}

/** Read on every open, because the language can change while Discord runs. */
function features(): Feature[] {
    return [
        {
            title: T.healthWhoIsWhereTitle,
            works: T.healthWhoIsWhereOk,
            parts: [T.apiWhoIsInVoice, T.apiChannelMembers, T.apiMyChannel, T.apiChannelInfo]
        },
        {
            title: T.healthTrackerTitle,
            works: T.healthTrackerOk,
            parts: [T.apiVoiceEvents]
        },
        {
            title: T.healthNamesTitle,
            works: T.healthNamesOk,
            parts: [T.apiUserInfo]
        },
        {
            title: T.healthPresenceTitle,
            works: T.healthPresenceOk,
            parts: [T.apiStatuses, T.apiDevices]
        },
        {
            title: T.healthJoinTitle,
            works: T.healthJoinOk,
            parts: [T.apiJoinChannel]
        },
        {
            title: T.healthSilentJoinTitle,
            works: T.healthSilentJoinOk,
            parts: [T.apiSilentJoin],
            off: () => !settings.store.silentJoin
        },
        {
            title: T.healthOpenChannelTitle,
            works: T.healthOpenChannelOk,
            parts: [T.apiOpenChannel]
        },
        {
            title: T.healthPermissionsTitle,
            works: T.healthPermissionsOk,
            parts: [T.apiPermissions]
        },
        {
            title: T.healthStreamsTitle,
            works: T.healthStreamsOk,
            parts: [T.apiStreamPreviews]
        },
        {
            title: T.healthModerationTitle,
            works: T.healthModerationOk,
            parts: [T.apiModeratorActions, T.apiMoveMembersFlag],
            off: () => !settings.store.moderatorMode
        },
        {
            title: T.healthStickyMuteTitle,
            works: T.healthStickyMuteOk,
            parts: [T.apiModeratorActions, T.apiMuteMembersFlag, T.apiVoiceEvents],
            off: () => !settings.store.moderatorMode && getStickyMuted().length === 0
        },
        {
            title: T.healthWindowTitle,
            works: T.healthWindowOk,
            parts: [T.apiWindow]
        },
        {
            title: T.healthPanelButtonTitle,
            works: T.healthPanelButtonOk,
            parts: [T.apiPanelButton, T.apiPanelButtonPatch],
            off: () => !settings.store.showPanelButton
        },
        {
            title: T.healthJoinSoundTitle,
            works: getJoinSound() === CHIME_SOUND ? T.healthJoinSoundChime : T.healthJoinSoundOk,
            parts: [],
            off: () => getJoinSound() === "off"
        },
        {
            title: T.healthToastsTitle,
            works: T.healthToastsOk,
            parts: [T.apiToasts]
        }
    ];
}

export function featureRows(): FeatureRow[] {
    const { broken, degraded, checked } = getApiHealth();

    if (!checked) {
        return features().map(feature => ({
            title: feature.title,
            level: "waiting" as const,
            detail: T.healthFeatureUnchecked
        }));
    }

    return features().map(feature => {
        if (feature.off?.()) {
            return { title: feature.title, level: "good" as const, detail: T.healthFeatureOff };
        }

        const dead = feature.parts.filter(part => broken.includes(part));
        if (dead.length) {
            return { title: feature.title, level: "bad", detail: T.healthFeatureBroken(dead.join(", ")) };
        }

        const weak = feature.parts.filter(part => degraded.includes(part));
        if (weak.length) {
            return { title: feature.title, level: "waiting", detail: T.healthFeatureWeak(weak.join(", ")) };
        }

        return { title: feature.title, level: "good", detail: feature.works };
    });
}
