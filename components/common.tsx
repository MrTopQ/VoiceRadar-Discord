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

import { classNameFactory } from "@utils/css";
import { Tooltip } from "@webpack/common";
import type { ReactNode } from "react";

import { T } from "../i18n";
import type { PlatformPresence } from "../presence";
import { PlatformIcon } from "./icons";

export const cl = classNameFactory("vr-");

interface ActionButtonProps {
    icon: ReactNode;
    tooltip: string;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
    /** amber tone, used by the undo button so a misclick is easy to spot and take back */
    warn?: boolean;
    disabled?: boolean;
}

export function ActionButton({ icon, tooltip, onClick, active, danger, warn, disabled }: ActionButtonProps) {
    const className = [
        cl("action"),
        active && cl("action-active"),
        danger && cl("action-danger"),
        warn && cl("action-warn"),
        disabled && cl("action-disabled")
    ].filter(Boolean).join(" ");

    return (
        <Tooltip text={tooltip}>
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    className={className}
                    // deliberately not the native `disabled`, because browsers swallow mouse
                    // events on those and the tooltip saying why it is off never shows
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : undefined}
                    aria-label={tooltip}
                    onClick={event => {
                        event.stopPropagation();
                        if (!disabled) onClick();
                    }}
                >
                    {icon}
                </button>
            )}
        </Tooltip>
    );
}

const PLATFORM_LABELS: Record<string, () => string> = {
    desktop: () => T.platformDesktop,
    mobile: () => T.platformMobile,
    web: () => T.platformWeb,
    embedded: () => T.platformConsole,
    vr: () => T.platformVr
};

const STATUS_COLORS: Record<string, string> = {
    online: "var(--status-online, #23a55a)",
    idle: "var(--status-idle, #f0b232)",
    dnd: "var(--status-dnd, #f23f43)",
    streaming: "var(--status-streaming, #593695)",
    offline: "var(--status-offline, #80848e)",
    invisible: "var(--status-offline, #80848e)"
};

/** Discord's raw status values. Anything unrecognised falls through to the value itself. */
function statusLabel(status: string): string {
    switch (status) {
        case "online": return T.statusOnline;
        case "idle": return T.statusIdle;
        case "dnd": return T.statusDnd;
        case "offline":
        case "invisible": return T.statusOffline;
        default: return status;
    }
}

/**
 * One icon per device the person is online from, each tinted by that device's own status. The same
 * thing Discord and PlatformIndicators show, and the reason somebody at a PC with a phone in their
 * pocket gets two icons instead of one word.
 */
export function PlatformIcons({ platforms }: { platforms: PlatformPresence[]; }) {
    if (!platforms.length) return null;

    return (
        <span className={cl("platforms")}>
            {platforms.map(({ platform, status }) => (
                <span
                    key={platform}
                    className={cl("platform")}
                    title={T.platformTooltip(
                        PLATFORM_LABELS[platform]?.() ?? platform,
                        statusLabel(status)
                    )}
                >
                    <PlatformIcon
                        platform={platform}
                        color={STATUS_COLORS[status] ?? STATUS_COLORS.offline}
                    />
                </span>
            ))}
        </span>
    );
}

export function StatusDot({ status, mobile, known = true }: { status: string; mobile?: boolean; known?: boolean; }) {
    // hollow ring = Discord never sent a presence for this person, so "offline" would be a guess
    if (!known) {
        return (
            <span
                className={cl("status-dot") + " " + cl("status-unknown")}
                title={T.statusUnknownHint}
            />
        );
    }

    const label = statusLabel(status);

    return (
        <span
            className={cl("status-dot")}
            style={{ background: STATUS_COLORS[status] ?? STATUS_COLORS.offline }}
            title={mobile ? T.statusMobile(label) : label}
        />
    );
}
