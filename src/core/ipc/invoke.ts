/**
 * 1.0 Foundation — typed IPC boundary.
 *
 * Why this exists: `invoke()` is called from ~90 places with string command
 * names and unvalidated payloads, so a renamed Rust command only fails at
 * runtime. Wrapping it here gives one place to attach error normalisation, and
 * (later) one place to add logging or a timeout.
 *
 * Deliberately thin: it does not cache, retry or transform. Those decisions
 * belong to the caller, and adding them silently is how IPC layers become
 * impossible to reason about.
 *
 * Not wired through the app yet — Phase 1A only establishes the primitive.
 */

import { toDomainError, type ErrorCategory } from "../errors/domainError";

export type IpcInvoker = <Result>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<Result>;

/**
 * Invoke a Tauri command and normalise whatever comes back into a DomainError.
 *
 * `category` is supplied by the caller because only the caller knows whether a
 * failed command means "source unavailable" or "your session expired".
 */
export async function invokeCommand<Result>(
  invoker: IpcInvoker,
  command: string,
  options: {
    args?: Record<string, unknown>;
    category?: ErrorCategory;
    code?: string;
  } = {},
): Promise<Result> {
  try {
    return await invoker<Result>(command, options.args);
  } catch (error) {
    throw toDomainError(error, {
      code: options.code ?? `ipc.${command}`,
      category: options.category ?? "unknown",
    });
  }
}

/** True when the app is running inside the Tauri shell. */
export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
