import { describe, expect, it } from "vitest";
import { buildMediaMetadata } from "./mediasession";

describe("buildMediaMetadata（媒体浮层元数据）", () => {
  it("映射标题/艺人/专辑与封面", () => {
    const data = buildMediaMetadata({
      title: "情歌",
      artist: "梁静茹",
      album: "现在开始我爱你",
      coverPath: "C:\\music\\cover.jpg",
    });
    expect(data.title).toBe("情歌");
    expect(data.artist).toBe("梁静茹");
    expect(data.album).toBe("现在开始我爱你");
    expect(data.artworkSrc).toBe("C:\\music\\cover.jpg"); // 非 Tauri 环境原样返回
  });

  it("无专辑时回退应用名；无封面时无 artwork", () => {
    const data = buildMediaMetadata({ title: "x", artist: "y", album: "", coverPath: null });
    expect(data.album).toBe("Ome Music");
    expect(data.artworkSrc).toBeNull();
  });
});
