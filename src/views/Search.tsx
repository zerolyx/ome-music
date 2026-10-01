import { useEffect, useState } from "preact/hooks";
import {
  error as neteaseError,
  results,
  searched,
  searching,
  search as runSearch,
  toggleNeteaseLike,
} from "../state/netease";
import {
  error as bilibiliError,
  results as biliResults,
  searched as biliSearched,
  searching as biliSearching,
  searchBilibili,
} from "../state/bilibili";
import { currentTrack, playTracks, insertNext, appendToQueue } from "../state/player";
import { openAddToPlaylist } from "../state/playlists";
import { openTrackMetadataEditor } from "../state/metadata-editor";
import { activeView } from "../state/app";
import { requestedSettingsSection } from "../state/settings-nav";
import { isTauriRuntime, subsonicCoverUrl } from "../lib/api";
import { MediaServerBrowser } from "../components/MediaServerBrowser";
import { WebDavBrowser } from "../components/WebDavBrowser";
import { SmbBrowser } from "../components/SmbBrowser";
import {
  albumError,
  albumHasMore,
  albumLoading,
  albumTracks,
  albumTruncated,
  albums,
  albumsLoaded,
  albumsLoading,
  closeSubsonicAlbum,
  connection as subsonicConnection,
  error as subsonicError,
  results as subsonicResults,
  searched as subsonicSearched,
  searching as subsonicSearching,
  closeSubsonicPlaylist,
  loadSubsonicPlaylists,
  loadSubsonicAlbums,
  openSubsonicAlbum,
  openSubsonicPlaylist,
  playlistError,
  playlistLoading,
  playlistPage,
  playlistTracks,
  playlistTotalSongs,
  playlistTruncated,
  playlistsLoading,
  selectedPlaylist,
  selectedAlbum,
  refreshSubsonicStatus,
  searchSubsonic,
} from "../state/subsonic";
import {
  connection as jellyfinConnection,
  error as jellyfinError,
  results as jellyfinResults,
  searched as jellyfinSearched,
  searching as jellyfinSearching,
  catalog as jellyfinCatalog,
  refreshJellyfinStatus,
  searchJellyfin,
} from "../state/jellyfin";
import {
  connection as embyConnection,
  error as embyError,
  results as embyResults,
  searched as embySearched,
  searching as embySearching,
  catalog as embyCatalog,
  refreshEmbyStatus,
  searchEmby,
} from "../state/emby";
import {
  connection as webdavConnection,
  refreshWebDavStatus,
} from "../state/webdav";
import {
  connection as smbConnection,
  error as smbError,
  refreshSmbStatus,
} from "../state/smb";
import type { Track } from "../types/music";
import { TrackList } from "../components/TrackList";
import { Icon } from "../components/Icon";

type SearchSource = "netease" | "bilibili" | "subsonic" | "jellyfin" | "emby" | "webdav" | "smb";

const SOURCES: Array<{ value: SearchSource; label: string }> = [
  { value: "netease", label: "网易云" },
  { value: "bilibili", label: "B站" },
  { value: "subsonic", label: "远程曲库" },
  { value: "jellyfin", label: "Jellyfin" },
  { value: "emby", label: "Emby" },
  { value: "webdav", label: "WebDAV" },
  { value: "smb", label: "SMB" },
];

