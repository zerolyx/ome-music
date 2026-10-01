import { useEffect, useState } from "preact/hooks";
import { isTauriRuntime, type TrackAudioTags } from "../lib/api";
import {
  changedTrackAudioTagLabels,
  trackAudioTagUpdates,
  trackAudioTagsToForm,
  validateTrackAudioTagForm,
  type TrackAudioTagForm,
} from "../lib/track-audio-tags";
import {
  closeTrackAudioTagBatchEditor,
  editingTrackAudioTagBatch,
} from "../state/album-tag-editor";
import { readLibraryTrackAudioTags, writeLibraryTrackAudioTagUpdates } from "../state/library";
import { currentTrack } from "../state/player";
import type { Track } from "../types/music";
import { Icon } from "./Icon";
import { TrackAudioTagFieldsForm } from "./TrackAudioTagFieldsForm";

interface TrackTagDraft {
  original: TrackAudioTags;
  draft: TrackAudioTagForm;
}

interface PendingTrackWrite extends TrackTagDraft {
  track: Track;
  updates: NonNullable<ReturnType<typeof trackAudioTagUpdates>>;
  labels: string[];
  validationError: string | null;
}

interface WriteProgress {
  done: number;
  total: number;
}

function fixedDemoTags(track: Track, index: number, total: number): TrackAudioTags {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.artist,
    year: "2024",
    genre: "Dream pop",
    trackNumber: index + 1,
    trackTotal: total,
    discNumber: 1,
    discTotal: 1,
    bpm: "112",
    comment: "固定演示标签",
    commentTruncated: false,
  };
}

function mergeDraftIntoTags(original: TrackAudioTags, draft: TrackAudioTagForm): TrackAudioTags {
  return {
    ...original,
    title: draft.title.trim(),
    artist: draft.artist.trim(),
    album: draft.album.trim(),
    albumArtist: draft.albumArtist.trim(),
    year: draft.year.trim() || null,
    genre: draft.genre.trim(),
    trackNumber: draft.trackNumber.trim() ? Number(draft.trackNumber.trim()) : null,
    discNumber: draft.discNumber.trim() ? Number(draft.discNumber.trim()) : null,
    bpm: draft.bpm.trim() || null,
    comment: draft.comment.trim(),
  };
}

