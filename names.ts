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
import { FluxDispatcher, RelationshipStore, UserStore, UserUtils } from "@webpack/common";

import { type ApiHealth, HealthReport, isFn } from "./apiHealth";
import { T } from "./i18n";

/** A fixed sentinel, because it is saved and must read the same in every language. */
export const UNKNOWN_NAME = "Unknown user";

function resolveName(id: string, fallback: string): string {
    try {
        const user = UserStore?.getUser?.(id) as any;

        return user
            ? RelationshipStore?.getNickname?.(id) || user.globalName || user.username || fallback
            : fallback;
    } catch {
        return fallback;
    }
}

export function getUserDisplayName(id: string, fallback = UNKNOWN_NAME): string {
    const name = resolveName(id, fallback);
    return name === UNKNOWN_NAME ? T.unknownUser : name;
}

/** Never translated, because it is written into the saved list. */
export function getStoredName(id: string, fallback = UNKNOWN_NAME): string {
    return resolveName(id, fallback);
}

export function normalizeSearch(text: string): string {
    return text.toLowerCase().replace(/ё/g, "е");
}

export function getSearchText(id: string, storedName: string): string {
    const user = UserStore.getUser(id) as any;

    return normalizeSearch([
        RelationshipStore?.getNickname?.(id),
        user?.globalName,
        user?.username,
        storedName
    ].filter(Boolean).join(" "));
}

export const DEFAULT_AVATAR_URL = "https://cdn.discordapp.com/embed/avatars/0.png";

export function getAvatarUrl(id: string): string | null {
    const user = UserStore.getUser(id) as any;
    try {
        return user?.getAvatarURL?.(void 0, 80, true) ?? null;
    } catch {
        return null;
    }
}

const unknownUsers = new Set<string>();

function isUnknownUser(error: any): boolean {
    return error?.status === 404 || error?.body?.code === 10013;
}
const userFetches = new Map<string, Promise<void>>();

export function ensureUserCached(id: string): Promise<void> {
    if (UserStore.getUser(id) || unknownUsers.has(id)) return Promise.resolve();

    const running = userFetches.get(id);
    if (running) return running;

    let request: Promise<unknown>;
    try {
        request = UserUtils.getUser(id);
    } catch (error) {
        // A moved lookup throws before it returns a promise.
        request = Promise.reject(error);
    }

    const fetching = request
        .then(() => void 0)
        .catch(error => {
            if (isUnknownUser(error)) unknownUsers.add(id);
            console.warn("[VoiceRadar-Discord] could not fetch user", id, error);
        })
        .finally(() => void userFetches.delete(id));

    userFetches.set(id, fetching);
    return fetching;
}

const USER_FETCH_SPACING_MS = 250;

let fetchChain: Promise<unknown> = Promise.resolve();
let fetchGeneration = 0;

export function ensureUserCachedSpaced(id: string): Promise<void> {
    if (UserStore.getUser(id) || unknownUsers.has(id)) return Promise.resolve();

    const generation = fetchGeneration;
    const next = fetchChain
        .then(() => (generation === fetchGeneration ? ensureUserCached(id) : undefined))
        .then(() => sleep(USER_FETCH_SPACING_MS));

    fetchChain = next.catch(() => void 0);
    return next.then(() => void 0);
}

/** The gateway member request answers for up to a hundred people at once, so it goes first. */
const GATEWAY_HEAD_START_MS = 1200;

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

export function openProfile(id: string): void {
    openUserProfile(id).catch(error =>
        console.warn("[VoiceRadar-Discord] could not open profile", id, error));
}

/** Discord's full profile lies over the plugin's windows and its side panels, so showing one of those closes it first. */
export function closeProfile(): void {
    FluxDispatcher.dispatch({ type: "USER_PROFILE_MODAL_CLOSE" } as any);
}

export function resetUserLookups(): void {
    unknownUsers.clear();

    fetchGeneration++;
    fetchChain = Promise.resolve();
}

export function nameProblems(): ApiHealth {
    return new HealthReport()
        .vital(() => isFn((UserStore as any)?.getUser), T.apiUserInfo);
}