export function SearchView() {
  const demo = new URLSearchParams(window.location.search).get("demo");
  const remoteBrowseDemo = demo === "remote-albums" || demo === "remote-album-detail"
    || demo === "remote-jellyfin-albums" || demo === "remote-jellyfin-album-detail"
    || demo === "remote-jellyfin-playlists" || demo === "remote-jellyfin-playlist-detail";
  const initialSource: SearchSource = demo?.startsWith("remote-jellyfin-") ? "jellyfin" : "subsonic";
  const [keywords, setKeywords] = useState("");
  const [source, setSource] = useState<SearchSource>(remoteBrowseDemo ? initialSource : "netease");
  const [remoteMode, setRemoteMode] = useState<"songs" | "playlists" | "albums">(
    demo?.includes("playlist") ? "playlists" : remoteBrowseDemo ? "albums" : "songs",
  );

  useEffect(() => {
    if (remoteBrowseDemo) return;
    void refreshSubsonicStatus();
    void refreshJellyfinStatus();
    void refreshEmbyStatus();
    void refreshWebDavStatus();
    void refreshSmbStatus();
  }, []);

  const providerCatalog = source === "jellyfin"
    ? jellyfinCatalog
    : source === "emby"
      ? embyCatalog
      : null;
  const remoteSourceConnected = source === "subsonic"
    ? subsonicConnection.value.connected
    : source === "jellyfin"
      ? jellyfinConnection.value.connected
      : source === "emby"
        ? embyConnection.value.connected
        : source === "webdav"
          ? webdavConnection.value.connected
          : source === "smb"
            ? smbConnection.value.connected
          : false;
  const remoteBrowseAvailable = (source === "subsonic" || providerCatalog !== null || source === "webdav") && remoteSourceConnected;
  const browsingRemotePlaylists = remoteBrowseAvailable && remoteMode === "playlists";
  const browsingRemoteAlbums = remoteBrowseAvailable && remoteMode === "albums";
  const remoteSessionMissing = (source === "subsonic" && !subsonicConnection.value.connected)
    || (source === "jellyfin" && !jellyfinConnection.value.connected)
    || (source === "emby" && !embyConnection.value.connected)
    || (source === "webdav" && !webdavConnection.value.connected)
    || (source === "smb" && !smbConnection.value.connected);
  const activeAlbum = source === "subsonic" ? selectedAlbum.value : providerCatalog?.selectedAlbum.value ?? null;
  const activePlaylist = source === "subsonic" ? selectedPlaylist.value : providerCatalog?.selectedPlaylist.value ?? null;
  const activeAlbums = source === "subsonic" ? albums.value : providerCatalog?.albums.value ?? [];
  const activePlaylists = source === "subsonic"
    ? playlistPage.value?.playlists ?? []
    : providerCatalog?.playlists.value ?? [];
  const activeResults = (() => {
    if (source === "bilibili") return biliResults.value;
    if (source === "netease") return results.value;
    if (source === "webdav" || source === "smb") return [];
    if (source === "subsonic") {
      if (browsingRemotePlaylists) return playlistTracks.value;
      if (browsingRemoteAlbums) return selectedAlbum.value ? albumTracks.value : [];
      return subsonicResults.value;
    }
    if (source === "jellyfin") {
      if (browsingRemotePlaylists) return jellyfinCatalog.selectedPlaylist.value ? jellyfinCatalog.playlistTracks.value : [];
      if (browsingRemoteAlbums) return jellyfinCatalog.selectedAlbum.value ? jellyfinCatalog.albumTracks.value : [];
      return jellyfinResults.value;
    }
    if (browsingRemotePlaylists) return embyCatalog.selectedPlaylist.value ? embyCatalog.playlistTracks.value : [];
    if (browsingRemoteAlbums) return embyCatalog.selectedAlbum.value ? embyCatalog.albumTracks.value : [];
    return embyResults.value;
  })();
  const activeSearching = (() => {
    if (source === "webdav" || source === "smb") return false;
    if (source === "bilibili") return biliSearching.value;
    if (source === "netease") return searching.value;
    if (source === "subsonic") {
      if (browsingRemotePlaylists) return playlistLoading.value || playlistsLoading.value;
      if (browsingRemoteAlbums) return selectedAlbum.value ? albumLoading.value : albumsLoading.value;
      return subsonicSearching.value;
    }
    if (providerCatalog && browsingRemotePlaylists) {
      return providerCatalog.selectedPlaylist.value ? providerCatalog.playlistLoading.value : providerCatalog.playlistsLoading.value;
    }
    if (providerCatalog && browsingRemoteAlbums) {
      return providerCatalog.selectedAlbum.value ? providerCatalog.albumLoading.value : providerCatalog.albumsLoading.value;
    }
    return source === "jellyfin" ? jellyfinSearching.value : embySearching.value;
  })();
  const activeSearched = (() => {
    if (source === "webdav" || source === "smb") return false;
    if (source === "bilibili") return biliSearched.value;
    if (source === "netease") return searched.value;
    if (source === "subsonic") {
      if (browsingRemotePlaylists) return playlistPage.value !== null || selectedPlaylist.value !== null;
      if (browsingRemoteAlbums) return albumsLoaded.value || selectedAlbum.value !== null;
      return subsonicSearched.value;
    }
    if (providerCatalog && browsingRemotePlaylists) {
      return providerCatalog.playlistsLoaded.value || providerCatalog.selectedPlaylist.value !== null;
    }
    if (providerCatalog && browsingRemoteAlbums) {
      return providerCatalog.albumsLoaded.value || providerCatalog.selectedAlbum.value !== null;
    }
    return source === "jellyfin" ? jellyfinSearched.value : embySearched.value;
  })();
  const activeError = !isTauriRuntime() ? null : (() => {
    if (source === "webdav") return null;
    if (source === "smb") return smbError.value;
    if (source === "bilibili") return bilibiliError.value;
    if (source === "netease") return neteaseError.value;
    if (source === "subsonic") {
      if (browsingRemotePlaylists) return selectedPlaylist.value ? playlistError.value : null;
      if (browsingRemoteAlbums) return selectedAlbum.value ? albumError.value : null;
      return subsonicError.value;
    }
    if (providerCatalog && browsingRemotePlaylists) {
      return providerCatalog.selectedPlaylist.value
        ? providerCatalog.playlistError.value
        : providerCatalog.playlistListError.value;
    }
    if (providerCatalog && browsingRemoteAlbums) {
      return providerCatalog.selectedAlbum.value
        ? providerCatalog.albumError.value
        : providerCatalog.albumListError.value;
    }
    return source === "jellyfin" ? jellyfinError.value : embyError.value;
  })();
  const currentResultIndex = activeResults.findIndex((track) => track.id === currentTrack.value?.id);

  const submit = () => {
    const query = keywords.trim();
    if (!query || !isTauriRuntime()) return;
    if (source === "bilibili") void searchBilibili(query);
    else if (source === "emby") void searchEmby(query);
    else if (source === "jellyfin") void searchJellyfin(query);
    else if (source === "subsonic") void searchSubsonic(query);
    else void runSearch(query);
  };

  const onPlay = (index: number) => {
    if (index >= 0 && index < activeResults.length) playTracks(activeResults, index);
  };

  const onToggleLike = (track: Track) => toggleNeteaseLike(track);

  const selectSource = (next: SearchSource) => {
    if (next === source) return;
    if (source === "subsonic") {
      closeSubsonicPlaylist();
      closeSubsonicAlbum();
    } else if (source === "jellyfin") {
      jellyfinCatalog.closePlaylist();
      jellyfinCatalog.closeAlbum();
    } else if (source === "emby") {
      embyCatalog.closePlaylist();
      embyCatalog.closeAlbum();
    }
    setRemoteMode("songs");
    setSource(next);
  };

  const selectRemoteMode = (mode: "songs" | "playlists" | "albums") => {
    setRemoteMode(mode);
    if (source === "subsonic") {
      if (mode === "songs") {
        closeSubsonicPlaylist();
        closeSubsonicAlbum();
      } else if (mode === "playlists") {
        closeSubsonicPlaylist();
        closeSubsonicAlbum();
        void loadSubsonicPlaylists(true);
      } else {
        closeSubsonicPlaylist();
        void loadSubsonicAlbums(true);
      }
    } else if (source === "jellyfin") {
      if (mode === "songs") {
        jellyfinCatalog.closePlaylist();
        jellyfinCatalog.closeAlbum();
      } else if (mode === "playlists") {
        jellyfinCatalog.closePlaylist();
        jellyfinCatalog.closeAlbum();
        void jellyfinCatalog.loadPlaylists(true);
      } else {
        jellyfinCatalog.closePlaylist();
        void jellyfinCatalog.loadAlbums(true);
      }
    } else if (source === "emby") {
      if (mode === "songs") {
        embyCatalog.closePlaylist();
        embyCatalog.closeAlbum();
      } else if (mode === "playlists") {
        embyCatalog.closePlaylist();
        embyCatalog.closeAlbum();
        void embyCatalog.loadPlaylists(true);
      } else {
        embyCatalog.closePlaylist();
        void embyCatalog.loadAlbums(true);
      }
    }
  };

  return (
    <section class="view view-search">
      <div class="view-head">
        <div class="view-head-text">
          <h1 class="view-title">搜索</h1>
          {(browsingRemotePlaylists
            ? Boolean(activePlaylist || activePlaylists.length)
            : browsingRemoteAlbums
              ? Boolean(activeAlbum || activeAlbums.length)
            : activeResults.length > 0) && (
            <span class="view-count">
              {browsingRemotePlaylists
                ? activePlaylist
                  ? `共 ${source === "subsonic" ? playlistTotalSongs.value : providerCatalog?.playlistTotalSongs.value ?? 0} 首曲目`
                  : `找到 ${source === "subsonic" ? playlistPage.value?.totalCount ?? activePlaylists.length : providerCatalog?.playlistsTotalCount.value ?? activePlaylists.length} 个服务器歌单`
                : browsingRemoteAlbums
                  ? activeAlbum
                    ? `共 ${source === "subsonic" ? activeAlbum.songCount : providerCatalog?.albumTotalSongs.value ?? 0} 首曲目`
                    : `已浏览 ${activeAlbums.length} 张专辑`
                  : `找到 ${activeResults.length} 个结果`}
            </span>
          )}
        </div>
      </div>
      {source !== "webdav" && source !== "smb" && !browsingRemotePlaylists && !browsingRemoteAlbums && (
        <div class="search-row">
          <input
            class="search-input"
            type="text"
            disabled={!isTauriRuntime() || remoteSessionMissing}
            placeholder="搜索歌曲、艺人…（回车搜索）"
            value={keywords}
            onInput={(event) => setKeywords((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if ((event as KeyboardEvent).key === "Enter") submit();
            }}
            aria-label="搜索关键词"
          />
          <button class="btn-primary" disabled={!isTauriRuntime() || remoteSessionMissing || activeSearching} onClick={submit}>
            <Icon name="search" size={16} />
            {activeSearching ? "搜索中…" : "搜索"}
          </button>
        </div>
      )}

      {/* 远程曲库是可选搜索来源，连接状态不会改变首页私人电台。 */}
      <div class="search-source segmented" role="radiogroup" aria-label="搜索音源">
        {SOURCES.map((item) => (
          <button
            key={item.value}
            role="radio"
            aria-checked={source === item.value}
            class={`segment ${source === item.value ? "is-active" : ""}`}
            onClick={() => selectSource(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!isTauriRuntime() && (
        <p class="view-hint" role="status">
          当前是浏览器预览；曲库搜索与播放需要在 Ome Music 桌面应用中使用。
        </p>
      )}

      {remoteBrowseAvailable && source !== "webdav" && source !== "smb" && (
        <div class="search-source segmented remote-library-mode" role="radiogroup" aria-label="远程曲库浏览方式">
          <button
            role="radio"
            aria-checked={remoteMode === "songs"}
            class={`segment ${remoteMode === "songs" ? "is-active" : ""}`}
            onClick={() => selectRemoteMode("songs")}
          >搜索曲目</button>
          <button
            role="radio"
            aria-checked={remoteMode === "playlists"}
            class={`segment ${remoteMode === "playlists" ? "is-active" : ""}`}
            onClick={() => selectRemoteMode("playlists")}
          >服务器歌单</button>
          <button
            role="radio"
            aria-checked={remoteMode === "albums"}
            class={`segment ${remoteMode === "albums" ? "is-active" : ""}`}
            onClick={() => selectRemoteMode("albums")}
          >浏览专辑</button>
        </div>
      )}

      {activeError && !browsingRemoteAlbums && !browsingRemotePlaylists && (
        <p class="view-hint search-error" role="status" aria-live="polite">{activeError}</p>
      )}

      {(source === "subsonic" && !subsonicConnection.value.connected)
        || (source === "jellyfin" && !jellyfinConnection.value.connected)
        || (source === "emby" && !embyConnection.value.connected)
        || (source === "webdav" && !webdavConnection.value.connected)
        || (source === "smb" && !smbConnection.value.connected) ? (
        <div class="library-empty">
          <Icon name="search" size={40} />
          <p>{source === "jellyfin"
            ? "连接 Jellyfin 曲库后即可搜索与播放"
            : source === "emby"
              ? "连接 Emby 曲库后即可搜索与播放"
              : source === "webdav"
                ? "连接 WebDAV 曲库后即可按目录浏览与播放"
                : source === "smb"
                  ? "连接 SMB 曲库后即可按目录浏览与播放"
                : "连接 Navidrome 或 Subsonic 曲库后即可搜索与播放"}</p>
          <button class="btn-secondary" onClick={() => {
            requestedSettingsSection.value = "source";
            activeView.value = "settings";
          }}>
            前往音乐源设置
          </button>
        </div>
      ) : browsingRemoteAlbums && (source === "jellyfin" || source === "emby") ? (
        <MediaServerBrowser source={source} mode="albums" />
      ) : source === "webdav" ? (
        <WebDavBrowser />
      ) : source === "smb" ? (
        <SmbBrowser />
      ) : browsingRemoteAlbums ? (
        selectedAlbum.value ? (
          <>
            <div class="remote-playlist-heading remote-album-heading">
              <button class="btn-secondary" onClick={closeSubsonicAlbum}>返回专辑</button>
              <div class="remote-album-detail-title">
                <span class="remote-album-detail-cover">
                  <span class="album-cover-empty"><Icon name="music-note" size={18} /></span>
                  {subsonicCoverUrl(selectedAlbum.value.coverArtId) && (
                    <img
                      src={subsonicCoverUrl(selectedAlbum.value.coverArtId) ?? undefined}
                      alt=""
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.visibility = "hidden";
                      }}
                    />
                  )}
                </span>
                <div>
                  <h2>{selectedAlbum.value.name}</h2>
                  <span>
                    {selectedAlbum.value.artist}
                    {selectedAlbum.value.year ? ` · ${selectedAlbum.value.year}` : ""}
                    {` · ${selectedAlbum.value.songCount} 首曲目`}
                  </span>
                </div>
              </div>
            </div>
            {albumTruncated.value && (
              <p class="view-hint">专辑曲目较多，当前最多显示 200 首可读曲目。</p>
            )}
            {albumLoading.value ? (
              <div class="library-empty"><p>正在读取专辑曲目…</p></div>
            ) : albumTracks.value.length > 0 ? (
              <TrackList
                tracks={albumTracks.value}
                currentIndex={currentResultIndex}
                onPlay={(index) => playTracks(albumTracks.value, index)}
                onToggleLike={() => undefined}
                onPlayNext={insertNext}
                onEnqueue={appendToQueue}
              />
            ) : !albumError.value ? (
              <div class="library-empty"><p>这张专辑还没有可播放的曲目</p></div>
            ) : (
              <div class="library-empty">
                <p>无法读取这张专辑</p>
                <button class="btn-secondary" onClick={() => void openSubsonicAlbum(selectedAlbum.value!)}>重试</button>
              </div>
            )}
          </>
        ) : albumsLoading.value && albums.value.length === 0 ? (
          <div class="library-empty"><p>正在读取远程专辑…</p></div>
        ) : albums.value.length > 0 ? (
          <>
            {albumsLoading.value && <p class="view-hint" role="status">正在加载更多专辑…</p>}
            {albumError.value && (
              <div class="view-hint search-error remote-album-error" role="status" aria-live="polite">
                <span>{albumError.value}</span>
                <button class="btn-secondary" onClick={() => void loadSubsonicAlbums()}>重试</button>
              </div>
            )}
            <ul class="album-grid remote-album-grid">
              {albums.value.map((album) => {
                const cover = subsonicCoverUrl(album.coverArtId);
                return (
                  <li key={album.id}>
                    <button
                      class="album-card remote-album-card"
                      aria-label={`打开专辑 ${album.name}`}
                      onClick={() => void openSubsonicAlbum(album)}
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
              <span>已浏览 {albums.value.length} 张专辑</span>
              {albumHasMore.value ? (
                <button
                  class="btn-secondary"
                  disabled={albumsLoading.value}
                  onClick={() => void loadSubsonicAlbums()}
                >
                  {albumsLoading.value ? "加载中…" : "加载更多"}
                </button>
              ) : <span>已经到底了</span>}
            </div>
          </>
        ) : albumsLoaded.value ? (
          <div class="library-empty">
            <Icon name="music-note" size={40} />
            <p>服务器中还没有可浏览的专辑</p>
            {albumError.value && <button class="btn-secondary" onClick={() => void loadSubsonicAlbums(true)}>重试</button>}
          </div>
        ) : albumError.value ? (
          <div class="library-empty">
            <p>无法读取远程专辑</p>
            <button class="btn-secondary" onClick={() => void loadSubsonicAlbums(true)}>重试</button>
          </div>
        ) : null
      ) : browsingRemotePlaylists && (source === "jellyfin" || source === "emby") ? (
        <MediaServerBrowser source={source} mode="playlists" />
      ) : browsingRemotePlaylists ? (
        selectedPlaylist.value ? (
          <>
            <div class="remote-playlist-heading">
              <button class="btn-secondary" onClick={closeSubsonicPlaylist}>返回服务器歌单</button>
              <div>
                <h2>{selectedPlaylist.value.name}</h2>
                <span>{playlistTotalSongs.value} 首曲目</span>
              </div>
            </div>
            {playlistTruncated.value && (
              <p class="view-hint">部分曲目未显示；每个歌单最多呈现 200 首可读曲目。</p>
            )}
            {playlistLoading.value ? (
              <div class="library-empty"><p>正在读取歌单曲目…</p></div>
            ) : playlistTracks.value.length > 0 ? (
              <TrackList
                tracks={playlistTracks.value}
                currentIndex={currentResultIndex}
                onPlay={(index) => playTracks(playlistTracks.value, index)}
                onToggleLike={() => undefined}
                onPlayNext={insertNext}
                onEnqueue={appendToQueue}
              />
            ) : !playlistError.value ? (
              <div class="library-empty"><p>这个服务器歌单还没有可播放的曲目</p></div>
            ) : null}
          </>
        ) : playlistsLoading.value ? (
          <div class="library-empty"><p>正在读取服务器歌单…</p></div>
        ) : playlistPage.value?.playlists.length ? (
          <>
            {playlistPage.value.truncated && (
              <p class="view-hint">显示前 100 个服务器歌单（共 {playlistPage.value.totalCount} 个）。</p>
            )}
            <ul class="playlist-grid remote-playlist-grid">
              {playlistPage.value.playlists.map((playlist) => (
                <li class="playlist-card" key={playlist.id}>
                  <button class="playlist-card-main" onClick={() => void openSubsonicPlaylist(playlist)}>
                    <span class="playlist-card-icon"><Icon name="playlist" size={22} /></span>
                    <span class="playlist-card-name">{playlist.name}</span>
                    <span class="playlist-card-count">{playlist.songCount} 首曲目</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : playlistPage.value ? (
          <div class="library-empty"><Icon name="playlist" size={40} /><p>服务器中还没有可播放的歌单</p></div>
        ) : playlistError.value ? (
          <div class="library-empty">
            <p>无法读取服务器歌单</p>
            <button class="btn-secondary" onClick={() => void loadSubsonicPlaylists()}>重试</button>
          </div>
        ) : null
      ) : activeResults.length > 0 ? (
        <TrackList
          tracks={activeResults}
          currentIndex={currentResultIndex}
          onPlay={onPlay}
          onToggleLike={onToggleLike}
          onPlayNext={insertNext}
          onEnqueue={appendToQueue}
          onAddToPlaylist={source === "subsonic" || source === "jellyfin" || source === "emby" ? undefined : openAddToPlaylist}
          onEditMetadata={openTrackMetadataEditor}
        />
      ) : (
        activeSearched &&
        !activeSearching && (
          <div class="library-empty">
            <Icon name="search" size={40} />
            <p>没有找到相关结果</p>
          </div>
        )
      )}
    </section>
  );
}
