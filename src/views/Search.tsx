import { useState } from "preact/hooks";
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
import { currentIndex, playTracks } from "../state/player";
import type { Track } from "../types/music";
import { TrackList } from "../components/TrackList";
import { Icon } from "../components/Icon";

type SearchSource = "netease" | "bilibili";

const SOURCES: Array<{ value: SearchSource; label: string }> = [
  { value: "netease", label: "网易云" },
  { value: "bilibili", label: "B站" },
];

export function SearchView() {
  const [keywords, setKeywords] = useState("");
  const [source, setSource] = useState<SearchSource>("netease");

  const activeResults = source === "bilibili" ? biliResults.value : results.value;
  const activeSearching = source === "bilibili" ? biliSearching.value : searching.value;
  const activeSearched = source === "bilibili" ? biliSearched.value : searched.value;
  const activeError = source === "bilibili" ? bilibiliError.value : neteaseError.value;

  const submit = () => {
    const query = keywords.trim();
    if (!query) return;
    if (source === "bilibili") void searchBilibili(query);
    else void runSearch(query);
  };

  const onPlay = (index: number) => {
    if (index >= 0 && index < activeResults.length) playTracks(activeResults, index);
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
        <button class="btn-primary" disabled={activeSearching} onClick={submit}>
          <Icon name="search" size={16} />
          {activeSearching ? "搜索中…" : "搜索"}
        </button>
      </div>

      {/* 音源切换：网易云 / B站（B站匿名可搜，结果全部可播） */}
      <div class="search-source segmented" role="radiogroup" aria-label="搜索音源">
        {SOURCES.map((item) => (
          <button
            key={item.value}
            role="radio"
            aria-checked={source === item.value}
            class={`segment ${source === item.value ? "is-active" : ""}`}
            onClick={() => setSource(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeError && <p class="view-hint search-error">{activeError}</p>}

      {activeResults.length > 0 ? (
        <TrackList
          tracks={activeResults}
          currentIndex={currentIndex.value}
          onPlay={onPlay}
          onToggleLike={onToggleLike}
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
