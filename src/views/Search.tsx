import { useState } from "preact/hooks";
import {
  error as neteaseError,
  results,
  searched,
  searching,
  search as runSearch,
  toggleNeteaseLike,
} from "../state/netease";
import { currentIndex, playTracks } from "../state/player";
import type { Track } from "../types/music";
import { TrackList } from "../components/TrackList";
import { Icon } from "../components/Icon";

export function SearchView() {
  const [keywords, setKeywords] = useState("");

  const submit = () => {
    const query = keywords.trim();
    if (query) void runSearch(query);
  };

  const onPlay = (index: number) => {
    if (index >= 0 && index < results.value.length) playTracks(results.value, index);
  };

  const onToggleLike = (track: Track) => toggleNeteaseLike(track);

  return (
    <section class="view view-search">
      <h1 class="view-title">搜索</h1>
      <div class="search-row">
        <input
          class="search-input"
          type="text"
          placeholder="搜索歌曲、艺人…（回车搜索）"
          value={keywords}
          onInput={(event) => setKeywords((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if ((event as KeyboardEvent).key === "Enter") submit();
          }}
          aria-label="搜索关键词"
        />
        <button class="btn-primary" disabled={searching.value} onClick={submit}>
          <Icon name="search" size={16} />
          {searching.value ? "搜索中…" : "搜索"}
        </button>
      </div>

      {neteaseError.value && <p class="view-hint search-error">{neteaseError.value}</p>}

      {results.value.length > 0 ? (
        <TrackList
          tracks={results.value}
          currentIndex={currentIndex.value}
          onPlay={onPlay}
          onToggleLike={onToggleLike}
        />
      ) : (
        searched.value &&
        !searching.value && (
          <div class="library-empty">
            <Icon name="search" size={40} />
            <p>没有找到相关结果</p>
          </div>
        )
      )}
    </section>
  );
}
