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

/** Discord's own device icon paths, as used by Vencord's PlatformIndicators. */
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

export function SizeIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="m2.5 18.5 6-14 6 14M4.7 14h7.6" {...stroke} />
            <path d="m15 18.5 3.5-8 3.5 8M16.2 16h4.6" {...stroke} />
        </svg>
    );
}

export function SpeakerOffIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M2.5 9h3.8l5.2-4.5v15L6.3 15H2.5V9Z" fill="currentColor" />
            <path d="m15.5 9 5.5 6M21 9l-5.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

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

export function ClockIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

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

export function PullIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="8" cy="8" r="3.4" fill="currentColor" />
            <path d="M2.6 19c0-3 2.4-5 5.4-5s5.4 2 5.4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M22 12h-6M18.5 8.5 22 12l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

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

export function InfoIcon({ size = 14, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="7.8" r="1.1" fill="currentColor" />
        </svg>
    );
}

export function ShieldIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M12 3 5 6v5.5c0 4.2 2.9 8 7 9.5 4.1-1.5 7-5.3 7-9.5V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function ChevronDownIcon({ size = 14, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="m6.5 9.5 5.5 5.5 5.5-5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function SearchIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
            <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function GlobeIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
            <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
    );
}

export function PopOutIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M14 4h6v6M20 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function PopInIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M20 4l-8 8M12 7v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function OnTopIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M5 4h14M12 20V9M7.5 13.5 12 9l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function PlusIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function CloseIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function MicIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function KeyboardIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="2.5" y="6" width="19" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M6.5 10h1M10 10h1M13.5 10h1M17 10h.5M8 14h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function ExternalIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M14 4h6v6M20 4l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function GearIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path
                d="M10.3 3h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.5h-3.4l-.5-2.5-1.6-.9-2.3.8-1.7-2.9 1.8-1.6v-1.9L4.2 8.4l1.7-2.9 2.3.8 1.6-.9.5-2.4Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.7" />
        </svg>
    );
}

const stroke = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function PeopleIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="9" cy="8.5" r="3.2" {...stroke} />
            <path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5M16 6.4a2.6 2.6 0 0 1 0 5.2M16.5 14.2c2.2.3 3.6 2 4 4.8" {...stroke} />
        </svg>
    );
}

export function RouteIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M4 8h13M13.5 4.5 17 8l-3.5 3.5M20 16H7M10.5 12.5 7 16l3.5 3.5" {...stroke} />
        </svg>
    );
}

export function ServerIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="4" y="4" width="16" height="7" rx="2" {...stroke} />
            <rect x="4" y="13" width="16" height="7" rx="2" {...stroke} />
            <path d="M8 7.5h.01M8 16.5h.01" {...stroke} strokeWidth={2.6} />
        </svg>
    );
}

export function ListIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M9.5 7H20M9.5 12H20M9.5 17H20M4.8 7h.01M4.8 12h.01M4.8 17h.01" {...stroke} />
        </svg>
    );
}

export function WindowIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" {...stroke} />
            <path d="M3 9h18M6.3 6.8h.01M8.8 6.8h.01" {...stroke} />
        </svg>
    );
}

export function PanelIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" {...stroke} />
            <path d="M3 14.5h18M7 17h3M14 17h3" {...stroke} />
        </svg>
    );
}

export function CardIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="2.5" y="5" width="19" height="14" rx="2.5" {...stroke} />
            <circle cx="8" cy="10.5" r="2" {...stroke} />
            <path d="M5.5 15.5c.6-1.3 1.5-1.9 2.5-1.9s1.9.6 2.5 1.9M13.5 10h5M13.5 13.5h3.5" {...stroke} />
        </svg>
    );
}

export function MessageIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" {...stroke} />
            <path d="M7.5 10h9M7.5 13h6" {...stroke} />
        </svg>
    );
}

export function MusicIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M9 17.5V6l10-2v11.5" {...stroke} />
            <circle cx="6.5" cy="17.5" r="2.5" {...stroke} />
            <circle cx="16.5" cy="15.5" r="2.5" {...stroke} />
        </svg>
    );
}

export function DatabaseIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <ellipse cx="12" cy="6" rx="7" ry="2.8" {...stroke} />
            <path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" {...stroke} />
        </svg>
    );
}

export function ChipIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="6.5" y="6.5" width="11" height="11" rx="2" {...stroke} />
            <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1" fill="currentColor" />
            <path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21" {...stroke} />
        </svg>
    );
}

export function PulseIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M3 12h4l2.5-6 5 12 2.5-6h4" {...stroke} />
        </svg>
    );
}

export function RefreshIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15" {...stroke} strokeWidth={2} />
        </svg>
    );
}

export function AlertIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M12 4 2.8 19.5h18.4L12 4Z" {...stroke} />
            <path d="M12 10v4.2M12 17h.01" {...stroke} strokeWidth={2.2} />
        </svg>
    );
}

export function CheckCircleIcon({ size = 18, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="12" cy="12" r="8.5" {...stroke} />
            <path d="m8.5 12.2 2.4 2.4 4.6-4.8" {...stroke} strokeWidth={2} />
        </svg>
    );
}

export function BulbIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M9.5 17.5h5M10.5 20.5h3M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.8.6 1.3 1.5 1.3 2.5v.1h4v-.1c0-1 .5-1.9 1.3-2.5A5.5 5.5 0 0 0 12 3.5Z" {...stroke} />
        </svg>
    );
}

export function LeaveIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M10 12h10M16.5 8.2l3.5 3.8-3.5 3.8" {...stroke} />
        </svg>
    );
}

export function InvisibleIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M9.9 5.2A9.5 9.5 0 0 1 12 5c5.5 0 9 5.2 9.5 7-.2.8-1 2.1-2.2 3.4M6.3 6.8C3.9 8.3 2.8 10.7 2.5 12c.5 1.8 4 7 9.5 7 1.9 0 3.5-.6 4.9-1.5" {...stroke} />
            <path d="M10 10a3 3 0 0 0 4.1 4.1M3.5 3.5l17 17" {...stroke} />
        </svg>
    );
}

export function EyeIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...stroke} />
            <circle cx="12" cy="12" r="2.8" {...stroke} />
        </svg>
    );
}

export function PlugIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <path d="M9 3.5V8M15 3.5V8M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8ZM12 16.5v4" {...stroke} />
        </svg>
    );
}

export function UserIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <circle cx="12" cy="8" r="3.6" {...stroke} />
            <path d="M5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6" {...stroke} />
        </svg>
    );
}

export function StreamOffIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="3" y="5.5" width="13" height="9.5" rx="2" {...stroke} />
            <path d="M19 9.5 21.5 8v7.5L19 14M3.5 20 20.5 3.5" {...stroke} />
        </svg>
    );
}

export function CameraOffIcon({ size = 16, className }: IconProps) {
    return (
        <svg {...base(size)} className={className}>
            <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" {...stroke} />
            <path d="M17.5 10.5 21.5 8v8l-4-2.5M3.5 20.5 20.5 3.5" {...stroke} />
        </svg>
    );
}
