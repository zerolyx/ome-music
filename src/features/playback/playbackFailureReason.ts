/**
 * Playback failure reason vocabulary.
 *
 * This module is the single authority for turning a source-level failure
 * reason (`no_copyright`, `cookie_expired`, ...) into user-facing copy.
 *
 * It used to live inside `App.tsx`. It was extracted so the mapping can be
 * covered by behaviour tests instead of the string assertions in
 * `scripts/regression-check.mjs`, and so the P1-7 auto-skip state machine can
 * ask "is this failure worth retrying?" without duplicating the vocabulary.
 */

export type PlaybackFailureReason = string | null | undefined;

/** Reasons that already carry a user-facing message from the provider. */
const MESSAGE_BY_REASON: Record<string, string> = {
  not_logged_in: "Sign in to your music source to try again.",
  cookie_missing: "Sign in to your music source to try again.",
  cookie_expired: "Your session has expired. Please reconnect your music source.",
  session_expired: "Your session has expired. Please reconnect your music source.",
  vip_required: "This track needs an active membership from the current source.",
  trial_only: "Only a preview is available from the current source.",
  no_copyright: "This track is unavailable from the current source.",
  region_restricted: "This track is unavailable from the current source.",
  song_removed: "This track is unavailable from the current source.",
  video_removed: "This track is unavailable from the current source.",
  url_null: "This track is unavailable from the current source.",
  playurl_failed: "This track is unavailable from the current source.",
  audio_stream_missing: "This track is unavailable from the current source.",
  sign_invalid: "Request signature expired. Please try again.",
  rate_limited: "Too many requests. Please wait a moment.",
  timeout: "The music source request timed out.",
  api_failed: "The music source could not be reached just now.",
  service_not_ready: "The music source is still waking up. Please try again in a moment.",
};

/**
 * Short label shown above the message in the low-interference notice.
 */
const NOTICE_LABEL_BY_REASON: Record<string, string> = {
  trial_only: "Preview only",
  vip_required: "Membership needed",
  not_logged_in: "Sign in needed",
  cookie_missing: "Sign in needed",
  cookie_expired: "Reconnect source",
  session_expired: "Reconnect source",
  no_copyright: "Copyright limited",
  region_restricted: "Region limited",
  song_removed: "No longer available",
  video_removed: "No longer available",
  playurl_failed: "Source quiet",
  audio_stream_missing: "Source quiet",
  rate_limited: "Rate limited",
  sign_invalid: "Signature invalid",
  timeout: "Request timeout",
  api_failed: "Source unreachable",
  service_not_ready: "Source waking up",
};

const DEFAULT_MESSAGE = "This track is unavailable from the current source.";
const DEFAULT_NOTICE_LABEL = "Unable to play";

export function playbackReasonMessage(reason: PlaybackFailureReason): string {
  if (!reason) return DEFAULT_MESSAGE;
  return MESSAGE_BY_REASON[reason] ?? DEFAULT_MESSAGE;
}

export function playbackNoticeLabel(reason: PlaybackFailureReason): string {
  if (!reason) return DEFAULT_NOTICE_LABEL;
  return NOTICE_LABEL_BY_REASON[reason] ?? DEFAULT_NOTICE_LABEL;
}

/**
 * Reasons where the user can fix things by connecting a source. Those get a
 * "Connect" shortcut in the notice; everything else stays low-interference.
 */
export function isConnectableReason(reason: PlaybackFailureReason): boolean {
  return (
    reason === "not_logged_in" ||
    reason === "cookie_missing" ||
    reason === "cookie_expired" ||
    reason === "session_expired" ||
    reason === "vip_required" ||
    reason === "trial_only"
  );
}

/**
 * Transient reasons are worth one more attempt: the same request may succeed
 * on a fresh signed URL, after the rate-limit window, or once the sidecar has
 * finished waking up.
 *
 * Permanent reasons (`no_copyright`, `song_removed`, `vip_required`, ...) will
 * not change on retry, so spending the retry budget on them only delays the
 * skip and keeps the user staring at a dead track.
 */
export function isRetryableReason(reason: PlaybackFailureReason): boolean {
  return (
    reason === "timeout" ||
    reason === "rate_limited" ||
    reason === "api_failed" ||
    reason === "sign_invalid" ||
    reason === "playurl_failed" ||
    reason === "audio_stream_missing" ||
    reason === "service_not_ready" ||
    reason === null ||
    reason === undefined
  );
}

export type PlaybackFailureError = Error & { reason: string | null };

/**
 * Build a failure that still carries its machine-readable reason code.
 *
 * The previous code threw `new Error(playbackReasonMessage(reason))`, which
 * destroyed the reason and forced every downstream handler to guess. P1-7
 * needs the code to decide retry vs skip, so it travels with the error.
 */
export function createPlaybackFailureError(reason: PlaybackFailureReason): PlaybackFailureError {
  const error = new Error(playbackReasonMessage(reason)) as PlaybackFailureError;
  error.reason = reason ?? null;
  return error;
}

export function reasonFromPlaybackError(error: unknown): string | null {
  if (error && typeof error === "object" && "reason" in error) {
    const reason = (error as { reason?: unknown }).reason;
    return typeof reason === "string" ? reason : null;
  }
  return null;
}

/**
 * A source told us this track will never play. Used to decide whether a failed
 * track should be marked unavailable for the rest of the session.
 *
 * Note: this never mutates the library row. Unavailability is a transient,
 * in-memory playback fact, never persisted (P1-7 constraint).
 */
export function isPermanentReason(reason: PlaybackFailureReason): boolean {
  if (!reason) return false;
  return !isRetryableReason(reason);
}
