import { signal } from "@preact/signals";
import type { Track } from "../types/music";

export type ReplayGainMode = "track" | "album";

export const REPLAY_GAIN_PREAMP_MIN = -12;
export const REPLAY_GAIN_PREAMP_MAX = 12;
export const REPLAY_GAIN_PREAMP_STEP = 0.5;

const ENABLED_KEY = "ome.replaygain.enabled";
const MODE_KEY = "ome.replaygain.mode";
const PREVENT_CLIPPING_KEY = "ome.replaygain.prevent-clipping";
const PREAMP_KEY = "ome.replaygain.preamp-db";

export const replayGainEnabled = signal(loadEnabled());
export const replayGainMode = signal<ReplayGainMode>(loadMode());
export const replayGainPreventClipping = signal(loadPreventClipping());
export const replayGainPreampDb = signal(loadPreampDb());

let activeTrack: Track | null = null;
export type ReplayGainDeck = "primary" | "secondary";
const replayGainNodes = new Map<ReplayGainDeck, { node: GainNode; track: Track | null }>();
let activeDeck: ReplayGainDeck = "primary";

export interface ReplayGainSettings {
  enabled: boolean;
  mode: ReplayGainMode;
  preventClipping: boolean;
  preampDb: number;
}

type ReplayGainTrack = Pick<
  Track,
  | "source"
  | "replayGainTrackGainDb"
  | "replayGainAlbumGainDb"
  | "replayGainTrackPeak"
  | "replayGainAlbumPeak"
>;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadEnabled(): boolean {
  return readStorage(ENABLED_KEY) === "1";
}

function loadMode(): ReplayGainMode {
  return readStorage(MODE_KEY) === "album" ? "album" : "track";
}

function loadPreventClipping(): boolean {
  return readStorage(PREVENT_CLIPPING_KEY) !== "0";
}

function loadPreampDb(): number {
  const value = Number(readStorage(PREAMP_KEY));
  return clampReplayGainPreampDb(Number.isFinite(value) ? value : 0);
}

export function clampReplayGainPreampDb(db: number): number {
  const finiteDb = Number.isFinite(db) ? db : 0;
  return Math.min(
    REPLAY_GAIN_PREAMP_MAX,
    Math.max(REPLAY_GAIN_PREAMP_MIN, Math.round(finiteDb / REPLAY_GAIN_PREAMP_STEP) * REPLAY_GAIN_PREAMP_STEP),
  );
}

/** Select tag gain and apply peak metadata protection before converting dB to linear gain. */
export function replayGainLinearGain(
  track: ReplayGainTrack | null | undefined,
  settings: ReplayGainSettings,
): number {
  if (!track || track.source !== "local" || !settings.enabled) return 1;

  const trackGain = typeof track.replayGainTrackGainDb === "number" && Number.isFinite(track.replayGainTrackGainDb)
    ? track.replayGainTrackGainDb
    : null;
  const albumGain = typeof track.replayGainAlbumGainDb === "number" && Number.isFinite(track.replayGainAlbumGainDb)
    ? track.replayGainAlbumGainDb
    : null;
  const trackPeak = typeof track.replayGainTrackPeak === "number" && Number.isFinite(track.replayGainTrackPeak) && track.replayGainTrackPeak > 0
    ? track.replayGainTrackPeak
    : null;
  const albumPeak = typeof track.replayGainAlbumPeak === "number" && Number.isFinite(track.replayGainAlbumPeak) && track.replayGainAlbumPeak > 0
    ? track.replayGainAlbumPeak
    : null;
  const gainDb = (settings.mode === "album" ? albumGain ?? trackGain : trackGain) ?? 0;
  const peak = settings.mode === "album" ? albumPeak ?? trackPeak : trackPeak;
  let appliedDb = gainDb + clampReplayGainPreampDb(settings.preampDb);

  if (settings.preventClipping && peak !== null) {
    appliedDb = Math.min(appliedDb, -20 * Math.log10(peak));
  }

  // Bound malformed or unusually large tags even when a peak tag is missing.
  appliedDb = Math.min(24, Math.max(-60, appliedDb));
  return Math.pow(10, appliedDb / 20);
}

