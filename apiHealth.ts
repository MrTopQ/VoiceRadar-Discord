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

export interface ApiHealth {
    broken: string[];
    degraded: string[];
    checked: number;
}

/** A probe that throws counts as missing. */
export function probe(check: () => boolean): boolean {
    try {
        return check() === true;
    } catch {
        return false;
    }
}

export const isFn = (value: any) => typeof value === "function";

const LAZY_GET = Symbol.for("vencord.lazy.get");

const MAX_UNWRAP_DEPTH = 4;

function unwrapFind(value: any, depth = 0): any {
    if (value == null || depth >= MAX_UNWRAP_DEPTH) return value;

    const fromProxy = value[LAZY_GET];
    if (typeof fromProxy === "function") return unwrapFind(fromProxy(), depth + 1);

    const fromComponent = value.$$vencordGetWrappedComponent;
    if (typeof fromComponent === "function") return unwrapFind(fromComponent(), depth + 1);

    return value;
}

/** Whether a Vencord find actually found something. */
export function isFound(value: any): boolean {
    return probe(() => {
        const found = unwrapFind(value);
        return typeof found === "function" || (typeof found === "object" && found !== null);
    });
}

export class HealthReport implements ApiHealth {
    readonly broken: string[] = [];
    readonly degraded: string[] = [];
    checked = 0;

    vital(check: () => boolean, label: string): this {
        return this.add(check, label, this.broken);
    }

    nice(check: () => boolean, label: string): this {
        return this.add(check, label, this.degraded);
    }

    merge(other: ApiHealth): this {
        this.broken.push(...other.broken);
        this.degraded.push(...other.degraded);
        this.checked += other.checked;
        return this;
    }

    private add(check: () => boolean, label: string, pile: string[]): this {
        this.checked++;
        if (!probe(check)) pile.push(label);
        return this;
    }
}

let startup: ApiHealth = { broken: [], degraded: [], checked: 0 };

const observedBroken = new Set<string>();
const observedDegraded = new Set<string>();

const proven = new Set<string>();

export function setApiHealth(health: ApiHealth) {
    startup = { broken: [...health.broken], degraded: [...health.degraded], checked: health.checked };
}

let recheck: (() => ApiHealth) | null = null;

export function setHealthChecker(check: (() => ApiHealth) | null) {
    recheck = check;
}

export function refreshApiHealth() {
    if (!recheck) return;

    try {
        setApiHealth(recheck());
    } catch (error) {
        console.error("[VoiceRadar-Discord] could not re-run the health checks:", error);
    }
}

export function reportBroken(label: string, vital = false) {
    proven.delete(label);
    (vital ? observedBroken : observedDegraded).add(label);
}

export function proveWorking(label: string) {
    proven.add(label);
    observedBroken.delete(label);
    observedDegraded.delete(label);
}

export function isProven(label: string): boolean {
    return proven.has(label);
}

export function clearReported(label: string) {
    observedBroken.delete(label);
    observedDegraded.delete(label);
}

export function getApiHealth(): ApiHealth {
    const predicted = (label: string) => !proven.has(label);

    const broken = [...new Set([...startup.broken.filter(predicted), ...observedBroken])];
    const degraded = [...new Set([...startup.degraded.filter(predicted), ...observedDegraded])]
        .filter(label => !broken.includes(label));

    return { broken, degraded, checked: startup.checked };
}

export function resetApiHealth() {
    startup = { broken: [], degraded: [], checked: 0 };
    observedBroken.clear();
    observedDegraded.clear();
    proven.clear();
}
