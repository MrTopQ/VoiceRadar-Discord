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

import { findByPropsLazy } from "@webpack";

import { clearReported, isFn, probe, reportBroken } from "./apiHealth";
import { T } from "./i18n";
import { CHIME_SOUND, getJoinSound, getJoinSoundVolume } from "./settings";

const soundPlayer = findByPropsLazy("playSound");
const soundFactory = findByPropsLazy("createSound");

const CHIME_TONES = [784, 1047];
const CHIME_TONE_MS = 90;
const CHIME_GAIN = 0.18;

const SOUND_GAP_MS = 800;
let lastPlayedAt = 0;

let chimeContext: AudioContext | null = null;

function discordPlayer(): ((name: string, volume?: number) => void) | null {
    if (probe(() => isFn((soundPlayer as any)?.playSound))) {
        return (name, volume) => (soundPlayer as any).playSound(name, volume);
    }

    if (probe(() => isFn((soundFactory as any)?.createSound))) {
        return name => (soundFactory as any).createSound(name)?.play?.();
    }

    return null;
}

function playDiscordSound(name: string, volume: number): boolean {
    const play = discordPlayer();
    if (!play) return false;

    try {
        play(name, volume);
        return true;
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not play a Discord sound:", error);
        return false;
    }
}

function chimeAudioContext(): AudioContext | null {
    if (chimeContext) return chimeContext;

    const Context = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!isFn(Context)) return null;

    try {
        chimeContext = new Context();
        return chimeContext;
    } catch (error) {
        console.warn("[VoiceRadar-Discord] no audio context for the join chime:", error);
        return null;
    }
}

function playChime(volume: number): void {
    const context = chimeAudioContext();
    if (!context) return;

    try {
        void context.resume?.();

        CHIME_TONES.forEach((frequency, index) => {
            const startAt = context.currentTime + index * (CHIME_TONE_MS / 1000);
            const endAt = startAt + CHIME_TONE_MS / 1000;

            const oscillator = context.createOscillator();
            const gain = context.createGain();

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;

            gain.gain.setValueAtTime(0, startAt);
            gain.gain.linearRampToValueAtTime(CHIME_GAIN * volume, startAt + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

            oscillator.connect(gain);
            gain.connect(context.destination);

            oscillator.start(startAt);
            oscillator.stop(endAt + 0.02);
        });
    } catch (error) {
        console.warn("[VoiceRadar-Discord] the join chime failed:", error);
    }
}

export function playJoinSound(): void {
    const choice = getJoinSound();
    if (choice === "off") return;

    const volume = getJoinSoundVolume();
    if (volume <= 0) return;

    const now = Date.now();
    if (now - lastPlayedAt < SOUND_GAP_MS) return;
    lastPlayedAt = now;

    if (choice === CHIME_SOUND) {
        playChime(volume);
        return;
    }

    if (playDiscordSound(choice, volume)) {
        clearReported(T.apiJoinSound);
        return;
    }

    reportBroken(T.apiJoinSound);
    playChime(volume);
}

export function forgetSoundState(): void {
    lastPlayedAt = 0;

    try {
        void chimeContext?.close?.();
    } catch (error) {
        console.warn("[VoiceRadar-Discord] could not close the audio context:", error);
    }

    chimeContext = null;
}

export function usesDiscordSounds(): boolean {
    const choice = getJoinSound();
    return choice !== "off" && choice !== CHIME_SOUND;
}