export function BatchTrackAudioTagEditor() {
  const target = editingTrackAudioTagBatch.value;
  const targetKey = target?.map((track) => track.id).join("|") ?? "";
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TrackTagDraft>>({});
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const isDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

  useEffect(() => {
    if (!target) return;
    setActiveTrackId(target[0]?.id ?? null);
    setDrafts({});
    setLoadingTrackId(null);
    setSaving(false);
    setConfirming(false);
    setDiscarding(false);
    setError(null);
    setNotice(null);
    setProgress(null);
  }, [target, targetKey]);

  const activeTrack = target?.find((track) => track.id === activeTrackId) ?? null;
  const targetTrackCount = target?.length ?? 0;
  const activeDraft = activeTrackId ? drafts[activeTrackId] ?? null : null;
  const activeHasChanges = Boolean(activeDraft && trackAudioTagUpdates(activeDraft.original, activeDraft.draft));
  const pendingWrites: PendingTrackWrite[] = (target ?? []).flatMap((track) => {
    const record = drafts[track.id];
    if (!record) return [];
    const updates = trackAudioTagUpdates(record.original, record.draft);
    if (!updates) return [];
    return [{
      track,
      ...record,
      updates,
      labels: changedTrackAudioTagLabels(record.original, record.draft),
      validationError: validateTrackAudioTagForm(record.original, record.draft),
    }];
  });
  const hasPendingWrites = pendingWrites.length > 0;
  const invalidPendingWrite = pendingWrites.find((item) => item.validationError) ?? null;
  const activePosition = target && activeTrack ? target.findIndex((track) => track.id === activeTrack.id) + 1 : 0;
  const unreadCount = (target ?? []).filter((track) => !drafts[track.id]).length;
  const blockedTrack = pendingWrites.find((item) => currentTrack.value?.id === item.track.id);

  useEffect(() => {
    if (!target) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving || loadingTrackId || confirming) return;
      event.preventDefault();
      if (hasPendingWrites) setDiscarding(true);
      else closeTrackAudioTagBatchEditor();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [target, saving, loadingTrackId, confirming, hasPendingWrites]);

  if (!target || target.length === 0) return null;

  function requestClose(): void {
    if (saving || loadingTrackId || confirming) return;
    if (pendingWrites.length > 0 && !discarding) {
      setDiscarding(true);
      return;
    }
    closeTrackAudioTagBatchEditor();
  }

  async function readActiveTags(): Promise<void> {
    if (!activeTrack || loadingTrackId || saving || confirming) return;
    setLoadingTrackId(activeTrack.id);
    setError(null);
    setNotice(null);
    setDiscarding(false);
    try {
      const tags = isTauriRuntime()
        ? await readLibraryTrackAudioTags(activeTrack.id)
        : isDemo
          ? fixedDemoTags(activeTrack, Math.max(0, activePosition - 1), targetTrackCount)
          : (() => { throw new Error("读取本地音频标签需在 Ome 桌面版中进行"); })();
      setDrafts((current) => ({
        ...current,
        [activeTrack.id]: { original: tags, draft: trackAudioTagsToForm(tags) },
      }));
      setNotice(isTauriRuntime()
        ? `已读取「${activeTrack.title}」的内嵌标签。`
        : "已载入固定演示标签；此页面不会读取或写入本机音频。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingTrackId(null);
    }
  }

  function updateActiveField(field: keyof TrackAudioTagForm, value: string): void {
    if (!activeTrackId) return;
    setDrafts((current) => {
      const record = current[activeTrackId];
      if (!record) return current;
      return {
        ...current,
        [activeTrackId]: { ...record, draft: { ...record.draft, [field]: value } },
      };
    });
    setError(null);
    setNotice(null);
    setDiscarding(false);
  }

  async function confirmWrites(): Promise<void> {
    if (!isTauriRuntime() || saving || loadingTrackId || pendingWrites.length === 0 || blockedTrack || invalidPendingWrite) return;
    const total = pendingWrites.length;
    let completed = 0;
    setSaving(true);
    setConfirming(false);
    setDiscarding(false);
    setError(null);
    setNotice(null);
    setProgress({ done: 0, total });
    try {
      for (const item of pendingWrites) {
        if (currentTrack.value?.id === item.track.id) {
          setError(`「${item.track.title}」已开始播放，已停止后续写入；已完成 ${completed}/${total} 首。`);
          return;
        }
        try {
          await writeLibraryTrackAudioTagUpdates(item.track.id, item.updates);
          setDrafts((current) => {
            const record = current[item.track.id];
            if (!record) return current;
            const original = mergeDraftIntoTags(record.original, record.draft);
            return { ...current, [item.track.id]: { original, draft: trackAudioTagsToForm(original) } };
          });
          completed += 1;
          setProgress({ done: completed, total });
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : String(cause);
          setError(`在「${item.track.title}」处停止；已完成 ${completed}/${total} 首。${reason}。已成功写入的曲目各自保留了首次恢复点。`);
          return;
        }
      }
      setNotice(`已完成 ${completed} 首曲目的内嵌标签写入；每首都保留了首次写入前的整首恢复点。`);
    } finally {
      setSaving(false);
    }
  }

  const readCount = target.length - unreadCount;
  const readDisabled = saving
    || Boolean(loadingTrackId)
    || confirming
    || activeHasChanges
    || (!isTauriRuntime() && !isDemo);
  const saveDisabled = !isTauriRuntime()
    || saving
    || Boolean(loadingTrackId)
    || pendingWrites.length === 0
    || Boolean(blockedTrack)
    || Boolean(invalidPendingWrite);

  return (
    <div class="picker-backdrop batch-metadata-backdrop" onClick={requestClose}>
      <section
        class="picker-dialog batch-metadata-dialog batch-track-tag-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-track-tag-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="picker-head">
          <div>
            <h2 id="batch-track-tag-title">逐首编辑完整内嵌标签</h2>
            <p>已选 {target.length} 首 · 已读取 {readCount} 首 · 有改动 {pendingWrites.length} 首</p>
          </div>
          <button class="picker-close" type="button" aria-label="关闭" disabled={saving || Boolean(loadingTrackId) || confirming} onClick={requestClose}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div class="batch-metadata-body batch-track-tag-body">
          <p class="batch-metadata-disclosure">
            每首曲目分别读取和编辑。只写入有改动的字段；曲名、艺人或专辑改变时才同步该曲的曲库资料。首次写入会保留整首恢复点，失败即停。
          </p>
          <div class="batch-track-tag-workbench">
            <aside class="batch-track-tag-list-panel" aria-label="批次曲目列表">
              <strong>本批曲目</strong>
              <label class="batch-track-tag-mobile-select">
                <span>正在编辑</span>
                <select
                  class="picker-input"
                  aria-label="正在编辑的曲目"
                  value={activeTrackId ?? ""}
                  disabled={saving || Boolean(loadingTrackId) || confirming}
                  onChange={(event) => setActiveTrackId((event.currentTarget as HTMLSelectElement).value)}
                >
                  {target.map((track) => <option key={track.id} value={track.id}>{track.title} · {track.artist || "未知艺人"}</option>)}
                </select>
              </label>
              <nav class="batch-track-tag-track-list" aria-label="选择要编辑的曲目">
                {target.map((track, index) => {
                  const record = drafts[track.id];
                  const changed = record && trackAudioTagUpdates(record.original, record.draft);
                  return (
                    <button
                      key={track.id}
                      class={`batch-track-tag-track${activeTrackId === track.id ? " is-active" : ""}`}
                      type="button"
                      aria-current={activeTrackId === track.id ? "step" : undefined}
                      disabled={saving || Boolean(loadingTrackId) || confirming}
                      onClick={() => {
                        setActiveTrackId(track.id);
                        setError(null);
                        setNotice(null);
                        setDiscarding(false);
                      }}
                    >
                      <span class="batch-track-tag-track-index">{String(index + 1).padStart(2, "0")}</span>
                      <span class="batch-track-tag-track-copy">
                        <strong>{track.title}</strong>
                        <small>{track.artist || "未知艺人"}</small>
                      </span>
                      <small class={`batch-track-tag-status${changed ? " is-changed" : record ? " is-read" : ""}`}>
                        {changed ? "有改动" : record ? "已读取" : "待读取"}
                      </small>
                    </button>
                  );
                })}
              </nav>
            </aside>

            <section class="batch-track-tag-editor-panel" aria-label="当前曲目内嵌标签">
              {activeTrack && (
                <>
                  <div class="batch-track-tag-current">
                    <div>
                      <strong>{activeTrack.title}</strong>
                      <span>{activeTrack.artist || "未知艺人"} · 第 {activePosition} 首 / {target.length} 首</span>
                    </div>
                    <button class="btn-secondary" type="button" disabled={readDisabled} onClick={() => void readActiveTags()}>
                      {loadingTrackId === activeTrack.id ? "读取中…" : activeHasChanges ? "已有未写入改动" : activeDraft ? "重新读取" : "读取内嵌标签"}
                    </button>
                  </div>
                  {activeHasChanges && <p class="track-metadata-lookup-note" role="status">当前曲目已有未写入改动；为避免覆盖，暂不允许重新读取。</p>}
                  {!isTauriRuntime() && (
                    <p class="track-metadata-lookup-note">
                      {isDemo ? "演示标签为固定示例；可以预览编辑流程，但不会读写本机音频。" : "读取和写入本机音频标签需在 Ome 桌面版中进行。"}
                    </p>
                  )}
                  {activeDraft ? (
                    <TrackAudioTagFieldsForm
                      original={activeDraft.original}
                      draft={activeDraft.draft}
                      disabled={saving || confirming}
                      onChange={updateActiveField}
                    />
                  ) : (
                    <div class="batch-track-tag-unread">
                      <span>先读取这首文件的标签，再编辑要修改的字段。</span>
                      {unreadCount > 1 && <small>其他曲目还未读取时，可以从左侧列表切换。</small>}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          {blockedTrack && <p class="track-metadata-audio-tags-warning" role="status">「{blockedTrack.track.title}」仍是播放器当前曲目，请先切换到其他曲目再写入。</p>}
          {invalidPendingWrite && <p class="track-metadata-error" role="alert">「{invalidPendingWrite.track.title}」：{invalidPendingWrite.validationError}</p>}
          {progress && <p class="batch-track-tag-progress" role="status">写入进度 {progress.done} / {progress.total} 首</p>}
          {notice && <p class="track-metadata-lookup-note" role="status">{notice}</p>}
          {error && <p class="track-metadata-error" role="alert">{error}</p>}
          {confirming && (
            <section class="batch-track-tag-confirm" aria-label="确认批量写入">
              <p>将按列表顺序写入 {pendingWrites.length} 首曲目，只修改下列字段；每个文件先独立备份并校验。</p>
              <div class="batch-track-tag-confirm-list">
                {pendingWrites.map((item) => (
                  <div key={item.track.id}>
                    <strong>{item.track.title}</strong>
                    <span>{item.labels.join("、")}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {discarding && (
            <p class="track-metadata-audio-tags-warning" role="status">仍有 {pendingWrites.length} 首的更改尚未写入。关闭会丢弃这些更改。</p>
          )}
        </div>

        <footer class="batch-metadata-actions batch-track-tag-actions">
          {discarding ? (
            <>
              <button type="button" class="btn-secondary" onClick={() => setDiscarding(false)}>继续编辑</button>
              <button type="button" class="btn-primary" onClick={() => closeTrackAudioTagBatchEditor()}>丢弃并关闭</button>
            </>
          ) : confirming ? (
            <>
              <button type="button" class="btn-secondary" disabled={saving} onClick={() => setConfirming(false)}>返回修改</button>
              <button type="button" class="btn-primary" disabled={saveDisabled} onClick={() => void confirmWrites()}>
                {saving ? "正在逐首写入…" : `确认写入 ${pendingWrites.length} 首`}
              </button>
            </>
          ) : (
            <>
              <button type="button" class="btn-secondary" disabled={saving || Boolean(loadingTrackId)} onClick={requestClose}>关闭</button>
              <button type="button" class="btn-primary" disabled={saveDisabled} onClick={() => setConfirming(true)}>
                <Icon name="tag" size={14} />
                准备写入 {pendingWrites.length} 首
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