function currentSettings(): ReplayGainSettings {
  return {
    enabled: replayGainEnabled.value,
    mode: replayGainMode.value,
    preventClipping: replayGainPreventClipping.value,
    preampDb: replayGainPreampDb.value,
  };
}

function applyGain(): void {
  const settings = currentSettings();
  for (const { node, track } of replayGainNodes.values()) {
    node.gain.value = replayGainLinearGain(track, settings);
  }
}

function persist(): void {
  try {
    localStorage.setItem(ENABLED_KEY, replayGainEnabled.value ? "1" : "0");
    localStorage.setItem(MODE_KEY, replayGainMode.value);
    localStorage.setItem(PREVENT_CLIPPING_KEY, replayGainPreventClipping.value ? "1" : "0");
    localStorage.setItem(PREAMP_KEY, String(replayGainPreampDb.value));
  } catch {
    /* Storage may be unavailable in a restricted webview. */
  }
}

export function registerReplayGainNode(node: GainNode, deck: ReplayGainDeck = "primary"): void {
  replayGainNodes.set(deck, { node, track: deck === activeDeck ? activeTrack : null });
  applyGain();
}

/** Keep each crossfade deck's ReplayGain tied to its own track while both are audible. */
export function setReplayGainNodeTrack(deck: ReplayGainDeck, track: Track | null): void {
  const registration = replayGainNodes.get(deck);
  if (!registration) return;
  registration.track = track;
  if (deck === activeDeck) activeTrack = track;
  applyGain();
}

/** Select which deck the legacy active-track setter controls after a transition settles. */
export function setActiveReplayGainDeck(deck: ReplayGainDeck): void {
  activeDeck = deck;
  activeTrack = replayGainNodes.get(deck)?.track ?? null;
  applyGain();
}

/** Called synchronously on each track selection, before local or remote source resolution. */
export function setReplayGainTrack(track: Track | null): void {
  activeTrack = track;
  const registration = replayGainNodes.get(activeDeck);
  if (registration) registration.track = track;
  applyGain();
}

export function setReplayGainEnabled(enabled: boolean): void {
  replayGainEnabled.value = enabled;
  applyGain();
  persist();
}

export function setReplayGainMode(mode: ReplayGainMode): void {
  replayGainMode.value = mode === "album" ? "album" : "track";
  applyGain();
  persist();
}

export function setReplayGainPreventClipping(prevent: boolean): void {
  replayGainPreventClipping.value = prevent;
  applyGain();
  persist();
}

export function setReplayGainPreampDb(db: number): void {
  replayGainPreampDb.value = clampReplayGainPreampDb(db);
  applyGain();
  persist();
}

/** Replace all ReplayGain preferences atomically after a fully validated import. */
export function restoreReplayGainSettings(settings: ReplayGainSettings): boolean {
  if (
    !settings || typeof settings.enabled !== "boolean" ||
    (settings.mode !== "track" && settings.mode !== "album") ||
    typeof settings.preventClipping !== "boolean" || !Number.isFinite(settings.preampDb) ||
    settings.preampDb < REPLAY_GAIN_PREAMP_MIN || settings.preampDb > REPLAY_GAIN_PREAMP_MAX ||
    Math.abs(settings.preampDb / REPLAY_GAIN_PREAMP_STEP - Math.round(settings.preampDb / REPLAY_GAIN_PREAMP_STEP)) > 1e-8
  ) return false;

  replayGainEnabled.value = settings.enabled;
  replayGainMode.value = settings.mode;
  replayGainPreventClipping.value = settings.preventClipping;
  replayGainPreampDb.value = clampReplayGainPreampDb(settings.preampDb);
  applyGain();
  persist();
  return true;
}
