import { describe, expect, it } from "vitest";
import {
  advance,
  currentIndexAfterMove,
  endEventType,
  insertNext,
  appendToQueue,
  removeAt,
  moveInQueue,
  queue,
  currentIndex,
} from "./player";
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

describe("队列拖拽重排（currentIndexAfterMove / moveInQueue）", () => {
  it("纯逻辑：移动元素后当前下标的落点", () => {
    expect(currentIndexAfterMove(1, 1, 3)).toBe(3); // 当前自己被拖走 → 跟随
    expect(currentIndexAfterMove(2, 0, 3)).toBe(1); // 前面的移到当前之后 → 左移
    expect(currentIndexAfterMove(1, 3, 0)).toBe(2); // 后面的移到当前之前 → 右移
    expect(currentIndexAfterMove(2, 3, 4)).toBe(2); // 同侧移动 → 不变
  });

  it("moveInQueue 重排且当前曲目跟随", () => {
    queue.value = [t("a"), t("b"), t("c"), t("d")];
    currentIndex.value = 1; // 正在播 b
    moveInQueue(1, 3);
    expect(queue.value.map((x) => x.id)).toEqual(["a", "c", "d", "b"]);
    expect(currentIndex.value).toBe(3);
  });

  it("moveInQueue 移动非当前曲目时 currentIndex 补偿", () => {
    queue.value = [t("a"), t("b"), t("c")];
    currentIndex.value = 2;
    moveInQueue(0, 2); // a 拖到末尾：b 左移到 0，c 左移到 1
    expect(queue.value.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(currentIndex.value).toBe(1);
  });

  it("moveInQueue 越界/同位无副作用", () => {
    queue.value = [t("a"), t("b")];
    currentIndex.value = 0;
    moveInQueue(0, 0);
    moveInQueue(-1, 2);
    moveInQueue(0, 5);
    expect(queue.value.map((x) => x.id)).toEqual(["a", "b"]);
    expect(currentIndex.value).toBe(0);
  });
});
