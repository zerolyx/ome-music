/** A short, fixed-length transition keeps radio playback continuous without beat analysis. */
export const CROSSFADE_MAX_SECONDS = 3;
export const CROSSFADE_MIN_SECONDS = 0.12;
export const CROSSFADE_CURVE_STEPS = 64;

export interface CrossfadeGains {
  outgoing: number;
  incoming: number;
}

/**
 * Bound an overlap so it never consumes an unreasonable share of either track.
 * `availableSeconds` is used by automatic end-of-track transitions whose outgoing
 * track is already close to its end.
 */
export function crossfadeDurationSeconds(
  outgoingDuration: number,
  incomingDuration: number,
  availableSeconds = Number.POSITIVE_INFINITY,
): number {
  const limits = [CROSSFADE_MAX_SECONDS, availableSeconds];
  for (const duration of [outgoingDuration, incomingDuration]) {
    if (Number.isFinite(duration) && duration > 0) limits.push(duration * 0.25);
  }
  const result = Math.min(...limits);
  return Number.isFinite(result) && result >= CROSSFADE_MIN_SECONDS
    ? Math.round(result * 1000) / 1000
    : 0;
}

/** Equal-power curves provide a smooth midpoint for unrelated tracks. */
export function crossfadeGains(progress: number): CrossfadeGains {
  const t = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const angle = t * Math.PI * 0.5;
  return { outgoing: Math.cos(angle), incoming: Math.sin(angle) };
}

export function crossfadeGainCurves(steps = CROSSFADE_CURVE_STEPS): {
  outgoing: Float32Array;
  incoming: Float32Array;
} {
  const length = Math.max(2, Math.floor(steps));
  const outgoing = new Float32Array(length);
  const incoming = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const gains = crossfadeGains(index / (length - 1));
    outgoing[index] = gains.outgoing;
    incoming[index] = gains.incoming;
  }
  return { outgoing, incoming };
}

/** Wait until the last 10% of a track, while keeping the requested overlap at most 3 seconds. */
export function shouldStartAutomaticCrossfade(position: number, duration: number): boolean {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return false;
  const remaining = duration - position;
  const lead = Math.min(CROSSFADE_MAX_SECONDS, duration * 0.1);
  return remaining > 0 && remaining <= lead;
}
