/* ============ 设置页信息架构（ECHO 四组导航 + 关键词搜索定位） ============
 * 分组顺序即侧栏顺序；keywords 供设置内搜索（中英混合，命中即定位分区）。
 */

import { signal } from "@preact/signals";

export type SectionId =
  | "playback"
  | "appearance"
  | "sound"
  | "source"
  | "lyrics"
  | "dj"
  | "shortcuts"
  | "data"
  | "about";

/** 页面间的显式设置定位请求；SettingsView 读取并消费一次。 */
export const requestedSettingsSection = signal<SectionId | null>(null);

export interface SettingsSection {
  id: SectionId;
  label: string;
  group: string;
  keywords: string[];
}

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
  {
    id: "playback",
    label: "播放",
    group: "常用",
    keywords: ["播放", "电台", "自动接播", "淡变", "fade", "radio", "playback"],
  },
  {
    id: "appearance",
    label: "外观",
    group: "常用",
    keywords: ["主题", "外观", "配色", "自由配色", "自定义颜色", "强调色", "唱片取色", "弹幕", "theme", "appearance"],
  },
  {
    id: "sound",
    label: "声音",
    group: "常用",
    keywords: ["均衡器", "eq", "频响", "输出设备", "声音", "音效", "sound"],
  },
  {
    id: "source",
    label: "音乐源",
    group: "内容",
    keywords: ["网易云", "登录", "扫码", "本地", "导入", "曲库", "远程曲库", "Navidrome", "Subsonic", "Jellyfin", "Emby", "WebDAV", "SMB", "服务器", "目录", "文件夹", "扫描", "授权", "恢复", "重扫", "directory", "scan", "rescan", "netease", "remote library"],
  },
  {
    id: "lyrics",
    label: "歌词",
    group: "内容",
    keywords: ["歌词", "桌面歌词", "歌词条", "锁定", "穿透", "竖排", "lyric"],
  },
  {
    id: "dj",
    label: "DJ 电台与语音",
    group: "DJ",
    keywords: ["dj", "语音", "tts", "模型", "llm", "deepseek", "密钥", "记忆"],
  },
  {
    id: "shortcuts",
    label: "快捷键",
    group: "高级",
    keywords: ["快捷键", "键盘", "空格", "space", "hotkey", "shortcut"],
  },
  {
    id: "data",
    label: "数据与备份",
    group: "高级",
    keywords: ["备份", "恢复", "曲库", "播放记录", "数据", "backup", "restore"],
  },
  {
    id: "about",
    label: "关于",
    group: "高级",
    keywords: ["关于", "版本", "github", "开源", "重置", "偏好", "about"],
  },
];

/** 分组出现顺序（组内按 SECTIONS 顺序） */
export const SETTINGS_GROUPS = ["常用", "内容", "DJ", "高级"];

/** 纯逻辑：设置搜索 —— 标题或任一关键词包含查询即命中（可单测） */
export function searchSections(query: string): SectionId[] {
  const q = query.trim().toLowerCase();
  if (!q) return SETTINGS_SECTIONS.map((section) => section.id);
  return SETTINGS_SECTIONS.filter(
    (section) =>
      section.label.toLowerCase().includes(q) ||
      section.keywords.some((keyword) => keyword.toLowerCase().includes(q)),
  ).map((section) => section.id);
}
