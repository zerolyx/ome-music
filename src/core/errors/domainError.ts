/**
 * 1.0 Foundation — domain error model.
 *
 * Why this exists: today failures are bare `Error` objects whose `message` is
 * already a user-facing sentence, so callers cannot tell "retryable network
 * blip" from "permanent copyright block", and every handler re-invents the
 * distinction. A typed error carries the category and retryability with the
 * failure so one global handler can decide once.
 *
 * Not wired through the whole app yet — Phase 1A only establishes the model.
 */

export type ErrorCategory =
  "playback" | "source" | "auth" | "network" | "storage" | "validation" | "unknown";

export interface DomainError {
  /** Stable machine code, e.g. `source.no_copyright`. */
  code: string;
  category: ErrorCategory;
  /** Human-readable, safe to show. Never contains tokens or URLs with credentials. */
  message: string;
  /** Whether another attempt could plausibly succeed. */
  retryable: boolean;
  cause?: unknown;
}

export function createDomainError(
  code: string,
  category: ErrorCategory,
  message: string,
  options: { retryable?: boolean; cause?: unknown } = {},
): DomainError {
  return {
    code,
    category,
    message,
    retryable: options.retryable ?? category === "network",
    cause: options.cause,
  };
}

export function isDomainError(value: unknown): value is DomainError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "category" in value &&
    "retryable" in value
  );
}

/**
 * Normalise anything thrown at a boundary into a DomainError.
 *
 * Unknown errors are never assumed retryable: an unrecognised failure that
 * auto-retries is how a queue ends up spinning on a permanently dead track.
 */
export function toDomainError(
  error: unknown,
  fallback: { code?: string; category?: ErrorCategory; message?: string } = {},
): DomainError {
  if (isDomainError(error)) return error;

  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return createDomainError(
    fallback.code ?? "unknown",
    fallback.category ?? "unknown",
    fallback.message ?? message,
    { retryable: false, cause: error },
  );
}

/** Categories where the user can usually fix things by acting in Settings. */
export function isActionableCategory(category: ErrorCategory): boolean {
  return category === "auth" || category === "source" || category === "validation";
}
