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

/**
 * What a Discord update has moved, in two piles.
 *
 * Broken means the plugin cannot do its job. Degraded means a part of it is gone while the list and
 * the window carry on, like the account panel button, which is only ever a shortcut to a window that
 * still opens from the hotkey and from every right-click menu.
 */
export interface ApiHealth {
    broken: string[];
    degraded: string[];
    /** how many were looked at, so the window can say what "all present" is out of */
    checked: number;
}

/**
 * Every probe goes through here, and a probe that throws counts as missing.
 *
 * That is the common case rather than the exotic one. Vencord's lazy finds are proxies, and reading a
 * property off one whose module was not found throws instead of answering undefined, so the check
 * written to notice a Discord update was the first thing that update took down with it.
 */
export function probe(check: () => boolean): boolean {
    try {
        return check() === true;
    } catch {
        return false;
    }
}

/** Half the probes are "is this still a function", and it reads badly inline. */
export const isFn = (value: any) => typeof value === "function";

/**
 * Whether a Vencord lazy component actually resolved to something.
 *
 * `typeof Component === "function"` cannot answer this. LazyComponent hands back a wrapper function
 * that exists whether or not the search ever found anything, so that test is true even when the
 * component is gone, which made every component probe here permanently green. The wrapper carries the
 * resolver, and the resolver is what knows.
 */
export function isResolvedComponent(component: any): boolean {
    return probe(() => !!component?.$$vencordGetWrappedComponent?.());
}

/**
 * A pile of probes with a count of how many were run, since "all present" is only worth reading next
 * to what it is out of. Each module builds its own and the plugin merges them, because the string that
 * finds a thing belongs next to the thing it finds.
 */
export class HealthReport implements ApiHealth {
    readonly broken: string[] = [];
    readonly degraded: string[] = [];
    checked = 0;

    /** Without this one the list itself is wrong or empty, which is the plugin not working. */
    vital(check: () => boolean, label: string): this {
        return this.add(check, label, this.broken);
    }

    /** Without this one something is missing, but the list and the window are still worth having. */
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

/** What the probes said at startup. */
let startup: ApiHealth = { broken: [], degraded: [], checked: 0 };

/**
 * What actually failed while the plugin ran, which is the half a startup probe cannot have.
 *
 * A probe answers "is this name still here", and some of the things the plugin leans on cannot be
 * asked that. Toasts are found by matching mangled code and handed over as a lazy proxy, so any test
 * of them short of showing one comes back true. Every call site already catches its own failure, so
 * the failure itself is the report. It is remembered here and shown next to the predictions.
 */
const observedBroken = new Set<string>();
const observedDegraded = new Set<string>();

export function setApiHealth(health: ApiHealth) {
    startup = { broken: [...health.broken], degraded: [...health.degraded], checked: health.checked };
}

/**
 * How to run the probes again, handed over by the plugin at startup.
 *
 * A callback rather than an import, because the assembly of every module's probes lives in the
 * plugin's own file, and that file imports this one. This is the same shape the tracker uses to
 * open the joined list without importing the modal.
 */
let recheck: (() => ApiHealth) | null = null;

export function setHealthChecker(check: (() => ApiHealth) | null) {
    recheck = check;
}

/**
 * Asks every probe again and replaces the startup answer with what is true now.
 *
 * The startup answer is taken once, seconds after launch, and it used to be the only one there
 * would ever be. That is the same shape as a first subscription pass that runs before the client
 * has loaded, a snapshot from a moment that may have been too early, kept for the whole session
 * with nothing able to correct it. A probe that answered wrong then, say a lazy find whose module
 * nothing had reached yet, left a red or amber banner lying for hours, and it is exactly the
 * banner the reader is asked to trust.
 *
 * Called when the diagnostics window opens, which is the one moment somebody has actually asked
 * for the current truth. Deliberately not on a timer, because probes are cheap but not free, and nothing
 * reads the answer while the window is shut.
 */
export function refreshApiHealth() {
    if (!recheck) return;

    try {
        setApiHealth(recheck());
    } catch (error) {
        // the check falling over must not take the window that shows it down too
        console.error("[VoiceRadar-Discord] could not re-run the health checks:", error);
    }
}

/**
 * @param vital set when the failure means the plugin cannot do its job. The default is the softer
 * pile, since most of what reports itself here is a part rather than the whole.
 */
export function reportBroken(label: string, vital = false) {
    (vital ? observedBroken : observedDegraded).add(label);
}

/**
 * Takes a report back, for something that failed and then started working.
 *
 * Only the thing that reported it can know that, which is why this is not automatic. Without it a
 * single bad moment, a batch that landed slower than it was given, a request that went out while
 * the connection was down, would sit in the window for the rest of the session claiming a Discord
 * update, long after the plugin had gone back to working.
 */
export function clearReported(label: string) {
    observedBroken.delete(label);
    observedDegraded.delete(label);
}

export function getApiHealth(): ApiHealth {
    const broken = [...new Set([...startup.broken, ...observedBroken])];
    // named in both piles means the worse of the two is the true one, and saying it twice is noise
    const degraded = [...new Set([...startup.degraded, ...observedDegraded])]
        .filter(label => !broken.includes(label));

    return { broken, degraded, checked: startup.checked };
}

export function resetApiHealth() {
    startup = { broken: [], degraded: [], checked: 0 };
    observedBroken.clear();
    observedDegraded.clear();
}
