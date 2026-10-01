import { Icon } from "./Icon";
import {
  backgroundLibraryRescanActive,
  importNotice,
  importOperation,
  importProgress,
  importing,
} from "../state/library";
import type { LibraryImportProgress } from "../lib/api";

function progressMessage(progress: LibraryImportProgress | null): string {
  if (!progress) {
    return importOperation.value === "rescan" ? "正在重扫已授权的音乐文件夹…" : "正在导入音乐文件…";
  }
  const scanErrors = progress.scanErrors > 0 ? ` · ${progress.scanErrors} 处目录读取异常` : "";
  if (progress.phase === "selecting") return "请选择要导入的音乐文件夹";
  if (progress.phase === "discovering") {
    return `正在遍历文件夹 · 已检查 ${progress.examinedEntries} 项，发现 ${progress.discoveredFiles} 首音频${scanErrors}`;
  }
  if (progress.phase === "reading") {
    const total = progress.totalFiles ?? 0;
    if (total === 0) return "遍历完成，没有发现支持的音频文件";
    return `正在读取曲目与封面 · ${progress.processedFiles} / ${total} 首 · 新增 ${progress.added} · 更新 ${progress.updated} · 跳过 ${progress.skipped}${scanErrors}`;
  }
  return `扫描完成 · 新增 ${progress.added} · 更新 ${progress.updated} · 跳过 ${progress.skipped}${scanErrors}`;
}

export function LibraryImportStatus() {
  if (backgroundLibraryRescanActive.value) return null;
  const active = importing.value;
  const progress = importProgress.value;
  const notice = importNotice.value;
  if (!active && !notice) return null;

  const total = progress?.totalFiles ?? 0;
  const showProgress =
    active &&
    (progress?.phase === "discovering" || (progress?.phase === "reading" && total > 0));

  return (
    <div class="library-import-status" role="region" aria-label="曲库导入状态">
      <span class="library-import-status-message" role="status" aria-live="polite">
        {active ? progressMessage(progress) : notice}
      </span>
      {showProgress && (
        <progress
          aria-label="曲库扫描进度"
          max={total || undefined}
          value={progress?.phase === "reading" && total > 0 ? progress.processedFiles : undefined}
          aria-valuetext={total > 0 ? `${progress?.processedFiles ?? 0} / ${total} 首` : undefined}
        />
      )}
      {!active && notice && (
        <button
          class="library-import-status-dismiss"
          aria-label="关闭导入结果"
          title="关闭导入结果"
          onClick={() => {
            importNotice.value = null;
          }}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}
