import { describe, expect, it } from "vitest";
import { searchSections, requestedSettingsSection, SETTINGS_GROUPS, SETTINGS_SECTIONS } from "./settings-nav";

describe("settings-nav（设置信息架构与搜索）", () => {
  it("九个分区，且都归属已声明的分组", () => {
    expect(SETTINGS_SECTIONS).toHaveLength(9);
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

  it("远程曲库协议关键词定位音乐源", () => {
    expect(searchSections("Navidrome")).toContain("source");
    expect(searchSections("Subsonic")).toContain("source");
  });

  it("跨页面远程曲库入口可请求展开音乐源分区", () => {
    requestedSettingsSection.value = "source";
    expect(requestedSettingsSection.value).toBe("source");
    requestedSettingsSection.value = null;
  });

  it("数据备份可由中文和英文关键词找到", () => {
    expect(searchSections("备份")).toEqual(["data"]);
    expect(searchSections("restore")).toEqual(["data"]);
  });

  it("标题也能命中；未命中返回空", () => {
    expect(searchSections("快捷键")).toEqual(["shortcuts"]);
    expect(searchSections("不存在的东西")).toEqual([]);
  });
});
