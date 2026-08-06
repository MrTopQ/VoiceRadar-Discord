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

import { openImageModal } from "@utils/discord";
import { Tooltip, useEffect, useState } from "@webpack/common";

import { T } from "../i18n";
import { getStreamFor, getStreamPreviewUrl, type StreamRef } from "../streams";
import { toast, ToastType } from "../toast";
import { cl } from "./common";
import { StreamIcon } from "./icons";

/** Loaded on hover. Discord refreshes these thumbnails every few minutes. */
function StreamPreviewCard({ stream, name }: { stream: StreamRef; name: string; }) {
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        // a previous failure must not stick when the stream changes
        setUrl(null);
        setFailed(false);

        void getStreamPreviewUrl(stream).then(preview => {
            if (cancelled) return;
            if (preview) setUrl(preview);
            else setFailed(true);
        });

        return () => {
            cancelled = true;
        };
    }, [stream.channelId, stream.ownerId]);

    return (
        <div className={cl("stream-tooltip")}>
            <div className={cl("stream-tooltip-title")}>{T.streamingBy(name)}</div>

            {url && <img className={cl("stream-preview")} src={url} alt={T.streamPreviewAlt} />}
            {!url && !failed && <div className={cl("stream-placeholder")}>{T.streamPreviewLoading}</div>}
            {failed && <div className={cl("stream-placeholder")}>{T.streamPreviewMissing}</div>}

            <div className={cl("stream-tooltip-hint")}>{T.streamPreviewHint}</div>
        </div>
    );
}

export function StreamIndicator({ userId, name }: { userId: string; name: string; }) {
    const stream = getStreamFor(userId);
    if (!stream) return null;

    const openBigPreview = async () => {
        try {
            const url = await getStreamPreviewUrl(stream);

            if (!url) {
                toast(T.streamPreviewMissingFor(name), ToastType.FAILURE);
                return;
            }

            openImageModal({ url, height: 720, width: 1280 });
        } catch (error) {
            // a click handler is not the place for an unhandled rejection
            console.warn("[VoiceRadar-Discord] could not open the stream preview:", error);
            toast(T.streamPreviewMissingFor(name), ToastType.FAILURE);
        }
    };

    return (
        <Tooltip text={<StreamPreviewCard stream={stream} name={name} />}>
            {tooltipProps => (
                <span
                    {...tooltipProps}
                    className={cl("stream-badge")}
                    role="button"
                    onClick={event => {
                        event.stopPropagation();
                        void openBigPreview();
                    }}
                >
                    <StreamIcon size={14} />
                    {T.badgeLive}
                </span>
            )}
        </Tooltip>
    );
}
