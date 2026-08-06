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

import { openUserProfile } from "@utils/discord";
import { sleep } from "@utils/misc";
import { RelationshipStore, UserStore, UserUtils } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn } from "./apiHealth";
import { T } from "./i18n";

/**
 * A stable sentinel rather than a translated string, because it is written into the saved list, and
 * a name saved in one language must still read as "no name" in another. Translation happens on the
 * way out, in getUserDisplayName.
 */
export const UNKNOWN_NAME = "Unknown user";

function resolveName(id: string, fallback: string): string {
    const user = UserStore.getUser(id) as any;

    return user
        ? RelationshipStore?.getNickname?.(id) || user.globalName || user.username || fallback
        : fallback;
}

/** For showing to the reader. The sentinel is translated on the way out. */
export function getUserDisplayName(id: string, fallback = UNKNOWN_NAME): string {
    const name = resolveName(id, fallback);
    return name === UNKNOWN_NAME ? T.unknownUser : name;
}

/**
 * For writing into the saved list, never translated.
 *
 * getUserDisplayName hands back the translated placeholder for an uncached user, and storing that
 * was a real bug. On English it equalled UNKNOWN_NAME and got filtered out again, on any other
 * language it looked like an ordinary name and overwrote the real one. Callers that persist a name
 * use this instead.
 */
export function getStoredName(id: string, fallback = UNKNOWN_NAME): string {
    return resolveName(id, fallback);
}

/**
 * Both sides of the search comparison go through here, so they cannot disagree.
 *
 * Russian nicknames are written with and without the diaresis interchangeably. "Алёна" is just as
 * likely to be typed "Алена", and a plain lowercase match would find neither from the other.
 * Folding ё onto е is the same equivalence Russian search boxes use.
 */
export function normalizeSearch(text: string): string {
    return text.toLowerCase().replace(/ё/g, "е");
}

/** Everything a person can be searched by. Nickname, display name, username, cached name. */
export function getSearchText(id: string, storedName: string): string {
    const user = UserStore.getUser(id) as any;

    return normalizeSearch([
        RelationshipStore?.getNickname?.(id),
        user?.globalName,
        user?.username,
        storedName
    ].filter(Boolean).join(" "));
}

/** Discord's own placeholder, used while a user object is not in the cache yet. */
export const DEFAULT_AVATAR_URL = "https://cdn.discordapp.com/embed/avatars/0.png";

export function getAvatarUrl(id: string): string | null {
    const user = UserStore.getUser(id) as any;
    try {
        return user?.getAvatarURL?.(void 0, 80, true) ?? null;
    } catch {
        return null;
    }
}

/** Users Discord says do not exist. Asking again on every open of the window is pointless. */
const unknownUsers = new Set<string>();

/**
 * Discord saying there is no such user, as opposed to a request that merely did not get through.
 *
 * The difference is the whole point of the set above. A deleted account answers the same way
 * forever, so remembering it saves a request per window. A moment offline, a rate limit or a
 * gateway hiccup answers differently a second later, and filing those alongside the deleted ones
 * blanked that person's name and avatar for the rest of the session over one bad request.
 */
function isUnknownUser(error: any): boolean {
    return error?.status === 404 || error?.body?.code === 10013;
}
/** The same id asked for twice at once must not become two requests. */
const userFetches = new Map<string, Promise<void>>();

/** Pulls a user into Discord's cache so avatar/name render for people we have not seen this session. */
export function ensureUserCached(id: string): Promise<void> {
    if (UserStore.getUser(id) || unknownUsers.has(id)) return Promise.resolve();

    const running = userFetches.get(id);
    if (running) return running;

    const fetching = UserUtils.getUser(id)
        .then(() => void 0)
        .catch(error => {
            // only a real "no such user" is worth remembering for good. See isUnknownUser
            if (isUnknownUser(error)) unknownUsers.add(id);
            console.warn("[VoiceRadar-Discord] could not fetch user", id, error);
        })
        .finally(() => void userFetches.delete(id));

    userFetches.set(id, fetching);
    return fetching;
}

/** One request at a time with a gap between them. See warmUpUsers. */
const USER_FETCH_SPACING_MS = 250;

/**
 * The spaced version, for callers that are not walking a list of their own. Notifications fire from
 * voice events, and a group sitting down together used to mean one parallel lookup per person at the
 * same instant. Everything queues behind everything else, so the rate is bounded however many places
 * ask at once. People Discord already knows never enter the queue.
 */
let fetchChain: Promise<unknown> = Promise.resolve();
/** Bumped on shutdown, so links already queued behind it turn into no-ops instead of firing. */
let fetchGeneration = 0;

export function ensureUserCachedSpaced(id: string): Promise<void> {
    if (UserStore.getUser(id) || unknownUsers.has(id)) return Promise.resolve();

    const generation = fetchGeneration;
    const next = fetchChain
        .then(() => (generation === fetchGeneration ? ensureUserCached(id) : undefined))
        .then(() => sleep(USER_FETCH_SPACING_MS));

    // a rejected link must not poison every request that comes after it
    fetchChain = next.catch(() => void 0);
    return next.then(() => void 0);
}

/**
 * The gateway member request fires at the same moment this does, costs nothing, and answers for up
 * to a hundred people at once. Starting immediately meant paying for the first few by REST a second
 * before the free answer arrived, so the loop waits for it. By the time it runs, most ids are already
 * cached and skipped.
 */
const GATEWAY_HEAD_START_MS = 1200;

/**
 * Opening the radar used to fire one request per uncached person at once. On a full list that is a
 * burst of a hundred parallel lookups, which is what automated scraping looks like. Now they are
 * walked one by one, and most never happen at all.
 */
export async function warmUpUsers(ids: string[], onProgress: () => void, keepGoing: () => boolean) {
    await sleep(GATEWAY_HEAD_START_MS);

    for (const id of ids) {
        if (!keepGoing()) return;
        if (UserStore.getUser(id) || unknownUsers.has(id)) continue;

        await ensureUserCached(id);
        onProgress();

        await sleep(USER_FETCH_SPACING_MS);
    }
}

/** openUserProfile throws for users Discord cannot fetch, which must not reach a click handler. */
export function openProfile(id: string): void {
    openUserProfile(id).catch(error =>
        console.warn("[VoiceRadar-Discord] could not open profile", id, error));
}

/** Everything this file remembers about who it has already looked up, dropped on shutdown. */
export function resetUserLookups(): void {
    unknownUsers.clear();

    // whatever is still queued belongs to a plugin that is no longer running
    fetchGeneration++;
    fetchChain = Promise.resolve();
}

export function nameProblems(): ApiHealth {
    return new HealthReport()
        .vital(() => isFn((UserStore as any)?.getUser), T.apiUserInfo);
}
