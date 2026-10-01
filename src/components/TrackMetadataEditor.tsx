import { useEffect, useRef, useState } from "preact/hooks";
import {
  coverUrl,
  deleteSavedTrackLyrics,
  getSavedTrackLyrics,
  isTauriRuntime,
  lyricsProviderCandidates,
  lyricsProviderLyric,
  metadataCandidateCoverPreviewUrl,
  neteaseLyric,
  neteaseSearch,
  saveTrackLyricsCandidate,
  trackMetadataCandidates,
  type LyricsProvider,
  type SavedTrackLyrics,
  type TrackAudioTags,
} from "../lib/api";
import { formatDuration } from "../lib/audio";
import { assessLyricsCandidate } from "../lib/lyrics-match";
import {
  changedTrackAudioTagLabels,
  trackAudioTagUpdates,
  trackAudioTagsToForm,
  type TrackAudioTagForm,
} from "../lib/track-audio-tags";
import type {
  TrackMetadataCandidate,
  TrackMetadataProvider,
  TrackMetadataSource,
  TrackMetadataSources,
  NeteaseSong,
} from "../types/music";
import {
  clearLibraryTrackAudioTagBackup,
  getLibraryTrackAudioTagBackupStatus,
  readLibraryTrackAudioTags,
  restoreLibraryTrackAudioTagBackup,
  restoreLibraryTrackMetadata,
  updateLibraryTrackMetadata,
  writeLibraryTrackAudioTagUpdates,
  writeLibraryTrackAudioTags,
  writeLibraryTrackCoverArt,
  writeLibraryTrackEmbeddedLyrics,
} from "../state/library";
import { closeTrackMetadataEditor, editingTrack } from "../state/metadata-editor";
import { lyricsTextForEmbedding, lyricsTextFromRaw, parseLrc, rememberLyricsCandidate, type RawLyric } from "../state/lyrics";
import { currentTrack } from "../state/player";
import { Icon } from "./Icon";
import { TrackAudioTagFieldsForm } from "./TrackAudioTagFieldsForm";

const DEMO_METADATA_CANDIDATES: Omit<TrackMetadataCandidate, "source">[] = [
  {
    id: "186016",
    name: "远处的灯",
    artists: "林桥",
    album: "夜行",
    durationMs: 202_000,
    coverUrl: "demo-cover:quiet-night",
  },
  {
    id: "186017",
    name: "远处的灯（现场版）",
    artists: "林桥、夜航乐队",
    album: "深夜现场",
    durationMs: 244_000,
    coverUrl: "demo-cover:live-stage",
  },
];

const DEMO_TRACK_AUDIO_TAGS: TrackAudioTags = {
  title: "远处的灯",
  artist: "林桥",
  album: "夜行",
  albumArtist: "林桥",
  year: "2024",
  genre: "Dream pop",
  trackNumber: 3,
  trackTotal: 12,
  discNumber: 1,
  discTotal: 1,
  bpm: "128",
  comment: "夜行专辑母带",
  commentTruncated: false,
};

const METADATA_PROVIDER_LABELS: Record<TrackMetadataProvider, string> = {
  netease: "网易云",
  qq: "QQ 音乐",
  kugou: "酷狗音乐",
};

const METADATA_PROVIDERS: TrackMetadataProvider[] = ["netease", "qq", "kugou"];

const LYRICS_PROVIDER_LABELS: Record<LyricsProvider, string> = {
  netease: "网易云",
  amll: "AMLL",
  lrclib: "LRCLIB",
  qqmusic: "QQ 音乐",
  kugou: "酷狗音乐",
  kuwo: "酷我音乐",
};

const LYRICS_PROVIDERS: LyricsProvider[] = ["netease", "amll", "lrclib", "qqmusic", "kugou", "kuwo"];

const DEMO_LYRIC_CANDIDATES: NeteaseSong[] = [
  {
    id: 186016,
    name: "Demo 单曲",
    artists: "演示艺人",
    album: "演示专辑",
    durationMs: 180_000,
    coverUrl: null,
    fee: 0,
    plain: true,
  },
  {
    id: 186017,
    name: "Demo 单曲（现场版）",
    artists: "演示艺人、现场乐队",
    album: "演示现场",
    durationMs: 205_000,
    coverUrl: null,
    fee: 0,
    plain: true,
  },
];

const DEMO_LYRIC_TEXT: Record<number, RawLyric> = {
  186016: { lrc: "[00:00.00]灯火落在安静的街\n[00:04.20]晚风慢慢经过窗前\n[00:08.60]把没说完的话写进夜色\n[00:13.10]等一盏灯陪我走远" },
  186017: { lrc: "[00:00.00]远处的灯还亮着\n[00:05.00]人群唱着熟悉的歌\n[00:10.00]每一次回头都看见\n[00:15.00]那条回家的路" },
};

interface LyricCandidate {
  provider: LyricsProvider;
  id: string;
  name: string;
  artists: string;
  album: string;
  durationMs: number | null;
}

const lyricCandidateKey = (candidate: LyricCandidate) => `${candidate.provider}:${candidate.id}`;

const DEMO_ALL_LYRIC_CANDIDATES: LyricCandidate[] = LYRICS_PROVIDERS.map((provider, index) => {
  const song = DEMO_LYRIC_CANDIDATES[index === 4 ? 1 : 0];
  return {
    provider,
    id: String(Number(song.id) + index * 100),
    name: song.name,
    artists: song.artists,
    album: song.album,
    durationMs: song.durationMs,
  };
});

interface SelectedLyricCandidate {
  song: LyricCandidate;
  raw: RawLyric;
  text: string;
}

const METADATA_SOURCE_LABELS: Record<TrackMetadataSource, string> = {
  fileTags: "音频标签",
  netease: "网易云候选",
  qq: "QQ 音乐",
  kugou: "酷狗音乐",
  manual: "手动修改",
  unknown: "未记录",
};

const FILE_TAG_METADATA_SOURCES: TrackMetadataSources = {
  title: "fileTags",
  artist: "fileTags",
  album: "fileTags",
};

const MAX_COVER_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EMBEDDED_LYRIC_BYTES = 1_000_000;
const MAX_EMBEDDED_LYRIC_CHARS = 200_000;

interface SelectedCoverImage {
  fileName: string;
  sizeBytes: number;
  mimeType: "image/png" | "image/jpeg";
  imageBase64: string;
  previewDataUrl: string;
  candidateId?: string;
  sourceLabel?: string;
}

function coverImageDimensions(
  bytes: Uint8Array,
  mimeType: SelectedCoverImage["mimeType"],
): [number, number] {
  let width = 0;
  let height = 0;
  if (mimeType === "image/png") {
    const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      bytes.length < 24
      || !pngHeader.every((value, index) => bytes[index] === value)
      || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR"
    ) throw new Error("PNG 图片数据或尺寸信息无效");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = view.getUint32(16, false);
    height = view.getUint32(20, false);
  } else {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new Error("JPEG 图片数据无效");
    }
    const startOfFrame = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    let cursor = 2;
    let found = false;
    while (cursor + 1 < bytes.length) {
      if (bytes[cursor] !== 0xff) throw new Error("JPEG 图片结构无法读取");
      while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
      const marker = bytes[cursor++];
      if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (cursor + 2 > bytes.length) break;
      const segmentLength = (bytes[cursor] << 8) | bytes[cursor + 1];
      if (segmentLength < 2 || cursor + segmentLength > bytes.length) {
        throw new Error("JPEG 图片结构无法读取");
      }
      if (startOfFrame.has(marker)) {
        if (segmentLength < 7) throw new Error("JPEG 图片尺寸信息无效");
        height = (bytes[cursor + 3] << 8) | bytes[cursor + 4];
        width = (bytes[cursor + 5] << 8) | bytes[cursor + 6];
        found = true;
        break;
      }
      cursor += segmentLength;
    }
    if (!found) throw new Error("JPEG 图片缺少有效的尺寸信息");
  }
  if (width <= 0 || height <= 0 || width > 10_000 || height > 10_000 || width * height > 40_000_000) {
    throw new Error("封面尺寸过大；最长边需在 10,000 像素以内且不超过 4,000 万像素");
  }
  return [width, height];
}

async function readCoverImage(file: File): Promise<SelectedCoverImage> {
  if (file.size <= 0 || file.size > MAX_COVER_IMAGE_BYTES) {
    throw new Error("封面图片必须大于 0 且不超过 8 MB");
  }
  const mimeType = file.type === "image/png" || file.type === "image/jpeg"
    ? file.type
    : /\.png$/i.test(file.name)
      ? "image/png"
      : /\.jpe?g$/i.test(file.name)
        ? "image/jpeg"
        : null;
  if (!mimeType) throw new Error("请选择 PNG 或 JPEG 图片");

  const bytes = new Uint8Array(await file.arrayBuffer());
  coverImageDimensions(bytes, mimeType);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const imageBase64 = btoa(binary);
  return {
    fileName: file.name,
    sizeBytes: file.size,
    mimeType,
    imageBase64,
    previewDataUrl: `data:${mimeType};base64,${imageBase64}`,
  };
}

async function makeDemoCandidateCover(name: string): Promise<SelectedCoverImage> {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法生成本地演示封面");
  const gradient = context.createLinearGradient(0, 0, 320, 320);
  gradient.addColorStop(0, "#087f79");
  gradient.addColorStop(0.55, "#6635cf");
  gradient.addColorStop(1, "#ee9654");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 320, 320);
  context.fillStyle = "rgba(255,255,255,0.22)";
  context.beginPath();
  context.arc(232, 96, 74, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff7ee";
  context.font = "600 28px sans-serif";
  context.fillText(name.slice(0, 12), 22, 256, 276);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("无法生成本地演示封面")), "image/png");
  });
  return readCoverImage(new File([blob], "演示候选封面.png", { type: "image/png" }));
}

function formatAudioFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return "大小未知";
  const megabytes = sizeBytes / (1024 * 1024);
  return megabytes < 1024
    ? `约 ${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`
    : `约 ${(megabytes / 1024).toFixed(1)} GB`;
}

