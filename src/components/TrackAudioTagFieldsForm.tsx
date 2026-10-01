import type { TrackAudioTags } from "../lib/api";
import type { TrackAudioTagForm } from "../lib/track-audio-tags";

interface TrackAudioTagFieldsFormProps {
  original: TrackAudioTags;
  draft: TrackAudioTagForm;
  disabled: boolean;
  onChange: (field: keyof TrackAudioTagForm, value: string) => void;
}

export function TrackAudioTagFieldsForm({ original, draft, disabled, onChange }: TrackAudioTagFieldsFormProps) {
  return (
    <>
      <div class="track-metadata-embedded-tag-grid" role="group" aria-label="曲名与专辑标签">
        <label class="track-metadata-field">
          <span>曲名</span>
          <input class="picker-input" type="text" maxLength={200} aria-label="内嵌曲名" value={draft.title} disabled={disabled} onInput={(event) => onChange("title", (event.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="track-metadata-field">
          <span>艺人</span>
          <input class="picker-input" type="text" maxLength={200} aria-label="内嵌艺人" value={draft.artist} disabled={disabled} onInput={(event) => onChange("artist", (event.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="track-metadata-field">
          <span>专辑</span>
          <input class="picker-input" type="text" maxLength={200} aria-label="内嵌专辑" value={draft.album} disabled={disabled} onInput={(event) => onChange("album", (event.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="track-metadata-field">
          <span>专辑艺人</span>
          <input class="picker-input" type="text" maxLength={200} aria-label="内嵌专辑艺人" value={draft.albumArtist} disabled={disabled} onInput={(event) => onChange("albumArtist", (event.currentTarget as HTMLInputElement).value)} />
        </label>
      </div>
      <div class="track-metadata-embedded-tag-grid track-metadata-embedded-tag-grid-compact" role="group" aria-label="年份、流派和编号">
        <label class="track-metadata-field">
          <span>年份</span>
          <input class="picker-input" type="text" inputMode="numeric" maxLength={4} aria-label="内嵌年份" placeholder="YYYY" value={draft.year} disabled={disabled} onInput={(event) => onChange("year", (event.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="track-metadata-field">
          <span>流派</span>
          <input class="picker-input" type="text" maxLength={200} aria-label="内嵌流派" value={draft.genre} disabled={disabled} onInput={(event) => onChange("genre", (event.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="track-metadata-field">
          <span class="track-metadata-field-label"><span>音轨号</span><small>总数 {original.trackTotal ?? "未记录"}</small></span>
          <input class="picker-input" type="text" inputMode="numeric" aria-label="内嵌音轨号" value={draft.trackNumber} disabled={disabled} onInput={(event) => onChange("trackNumber", (event.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="track-metadata-field">
          <span class="track-metadata-field-label"><span>碟号</span><small>总数 {original.discTotal ?? "未记录"}</small></span>
          <input class="picker-input" type="text" inputMode="numeric" aria-label="内嵌碟号" value={draft.discNumber} disabled={disabled} onInput={(event) => onChange("discNumber", (event.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="track-metadata-field">
          <span>BPM</span>
          <input class="picker-input" type="text" inputMode="numeric" maxLength={3} aria-label="内嵌 BPM" value={draft.bpm} disabled={disabled} onInput={(event) => onChange("bpm", (event.currentTarget as HTMLInputElement).value)} />
        </label>
      </div>
      <label class="track-metadata-field">
        <span class="track-metadata-field-label"><span>备注</span><small>最多 4,000 字</small></span>
        <textarea class="track-metadata-embedded-tag-comment picker-input" maxLength={4000} aria-label="内嵌备注" value={draft.comment} disabled={disabled || original.commentTruncated} onInput={(event) => onChange("comment", (event.currentTarget as HTMLTextAreaElement).value)} />
      </label>
      {original.commentTruncated && (
        <p class="track-metadata-lookup-note" role="status">内嵌备注超过 4,000 字，当前只显示前 4,000 字；本次会保留原备注，其他标签仍可编辑。</p>
      )}
    </>
  );
}
