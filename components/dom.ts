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

// The popped out radar lives in another window, whose elements fail instanceof checks against this one.

export function asElement(value: unknown): Element | null {
    return value != null && typeof (value as Element).closest === "function" ? value as Element : null;
}

export function takesText(element: Element | null): boolean {
    const tag = element?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || (element as HTMLElement | null)?.isContentEditable === true;
}
