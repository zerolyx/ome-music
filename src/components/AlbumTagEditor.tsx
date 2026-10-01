import { useEffect, useState } from "preact/hooks";
import { coverUrl, isTauriRuntime } from "../lib/api";
import {
  closeAlbumTagEditor,
  editingAlbumTags,
} from "../state/album-tag-editor";
import {
  readLibraryTrackAlbumAudioTags,
  renameCatalogEntity,
  tracks,
  writeLibraryTrackAlbumAudioTags,
  writeLibraryTrackCoverArt,
} from "../state/library";
import { currentTrack } from "../state/player";
import { Icon } from "./Icon";

interface AlbumFields {
  album: string;
  albumArtist: string;
  year: string;
  genre: string;
}

interface SelectedCover {
  fileName: string;
  imageBase64: string;
  mimeType: "image/png" | "image/jpeg";
  previewDataUrl: string;
}

const blankFields: AlbumFields = { album: "", albumArtist: "", year: "", genre: "" };

async function readCoverFile(file: File): Promise<SelectedCover> {
  if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
    throw new Error("封面图片需大于 0 且不超过 8 MB");
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
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const imageBase64 = btoa(binary);
  return {
    fileName: file.name,
    imageBase64,
    mimeType,
    previewDataUrl: `data:${mimeType};base64,${imageBase64}`,
  };
}

