import { computed, signal } from "@preact/signals";
import type { Track } from "../types/music";
import { neteaseStreamUrl, recordPlaybackEvent, bilibiliProxySrc, bilibiliStreamUrl } from "../lib/api";
import { toPlayableSrc } from "../lib/audio";
import { djConfig } from "./dj";
import { introFor, radioEnabled, radioNext, recordSkip, recordRecentPlay } from "./radio";
import { speak } from "./tts";
import { consumeTrackEndSleep, sleepMode } from "./sleeptimer";
import { createEqChain, registerEqFilters, registerEqPreamp } from "./equalizer";
import {
  registerReplayGainNode,
  setActiveReplayGainDeck,
  setReplayGainNodeTrack,
  type ReplayGainDeck,
} from "./replaygain";
import { createChannelToolsAudioChain } from "./channel-tools";
import { fadeEnabled } from "./fade";
import {
  CROSSFADE_CURVE_STEPS,
  crossfadeDurationSeconds,
  crossfadeGainCurves,
  crossfadeGains,
  shouldStartAutomaticCrossfade,
} from "./crossfade";
import { applySinkId } from "./audioout";
import { playbackActive } from "./playback-status";
import {
  createQueueSessionSnapshot,
  parseQueueSessionSnapshot,
  QUEUE_SESSION_KEY,
  readQueueSessionSnapshot,
  rehydrateQueueSession,
  writeQueueSessionSnapshot,
  type QueueSessionSnapshot,
} from "../lib/queue-session";

export const queue = signal<Track[]>([]);
/** 播放列表抽屉开关 */
export const queueOpen = signal(false);
export const currentIndex = signal(-1);
export type RepeatMode = "off" | "one" | "all";
const REPEAT_MODE_KEY = "ome.repeat-mode";

function readRepeatMode(): RepeatMode {
  try {
    const stored = localStorage.getItem(REPEAT_MODE_KEY);
    return stored === "one" || stored === "all" ? stored : "off";
  } catch {
    return "off";
  }
}

export const repeatMode = signal<RepeatMode>(readRepeatMode());
function readLastManualQueueSession(): QueueSessionSnapshot | null {
  try {
    return readQueueSessionSnapshot(localStorage);
  } catch {
    return null;
  }
}

export const lastManualQueueSession = signal<QueueSessionSnapshot | null>(readLastManualQueueSession());
let manualQueueOverride = false;
let manualQueueSessionForgotten = false;

function saveManualQueueSession(index = currentIndex.value): void {
  if (!manualQueueOverride || manualQueueSessionForgotten) return;
  const snapshot = createQueueSessionSnapshot(queue.value, index);
  if (!snapshot) return;
  try {
    if (writeQueueSessionSnapshot(localStorage, snapshot)) lastManualQueueSession.value = snapshot;
  } catch {
    // Storage can be unavailable; queue playback continues for this session.
  }
}

function markManualQueue(index = currentIndex.value): void {
  manualQueueOverride = true;
  manualQueueSessionForgotten = false;
  saveManualQueueSession(index);
}

/** 配置好的 AI 电台接管曲尾选曲，队列循环与随机操作在此时暂停。 */
export const queueModesLocked = computed(() => radioEnabled.value && djConfig.value?.configured === true);
export const isPlaying = playbackActive;
export const position = signal(0);
export const duration = signal(0);
export const volume = signal(0.9);
/** 取流/播放失败提示（如「该歌曲需要 VIP 或无版权」） */
export const playbackError = signal<string | null>(null);
/** DJ 正在说歌前介绍（player-bar 可据此淡化标题） */
export const introPlaying = signal(false);

export const currentTrack = computed<Track | null>(
  () => queue.value[currentIndex.value] ?? null
);
export const shuffleAvailable = computed(() => {
  const activeIndex = currentIndex.value;
  const upcomingCount = activeIndex >= 0 && activeIndex < queue.value.length
    ? queue.value.length - activeIndex - 1
    : queue.value.length;
  return !queueModesLocked.value && upcomingCount > 1;
});

export function isPlaybackEventRecordable(track: Pick<Track, "source"> | null): boolean {
  return track !== null
    && track.source !== "subsonic"
    && track.source !== "jellyfin"
    && track.source !== "emby"
    && track.source !== "webdav"
    && track.source !== "smb";
}

function recordTrackPlaybackEvent(
  track: Track | null,
  eventType: Parameters<typeof recordPlaybackEvent>[1],
  positionSeconds: number,
): void {
  if (!track || !isPlaybackEventRecordable(track)) return;
  void recordPlaybackEvent(track.id, eventType, positionSeconds);
}

type AudioDeck = {
  id: ReplayGainDeck;
  element: HTMLAudioElement;
  track: Track | null;
  replayGain: GainNode | null;
  transitionGain: GainNode | null;
};

type PlaybackOrigin = "selection" | "skip" | "automatic" | "radio";

type ActiveCrossfade = {
  token: number;
  outgoing: AudioDeck;
  incoming: AudioDeck;
  startedAt: number;
  duration: number;
  timer: number | null;
  fallbackTimer: number | null;
};

type PendingPlayback = {
  requestId: number;
  track: Track;
  index: number;
  outgoing: AudioDeck;
  incoming: AudioDeck | null;
  origin: PlaybackOrigin;
  promise: Promise<boolean>;
};

