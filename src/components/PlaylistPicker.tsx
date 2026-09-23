import { useState } from "preact/hooks";
import {
  closeAddToPlaylist,
  confirmAddToPlaylist,
  createPlaylist,
  loadPlaylists,
  pendingAddTracks,
  playlists,
} from "../state/playlists";
import { isTauriRuntime } from "../lib/api";
import { Icon } from "./Icon";

/** 「加入歌单」选择器：全局模态，任意 TrackList 行的 hover 操作唤起 */
export function PlaylistPicker() {
  const pending = pendingAddTracks.value;
  const [draft, setDraft] = useState("");
  const list = playlists.value;

  if (pending === null) return null;
  if (list === null && isTauriRuntime()) void loadPlaylists();

  const title = pending[0]?.title ?? "";

  const createAndAdd = async () => {
    const name = draft.trim();
    if (!name) return;
    const created = await createPlaylist(name);
    setDraft("");
    if (created) await confirmAddToPlaylist(created.id);
  };

  return (
    <div class="picker-backdrop" onClick={closeAddToPlaylist}>
      <div
        class="picker-dialog"
        role="dialog"
        aria-label="加入歌单"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="picker-head">
          <span class="picker-title">加入歌单</span>
          <span class="picker-subject">{title}</span>
          <button class="picker-close" aria-label="关闭" onClick={closeAddToPlaylist}>
            <Icon name="close" size={15} />
          </button>
        </header>

        {list !== null && list.length > 0 && (
          <ul class="picker-list">
            {list.map((playlist) => (
              <li key={playlist.id}>
                <button
                  class="picker-item"
                  onClick={() => {
                    void confirmAddToPlaylist(playlist.id);
                  }}
                >
                  <Icon name="playlist" size={17} />
                  <span class="picker-item-name">{playlist.name}</span>
                  <span class="picker-item-count">{playlist.trackCount} 首</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div class="picker-create">
          <input
            class="picker-input"
            type="text"
            placeholder="新歌单名称…"
            aria-label="新歌单名称"
            value={draft}
            onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createAndAdd();
            }}
          />
          <button class="btn-primary" disabled={!draft.trim()} onClick={() => void createAndAdd()}>
            新建并加入
          </button>
        </div>
      </div>
    </div>
  );
}
