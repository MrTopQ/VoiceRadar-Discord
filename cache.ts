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

export class TtlCache<T> {
    private readonly entries = new Map<string, { value: T; expiresAt: number; }>();

    constructor(private readonly defaultTtlMs: number, private readonly maxEntries: number) { }

    get(key: string): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;

        if (Date.now() >= entry.expiresAt) {
            this.entries.delete(key);
            return undefined;
        }

        return entry.value;
    }

    set(key: string, value: T, ttlMs = this.defaultTtlMs): T {
        // Delete first, so setting a key again moves it to the end.
        this.entries.delete(key);
        this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });

        if (this.entries.size > this.maxEntries) this.prune();

        return value;
    }

    clear() {
        this.entries.clear();
    }

    private prune() {
        const now = Date.now();

        for (const [key, entry] of this.entries) {
            if (now >= entry.expiresAt) this.entries.delete(key);
        }

        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) break;
            this.entries.delete(oldest);
        }
    }
}
