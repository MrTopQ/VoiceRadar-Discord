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

import { T } from "../i18n";
import { settings } from "../settings";
import { cl, HeadButton } from "./common";
import { GearIcon } from "./icons";
import { openPopover } from "./PopoverMenu";

const GEAR_SIZE = 14;

function OptionRow({ title, hint, checked, disabled, onChange }: {
    title: string;
    hint: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (isOn: boolean) => void;
}) {
    return (
        <label className={cl("option") + (disabled ? " " + cl("option-off") : "")}>
            <span className={cl("option-text")}>
                <span className={cl("option-title")}>{title}</span>
                <span className={cl("option-hint")}>{hint}</span>
            </span>
            <input
                className={cl("switch")}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={event => onChange(event.target.checked)}
            />
        </label>
    );
}

function PopoutOptions() {
    const { openInOwnWindow, hideOwnWindow } = settings.use(["openInOwnWindow", "hideOwnWindow"]);

    return (
        <>
            <OptionRow
                title={T.popoutDirect}
                hint={T.popoutDirectHint}
                checked={openInOwnWindow}
                onChange={isOn => void (settings.store.openInOwnWindow = isOn)}
            />
            <OptionRow
                title={T.popoutHideInstead}
                hint={T.popoutHideInsteadHint}
                checked={hideOwnWindow}
                disabled={!openInOwnWindow}
                onChange={isOn => void (settings.store.hideOwnWindow = isOn)}
            />
        </>
    );
}

/** The narrow half beside the separate window's button, lit while the radar opens straight in that window. */
export function PopoutOptionsButton() {
    const { openInOwnWindow } = settings.use(["openInOwnWindow"]);

    const open = (anchor: Element) => openPopover(
        anchor,
        { role: "dialog", label: T.popoutOptions, boxClass: cl("menu") + " " + cl("option-panel"), focus: "input" },
        () => <PopoutOptions />
    );

    return (
        <HeadButton
            icon={<GearIcon size={GEAR_SIZE} />}
            label={T.popoutOptions}
            active={openInOwnWindow}
            extraClass={cl("head-split-more")}
            onClick={event => open(event.currentTarget)}
        />
    );
}
