/**
 * 1.0 Foundation — structured logging.
 *
 * Why this exists: the codebase mixes `console.error` / `console.warn` /
 * `eprintln!` with no shape and no context, which makes a playback bug
 * impossible to trace across the React ↔ Tauri boundary. One logger gives
 * every line the same shape and lets a scope (track id, source, request id) be
 * attached once instead of string-concatenated at every call site.
 *
 * Privacy rule enforced here: payloads are never stringified wholesale. Log
 * what you need, by name — credentials must never reach a log line.
 *
 * Not wired through the app yet — Phase 1A only establishes the primitive.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogScope {
  requestId?: string;
  trackId?: string;
  source?: string;
  area?: string;
  [key: string]: string | undefined;
}

export interface LogEntry {
  level: LogLevel;
  scope: LogScope;
  message: string;
  fields?: Record<string, unknown>;
  at: string;
}

export type LogSink = (entry: LogEntry) => void;

const DEFAULT_SINK: LogSink = (entry) => {
  const prefix = `[ome${entry.scope.area ? `:${entry.scope.area}` : ""}]`;
  const args: unknown[] = [prefix, entry.message];
  if (entry.fields && Object.keys(entry.fields).length > 0) args.push(entry.fields);
  if (entry.level === "error") console.error(...args);
  else if (entry.level === "warn") console.warn(...args);
  else if (entry.level === "info") console.info(...args);
  else console.debug(...args);
};

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(area: string): Logger;
}

let activeSink: LogSink = DEFAULT_SINK;
let minimumLevel: LogLevel = "info";

/** Replace the sink (tests, or a future Tauri-side log bridge). */
export function setLogSink(sink: LogSink): void {
  activeSink = sink;
}

export function setMinimumLevel(level: LogLevel): void {
  minimumLevel = level;
}

export function createLogger(scope: LogScope = {}): Logger {
  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel]) return;
    activeSink({ level, scope, message, fields, at: new Date().toISOString() });
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (area) => createLogger({ ...scope, area }),
  };
}

/** A per-area logger for call sites that just need to report something. */
export const appLogger = createLogger();
