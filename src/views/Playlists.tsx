import { useState } from "preact/hooks";
import { isTauriRuntime } from "../lib/api";
import {
  activePlaylistId,
  activePlaylistTracks,
  closePlaylist,
  createPlaylist,
  deletePlaylist,
  loadPlaylists,
  openPlaylist,
  openAddToPlaylist,
  playlists,
  removeFromPlaylist,
  renamePlaylist,
} from "../state/playlists";
import { currentIndex, playTracks, insertNext, appendToQueue } from "../state/player";
import { toggleLiked } from "../state/library";
import { TrackList } from "../components/TrackList";
import { Icon } from "../components/Icon";

/** 歌单视图：总览卡片墙 + 歌单详情（曲库第 5 个视图） */
export function PlaylistBoard() {
  const list = playlists.value;

  if (list === null) {
    if (isTauriRuntime()) void loadPlaylists();
    return (
      <div class="library-empty">
        <Icon name="playlist" size={36} />
        <p>正在读取歌单…</p>
      </div>
    );
  }
  if (activePlaylistId.value !== null) return <PlaylistDetail />;
  return <PlaylistOverview />;
}

function PlaylistOverview() {
  const list = playlists.value ?? [];
  const [draft, setDraft] = useState("");

  const create = async () => {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    await createPlaylist(name);
  };

  return (
    <div class="playlist-board">
      <div class="playlist-create-row">
        <input
          class="picker-input"
          type="text"
          placeholder="新歌单名称…"
          aria-label="新歌单名称"
          value={draft}
          onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
          }}
        />
        <button class="btn-primary" disabled={!draft.trim()} onClick={() => void create()}>
          <Icon name="plus" size={15} />
          新建歌单
        </button>
      </div>
      {list.length === 0 ? (
        <div class="library-empty">
          <Icon name="playlist" size={40} />
          <p>还没有歌单</p>
          <p class="view-hint">起个名字建一个，把喜欢的歌收进来</p>
        </div>
      ) : (
        <ul class="playlist-grid">
          {list.map((playlist) => (
            <PlaylistCard key={playlist.id} id={playlist.id} name={playlist.name} count={playlist.trackCount} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaylistCard({ id, name, count }: { id: string; name: string; count: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const commitRename = async () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) await renamePlaylist(id, next);
    else setDraft(name);
  };

  return (
    <li class="playlist-card">
      <button class="playlist-card-main" onClick={() => void openPlaylist(id)}>
        <span class="playlist-card-icon">
          <Icon name="playlist" size={26} />
        </span>
        {editing ? (
          <input
            class="playlist-card-rename"
            value={draft}
            aria-label="歌单名称"
            onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitRename();
              if (event.key === "Escape") {
                setDraft(name);
                setEditing(false);
              }
            }}
            onBlur={() => void commitRename()}
          />
        ) : (
          <span class="playlist-card-name">{name}</span>
        )}
        <span class="playlist-card-count">{count} 首</span>
      </button>
      <div class="playlist-card-actions">
        <button
          class="track-action"
          aria-label={`重命名 ${name}`}
          title="重命名"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          <Icon name="list" size={14} />
        </button>
        <button
          class="track-action track-remove"
          aria-label={`删除歌单 ${name}`}
          title="删除歌单"
          onClick={() => {
            if (window.confirm(`删除歌单「${name}」？歌曲本身不会被删除。`)) {
              void deletePlaylist(id);
            }
          }}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </li>
  );
}

function PlaylistDetail() {
  const id = activePlaylistId.value;
  const list = playlists.value ?? [];
  const meta = list.find((item) => item.id === id);
  const tracks = activePlaylistTracks.value;

  if (tracks === null) {
    return (
      <div class="library-empty">
        <Icon name="playlist" size={36} />
        <p>正在读取歌单…</p>
      </div>
    );
  }

  return (
    <div class="playlist-detail">
      <div class="playlist-detail-head">
        <button class="chip-toggle" onClick={closePlaylist}>
          <Icon name="chevron-down" size={13} />
          全部歌单
        </button>
        <div class="view-head-text">
          <h2 class="view-title">{meta?.name ?? "歌单"}</h2>
          {tracks.length > 0 && <span class="view-count">共 {tracks.length} 首</span>}
        </div>
        {tracks.length > 0 && (
          <button class="btn-primary" onClick={() => playTracks(tracks, 0)}>
            <Icon name="play" size={15} />
            播放全部
          </button>
        )}
      </div>
      {tracks.length === 0 ? (
        <div class="library-empty">
          <Icon name="playlist" size={40} />
          <p>歌单还是空的</p>
          <p class="view-hint">在曲库或搜索结果里，hover 曲目点「加入歌单」</p>
        </div>
      ) : (
        <TrackList
          tracks={tracks}
          currentIndex={currentIndex.value}
          onPlay={(index) => playTracks(tracks, index)}
          onToggleLike={(track) => void toggleLiked(track)}
          onPlayNext={insertNext}
          onEnqueue={appendToQueue}
          onAddToPlaylist={openAddToPlaylist}
          onRemove={(index) => {
            const track = tracks[index];
            if (id && track) void removeFromPlaylist(id, track.id);
          }}
        />
      )}
    </div>
  );
}