let audio: HTMLAudioElement | null = null;
const decks = new Map<ReplayGainDeck, AudioDeck>();
let audioContext: AudioContext | null = null;
let sharedEqInput: AudioNode | null = null;
let masterGain: GainNode | null = null;
let activeCrossfade: ActiveCrossfade | null = null;
let crossfadeToken = 0;
let playbackRequestId = 0;
let pendingPlayback: PendingPlayback | null = null;
let automaticTransitionForTrack: string | null = null;
const endedEventsRecorded = new WeakSet<HTMLAudioElement>();

/* ---- 两个 audio deck 共用一条 EQ / 声道处理链，保留单曲播放的处理与频谱 ---- */
let analyser: AnalyserNode | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;

function ensureSharedAudioGraph(): AudioContext | null {
  if (audioContext) return audioContext;
  try {
    const Ctx = window.AudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const eqChain = createEqChain(ctx);
    const eqPreamp = ctx.createGain();
    const channelTools = createChannelToolsAudioChain(ctx);
    const node = ctx.createAnalyser();
    const master = ctx.createGain();
    node.fftSize = 128;
    node.smoothingTimeConstant = 0.82;
    eqChain[eqChain.length - 1].connect(eqPreamp);
    eqPreamp.connect(channelTools.input);
    eqPreamp.connect(channelTools.bypass);
    channelTools.output.connect(node);
    channelTools.bypass.connect(node);
    node.connect(master);
    master.connect(ctx.destination);
    master.gain.value = volume.value;
    registerEqFilters(eqChain);
    registerEqPreamp(eqPreamp);
    audioContext = ctx;
    sharedEqInput = eqChain[0];
    masterGain = master;
    analyser = node;
    freqData = new Uint8Array(node.frequencyBinCount);
    return ctx;
  } catch {
    return null;
  }
}

function setAudioParamNow(param: AudioParam, value: number, context: AudioContext | null): void {
  try {
    if (context) {
      const now = context.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(value, now);
    } else {
      param.value = value;
    }
  } catch {
    param.value = value;
  }
}

function setDeckEnvelope(deck: AudioDeck, value: number): void {
  const safeValue = Math.min(1, Math.max(0, value));
  if (deck.transitionGain) {
    setAudioParamNow(deck.transitionGain.gain, safeValue, audioContext);
    deck.element.volume = 1;
  } else {
    deck.element.volume = volume.value * safeValue;
  }
}

function setDeckTrack(deck: AudioDeck, track: Track | null): void {
  deck.track = track;
  setReplayGainNodeTrack(deck.id, track);
}

function clearDeckSource(deck: AudioDeck): void {
  deck.element.pause();
  deck.element.removeAttribute("src");
  deck.element.load();
  setDeckTrack(deck, null);
}

function cleanupCrossfade(keepIncoming: boolean): void {
  const transition = activeCrossfade;
  if (!transition) return;
  activeCrossfade = null;
  crossfadeToken += 1;
  if (transition.timer !== null) {
    window.clearTimeout(transition.timer);
  }
  if (transition.fallbackTimer !== null) window.clearInterval(transition.fallbackTimer);
  const kept = keepIncoming ? transition.incoming : transition.outgoing;
  const discarded = keepIncoming ? transition.outgoing : transition.incoming;
  setDeckEnvelope(kept, 1);
  setDeckEnvelope(discarded, 0);
  if (audio !== kept.element) audio = kept.element;
  setActiveReplayGainDeck(kept.id);
  clearDeckSource(discarded);
}

function createAudioDeck(id: ReplayGainDeck): AudioDeck {
  const element = new Audio();
  element.crossOrigin = "anonymous";
  element.preload = "auto";
  const deck: AudioDeck = { id, element, track: null, replayGain: null, transitionGain: null };
  decks.set(id, deck);

  const context = ensureSharedAudioGraph();
  if (context && sharedEqInput) {
    try {
      const source = context.createMediaElementSource(element);
      const replayGain = context.createGain();
      const transitionGain = context.createGain();
      replayGain.gain.value = 1;
      transitionGain.gain.value = id === "primary" ? 1 : 0;
      source.connect(replayGain);
      replayGain.connect(transitionGain);
      transitionGain.connect(sharedEqInput);
      deck.replayGain = replayGain;
      deck.transitionGain = transitionGain;
      registerReplayGainNode(replayGain, id);
      element.volume = 1;
      element.addEventListener("play", () => void context.resume());
    } catch {
      // If a deck cannot join the shared graph, it remains available for a hard-cut fallback.
    }
  } else {
    element.volume = id === "primary" ? volume.value : 0;
  }

  let lastPersist = 0;
  element.addEventListener("timeupdate", () => {
    if (audio !== element) return;
    applyPendingSeek(deck);
    position.value = element.currentTime;
    const now = Date.now();
    if (now - lastPersist > 5000) {
      lastPersist = now;
      const track = deck.track ?? currentTrack.value;
      if (track) saveLastPlayback(track, position.value);
    }
    maybeStartAutomaticCrossfade(element);
  });
  element.addEventListener("durationchange", () => {
    if (audio !== element) return;
    applyPendingSeek(deck);
    duration.value = Number.isFinite(element.duration) ? element.duration : 0;
  });
  element.addEventListener("play", () => {
    if (audio === element) isPlaying.value = true;
  });
  element.addEventListener("pause", () => {
    if (audio === element) isPlaying.value = false;
  });
  element.addEventListener("loadedmetadata", () => {
    applyPendingSeek(deck);
  });
  element.addEventListener("ended", () => void onEnded(element));
  applySinkId(element);
  return deck;
}

