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
import type { MouseEvent, ReactNode } from "react";

import { T } from "../i18n";
import type { PlatformPresence } from "../presence";
import { Hint } from "./Hint";
import { PlatformIcon } from "./icons";

export const cl = classNameFactory("vr-");

interface ActionButtonProps {
    icon: ReactNode;
    tooltip: string;
    /** A second, quieter line under the tooltip, such as a limit. */
    note?: string;
    onClick: (event: MouseEvent) => void;
    active?: boolean;
    danger?: boolean;
    warn?: boolean;
    disabled?: boolean;
    extraClass?: string;
}

export function HeadButton({ icon, label, active, extraClass, onClick }: {
    icon: ReactNode;
    label: string;
    active?: boolean;
    extraClass?: string;
    onClick: (event: MouseEvent<HTMLElement>) => void;
}) {
    return (
        <Hint text={label}>
            {hintProps => (
                <button
                    {...hintProps}
                    className={[cl("head-button"), active && cl("head-button-on"), extraClass].filter(Boolean).join(" ")}
                    aria-label={label}
                    aria-pressed={active}
                    onClick={onClick}
                >
                    {icon}
                </button>
            )}
        </Hint>
    );
}

export function ActionButton({ icon, tooltip, note, onClick, active, danger, warn, disabled, extraClass }: ActionButtonProps) {
    const className = [
        cl("action"),
        active && cl("action-active"),
        danger && cl("action-danger"),
        warn && cl("action-warn"),
        disabled && cl("action-disabled"),
        extraClass
    ].filter(Boolean).join(" ");

    return (
        <Hint text={note ? <>{tooltip}<div className={cl("vc-tooltip-hint")}>{note}</div></> : tooltip}>
            {hintProps => (
                <button
                    {...hintProps}
                    className={className}
                    // Not the native disabled, so the hint explaining why still shows on hover.
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : undefined}
                    aria-label={note ? `${tooltip}. ${note}` : tooltip}
                    onClick={event => {
                        event.stopPropagation();
                        if (!disabled) onClick(event);
                    }}
                >
                    {icon}
                </button>
            )}
        </Hint>
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
    // A hollow ring means Discord never sent this person's status.
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
