import { describe, expect, it } from "vitest";

import {
  createPlaybackFailureTracker,
  nextPlayableIndex,
  type FailureContext,
} from "./playbackFailurePolicy";

/**
 * P1-7 behaviour contract.
 *
 * The scenario that motivated this: a restored queue containing an expired QQ
 * vkey link. Playback advanced onto it, resolve failed, and the entire queue
 * stopped forever. These tests pin the state machine that now handles it.
 */

const autoFailure = (overrides: Partial<FailureContext> = {}): FailureContext => ({
  trackId: "bad-track",
  reason: "no_copyright",
  origin: "auto",
  repeatOne: false,
  queueLength: 10,
  skippedInPass: 0,
  ...overrides,
});

describe("permanent failures skip instead of burning the retry budget", () => {
  it("skips immediately on a copyright failure", () => {
    const tracker = createPlaybackFailureTracker();
    expect(tracker.decide(autoFailure({ reason: "no_copyright" }))).toEqual({
      kind: "skip",
      markUnavailable: true,
    });
  });

  it("skips immediately when the track was removed from the source", () => {
    const tracker = createPlaybackFailureTracker();
    expect(tracker.decide(autoFailure({ reason: "song_removed" })).kind).toBe("skip");
  });

  it("marks the track unavailable so the same pass cannot revisit it", () => {
    const tracker = createPlaybackFailureTracker();
    tracker.decide(autoFailure());
    tracker.markUnavailable("bad-track");
    expect(tracker.isUnavailable("bad-track")).toBe(true);
  });
});

describe("retry budget", () => {
  it("retries a transient failure and backs off", () => {
    const tracker = createPlaybackFailureTracker();
    const first = tracker.decide(autoFailure({ reason: "timeout" }));
    expect(first.kind).toBe("retry");
    expect(first).toMatchObject({ attempt: 1 });

    const second = tracker.decide(autoFailure({ reason: "timeout" }));
    expect(second.kind).toBe("retry");
    expect(second).toMatchObject({ attempt: 2 });

    const delays = [first, second].map((d) => (d.kind === "retry" ? d.delayMs : 0));
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });

  it("gives up after the budget and skips — it never retries forever", () => {
    const tracker = createPlaybackFailureTracker({ maxAttemptsPerTrack: 3 });
    expect(tracker.decide(autoFailure({ reason: "timeout" })).kind).toBe("retry");
    expect(tracker.decide(autoFailure({ reason: "timeout" })).kind).toBe("retry");
    expect(tracker.decide(autoFailure({ reason: "timeout" })).kind).toBe("skip");
    expect(tracker.decide(autoFailure({ reason: "timeout" })).kind).toBe("skip");
  });

  it("resets the budget once the audio element proves the URL plays", () => {
    const tracker = createPlaybackFailureTracker({ maxAttemptsPerTrack: 2 });
    expect(tracker.decide(autoFailure({ reason: "timeout" })).kind).toBe("retry");
    expect(tracker.decide(autoFailure({ reason: "timeout" })).kind).toBe("skip");

    tracker.notePlaybackReady("bad-track");
    expect(tracker.decide(autoFailure({ reason: "timeout" })).kind).toBe("retry");
  });

  it("starts a fresh budget when the user presses play manually", () => {
    const tracker = createPlaybackFailureTracker({ maxAttemptsPerTrack: 2 });
    tracker.decide(autoFailure({ reason: "timeout" }));
    tracker.decide(autoFailure({ reason: "timeout" }));

    tracker.noteManualPlay("bad-track");
    expect(tracker.decide(autoFailure({ reason: "timeout" })).kind).toBe("retry");
  });

  it("keeps independent budgets per track", () => {
    const tracker = createPlaybackFailureTracker({ maxAttemptsPerTrack: 2 });
    tracker.decide(autoFailure({ trackId: "a", reason: "timeout" }));
    expect(tracker.decide(autoFailure({ trackId: "a", reason: "timeout" })).kind).toBe("skip");

    // A different track still has its full budget.
    expect(tracker.decide(autoFailure({ trackId: "b", reason: "timeout" })).kind).toBe("retry");
  });
});

describe("repeat-one", () => {
  it("stops instead of looping a track that cannot play", () => {
    const tracker = createPlaybackFailureTracker();
    expect(tracker.decide(autoFailure({ repeatOne: true, reason: "no_copyright" }))).toEqual({
      kind: "stop",
      code: "repeat_one",
    });
  });

  it("stops even after retryable failures are exhausted", () => {
    const tracker = createPlaybackFailureTracker({ maxAttemptsPerTrack: 1 });
    expect(tracker.decide(autoFailure({ repeatOne: true, reason: "timeout" }))).toEqual({
      kind: "stop",
      code: "repeat_one",
    });
  });
});

