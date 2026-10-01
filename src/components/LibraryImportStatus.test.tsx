import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LibraryImportStatus } from "./LibraryImportStatus";
import { importNotice, importOperation, importProgress, importing } from "../state/library";

beforeEach(() => {
  importing.value = false;
  importOperation.value = null;
  importProgress.value = null;
  importNotice.value = null;
});

afterEach(() => cleanup());

describe("LibraryImportStatus", () => {
  it("显示扫描阶段、真实进度和跳过计数", () => {
    importing.value = true;
    importProgress.value = {
      phase: "reading",
      examinedEntries: 1260,
      discoveredFiles: 64,
      processedFiles: 33,
      totalFiles: 64,
      added: 28,
      updated: 3,
      skipped: 2,
      scanErrors: 1,
    };

    render(<LibraryImportStatus />);

    expect(screen.getByText(/33 \/ 64 首/)).toBeTruthy();
    expect(screen.getByText(/1 处目录读取异常/)).toBeTruthy();
    const progress = screen.getByRole("progressbar", { name: "曲库扫描进度" }) as HTMLProgressElement;
    expect(progress.value).toBe(33);
    expect(progress.max).toBe(64);
  });

  it("遍历目录时显示已检查数量和不定进度", () => {
    importing.value = true;
    importProgress.value = {
      phase: "discovering",
      examinedEntries: 1024,
      discoveredFiles: 47,
      processedFiles: 0,
      totalFiles: null,
      added: 0,
      updated: 0,
      skipped: 0,
      scanErrors: 0,
    };

    render(<LibraryImportStatus />);

    expect(screen.getByText(/已检查 1024 项，发现 47 首音频/)).toBeTruthy();
    const progress = screen.getByRole("progressbar", { name: "曲库扫描进度" }) as HTMLProgressElement;
    expect(progress.hasAttribute("value")).toBe(false);
  });

  it("进度事件暂不可用时仍能说明正在重扫", () => {
    importing.value = true;
    importOperation.value = "rescan";

    render(<LibraryImportStatus />);

    expect(screen.getByText("正在重扫已授权的音乐文件夹…")).toBeTruthy();
  });

  it("允许关闭导入完成结果", () => {
    importNotice.value = "新增 4 首，更新 1 首，共 12 首，跳过 0 首";
    render(<LibraryImportStatus />);

    fireEvent.click(screen.getByRole("button", { name: "关闭导入结果" }));

    expect(screen.queryByText(/新增 4 首/)).toBeNull();
  });
});
