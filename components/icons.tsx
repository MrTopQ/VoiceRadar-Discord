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

interface IconProps {
    size?: number;
    className?: string;
}

const base = (size: number) => ({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true
});

/**
 * Device icons, drawn from Discord's own paths, the ones Vencord's PlatformIndicators uses, so a phone
 * here looks like a phone in the member list. Each keeps its own viewBox, because a phone is taller
 * than it is wide and squashing it into a square would make it a fat rectangle.
 */
const PLATFORM_ICONS: Record<string, { path: string; viewBox: string; }> = {
    desktop: {
        path: "M4 2.5c-1.103 0-2 .897-2 2v11c0 1.104.897 2 2 2h7v2H7v2h10v-2h-4v-2h7c1.103 0 2-.896 2-2v-11c0-1.103-.897-2-2-2H4Zm16 2v9H4v-9h16Z",
        viewBox: "0 0 24 24"
    },
    mobile: {
        path: "M 187 0 L 813 0 C 916.277 0 1000 83.723 1000 187 L 1000 1313 C 1000 1416.277 916.277 1500 813 1500 L 187 1500 C 83.723 1500 0 1416.277 0 1313 L 0 187 C 0 83.723 83.723 0 187 0 Z M 125 1000 L 875 1000 L 875 250 L 125 250 Z M 500 1125 C 430.964 1125 375 1180.964 375 1250 C 375 1319.036 430.964 1375 500 1375 C 569.036 1375 625 1319.036 625 1250 C 625 1180.964 569.036 1125 500 1125 Z",
        viewBox: "0 0 1000 1500"
    },
    web: {
        path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93Zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39Z",
        viewBox: "0 0 24 24"
    },
    embedded: {
        path: "M14.8 2.7 9 3.1V47h3.3c1.7 0 6.2.3 10 .7l6.7.6V2l-4.2.2c-2.4.1-6.9.3-10 .5zm1.8 6.4c1 1.7-1.3 3.6-2.7 2.2C12.7 10.1 13.5 8 15 8c.5 0 1.2.5 1.6 1.1zM16 33c0 6-.4 10-1 10s-1-4-1-10 .4-10 1-10 1 4 1 10zm15-8v23.3l3.8-.7c2-.3 4.7-.6 6-.6H43V3h-2.2c-1.3 0-4-.3-6-.6L31 1.7V25z",
        viewBox: "0 0 50 50"
    },
    vr: {
        path: "M8.46 8.64a1 1 0 0 1 1 1c0 .44-.3.8-.72.92l-.11.07c-.08.06-.2.19-.2.41a.99.99 0 0 1-.98.86h-.06a1 1 0 0 1-.94-1.05l.02-.32c.05-1.06.92-1.9 1.99-1.9ZM15.55 5a5.5 5.5 0 0 1 5.15 3.67h.3a2 2 0 0 1 2 2v3.18a2 2 0 0 1-2 1.99h-.2A4.54 4.54 0 0 1 16.55 19a4.45 4.45 0 0 1-3.6-1.83 1.2 1.2 0 0 0-1.9 0 4.44 4.44 0 0 1-3.9 1.82 4.54 4.54 0 0 1-3.94-3.15H3a2 2 0 0 1-2-2v-3.18c0-1.1.9-1.99 2-1.99h.3A5.5 5.5 0 0 1 8.46 5h7.09Zm-7.1 2C6.6 7 5.06 8.5 4.97 10.41l-.02.66v3.18c0 1.43 1.05 2.66 2.34 2.74.85.06 1.63-.32 2.14-1.01a3.2 3.2 0 0 1 2.57-1.3c1 0 1.97.48 2.57 1.3.5.69 1.3 1.08 2.14 1.01 1.3-.08 2.34-1.31 2.34-2.74l-.02-3.84a3.54 3.54 0 0 0-3.49-3.43H8.45Z",
        viewBox: "0 4 24 16"
    }
};

/** An unknown platform still gets an icon rather than a gap. A desktop is the safest guess. */
export function PlatformIcon({ platform, size = 13, color, className }: IconProps & { platform: string; color?: string; }) {
    const icon = PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.desktop;

    return (
        <svg
            width={size}
            height={size}
            viewBox={icon.viewBox}
            fill={color ?? "currentColor"}
            className={className}
            aria-hidden={true}
        >
            <path d={icon.path} />
        </svg>
    );
}

