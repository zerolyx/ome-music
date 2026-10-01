import { useEffect, useRef, useState } from "preact/hooks";
import { isTauriRuntime, trackMetadataCandidates } from "../lib/api";
import { formatDuration } from "../lib/audio";
import { updateLibraryTrackMetadata } from "../state/library";
import type {
  Track,
  TrackMetadataCandidate,
  TrackMetadataProvider,
  TrackMetadataSource,
  TrackMetadataSources,
} from "../types/music";
import { Icon } from "./Icon";

const PROVIDERS: TrackMetadataProvider[] = ["netease", "qq", "kugou"];
const PROVIDER_LABELS: Record<TrackMetadataProvider, string> = {
  netease: "网易云",
  qq: "QQ 音乐",
  kugou: "酷狗音乐",
};
const MAX_BATCH_SIZE = 20;
type MetadataField = keyof TrackMetadataSources;

interface BatchMatchRecord {
  track: Track;
  candidates: TrackMetadataCandidate[];
  candidate: TrackMetadataCandidate | null;
  include: boolean;
  fields: Record<MetadataField, boolean>;
  hadProviderErrors: boolean;
  unavailableBecauseOfErrors: boolean;
  saved: boolean;
  saveError: string | null;
}

interface SearchProgress {
  completed: number;
  total: number;
  currentTrack: string;
  provider: TrackMetadataProvider;
}

function isDemoMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");
}

function metadataSourceDefaults(track: Track): TrackMetadataSources {
  const legacySource: TrackMetadataSource = track.hasMetadataOverride ? "unknown" : "fileTags";
  return {
    title: track.metadataSources?.title ?? legacySource,
    artist: track.metadataSources?.artist ?? legacySource,
    album: track.metadataSources?.album ?? legacySource,
  };
}

function candidateValue(candidate: TrackMetadataCandidate, field: MetadataField): string {
  if (field === "title") return candidate.name;
  if (field === "artist") return candidate.artists;
  return candidate.album;
}

function searchText(track: Track): string {
  return Array.from([track.title, track.artist].filter(Boolean).join(" ").trim())
    .slice(0, 200)
    .join("");
}

function demoCandidate(track: Track, provider: TrackMetadataProvider): TrackMetadataCandidate[] {
  // 浏览器演示只使用本地样例，分别模拟第一、第二和第三来源命中。
  const hitProvider: TrackMetadataProvider = track.title.includes("Demo")
    ? "qq"
    : track.title === "宁夏"
      ? "kugou"
      : "netease";
  if (provider !== hitProvider) return [];
  const match: TrackMetadataCandidate = {
    source: provider,
    id: `demo-${provider}-${track.id}`,
    name: track.title === "Demo 单曲" ? "Demo 单曲（修复版）" : track.title,
    artists: track.artist || "样例艺人",
    album: track.album || "样例专辑",
    durationMs: Math.max(0, Math.round(track.durationSeconds * 1000)),
  };
  if (track.title === "远处的灯") {
    return [match, {
      ...match,
      id: `${match.id}-live`,
      name: "远处的灯（现场版）",
      artists: "林桥、夜航乐队",
      album: "深夜现场",
      durationMs: 244_000,
    }];
  }
  return [match];
}

function candidateDiffers(track: Track, candidate: TrackMetadataCandidate, field: MetadataField): boolean {
  const value = candidateValue(candidate, field).trim();
  const current = field === "title" ? track.title : field === "artist" ? track.artist : track.album;
  return value.length > 0 && (value !== current || metadataSourceDefaults(track)[field] !== candidate.source);
}

