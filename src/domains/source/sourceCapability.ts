/**
 * 1.0 Foundation — SourceCapability.
 *
 * Why this exists: the same concepts (search, playable URL, login, import)
 * are implemented three times on the Rust side, and the frontend branches on
 * `source === "netease" | "bilibili" | "qqmusic"` in 37 places. A capability
 * model lets callers ask "can this source do X?" instead of "which source is
 * this?", which is the precondition for adding a source without touching the
 * UI.
 *
 * This is a description of today's behaviour, not a rewrite of it. Nothing
 * consumes it yet — Phase 1A only establishes the vocabulary.
 */

export type MusicSourceId = "local" | "netease" | "bilibili" | "qqmusic";

export type SourceCapability =
  /** Free-text search returning playable results. */
  | "search"
  /** Resolve a stable id into a playable URL at request time. */
  | "playableUrl"
  /** Timed lyrics for a track. */
  | "lyrics"
  /** Cover art for a track. */
  | "cover"
  /** Bilibili-style danmaku / video atmosphere. */
  | "danmaku"
  /** Interactive sign-in (QR, cookie import, official webview). */
  | "login"
  /** Import a remote playlist into the local library. */
  | "import"
  /** Selectable audio quality tiers. */
  | "quality";

export interface SourceDescriptor {
  id: MusicSourceId;
  label: string;
  capabilities: ReadonlySet<SourceCapability>;
}

const CAPABILITIES: Record<MusicSourceId, readonly SourceCapability[]> = {
  local: ["cover", "import"],
  netease: ["search", "playableUrl", "lyrics", "cover", "login", "import", "quality"],
  bilibili: ["search", "playableUrl", "cover", "danmaku", "login"],
  // QQ Music stays Experimental / Interface Ready. It is described here so the
  // boundary exists, not because it is finished.
  qqmusic: ["search", "playableUrl", "lyrics", "cover", "login", "quality"],
};

const LABELS: Record<MusicSourceId, string> = {
  local: "Local",
  netease: "NetEase",
  bilibili: "Bilibili",
  qqmusic: "QQ音乐",
};

export function capabilitiesOf(source: MusicSourceId): ReadonlySet<SourceCapability> {
  return new Set(CAPABILITIES[source]);
}

export function supports(source: MusicSourceId, capability: SourceCapability): boolean {
  return CAPABILITIES[source].includes(capability);
}

export function describeSource(source: MusicSourceId): SourceDescriptor {
  return {
    id: source,
    label: LABELS[source],
    capabilities: capabilitiesOf(source),
  };
}

/** Sources that can hand us a URL to hand to the audio element. */
export function canResolvePlayableUrl(source: MusicSourceId): boolean {
  return supports(source, "playableUrl");
}
