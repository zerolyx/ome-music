import { describe, expect, it } from "vitest";
import {
  advance,
  radioQueueContinuation,
  currentIndexAfterMove,
  endEventType,
  insertNext,
  appendToQueue,
  removeAt,
  moveInQueue,
  removeTracksFromQueue,
  forgetSavedManualQueue,
  isPlaybackEventRecordable,
  lastManualQueueSession,
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

describe("收听事件的本机记录边界", () => {
  it("保留既有音源记录，但不把私人服务器收听写入本地历史", () => {
    expect(isPlaybackEventRecordable(t("local-track"))).toBe(true);
    expect(isPlaybackEventRecordable({ ...t("remote-track"), source: "netease" })).toBe(true);
    expect(isPlaybackEventRecordable({ ...t("server-track"), source: "subsonic" })).toBe(false);
    expect(isPlaybackEventRecordable({ ...t("jellyfin-track"), source: "jellyfin" })).toBe(false);
    expect(isPlaybackEventRecordable({ ...t("emby-track"), source: "emby" })).toBe(false);
    expect(isPlaybackEventRecordable(null)).toBe(false);
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

  it("忘记已保存队列只删除恢复快照，不清空当前播放列表", () => {
    const saved = [{
      version: 1 as const,
      currentIndex: 0,
      tracks: [{ source: "local" as const, id: "saved" }],
    }];
    localStorage.setItem("ome.queue-session", JSON.stringify(saved[0]));
    lastManualQueueSession.value = saved[0];
    queue.value = [t("currently-playing")];
    currentIndex.value = 0;

    forgetSavedManualQueue();

    expect(localStorage.getItem("ome.queue-session")).toBeNull();
    expect(lastManualQueueSession.value).toBeNull();
    expect(queue.value.map((track) => track.id)).toEqual(["currently-playing"]);
  });

  it("批量移除多个 ID 的所有队列副本，并保留当前曲目的正确下标", () => {
    queue.value = [t("remove-a"), t("keep-a"), t("remove-b"), t("keep-b"), t("remove-a")];
    currentIndex.value = 3;

    removeTracksFromQueue(["remove-a", "remove-b"]);

    expect(queue.value.map((track) => track.id)).toEqual(["keep-a", "keep-b"]);
    expect(currentIndex.value).toBe(1);
  });
});

describe("AI 电台与手动队列衔接", () => {
  it("手动队列仍有下一首时先播队列", () => {
    expect(radioQueueContinuation(true, 0, 3)).toEqual({ type: "manual", index: 1 });
  });

  it("手动队列耗尽或没有手动接管时恢复电台选曲", () => {
    expect(radioQueueContinuation(true, 2, 3)).toEqual({ type: "radio" });
    expect(radioQueueContinuation(false, 0, 3)).toEqual({ type: "radio" });
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
