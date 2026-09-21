import { describe, expect, it } from "vitest";

import {
  isConnectableReason,
  isPermanentReason,
  isRetryableReason,
  playbackNoticeLabel,
  playbackReasonMessage,
} from "./playbackFailureReason";

/**
 * Behavioural replacement for the string assertions that used to live in
 * `scripts/regression-check.mjs`. The regression script could only prove that
 * a mapping table existed; these tests prove the mapping produces the copy the
 * product actually promises.
 */
describe("playbackReasonMessage", () => {
  it("maps sign-in reasons to a sign-in prompt", () => {
    expect(playbackReasonMessage("not_logged_in")).toBe(
      "Sign in to your music source to try again.",
    );
    expect(playbackReasonMessage("cookie_missing")).toBe(
      "Sign in to your music source to try again.",
    );
  });

  it("maps expired sessions to a reconnect prompt", () => {
    expect(playbackReasonMessage("cookie_expired")).toBe(
      "Your session has expired. Please reconnect your music source.",
    );
    expect(playbackReasonMessage("session_expired")).toBe(
      "Your session has expired. Please reconnect your music source.",
    );
  });

  it("maps entitlement reasons without promising playback", () => {
    expect(playbackReasonMessage("vip_required")).toBe(
      "This track needs an active membership from the current source.",
    );
    expect(playbackReasonMessage("trial_only")).toBe(
      "Only a preview is available from the current source.",
    );
  });

  it("maps copyright and removal reasons to the unavailable copy", () => {
    for (const reason of ["no_copyright", "region_restricted", "song_removed", "video_removed"]) {
      expect(playbackReasonMessage(reason)).toBe(
        "This track is unavailable from the current source.",
      );
    }
  });

  it("falls back to a neutral message for unknown or missing reasons", () => {
    expect(playbackReasonMessage(null)).toBe("This track is unavailable from the current source.");
    expect(playbackReasonMessage(undefined)).toBe(
      "This track is unavailable from the current source.",
    );
    expect(playbackReasonMessage("something_new_from_a_provider")).toBe(
      "This track is unavailable from the current source.",
    );
  });

  it("never leaks a raw reason code into user-facing copy", () => {
    const message = playbackReasonMessage("no_copyright");
    expect(message).not.toContain("no_copyright");
    expect(message).not.toContain("_");
  });
});

describe("playbackNoticeLabel", () => {
  it("labels entitlement and copyright reasons distinctly", () => {
    expect(playbackNoticeLabel("trial_only")).toBe("Preview only");
    expect(playbackNoticeLabel("vip_required")).toBe("Membership needed");
    expect(playbackNoticeLabel("no_copyright")).toBe("Copyright limited");
    expect(playbackNoticeLabel("region_restricted")).toBe("Region limited");
  });

  it("labels removed tracks as gone, not as a transient error", () => {
    expect(playbackNoticeLabel("song_removed")).toBe("No longer available");
    expect(playbackNoticeLabel("video_removed")).toBe("No longer available");
  });

  it("falls back to a neutral label", () => {
    expect(playbackNoticeLabel(null)).toBe("Unable to play");
    expect(playbackNoticeLabel("totally_unknown")).toBe("Unable to play");
  });
});

describe("isConnectableReason", () => {
  it("offers a Connect shortcut only when the user can actually fix it", () => {
    expect(isConnectableReason("not_logged_in")).toBe(true);
    expect(isConnectableReason("cookie_expired")).toBe(true);
    expect(isConnectableReason("vip_required")).toBe(true);
  });

  it("does not offer Connect for reasons the user cannot fix", () => {
    expect(isConnectableReason("no_copyright")).toBe(false);
    expect(isConnectableReason("song_removed")).toBe(false);
    expect(isConnectableReason("timeout")).toBe(false);
    expect(isConnectableReason(null)).toBe(false);
  });
});

describe("retry classification", () => {
  it("treats transient source problems as retryable", () => {
    for (const reason of ["timeout", "rate_limited", "api_failed", "sign_invalid"]) {
      expect(isRetryableReason(reason)).toBe(true);
    }
  });

  it("treats an unknown failure as retryable so a transient proxy expiry still recovers", () => {
    expect(isRetryableReason(null)).toBe(true);
    expect(isRetryableReason(undefined)).toBe(true);
  });

  it("does not spend the retry budget on permanent failures", () => {
    for (const reason of [
      "no_copyright",
      "song_removed",
      "region_restricted",
      "vip_required",
      "trial_only",
      "not_logged_in",
    ]) {
      expect(isRetryableReason(reason)).toBe(false);
      expect(isPermanentReason(reason)).toBe(true);
    }
  });

  it("never classifies an unknown failure as permanent", () => {
    expect(isPermanentReason(null)).toBe(false);
    expect(isPermanentReason(undefined)).toBe(false);
  });
});
