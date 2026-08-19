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

import { sleep } from "@utils/misc";

export interface BatchPace {
    parallel: number;
    spacingMs: number;
}

export interface BatchStep {
    ok: boolean;
    rateLimited: boolean;
}

export interface BatchTally {
    done: number;
    abandoned: number;
}

const ASSUMED_ROUND_TRIP_MS = 400;

export function estimateBatchSeconds(count: number, pace: BatchPace): number {
    if (count <= 0) return 0;

    const waves = Math.ceil(count / Math.max(1, pace.parallel));
    return Math.max(1, Math.ceil(waves * (pace.spacingMs + ASSUMED_ROUND_TRIP_MS) / 1000));
}

export async function runMoveBatch<T>(
    items: readonly T[],
    pace: BatchPace,
    step: (item: T) => Promise<BatchStep | null>,
    keepGoing: () => boolean = () => true
): Promise<BatchTally> {
    let claimed = 0;
    let done = 0;
    let rateLimited = false;
    let stopped = false;

    const worker = async () => {
        while (!rateLimited && !stopped) {
            if (!keepGoing()) {
                stopped = true;
                return;
            }

            if (claimed >= items.length) return;
            const item = items[claimed++];

            const outcome = await step(item);
            if (!outcome) continue;

            if (outcome.ok) {
                done++;
            } else if (outcome.rateLimited) {
                rateLimited = true;
                return;
            }

            if (pace.spacingMs > 0) await sleep(pace.spacingMs);
        }
    };

    const workers = Math.max(1, Math.min(pace.parallel, items.length));
    await Promise.all(Array.from({ length: workers }, () => worker()));

    return { done, abandoned: rateLimited ? items.length - claimed : 0 };
}
