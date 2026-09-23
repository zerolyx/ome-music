import { describe, expect, it } from "vitest";
import { advance, endEventType, insertNext, appendToQueue, removeAt, queue, currentIndex } from "./player";
import type { Track } from "../types/music";

describe("endEventType", () => {
  it("播过 90% 以上算 completed", () => {
    expect(endEventType(200, 220)).toBe("completed");
    expect(endEventType(198, 220)).toBe("skip");
  });
  it("时长未知时不判 completed", () => {
    expect(endEventType(100, 0)).toBe("skip");
  });
});

describe("advance", () => {
  const queue = [1, 2, 3] as const;
  it("中间前进", () => {
    expect(advance(0, queue.length)).toBe(1);
    expect(advance(1, queue.length)).toBe(2);
  });
  it("末尾结束播放（返回 null）", () => {
    expect(advance(2, queue.length)).toBeNull();
  });
});

const t = (id: string): Track => ({
  id,
  title: id,
  artist: "a",
  album: "",
  durationSeconds: 1,
  filePath: "",
  source: "local",
  liked: false,
  playCount: 0,
});

describe("队列管理", () => {
  it("appendToQueue 追加到队尾", () => {
    queue.value = [t("a")];
    currentIndex.value = 0;
    appendToQueue(t("b"));
    expect(queue.value.map((x) => x.id)).toEqual(["a", "b"]);
    expect(currentIndex.value).toBe(0);
  });

  it("insertNext 插到当前之后", () => {
    queue.value = [t("a"), t("b")];
    currentIndex.value = 0;
    insertNext(t("x"));
    expect(queue.value.map((x) => x.id)).toEqual(["a", "x", "b"]);
  });

  it("removeAt 移除当前之前的曲目时下标左移", () => {
    queue.value = [t("a"), t("b"), t("c")];
    currentIndex.value = 2;
    removeAt(0);
    expect(queue.value.map((x) => x.id)).toEqual(["b", "c"]);
    expect(currentIndex.value).toBe(1);
  });

  it("removeAt 越界无副作用", () => {
    queue.value = [t("a")];
    currentIndex.value = 0;
    removeAt(5);
    expect(queue.value.length).toBe(1);
  });
});
