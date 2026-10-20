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

import { T } from "./i18n";
import { DEFAULT_HOTKEY, settings } from "./settings";

export interface Hotkey {
    key: string;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
}

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta", "altgraph", "os"]);

export function parseHotkey(raw: string | undefined): Hotkey | null {
    const parts = (raw ?? "").split("+").map(part => part.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return null;

    const hotkey: Hotkey = { key: "", ctrl: false, shift: false, alt: false, meta: false };

    for (const part of parts) {
        if (part === "ctrl" || part === "control") hotkey.ctrl = true;
        else if (part === "shift") hotkey.shift = true;
        else if (part === "alt" || part === "option") hotkey.alt = true;
        else if (part === "meta" || part === "cmd" || part === "win" || part === "super") hotkey.meta = true;
        else hotkey.key = part;
    }

    return hotkey.key ? hotkey : null;
}

export function formatHotkey(hotkey: Hotkey | null): string {
    if (!hotkey) return T.hotkeyNotSet;

    const parts: string[] = [];
    if (hotkey.ctrl) parts.push("Ctrl");
    if (hotkey.shift) parts.push("Shift");
    if (hotkey.alt) parts.push("Alt");
    if (hotkey.meta) parts.push("Meta");
    parts.push(hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key);

    return parts.join("+");
}

export function hotkeyFromEvent(event: KeyboardEvent): string | null {
    const key = event.key?.toLowerCase();
    if (!key || MODIFIER_KEYS.has(key)) return null;

    // Alt plus a letter types other characters on some layouts, so the physical key code is used.
    const code = event.code?.toLowerCase() ?? "";
    const named = code.startsWith("key") ? code.slice(3)
        : code.startsWith("digit") ? code.slice(5)
            : key;

    return formatHotkey({
        key: named,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey
    });
}

function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element?.tagName) return false;

    const tag = element.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || element.isContentEditable === true;
}

function matches(event: KeyboardEvent, hotkey: Hotkey): boolean {
    if (event.ctrlKey !== hotkey.ctrl) return false;
    if (event.shiftKey !== hotkey.shift) return false;
    if (event.altKey !== hotkey.alt) return false;
    if (event.metaKey !== hotkey.meta) return false;

    const key = event.key?.toLowerCase() ?? "";
    const code = event.code?.toLowerCase() ?? "";

    return key === hotkey.key
        || code === hotkey.key
        || code === `key${hotkey.key}`
        || code === `digit${hotkey.key}`;
}

let handler: ((event: KeyboardEvent) => void) | null = null;
let captureActive = false;

/** Cached, because this runs on every key press. */
let parsedFrom: string | null = null;
let parsedHotkey: Hotkey | null = null;

function currentHotkey(): Hotkey | null {
    const raw = settings.store.hotkey || DEFAULT_HOTKEY;
    if (raw === parsedFrom) return parsedHotkey;

    parsedFrom = raw;
    parsedHotkey = parseHotkey(raw);
    return parsedHotkey;
}

export function setHotkeyCaptureActive(active: boolean) {
    captureActive = active;
}

export const isHotkeyCaptureActive = () => captureActive;

export function isTypingKey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
    return event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function registerHotkey(onTrigger: () => void) {
    unregisterHotkey();

    handler = (event: KeyboardEvent) => {
        if (event.repeat || captureActive) return;

        const hotkey = currentHotkey();
        if (!hotkey) return;

        const hasModifier = hotkey.ctrl || hotkey.shift || hotkey.alt || hotkey.meta;
        if (!hasModifier && isTypingTarget(event.target)) return;

        if (!matches(event, hotkey)) return;

        event.preventDefault();
        event.stopPropagation();
        onTrigger();
    };

    window.addEventListener("keydown", handler, { capture: true });
}

export function unregisterHotkey() {
    captureActive = false;
    parsedFrom = null;
    parsedHotkey = null;

    if (!handler) return;
    window.removeEventListener("keydown", handler, { capture: true });
    handler = null;
}