export function RadarIcon({ size = 20, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
            <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" opacity="0.75" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <path d="M12 12 L20 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function PinIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path
                d="M14.5 3 21 9.5l-2.3 2.3-1-.3-3.5 3.5.4 3.2L12 20.8 8.4 17.2 3.6 21 3 20.4l3.8-4.8L3.2 12l2.6-2.6 3.2.4 3.5-3.5-.3-1L14.5 3Z"
                fill="currentColor"
            />
        </svg>
    );
}

export function BellIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path
                d="M12 3a5.5 5.5 0 0 0-5.5 5.5v3L5 14.5h14L17.5 11.5v-3A5.5 5.5 0 0 0 12 3Z"
                fill="currentColor"
            />
            <path d="M10 17a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function TargetIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
            <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
    );
}

export function JoinIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path
                d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
            <path d="M4 12h10M10.5 8.2 14.5 12l-4 3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function MicOffIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M15 9V6a3 3 0 0 0-5.8-1.1M9 9v3a3 3 0 0 0 4.7 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M18 12a6 6 0 0 1-9.3 5M6 12v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M4 3.5 20.5 20" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
    );
}

/** Headphones with a slash. They hear nothing, so the mic is off as well. */
export function DeafIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M5 14v-2a7 7 0 0 1 11.3-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M19 11.2V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <rect x="3" y="13" width="3.6" height="6" rx="1.6" fill="currentColor" />
            <rect x="17.4" y="13" width="3.6" height="6" rx="1.6" fill="currentColor" />
            <path d="M3.5 3.5 20.5 20.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
    );
}

export function SpeakerIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M5 9.5h3L12 6v12l-4-3.5H5v-5Z" fill="currentColor" />
            <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

/** Speaker with a padlock, shown when you are not allowed into that voice channel. */
export function LockedSpeakerIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M5 9.5h3L12 6v12l-4-3.5H5v-5Z" fill="currentColor" />
            <path
                d="M16 11h.5v-1a2 2 0 0 1 4 0v1h.5a.9.9 0 0 1 .9.9v3.2a.9.9 0 0 1-.9.9h-5a.9.9 0 0 1-.9-.9v-3.2a.9.9 0 0 1 .9-.9Zm3.5 0v-1a1 1 0 0 0-2 0v1h2Z"
                fill="currentColor"
            />
        </svg>
    );
}

export function LockIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M7 10.5V8a5 5 0 0 1 10 0v2.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" fill="currentColor" />
        </svg>
    );
}

/** Waiting for a slot in a full channel. */
export function ClockIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/** Moderator, keep someone glued to your channel. */
export function MagnetIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path
                d="M4 11a8 8 0 0 1 16 0v3h-4.5v-3a3.5 3.5 0 0 0-7 0v3H4v-3Z"
                fill="currentColor"
            />
            <rect x="4" y="15.5" width="4.5" height="4.5" rx="1" fill="currentColor" opacity="0.75" />
            <rect x="15.5" y="15.5" width="4.5" height="4.5" rx="1" fill="currentColor" opacity="0.75" />
        </svg>
    );
}

/** Moderator, drag someone into your own channel. */
export function PullIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="8" cy="8" r="3.4" fill="currentColor" />
            <path d="M2.6 19c0-3 2.4-5 5.4-5s5.4 2 5.4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M22 12h-6M18.5 8.5 22 12l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/** Moderator, undo. Put them back where you took them from. */
export function ReturnIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="16" cy="8" r="3.4" fill="currentColor" />
            <path d="M10.6 19c0-3 2.4-5 5.4-5s5.4 2 5.4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M2 12h6M5.5 8.5 2 12l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function TrashIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M4 6.5h16M9.5 6.5V4.8h5v1.7M6.5 6.5 7.4 20h9.2l.9-13.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/** Their webcam is on. */
export function CameraIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="2.5" y="6" width="13" height="12" rx="2.5" fill="currentColor" />
            <path d="M17 10.5 21.5 8v8l-4.5-2.5v-3Z" fill="currentColor" />
        </svg>
    );
}

export function StreamIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="2.5" y="5" width="14" height="10" rx="2" fill="currentColor" />
            <path d="M18.5 9 22 6.7v10.6L18.5 15V9Z" fill="currentColor" />
        </svg>
    );
}
