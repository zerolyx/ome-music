import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { TrackList } from "./TrackList";
import { appendToQueue, currentTrack, insertNext, playTracks } from "../state/player";
import {
  breadcrumbs,
  connection,
  currentDirectoryId,
  entries,
  error,
  loadSmbDirectory,
  loading,
  tracksFromSmbEntries,
} from "../state/smb";

export function SmbBrowser() {
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (connection.value.connected) void loadSmbDirectory(currentDirectoryId.value);
  }, []);

  const visibleEntries = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) return entries.value;
    return entries.value.filter((entry) => entry.name.toLocaleLowerCase().includes(query));
  }, [filter, entries.value]);
  const visibleAudioIds = new Set(visibleEntries.filter((entry) => !entry.isDirectory).map((entry) => entry.id));
  const tracks = tracksFromSmbEntries().filter((track) => track.sourceId && visibleAudioIds.has(track.sourceId));
  const currentIndex = tracks.findIndex((track) => track.id === currentTrack.value?.id);
  const path = breadcrumbs.value;

  return (
    <section class="webdav-browser" aria-label="SMB 目录浏览器">
      <div class="webdav-browser-head">
        <div>
          <h2>SMB 曲库</h2>
          <p>{connection.value.serverLabel} · 只读浏览</p>
        </div>
        <button
          class="btn-secondary webdav-refresh"
          disabled={loading.value}
          aria-label="刷新当前目录"
          onClick={() => void loadSmbDirectory(currentDirectoryId.value)}
        >
          <Icon name="refresh" size={15} />
          刷新
        </button>
      </div>

      {path.length > 0 && (
        <nav class="webdav-breadcrumbs" aria-label="当前目录路径">
          {path.map((crumb, index) => (
            <span class="webdav-breadcrumb-part" key={crumb.id}>
              {index > 0 && <span class="webdav-breadcrumb-separator" aria-hidden="true">/</span>}
              <button
                class={index === path.length - 1 ? "is-current" : ""}
                aria-current={index === path.length - 1 ? "location" : undefined}
                onClick={() => void loadSmbDirectory(crumb.id)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div class="webdav-directory-tools">
        <label class="webdav-filter-label">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={filter}
            placeholder="筛选当前目录的文件名"
            aria-label="筛选当前目录的文件名"
            onInput={(event) => setFilter((event.target as HTMLInputElement).value)}
          />
        </label>
        <span class="webdav-entry-count">
          {filter.trim() ? `筛选出 ${visibleEntries.length} 项` : `当前目录 ${entries.value.length} 项`}
        </span>
      </div>

      {error.value && <p class="view-hint search-error" role="status" aria-live="polite">{error.value}</p>}
      {loading.value ? (
        <div class="library-empty"><p>正在读取 SMB 目录…</p></div>
      ) : visibleEntries.length === 0 ? (
        <div class="library-empty">
          <Icon name="folder" size={38} />
          <p>{entries.value.length === 0 ? "这个目录里还没有可浏览的内容" : "没有匹配的文件名"}</p>
        </div>
      ) : (
        <>
          {visibleEntries.some((entry) => entry.isDirectory) && (
            <ul class="webdav-folder-list" aria-label="子目录">
              {visibleEntries.filter((entry) => entry.isDirectory).map((entry) => (
                <li key={entry.id}>
                  <button class="webdav-folder-row" onClick={() => void loadSmbDirectory(entry.id)}>
                    <span class="webdav-folder-icon"><Icon name="folder" size={17} /></span>
                    <span class="webdav-folder-name">{entry.name}</span>
                    <span class="webdav-folder-open">打开目录</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tracks.length > 0 ? (
            <TrackList
              tracks={tracks}
              currentIndex={currentIndex}
              onPlay={(index) => playTracks(tracks, index)}
              onToggleLike={() => undefined}
              onPlayNext={insertNext}
              onEnqueue={appendToQueue}
            />
          ) : visibleEntries.some((entry) => !entry.isDirectory) ? (
            <div class="library-empty webdav-no-audio"><p>当前筛选结果中没有支持的音频文件</p></div>
          ) : null}
        </>
      )}
    </section>
  );
}