function ensureDeck(id: ReplayGainDeck): AudioDeck {
  return decks.get(id) ?? createAudioDeck(id);
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    const primary = ensureDeck("primary");
    audio = primary.element;
    setActiveReplayGainDeck(primary.id);
  }
  return audio;
}

function activeDeck(): AudioDeck {
  const element = ensureAudio();
  const id = element === decks.get("secondary")?.element ? "secondary" : "primary";
  return decks.get(id)!;
}

function inactiveDeck(): AudioDeck {
  const active = activeDeck();
  return ensureDeck(active.id === "primary" ? "secondary" : "primary");
}

window.addEventListener("ome:output-device", () => {
  for (const deck of decks.values()) applySinkId(deck.element);
});

/** 频谱快照（0-255 频率能量）；未初始化返回 null */
export function spectrumSnapshot(): Uint8Array | null {
  if (!analyser || !freqData) return null;
  analyser.getByteFrequencyData(freqData);
  return freqData;
}

/** 纯逻辑：是否算完整听完（播过 90% 以上，恰好 90% 不算） */
export function endEventType(positionSec: number, durationSec: number): "completed" | "skip" {
  if (durationSec > 0 && positionSec > durationSec * 0.9) return "completed";
  return "skip";
}

/** 纯逻辑：下一个索引；末尾返回 null */
export function advance(index: number, length: number): number | null {
  return index + 1 < length ? index + 1 : null;
}

export type RadioQueueContinuation = { type: "manual"; index: number } | { type: "radio" };

/** 手动序列播完后让 AI 电台恢复选曲；它自身不循环。 */
export function radioQueueContinuation(
  manualQueueActive: boolean,
  index: number,
  length: number,
): RadioQueueContinuation {
  if (!manualQueueActive) return { type: "radio" };
  const nextIndex = advance(index, length);
  return nextIndex === null ? { type: "radio" } : { type: "manual", index: nextIndex };
}

function nextQueueIndex(index: number, automatic: boolean): number | null {
  const length = queue.value.length;
  if (length === 0) return null;
  const mode = queueModesLocked.value ? "off" : repeatMode.value;
  if (automatic && mode === "one" && index >= 0 && index < length) return index;
  const nextIndex = advance(index, length);
  if (nextIndex !== null) return nextIndex;
  return mode === "all" ? 0 : null;
}

export function cycleRepeatMode(): void {
  if (queueModesLocked.value) return;
  const next: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };
  repeatMode.value = next[repeatMode.value];
  try {
    localStorage.setItem(REPEAT_MODE_KEY, repeatMode.value);
  } catch {
    // 存储不可用时仅当前会话生效。
  }
}

/** 纯逻辑：曲目已在队列则返回其下标，否则返回追加后的队尾下标 */
export function queueIndexFor(tracks: Track[], track: Track): number {
  const existing = tracks.findIndex((item) => item.id === track.id);
  return existing === -1 ? tracks.length : existing;
}

/** 起播序号：电台选曲期间用户手动开播了别的歌时，用它丢弃过期的自动接播 */
let playSeq = 0;
/** 歌前介绍会话：快速连点时只保留最新一次介绍 */
let introToken = 0;

/* ---- 续播记忆：上次播放的曲目与进度 ---- */
const LAST_KEY = "ome.last";
let pendingSeekSeconds: number | null = null;

function applyPendingSeek(deck: AudioDeck): boolean {
  if (pendingSeekSeconds === null || audio !== deck.element) return false;
  try {
    deck.element.currentTime = pendingSeekSeconds;
    position.value = deck.element.currentTime;
    pendingSeekSeconds = null;
    return true;
  } catch {
    // Keep the resume point until the active source becomes seekable.
    return false;
  }
}

export function saveLastPlayback(track: Track | null, positionSeconds: number): void {
  try {
    if (!track || track.source === "subsonic" || track.source === "jellyfin" || track.source === "emby" || track.source === "webdav" || track.source === "smb") return;
    localStorage.setItem(LAST_KEY, JSON.stringify({ track, position: Math.round(positionSeconds) }));
  } catch { /* 存储不可用忽略 */ }
}

export function setPendingSeek(seconds: number | null): void {
  pendingSeekSeconds = seconds;
}