describe("manual playback is not yanked away", () => {
  it("stops with a manual reason instead of navigating to the next track", () => {
    const tracker = createPlaybackFailureTracker();
    expect(tracker.decide(autoFailure({ origin: "manual" }))).toEqual({
      kind: "stop",
      code: "manual_failure",
    });
  });

  it("still retries a transient failure before giving up on a manual play", () => {
    const tracker = createPlaybackFailureTracker({ maxAttemptsPerTrack: 2 });
    expect(tracker.decide(autoFailure({ origin: "manual", reason: "timeout" })).kind).toBe("retry");
    expect(tracker.decide(autoFailure({ origin: "manual", reason: "timeout" }))).toEqual({
      kind: "stop",
      code: "manual_failure",
    });
  });
});

describe("a fully unplayable queue stops with an explicit reason", () => {
  it("keeps skipping while candidates remain", () => {
    const tracker = createPlaybackFailureTracker();
    expect(tracker.decide(autoFailure({ queueLength: 10, skippedInPass: 0 })).kind).toBe("skip");
    expect(tracker.decide(autoFailure({ queueLength: 10, skippedInPass: 5 })).kind).toBe("skip");
  });

  it("stops once every candidate has been tried", () => {
    const tracker = createPlaybackFailureTracker();
    expect(tracker.decide(autoFailure({ queueLength: 3, skippedInPass: 3 }))).toEqual({
      kind: "stop",
      code: "queue_exhausted",
    });
  });

  it("caps the pass on huge queues so a 1000-track dead queue cannot spin", () => {
    const tracker = createPlaybackFailureTracker({ maxSkipsPerPass: 50 });
    expect(tracker.decide(autoFailure({ queueLength: 1051, skippedInPass: 49 })).kind).toBe("skip");
    expect(tracker.decide(autoFailure({ queueLength: 1051, skippedInPass: 50 }))).toEqual({
      kind: "stop",
      code: "queue_exhausted",
    });
  });
});

describe("retry scope", () => {
  it("does not re-resolve a local file that failed to decode", () => {
    const tracker = createPlaybackFailureTracker();
    // A local path will not change on retry, so a failure must skip immediately.
    expect(tracker.decide(autoFailure({ reason: "timeout", retryAllowed: false }))).toEqual({
      kind: "skip",
      markUnavailable: true,
    });
  });

  it("does not re-resolve when the caller says retry cannot help, even with budget left", () => {
    const tracker = createPlaybackFailureTracker({ maxAttemptsPerTrack: 5 });
    expect(tracker.decide(autoFailure({ retryAllowed: false })).kind).toBe("skip");
  });

  it("still retries when the caller allows it", () => {
    const tracker = createPlaybackFailureTracker();
    expect(tracker.decide(autoFailure({ reason: "timeout", retryAllowed: true })).kind).toBe(
      "retry",
    );
  });
});

describe("the failure pass ends when playback recovers", () => {
  it("resets the consecutive-skip counter", () => {
    const tracker = createPlaybackFailureTracker();
    tracker.decide(autoFailure({ skippedInPass: 0 }));
    tracker.decide(autoFailure({ skippedInPass: 1 }));
    expect(tracker.snapshot().skippedInPass).toBe(2);

    tracker.notePlaybackReady("good-track");
    expect(tracker.snapshot().skippedInPass).toBe(0);
  });
});

describe("unavailability is transient and never touches the library", () => {
  it("can be cleared for a single track", () => {
    const tracker = createPlaybackFailureTracker();
    tracker.markUnavailable("a");
    tracker.markUnavailable("b");
    tracker.clearUnavailable("a");

    expect(tracker.isUnavailable("a")).toBe(false);
    expect(tracker.isUnavailable("b")).toBe(true);
  });

  it("can be cleared entirely", () => {
    const tracker = createPlaybackFailureTracker();
    tracker.markUnavailable("a");
    tracker.clearUnavailable();
    expect(tracker.snapshot().unavailable).toEqual([]);
  });
});

describe("nextPlayableIndex", () => {
  const ids = ["a", "b", "c", "d"];

  it("returns the immediate neighbour when it is playable", () => {
    expect(
      nextPlayableIndex({ length: 4, fromIndex: 0, direction: 1, unavailable: new Set(), ids }),
    ).toBe(1);
  });

  it("skips over unavailable tracks", () => {
    expect(
      nextPlayableIndex({
        length: 4,
        fromIndex: 0,
        direction: 1,
        unavailable: new Set(["b", "c"]),
        ids,
      }),
    ).toBe(3);
  });

  it("wraps around the end of the queue", () => {
    expect(
      nextPlayableIndex({ length: 4, fromIndex: 3, direction: 1, unavailable: new Set(), ids }),
    ).toBe(0);
  });

  it("walks backwards when asked", () => {
    expect(
      nextPlayableIndex({
        length: 4,
        fromIndex: 2,
        direction: -1,
        unavailable: new Set(["b"]),
        ids,
      }),
    ).toBe(0);
  });

  it("returns null when nothing in the queue can play", () => {
    expect(
      nextPlayableIndex({
        length: 4,
        fromIndex: 0,
        direction: 1,
        unavailable: new Set(ids),
        ids,
      }),
    ).toBeNull();
  });

  it("returns null for an empty queue", () => {
    expect(
      nextPlayableIndex({ length: 0, fromIndex: 0, direction: 1, unavailable: new Set(), ids: [] }),
    ).toBeNull();
  });
});