export function BatchMetadataMatcher({ tracks, onClose }: { tracks: Track[]; onClose: () => void }) {
  const demo = isDemoMode() && !isTauriRuntime();
  const availableTracks = tracks.filter((track) => track.source === "local");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(availableTracks.slice(0, MAX_BATCH_SIZE).map((track) => track.id)),
  );
  const [phase, setPhase] = useState<"select" | "matching" | "review">("select");
  const [records, setRecords] = useState<BatchMatchRecord[]>([]);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [saving, setSaving] = useState(false);
  const stopRequested = useRef(false);

  const selectedTracks = availableTracks.filter((track) => selectedIds.has(track.id));
  const saveableRecords = records.filter((record) =>
    record.include
    && !record.saved
    && Boolean(record.candidate)
    && (Object.keys(record.fields) as MetadataField[]).some(
      (field) => record.fields[field] && candidateDiffers(record.track, record.candidate!, field),
    ),
  );

  const close = () => {
    if (!saving && phase !== "matching") onClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && phase !== "matching") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, phase, saving]);

  const changeTrackSelection = (trackId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size >= MAX_BATCH_SIZE) return current;
        next.add(trackId);
      } else {
        next.delete(trackId);
      }
      return next;
    });
  };

  const searchSelected = async () => {
    if (!selectedTracks.length || selectedTracks.length > MAX_BATCH_SIZE || phase === "matching") return;
    const results: BatchMatchRecord[] = [...records];
    stopRequested.current = false;
    setStopping(false);
    setRemaining(0);
    setRecords(results);
    setPhase("matching");

    for (let index = 0; index < selectedTracks.length; index += 1) {
      if (stopRequested.current) {
        break;
      }
      const track = selectedTracks[index];
      const query = searchText(track);
      let candidates: TrackMetadataCandidate[] = [];
      let candidate: TrackMetadataCandidate | null = null;
      let anyProviderResponded = false;
      let requestFailed = false;

      if (query) {
        for (const provider of PROVIDERS) {
          if (stopRequested.current) break;
          setProgress({ completed: index, total: selectedTracks.length, currentTrack: track.title, provider });
          try {
            const found = demo
              ? demoCandidate(track, provider)
              : await trackMetadataCandidates(provider, query, 5);
            anyProviderResponded = true;
            if (found.length) {
              candidates = found;
              candidate = candidates[0];
              break;
            }
          } catch {
            requestFailed = true;
          }
        }
      }

      // 若用户在来源链尚未走完时停止，当前曲目留在“未搜索”队列中。
      if (stopRequested.current && !candidate) break;

      results.push({
        track,
        candidates,
        candidate,
        include: Boolean(candidate),
        fields: { title: Boolean(candidate?.name.trim()), artist: Boolean(candidate?.artists.trim()), album: Boolean(candidate?.album.trim()) },
        hadProviderErrors: requestFailed,
        unavailableBecauseOfErrors: requestFailed && !anyProviderResponded,
        saved: false,
        saveError: null,
      });
      setRecords([...results]);
      setProgress({
        completed: index + 1,
        total: selectedTracks.length,
        currentTrack: index + 1 < selectedTracks.length ? selectedTracks[index + 1].title : track.title,
        provider: PROVIDERS[0],
      });

      if (stopRequested.current) {
        break;
      }
    }

    const searchedIds = new Set(results.map((record) => record.track.id));
    setRemaining(availableTracks.filter((track) => !searchedIds.has(track.id)).length);
    setProgress(null);
    setPhase("review");
    setStopping(false);
  };

  const stopSearch = () => {
    stopRequested.current = true;
    setStopping(true);
  };

  const saveSelected = async () => {
    if (saving || !saveableRecords.length) return;
    setSaving(true);
    for (const record of saveableRecords) {
      if (!record.candidate) continue;
      const source = record.candidate.source;
      const sources = metadataSourceDefaults(record.track);
      const values: Record<MetadataField, string> = {
        title: record.track.title,
        artist: record.track.artist,
        album: record.track.album,
      };
      for (const field of Object.keys(record.fields) as MetadataField[]) {
        const value = candidateValue(record.candidate, field).trim();
        if (!record.fields[field] || !value) continue;
        values[field] = value;
        sources[field] = source;
      }
      try {
        await updateLibraryTrackMetadata(record.track.id, {
          title: values.title,
          artist: values.artist,
          album: values.album,
          metadataSources: sources,
        });
        setRecords((current) => current.map((item) => item.track.id === record.track.id
          ? { ...item, saved: true, saveError: null }
          : item));
      } catch (cause) {
        setRecords((current) => current.map((item) => item.track.id === record.track.id
          ? { ...item, saveError: cause instanceof Error ? cause.message : String(cause) }
          : item));
      }
    }
    setSaving(false);
  };

  const toggleField = (trackId: string, field: MetadataField, checked: boolean) => {
    setRecords((current) => current.map((record) => record.track.id === trackId
      ? { ...record, fields: { ...record.fields, [field]: checked }, saveError: null }
      : record));
  };

  const toggleInclude = (trackId: string, checked: boolean) => {
    setRecords((current) => current.map((record) => record.track.id === trackId
      ? { ...record, include: checked, saveError: null }
      : record));
  };

  const selectCandidate = (trackId: string, candidate: TrackMetadataCandidate) => {
    setRecords((current) => current.map((record) => record.track.id === trackId
      ? {
          ...record,
          candidate,
          include: true,
          fields: {
            title: Boolean(candidate.name.trim()),
            artist: Boolean(candidate.artists.trim()),
            album: Boolean(candidate.album.trim()),
          },
          saveError: null,
        }
      : record));
  };

  return (
    <div
      class="picker-backdrop batch-metadata-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        class="picker-dialog batch-metadata-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-metadata-title"
      >
        <header class="picker-head">
          <div>
            <h2 id="batch-metadata-title">批量匹配本地资料</h2>
            <p>逐首搜索候选，检查字段后再保存到曲库</p>
          </div>
          <button class="picker-close" type="button" aria-label="关闭" disabled={saving || phase === "matching"} onClick={close}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {phase === "select" ? (
          <div class="batch-metadata-body">
            <p class="batch-metadata-disclosure">
              依次尝试网易云 → QQ 音乐 → 酷狗。只发送曲名和艺人文字；不会上传音频或文件路径。单次最多匹配 {MAX_BATCH_SIZE} 首，搜索不会自动修改资料。
              {demo && " 当前为本地演示数据，不会发起网络请求。"}
            </p>
            {availableTracks.length === 0 ? (
              <div class="batch-metadata-empty">曲库里还没有可匹配的本地曲目。</div>
            ) : (
              <>
                <div class="batch-metadata-selection-head">
                  <span>选择曲目 <strong>{selectedIds.size} / {MAX_BATCH_SIZE}</strong></span>
                  <div>
                    <button
                      type="button"
                      class="batch-metadata-text-button"
                      onClick={() => setSelectedIds(new Set(availableTracks.slice(0, MAX_BATCH_SIZE).map((track) => track.id)))}
                    >
                      选择前 {Math.min(availableTracks.length, MAX_BATCH_SIZE)} 首
                    </button>
                    <button type="button" class="batch-metadata-text-button" onClick={() => setSelectedIds(new Set())}>清空</button>
                  </div>
                </div>
                <div class="batch-metadata-track-list" aria-label="选择待匹配曲目">
                  {availableTracks.map((track) => {
                    const checked = selectedIds.has(track.id);
                    const disabled = !checked && selectedIds.size >= MAX_BATCH_SIZE;
                    return (
                      <label class={`batch-metadata-track${disabled ? " is-disabled" : ""}`} key={track.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) => changeTrackSelection(track.id, event.currentTarget.checked)}
                        />
                        <span class="batch-metadata-track-copy">
                          <strong>{track.title}</strong>
                          <small>{track.artist || "未知艺人"}{track.album ? ` · ${track.album}` : ""}</small>
                        </span>
                        <small class="batch-metadata-duration">{formatDuration(track.durationSeconds)}</small>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : phase === "matching" ? (
          <div class="batch-metadata-body batch-metadata-progress">
            <p class="batch-metadata-progress-count" aria-live="polite">
              已完成 {progress?.completed ?? 0} / {progress?.total ?? selectedTracks.length} 首
            </p>
            <div class="batch-metadata-progress-track" aria-hidden="true">
              <span style={{ width: `${Math.round(((progress?.completed ?? 0) / Math.max(1, progress?.total ?? selectedTracks.length)) * 100)}%` }} />
            </div>
            {progress && (
              <p class="batch-metadata-progress-current">
                正在查询「{progress.currentTrack}」 · {PROVIDER_LABELS[progress.provider]}
              </p>
            )}
            <p class="batch-metadata-disclosure">来源按顺序尝试。停止操作会等待当前来源响应后结束。</p>
          </div>
        ) : (
          <div class="batch-metadata-body batch-metadata-review">
            <div class="batch-metadata-review-summary" role="status">
              匹配完成 {records.filter((record) => record.candidate).length} 首，未找到 {records.filter((record) => !record.candidate).length} 首。
              {remaining > 0 && ` 还有 ${remaining} 首未搜索。`}
              {demo && " 演示结果仅来自本地样例。"}
            </div>
            <div class="batch-metadata-result-list">
              {records.map((record) => record.candidate ? (
                <article class={`batch-metadata-result${record.saved ? " is-saved" : ""}`} key={record.track.id}>
                  <label class="batch-metadata-result-include">
                    <input
                      type="checkbox"
                      checked={record.include}
                      disabled={record.saved || saving}
                      onChange={(event) => toggleInclude(record.track.id, event.currentTarget.checked)}
                    />
                    <span>{record.saved ? "已保存" : "保存这首匹配"}</span>
                  </label>
                  <div class="batch-metadata-result-heading">
                    <span class="batch-metadata-result-origin">原曲 · {record.track.title} — {record.track.artist || "未知艺人"}</span>
                    <span class="batch-metadata-result-source">{PROVIDER_LABELS[record.candidate.source]}</span>
                  </div>
                  {record.candidates.length > 1 && (
                    <div class="batch-metadata-candidate-options" role="radiogroup" aria-label={`选择「${record.track.title}」的候选`}>
                      {record.candidates.map((candidate, index) => (
                        <label
                          class={`batch-metadata-candidate-option${record.candidate?.id === candidate.id ? " is-selected" : ""}`}
                          key={`${candidate.source}:${candidate.id}`}
                        >
                          <input
                            type="radio"
                            name={`batch-candidate-${record.track.id}`}
                            checked={record.candidate?.id === candidate.id}
                            disabled={record.saved || saving}
                            onChange={() => selectCandidate(record.track.id, candidate)}
                          />
                          <span class="batch-metadata-candidate-option-copy">
                            <strong>{candidate.name || "未知曲名"}</strong>
                            <small>{[candidate.artists, candidate.album].filter(Boolean).join(" · ") || "来源未提供艺人和专辑"}</small>
                          </span>
                          <small class="batch-metadata-candidate-option-index">候选 {index + 1}</small>
                        </label>
                      ))}
                    </div>
                  )}
                  <div class="batch-metadata-fields">
                    {(["title", "artist", "album"] as MetadataField[]).map((field) => {
                      const value = candidateValue(record.candidate!, field);
                      const current = field === "title" ? record.track.title : field === "artist" ? record.track.artist : record.track.album;
                      const label = field === "title" ? "曲名" : field === "artist" ? "艺人" : "专辑";
                      return (
                        <label class={`batch-metadata-field${!value.trim() ? " is-empty" : ""}`} key={field}>
                          <input
                            type="checkbox"
                            checked={record.fields[field]}
                            disabled={!value.trim() || record.saved || saving}
                            onChange={(event) => toggleField(record.track.id, field, event.currentTarget.checked)}
                          />
                          <span class="batch-metadata-field-name">{label}</span>
                          <span class="batch-metadata-field-values">
                            <span>{current || "空"}</span>
                            <span aria-hidden="true">→</span>
                            <strong>{value || "来源未提供"}</strong>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {record.saveError && <p class="batch-metadata-save-error" role="alert">保存失败：{record.saveError}</p>}
                </article>
              ) : (
                <article class="batch-metadata-no-result" key={record.track.id}>
                  <div>
                    <strong>{record.track.title}</strong>
                    <span>{record.track.artist || "未知艺人"}</span>
                  </div>
                  <small>
                    {record.unavailableBecauseOfErrors
                      ? "来源暂时无法查询，可稍后重试。"
                      : record.hadProviderErrors
                        ? "部分来源暂时无法查询，其余来源未找到候选。"
                        : "三个来源都没有找到候选。"}
                  </small>
                </article>
              ))}
            </div>
          </div>
        )}

        <footer class="batch-metadata-actions">
          {phase === "select" ? (
            <>
              <button class="btn-secondary" type="button" onClick={close}>取消</button>
              <button
                class="btn-primary"
                type="button"
                disabled={!selectedTracks.length || selectedTracks.length > MAX_BATCH_SIZE || (!isTauriRuntime() && !demo)}
                onClick={() => void searchSelected()}
              >
                <Icon name="search" size={15} />
                开始匹配 {selectedTracks.length} 首
              </button>
            </>
          ) : phase === "matching" ? (
            <button class="btn-secondary" type="button" disabled={stopping} onClick={stopSearch}>
              {stopping ? "正在结束…" : "停止匹配"}
            </button>
          ) : (
            <>
              <button class="btn-secondary" type="button" disabled={saving} onClick={close}>完成</button>
              {remaining > 0 && (
                <button class="btn-secondary" type="button" disabled={saving} onClick={() => {
                  const searchedIds = new Set(records.map((record) => record.track.id));
                  const nextIds = availableTracks.filter((track) => !searchedIds.has(track.id)).slice(0, MAX_BATCH_SIZE);
                  setSelectedIds(new Set(nextIds.map((track) => track.id)));
                  setPhase("select");
                }}>
                  继续匹配剩余曲目
                </button>
              )}
              <button class="btn-primary" type="button" disabled={saving || !saveableRecords.length} onClick={() => void saveSelected()}>
                {saving ? "正在保存…" : `保存已选 ${saveableRecords.length} 首`}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
