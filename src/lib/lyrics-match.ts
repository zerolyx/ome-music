export type LyricsMatchLevel = "high" | "review" | "caution";

export interface LyricsCandidateAssessment {
  score: number;
  level: LyricsMatchLevel;
  label: string;
  reasons: string[];
  durationDifferenceSeconds: number | null;
  versionConflicts: string[];
}

interface LyricsMatchTrack {
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
}

interface LyricsMatchCandidate {
  name: string;
  artists: string;
  album: string;
  durationMs: number | null;
}

const VERSION_MARKERS = [
  { label: "现场版", pattern: /\blive(?:\s+version)?\b|\bconcert\b|现场|ライブ/iu, severe: true },
  { label: "翻唱版", pattern: /\bcover(?:ed\s+by|\s+version)?\b|翻唱|カバー|歌ってみた/iu, severe: true },
  { label: "伴奏版", pattern: /\binstrumental\b|\binst\b|\boff[\s-]?vocal\b|\bkaraoke\b|纯音乐|伴奏|カラオケ/iu, severe: true },
  { label: "混音版", pattern: /\bremix\b|\bmix\b|\bbootleg\b|混音/iu, severe: true },
  { label: "不插电版", pattern: /\bacoustic\b|\bunplugged\b|不插电/iu, severe: true },
  { label: "短版", pattern: /\bshort\s+(?:version|ver\.?)/iu, severe: true },
  { label: "TV 尺寸版", pattern: /\btv[\s-]?size\b|\banime[\s-]?size\b|tvサイズ/iu, severe: true },
  { label: "加长版", pattern: /\blong\s+(?:version|ver\.?)|\bextended\b|完整版|加长版/iu, severe: true },
  { label: "重制版", pattern: /\bremaster(?:ed)?\b|重制/iu, severe: false },
  { label: "试听版", pattern: /\bdemo\b|试听版/iu, severe: true },
  { label: "电台剪辑版", pattern: /\bradio\s+edit\b|电台剪辑/iu, severe: true },
] as const;

const UNKNOWN_ARTIST = /^(?:未知艺人|未知艺术家|unknown(?: artist)?|n\/a)$/iu;

function normalizeMatchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, "");
}

function stringSimilarity(left: string, right: string): number {
  const a = normalizeMatchText(left);
  const b = normalizeMatchText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const aCharacters = new Set(Array.from(a));
  const bCharacters = new Set(Array.from(b));
  let overlap = 0;
  for (const character of aCharacters) {
    if (bCharacters.has(character)) overlap += 1;
  }
  const union = new Set([...aCharacters, ...bCharacters]).size;
  return union ? overlap / union : 0;
}

function splitArtists(value: string): string[] {
  return value
    .split(/[,，、/&＆]|\bfeat(?:uring)?\.?\b|\bft\.?\b|\bwith\b|与/iu)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function artistSimilarity(target: string, candidate: string): number {
  if (UNKNOWN_ARTIST.test(target.trim())) return 0.5;
  if (!target.trim()) return 0.5;
  if (!candidate.trim()) return 0.5;

  const targetArtists = splitArtists(target);
  const candidateArtists = splitArtists(candidate);
  const matchedTargets = targetArtists.filter((targetArtist) =>
    candidateArtists.some((candidateArtist) => stringSimilarity(targetArtist, candidateArtist) >= 0.82),
  ).length;
  const groupSimilarity = targetArtists.length && candidateArtists.length
    ? matchedTargets / Math.max(targetArtists.length, candidateArtists.length)
    : 0;
  return Math.max(stringSimilarity(target, candidate), groupSimilarity);
}

function durationSimilarity(targetSeconds: number, candidateMs: number | null): {
  score: number;
  differenceSeconds: number | null;
} {
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0 || candidateMs === null || !Number.isFinite(candidateMs) || candidateMs <= 0) {
    return { score: 0.45, differenceSeconds: null };
  }

  const differenceSeconds = Math.abs(targetSeconds - candidateMs / 1000);
  const score = differenceSeconds <= 1 ? 1
    : differenceSeconds <= 2 ? 0.96
      : differenceSeconds <= 5 ? 0.86
        : differenceSeconds <= 10 ? 0.62
          : differenceSeconds <= 20 ? 0.32
            : 0.04;
  return { score, differenceSeconds };
}

function versionMarkers(...values: string[]): Set<string> {
  const text = values.join(" ").normalize("NFKC").toLocaleLowerCase();
  return new Set(VERSION_MARKERS.filter((marker) => marker.pattern.test(text)).map((marker) => marker.label));
}

export function assessLyricsCandidate(
  track: LyricsMatchTrack,
  candidate: LyricsMatchCandidate,
): LyricsCandidateAssessment {
  const title = stringSimilarity(track.title, candidate.name);
  const artist = artistSimilarity(track.artist, candidate.artists);
  const hasAlbumPair = Boolean(track.album.trim() && candidate.album.trim());
  const album = hasAlbumPair ? stringSimilarity(track.album, candidate.album) : 0.5;
  const duration = durationSimilarity(track.durationSeconds, candidate.durationMs);
  const trackVersions = versionMarkers(track.title, track.artist, track.album);
  const candidateVersions = versionMarkers(candidate.name, candidate.artists, candidate.album);
  const versionConflicts = VERSION_MARKERS
    .filter((marker) => trackVersions.has(marker.label) !== candidateVersions.has(marker.label))
    .map((marker) => marker.label);
  const hasSevereVersionConflict = VERSION_MARKERS.some(
    (marker) => marker.severe && trackVersions.has(marker.label) !== candidateVersions.has(marker.label),
  );
  const version = versionConflicts.length === 0 ? 1
    : versionConflicts.every((label) => label === "重制版") ? 0.75
      : 0.35;

  // Weight the available identity fields like the reference lyric matchers. Missing album/duration data is neutral,
  // while a clear title or artist mismatch caps the result so it cannot look like a safe automatic match.
  const weightedScore = (
    title * 0.38
    + artist * 0.24
    + album * 0.1
    + duration.score * 0.18
    + version * 0.1
  ) * 100;
  const targetHasKnownArtist = Boolean(track.artist.trim()) && !UNKNOWN_ARTIST.test(track.artist.trim());
  const reliableIdentity = (targetHasKnownArtist && artist >= 0.5) || album >= 0.65;
  const score = Math.max(0, Math.min(100, Math.round(
    title < 0.65 || !reliableIdentity ? Math.min(weightedScore, 74) : weightedScore,
  )));
  const level: LyricsMatchLevel = score < 55 || hasSevereVersionConflict
    ? "caution"
    : score >= 82 && title >= 0.82 && artist >= 0.75 && versionConflicts.length === 0
      ? "high"
      : "review";

  const reasons: string[] = [];
  if (versionConflicts.length) reasons.push(`版本标记不同：${versionConflicts.join("、")}`);
  reasons.push(title >= 0.98 ? "曲名一致" : title >= 0.82 ? "曲名相近" : title < 0.65 ? "曲名差异较大" : "曲名部分相似");
  reasons.push(artist >= 0.98 ? "艺人一致" : artist >= 0.75 ? "艺人接近" : "艺人待核对");
  if (hasAlbumPair && album >= 0.82) reasons.push("专辑相近");
  if (duration.differenceSeconds !== null) {
    reasons.push(duration.differenceSeconds <= 5 ? "时长接近" : "时长差异较大");
  }

  return {
    score,
    level,
    label: level === "high" ? "匹配较高" : level === "review" ? "仍需核对" : "谨慎预览",
    reasons,
    durationDifferenceSeconds: duration.differenceSeconds,
    versionConflicts,
  };
}
