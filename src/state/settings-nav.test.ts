import { describe, expect, it } from "vitest";
import { searchSections, SETTINGS_GROUPS, SETTINGS_SECTIONS } from "./settings-nav";

describe("settings-nav（设置信息架构与搜索）", () => {
  it("八个分区，且都归属已声明的分组", () => {
    expect(SETTINGS_SECTIONS).toHaveLength(8);
    for (const section of SETTINGS_SECTIONS) {
      expect(SETTINGS_GROUPS).toContain(section.group);
    }
  });

  it("空查询返回全部分区（顺序即展示顺序）", () => {
    expect(searchSections("")).toEqual(SETTINGS_SECTIONS.map((s) => s.id));
    expect(searchSections("   ")).toEqual(SETTINGS_SECTIONS.map((s) => s.id));
  });

  it("中文关键词命中分区", () => {
    expect(searchSections("桌面歌词")).toEqual(["lyrics"]);
    expect(searchSections("电台")).toEqual(["playback", "dj"]);
    expect(searchSections("主题")).toEqual(["appearance"]);
    expect(searchSections("均衡器")).toEqual(["sound"]);
  });

  it("英文关键词大小写不敏感", () => {
    expect(searchSections("EQ")).toEqual(["sound"]);
    expect(searchSections("deepseek")).toEqual(["dj"]);
    expect(searchSections("Space")).toEqual(["shortcuts"]);
  });

  it("标题也能命中；未命中返回空", () => {
    expect(searchSections("快捷键")).toEqual(["shortcuts"]);
    expect(searchSections("不存在的东西")).toEqual([]);
  });
});
