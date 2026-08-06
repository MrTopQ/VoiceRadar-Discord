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
 * Lives in its own module so a dictionary can use it without importing the i18n runtime, which
 * imports the dictionaries back.
 */

/** English, one or other. */
export function pluralEn(count: number, one: string, other: string): string {
    return count === 1 ? one : other;
}

/**
 * Russian has three forms and they do not follow the count alone. 21 takes the same form as 1, and 11
 * does not. Intl knows the rule, and the hand written branch is the fallback for a runtime that has no
 * plural rules for ru, which has not been seen in practice.
 */
const ruRules = (() => {
    try {
        return new Intl.PluralRules("ru-RU");
    } catch {
        return null;
    }
})();

export function pluralRu(count: number, one: string, few: string, many: string): string {
    const category = ruRules?.select(count) ?? selectRuManually(count);

    switch (category) {
        case "one": return one;
        case "few": return few;
        default: return many;
    }
}

function selectRuManually(count: number): "one" | "few" | "many" {
    const abs = Math.abs(Math.floor(count));
    const lastTwo = abs % 100;
    const last = abs % 10;

    if (lastTwo >= 11 && lastTwo <= 14) return "many";
    if (last === 1) return "one";
    if (last >= 2 && last <= 4) return "few";
    return "many";
}
