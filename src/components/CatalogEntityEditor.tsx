import { useEffect, useState } from "preact/hooks";
import {
  mergeCatalogEntity,
  previewCatalogEntityMerge,
  previewCatalogEntitySplit,
  renameCatalogEntity,
  splitCatalogEntity,
  type CatalogEntityKind,
  type CatalogEntityOption,
} from "../state/library";
import type { CatalogEntityMergePreview, CatalogEntityRenameResult, CatalogEntitySplitPreview, CatalogEntitySplitResult } from "../lib/api";
import { Icon } from "./Icon";
import type { Track } from "../types/music";

export interface CatalogEntityEditorTarget {
  kind: CatalogEntityKind;
  id: string;
  name: string;
  trackCount: number;
  localTracks?: Track[];
  artist?: string;
  artistId?: string | null;
}

export function CatalogEntityEditor({
  entity,
  mergeTargets = [],
  onClose,
  onSaved,
  onMerged = () => {},
  onSplit = () => {},
}: {
  entity: CatalogEntityEditorTarget | null;
  mergeTargets?: CatalogEntityOption[];
  onClose: () => void;
  onSaved: (kind: CatalogEntityKind, previousName: string, name: string, trackCount: number) => void;
  onMerged?: (kind: CatalogEntityKind, result: CatalogEntityRenameResult) => void;
  onSplit?: (kind: CatalogEntityKind, result: CatalogEntitySplitResult) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [mergePreview, setMergePreview] = useState<CatalogEntityMergePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [splitName, setSplitName] = useState("");
  const [splitTrackIds, setSplitTrackIds] = useState<string[]>([]);
  const [splitPreview, setSplitPreview] = useState<CatalogEntitySplitPreview | null>(null);
  const [previewingSplit, setPreviewingSplit] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  useEffect(() => {
    if (!entity) return;
    setName(entity.name);
    setSaving(false);
    setError(null);
    setTargetId("");
    setMergePreview(null);
    setPreviewing(false);
    setMerging(false);
    setMergeError(null);
    setSplitName("");
    setSplitTrackIds([]);
    setSplitPreview(null);
    setPreviewingSplit(false);
    setSplitting(false);
    setSplitError(null);
  }, [entity?.id]);

  useEffect(() => {
    if (!entity) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !previewing && !merging && !previewingSplit && !splitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entity?.id, saving, previewing, merging, previewingSplit, splitting, onClose]);

  if (!entity) return null;

  const label = entity.kind === "artist" ? "艺人" : "专辑";
  const selectedTarget = mergeTargets.find((candidate) => candidate.id === targetId) ?? null;
  const localTracks = entity.localTracks ?? [];
  const busy = saving || previewing || merging || previewingSplit || splitting;
  const canPreviewSplit = splitName.trim().length > 0
    && splitTrackIds.length > 0
    && splitTrackIds.length < localTracks.length;
  const submit = async (event: Event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await renameCatalogEntity(entity.kind, entity.id, entity.name, name);
      onSaved(entity.kind, result.previousName, result.name, result.tracks.length);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  const preview = async () => {
    if (!selectedTarget || previewing || merging) return;
    setPreviewing(true);
    setMergeError(null);
    setMergePreview(null);
    try {
      setMergePreview(await previewCatalogEntityMerge(entity.kind, entity, selectedTarget));
    } catch (cause) {
      setMergeError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreviewing(false);
    }
  };

  const confirmMerge = async () => {
    if (!selectedTarget || !mergePreview || merging || previewing) return;
    setMerging(true);
    setMergeError(null);
    try {
      const result = await mergeCatalogEntity(entity.kind, entity, selectedTarget);
      onMerged(entity.kind, result);
      onClose();
    } catch (cause) {
      setMergeError(cause instanceof Error ? cause.message : String(cause));
      setMerging(false);
    }
  };

  const previewSplit = async () => {
    if (!canPreviewSplit || previewingSplit || splitting) return;
    setPreviewingSplit(true);
    setSplitError(null);
    setSplitPreview(null);
    try {
      setSplitPreview(await previewCatalogEntitySplit(entity.kind, entity, splitName, splitTrackIds));
    } catch (cause) {
      setSplitError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreviewingSplit(false);
    }
  };

  const confirmSplit = async () => {
    if (!splitPreview || !canPreviewSplit || splitting || previewingSplit) return;
    setSplitting(true);
    setSplitError(null);
    try {
      const result = await splitCatalogEntity(entity.kind, entity, splitName, splitTrackIds);
      onSplit(entity.kind, result);
      onClose();
    } catch (cause) {
      setSplitError(cause instanceof Error ? cause.message : String(cause));
      setSplitting(false);
    }
  };

  return (
    <div
      class="picker-backdrop catalog-entity-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <section
        class="picker-dialog catalog-entity-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-entity-title"
        aria-describedby="catalog-entity-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="picker-head">
          <div class="track-metadata-heading">
            <span class="picker-title" id="catalog-entity-title">修改{label}名</span>
            <span class="picker-subject" title={entity.name}>{entity.name}</span>
          </div>
          <button
            class="picker-close"
            type="button"
            aria-label="关闭修改框"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        <p class="catalog-entity-copy" id="catalog-entity-description">
          将更新 {entity.trackCount} 首曲目的曲库展示名，并把当前名称保存为别名，后续重扫仍会归到这个{label}下。不会写入音频文件。
        </p>

        <form class="catalog-entity-form" onSubmit={(event) => void submit(event)}>
          <label class="catalog-entity-field">
            <span>{label}名称</span>
            <input
              autoFocus
              maxLength={200}
              value={name}
              onInput={(event) => setName((event.currentTarget as HTMLInputElement).value)}
              aria-label={`${label}名称`}
            />
          </label>
          {error && <p class="track-removal-error" role="alert">{error}</p>}
          <footer class="track-metadata-actions">
            <button class="btn-secondary" type="button" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button class="btn-primary" type="submit" disabled={busy || !name.trim()}>
              {saving ? "正在保存…" : "保存名称"}
            </button>
          </footer>
        </form>

        <details class="catalog-entity-split">
          <summary>拆分部分曲目</summary>
          <p class="catalog-entity-split-note">
            将所选本地曲目拆成新的{label}；至少为原实体保留一首曲目。拆出的曲目会记为人工曲库资料，便于重扫时保留关系；可在曲目资料中使用已有恢复入口。不会写入音频文件。
          </p>
          {localTracks.length < 2 ? (
            <p class="catalog-entity-split-empty">至少需要 2 首本地曲目才能拆分。</p>
          ) : (
            <>
              <label class="catalog-entity-field">
                <span>新{label}名称</span>
                <input
                  maxLength={200}
                  value={splitName}
                  disabled={busy}
                  aria-label={`新${label}名称`}
                  onInput={(event) => {
                    setSplitName((event.currentTarget as HTMLInputElement).value);
                    setSplitPreview(null);
                    setSplitError(null);
                  }}
                />
              </label>
              <div class="catalog-entity-split-selection-heading">
                <span>选择要拆出的曲目</span>
                <span>{splitTrackIds.length} 首已选 · 原实体保留 {localTracks.length - splitTrackIds.length} 首</span>
              </div>
              <div class="catalog-entity-split-shortcuts">
                <button
                  class="btn-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSplitTrackIds(localTracks.slice(1).map((track) => track.id));
                    setSplitPreview(null);
                    setSplitError(null);
                  }}
                >选择除第一首外</button>
                <button
                  class="btn-secondary"
                  type="button"
                  disabled={busy || splitTrackIds.length === 0}
                  onClick={() => {
                    setSplitTrackIds([]);
                    setSplitPreview(null);
                    setSplitError(null);
                  }}
                >清空选择</button>
              </div>
              <div class="catalog-entity-split-tracks" aria-label="拆分曲目列表">
                {localTracks.map((track, index) => (
                  <label class="catalog-entity-split-track" key={track.id}>
                    <input
                      type="checkbox"
                      checked={splitTrackIds.includes(track.id)}
                      disabled={busy}
                      aria-label={`拆分曲目 ${track.title}${track.album ? `，${track.album}` : ""}，第 ${index + 1} 首`}
                      onChange={(event) => {
                        const checked = (event.currentTarget as HTMLInputElement).checked;
                        setSplitTrackIds((current) => checked
                          ? [...current, track.id]
                          : current.filter((id) => id !== track.id));
                        setSplitPreview(null);
                        setSplitError(null);
                      }}
                    />
                    <span class="catalog-entity-split-track-copy">
                      <span title={track.title}>{track.title}</span>
                      <small>{[track.album, track.artist].filter(Boolean).join(" · ")}</small>
                    </span>
                    <small>{Math.floor(track.durationSeconds / 60)}:{String(track.durationSeconds % 60).padStart(2, "0")}</small>
                  </label>
                ))}
              </div>
              <button
                class="btn-secondary catalog-entity-preview-button"
                type="button"
                disabled={busy || !canPreviewSplit}
                onClick={() => void previewSplit()}
              >{previewingSplit ? "正在检查…" : "预览拆分影响"}</button>
              {splitPreview && (
                <div class="catalog-entity-split-preview" aria-live="polite">
                  <p><strong>{splitPreview.selectedTrackCount} 首曲目</strong>将从「{splitPreview.sourceName}」拆出为「{splitPreview.newName}」；原实体保留 {splitPreview.remainingTrackCount} 首。</p>
                  {splitPreview.reparentedAlbums.length > 0 && (
                    <div class="catalog-entity-album-merges">
                      <span>随所选曲目转到新艺人的专辑</span>
                      {splitPreview.reparentedAlbums.map((album) => <span key={`move:${album.name}`}>{album.name} · {album.trackCount} 首</span>)}
                    </div>
                  )}
                  {splitPreview.duplicatedAlbums.length > 0 && (
                    <div class="catalog-entity-album-merges">
                      <span>保留原专辑并为新艺人复制关系</span>
                      {splitPreview.duplicatedAlbums.map((album) => <span key={`copy:${album.name}`}>{album.name} · {album.trackCount} 首</span>)}
                    </div>
                  )}
                  <button class="btn-primary" type="button" disabled={busy} onClick={() => void confirmSplit()}>
                    {splitting ? "正在拆分…" : `确认拆分${label}`}
                  </button>
                </div>
              )}
              {splitError && <p class="track-removal-error" role="alert">{splitError}</p>}
            </>
          )}
        </details>

        {mergeTargets.length > 0 && (
          <section class="catalog-entity-merge" aria-label={`合并${label}`}>
            <div class="catalog-entity-merge-heading">
              <span>合并到已有{label}</span>
              <span>合并不保留一键恢复记录；可再按曲目建立新实体整理归属。音频文件不会改动</span>
            </div>
            <label class="catalog-entity-field">
              <span>目标{label}</span>
              <select
                value={targetId}
                disabled={busy}
                aria-label={`选择目标${label}`}
                onChange={(event) => {
                  setTargetId((event.currentTarget as HTMLSelectElement).value);
                  setMergePreview(null);
                  setMergeError(null);
                }}
              >
                <option value="">选择一个目标{label}</option>
                {mergeTargets.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}{candidate.artist ? ` · ${candidate.artist}` : ""} · {candidate.trackCount} 首
                  </option>
                ))}
              </select>
            </label>
            <button class="btn-secondary catalog-entity-preview-button" type="button" disabled={busy || !selectedTarget} onClick={() => void preview()}>
              {previewing ? "正在检查…" : "预览合并影响"}
            </button>
            {mergePreview && (
              <div class="catalog-entity-merge-preview" aria-live="polite">
                <p><strong>{mergePreview.sourceName}</strong> 的 {mergePreview.sourceTrackCount} 首曲目将并入 <strong>{mergePreview.targetName}</strong>；目标已有 {mergePreview.targetTrackCount} 首。</p>
                {mergePreview.consolidatedAlbums.length > 0 && (
                  <div class="catalog-entity-album-merges">
                    <span>同时整理这些同名专辑</span>
                    {mergePreview.consolidatedAlbums.map((album) => (
                      <span key={`${album.sourceName}:${album.targetName}`}>
                        {album.sourceName} → {album.targetName} · {album.trackCount} 首
                      </span>
                    ))}
                  </div>
                )}
                <button class="btn-primary" type="button" disabled={busy} onClick={() => void confirmMerge()}>
                  {merging ? "正在合并…" : `确认合并${label}`}
                </button>
              </div>
            )}
            {mergeError && <p class="track-removal-error" role="alert">{mergeError}</p>}
          </section>
        )}
      </section>
    </div>
  );
}
