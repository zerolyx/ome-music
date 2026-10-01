import { useEffect, useState } from "preact/hooks";
import { importing, removeTracksFromLibrary } from "../state/library";
import {
  closeTrackRemovalConfirm,
  trackPendingRemoval,
} from "../state/library-removal";
import { Icon } from "./Icon";

export function TrackRemovalConfirm() {
  const tracks = trackPendingRemoval.value;
  const count = tracks?.length ?? 0;
  const trackIds = tracks?.map((track) => track.id).join("\u0000") ?? "";
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const libraryBusy = importing.value;

  useEffect(() => {
    if (!tracks) return;
    setRemoving(false);
    setError(null);
  }, [trackIds]);

  useEffect(() => {
    if (!tracks) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !removing) closeTrackRemovalConfirm();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [trackIds, removing]);

  if (!tracks?.length) return null;
  const previewTracks = tracks.slice(0, 5);
  const subject = count === 1 ? tracks[0].title : `${count} 首曲目`;
  const trackDetail = (track: (typeof tracks)[number]) => {
    const parts = track.filePath.replace(/\\/g, "/").split("/").filter(Boolean);
    const fileName = parts.pop();
    const folder = parts.pop();
    return [track.album, [folder, fileName].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  };

  const remove = async () => {
    if (removing || importing.value) return;
    setRemoving(true);
    setError(null);
    try {
      await removeTracksFromLibrary(tracks.map((track) => track.id));
      closeTrackRemovalConfirm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setRemoving(false);
    }
  };

  return (
    <div
      class="picker-backdrop"
      onClick={() => {
        if (!removing) closeTrackRemovalConfirm();
      }}
    >
      <section
        class="picker-dialog track-removal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="track-removal-title"
        aria-describedby="track-removal-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="picker-head">
          <div class="track-metadata-heading">
            <span class="picker-title" id="track-removal-title">从曲库移除</span>
            <span class="picker-subject" title={subject}>{subject}</span>
          </div>
          <button
            class="picker-close"
            type="button"
            aria-label="关闭确认框"
            disabled={removing}
            onClick={closeTrackRemovalConfirm}
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        <p class="track-removal-copy" id="track-removal-description">
          这会移除 Ome 中的曲库索引、歌单引用、播放历史和已保存的歌词库记录；磁盘上的音频文件会保留。
        </p>
        {count > 1 && (
          <ul class="track-removal-preview" aria-label={`待移除的 ${count} 首曲目`}>
            {previewTracks.map((track) => (
              <li key={track.id} title={[track.title, track.artist, trackDetail(track)].filter(Boolean).join(" · ")}>
                <span>{track.title}</span>
                <span>{[track.artist || "未知艺人", trackDetail(track)].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
            {count > previewTracks.length && <li class="track-removal-more">另有 {count - previewTracks.length} 首</li>}
          </ul>
        )}
        <div class="track-removal-warning" role="note">
          <strong>当前播放也会更新</strong>
          <span>所选曲目会从播放队列移除；如果正在播放其中一首，将切换到队列里的相邻曲目。队列为空时会停止播放。</span>
        </div>
        {libraryBusy && <p class="track-removal-error" role="status">曲库正在导入或重扫，完成后再确认移除。</p>}
        {error && <p class="track-removal-error" role="alert">{error}</p>}
        <footer class="track-removal-actions">
          <button class="btn-secondary" type="button" disabled={removing} autoFocus onClick={closeTrackRemovalConfirm}>
            保留曲目
          </button>
          <button
            class="btn-secondary is-danger"
            type="button"
            disabled={removing || libraryBusy}
            onClick={() => void remove()}
          >
            {removing ? "正在移除…" : libraryBusy ? "曲库处理中…" : `确认移除${count > 1 ? ` ${count} 首` : ""}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
