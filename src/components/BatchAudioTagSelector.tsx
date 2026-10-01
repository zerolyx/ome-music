import { useEffect, useState } from "preact/hooks";
import {
  closeTrackAudioTagSelection,
  openSelectedTrackAudioTagBatchEditor,
  openSelectedTrackAudioTagEditor,
  selectingTrackAudioTags,
} from "../state/album-tag-editor";
import { Icon } from "./Icon";

const MAX_AUDIO_TAG_BATCH = 20;

export function BatchAudioTagSelector() {
  const candidates = selectingTrackAudioTags.value;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (candidates === null) return;
    setSelectedIds(new Set());
    setQuery("");
  }, [candidates]);

  useEffect(() => {
    if (!candidates) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTrackAudioTagSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [candidates]);

  if (!candidates) return null;

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTracks = normalizedQuery
    ? candidates.filter((track) => `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(normalizedQuery))
    : candidates;
  const selectedTracks = candidates.filter((track) => selectedIds.has(track.id));

  function changeSelection(id: string, checked: boolean): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked && next.size < MAX_AUDIO_TAG_BATCH) next.add(id);
      else if (!checked) next.delete(id);
      return next;
    });
  }

  function selectVisible(): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const track of visibleTracks) {
        if (next.size >= MAX_AUDIO_TAG_BATCH) break;
        next.add(track.id);
      }
      return next;
    });
  }

  function continueToEditor(): void {
    if (selectedTracks.length === 0 || selectedTracks.length > MAX_AUDIO_TAG_BATCH) return;
    openSelectedTrackAudioTagEditor(selectedTracks);
    closeTrackAudioTagSelection();
  }

  function continueToTrackEditor(): void {
    if (selectedTracks.length === 0 || selectedTracks.length > MAX_AUDIO_TAG_BATCH) return;
    openSelectedTrackAudioTagBatchEditor(selectedTracks);
    closeTrackAudioTagSelection();
  }

  return (
    <div class="picker-backdrop batch-metadata-backdrop" onClick={closeTrackAudioTagSelection}>
      <section
        class="picker-dialog batch-metadata-dialog audio-tag-selection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-tag-selection-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="picker-head">
          <div>
            <h2 id="audio-tag-selection-title">选择要写入标签的曲目</h2>
            <p>当前范围 {candidates.length} 首 · 最多选 {MAX_AUDIO_TAG_BATCH} 首；可统一改专辑字段，也可逐首编辑各自标签。</p>
          </div>
          <button class="picker-close" type="button" aria-label="关闭" onClick={closeTrackAudioTagSelection}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div class="batch-metadata-body">
          <p class="batch-metadata-disclosure">
            只在本机处理。写入前会逐曲确认并保留首次整首恢复点；逐首写入遇错即停。共用专辑模式只改专辑字段。
          </p>
          <label class="audio-tag-selection-search">
            <Icon name="search" size={14} />
            <input
              class="picker-input"
              type="search"
              value={query}
              placeholder="搜索曲名、艺人或专辑"
              aria-label="搜索曲目"
              onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <div class="batch-metadata-selection-head">
            <span>已选 <strong>{selectedIds.size} / {MAX_AUDIO_TAG_BATCH}</strong></span>
            <div>
              <button type="button" class="batch-metadata-text-button" onClick={selectVisible}>选择当前结果（上限 20）</button>
              <button type="button" class="batch-metadata-text-button" onClick={() => setSelectedIds(new Set())}>清空</button>
            </div>
          </div>
          {visibleTracks.length === 0 ? (
            <div class="batch-metadata-empty">没有符合条件的本地曲目。</div>
          ) : (
            <div class="batch-metadata-track-list" aria-label="选择本地曲目">
              {visibleTracks.map((track) => {
                const checked = selectedIds.has(track.id);
                const disabled = !checked && selectedIds.size >= MAX_AUDIO_TAG_BATCH;
                return (
                  <label class={`batch-metadata-track${disabled ? " is-disabled" : ""}`} key={track.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) => changeSelection(track.id, event.currentTarget.checked)}
                    />
                    <span class="batch-metadata-track-copy">
                      <strong>{track.title}</strong>
                      <small>{track.artist || "未知艺人"}{track.album ? ` · ${track.album}` : ""}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <footer class="batch-metadata-actions">
          <button type="button" class="btn-secondary" onClick={closeTrackAudioTagSelection}>取消</button>
          <button type="button" class="btn-secondary" disabled={selectedTracks.length === 0} onClick={continueToEditor}>
            <Icon name="tag" size={14} />
            共用专辑标签 · {selectedTracks.length} 首
          </button>
          <button type="button" class="btn-primary" disabled={selectedTracks.length === 0} onClick={continueToTrackEditor}>
            <Icon name="tag" size={14} />
            逐首编辑完整标签 · {selectedTracks.length} 首
          </button>
        </footer>
      </section>
    </div>
  );
}
