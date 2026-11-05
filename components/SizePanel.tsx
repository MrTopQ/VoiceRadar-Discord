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

import { useState } from "@webpack/common";
import type { CSSProperties } from "react";

import { T } from "../i18n";
import { setPluginSize } from "../pluginSize";
import { DEFAULT_PLUGIN_SIZE, getPluginSize, MAX_PLUGIN_SIZE, MIN_PLUGIN_SIZE, PLUGIN_SIZE_STEP } from "../settings";
import { cl, HeadButton } from "./common";
import { SizeIcon } from "./icons";
import { openPopover } from "./PopoverMenu";

function SizePanel() {
    const [size, setSize] = useState(getPluginSize);

    const change = (next: number) => {
        setSize(next);
        setPluginSize(next);
    };

    const filled = (size - MIN_PLUGIN_SIZE) / (MAX_PLUGIN_SIZE - MIN_PLUGIN_SIZE) * 100;

    return (
        <>
            <div className={cl("size-head")}>
                <span className={cl("size-title")}>{T.sizeTitle}</span>
                <span className={cl("size-value")}>{size}%</span>
            </div>
            <div className={cl("size-row")}>
                <button
                    className={cl("size-step")}
                    aria-label={T.sizeSmaller}
                    disabled={size <= MIN_PLUGIN_SIZE}
                    onClick={() => change(size - PLUGIN_SIZE_STEP)}
                >
                    −
                </button>
                <input
                    className={cl("size-slider")}
                    type="range"
                    aria-label={T.sizeTitle}
                    min={MIN_PLUGIN_SIZE}
                    max={MAX_PLUGIN_SIZE}
                    step={PLUGIN_SIZE_STEP}
                    value={size}
                    style={{ "--vr-size-filled": `${filled}%` } as CSSProperties}
                    onChange={event => change(Number(event.target.value))}
                />
                <button
                    className={cl("size-step")}
                    aria-label={T.sizeLarger}
                    disabled={size >= MAX_PLUGIN_SIZE}
                    onClick={() => change(size + PLUGIN_SIZE_STEP)}
                >
                    +
                </button>
            </div>
            <button className={cl("chip") + " " + cl("size-reset")} disabled={size === DEFAULT_PLUGIN_SIZE} onClick={() => change(DEFAULT_PLUGIN_SIZE)}>
                {T.sizeReset}
            </button>
        </>
    );
}

/** The panel stays where it opened while the window behind it changes, so the result shows at once. */
export function SizeButton() {
    const open = (anchor: Element) => openPopover(
        anchor,
        { role: "dialog", label: T.sizeTitle, boxClass: cl("menu") + " " + cl("size-panel"), focus: "input", fixedSize: true },
        () => <SizePanel />
    );

    return <HeadButton icon={<SizeIcon />} label={T.sizeTitle} onClick={event => open(event.currentTarget)} />;
}