export function AlbumTagEditor() {
  const target = editingAlbumTags.value;
  const [fields, setFields] = useState<AlbumFields>(blankFields);
  const [original, setOriginal] = useState<AlbumFields>(blankFields);
  const [selectedCover, setSelectedCover] = useState<SelectedCover | null>(null);
  const [reading, setReading] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!target) return;
    const initial = { ...blankFields, album: target.title };
    setFields(initial);
    setOriginal(initial);
    setSelectedCover(null);
    setReading(false);
    setTagsLoaded(false);
    setSaving(false);
    setConfirming(false);
    setDiscarding(false);
    setError(null);
    setNotice(null);
    setProgress(null);
  }, [target?.id]);

  useEffect(() => {
    if (!target) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !reading) requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!target) return null;
  const currentTarget = target;

  const activeTrack = currentTrack.value;
  const albumIsPlaying = Boolean(activeTrack && target.tracks.some((track) => track.id === activeTrack.id));
  const primaryCover = target.tracks.find((track) => track.coverPath)?.coverPath;
  const dirty = fields.album !== original.album
    || fields.albumArtist !== original.albumArtist
    || fields.year !== original.year
    || fields.genre !== original.genre
    || selectedCover !== null;
  const yearInvalid = fields.year.trim() !== "" && !/^(1\d{3}|[2-9]\d{3})$/.test(fields.year.trim());
  const titleChanged = target.kind === "album" && fields.album.trim() !== target.title;
  const albumHasOtherSources = target.kind === "album" && target.hasOtherSources;
  const disabledBecauseOfSources = titleChanged && albumHasOtherSources;
  const canSave = isTauriRuntime()
    && dirty
    && tagsLoaded
    && fields.album.trim().length > 0
    && !yearInvalid
    && !albumIsPlaying
    && !disabledBecauseOfSources
    && !saving
    && !reading;

  function requestClose(): void {
    if (saving || reading) return;
    if (dirty && !discarding) {
      setDiscarding(true);
      return;
    }
    closeAlbumTagEditor();
  }

  function updateField(field: keyof AlbumFields, value: string): void {
    setFields({ ...fields, [field]: value });
    setError(null);
    setNotice(null);
    setDiscarding(false);
  }

  async function loadEmbeddedTags(): Promise<void> {
    if (!isTauriRuntime() || reading || saving) return;
    const representative = currentTarget.tracks[0];
    if (!representative) return;
    setReading(true);
    setError(null);
    setNotice(null);
    try {
      const tags = await readLibraryTrackAlbumAudioTags(representative.id);
      const loaded = {
        ...fields,
        album: tags.album,
        albumArtist: tags.albumArtist,
        year: tags.year ?? "",
        genre: tags.genre,
      };
      setFields(loaded);
      setOriginal({
        ...original,
        album: loaded.album,
        albumArtist: loaded.albumArtist,
        year: loaded.year,
        genre: loaded.genre,
      });
      setTagsLoaded(true);
      setNotice(`已读取「${representative.title}」的内嵌专辑标签。`);
      setDiscarding(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReading(false);
    }
  }

  async function chooseCover(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      setSelectedCover(await readCoverFile(file));
      setDiscarding(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      input.value = "";
    }
  }

  async function saveAlbumTags(): Promise<void> {
    if (!canSave) return;
    const albumName = fields.album.trim();
    const values = {
      album: albumName,
      albumArtist: fields.albumArtist.trim(),
      year: fields.year.trim(),
      genre: fields.genre.trim(),
    };
    let completed = 0;
    setSaving(true);
    setError(null);
    setNotice(null);
    setProgress({ done: 0, total: currentTarget.tracks.length });
    try {
      for (const track of currentTarget.tracks) {
        if (currentTrack.value?.id === track.id) {
          setError(`检测到「${track.title}」开始播放，已停止后续写入；已完成 ${completed}/${currentTarget.tracks.length} 首。`);
          return;
        }
        let tagsWritten = false;
        try {
          await writeLibraryTrackAlbumAudioTags(
            track.id,
            values.album,
            values.albumArtist,
            values.year,
            values.genre,
            currentTarget.kind === "selection",
          );
          tagsWritten = true;
          if (selectedCover) {
            await writeLibraryTrackCoverArt(
              track.id,
              selectedCover.imageBase64,
              selectedCover.mimeType,
            );
          }
          completed += 1;
          setProgress({ done: completed, total: currentTarget.tracks.length });
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : String(cause);
          const partial = tagsWritten ? `「${track.title}」的文字标签已写入，但封面步骤失败。` : `在「${track.title}」处停止。`;
          setError(`${partial}已完成 ${completed}/${currentTarget.tracks.length} 首。${reason} 已成功写入的曲目都保留了独立恢复点，可修复问题后重试。`);
          return;
        }
      }

      if (titleChanged && currentTarget.kind === "album") {
        await renameCatalogEntity("album", currentTarget.id, currentTarget.title, albumName);
      }
      const latestTracks = new Map(tracks.value.map((track) => [track.id, track]));
      editingAlbumTags.value = {
        ...currentTarget,
        title: albumName,
        tracks: currentTarget.tracks.map((track) => latestTracks.get(track.id) ?? track),
      };
      setOriginal(values);
      setFields(values);
      setSelectedCover(null);
      setConfirming(false);
      setDiscarding(false);
      setNotice(`已完成 ${completed} 首曲目的专辑标签${selectedCover ? "与封面" : ""}写入；每首曲目均保留了首次写入前的恢复点。`);
    } catch (cause) {
      setError(`音频文件均已写入，但曲库专辑名称同步失败：${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setSaving(false);
    }
  }

  const previewCover = selectedCover?.previewDataUrl ?? (primaryCover ? coverUrl(primaryCover) : null);

  return (
    <div class="picker-backdrop album-tag-backdrop" onClick={requestClose}>
      <section
        class="picker-dialog album-tag-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="album-tag-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="picker-head album-tag-head">
          <div>
            <span class="picker-title" id="album-tag-title">{target.kind === "album" ? "编辑专辑标签" : "批量写入音频标签"}</span>
            <span class="picker-subject" title={target.title}>{target.kind === "album" ? `${target.title} · ${target.tracks.length} 首本地曲目` : `已选 ${target.tracks.length} 首本地曲目`}</span>
          </div>
          <button class="picker-close" type="button" aria-label="关闭" disabled={saving || reading} onClick={requestClose}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div class="album-tag-scroll-content">
          <div class="album-tag-summary">
            <div class="album-tag-artwork">
              {previewCover
                ? <img src={previewCover} alt="专辑封面预览" />
                : <span><Icon name="music-note" size={25} /></span>}
            </div>
            <div class="album-tag-summary-copy">
              <strong>{fields.album.trim() || "未命名专辑"}</strong>
              <span>{fields.albumArtist.trim() || target.artist}</span>
              <small>将写入 {target.tracks.length} 个本地音频文件</small>
            </div>
          </div>

          <div class="album-tag-fields">
            <label class="track-metadata-field">
              <span class="track-metadata-field-label">专辑名</span>
              <input
                class="picker-input"
                value={fields.album}
                maxLength={200}
                disabled={saving || reading || disabledBecauseOfSources}
                onInput={(event) => updateField("album", (event.currentTarget as HTMLInputElement).value)}
              />
              {disabledBecauseOfSources && <small>此专辑还包含其他来源的曲目，暂不能批量改名。</small>}
            </label>
            <label class="track-metadata-field">
              <span class="track-metadata-field-label">专辑艺人</span>
              <input
                class="picker-input"
                value={fields.albumArtist}
                maxLength={200}
                disabled={saving || reading}
                onInput={(event) => updateField("albumArtist", (event.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <div class="album-tag-fields-row">
              <label class="track-metadata-field">
                <span class="track-metadata-field-label">年份</span>
                <input
                  class="picker-input"
                  inputMode="numeric"
                  placeholder="例如 2024"
                  value={fields.year}
                  maxLength={4}
                  disabled={saving || reading}
                  aria-invalid={yearInvalid}
                  onInput={(event) => updateField("year", (event.currentTarget as HTMLInputElement).value)}
                />
                {yearInvalid && <small class="track-metadata-error">请输入 1000 至 9999 之间的四位年份。</small>}
              </label>
              <label class="track-metadata-field">
                <span class="track-metadata-field-label">流派</span>
                <input
                  class="picker-input"
                  value={fields.genre}
                  maxLength={200}
                  disabled={saving || reading}
                  onInput={(event) => updateField("genre", (event.currentTarget as HTMLInputElement).value)}
                />
              </label>
            </div>
          </div>

          <div class="album-tag-tools">
            <button class="btn-secondary" type="button" disabled={!isTauriRuntime() || reading || saving} onClick={() => void loadEmbeddedTags()}>
              <Icon name="music-note" size={14} />
              {reading ? "正在读取…" : "读取首曲目的内嵌标签"}
            </button>
            <label class="btn-secondary album-tag-cover-button">
              <Icon name="tag" size={14} />
              选择专辑封面
              <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={saving || reading} onChange={(event) => void chooseCover(event)} />
            </label>
            {selectedCover && (
              <button class="btn-secondary" type="button" disabled={saving || reading} onClick={() => setSelectedCover(null)}>
                移除新封面
              </button>
            )}
          </div>
          <p class="album-tag-note">
            先读取首曲目的内嵌专辑标签，再编辑并保存；这样可以保留未改字段。{target.kind === "selection" ? "所有所选曲目会写入同一组专辑标签，曲库中的专辑归属也会逐曲同步。" : ""}原曲名、曲目艺人和歌词不变。
          </p>
          {albumHasOtherSources && <p class="album-tag-note">专辑里存在其他来源的曲目，本次只会写入本地文件。</p>}
          {albumIsPlaying && <p class="album-tag-warning">这张专辑正在播放。请先停止播放，再批量写入，避免改动正在使用的文件。</p>}
          {!isTauriRuntime() && <p class="album-tag-note">音频标签读取与写入需要在 Ome 桌面版中进行。</p>}
          {selectedCover && <p class="album-tag-note">已选择：{selectedCover.fileName}</p>}
          {progress && <p class="album-tag-progress" role="status">写入进度：{progress.done} / {progress.total}</p>}
          {notice && <p class="album-tag-success" role="status">{notice}</p>}
          {error && <p class="track-metadata-error" role="alert">{error}</p>}

          {discarding && (
            <div class="album-tag-confirm" role="alert">
              <strong>还有未保存的修改</strong>
              <span>关闭后会丢弃当前填写和选择的封面。</span>
              <div>
                <button class="btn-secondary" type="button" onClick={() => setDiscarding(false)}>继续编辑</button>
                <button class="btn-secondary" type="button" onClick={closeAlbumTagEditor}>放弃修改</button>
              </div>
            </div>
          )}

          {confirming && (
            <div class="album-tag-confirm" role="alert">
              <strong>确认写入 {target.tracks.length} 首本地曲目</strong>
              <span>专辑：{fields.album.trim()} · 专辑艺人：{fields.albumArtist.trim() || "清空"} · 年份：{fields.year.trim() || "清空"} · 流派：{fields.genre.trim() || "清空"}</span>
              <small>每首曲目首次写入前的完整音频备份会作为恢复点保存。遇到错误会停止后续写入并报告已完成数量。</small>
              <div>
                <button class="btn-secondary" type="button" disabled={saving} onClick={() => setConfirming(false)}>返回检查</button>
                <button class="btn-primary" type="button" disabled={!canSave} onClick={() => void saveAlbumTags()}>
                  {saving ? "正在写入…" : "确认并写入"}
                </button>
              </div>
            </div>
          )}
        </div>

        <footer class="track-metadata-actions album-tag-actions">
          <button class="btn-secondary" type="button" disabled={saving || reading} onClick={requestClose}>关闭</button>
          {!confirming && (
            <button
              class="btn-primary"
              type="button"
              disabled={!canSave}
              onClick={() => {
                setError(null);
                setNotice(null);
                setConfirming(true);
              }}
            >
              <Icon name="check" size={14} />
              检查并写入
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
