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

import { findComponentByCodeLazy } from "@webpack";
import { FluxDispatcher, Tooltip, useCallback, useEffect, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { type ApiHealth, HealthReport, isFound } from "../apiHealth";
import { channelLabel, getVoiceInfo } from "../channels";
import { formatHotkey, parseHotkey } from "../hotkey";
import { T } from "../i18n";
import { DEFAULT_AVATAR_URL, getAvatarUrl, getUserDisplayName } from "../names";
import { DEFAULT_HOTKEY, settings } from "../settings";
import { getAutoJoinTarget, getUsers, subscribeToStore } from "../store";
import { throttle } from "../throttle";
import { cl } from "./common";
import { RadarIcon } from "./icons";
import { openRadarModal } from "./RadarModal";

const PanelButton = findComponentByCodeLazy(".GREEN,positionKeyStemOverride:");

const TOOLTIP_MAX_USERS = 6;
const UPDATE_THROTTLE_MS = 750;

interface LiveUser {
    id: string;
    name: string;
    where: string;
}

function collectLiveUsers(): LiveUser[] {
    const live: LiveUser[] = [];

    for (const user of getUsers()) {
        const voice = getVoiceInfo(user.id);
        if (!voice) continue;

        live.push({
            id: user.id,
            name: getUserDisplayName(user.id, user.name),
            where: channelLabel(voice)
        });
    }

    return live;
}

function sameLiveUsers(a: LiveUser[], b: LiveUser[]): boolean {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id || a[i].name !== b[i].name || a[i].where !== b[i].where) return false;
    }

    return true;
}

function RadarIconWithBadge({ count }: { count: number; }) {
    return (
        <div className={cl("panel-icon")}>
            <RadarIcon size={20} />
            {count > 0 && <span className={cl("panel-badge")}>{count > 99 ? "99+" : count}</span>}
        </div>
    );
}

export function panelButtonProblems(): ApiHealth {
    if (!settings.store.showPanelButton) return new HealthReport();

    return new HealthReport().nice(() => isFound(PanelButton), T.apiPanelButton);
}

interface PanelButtonProps {
    tooltipText: ReactNode;
    icon: () => ReactNode;
    onClick: () => void;
    plated: boolean;
}

function PanelButtonOrFallback(props: PanelButtonProps) {
    if (isFound(PanelButton)) return <PanelButton {...props} />;

    return (
        <Tooltip text={props.tooltipText}>
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    className={cl("panel-fallback")}
                    onClick={props.onClick}
                    aria-label="Voice Radar"
                >
                    {props.icon()}
                </button>
            )}
        </Tooltip>
    );
}

function PanelTooltip({ live }: { live: LiveUser[]; }) {
    const hotkey = formatHotkey(parseHotkey(settings.store.hotkey || DEFAULT_HOTKEY));
    const target = getAutoJoinTarget();

    return (
        <div className={cl("panel-tooltip")}>
            <div className={cl("panel-tooltip-title")}>{T.panelTitle(hotkey)}</div>
            {live.length ? (
                <>
                    {live.slice(0, TOOLTIP_MAX_USERS).map(user => (
                        <div key={user.id} className={cl("panel-tooltip-row")}>
                            <img
                                className={cl("tip-avatar")}
                                src={getAvatarUrl(user.id) ?? DEFAULT_AVATAR_URL}
                                alt=""
                            />
                            {user.name} <span className={cl("dim")}>— {user.where}</span>
                        </div>
                    ))}
                    {live.length > TOOLTIP_MAX_USERS && (
                        <div className={cl("dim")}>{T.tooltipAndMore(live.length - TOOLTIP_MAX_USERS)}</div>
                    )}
                </>
            ) : (
                <div className={cl("dim")}>{T.panelNobodyInVoice}</div>
            )}
            {target && (
                <div className={cl("panel-tooltip-row")}>
                    {T.panelAutoJoin(
                        getUserDisplayName(target.id, target.name),
                        !!settings.store.silentJoin
                    )}
                </div>
            )}
        </div>
    );
}

export function VoiceRadarPanelButton(props: { nameplate?: any; }) {
    const [live, setLive] = useState<LiveUser[]>([]);

    useEffect(() => {
        const update = throttle(() => setLive(previous => {
            const next = collectLiveUsers();
            return sameLiveUsers(previous, next) ? previous : next;
        }), UPDATE_THROTTLE_MS);

        update();
        const unsubscribe = subscribeToStore(update);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", update);

        return () => {
            update.cancel();
            unsubscribe();
            FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", update);
        };
    }, []);

    const count = live.length;
    const icon = useCallback(() => <RadarIconWithBadge count={count} />, [count]);

    return (
        <PanelButtonOrFallback
            tooltipText={<PanelTooltip live={live} />}
            icon={icon}
            onClick={openRadarModal}
            plated={props?.nameplate != null}
        />
    );
}
