# Ome Music v0.6.0 移植 Spec — Folia / ECHONext 深度借鉴

> 来源：`https://github.com/chthollyphile/folia-major`（AGPL-3.0，仅借鉴设计与功能思路，不复制代码）
> 与 `https://github.com/Moekotori/ECHO`（LGPL-3.0，echonext.moe 官网对应社区版，同样只借鉴思路）。
> 硬约束：**前端运行时依赖仅 preact / @preact/signals / @tauri-apps/api，禁止新增**；
> 视觉全部用手写 Canvas 2D / Web Audio / CSS 实现（不上 PixiJS）；动效统一 `--ease-signature`；
> 尊重 prefers-reduced-motion；UI 文案简体中文。

## 一、从 Folia 提炼的可移植项

### A. 视觉/体验（最高优先级）
1. **主题预设系统（Theme Park 思路）**：3-5 套手工精调主题（暗色为主，含 1 套亮色），
   每套 = 背景基调 + 强调色 + 玻璃强度 + 强调/文字色板；设置里一键切换，存 localStorage。
2. **封面取色氛围背景**：从当前封面用 Canvas 提取主色/辅色（简单色阶量化），
   生成渐变氛围光 + 主题色联动（播放条、高亮、频谱配色跟随封面）。
3. **全屏歌词舞台（文字 PV 级）**：新增独立全屏视图。
   - 逐字卡拉 OK：解析网易云 yrc（逐字时间轴）高亮当前字；无 yrc 时逐行 fallback。
   - 至少 3 种动效主题：「浮流」（大字居中淡入推近）、「群唱」（多行错落 + 逐字放大）、「心象」（模糊聚焦切换）。
   - 进度可拖、封面/频谱作背景层、鼠标静置隐藏 UI。
4. **视觉器扩展**：在现有频谱基础上加 3 种手写模式：「极光」（分层正弦光带）、
   「圆环」（环形频谱 + 粒子尾迹）、「脉冲」（中心呼吸封面 + 光晕）。
   全屏视觉器视图可随主题色联动。
5. **迷你播放器**：紧凑模式（小窗弧形进度 + 基础控制），可从命令面板/按钮切换。
6. **桌面歌词**：常驻置顶小横条窗口（Tauri 第二窗口，透明、跳字、锁定开关）。

### B. 功能
7. **均衡器（DSP Lite）**：Web Audio BiquadFilter 8 段参数 EQ + 6 个预设
   （默认/流行/摇滚/古典/人声/低音），开关即时生效（需要把播放路由进 Web Audio 图）。
8. **输出设备选择**：HTMLAudio `setSinkId` 枚举输出设备，设置里切换。
9. **历史视图 + 收藏视图**：基于现有 playback_events 与 liked，新增两个视图入口。
10. **文件夹浏览**：曲库按目录树分组浏览（沿用 walkdir 导入的路径信息）。
11. **智能在线歌词匹配**：本地曲目按 标题+艺术家 模糊匹配网易云歌词（带候选确认弹窗）。
12. **命令面板增强**：置顶命令、最近使用、内联音量条、队列内搜索（借鉴 folia 的 palette 设计）。
13. **新手引导**：首次启动的功能导览卡片（可跳过，设置里可重看）。
14. **Automix Lite（交叉淡入淡出）**：切歌时 3-5s 交叉淡变（双 audio 元素），可开关。

### C. 远期（本版不做，记录在案）
- 壁纸模式（WorkerW SetParent）、TTML/qrc/krc 歌词、Sync Server、Now Playing 接入、gapless。

## 二、从 ECHO 提炼的可移植项

- DSP Center → 对应上面第 7 条（ECHO 的 EQ/Headroom/FIR 太重，取参数 EQ 即可）。
- DesktopLyricsApp → 第 6 条；mini-player → 第 5 条。
- 页面体系（History/Liked/Folders/Queue/NowPlaying）→ 第 9、10 条 + 现有页面补全。
- Onboarding → 第 13 条。
- 输出设备（WASAPI 层面做不了，用 setSinkId 代替）→ 第 8 条。
- 插件/远程曲库/下载器/AudioCD：不移植。

## 三、实施分期

| Phase | 内容 | 验收 |
| --- | --- | --- |
| A1 主题系统 | 主题预设 + 封面取色氛围 | 切换主题全局生效，氛围色跟随封面 |
| A2 歌词舞台 | 全屏歌词视图 + 逐字卡拉 OK + 3 动效 | yrc 逐字高亮准确，3 动效可切换 |
| A3 视觉器 | 极光/圆环/脉冲 3 模式 + 全屏视图 | 60fps 无明显掉帧（reduced-motion 降级静态） |
| B1 播放增强 | EQ + 输出设备 + 交叉淡入淡出 | EQ 预设可听出差异，切歌淡变平滑 |
| B2 视图补全 | 历史/收藏/文件夹视图 | 三视图数据正确 |
| B3 体验增强 | 命令面板增强 + 智能歌词匹配 + 新手引导 + 迷你播放器 + 桌面歌词 | 逐项可用 |

## 四、门禁（每 Phase 收尾必过）
- 前端：tsc / eslint / vitest 全绿；Rust：test + clippy 零警告；版本号三处 lockstep。
- 截图审查（frontend-design-loop 闭环）后合入。
