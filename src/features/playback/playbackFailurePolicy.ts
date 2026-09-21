/**
 * P1-7 — "a bad track must not kill the whole queue".
 *
 * Before this module, both terminal playback failure paths in `App.tsx` did
 * `setIsPlaying(false)` and surfaced a message. Neither advanced the queue,
 * and `ended` never fires for a track that failed to load — so one expired QQ
 * vkey link inside a 1000-track restored queue stopped playback permanently
 * and silently.
 *
 * This module is the decision authority for what should happen after a
 * failure. It is deliberately pure and framework-free so the whole
 * retry / skip / stop state machine can be exercised by behaviour tests.
 *
 * Invariants enforced here:
 *  - a finite retry budget per track (never an infinite resolve/error loop);
 *  - permanent failures skip immediately instead of burning the budget;
 *  - repeat-one never auto-loops a track that cannot play;
 *  - a fully unplayable queue stops with an explicit reason instead of
 *    spinning forever;
 *  - manual playback never gets yanked away from the track the user clicked.
 *
 * Deliberately NOT done here: mutating library rows, and persisting anything.
 * Unavailability is a transient, in-memory playback fact.
 */

import { isRetryableReason, type PlaybackFailureReason } from "./playbackFailureReason";

export type FailureOrigin = "auto" | "manual";

export type StopCode =
  /** Repeat-one cannot advance, and looping a dead track is worse than stopping. */
  | "repeat_one"
  /** Every candidate in the queue was tried and none could play. */
  | "queue_exhausted"
  /** The user clicked this track. We report, we do not navigate away. */
  | "manual_failure";

export type FailureDecision =
  | { kind: "retry"; attempt: number; delayMs: number }
  | { kind: "skip"; markUnavailable: boolean }
  | { kind: "stop"; code: StopCode };

export interface FailureContext {
  trackId: string;
  reason?: PlaybackFailureReason;
  origin: FailureOrigin;
  /** True when the queue is in repeat-one (loopMode === "one"). */
  repeatOne: boolean;
  /** Number of tracks in the current queue. */
  queueLength: number;
  /** How many tracks were already skipped in this continuous failure pass. */
  skippedInPass: number;
  /**
   * Whether a re-resolve can possibly help. False for local files and for
   * non-proxied remote URLs, where the URL is not the thing that can expire.
   * Defaults to true.
   */
  retryAllowed?: boolean;
}

export interface PlaybackFailurePolicyOptions {
  /** Attempts per track before giving up. Includes the first try. */
  maxAttemptsPerTrack?: number;
  /** Hard ceiling on consecutive skips in one pass, even for huge queues. */
  maxSkipsPerPass?: number;
  /** Base delay for the first retry; grows exponentially. */
  baseRetryDelayMs?: number;
}

export interface PlaybackFailureTracker {
  decide(context: FailureContext): FailureDecision;
  /** canplay / playing / loadeddata — the URL really plays, reset the budget. */
  notePlaybackReady(trackId: string): void;
  /** A manual play press starts a fresh budget for its track. */
  noteManualPlay(trackId: string): void;
  markUnavailable(trackId: string): void;
  clearUnavailable(trackId?: string): void;
  isUnavailable(trackId: string): boolean;
  /** Live view of the unavailable set, for queue traversal. */
  unavailableIds(): ReadonlySet<string>;
  /** Consecutive skips already spent in the current failure pass. */
  getSkippedInPass(): number;
  /** Called when playback starts cleanly on a new track: end the failure pass. */
  resetPass(): void;
  snapshot(): PlaybackFailureSnapshot;
}

export interface PlaybackFailureSnapshot {
  attemptsByTrack: Record<string, number>;
  unavailable: string[];
  skippedInPass: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_SKIPS = 50;
const DEFAULT_BASE_DELAY_MS = 400;

export function createPlaybackFailureTracker(
  options: PlaybackFailurePolicyOptions = {},
): PlaybackFailureTracker {
  const maxAttempts = Math.max(1, options.maxAttemptsPerTrack ?? DEFAULT_MAX_ATTEMPTS);
  const maxSkipsPerPass = Math.max(1, options.maxSkipsPerPass ?? DEFAULT_MAX_SKIPS);
  const baseDelayMs = Math.max(0, options.baseRetryDelayMs ?? DEFAULT_BASE_DELAY_MS);

  const attemptsByTrack = new Map<string, number>();
  const unavailable = new Set<string>();
  let skippedInPass = 0;

  const attemptFor = (trackId: string) => attemptsByTrack.get(trackId) ?? 0;

  return {
    decide(context) {
      const attempt = attemptFor(context.trackId) + 1;
      attemptsByTrack.set(context.trackId, attempt);

      const retryable = isRetryableReason(context.reason) && (context.retryAllowed ?? true);
      const budgetLeft = attempt < maxAttempts;

      if (retryable && budgetLeft) {
        return {
          kind: "retry",
          attempt,
          delayMs: Math.round(baseDelayMs * Math.pow(3, attempt - 1)),
        };
      }

      // Budget exhausted (or the failure is permanent). From here the track is
      // a skip candidate — unless advancing is forbidden by the mode/origin.
      if (context.origin === "manual") {
        return { kind: "stop", code: "manual_failure" };
      }

      if (context.repeatOne) {
        return { kind: "stop", code: "repeat_one" };
      }

      const skipCeiling = Math.min(context.queueLength, maxSkipsPerPass);
      if (context.skippedInPass >= skipCeiling) {
        return { kind: "stop", code: "queue_exhausted" };
      }

      skippedInPass += 1;
      return { kind: "skip", markUnavailable: true };
    },

    notePlaybackReady(trackId) {
      attemptsByTrack.delete(trackId);
      skippedInPass = 0;
    },

    noteManualPlay(trackId) {
      attemptsByTrack.delete(trackId);
      skippedInPass = 0;
    },

    markUnavailable(trackId) {
      unavailable.add(trackId);
    },

    clearUnavailable(trackId) {
      if (trackId) unavailable.delete(trackId);
      else unavailable.clear();
    },

    isUnavailable(trackId) {
      return unavailable.has(trackId);
    },

    unavailableIds() {
      return unavailable;
    },

    getSkippedInPass() {
      return skippedInPass;
    },

    resetPass() {
      skippedInPass = 0;
    },

    snapshot() {
      return {
        attemptsByTrack: Object.fromEntries(attemptsByTrack),
        unavailable: [...unavailable],
        skippedInPass,
      };
    },
  };
}

/**
 * Pick the next queue index that has not been marked unavailable.
 *
 * Returns `null` when every candidate is unavailable, which is the signal to
 * stop the queue with an explicit reason rather than looping forever.
 */
export function nextPlayableIndex(options: {
  length: number;
  fromIndex: number;
  direction: 1 | -1;
  unavailable: ReadonlySet<string>;
  ids: readonly string[];
}): number | null {
  const { length, fromIndex, direction, unavailable, ids } = options;
  if (length <= 0) return null;

  for (let step = 1; step <= length; step += 1) {
    const index = (((fromIndex + direction * step) % length) + length) % length;
    if (index === fromIndex) continue;
    const id = ids[index];
    if (id && !unavailable.has(id)) return index;
  }
  return null;
}
