import { currentTrack, playTracks, insertNext, appendToQueue } from "../state/player";
import { catalog as jellyfinCatalog } from "../state/jellyfin";
import { catalog as embyCatalog } from "../state/emby";
import { jellyfinCoverUrl, embyCoverUrl } from "../lib/api";
import type { MediaServerAlbum } from "../lib/api";
import { TrackList } from "./TrackList";
import { Icon } from "./Icon";

type MediaServerSource = "jellyfin" | "emby";

export function MediaServerBrowser({
  source,
  mode,
}: {
  source: MediaServerSource;
  mode: "albums" | "playlists";
}) {
  const catalog = source === "jellyfin" ? jellyfinCatalog : embyCatalog;
  const coverUrl = source === "jellyfin" ? jellyfinCoverUrl : embyCoverUrl;
  const currentTracks = mode === "albums"
    ? catalog.albumTracks.value
    : catalog.playlistTracks.value;
  const currentIndex = currentTracks.findIndex((track) => track.id === currentTrack.value?.id);

  if (mode === "albums") {
    const selected = catalog.selectedAlbum.value;
    if (selected) {
      return (
        <>
          <div class="remote-playlist-heading remote-album-heading">
            <button class="btn-secondary" onClick={catalog.closeAlbum}>返回专辑</button>
            <div class="remote-album-detail-title">
              <span class="remote-album-detail-cover">
                <span class="album-cover-empty"><Icon name="music-note" size={18} /></span>
                {selected.coverId && (
                  <img
                    src={coverUrl(selected.coverId) ?? undefined}
                    alt=""
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                )}
              </span>
              <div>
                <h2>{selected.name}</h2>
                <span>
                  {selected.artist}
                  {selected.year ? ` · ${selected.year}` : ""}
                  {` · ${catalog.albumTotalSongs.value} 首曲目`}
                </span>
              </div>
            </div>
          </div>
          {catalog.albumTruncated.value && (
            <p class="view-hint">专辑曲目较多，当前最多显示 200 首可读曲目。</p>
          )}
          {catalog.albumLoading.value ? (
            <div class="library-empty"><p>正在读取专辑曲目…</p></div>
          ) : catalog.albumTracks.value.length > 0 ? (
            <TrackList
              tracks={catalog.albumTracks.value}
              currentIndex={currentIndex}
              onPlay={(index) => playTracks(catalog.albumTracks.value, index)}
              onToggleLike={() => undefined}
              onPlayNext={insertNext}
              onEnqueue={appendToQueue}
            />
          ) : !catalog.albumError.value ? (
            <div class="library-empty"><p>这张专辑还没有可播放的曲目</p></div>
          ) : (
            <div class="library-empty">
              <p>无法读取这张专辑</p>
              <button class="btn-secondary" onClick={() => void catalog.openAlbum(selected)}>重试</button>
            </div>
          )}
        </>
      );
    }

    if (catalog.albumsLoading.value && catalog.albums.value.length === 0) {
      return <div class="library-empty"><p>正在读取远程专辑…</p></div>;
    }
    if (catalog.albums.value.length > 0) {
      return (
        <>
          {catalog.albumsLoading.value && <p class="view-hint" role="status">正在加载更多专辑…</p>}
          {catalog.albumListError.value && (
            <div class="view-hint search-error remote-album-error" role="status" aria-live="polite">
              <span>{catalog.albumListError.value}</span>
              <button class="btn-secondary" onClick={() => void catalog.loadAlbums()}>重试</button>
            </div>
          )}
          <ul class="album-grid remote-album-grid">
            {catalog.albums.value.map((album: MediaServerAlbum) => {
              const cover = album.coverId ? coverUrl(album.coverId) : null;
              return (
                <li key={album.id}>
                  <button
                    class="album-card remote-album-card"
                    aria-label={`打开专辑 ${album.name}`}
                    onClick={() => void catalog.openAlbum(album)}
                  >
                    <span class="album-cover remote-album-cover">
                      <span class="album-cover-empty"><Icon name="music-note" size={26} /></span>
                      {cover && (
                        <img
                          src={cover}
                          alt=""
                          loading="lazy"
                          onError={(event) => {
                            (event.target as HTMLImageElement).style.visibility = "hidden";
                          }}
                        />
                      )}
                      <span class="album-play"><Icon name="music-note" size={18} /></span>
                    </span>
                    <span class="album-title">{album.name}</span>
                    <span class="album-meta">
                      {album.artist}{album.year ? ` · ${album.year}` : ""} · {album.songCount} 首
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div class="remote-album-pagination">
            <span>已浏览 {catalog.albums.value.length} 张专辑 · 共 {catalog.albumsTotalCount.value} 张</span>
            {catalog.albumHasMore.value ? (
              <button
                class="btn-secondary"
                disabled={catalog.albumsLoading.value}
                onClick={() => void catalog.loadAlbums()}
              >
                {catalog.albumsLoading.value ? "加载中…" : "加载更多"}
              </button>
            ) : <span>已经到底了</span>}
          </div>
        </>
      );
    }
    if (catalog.albumsLoaded.value) {
      return (
        <div class="library-empty">
          <Icon name="music-note" size={40} />
          <p>服务器中还没有可浏览的专辑</p>
          {catalog.albumListError.value && (
            <button class="btn-secondary" onClick={() => void catalog.loadAlbums(true)}>重试</button>
          )}
        </div>
      );
    }
    if (catalog.albumListError.value) {
      return (
        <div class="library-empty">
          <p>无法读取远程专辑</p>
          <button class="btn-secondary" onClick={() => void catalog.loadAlbums(true)}>重试</button>
        </div>
      );
    }
    return null;
  }

  const selected = catalog.selectedPlaylist.value;
  if (selected) {
    return (
      <>
        <div class="remote-playlist-heading">
          <button class="btn-secondary" onClick={catalog.closePlaylist}>返回服务器歌单</button>
          <div>
            <h2>{selected.name}</h2>
            <span>{catalog.playlistTotalSongs.value} 首曲目</span>
          </div>
        </div>
        {catalog.playlistTruncated.value && (
          <p class="view-hint">部分曲目未显示；每个歌单最多呈现 200 首可读曲目。</p>
        )}
        {catalog.playlistLoading.value ? (
          <div class="library-empty"><p>正在读取歌单曲目…</p></div>
        ) : catalog.playlistTracks.value.length > 0 ? (
          <TrackList
            tracks={catalog.playlistTracks.value}
            currentIndex={currentIndex}
            onPlay={(index) => playTracks(catalog.playlistTracks.value, index)}
            onToggleLike={() => undefined}
            onPlayNext={insertNext}
            onEnqueue={appendToQueue}
          />
        ) : !catalog.playlistError.value ? (
          <div class="library-empty"><p>这个服务器歌单还没有可播放的曲目</p></div>
        ) : (
          <div class="library-empty">
            <p>无法读取这个服务器歌单</p>
            <button class="btn-secondary" onClick={() => void catalog.openPlaylist(selected)}>重试</button>
          </div>
        )}
      </>
    );
  }

  if (catalog.playlistsLoading.value) {
    return <div class="library-empty"><p>正在读取服务器歌单…</p></div>;
  }
  if (catalog.playlists.value.length > 0) {
    return (
      <>
        {catalog.playlistsTruncated.value && (
          <p class="view-hint">显示前 100 个服务器歌单（共 {catalog.playlistsTotalCount.value} 个）。</p>
        )}
        <ul class="playlist-grid remote-playlist-grid">
          {catalog.playlists.value.map((playlist) => (
            <li class="playlist-card" key={playlist.id}>
              <button class="playlist-card-main" onClick={() => void catalog.openPlaylist(playlist)}>
                <span class="playlist-card-icon"><Icon name="playlist" size={22} /></span>
                <span class="playlist-card-name">{playlist.name}</span>
                <span class="playlist-card-count">{playlist.songCount} 首曲目</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (catalog.playlistsLoaded.value) {
    return <div class="library-empty"><Icon name="playlist" size={40} /><p>服务器中还没有可播放的歌单</p></div>;
  }
  if (catalog.playlistListError.value) {
    return (
      <div class="library-empty">
        <p>无法读取远程歌单</p>
        <button class="btn-secondary" onClick={() => void catalog.loadPlaylists(true)}>重试</button>
      </div>
    );
  }
  return null;
}
