import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeCatalogEntity, previewCatalogEntityMerge, renameCatalogEntity } from "../state/library";
import { CatalogEntityEditor } from "./CatalogEntityEditor";

vi.mock("../state/library", () => ({
  mergeCatalogEntity: vi.fn(),
  previewCatalogEntityMerge: vi.fn(),
  renameCatalogEntity: vi.fn(),
}));

const entity = {
  kind: "artist" as const,
  id: "artist-1",
  name: "旧艺人名",
  trackCount: 4,
};

beforeEach(() => {
  const tracks = Array.from({ length: entity.trackCount }, (_, index) => ({
    id: `track-${index}`,
    title: `曲目 ${index}`,
    artist: "新艺人名",
    album: "",
    durationSeconds: 180,
    filePath: `D:/Music/${index}.flac`,
    source: "local" as const,
    liked: false,
    playCount: 0,
  }));
  vi.mocked(renameCatalogEntity).mockResolvedValue({
    id: entity.id,
    previousName: entity.name,
    name: "新艺人名",
    tracks,
  });
  vi.mocked(previewCatalogEntityMerge).mockResolvedValue({
    sourceId: "artist-1",
    sourceName: "旧艺人名",
    targetId: "artist-2",
    targetName: "目标艺人",
    sourceTrackCount: 4,
    targetTrackCount: 3,
    consolidatedAlbums: [{ sourceName: "旧版辑", targetName: "标准辑", trackCount: 2 }],
  });
  vi.mocked(mergeCatalogEntity).mockResolvedValue({
    id: "artist-2",
    previousName: "旧艺人名",
    name: "目标艺人",
    tracks,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CatalogEntityEditor", () => {
  it("explains the library-only rename and saves the new display name", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<CatalogEntityEditor entity={entity} onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByText(/更新 4 首曲目的曲库展示名/)).toBeTruthy();
    expect(screen.getByText(/不会写入音频文件/, { selector: ".catalog-entity-copy" })).toBeTruthy();
    fireEvent.input(screen.getByLabelText("艺人名称"), { target: { value: "新艺人名" } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => expect(renameCatalogEntity).toHaveBeenCalledWith("artist", "artist-1", "旧艺人名", "新艺人名"));
    expect(onSaved).toHaveBeenCalledWith("artist", "旧艺人名", "新艺人名", 4);
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the editor open and shows a conflict error", async () => {
    const error = new Error("曲库中已存在同名艺人");
    vi.mocked(renameCatalogEntity).mockRejectedValue(error);
    const onClose = vi.fn();
    render(<CatalogEntityEditor entity={entity} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.input(screen.getByLabelText("艺人名称"), { target: { value: "重复名字" } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", error.message);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("previews the affected catalog, then requires an explicit merge action", async () => {
    const target = { id: "artist-2", name: "目标艺人", trackCount: 3 };
    const onClose = vi.fn();
    const onMerged = vi.fn();
    const { container } = render(
      <CatalogEntityEditor
        entity={entity}
        mergeTargets={[target]}
        onClose={onClose}
        onSaved={vi.fn()}
        onMerged={onMerged}
      />,
    );

    fireEvent.change(screen.getByLabelText("选择目标艺人"), { target: { value: target.id } });
    fireEvent.click(screen.getByRole("button", { name: "预览合并影响" }));
    await waitFor(() => expect(container.querySelector(".catalog-entity-merge-preview p")?.textContent).toContain("4 首曲目将并入 目标艺人"));
    expect(container.querySelector(".catalog-entity-album-merges")?.textContent).toContain("旧版辑 → 标准辑");
    expect(mergeCatalogEntity).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认合并艺人" }));
    await waitFor(() => expect(mergeCatalogEntity).toHaveBeenCalledWith("artist", entity, target));
    expect(onMerged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

});
