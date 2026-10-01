import type { Track } from "../types/music";
import { formatDuration } from "../lib/audio";
import { Icon } from "./Icon";

interface TrackListProps {
  tracks: Track[];
  currentIndex: number;
  onPlay: (index: number) => void;
  onToggleLike: (track: Track) => void;
  /** 插播到当前之后（hover 显示） */
  onPlayNext?: (track: Track) => void;
  /** 追加到队尾（hover 显示） */
  onEnqueue?: (track: Track) => void;
  /** 从队列移除（hover 显示，用于播放列表抽屉） */
  onRemove?: (index: number) => void;
  /** 加入歌单（hover 显示，唤起全局选择器） */
  onAddToPlaylist?: (track: Track) => void;
  /** 修正曲库展示资料（仅本地曲目） */
  onEditMetadata?: (track: Track) => void;
  /** 从本地曲库索引中移除（仅在曲库管理视图显示） */
  onRemoveFromLibrary?: (track: Track) => void;
  /** 曲库批量选择状态（仅用于本地曲目） */
  selectionMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  selectionDisabled?: boolean;
  onToggleSelection?: (track: Track) => void;
  /** 可选的补充信息行，仅在需要辨认曲库来源时显示 */
  detailText?: (track: Track) => string | null;
  /** 提供时行可拖拽重排（播放列表抽屉，ECHO 式） */
  onReorder?: (from: number, to: number) => void;
}

/** 拖拽中的来源下标（仅队列抽屉开启拖拽；模块级防拖拽中被重渲染清掉） */
let dragFrom = -1;

export function TrackList({
  tracks,
  currentIndex,
  onPlay,
  onToggleLike,
  onPlayNext,
  onEnqueue,
  onRemove,
  onAddToPlaylist,
  onEditMetadata,
  onRemoveFromLibrary,
  selectionMode = false,
  selectedIds,
  selectionDisabled = false,
  onToggleSelection,
  detailText,
  onReorder,
}: TrackListProps) {
  const rowProps = (index: number) =>
    onReorder
      ? {
          draggable: true,
          onDragStart: () => {
            dragFrom = index;
          },
          onDragOver: (event: MouseEvent) => {
            if (dragFrom !== -1) event.preventDefault(); // 允许放置
          },
          onDrop: (event: MouseEvent) => {
            event.preventDefault();
            if (dragFrom !== -1 && dragFrom !== index) onReorder(dragFrom, index);
            dragFrom = -1;
          },
          onDragEnd: () => {
            dragFrom = -1;
          },
        }
      : {};
  return (
    <ul class="track-list" role="list">
      {tracks.map((track, index) => (
        <li
          key={track.id}
          data-index={index}
          class={`track-row ${index === currentIndex ? "is-current" : ""} ${
            onReorder ? "is-draggable" : ""
          } ${selectionMode && track.source === "local" && selectedIds?.has(track.id) ? "is-selected" : ""}`}
          {...rowProps(index)}
        >
          {selectionMode && track.source === "local" && onToggleSelection ? (
            <label class="track-selection-control" title={`选择 ${track.title}`} onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                aria-label={`选择 ${track.title}`}
                checked={selectedIds?.has(track.id) ?? false}
                disabled={selectionDisabled}
                onChange={() => onToggleSelection(track)}
              />
            </label>
          ) : (
            <button class="track-play" aria-label={`播放 ${track.title}`} onClick={() => onPlay(index)}>
              <Icon name="play" size={14} />
            </button>
          )}
          <div class={`track-meta ${
            track.source === "local" && (onEditMetadata || onRemoveFromLibrary)
              ? "has-track-management-actions"
              : ""
          }`} onClick={() => onPlay(index)}>
            <span class="track-title">
              {track.title}
              {track.unavailableReason === "vip" && <span class="vip-chip">VIP</span>}
            </span>
            <span class="track-artist">{track.artist}</span>
            {detailText?.(track) && <span class="track-detail">{detailText(track)}</span>}
            {onEditMetadata && track.source === "local" && (
              <button
                class="track-edit-action"
                aria-label={`修正曲目信息 ${track.title}`}
                title="修正曲目信息"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditMetadata(track);
                }}
              >
                <Icon name="edit" size={14} />
              </button>
            )}
            {!selectionMode && onRemoveFromLibrary && track.source === "local" && (
              <button
                class="track-edit-action track-library-remove-action"
                aria-label={`从曲库移除 ${track.title}`}
                title="从曲库移除"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveFromLibrary(track);
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
          {/* 占位槽保证各列对齐；hover 才浮现操作 */}
          <span class="track-action-slot">
            {onPlayNext && (
              <button
                class="track-action"
                aria-label={`下一首播放 ${track.title}`}
                title="下一首播放"
                onClick={() => onPlayNext(track)}
              >
                <Icon name="play-next" size={15} />
              </button>
            )}
          </span>
          <span class="track-action-slot">
            {onEnqueue && (
              <button
                class="track-action"
                aria-label={`加入队列 ${track.title}`}
                title="加入队列"
                onClick={() => onEnqueue(track)}
              >
                <Icon name="plus" size={15} />
              </button>
            )}
          </span>
          <span class="track-duration">{formatDuration(track.durationSeconds)}</span>
          <span class="track-action-slot">
            {onRemove && (
              <button
                class="track-action track-remove"
                aria-label={`移除 ${track.title}`}
                title="从队列移除"
                onClick={() => onRemove(index)}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </span>
          <span class="track-action-slot">
            {onAddToPlaylist && track.source !== "subsonic" && track.source !== "jellyfin" && track.source !== "emby" && track.source !== "webdav" && track.source !== "smb" && (
              <button
                class="track-action"
                aria-label={`加入歌单 ${track.title}`}
                title="加入歌单"
                onClick={() => onAddToPlaylist(track)}
              >
                <Icon name="playlist" size={15} />
              </button>
            )}
          </span>
          {/* 网易云支持红心；B站与远程曲库当前没有统一的收藏写入接口。 */}
          {track.source === "netease" ? (
            <button
              class={`track-like ${track.liked ? "is-liked" : ""}`}
              aria-label={track.liked ? "取消红心" : "红心"}
              onClick={() => onToggleLike(track)}
            >
              <Icon name="heart" size={16} />
            </button>
          ) : (
            <span class="track-like-slot" aria-hidden="true" />
          )}
        </li>
      ))}
    </ul>
  );
}
