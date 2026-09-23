import { Icon } from "./Icon";
import {
  applyMatchCandidate,
  closeMatchPicker,
  matchCandidates,
  matchTargetTrack,
} from "../state/lyrics";

/** 歌词匹配候选确认弹窗：自动匹配不准时人工从搜索结果里挑一版 */
export function LyricsMatchPicker() {
  const candidates = matchCandidates.value;
  const track = matchTargetTrack.value;
  if (!track || candidates === null) return null;

  return (
    <div class="match-backdrop" onClick={closeMatchPicker}>
      <div
        class="match-dialog"
        role="dialog"
        aria-label="选择歌词匹配"
        onClick={(event) => event.stopPropagation()}
      >
        <div class="match-head">
          <span class="match-title">为「{track.title}」选择歌词版本</span>
          <button class="mini-btn" aria-label="关闭" onClick={closeMatchPicker}>
            <Icon name="close" size={14} />
          </button>
        </div>
        {candidates.length === 0 ? (
          <p class="view-hint">没有找到候选歌词，可以试试命令面板里的「歌词 · 重新匹配」。</p>
        ) : (
          <div class="match-list">
            {candidates.map((song) => (
              <button
                key={song.id}
                class="match-row"
                onClick={() => void applyMatchCandidate(song)}
              >
                <span class="match-row-title">{song.name}</span>
                <span class="match-row-meta">
                  {song.artists} · {song.album}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
