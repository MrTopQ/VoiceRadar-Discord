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

export type FeatureLevel = "good" | "waiting" | "bad";

export interface FeatureRow {
    title: string;
    detail: string;
    level: FeatureLevel;
}

/**
 * One thing the plugin does, next to the Discord internals it is built on.
 *
 * The probes themselves live beside the code that uses them, which is right, but a pile of probe
 * names is not an answer to "does the plugin still work". A reader wants to know whether they can
 * still pull somebody over, not whether RestAPI.patch is where it was. This is the translation
 * between the two, and it is deliberately the only place that knows it, so a feature that gains a
 * dependency gains it here and nowhere else.
 */
interface Feature {
    title: string;
    /** What it says when everything behind it is where the plugin expects it. */
    works: string;
    /**
     * The labels this feature stands on, exactly as the probes report them. Matching is by string
     * because that is what a report is made of, and the alternative is a second list of ids that
     * can drift away from the first.
     */
    parts: string[];
    /**
     * Whether the reader switched this one off.
     *
     * A feature nobody asked for has no parts worth judging, and judging it anyway produced the
     * quiet lie this whole page exists to avoid. With the panel button turned off the row still
     * announced a button next to the mic and headphones. With silent join off it promised the mic
     * would be muted on every join. Both were green, and both were describing something the reader
     * had themselves turned off.
     */
    off?: () => boolean;
}

/**
 * Read fresh on every open, because every label is a translation and the language can change while
 * Discord runs. A list built once at import would be matched against reports written in another one.
 */
function features(): Feature[] {
    return [
        {
            title: T.healthWhoIsWhereTitle,
            works: T.healthWhoIsWhereOk,
            parts: [T.apiWhoIsInVoice, T.apiChannelMembers, T.apiMyChannel, T.apiChannelInfo]
        },
        {
            /*
             * Reading the stores says where everybody is this second. This is what says that it
             * changed, and nothing here polls for that, so losing it leaves a plugin that looks
             * right whenever you open the window and never tells you anything on its own.
             */
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
            title: T.healthWindowTitle,
            works: T.healthWindowOk,
            parts: [T.apiWindow]
        },
        {
            // the component and the patch that makes a place for it are two different ways to lose
            // the same button, and neither of them is the other's symptom
            title: T.healthPanelButtonTitle,
            works: T.healthPanelButtonOk,
            parts: [T.apiPanelButton, T.apiPanelButtonPatch],
            off: () => !settings.store.showPanelButton
        },
        {
            title: T.healthJoinSoundTitle,
            works: getJoinSound() === CHIME_SOUND ? T.healthJoinSoundChime : T.healthJoinSoundOk,
            parts: getJoinSound() === CHIME_SOUND ? [] : [T.apiJoinSound],
            off: () => getJoinSound() === "off"
        },
        {
            // no probe can answer for these, so the only report is a failure that already happened.
            // Green here means nothing has gone wrong yet, which is all anybody can say about them
            title: T.healthToastsTitle,
            works: T.healthToastsOk,
            parts: [T.apiToasts]
        }
    ];
}

/**
 * Every feature with a colour and a sentence. The severity is decided where the probe was written,
 * since only the module that needs a thing knows whether losing it is fatal or merely a shame.
 */
export function featureRows(): FeatureRow[] {
    const { broken, degraded, checked } = getApiHealth();

    /*
     * Nothing has been asked, so nothing can be answered.
     *
     * A feature is green here by the absence of a complaint about it, which is the right rule while
     * the probes have run and the wrong one before they have. The startup check is guarded, and the
     * one time it falls over is a Discord update deep enough to take the check down with it, which
     * is exactly when a page of green ticks would be furthest from the truth.
     */
    if (!checked) {
        return features().map(feature => ({
            title: feature.title,
            level: "waiting" as const,
            detail: T.healthFeatureUnchecked
        }));
    }

    return features().map(feature => {
        /*
         * Asked before the parts, because a feature nobody wants cannot be broken. Green rather
         * than amber, since a switch the reader threw themselves is not a fault, and the sentence
         * says which it is.
         */
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
