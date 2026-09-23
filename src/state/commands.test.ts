import { describe, expect, it } from "vitest";
import { filterCommands, matchScore, pushRecent, readRecent, type Command } from "./commands";

const cmd = (id: string, title: string): Command => ({ id, title, group: "测试", run: () => {} });

describe("matchScore", () => {
  it("空查询恒命中且得 0 分", () => {
    expect(matchScore("任意", "")).toBe(0);
    expect(matchScore("任意", "   ")).toBe(0);
  });

  it("子序列命中：连续与前缀加权", () => {
    expect(matchScore("打开播放队列", "打开")).toBeGreaterThan(matchScore("打开播放队列", "开播") ?? 0);
    // 前缀命中应高于中间命中
    expect(matchScore("打开队列", "打开")!).toBeGreaterThan(matchScore("一键打开队列", "打开")!);
  });

  it("非子序列返回 null", () => {
    expect(matchScore("设置", "设置页同步")).toBeNull();
    expect(matchScore("abc", "abcd")).toBeNull();
  });

  it("大小写不敏感", () => {
    expect(matchScore("DJ 记忆", "dj")).not.toBeNull();
  });
});

describe("recent 排序", () => {
  it("pushRecent 去重置顶并截断", () => {
    let recent: string[] = [];
    for (const id of ["a", "b", "c"]) recent = pushRecent(id);
    recent = pushRecent("b"); // 重复：置顶
    expect(recent.slice(0, 3)).toEqual(["b", "c", "a"]);
    for (let i = 0; i < 20; i++) recent = pushRecent(`x${i}`);
    expect(recent.length).toBeLessThanOrEqual(8);
  });

  it("同分时最近使用的排前面", () => {
    const commands = [cmd("a", "打开电台"), cmd("b", "打开搜索")];
    // 两个标题对 "打开" 同分（前缀相同、后续位置不同可能不同分，用完全同构标题更稳）
    const twins = [cmd("a", "打开电台"), cmd("b", "打开电台")];
    const ranked = filterCommands(twins, "打开", ["b"]);
    expect(ranked[0].id).toBe("b");
    expect(commands).toHaveLength(2); // 构造不报错
  });

  it("readRecent 容错坏数据", () => {
    localStorage.setItem("ome.palette.recent", "{oops");
    expect(readRecent()).toEqual([]);
    localStorage.setItem("ome.palette.recent", JSON.stringify(["a", 1, "b"]));
    expect(readRecent()).toEqual(["a", "b"]);
  });
});