export function readLastPlayback(): { track: Track; position: number } | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { track: Track; position: number };
    if (!parsed?.track?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 本地曲目从曲库移除后，不再从续播记忆恢复它。 */
export function forgetLastPlayback(trackId: string): void {
  try {
    const last = readLastPlayback();
    if (last?.track.id === trackId) localStorage.removeItem(LAST_KEY);
  } catch { /* 存储不可用忽略 */ }
}

function invalidatePendingPlayback(): void {
  playbackRequestId += 1;
  automaticTransitionForTrack = null;
  const pending = pendingPlayback;
  pendingPlayback = null;
  if (pending?.incoming && pending.incoming.element !== audio) clearDeckSource(pending.incoming);
}

function recordDeckEnd(deck: AudioDeck): void {
  if (endedEventsRecorded.has(deck.element)) return;
  endedEventsRecorded.add(deck.element);
  const track = deck.track ?? (audio === deck.element ? currentTrack.value : null);
  if (!track) return;
  const positionSeconds = deck.element.currentTime || position.value;
  const durationSeconds = Number.isFinite(deck.element.duration) && deck.element.duration > 0
    ? deck.element.duration
    : duration.value;
  recordTrackPlaybackEvent(track, endEventType(positionSeconds, durationSeconds), Math.round(positionSeconds));
}

function updateCurrentTrack(deck: AudioDeck, track: Track, index: number): void {
  audio = deck.element;
  setActiveReplayGainDeck(deck.id);
  currentIndex.value = index;
  saveManualQueueSession(index);
  position.value = deck.element.currentTime || 0;
  duration.value = Number.isFinite(deck.element.duration) && deck.element.duration > 0
    ? deck.element.duration
    : track.durationSeconds;
  saveLastPlayback(track, position.value);
  playbackError.value = null;
  isPlaying.value = true;
  automaticTransitionForTrack = null;
  applyPendingSeek(deck);
}

function finishCrossfade(token: number): void {
  const transition = activeCrossfade;
  if (!transition || transition.token !== token) return;
  activeCrossfade = null;
  if (transition.timer !== null) window.clearTimeout(transition.timer);
  if (transition.fallbackTimer !== null) window.clearInterval(transition.fallbackTimer);
  setDeckEnvelope(transition.outgoing, 0);
  setDeckEnvelope(transition.incoming, 1);
  clearDeckSource(transition.outgoing);
}

function beginCrossfade(
  outgoing: AudioDeck,
  incoming: AudioDeck,
  track: Track,
  index: number,
  origin: PlaybackOrigin,
  availableSeconds: number,
): void {
  const outgoingDuration = Number.isFinite(outgoing.element.duration) && outgoing.element.duration > 0
    ? outgoing.element.duration
    : outgoing.track?.durationSeconds ?? 0;
  const incomingDuration = Number.isFinite(incoming.element.duration) && incoming.element.duration > 0
    ? incoming.element.duration
    : track.durationSeconds;
  const overlap = crossfadeDurationSeconds(outgoingDuration, incomingDuration, availableSeconds);
  const graphReady = !!outgoing.transitionGain && !!incoming.transitionGain && !!audioContext;
  const bothDirect = !outgoing.transitionGain && !incoming.transitionGain;
  const smooth = (graphReady || bothDirect) && overlap > 0;

  if (origin === "automatic") recordDeckEnd(outgoing);
  updateCurrentTrack(incoming, track, index);
  recordTrackPlaybackEvent(track, "play", 0);

  if (!smooth) {
    setDeckEnvelope(incoming, 1);
    clearDeckSource(outgoing);
    return;
  }

  const token = ++crossfadeToken;
  const transition: ActiveCrossfade = {
    token,
    outgoing,
    incoming,
    startedAt: Date.now(),
    duration: overlap,
    timer: null,
    fallbackTimer: null,
  };
  activeCrossfade = transition;

  if (graphReady && audioContext) {
    const now = audioContext.currentTime;
    const beginsAt = now + 0.025;
    const curves = crossfadeGainCurves(CROSSFADE_CURVE_STEPS);
    try {
      const outgoingGain = outgoing.transitionGain!.gain;
      const incomingGain = incoming.transitionGain!.gain;
      outgoingGain.cancelScheduledValues(now);
      incomingGain.cancelScheduledValues(now);
      outgoingGain.setValueAtTime(1, now);
      incomingGain.setValueAtTime(0, now);
      outgoingGain.setValueCurveAtTime(curves.outgoing, beginsAt, overlap);
      incomingGain.setValueCurveAtTime(curves.incoming, beginsAt, overlap);
      transition.timer = window.setTimeout(() => finishCrossfade(token), overlap * 1000 + 80);
      return;
    } catch {
      // The browser may reject a scheduled curve; fall back to a timed equal-power ramp.
    }
  }

  transition.fallbackTimer = window.setInterval(() => {
    const progress = Math.min(1, (Date.now() - transition.startedAt) / (transition.duration * 1000));
    const gains = crossfadeGains(progress);
    setDeckEnvelope(transition.outgoing, gains.outgoing);
    setDeckEnvelope(transition.incoming, gains.incoming);
    if (progress >= 1) finishCrossfade(token);
  }, 32);
}

function settleCrossfade(): void {
  cleanupCrossfade(true);
}

function maybeStartAutomaticCrossfade(element: HTMLAudioElement): void {
  if (
    audio !== element || !fadeEnabled.value || activeCrossfade || pendingPlayback ||
    sleepMode.value === "track" || (radioEnabled.value && djConfig.value?.configured)
  ) return;
  const track = currentTrack.value;
  const nextIndex = nextQueueIndex(currentIndex.value, true);
  const deck = activeDeck();
  if (!track || (deck.track && deck.track.id !== track.id) || nextIndex === null || nextIndex === currentIndex.value || automaticTransitionForTrack === track.id) return;
  const trackDuration = Number.isFinite(element.duration) && element.duration > 0
    ? element.duration
    : duration.value;
  if (!shouldStartAutomaticCrossfade(element.currentTime, trackDuration)) return;
  automaticTransitionForTrack = track.id;
  void playImmediate(nextIndex, "automatic");
}

function stopAtQueueEnd() {
  invalidatePendingPlayback();
  settleCrossfade();
  audio?.pause();
  isPlaying.value = false;
  position.value = 0;
}

async function onEnded(element: HTMLAudioElement) {
  if (audio !== element) return;
  // 睡眠定时「播完当前」：在一切切歌逻辑之前消费
  if (consumeTrackEndSleep()) {
    stopAtQueueEnd();
    return;
  }

  const active = activeDeck();
  const pending = pendingPlayback?.outgoing === active ? pendingPlayback : null;
  if (pending?.origin !== "skip") recordDeckEnd(active);
  if (pending) {
    const succeeded = await pending.promise;
    if (succeeded) return;
    if (pending.requestId !== playbackRequestId) return;
    const expectedNext = nextQueueIndex(currentIndex.value, true);
    if (pending.index === expectedNext && queue.value[pending.index] === pending.track) {
      stopAtQueueEnd();
      return;
    }
  }

  if (introPlaying.value) return;
  const track = active.track ?? currentTrack.value;
  // 已配置 DJ 时，电台接管整条曲尾流程并按歌前介绍承接。
  if (radioEnabled.value && djConfig.value?.configured) {
    const continuation = radioQueueContinuation(manualQueueOverride, currentIndex.value, queue.value.length);
    if (continuation.type === "manual") {
      await playWithRadioIntro(queue.value[continuation.index], continuation.index, "ended");
      return;
    }
    if (manualQueueOverride) {
      manualQueueOverride = false;
    }
    const seqAtEnd = playSeq;
    const nextTrack = await radioNext(track?.id ?? null);
    if (playSeq !== seqAtEnd) return; // 选曲期间用户手动开播了：不抢播放
    if (!nextTrack) {
      stopAtQueueEnd();
      return;
    }
    const nextIndex = queueIndexFor(queue.value, nextTrack);
    if (nextIndex === queue.value.length) queue.value = [...queue.value, nextTrack];
    await playWithRadioIntro(nextTrack, nextIndex, "ended");
    return;
  }

  // DJ 离线时仍按本地画像续播。用户正在听手动队列时先尊重其循环/队列，
  // 手动队列结束后再回到本地电台选曲。
  if (radioEnabled.value) {
    const queuedNextIndex = nextQueueIndex(currentIndex.value, true);
    const shouldFollowQueue = manualQueueOverride || repeatMode.value !== "off";
    if (shouldFollowQueue && queuedNextIndex !== null) {
      void playImmediate(queuedNextIndex, "automatic");
      return;
    }
    if (manualQueueOverride) manualQueueOverride = false;

    const seqAtEnd = playSeq;
    const nextTrack = await radioNext(track?.id ?? null);
    if (playSeq !== seqAtEnd) return; // 选曲期间用户手动开播了：不抢播放
    if (!nextTrack) {
      stopAtQueueEnd();
      return;
    }
    const radioNextIndex = queueIndexFor(queue.value, nextTrack);
    if (radioNextIndex === queue.value.length) queue.value = [...queue.value, nextTrack];
    await playWithRadioIntro(nextTrack, radioNextIndex, "ended");
    return;
  }

  const nextIndex = nextQueueIndex(currentIndex.value, true);
  if (nextIndex === null) {
    stopAtQueueEnd();
    return;
  }
  void playImmediate(nextIndex, "automatic");
}

export function playTracks(tracks: Track[], start = 0) {
  queue.value = tracks;
  if (tracks.length > 0) markManualQueue(start);
  else manualQueueOverride = false;
  playAt(start);
}

/** 固定正在播放的曲目，只打乱其后的队列；未起播时打乱全部曲目。 */
export function shuffleQueue(): void {
  if (!shuffleAvailable.value || pendingPlayback) return;
  settleCrossfade();
  const activeIndex = currentIndex.value;
  const splitAt = activeIndex >= 0 && activeIndex < queue.value.length ? activeIndex + 1 : 0;
  const upcoming = queue.value.slice(splitAt);
  for (let index = upcoming.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [upcoming[index], upcoming[other]] = [upcoming[other], upcoming[index]];
  }
  queue.value = [...queue.value.slice(0, splitAt), ...upcoming];
  markManualQueue(activeIndex);
}

/** 插播到当前曲目之后；队列空则直接起播 */
export function insertNext(track: Track): void {
  if (queue.value.length === 0) {
    playTracks([track], 0);
    return;
  }
  const at = currentIndex.value + 1;
  queue.value = [...queue.value.slice(0, at), track, ...queue.value.slice(at)];
  markManualQueue();
}

/** 追加到队尾 */
export function appendToQueue(track: Track): void {
  queue.value = [...queue.value, track];
  markManualQueue();
}

/** Append an explicit multi-track selection without starting playback. */
export function appendTracksToQueue(tracks: Track[]): void {
  if (tracks.length === 0) return;
  queue.value = [...queue.value, ...tracks];
  markManualQueue();
}

/** A deliberate selection from the queue transfers the upcoming sequence to the listener. */
export function selectQueueTrack(index: number): void {
  if (!queue.value[index]) return;
  markManualQueue(index);
  playAt(index);
}

export function restoreLastManualQueue(libraryTracks: Track[]): {
  restoredTracks: number;
  skippedLocalTracks: number;
} {
  const snapshot = lastManualQueueSession.value;
  if (!snapshot) return { restoredTracks: 0, skippedLocalTracks: 0 };
  const restored = rehydrateQueueSession(snapshot, libraryTracks);
  if (restored.tracks.length === 0) {
    return { restoredTracks: 0, skippedLocalTracks: restored.skippedLocalTracks };
  }

  manualQueueOverride = true;
  manualQueueSessionForgotten = false;
  queue.value = restored.tracks;
  currentIndex.value = restored.currentIndex;
  saveManualQueueSession(restored.currentIndex);
  playAt(restored.currentIndex, { intro: radioEnabled.value && djConfig.value?.configured === true });
  return {
    restoredTracks: restored.tracks.length,
    skippedLocalTracks: restored.skippedLocalTracks,
  };
}

export function forgetSavedManualQueue(): void {
  try {
    localStorage.removeItem(QUEUE_SESSION_KEY);
    lastManualQueueSession.value = null;
    manualQueueSessionForgotten = true;
  } catch {
    // Leave the visible snapshot available if storage cannot remove it.
  }
}

/** Replace only the saved manual-queue snapshot; it never changes the live queue or playback. */
export function replaceLastManualQueueSession(snapshot: QueueSessionSnapshot | null): boolean {
  try {
    if (snapshot === null) {
      localStorage.removeItem(QUEUE_SESSION_KEY);
      lastManualQueueSession.value = null;
    } else {
      const validated = parseQueueSessionSnapshot(JSON.stringify(snapshot));
      if (!validated || !writeQueueSessionSnapshot(localStorage, validated)) return false;
      lastManualQueueSession.value = validated;
    }
    manualQueueOverride = false;
    // An imported snapshot stays opt-in; background playback must not turn it into the live queue.
    manualQueueSessionForgotten = true;
    return true;
  } catch {
    return false;
  }
}

/** 移除队列中某首；移除正在播放的曲目时切到顺位下一首 */
export function removeAt(index: number): void {
  if (index < 0 || index >= queue.value.length) return;
  markManualQueue();
  const wasCurrent = index === currentIndex.value;
  queue.value = queue.value.filter((_, i) => i !== index);
  if (wasCurrent) {
    if (queue.value.length === 0) {
      currentIndex.value = -1;
      manualQueueOverride = false;
      stopAtQueueEnd();
      return;
    }
    const resumeIndex = Math.min(index, queue.value.length - 1);
    saveManualQueueSession(resumeIndex);
    playAt(resumeIndex);
  } else if (index < currentIndex.value) {
    currentIndex.value -= 1;
    saveManualQueueSession();
  } else {
    saveManualQueueSession();
  }
}

/** 从当前播放队列移除某首曲目的所有副本；当前曲目被移除时接播相邻曲目。 */
export function removeTrackFromQueue(trackId: string): void {
  removeTracksFromQueue([trackId]);
}

/** 一次移除多首曲目的所有队列副本，并最多切换播放一次。 */
export function removeTracksFromQueue(trackIds: Iterable<string>): void {
  const removedIds = new Set(trackIds);
  if (removedIds.size === 0) return;

  const previousQueue = queue.value;
  const oldCurrentIndex = currentIndex.value;
  const wasCurrent = previousQueue[oldCurrentIndex] !== undefined &&
    removedIds.has(previousQueue[oldCurrentIndex].id);
  const removedBeforeCurrent = previousQueue
    .slice(0, Math.max(oldCurrentIndex, 0))
    .filter((track) => removedIds.has(track.id)).length;

  let resumeAtOldIndex = -1;
  if (wasCurrent) {
    resumeAtOldIndex = previousQueue.findIndex(
      (track, index) => index > oldCurrentIndex && !removedIds.has(track.id),
    );
    if (resumeAtOldIndex === -1) {
      for (let index = oldCurrentIndex - 1; index >= 0; index -= 1) {
        if (!removedIds.has(previousQueue[index].id)) {
          resumeAtOldIndex = index;
          break;
        }
      }
    }
  }

  queue.value = previousQueue.filter((track) => !removedIds.has(track.id));
  if (wasCurrent) {
    if (resumeAtOldIndex === -1) {
      currentIndex.value = -1;
      ensureAudio().pause();
      stopAtQueueEnd();
    } else {
      const removedBeforeTarget = previousQueue
        .slice(0, resumeAtOldIndex)
        .filter((track) => removedIds.has(track.id)).length;
      const resumeIndex = resumeAtOldIndex - removedBeforeTarget;
      saveManualQueueSession(resumeIndex);
      playAt(resumeIndex);
    }
  } else if (oldCurrentIndex >= 0) {
    currentIndex.value = oldCurrentIndex - removedBeforeCurrent;
    saveManualQueueSession();
  } else {
    saveManualQueueSession(0);
  }
}

/** 清空队列并停止 */
export function clearQueue(): void {
  manualQueueOverride = false;
  queue.value = [];
  currentIndex.value = -1;
  ensureAudio().pause();
  stopAtQueueEnd();
}

/** 纯逻辑：移动元素后，原 currentIndex 落在哪里（可单测） */
export function currentIndexAfterMove(
  current: number,
  from: number,
  to: number,
): number {
  if (current === from) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}

/** 队列拖拽重排：把 from 位置的曲目移到 to 位置；正在播的曲目跟随移动 */
export function moveInQueue(from: number, to: number): void {
  const items = [...queue.value];
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  queue.value = items;
  currentIndex.value = currentIndexAfterMove(currentIndex.value, from, to);
  markManualQueue(currentIndex.value);
}

/** 网易云曲目：取流换成真实 https 直链并缓存回 track.filePath（togglePlayback/seek 复用） */
async function resolveNeteaseSrc(track: Track): Promise<string> {
  if (/^https?:\/\//i.test(track.filePath)) return toPlayableSrc(track);
  const numericId = Number(track.id.replace(/^netease-/, ""));
  if (!Number.isFinite(numericId)) throw new Error("无效的网易云曲目");
  const url = await neteaseStreamUrl(numericId);
  track.filePath = url;
  return toPlayableSrc(track);
}

/**
 * 播放队列中第 index 首。
 * opts.intro 为 true 时先让 DJ 说一句歌前介绍再起播（未配置 DJ / TTS 关闭则立即直放）。
 */
export function playAt(index: number, opts?: { intro?: boolean }) {
  const track = queue.value[index];
  if (!track) return;
  if (opts?.intro) {
    void playWithRadioIntro(track, index);
    return;
  }
  void playImmediate(index);
}

/** Re-resolve the current local file after its indexed path changes. */
export function reloadCurrentTrackSource(trackId: string): void {
  const index = currentIndex.value;
  const track = queue.value[index];
  if (!track || track.id !== trackId) return;

  const shouldResume = isPlaying.value;
  const resumeAt = position.value;
  invalidateIntro();
  invalidatePendingPlayback();
  settleCrossfade();
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  isPlaying.value = false;
  playbackError.value = null;

  if (shouldResume) {
    setPendingSeek(resumeAt);
    playAt(index);
  } else {
    pendingSeekSeconds = null;
    position.value = 0;
    duration.value = track.durationSeconds;
    saveLastPlayback(track, 0);
  }
}

/** 立即起播 / 手动暂停时作废等待中的介绍会话：过期的介绍返回时不得抢回播放 */
function invalidateIntro() {
  introToken += 1;
  introPlaying.value = false;
}

async function resolveTrackSource(track: Track): Promise<string> {
  if (track.source === "netease") return resolveNeteaseSrc(track);
  if (track.source === "subsonic") return toPlayableSrc(track);
  if (track.source === "jellyfin") return toPlayableSrc(track);
  if (track.source === "emby") return toPlayableSrc(track);
  if (track.source === "webdav") return toPlayableSrc(track);
  if (track.source === "smb") return toPlayableSrc(track);
  if (track.source === "bilibili") {
    const { url, referer } = await bilibiliStreamUrl(track.sourceId ?? "");
    return bilibiliProxySrc(url, referer);
  }
  return toPlayableSrc(track);
}

async function performPlayback(request: PendingPlayback): Promise<boolean> {
  const { track, requestId, outgoing, origin } = request;
  let src: string;
  try {
    src = await resolveTrackSource(track);
  } catch (error) {
    if (requestId === playbackRequestId) playbackError.value = error instanceof Error ? error.message : String(error);
    return false;
  }
  if (requestId !== playbackRequestId || !src) {
    if (requestId === playbackRequestId && !src) playbackError.value = "无法获取播放地址";
    return false;
  }
  const index = queue.value.indexOf(track);
  if (index < 0) return false;
  if (origin === "automatic" && sleepMode.value === "track") return false;

  const outgoingPlaying = audio === outgoing.element && !outgoing.element.paused && !!outgoing.element.getAttribute("src");
  if (outgoingPlaying && outgoing.track?.id === track.id) {
    try { outgoing.element.currentTime = 0; } catch { /* A not-yet-seekable source will start at zero. */ }
    position.value = 0;
    currentIndex.value = index;
    saveManualQueueSession(index);
    saveLastPlayback(track, 0);
    automaticTransitionForTrack = null;
    return true;
  }

  const useSecondDeck = outgoingPlaying;
  const incoming = useSecondDeck ? inactiveDeck() : outgoing;
  request.incoming = incoming;
  if (incoming !== outgoing) clearDeckSource(incoming);
  setDeckTrack(incoming, track);
  endedEventsRecorded.delete(incoming.element);
  setDeckEnvelope(incoming, incoming === outgoing ? 1 : 0);
  incoming.element.src = src;
  applySinkId(incoming.element);

  try {
    await incoming.element.play();
  } catch (error) {
    if (requestId === playbackRequestId) {
      playbackError.value = error instanceof Error ? error.message : String(error);
      if (incoming === outgoing) isPlaying.value = false;
    }
    if (incoming !== outgoing && incoming.element !== audio) clearDeckSource(incoming);
    return false;
  }

  if (requestId !== playbackRequestId || queue.value.indexOf(track) < 0) {
    if (incoming.element !== audio) clearDeckSource(incoming);
    return false;
  }
  if (pendingSeekSeconds !== null) {
    try {
      incoming.element.currentTime = pendingSeekSeconds;
      position.value = incoming.element.currentTime;
      pendingSeekSeconds = null;
    } catch { /* Keep the resume point for the next seekable-media event. */ }
  }

  const outgoingStillPlaying = incoming !== outgoing && audio === outgoing.element && !outgoing.element.paused;
  const graphMatches = (!!outgoing.transitionGain && !!incoming.transitionGain) ||
    (!outgoing.transitionGain && !incoming.transitionGain);
  if (outgoingStillPlaying && origin === "automatic" && sleepMode.value === "track") {
    clearDeckSource(incoming);
    return false;
  }

  if (outgoingStillPlaying && fadeEnabled.value && graphMatches) {
    const remaining = Number.isFinite(outgoing.element.duration) && outgoing.element.duration > 0
      ? Math.max(0, outgoing.element.duration - outgoing.element.currentTime)
      : Number.POSITIVE_INFINITY;
    beginCrossfade(outgoing, incoming, track, index, origin, remaining);
    return true;
  }

  setDeckEnvelope(incoming, 1);
  updateCurrentTrack(incoming, track, index);
  if (incoming !== outgoing) clearDeckSource(outgoing);
  recordTrackPlaybackEvent(track, "play", 0);
  return true;
}

/** Play a track immediately, overlapping the old deck when automatic fade is enabled. */
function playImmediate(index: number, origin: PlaybackOrigin = "selection"): Promise<boolean> {
  const track = queue.value[index];
  if (!track) return Promise.resolve(false);
  playSeq += 1;
  invalidateIntro();
  settleCrossfade();
  if (pendingPlayback) invalidatePendingPlayback();
  const requestId = ++playbackRequestId;
  if (origin === "automatic") automaticTransitionForTrack = currentTrack.value?.id ?? null;
  playbackError.value = null;
  const outgoing = activeDeck();
  const request: PendingPlayback = {
    requestId,
    track,
    index,
    outgoing,
    incoming: null,
    origin,
    promise: Promise.resolve(false),
  };
  request.promise = performPlayback(request);
  pendingPlayback = request;
  void request.promise.then(() => {
    if (pendingPlayback?.requestId === requestId) pendingPlayback = null;
  });
  return request.promise;
}

/**
 * 电台起播：拿到介绍词 → TTS 说完 → 起播；任何一步失败立即直放，绝不阻塞音乐。
 * 用 introToken 防竞态：请求期间用户点了别的歌，过期的介绍整段丢弃。
 */
export async function playWithRadioIntro(
  track: Track,
  index: number,
  event?: "skip" | "ended" | "boot" | "resume"
): Promise<void> {
  settleCrossfade();
  if (pendingPlayback) invalidatePendingPlayback();
  const token = ++introToken;
  introPlaying.value = true;
  try {
    const say = await introFor(track, event);
    if (token !== introToken || queue.value[index] !== track) return;
    if (say) await speak(say);
    if (token !== introToken || queue.value[index] !== track) return;
    // 记录近期播放历史，供电台选曲去重
    recordRecentPlay(track.id);
    await playImmediate(index, event === "skip" ? "skip" : "radio");
  } finally {
    if (token === introToken) introPlaying.value = false;
  }
}

export function togglePlayback() {
  settleCrossfade();
  invalidatePendingPlayback();
  const element = ensureAudio();
  if (!element.src) {
    if (queue.value.length > 0) playAt(Math.max(currentIndex.value, 0));
    return;
  }
  if (element.paused) void element.play();
  else {
    invalidateIntro(); // 手动暂停同样取消等待中的介绍，避免继续播放时被过期介绍抢回
    element.pause();
  }
}

export function next(manual: boolean) {
  const track = currentTrack.value;
  if (manual && track) {
    recordTrackPlaybackEvent(track, "skip", Math.round(position.value));
    if (isPlaybackEventRecordable(track)) recordSkip(track.id); // 电台记忆：近 20 分钟内降权
    if (audio) endedEventsRecorded.add(audio);
  }
  const nextIndex = nextQueueIndex(currentIndex.value, !manual);
  if (nextIndex === null) {
    invalidateIntro(); // 队列播完即停：等待中的介绍作废，不得在停歇时抢回播放
    invalidatePendingPlayback();
    settleCrossfade();
    ensureAudio().pause();
    return;
  }
  // 情绪化电台：手动跳歌也由 DJ 承接情绪（skip 语境），未配置则直切
  if (manual && radioEnabled.value && djConfig.value?.configured) {
    void playWithRadioIntro(queue.value[nextIndex], nextIndex, "skip");
    return;
  }
  void playImmediate(nextIndex, manual ? "skip" : "selection");
}

export function previous() {
  if (position.value > 3) {
    seek(0);
    return;
  }
  const prevIndex = currentIndex.value - 1;
  if (prevIndex >= 0) void playImmediate(prevIndex, "selection");
  else seek(0);
}

export function seek(seconds: number) {
  settleCrossfade();
  invalidatePendingPlayback();
  const element = ensureAudio();
  element.currentTime = seconds;
  position.value = seconds;
  automaticTransitionForTrack = null;
}

export function setVolume(value: number) {
  volume.value = Math.min(1, Math.max(0, value));
  ensureAudio();
  if (masterGain) {
    setAudioParamNow(masterGain.gain, volume.value, audioContext);
  }
  const transition = activeCrossfade;
  if (transition) {
    const progress = Math.min(1, (Date.now() - transition.startedAt) / (transition.duration * 1000));
    const gains = crossfadeGains(progress);
    if (!transition.outgoing.transitionGain) setDeckEnvelope(transition.outgoing, gains.outgoing);
    if (!transition.incoming.transitionGain) setDeckEnvelope(transition.incoming, gains.incoming);
    return;
  }
  if (masterGain) {
    for (const deck of decks.values()) {
      if (!deck.transitionGain) setDeckEnvelope(deck, deck.element === audio ? 1 : 0);
    }
    return;
  }
  for (const deck of decks.values()) setDeckEnvelope(deck, deck.element === audio ? 1 : 0);
}
