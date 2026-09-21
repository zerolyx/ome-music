import { useEffect } from "preact/hooks";
import { isTauriRuntime } from "../lib/api";
import {
  importFolder,
  importing,
  importNotice,
  loadError,
  playFromLibrary,
  refreshTracks,
  toggleLiked,
  tracks,
} from "../state/library";
import { currentIndex } from "../state/player";
import { TrackList } from "../components/TrackList";
import { Icon } from "../components/Icon";

export function LibraryView() {
  useEffect(() => {
    if (isTauriRuntime()) void refreshTracks();
  }, []);

  return (
    <section class="view view-library">
      <div class="view-head">
        <h1 class="view-title">曲库</h1>
        <button class="btn-primary" disabled={importing.value} onClick={() => void importFolder()}>
          <Icon name="plus" size={16} />
          {importing.value ? "正在导入…" : "导入音乐文件夹"}
        </button>
      </div>
      {importNotice.value && <p class="view-hint">{importNotice.value}</p>}
      {loadError.value && <p class="view-hint">曲库加载失败：{loadError.value}</p>}
      {tracks.value.length === 0 ? (
        <div class="library-empty">
          <Icon name="library" size={40} />
          <p>曲库还是空的</p>
          <p class="view-hint">点击右上角导入你的音乐文件夹</p>
        </div>
      ) : (
        <TrackList
          tracks={tracks.value}
          currentIndex={currentIndex.value}
          onPlay={playFromLibrary}
          onToggleLike={(track) => void toggleLiked(track)}
        />
      )}
    </section>
  );
}