export function TrackMetadataEditor() {
  const track = editingTrack.value;
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [metadataSources, setMetadataSources] = useState<TrackMetadataSources>({
    title: "unknown",
    artist: "unknown",
    album: "unknown",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupSource, setLookupSource] = useState<TrackMetadataProvider>("netease");
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSearched, setLookupSearched] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<TrackMetadataCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<TrackMetadataCandidate | null>(null);
  const [candidateApplied, setCandidateApplied] = useState(false);
  const [candidateCoverPreview, setCandidateCoverPreview] = useState<SelectedCoverImage | null>(null);
  const [candidateCoverLoading, setCandidateCoverLoading] = useState(false);
  const [candidateCoverError, setCandidateCoverError] = useState<string | null>(null);
  const [lyricLookupOpen, setLyricLookupOpen] = useState(false);
  const [lyricProvider, setLyricProvider] = useState<LyricsProvider>("netease");
  const [lyricQuery, setLyricQuery] = useState("");
  const [lyricSearchLoading, setLyricSearchLoading] = useState(false);
  const [lyricSearchDone, setLyricSearchDone] = useState(false);
  const [lyricSearchAllSources, setLyricSearchAllSources] = useState(false);
  const [lyricSearchError, setLyricSearchError] = useState<string | null>(null);
  const [lyricCandidates, setLyricCandidates] = useState<LyricCandidate[]>([]);
  const [lyricPreviewLoadingId, setLyricPreviewLoadingId] = useState<string | null>(null);
  const [lyricCandidatePreview, setLyricCandidatePreview] = useState<SelectedLyricCandidate | null>(null);
  const [savedTrackLyric, setSavedTrackLyric] = useState<SavedTrackLyrics | null>(null);
  const [savedTrackLyricLoading, setSavedTrackLyricLoading] = useState(false);
  const [savedTrackLyricBusy, setSavedTrackLyricBusy] = useState(false);
  const [savedTrackLyricDeleteConfirming, setSavedTrackLyricDeleteConfirming] = useState(false);
  const [savedTrackLyricReplaceConfirming, setSavedTrackLyricReplaceConfirming] = useState(false);
  const [pendingLyricCandidate, setPendingLyricCandidate] = useState<SelectedLyricCandidate | null>(null);
  const [lyricNotice, setLyricNotice] = useState<string | null>(null);
  const [restoreConfirming, setRestoreConfirming] = useState(false);
  const [restoreDone, setRestoreDone] = useState(false);
  const [restoreSource, setRestoreSource] = useState<"snapshot" | "fileTags" | null>(null);
  const [audioTagSectionOpen, setAudioTagSectionOpen] = useState(false);
  const [audioTagStatus, setAudioTagStatus] = useState<{
    phase: "loading" | "ready" | "error" | "unavailable";
    available: boolean;
    sizeBytes: number | null;
    message?: string;
  }>({ phase: "unavailable", available: false, sizeBytes: null });
  const [audioTagWriteConfirming, setAudioTagWriteConfirming] = useState(false);
  const [audioTagFields, setAudioTagFields] = useState<{ original: TrackAudioTags; draft: TrackAudioTagForm } | null>(null);
  const [audioTagFieldsLoading, setAudioTagFieldsLoading] = useState(false);
  const [audioTagFieldsConfirming, setAudioTagFieldsConfirming] = useState(false);
  const [audioLyricsWriteConfirming, setAudioLyricsWriteConfirming] = useState(false);
  const [audioCoverWriteConfirming, setAudioCoverWriteConfirming] = useState(false);
  const [selectedCoverImage, setSelectedCoverImage] = useState<SelectedCoverImage | null>(null);
  const [audioFileRestoreConfirming, setAudioFileRestoreConfirming] = useState(false);
  const [audioTagBackupClearConfirming, setAudioTagBackupClearConfirming] = useState(false);
  const audioTagConfirming = audioTagWriteConfirming || audioTagFieldsConfirming || audioLyricsWriteConfirming || audioCoverWriteConfirming || audioFileRestoreConfirming || audioTagBackupClearConfirming;
  const metadataFormDisabled = saving || restoreDone || audioTagConfirming;
  const [audioTagError, setAudioTagError] = useState<string | null>(null);
  const [audioTagDone, setAudioTagDone] = useState<string | null>(null);
  const lookupRequest = useRef(0);
  const candidateCoverRequest = useRef(0);
  const lyricSearchRequest = useRef(0);
  const lyricPreviewRequest = useRef(0);
  const audioTagRequest = useRef(0);
  const audioTagFieldsRequest = useRef(0);
  const coverPickRequest = useRef(0);
  const coverImageInput = useRef<HTMLInputElement>(null);
  const scrollContent = useRef<HTMLDivElement>(null);
  const lyricResultsPanel = useRef<HTMLUListElement>(null);
  const lyricPreviewPanel = useRef<HTMLDivElement>(null);
  const audioTagSectionElement = useRef<HTMLElement>(null);
  const isDemo = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("demo");
  const audioFileInUse = currentTrack.value?.id === track?.id;
  const audioTagFieldUpdates = audioTagFields
    ? trackAudioTagUpdates(audioTagFields.original, audioTagFields.draft)
    : null;
  const audioTagFieldLabels = audioTagFields
    ? changedTrackAudioTagLabels(audioTagFields.original, audioTagFields.draft)
    : [];

  useEffect(() => {
    lookupRequest.current += 1;
    candidateCoverRequest.current += 1;
    lyricSearchRequest.current += 1;
    lyricPreviewRequest.current += 1;
    if (!track) return;
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album);
    const legacySource: TrackMetadataSource = track.hasMetadataOverride ? "unknown" : "fileTags";
    setMetadataSources({
      title: track.metadataSources?.title ?? legacySource,
      artist: track.metadataSources?.artist ?? legacySource,
      album: track.metadataSources?.album ?? legacySource,
    });
    setError(null);
    setSaving(false);
    setLookupOpen(false);
    setLookupSource("netease");
    setLookupQuery([track.title, track.artist].filter(Boolean).join(" "));
    setLookupLoading(false);
    setLookupSearched(false);
    setLookupError(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setCandidateApplied(false);
    candidateCoverRequest.current += 1;
    setCandidateCoverPreview(null);
    setCandidateCoverLoading(false);
    setCandidateCoverError(null);
    setLyricLookupOpen(false);
    setLyricProvider("netease");
    setLyricQuery([track.title, track.artist].filter(Boolean).join(" "));
    setLyricSearchLoading(false);
    setLyricSearchDone(false);
    setLyricSearchAllSources(false);
    setLyricSearchError(null);
    setLyricCandidates([]);
    setLyricPreviewLoadingId(null);
    setLyricCandidatePreview(null);
    setSavedTrackLyric(null);
    setSavedTrackLyricLoading(false);
    setSavedTrackLyricBusy(false);
    setSavedTrackLyricDeleteConfirming(false);
    setSavedTrackLyricReplaceConfirming(false);
    setPendingLyricCandidate(null);
    setLyricNotice(null);
    setRestoreConfirming(false);
    setRestoreDone(false);
    setRestoreSource(null);
    setAudioTagSectionOpen(false);
    setAudioTagWriteConfirming(false);
    setAudioTagFields(null);
    setAudioTagFieldsLoading(false);
    setAudioTagFieldsConfirming(false);
    audioTagFieldsRequest.current += 1;
    setAudioLyricsWriteConfirming(false);
    setAudioCoverWriteConfirming(false);
    setSelectedCoverImage(null);
    coverPickRequest.current += 1;
    setAudioFileRestoreConfirming(false);
    setAudioTagBackupClearConfirming(false);
    setAudioTagError(null);
    setAudioTagDone(null);
    if (track.source !== "local" || !isTauriRuntime()) {
      audioTagRequest.current += 1;
      setAudioTagStatus({ phase: "unavailable", available: false, sizeBytes: null });
      return;
    }
    const requestId = ++audioTagRequest.current;
    setAudioTagStatus({ phase: "loading", available: false, sizeBytes: null });
    void getLibraryTrackAudioTagBackupStatus(track.id).then((status) => {
      if (audioTagRequest.current !== requestId) return;
      setAudioTagStatus({ phase: "ready", available: status.available, sizeBytes: status.sizeBytes });
    }).catch((cause: unknown) => {
      if (audioTagRequest.current !== requestId) return;
      setAudioTagStatus({
        phase: "error",
        available: false,
        sizeBytes: null,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    });
  }, [track?.id]);

  useEffect(() => {
    let active = true;
    setSavedTrackLyric(null);
    setSavedTrackLyricDeleteConfirming(false);
    setSavedTrackLyricReplaceConfirming(false);
    if (!track || track.source !== "local" || !isTauriRuntime()) {
      setSavedTrackLyricLoading(false);
      return () => { active = false; };
    }
    setSavedTrackLyricLoading(true);
    void getSavedTrackLyrics(track.id).then((saved) => {
      if (active) setSavedTrackLyric(saved);
    }).catch(() => {
      if (active) setSavedTrackLyric(null);
    }).finally(() => {
      if (active) setSavedTrackLyricLoading(false);
    });
    return () => { active = false; };
  }, [track?.id]);

  useEffect(() => {
    if (!track) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) closeTrackMetadataEditor();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [track?.id, saving]);

  useEffect(() => {
    const container = scrollContent.current;
    const target = lyricCandidatePreview
      ? lyricPreviewPanel.current
      : lyricSearchDone && lyricCandidates.length > 0
        ? lyricResultsPanel.current
        : null;
    if (!target || !container) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    let nextScrollTop = container.scrollTop;
    if (targetRect.bottom > containerRect.bottom) {
      nextScrollTop += targetRect.bottom - containerRect.bottom + 12;
    } else if (targetRect.top < containerRect.top) {
      nextScrollTop -= containerRect.top - targetRect.top + 12;
    } else {
      return;
    }

    const reduceMotion = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof container.scrollTo !== "function") {
      container.scrollTop = Math.max(0, nextScrollTop);
      return;
    }
    container.scrollTo({ top: Math.max(0, nextScrollTop), behavior: "smooth" });
  }, [lyricCandidatePreview, lyricSearchDone, lyricCandidates]);

  useEffect(() => {
    const container = scrollContent.current;
    const section = audioTagSectionElement.current;
    if (!pendingLyricCandidate || !container || !section) return;

    const containerRect = container.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    let nextScrollTop = container.scrollTop;
    if (sectionRect.bottom > containerRect.bottom) {
      nextScrollTop += sectionRect.bottom - containerRect.bottom + 12;
    } else if (sectionRect.top < containerRect.top) {
      nextScrollTop -= containerRect.top - sectionRect.top + 12;
    } else {
      return;
    }

    const reduceMotion = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof container.scrollTo !== "function") {
      container.scrollTop = Math.max(0, nextScrollTop);
      return;
    }
    container.scrollTo({ top: Math.max(0, nextScrollTop), behavior: "smooth" });
  }, [pendingLyricCandidate]);

  if (!track) return null;

  const changeLookupSource = (source: TrackMetadataProvider) => {
    if (source === lookupSource) return;
    lookupRequest.current += 1;
    setLookupSource(source);
    setLookupLoading(false);
    setLookupSearched(false);
    setLookupError(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setCandidateApplied(false);
    candidateCoverRequest.current += 1;
    setCandidateCoverPreview(null);
    setCandidateCoverLoading(false);
    setCandidateCoverError(null);
  };

  const changeLyricsProvider = (provider: LyricsProvider) => {
    if (provider === lyricProvider) return;
    lyricSearchRequest.current += 1;
    lyricPreviewRequest.current += 1;
    setLyricProvider(provider);
    setLyricSearchLoading(false);
    setLyricSearchDone(false);
    setLyricSearchAllSources(false);
    setLyricSearchError(null);
    setLyricCandidates([]);
    setLyricCandidatePreview(null);
    setLyricPreviewLoadingId(null);
    setLyricNotice(null);
  };

  const searchCandidates = async () => {
    const query = lookupQuery.trim();
    if (!query || lookupLoading || restoreDone || (!isTauriRuntime() && !isDemo)) return;
    const requestId = ++lookupRequest.current;
    setLookupLoading(true);
    setLookupSearched(false);
    setLookupError(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setCandidateApplied(false);
    candidateCoverRequest.current += 1;
    setCandidateCoverPreview(null);
    setCandidateCoverLoading(false);
    setCandidateCoverError(null);
    try {
      let found: TrackMetadataCandidate[];
      if (isTauriRuntime()) {
        found = await trackMetadataCandidates(lookupSource, query, 10);
      } else if (isDemo) {
        found = DEMO_METADATA_CANDIDATES.map((candidate) => ({
          ...candidate,
          source: lookupSource,
          id: `${lookupSource}:${candidate.id}`,
        }));
      } else {
        throw new Error(`请在 Ome 桌面版中搜索${METADATA_PROVIDER_LABELS[lookupSource]}候选`);
      }
      if (requestId !== lookupRequest.current) return;
      setCandidates(found);
      setLookupSearched(true);
    } catch (cause) {
      if (requestId !== lookupRequest.current) return;
      setLookupError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === lookupRequest.current) setLookupLoading(false);
    }
  };

  const searchLyrics = async (providers: LyricsProvider[] = [lyricProvider]) => {
    const query = lyricQuery.trim();
    if (!query || lyricSearchLoading || restoreDone || (!isTauriRuntime() && !isDemo)) return;
    const requestId = ++lyricSearchRequest.current;
    setLyricSearchLoading(true);
    setLyricSearchDone(false);
    setLyricSearchAllSources(providers.length > 1);
    setLyricSearchError(null);
    setLyricCandidates([]);
    setLyricCandidatePreview(null);
    setLyricNotice(null);
    lyricPreviewRequest.current += 1;
    setLyricPreviewLoadingId(null);
    try {
      const searchProvider = async (provider: LyricsProvider): Promise<LyricCandidate[]> => {
        if (isTauriRuntime()) {
          if (provider === "netease") {
            const songs = await neteaseSearch(query, 8);
            return songs.map((song) => ({
              provider,
              id: String(song.id),
              name: song.name,
              artists: song.artists,
              album: song.album,
              durationMs: song.durationMs,
            }));
          }
          const candidates = await lyricsProviderCandidates(provider, query, 8);
          return candidates.map((candidate) => ({ ...candidate, provider }));
        }
        if (isDemo) {
          if (providers.length > 1) {
            return DEMO_ALL_LYRIC_CANDIDATES.filter((candidate) => candidate.provider === provider);
          }
          return DEMO_LYRIC_CANDIDATES.map((song) => ({
            provider,
            id: String(song.id),
            name: song.name,
            artists: song.artists,
            album: song.album,
            durationMs: song.durationMs,
          }));
        }
        throw new Error("在线歌词候选需在 Ome 桌面版搜索");
      };

      let found: LyricCandidate[];
      if (providers.length === 1) {
        found = await searchProvider(providers[0]);
      } else {
        const results = await Promise.allSettled(providers.map(searchProvider));
        if (requestId !== lyricSearchRequest.current) return;
        const failedProviders = results.flatMap((result, index) =>
          result.status === "rejected" ? [providers[index]] : [],
        );
        if (failedProviders.length === results.length) {
          throw new Error(`所有歌词来源暂时都无法搜索：${failedProviders.map((provider) => LYRICS_PROVIDER_LABELS[provider]).join("、")}。`);
        }
        found = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
        if (failedProviders.length > 0) {
          setLyricSearchError(`部分来源暂时不可用：${failedProviders.map((provider) => LYRICS_PROVIDER_LABELS[provider]).join("、")}；其余候选仍可预览。`);
        }
        const providerOrder = new Map(providers.map((provider, index) => [provider, index]));
        found = found
          .map((song, index) => ({
            song,
            index,
            score: assessLyricsCandidate({
              title: title.trim() ? title : track.title,
              artist: artist.trim() ? artist : track.artist,
              album: album.trim() ? album : track.album,
              durationSeconds: track.durationSeconds,
            }, song).score,
          }))
          .sort((left, right) => right.score - left.score
            || (providerOrder.get(left.song.provider) ?? 0) - (providerOrder.get(right.song.provider) ?? 0)
            || left.index - right.index)
          .map(({ song }) => song);
      }
      if (requestId !== lyricSearchRequest.current) return;
      setLyricCandidates(found);
      setLyricSearchDone(true);
    } catch (cause) {
      if (requestId !== lyricSearchRequest.current) return;
      setLyricSearchError(cause instanceof Error ? cause.message : "歌词候选搜索失败，请稍后再试。");
    } finally {
      if (requestId === lyricSearchRequest.current) setLyricSearchLoading(false);
    }
  };

  const previewLyrics = async (song: LyricCandidate) => {
    if (lyricPreviewLoadingId !== null || restoreDone) return;
    const requestId = ++lyricPreviewRequest.current;
    setLyricPreviewLoadingId(lyricCandidateKey(song));
    setLyricSearchError(null);
    setLyricNotice(null);
    setSavedTrackLyricReplaceConfirming(false);
    try {
      let raw: RawLyric;
      if (isTauriRuntime()) {
        raw = song.provider === "netease"
          ? await neteaseLyric(Number(song.id))
          : await lyricsProviderLyric(song.provider, song.id);
      } else if (isDemo && song.provider === "amll") {
        raw = {
          lrc: "",
          ttml: "<tt xmlns=\"http://www.w3.org/ns/ttml\"><body><div><p begin=\"00:00:00.000\" end=\"00:00:03.000\">AMLL 演示歌词</p></div></body></tt>",
        };
      } else {
        raw = DEMO_LYRIC_TEXT[Number(song.id)] ?? { lrc: "" };
      }
      if (requestId !== lyricPreviewRequest.current) return;
      const text = lyricsTextFromRaw(raw);
      setLyricCandidatePreview({ song, raw, text });
      if (!text) setLyricNotice("这个候选暂时没有可用的主歌词文本。");
    } catch (cause) {
      if (requestId !== lyricPreviewRequest.current) return;
      setLyricSearchError(cause instanceof Error ? cause.message : "读取候选歌词失败，请稍后再试。");
    } finally {
      if (requestId === lyricPreviewRequest.current) setLyricPreviewLoadingId(null);
    }
  };

  const rememberLyricCandidate = () => {
    if (!lyricCandidatePreview?.text) return;
    rememberLyricsCandidate(track.id, lyricCandidatePreview.raw);
    setLyricNotice("已记住到本次应用会话；播放这首曲目时可复用，没有修改文件。");
  };

  const saveLyricCandidateToLibrary = async (confirmReplace = false) => {
    if (!track || !lyricCandidatePreview?.text || !isTauriRuntime()) return;
    const song = lyricCandidatePreview.song;
    const replacesExisting = savedTrackLyric !== null
      && (savedTrackLyric.provider !== song.provider || savedTrackLyric.providerId !== song.id);
    if (replacesExisting && !confirmReplace) {
      setSavedTrackLyricReplaceConfirming(true);
      return;
    }
    setSavedTrackLyricBusy(true);
    setSavedTrackLyricReplaceConfirming(false);
    setLyricSearchError(null);
    try {
      const saved = await saveTrackLyricsCandidate(track.id, {
        provider: song.provider,
        providerId: song.id,
        title: song.name,
        artist: song.artists,
        album: song.album || null,
        rawLyrics: lyricCandidatePreview.raw,
      });
      rememberLyricsCandidate(track.id, lyricCandidatePreview.raw);
      if (editingTrack.value?.id === track.id) {
        setSavedTrackLyric(saved);
        setLyricNotice("已保存到本地歌词库；之后播放这首曲目时可复用，没有修改音频文件。");
      }
    } catch (cause) {
      if (editingTrack.value?.id === track.id) {
        setLyricSearchError(cause instanceof Error ? cause.message : "保存歌词失败，请稍后重试。");
      }
    } finally {
      if (editingTrack.value?.id === track.id) setSavedTrackLyricBusy(false);
    }
  };

  const deleteSavedLyricFromLibrary = async () => {
    if (!track || !savedTrackLyric || !isTauriRuntime()) return;
    setSavedTrackLyricBusy(true);
    setLyricSearchError(null);
    try {
      await deleteSavedTrackLyrics(track.id);
      if (editingTrack.value?.id === track.id) {
        setSavedTrackLyric(null);
        setSavedTrackLyricDeleteConfirming(false);
        setLyricNotice("已从本地歌词库移除；音频文件没有变化。");
      }
    } catch (cause) {
      if (editingTrack.value?.id === track.id) {
        setLyricSearchError(cause instanceof Error ? cause.message : "移除保存歌词失败，请稍后重试。");
      }
    } finally {
      if (editingTrack.value?.id === track.id) setSavedTrackLyricBusy(false);
    }
  };

  const useLyricCandidateForEmbedding = () => {
    if (!lyricCandidatePreview?.text) return;
    setPendingLyricCandidate(lyricCandidatePreview);
    setAudioTagSectionOpen(true);
    setAudioLyricsWriteConfirming(false);
    setAudioTagError(null);
    setAudioTagDone("已选为待嵌入歌词；音频文件尚未修改，请在音频操作区单独确认。");
  };

  const applyCandidateToForm = () => {
    if (!selectedCandidate) return;
    setTitle(selectedCandidate.name);
    setArtist(selectedCandidate.artists);
    setAlbum(selectedCandidate.album);
    setMetadataSources({
      title: selectedCandidate.source,
      artist: selectedCandidate.source,
      album: selectedCandidate.source,
    });
    setCandidateApplied(true);
    if (scrollContent.current) scrollContent.current.scrollTop = 0;
  };

  const applyCandidateField = (field: "title" | "artist" | "album") => {
    if (!selectedCandidate) return;
    const value = selectedCandidate[field === "title" ? "name" : field === "artist" ? "artists" : "album"];
    if (!value.trim()) return;
    if (field === "title") setTitle(value);
    else if (field === "artist") setArtist(value);
    else setAlbum(value);
    setMetadataSources((sources) => ({ ...sources, [field]: selectedCandidate.source }));
    setCandidateApplied(true);
  };

  const updateLookupQuery = (value: string) => {
    lookupRequest.current += 1;
    setLookupQuery(value);
    setLookupLoading(false);
    setLookupSearched(false);
    setLookupError(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setCandidateApplied(false);
    candidateCoverRequest.current += 1;
    setCandidateCoverPreview(null);
    setCandidateCoverLoading(false);
    setCandidateCoverError(null);
  };

  const selectCandidate = (candidate: TrackMetadataCandidate) => {
    if (selectedCandidate?.id === candidate.id) return;
    candidateCoverRequest.current += 1;
    setSelectedCandidate(candidate);
    setCandidateApplied(false);
    setCandidateCoverPreview(null);
    setCandidateCoverLoading(false);
    setCandidateCoverError(null);
  };

  const loadCandidateCover = async (candidate: TrackMetadataCandidate) => {
    if (!candidate.coverUrl || candidateCoverLoading) return;
    const requestId = ++candidateCoverRequest.current;
    setCandidateCoverLoading(true);
    setCandidateCoverError(null);
    setCandidateCoverPreview(null);
    try {
      let cover: SelectedCoverImage;
      if (isDemo) {
        cover = await makeDemoCandidateCover(candidate.name);
      } else {
        const previewUrl = metadataCandidateCoverPreviewUrl(candidate.coverUrl);
        if (!previewUrl) throw new Error("候选封面来源不受支持，或需要在 Ome 桌面版中预览");
        const response = await fetch(previewUrl, {
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error("暂时无法读取候选封面，请稍后重试");
        const blob = await response.blob();
        const mimeType = (response.headers.get("content-type") ?? blob.type).split(";")[0].trim().toLowerCase();
        if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
          throw new Error("候选封面只支持 PNG 或 JPEG 图片");
        }
        const extension = mimeType === "image/png" ? "png" : "jpg";
        cover = await readCoverImage(new File([blob], `候选封面.${extension}`, { type: mimeType }));
      }
      if (candidateCoverRequest.current === requestId) setCandidateCoverPreview(cover);
    } catch (cause) {
      if (candidateCoverRequest.current === requestId) {
        setCandidateCoverError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (candidateCoverRequest.current === requestId) setCandidateCoverLoading(false);
    }
  };

  const useCandidateCover = () => {
    if (!selectedCandidate || !candidateCoverPreview || audioFileInUse) return;
    const extension = candidateCoverPreview.mimeType === "image/png" ? "png" : "jpg";
    setSelectedCoverImage({
      ...candidateCoverPreview,
      fileName: `${METADATA_PROVIDER_LABELS[selectedCandidate.source]} 候选封面.${extension}`,
      candidateId: selectedCandidate.id,
      sourceLabel: `${METADATA_PROVIDER_LABELS[selectedCandidate.source]}候选`,
    });
    setAudioTagSectionOpen(true);
    setAudioTagError(null);
    setAudioTagDone("候选封面已选作待写入图片；音频和曲库尚未修改。请在下方单独确认写入。");
  };

  const save = async (event: Event) => {
    event.preventDefault();
    if (saving || audioTagConfirming) return;
    setSaving(true);
    setError(null);
    try {
      await updateLibraryTrackMetadata(track.id, { title, artist, album, metadataSources });
      closeTrackMetadataEditor();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  const confirmRestore = async () => {
    if (saving || audioTagConfirming) return;
    setSaving(true);
    setError(null);
    lookupRequest.current += 1;
    setLookupLoading(false);
    setLookupOpen(false);
    setCandidates([]);
    setSelectedCandidate(null);
    try {
      const restored = await restoreLibraryTrackMetadata(track.id);
      setTitle(restored.track.title);
      setArtist(restored.track.artist);
      setAlbum(restored.track.album);
      setMetadataSources(restored.track.metadataSources ?? FILE_TAG_METADATA_SOURCES);
      setCandidateApplied(false);
      setRestoreSource(restored.source);
      setRestoreConfirming(false);
      setRestoreDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const refreshAudioTagStatus = async () => {
    const requestId = ++audioTagRequest.current;
    setAudioTagStatus({ phase: "loading", available: false, sizeBytes: null });
    try {
      const status = await getLibraryTrackAudioTagBackupStatus(track.id);
      if (audioTagRequest.current !== requestId) return;
      setAudioTagStatus({ phase: "ready", available: status.available, sizeBytes: status.sizeBytes });
    } catch (cause) {
      if (audioTagRequest.current !== requestId) return;
      setAudioTagStatus({
        phase: "error",
        available: false,
        sizeBytes: null,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  const loadTrackAudioTags = async () => {
    if (audioTagFieldsLoading || audioTagConfirming) return;
    const requestId = ++audioTagFieldsRequest.current;
    setAudioTagFieldsLoading(true);
    setAudioTagError(null);
    setAudioTagDone(null);
    try {
      const tags = isTauriRuntime()
        ? await readLibraryTrackAudioTags(track.id)
        : isDemo
          ? DEMO_TRACK_AUDIO_TAGS
          : (() => { throw new Error("读取本地音频标签需在 Ome 桌面版中进行"); })();
      if (audioTagFieldsRequest.current !== requestId) return;
      setAudioTagFields({ original: tags, draft: trackAudioTagsToForm(tags) });
      setAudioTagFieldsConfirming(false);
      setAudioTagDone(isTauriRuntime()
        ? "已读取这首音频文件当前的内嵌标签。"
        : "已载入固定演示标签；此页面不会读取或写入本机音频。");
    } catch (cause) {
      if (audioTagFieldsRequest.current === requestId) {
        setAudioTagError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (audioTagFieldsRequest.current === requestId) setAudioTagFieldsLoading(false);
    }
  };

  const updateTrackAudioTagField = (field: keyof TrackAudioTagForm, value: string) => {
    setAudioTagFields((current) => current
      ? { ...current, draft: { ...current.draft, [field]: value } }
      : current);
    setAudioTagError(null);
    setAudioTagDone(null);
    setAudioTagFieldsConfirming(false);
  };

  const confirmWriteTrackAudioTags = async () => {
    if (saving || audioFileInUse || !audioTagFields || !audioTagFieldUpdates || !isTauriRuntime()) return;
    const updates = audioTagFieldUpdates;
    const draft = audioTagFields.draft;
    setSaving(true);
    setAudioTagError(null);
    setAudioTagDone(null);
    try {
      const updated = await writeLibraryTrackAudioTagUpdates(track.id, updates);
      const year = draft.year.trim();
      const trackNumber = draft.trackNumber.trim();
      const discNumber = draft.discNumber.trim();
      const bpm = draft.bpm.trim();
      const confirmedTags: TrackAudioTags = {
        ...audioTagFields.original,
        title: draft.title.trim(),
        artist: draft.artist.trim(),
        album: draft.album.trim(),
        albumArtist: draft.albumArtist.trim(),
        year: year || null,
        genre: draft.genre.trim(),
        trackNumber: trackNumber ? Number(trackNumber) : null,
        discNumber: discNumber ? Number(discNumber) : null,
        bpm: bpm || null,
        comment: draft.comment.trim(),
      };
      setAudioTagFields({ original: confirmedTags, draft: trackAudioTagsToForm(confirmedTags) });
      setAudioTagFieldsConfirming(false);
      if (updates.syncLibraryMetadata) {
        setTitle(updated.title);
        setArtist(updated.artist);
        setAlbum(updated.album);
        setMetadataSources(updated.metadataSources ?? FILE_TAG_METADATA_SOURCES);
        setCandidateApplied(false);
      }
      setAudioTagDone(updates.syncLibraryMetadata
        ? "已写入单曲内嵌标签，曲名、艺人和专辑也已同步到曲库资料。"
        : "已写入选定的单曲内嵌标签；曲库资料保持不变。音轨号和碟号总数已保留。");
      await refreshAudioTagStatus();
    } catch (cause) {
      setAudioTagError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const confirmWriteAudioTags = async () => {
    if (saving || currentTrack.value?.id === track.id) return;
    setSaving(true);
    setAudioTagError(null);
    setAudioTagDone(null);
    try {
      const updated = await writeLibraryTrackAudioTags(track.id, title, artist, album);
      setTitle(updated.title);
      setArtist(updated.artist);
      setAlbum(updated.album);
      setMetadataSources(updated.metadataSources ?? FILE_TAG_METADATA_SOURCES);
      setCandidateApplied(false);
      setAudioTagWriteConfirming(false);
      setAudioTagDone("已将曲名、艺人和专辑写入音频标签，曲库资料也已同步。");
      await refreshAudioTagStatus();
    } catch (cause) {
      setAudioTagError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const confirmWriteAudioLyrics = async () => {
    if (saving || currentTrack.value?.id === track.id || !embeddedLyrics || !embeddedLyricsWithinLimit) return;
    setSaving(true);
    setAudioTagError(null);
    setAudioTagDone(null);
    try {
      await writeLibraryTrackEmbeddedLyrics(track.id, embeddedLyrics);
      setAudioLyricsWriteConfirming(false);
      setAudioTagDone(`已将 ${embeddedLyricsLineCount} 行${embeddedLyricsSourceLabel}写入音频标签；曲库资料未改变。`);
      setPendingLyricCandidate(null);
      await refreshAudioTagStatus();
    } catch (cause) {
      setAudioTagError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const chooseAudioCover = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const requestId = ++coverPickRequest.current;
    setSelectedCoverImage(null);
    setAudioTagError(null);
    setAudioTagDone(null);
    try {
      const selected = await readCoverImage(file);
      if (coverPickRequest.current === requestId) setSelectedCoverImage(selected);
    } catch (cause) {
      if (coverPickRequest.current === requestId) {
        setAudioTagError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  };

  const confirmWriteAudioCover = async () => {
    if (saving || currentTrack.value?.id === track.id || !selectedCoverImage) return;
    setSaving(true);
    setAudioTagError(null);
    setAudioTagDone(null);
    try {
      await writeLibraryTrackCoverArt(
        track.id,
        selectedCoverImage.imageBase64,
        selectedCoverImage.mimeType,
      );
      setSelectedCoverImage(null);
      setAudioCoverWriteConfirming(false);
      setAudioTagDone("已将单曲封面嵌入音频标签，并更新曲库封面缓存。");
      await refreshAudioTagStatus();
    } catch (cause) {
      setAudioTagError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const confirmRestoreAudioFile = async () => {
    if (saving || currentTrack.value?.id === track.id) return;
    setSaving(true);
    setAudioTagError(null);
    setAudioTagDone(null);
    try {
      const updated = await restoreLibraryTrackAudioTagBackup(track.id);
      setTitle(updated.title);
      setArtist(updated.artist);
      setAlbum(updated.album);
      setMetadataSources(updated.metadataSources ?? FILE_TAG_METADATA_SOURCES);
      setCandidateApplied(false);
      setAudioFileRestoreConfirming(false);
      setAudioTagDone("已恢复首次写入前的整首音频文件，曲库资料也已同步。");
      await refreshAudioTagStatus();
    } catch (cause) {
      setAudioTagError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const confirmClearAudioTagBackup = async () => {
    if (saving) return;
    setSaving(true);
    setAudioTagError(null);
    setAudioTagDone(null);
    try {
      await clearLibraryTrackAudioTagBackup(track.id);
      audioTagRequest.current += 1;
      setAudioTagStatus({ phase: "ready", available: false, sizeBytes: null });
      setAudioTagBackupClearConfirming(false);
      setAudioTagDone("已删除应用数据中的恢复备份；当前音频文件没有变化。");
    } catch (cause) {
      setAudioTagError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const embeddedLyrics = pendingLyricCandidate?.text ?? lyricsTextForEmbedding(track.id);
  const embeddedLyricsWithinLimit = embeddedLyrics.length > 0
    && Array.from(embeddedLyrics).length <= MAX_EMBEDDED_LYRIC_CHARS
    && new TextEncoder().encode(embeddedLyrics).length <= MAX_EMBEDDED_LYRIC_BYTES;
  const embeddedLyricsSourceLabel = pendingLyricCandidate
    ? `选定的${LYRICS_PROVIDER_LABELS[pendingLyricCandidate.song.provider]}候选歌词`
    : "已加载的主歌词";
  const lyricCandidateWithinLimit = lyricCandidatePreview !== null
    && lyricCandidatePreview.text.length > 0
    && Array.from(lyricCandidatePreview.text).length <= MAX_EMBEDDED_LYRIC_CHARS
    && new TextEncoder().encode(lyricCandidatePreview.text).length <= MAX_EMBEDDED_LYRIC_BYTES;
  const lyricCandidateLineCount = lyricCandidatePreview?.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[a-z][a-z0-9_]*\s*:/i.test(line)).length ?? 0;
  const embeddedLyricsRows = embeddedLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[a-z][a-z0-9_]*\s*:/i.test(line));
  const embeddedLyricsLineCount = embeddedLyricsRows.length;
  const embeddedLyricsPreview = embeddedLyricsRows[0]
    ?.replace(/^(?:\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\])+/, "")
    .trim()
    .slice(0, 90) ?? "";

  return (
    <div class="picker-backdrop" onClick={() => { if (!saving) closeTrackMetadataEditor(); }}>
      <form
        class="picker-dialog track-metadata-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-metadata-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void save(event)}
      >
        <header class="picker-head">
          <div class="track-metadata-heading">
            <span class="picker-title" id="track-metadata-title">修正曲目信息</span>
          <span class="picker-subject">{restoreDone ? title : track.title}</span>
          </div>
          <button
            class="picker-close"
            type="button"
            aria-label="关闭"
            disabled={saving}
            onClick={closeTrackMetadataEditor}
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        <div class="track-metadata-scroll-content" ref={scrollContent}>
          <div class="track-metadata-fields">
            <label class="track-metadata-field">
              <span class="track-metadata-field-label">
                <span>曲名</span>
                <small>来源 · {METADATA_SOURCE_LABELS[metadataSources.title]}</small>
              </span>
              <input
                class="picker-input"
                type="text"
                maxLength={200}
                required
                autoFocus
                value={title}
                disabled={metadataFormDisabled}
                onInput={(event) => {
                  setTitle((event.target as HTMLInputElement).value);
                  setMetadataSources((sources) => ({ ...sources, title: "manual" }));
                  setCandidateApplied(false);
                }}
              />
            </label>
            <label class="track-metadata-field">
              <span class="track-metadata-field-label">
                <span>艺人</span>
                <small>来源 · {METADATA_SOURCE_LABELS[metadataSources.artist]}</small>
              </span>
              <input
                class="picker-input"
                type="text"
                maxLength={200}
                required
                value={artist}
                disabled={metadataFormDisabled}
                onInput={(event) => {
                  setArtist((event.target as HTMLInputElement).value);
                  setMetadataSources((sources) => ({ ...sources, artist: "manual" }));
                  setCandidateApplied(false);
                }}
              />
            </label>
            <label class="track-metadata-field">
              <span class="track-metadata-field-label">
                <span>专辑 <small>可选</small></span>
                <small>来源 · {METADATA_SOURCE_LABELS[metadataSources.album]}</small>
              </span>
              <input
                class="picker-input"
                type="text"
                maxLength={200}
                value={album}
                disabled={metadataFormDisabled}
                onInput={(event) => {
                  setAlbum((event.target as HTMLInputElement).value);
                  setMetadataSources((sources) => ({ ...sources, album: "manual" }));
                  setCandidateApplied(false);
                }}
              />
            </label>
          </div>

          <section
            class="track-metadata-lookup"
            aria-label={`${METADATA_PROVIDER_LABELS[lookupSource]}资料候选`}
          >
            <button
              class="track-metadata-lookup-toggle"
              type="button"
              aria-expanded={lookupOpen}
              disabled={metadataFormDisabled}
              onClick={() => setLookupOpen((open) => !open)}
            >
              <Icon name="search" size={14} />
              {lookupOpen
                ? `收起${METADATA_PROVIDER_LABELS[lookupSource]}候选`
                : `从${METADATA_PROVIDER_LABELS[lookupSource]}查找候选`}
            </button>
            {lookupOpen && (
              <div class="track-metadata-lookup-body">
                <div class="track-metadata-provider-switch" role="group" aria-label="候选资料来源">
                  {METADATA_PROVIDERS.map((source) => (
                    <button
                      class="btn-secondary"
                      type="button"
                      key={source}
                      aria-pressed={lookupSource === source}
                      disabled={metadataFormDisabled}
                      onClick={() => changeLookupSource(source)}
                    >
                      {METADATA_PROVIDER_LABELS[source]}
                    </button>
                  ))}
                </div>
                <p class="track-metadata-lookup-note">
                  {isDemo
                    ? "演示候选不会访问网络。"
                    : isTauriRuntime()
                      ? `搜索会把检索文字发送给${METADATA_PROVIDER_LABELS[lookupSource]}；只读取候选资料，不上传本地音频。`
                      : `${METADATA_PROVIDER_LABELS[lookupSource]}搜索需在 Ome 桌面版中使用。`}
                </p>
                <div class="track-metadata-search-row">
                  <input
                    class="picker-input"
                    type="search"
                    maxLength={200}
                    aria-label={`${METADATA_PROVIDER_LABELS[lookupSource]}搜索关键词`}
                    placeholder="歌曲名、艺人…"
                    value={lookupQuery}
                    disabled={lookupLoading || saving || restoreDone || (!isTauriRuntime() && !isDemo)}
                    onInput={(event) => updateLookupQuery((event.currentTarget as HTMLInputElement).value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchCandidates();
                      }
                    }}
                  />
                  <button
                    class="btn-secondary"
                    type="button"
                    disabled={lookupLoading || saving || restoreDone || !lookupQuery.trim() || (!isTauriRuntime() && !isDemo)}
                    onClick={() => void searchCandidates()}
                  >
                    {lookupLoading ? "搜索中…" : lookupSearched ? "重新搜索" : "搜索"}
                  </button>
                </div>
                {lookupError && <p class="track-metadata-error" role="alert">{lookupError}</p>}
                {lookupLoading && <p class="track-metadata-lookup-state" role="status">正在查找候选…</p>}
                {lookupSearched && !lookupLoading && candidates.length === 0 && !lookupError && (
                  <p class="track-metadata-lookup-state" role="status">没有找到候选，可以修改关键词再试。</p>
                )}
                {candidates.length > 0 && (
                  <ul
                    class="track-metadata-candidates"
                    aria-label={`${METADATA_PROVIDER_LABELS[lookupSource]}搜索结果`}
                  >
                    {candidates.map((candidate) => {
                      const isSelected = selectedCandidate?.id === candidate.id;
                      const durationSeconds = Math.max(0, Math.round(candidate.durationMs / 1000));
                      const durationDifference = Math.abs(durationSeconds - track.durationSeconds);
                      const durationHint = track.durationSeconds <= 0
                        ? `时长 ${formatDuration(durationSeconds)}`
                        : durationDifference === 0
                          ? `时长 ${formatDuration(durationSeconds)} · 与本地一致`
                          : `时长 ${formatDuration(durationSeconds)} · 相差 ${formatDuration(durationDifference)}`;
                      return (
                        <li class={`track-metadata-candidate ${isSelected ? "is-selected" : ""}`} key={candidate.id}>
                          <div class="track-metadata-candidate-copy">
                            <strong>{candidate.name}</strong>
                            <span>{candidate.artists}{candidate.album ? ` · ${candidate.album}` : ""}</span>
                            <small>{durationHint}</small>
                          </div>
                          <button
                            class="btn-secondary"
                          type="button"
                          disabled={metadataFormDisabled}
                            aria-pressed={isSelected}
                            aria-label={`${isSelected ? "已预览" : "预览"}候选：${candidate.name} · ${candidate.artists}`}
                            onClick={() => selectCandidate(candidate)}
                          >
                            {isSelected ? "已预览" : "预览"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {selectedCandidate && (
                  <div class="track-metadata-candidate-preview" aria-label="候选预览">
                    <div class="track-metadata-candidate-preview-copy">
                      <span>{METADATA_PROVIDER_LABELS[selectedCandidate.source]}候选预览</span>
                      <strong>{selectedCandidate.name}</strong>
                      <small>{selectedCandidate.artists}{selectedCandidate.album ? ` · ${selectedCandidate.album}` : ""}</small>
                    </div>
                    <div class="track-metadata-candidate-actions" role="group" aria-label="候选资料填入方式">
                      <button
                        class="btn-secondary"
                        type="button"
                        disabled={metadataFormDisabled || !selectedCandidate.name.trim()}
                        onClick={() => applyCandidateField("title")}
                      >
                        仅填曲名
                      </button>
                      <button
                        class="btn-secondary"
                        type="button"
                        disabled={metadataFormDisabled || !selectedCandidate.artists.trim()}
                        onClick={() => applyCandidateField("artist")}
                      >
                        仅填艺人
                      </button>
                      <button
                        class="btn-secondary"
                        type="button"
                        disabled={metadataFormDisabled || !selectedCandidate.album.trim()}
                        onClick={() => applyCandidateField("album")}
                      >
                        仅填专辑
                      </button>
                      <button
                        class="btn-secondary"
                        type="button"
                        disabled={metadataFormDisabled}
                        onClick={applyCandidateToForm}
                      >
                        填入全部
                      </button>
                    </div>
                    {track.source === "local" && selectedCandidate.coverUrl && (
                      <>
                        <div class="track-metadata-candidate-artwork" aria-label="候选封面预览">
                          {candidateCoverPreview ? (
                            <img src={candidateCoverPreview.previewDataUrl} alt="在线候选封面" />
                          ) : (
                            <div class="track-metadata-candidate-artwork-empty" aria-hidden="true">封面</div>
                          )}
                          <div class="track-metadata-candidate-artwork-copy">
                            <strong>候选封面</strong>
                            <small>按需读取；选用后仍需在下方确认写入音频。</small>
                          </div>
                          <div class="track-metadata-candidate-artwork-actions">
                            <button
                              class="btn-secondary"
                              type="button"
                              disabled={candidateCoverLoading || metadataFormDisabled}
                              onClick={() => void loadCandidateCover(selectedCandidate)}
                            >
                              {candidateCoverLoading ? "读取中…" : candidateCoverPreview ? "重新预览" : "预览封面"}
                            </button>
                            {candidateCoverPreview && (
                              <button
                                class="btn-secondary"
                                type="button"
                                disabled={audioFileInUse || metadataFormDisabled}
                                aria-pressed={selectedCoverImage?.candidateId === selectedCandidate.id}
                                onClick={useCandidateCover}
                              >
                                {selectedCoverImage?.candidateId === selectedCandidate.id ? "已选用" : "选为待写入封面"}
                              </button>
                            )}
                          </div>
                        </div>
                        {candidateCoverError && <p class="track-metadata-error" role="alert">{candidateCoverError}</p>}
                        {candidateCoverPreview && (
                          <p class="track-metadata-lookup-state" role="status">
                            {isDemo
                              ? "这是本机生成的演示封面，不会访问图片服务。"
                              : `已读取 ${formatAudioFileSize(candidateCoverPreview.sizeBytes)} 封面到编辑器内存；尚未修改音频或曲库。`}
                          </p>
                        )}
                        {audioFileInUse && candidateCoverPreview && (
                          <p class="track-metadata-audio-tags-warning" role="status">播放器仍选中这首曲目；切换到其他曲目后才能写入封面。</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                {candidateApplied && (
                  <p class="track-metadata-lookup-state" role="status">
                    已将候选资料填入表单；检查无误后再点击“保存资料”更新曲库。
                  </p>
                )}
              </div>
            )}
          </section>

          {track.source === "local" && (
            <section class="track-metadata-lyrics-lookup" aria-label="在线歌词候选">
              <button
                class="track-metadata-lookup-toggle"
                type="button"
                aria-expanded={lyricLookupOpen}
                disabled={saving || audioTagConfirming}
                onClick={() => setLyricLookupOpen((open) => !open)}
              >
                {lyricLookupOpen ? "收起歌词候选" : "搜索在线歌词候选"}
              </button>
              {lyricLookupOpen && (
                <div class="track-metadata-lyrics-body">
                  <div class="track-metadata-lyrics-sources" role="group" aria-label="歌词来源">
                    {LYRICS_PROVIDERS.map((provider) => (
                      <button
                        class={`track-metadata-lyrics-source${lyricProvider === provider ? " is-active" : ""}`}
                        type="button"
                        key={provider}
                        aria-pressed={lyricProvider === provider}
                        disabled={saving || restoreDone || audioTagConfirming}
                        onClick={() => changeLyricsProvider(provider)}
                      >
                        {LYRICS_PROVIDER_LABELS[provider]}
                      </button>
                    ))}
                  </div>
                  <p class="track-metadata-lookup-note">
                    {isDemo
                      ? "演示候选由本机生成，不会访问网络。"
                        : lyricSearchAllSources
                          ? "本次搜索已将关键词发送给六个歌词服务；列表仅含候选信息，预览时才读取所选歌词。不会上传音频、路径或 Cookie。"
                        : isTauriRuntime()
                        ? lyricProvider === "lrclib"
                          ? "仅在点击搜索后发送关键词。LRCLIB 响应会附带歌词字段；Ome 只展示曲目信息，预览时再读取所选歌词。不会上传音频、路径或 Cookie。"
                          : lyricProvider === "qqmusic" || lyricProvider === "kugou" || lyricProvider === "kuwo"
                            ? `${LYRICS_PROVIDER_LABELS[lyricProvider]}接口可能限流或变更；仅在点击搜索后发送关键词，预览时读取所选歌词。不会上传音频、路径或 Cookie。`
                            : `仅在点击搜索后，将关键词发送给${LYRICS_PROVIDER_LABELS[lyricProvider]}；歌词在预览时读取。不会上传音频、文件路径或登录 Cookie。`
                        : "在线歌词候选需在 Ome 桌面版搜索。"}
                  </p>
                  {savedTrackLyricLoading && (
                    <p class="track-metadata-lookup-state" role="status">正在读取本地歌词库…</p>
                  )}
                  {savedTrackLyric && (
                    <div class="track-metadata-saved-lyrics" aria-label="本地歌词库记录">
                      <p>
                        已保存：{LYRICS_PROVIDER_LABELS[savedTrackLyric.provider]} · {savedTrackLyric.title} · {savedTrackLyric.artist}
                      </p>
                      {savedTrackLyricDeleteConfirming ? (
                        <div class="track-metadata-saved-lyrics-confirm" role="group" aria-label="确认移除歌词记录">
                          <span>只移除本地保存记录，不修改音频文件。</span>
                          <button type="button" class="btn-secondary" disabled={savedTrackLyricBusy} onClick={() => void deleteSavedLyricFromLibrary()}>
                            {savedTrackLyricBusy ? "移除中…" : "确认移除"}
                          </button>
                          <button type="button" class="btn-secondary" disabled={savedTrackLyricBusy} onClick={() => setSavedTrackLyricDeleteConfirming(false)}>
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          class="btn-secondary"
                          disabled={savedTrackLyricBusy || saving || audioTagConfirming}
                          onClick={() => setSavedTrackLyricDeleteConfirming(true)}
                        >
                          移除歌词库记录
                        </button>
                      )}
                    </div>
                  )}
                  <div class="track-metadata-search-row">
                    <input
                      class="picker-input"
                      type="search"
                      maxLength={200}
                      aria-label="歌词搜索关键词"
                      placeholder={`${title || track.title} ${artist || track.artist}`.trim()}
                      value={lyricQuery}
                      disabled={lyricSearchLoading || saving || restoreDone || audioTagConfirming || (!isTauriRuntime() && !isDemo)}
                      onInput={(event) => {
                        lyricSearchRequest.current += 1;
                        lyricPreviewRequest.current += 1;
                        setLyricQuery((event.currentTarget as HTMLInputElement).value);
                        setLyricCandidates([]);
                        setLyricSearchDone(false);
                        setLyricSearchAllSources(false);
                        setLyricSearchError(null);
                        setLyricCandidatePreview(null);
                        setLyricSearchLoading(false);
                        setLyricPreviewLoadingId(null);
                        setLyricNotice(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void searchLyrics();
                        }
                      }}
                    />
                    <button
                      class="btn-secondary"
                      type="button"
                      disabled={lyricSearchLoading || saving || restoreDone || audioTagConfirming || !lyricQuery.trim() || (!isTauriRuntime() && !isDemo)}
                      onClick={() => void searchLyrics()}
                    >
                      {lyricSearchLoading ? "搜索中…" : lyricSearchDone ? "重新搜索" : "搜索歌词"}
                    </button>
                  </div>
                  <div class="track-metadata-lyrics-aggregate-row">
                    <button
                      class="btn-secondary"
                      type="button"
                      disabled={lyricSearchLoading || saving || restoreDone || audioTagConfirming || !lyricQuery.trim() || (!isTauriRuntime() && !isDemo)}
                      onClick={() => void searchLyrics(LYRICS_PROVIDERS)}
                    >
                      {lyricSearchLoading && lyricSearchAllSources ? "正在汇总…" : "搜索全部来源"}
                    </button>
                    <span>{isDemo
                      ? "使用本机固定候选演示多来源汇总，不会访问网络。"
                      : "点击后将曲名/艺人关键词同时发送给六个歌词服务。"}</span>
                  </div>
                  {lyricSearchError && <p class="track-metadata-error" role="alert">{lyricSearchError}</p>}
                  {lyricSearchLoading && <p class="track-metadata-lookup-state" role="status">正在搜索歌词候选…</p>}
                  {lyricSearchDone && !lyricSearchLoading && lyricCandidates.length === 0 && (
                    <p class="track-metadata-lookup-state" role="status">
                      {lyricSearchError ? "已完成可用来源的搜索，但没有找到候选；可以稍后重试。" : "没有找到候选歌词，可以修改关键词再试。"}
                    </p>
                  )}
                  {lyricCandidates.length > 0 && (
                    <>
                      <p class="track-metadata-lyrics-scoring-note">
                        匹配估算参考曲名、艺人、专辑、时长和版本标记；不是概率，仍需手动预览确认。
                      </p>
                      <ul class="track-metadata-lyrics-candidates" aria-label={lyricSearchAllSources ? "全部来源歌词候选" : `${LYRICS_PROVIDER_LABELS[lyricProvider]}歌词候选`} ref={lyricResultsPanel}>
                        {lyricCandidates.map((song) => {
                        const key = lyricCandidateKey(song);
                        const previewed = lyricCandidatePreview?.song.provider === song.provider
                          && lyricCandidatePreview.song.id === song.id;
                        const assessment = assessLyricsCandidate({
                          title: title.trim() ? title : track.title,
                          artist: artist.trim() ? artist : track.artist,
                          album: album.trim() ? album : track.album,
                          durationSeconds: track.durationSeconds,
                        }, song);
                        const durationSeconds = song.durationMs === null
                          ? null
                          : Math.max(0, Math.round(song.durationMs / 1000));
                        const durationDifference = durationSeconds === null
                          ? null
                          : Math.abs(durationSeconds - track.durationSeconds);
                        const durationHint = durationSeconds === null
                          ? "时长未知"
                          : track.durationSeconds <= 0
                            ? `时长 ${formatDuration(durationSeconds)}`
                            : durationDifference === 0
                              ? `时长 ${formatDuration(durationSeconds)} · 与本地一致`
                              : `时长 ${formatDuration(durationSeconds)} · 相差 ${formatDuration(durationDifference ?? 0)}`;
                        return (
                          <li class={`track-metadata-lyrics-candidate${previewed ? " is-selected" : ""}`} key={key}>
                            <div class="track-metadata-lyrics-candidate-copy">
                              {lyricSearchAllSources && <span class="track-metadata-lyrics-candidate-source">{LYRICS_PROVIDER_LABELS[song.provider]}</span>}
                              <strong>{song.name}</strong>
                              <span>{song.artists}{song.album ? ` · ${song.album}` : ""}</span>
                              <small>{durationHint}</small>
                              <span class={`track-metadata-lyrics-assessment is-${assessment.level}`}>
                                <strong>{assessment.score} 分 · {assessment.label}</strong>
                                <small>{assessment.reasons.slice(0, 3).join(" · ")}</small>
                              </span>
                            </div>
                            <button
                              class="btn-secondary"
                              type="button"
                              disabled={lyricPreviewLoadingId !== null || saving || restoreDone || audioTagConfirming}
                              aria-pressed={previewed}
                              aria-label={`${lyricPreviewLoadingId === key ? "读取中" : previewed ? "已预览歌词" : "预览歌词候选"}：${song.name} · ${song.artists}${lyricSearchAllSources ? `（${LYRICS_PROVIDER_LABELS[song.provider]}）` : ""}`}
                              onClick={() => void previewLyrics(song)}
                            >
                              {lyricPreviewLoadingId === key ? "读取中…" : previewed ? "已预览" : "预览歌词"}
                            </button>
                          </li>
                        );
                        })}
                      </ul>
                    </>
                  )}
                  {lyricCandidatePreview && (
                    <div class="track-metadata-lyrics-preview" aria-label="候选歌词预览" ref={lyricPreviewPanel}>
                      <div class="track-metadata-lyrics-preview-heading">
                        <strong>{lyricCandidatePreview.song.name}</strong>
                        <span>
                          {lyricCandidatePreview.text
                            ? parseLrc(lyricCandidatePreview.text).length > 0 ? "同步歌词" : "纯文本歌词"
                            : "暂无可用主歌词"}
                          {lyricCandidatePreview.text ? ` · ${lyricCandidateLineCount} 行` : ""}
                        </span>
                      </div>
                      {lyricCandidatePreview.text ? (
                        <pre class="track-metadata-lyrics-preview-text">{lyricCandidatePreview.text.split(/\r?\n/).slice(0, 5).join("\n")}</pre>
                      ) : (
                        <p class="track-metadata-lookup-state">这个候选没有可嵌入的主歌词文本。</p>
                      )}
                      {lyricCandidatePreview.text && !lyricCandidateWithinLimit && (
                        <p class="track-metadata-error" role="alert">歌词长度超过音频标签允许范围，不能嵌入。</p>
                      )}
                      <div class="track-metadata-lyrics-actions">
                        <button
                          class="btn-secondary"
                          type="button"
                          disabled={!lyricCandidatePreview.text || saving || audioTagConfirming}
                          onClick={rememberLyricCandidate}
                        >
                          记住到本次会话
                        </button>
                        <button
                          class="btn-secondary"
                          type="button"
                          disabled={!lyricCandidatePreview.text || savedTrackLyricBusy || savedTrackLyricLoading || saving || audioTagConfirming || !isTauriRuntime()}
                          onClick={() => void saveLyricCandidateToLibrary()}
                        >
                          {savedTrackLyricBusy ? "保存中…" : "保存到歌词库"}
                        </button>
                        <button
                          class="btn-secondary"
                          type="button"
                          disabled={!lyricCandidateWithinLimit || saving || audioTagConfirming || (!isTauriRuntime() && !isDemo)}
                          onClick={useLyricCandidateForEmbedding}
                        >
                          选为待嵌入歌词
                        </button>
                      </div>
                      {savedTrackLyricReplaceConfirming && (
                        <div class="track-metadata-saved-lyrics-confirm" role="group" aria-label="确认替换歌词库记录">
                          <span>每首曲目保留一个已保存版本；确认后会替换当前歌词库记录。</span>
                          <button type="button" class="btn-secondary" disabled={savedTrackLyricBusy} onClick={() => void saveLyricCandidateToLibrary(true)}>
                            确认替换
                          </button>
                          <button type="button" class="btn-secondary" disabled={savedTrackLyricBusy} onClick={() => setSavedTrackLyricReplaceConfirming(false)}>
                            取消
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {lyricNotice && <p class="track-metadata-lookup-state" role="status">{lyricNotice}</p>}
                  {pendingLyricCandidate && (
                    <p class="track-metadata-lookup-state" role="status">
                      待嵌入：{LYRICS_PROVIDER_LABELS[pendingLyricCandidate.song.provider]} · {pendingLyricCandidate.song.name} · 音频尚未修改。
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {track.source === "local" && (
            <section class="track-metadata-audio-tags" aria-label="音频文件标签操作" ref={audioTagSectionElement}>
              <button
                class="track-metadata-lookup-toggle"
                type="button"
                aria-expanded={audioTagSectionOpen}
                disabled={saving || audioTagConfirming}
                onClick={() => {
                  setAudioTagSectionOpen((open) => !open);
                  setAudioTagError(null);
                }}
              >
                {audioTagSectionOpen ? "收起音频文件操作" : "写入或恢复音频文件标签"}
              </button>
              {audioTagSectionOpen && (
                <div class="track-metadata-audio-tags-body">
                  <div class="track-metadata-cover-picker">
                    <label class="track-metadata-field">
                      <span class="track-metadata-field-label">
                        <span>单曲封面</span>
                        <small>PNG / JPEG · 最大 8 MB</small>
                      </span>
                      <input
                        ref={coverImageInput}
                        class="picker-input track-metadata-cover-input"
                        type="file"
                        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                        aria-label="选择单曲封面图片"
                        disabled={saving || audioFileInUse || audioTagConfirming}
                        onChange={(event) => void chooseAudioCover(event)}
                      />
                    </label>
                    <div class="track-metadata-cover-preview" aria-label="封面预览">
                      {(selectedCoverImage?.previewDataUrl || track.coverPath) ? (
                        <img
                          src={selectedCoverImage?.previewDataUrl ?? coverUrl(track.coverPath)}
                          alt={selectedCoverImage ? "已选封面预览" : "当前曲库封面"}
                        />
                      ) : (
                        <span>未设置</span>
                      )}
                    </div>
                    {selectedCoverImage && (
                      <p class="track-metadata-cover-file" title={selectedCoverImage.fileName}>
                        {selectedCoverImage.fileName} · {formatAudioFileSize(selectedCoverImage.sizeBytes)}
                      </p>
                    )}
                  </div>
                  {!isTauriRuntime() && !isDemo ? (
                    <p class="track-metadata-lookup-note">网页演示仅预览所选图片，不会改动文件；音频标签读写需在 Ome 桌面版操作。</p>
                  ) : audioTagStatus.phase === "loading" ? (
                    <p class="track-metadata-lookup-state" role="status">正在检查本地文件访问权限与恢复备份…</p>
                  ) : audioTagStatus.phase === "error" ? (
                    <p class="track-metadata-error" role="alert">无法确认音频文件状态：{audioTagStatus.message}</p>
                  ) : (
                    <>
                      <p class="track-metadata-audio-tags-note">
                        此处可写入曲名、艺人、专辑，或嵌入已加载的主歌词和上方选定的歌词候选。首次写入前，Ome 会在应用数据目录保存整首文件副本；副本通常与原音频大小相近。
                      </p>
                      {audioFileInUse && (
                        <p class="track-metadata-audio-tags-warning" role="status">
                          播放器仍选中这首曲目，音频文件可能被占用。请先切换到其他曲目，再写入或恢复文件。
                        </p>
                      )}
                      <div class="track-metadata-single-tags">
                        <div class="track-metadata-single-tags-heading">
                          <div>
                            <strong>单曲内嵌标签</strong>
                            <span>先读取当前文件，再编辑需要改动的字段。</span>
                          </div>
                          <button
                            class="btn-secondary"
                            type="button"
                            disabled={audioTagFieldsLoading || saving || audioTagConfirming || (!isTauriRuntime() && !isDemo)}
                            onClick={() => void loadTrackAudioTags()}
                          >
                            {audioTagFieldsLoading ? "读取中…" : audioTagFields ? "重新读取" : "读取内嵌标签"}
                          </button>
                        </div>
                        {!isTauriRuntime() && (
                          <p class="track-metadata-lookup-note">
                            {isDemo
                              ? "演示标签为固定示例；可预览字段布局，但不会读取或改动本机音频。"
                              : "读取和写入本机音频标签需在 Ome 桌面版中进行。"}
                          </p>
                        )}
                        {audioTagFieldsLoading && <p class="track-metadata-lookup-state" role="status">正在读取这首音频的内嵌标签…</p>}
                        {audioTagFields && (
                          <div
                            class="track-metadata-embedded-tag-editor"
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && (event.target as HTMLElement).tagName !== "TEXTAREA") {
                                event.preventDefault();
                              }
                            }}
                          >
                            <TrackAudioTagFieldsForm original={audioTagFields.original} draft={audioTagFields.draft} disabled={saving || audioTagFieldsConfirming} onChange={updateTrackAudioTagField} />
                            <p class="track-metadata-lookup-note">
                              只发送有改动的字段；曲名、艺人或专辑有改动时会同步曲库资料。音轨号与碟号总数保持原值。
                            </p>
                            {audioTagFieldsConfirming && audioTagFieldUpdates && (
                              <div class="track-metadata-restore-confirm" role="group" aria-label="确认写入单曲内嵌标签">
                                <p>即将写入：{audioTagFieldLabels.join("、")}。</p>
                                <p class="track-metadata-audio-tags-confirm-values">
                                  曲名「{audioTagFields.draft.title.trim() || "留空"}」 · 艺人「{audioTagFields.draft.artist.trim() || "留空"}」 · 专辑「{audioTagFields.draft.album.trim() || "留空"}」
                                </p>
                                <p>首次写入前会保存整首恢复副本；失败时会尝试回滚当前文件。</p>
                                <div class="track-metadata-restore-actions">
                                  <button class="btn-secondary" type="button" disabled={saving} onClick={() => setAudioTagFieldsConfirming(false)}>取消</button>
                                  <button class="btn-primary" type="button" disabled={saving || audioFileInUse || !audioTagFields.draft.title.trim() || !audioTagFields.draft.artist.trim()} onClick={() => void confirmWriteTrackAudioTags()}>
                                    {saving ? "正在写入标签…" : "确认写入所选标签"}
                                  </button>
                                </div>
                              </div>
                            )}
                            {!audioTagFieldsConfirming && (
                              <button
                                class="btn-secondary track-metadata-audio-write"
                                type="button"
                                disabled={!audioTagFieldUpdates || saving || audioFileInUse || !isTauriRuntime()}
                                onClick={() => {
                                  setAudioTagError(null);
                                  setAudioTagDone(null);
                                  setAudioTagFieldsConfirming(true);
                                }}
                              >
                                {audioTagFieldLabels.length ? `准备写入：${audioTagFieldLabels.join("、")}` : "没有待写入的标签改动"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {audioTagStatus.available && (
                        <div class="track-metadata-audio-backup">
                          <span>整首恢复备份 · {formatAudioFileSize(audioTagStatus.sizeBytes)}</span>
                          {!audioTagWriteConfirming && !audioTagFieldsConfirming && !audioLyricsWriteConfirming && !audioCoverWriteConfirming && !audioFileRestoreConfirming && !audioTagBackupClearConfirming && (
                            <div class="track-metadata-audio-backup-actions">
                              <button
                                class="btn-secondary"
                                type="button"
                                disabled={saving || audioFileInUse || !isTauriRuntime()}
                                onClick={() => {
                                  setAudioTagError(null);
                                  setAudioTagDone(null);
                                  setAudioFileRestoreConfirming(true);
                                }}
                              >
                                恢复整首文件
                              </button>
                              <button
                                class="track-metadata-restore-toggle"
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  setAudioTagError(null);
                                  setAudioTagDone(null);
                                  setAudioTagBackupClearConfirming(true);
                                }}
                              >
                                删除备份
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {audioTagStatus.available && audioFileRestoreConfirming && (
                        <div class="track-metadata-restore-confirm">
                          <p>将用首次写入前保存的副本完整替换当前音频文件，文件内容不只限于标签。Ome 曲库资料也会同步到备份中的标签。</p>
                          <div class="track-metadata-restore-actions">
                            <button class="btn-secondary" type="button" disabled={saving} onClick={() => setAudioFileRestoreConfirming(false)}>取消</button>
                            <button class="btn-primary" type="button" disabled={saving || audioFileInUse} onClick={() => void confirmRestoreAudioFile()}>
                              {saving ? "正在恢复整首文件…" : "确认恢复整首文件"}
                            </button>
                          </div>
                        </div>
                      )}
                      {audioTagStatus.available && audioTagBackupClearConfirming && (
                        <div class="track-metadata-restore-confirm">
                          <p>将永久删除 Ome 保存的整首恢复副本。当前音频文件不会改变，之后无法用这份副本恢复。</p>
                          <div class="track-metadata-restore-actions">
                            <button class="btn-secondary" type="button" disabled={saving} onClick={() => setAudioTagBackupClearConfirming(false)}>取消</button>
                            <button class="btn-primary" type="button" disabled={saving} onClick={() => void confirmClearAudioTagBackup()}>
                              {saving ? "正在删除备份…" : "确认删除备份"}
                            </button>
                          </div>
                        </div>
                      )}
                      {!audioTagWriteConfirming && !audioTagFieldsConfirming && !audioLyricsWriteConfirming && !audioCoverWriteConfirming && !audioFileRestoreConfirming && !audioTagBackupClearConfirming && (
                        <button
                          class="btn-secondary track-metadata-audio-write"
                          type="button"
                          disabled={saving || audioFileInUse || !isTauriRuntime()}
                          onClick={() => {
                            setAudioTagError(null);
                            setAudioTagDone(null);
                            setAudioTagWriteConfirming(true);
                          }}
                        >
                          写入当前三项资料到音频文件
                        </button>
                      )}
                      {audioTagWriteConfirming && (
                        <div class="track-metadata-restore-confirm">
                          <p>
                            将把当前表单中的曲名、艺人和专辑写入本地音频文件。
                            {audioTagStatus.available
                              ? `已保留首次写入前的整首备份（${formatAudioFileSize(audioTagStatus.sizeBytes)}），本次不会覆盖它。`
                              : "首次写入会先保存整首文件副本；恢复时会完整替换音频文件。"}
                          </p>
                          <p class="track-metadata-audio-tags-confirm-values">
                            写入内容：曲名「{title}」 · 艺人「{artist}」 · 专辑「{album.trim() || "未填写"}」
                          </p>
                          <div class="track-metadata-restore-actions">
                            <button class="btn-secondary" type="button" disabled={saving} onClick={() => setAudioTagWriteConfirming(false)}>取消</button>
                            <button class="btn-primary" type="button" disabled={saving || audioFileInUse || !isTauriRuntime() || !title.trim() || !artist.trim()} onClick={() => void confirmWriteAudioTags()}>
                              {saving ? "正在写入音频标签…" : "确认写入标签"}
                            </button>
                          </div>
                        </div>
                      )}
                      {!audioTagWriteConfirming && !audioTagFieldsConfirming && !audioLyricsWriteConfirming && !audioCoverWriteConfirming && !audioFileRestoreConfirming && !audioTagBackupClearConfirming && (
                        <>
                          <button
                            class="btn-secondary track-metadata-audio-write"
                            type="button"
                            disabled={saving || audioFileInUse || !embeddedLyricsWithinLimit || !isTauriRuntime()}
                            onClick={() => {
                              setAudioTagError(null);
                              setAudioTagDone(null);
                              setAudioLyricsWriteConfirming(true);
                            }}
                          >
                            {pendingLyricCandidate ? "嵌入选定的候选歌词" : "嵌入已加载的主歌词"}
                          </button>
                          {!embeddedLyrics && (
                            <p class="track-metadata-lookup-note">
                              先加载这首歌的主歌词，或在上方搜索并选择候选歌词；翻译和罗马音不会写入。
                            </p>
                          )}
                          {embeddedLyrics && !embeddedLyricsWithinLimit && (
                            <p class="track-metadata-error" role="alert">歌词长度超过音频标签允许范围，不能嵌入。</p>
                          )}
                        </>
                      )}
                      {audioLyricsWriteConfirming && (
                        <div class="track-metadata-restore-confirm">
                          <p>
                            将{embeddedLyricsSourceLabel}作为 {embeddedLyricsLineCount} 行内嵌歌词写入本地音频文件。翻译与罗马音不会写入{pendingLyricCandidate ? "" : "，也不会重新搜索歌词"}。
                            {audioTagStatus.available
                              ? `已保留首次写入前的整首备份（${formatAudioFileSize(audioTagStatus.sizeBytes)}）；恢复会完整替换整首音频文件。`
                              : "写入前会先保存整首文件副本；恢复会完整替换整首音频文件。"}
                          </p>
                          {embeddedLyricsPreview && (
                            <p class="track-metadata-audio-tags-confirm-values">
                              歌词预览：「{embeddedLyricsPreview}{embeddedLyricsPreview.length >= 90 ? "…" : ""}」
                            </p>
                          )}
                          <div class="track-metadata-restore-actions">
                            <button class="btn-secondary" type="button" disabled={saving} onClick={() => setAudioLyricsWriteConfirming(false)}>取消</button>
                            <button class="btn-primary" type="button" disabled={saving || audioFileInUse || !embeddedLyrics || !isTauriRuntime()} onClick={() => void confirmWriteAudioLyrics()}>
                              {saving ? "正在嵌入主歌词…" : pendingLyricCandidate ? "确认嵌入候选歌词" : "确认嵌入主歌词"}
                            </button>
                          </div>
                        </div>
                      )}
                      {!audioTagWriteConfirming && !audioTagFieldsConfirming && !audioLyricsWriteConfirming && !audioCoverWriteConfirming && !audioFileRestoreConfirming && !audioTagBackupClearConfirming && (
                        <button
                          class="btn-secondary track-metadata-audio-write"
                          type="button"
                          disabled={saving || audioFileInUse || !selectedCoverImage || !isTauriRuntime()}
                          onClick={() => {
                            setAudioTagError(null);
                            setAudioTagDone(null);
                            setAudioCoverWriteConfirming(true);
                          }}
                        >
                          嵌入单曲封面
                        </button>
                      )}
                      {audioCoverWriteConfirming && selectedCoverImage && (
                        <div class="track-metadata-restore-confirm">
                          <p>
                            将把这张 {selectedCoverImage.mimeType === "image/png" ? "PNG" : "JPEG"} 图片设为音频文件的正面封面，并更新曲库中这首歌的封面缓存。首次写入前会先保存整首音频副本；之后可在这里恢复。
                          </p>
                          <p class="track-metadata-audio-tags-confirm-values">
                            封面文件：{selectedCoverImage.fileName} · {formatAudioFileSize(selectedCoverImage.sizeBytes)}
                          </p>
                          <div class="track-metadata-restore-actions">
                            <button class="btn-secondary" type="button" disabled={saving} onClick={() => setAudioCoverWriteConfirming(false)}>取消</button>
                            <button class="btn-primary" type="button" disabled={saving || audioFileInUse || !isTauriRuntime()} onClick={() => void confirmWriteAudioCover()}>
                              {saving ? "正在嵌入封面…" : "确认嵌入封面"}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {audioTagDone && <p class="track-metadata-restore-result" role="status">{audioTagDone}</p>}
              {audioTagError && <p class="track-metadata-error" role="alert">{audioTagError}</p>}
            </section>
          )}

          {restoreDone && (
            <p class="track-metadata-restore-result" role="status">
              {restoreSource === "snapshot"
                ? "已恢复首次人工修改前的导入资料。"
                : "旧记录没有导入快照，已从当前音频标签恢复资料。"}
            </p>
          )}

          {track.hasMetadataOverride && !restoreDone && (
            <section class="track-metadata-restore" aria-label="恢复原始资料">
              {!restoreConfirming ? (
                <button
                  class="track-metadata-restore-toggle"
                  type="button"
                  disabled={saving || audioTagConfirming}
                  onClick={() => {
                    setError(null);
                    setRestoreConfirming(true);
                  }}
                >
                  恢复原始资料
                </button>
              ) : (
                <div class="track-metadata-restore-confirm">
                  <p>
                    {track.metadataSnapshotAvailable
                      ? "将恢复首次手动修正前的导入资料，并替换当前曲库资料；音频文件不会更改。"
                      : "此旧记录没有导入快照，将尝试从当前可访问的音频标签恢复；若文件不可读，资料不会改变。"}
                  </p>
                  <div class="track-metadata-restore-actions">
                    <button
                      class="btn-secondary"
                      type="button"
                      disabled={saving || audioTagConfirming}
                      onClick={() => setRestoreConfirming(false)}
                    >
                      取消
                    </button>
                    <button
                      class="btn-primary"
                      type="button"
                      disabled={saving || audioTagConfirming}
                      onClick={() => void confirmRestore()}
                    >
                      {saving ? "正在恢复…" : "确认恢复"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          <p class="track-metadata-note">“保存资料”只更新 Ome 曲库；音频标签写入会另行修改本地文件。</p>
          {error && <p class="track-metadata-error" role="alert">{error}</p>}
        </div>
        <footer class="track-metadata-actions">
          {restoreDone ? (
            <button class="btn-primary" type="button" onClick={closeTrackMetadataEditor}>完成</button>
          ) : (
            <>
              <button class="btn-secondary" type="button" disabled={saving} onClick={closeTrackMetadataEditor}>
                取消
              </button>
              <button class="btn-primary" type="submit" disabled={saving || audioTagConfirming || !title.trim() || !artist.trim()}>
                {saving ? "正在保存…" : "保存资料"}
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}
