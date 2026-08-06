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
 * A short-lived cache that cannot grow forever.
 *
 * Everything cached here is keyed by a channel, a stream or a permission check, read again within a
 * fraction of a second and then never again. A plain Map would keep one dead entry per channel the
 * client ever rendered.
 *
 * Expiry happens on read, and a write past the ceiling prunes. Pruning drops only what a lookup
 * would have rejected anyway, so no lookup can see stale data because of it.
 */
export class TtlCache<T> {
    /** Insertion order doubles as write order. See `set`, which deletes before it inserts. */
    private readonly entries = new Map<string, { value: T; expiresAt: number; }>();

    constructor(private readonly defaultTtlMs: number, private readonly maxEntries: number) { }

    /** undefined means never cached or expired. A cached `null` still comes back as null. */
    get(key: string): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;

        if (Date.now() >= entry.expiresAt) {
            this.entries.delete(key);
            return undefined;
        }

        return entry.value;
    }

    /** @param ttlMs overrides the default for this entry. A miss is worth less time than a hit. */
    set(key: string, value: T, ttlMs = this.defaultTtlMs): T {
        // delete first, so re-setting a key moves it to the end. The prune below needs that order
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

        // everything left is still live, so the oldest writes go. They get computed again on demand
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) break;
            this.entries.delete(oldest);
        }
    }
}
