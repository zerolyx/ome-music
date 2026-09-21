# OME-UI-AUDIT — 视觉走查（第一轮）

> 日期：2026-09-09 · 方法：真实运行（vite dev :1420）+ Playwright 截图（1440x900 / 944x620）+ modlens 视觉桥审查 + DOM 计算样式核实
> 截图：docs/design/screenshots/ome-before-*.png / ome-after-v1-*.png
> 性质：视觉走查 + 1 轮修复（v1）。不做大改版；遵循 AGENTS.md 产品原则。

## Current Product Identity

轻量、冷静的**暗色玻璃质感**单机音乐播放器：graphite 底色 + 暖棕（#4a2108 系）强调 + 诗性文案人格（Let the room breathe）+ Inter 字体 + 克制动效（ome-shell-arrive 模糊入场）+ 性能意识（queue-row content-visibility）。设计语言明确、有性格。

## Strengths（应保留）

- 成熟 Token 体系：tailwind extend（graphite/accents/glass shadow）+ globals.css 语义变量（含响应式 fluid padding clamp）
- 队列虚拟化（content-visibility + contain-intrinsic-size）——大库性能意识
- 文案有人格：空态用诗性句而非系统腔
- 组件边界清晰（TopSearch / NowPlayingHero / PlayerControls / QueueDrawer / 各 Panel）
- ErrorBoundary 存在；Titlebar 与内容一体

## Problems

- P1-1 层级倒挂（已修复 v1）：无歌词空态把功能性提示 No matched lyrics for this version. 排成 5xl/7xl font-black 巨型标题（text-[#4a2108]/70），压过曲目元数据与诗性句。位置：NowPlayingHero 歌词区。
- P1-2 次级文字对比不足（已修复 v1）：同区块诗性句 text-[#4a2108]/25（近隐形）、loading 态同 /25。视觉桥评审：severely low contrast on secondary text。
- P1-3 同屏重复（已修复 v1）：同一句提示出现两次（巨型句 + lyricWarning 小字）。
- P2-1 首绘即报错：全新环境首启，启动恢复的曲目不可播 → 直接显示 UNABLE TO PLAY 徽章（App.tsx:927 libraryError）。建议：首启静默降级为空态引导（行为改动，本轮未做）。
- P2-2 工程可维护性：ProviderSettingsPanel.tsx 4390 行；App.tsx 2406 行（docs/TODO-app-refactor.md 记载约 1600 → 该数字已 STALE，实际 2406）。已有重构计划，planning-only，维持。
- P2-3 小窗拥挤：944x620 下右栏诗性句与控件偏紧（v1 已部分缓解；后续结合 TODO-app-refactor 布局重构处理）。

## Visual Hierarchy

修复前：巨型空态句 > 诗性句 > 曲目信息（倒挂）。修复后：曲目信息与播放控制为主，诗性句作为歌词区氛围主文案（48px/900/60%），功能警示 14px/45% 单处呈现。层级回归「播放优先、氛围辅之」。

## Layout

整体骨架（Titlebar / TopSearch / 左 NowPlaying / 右歌词面板 / 底部 PlayerControls）稳定；fluid side-padding clamp 分档合理；右栏 58vh 定高在窄窗偏紧（P2-3）。

## Typography

Inter + 全局 antialiased；诗性句 font-black 属品牌人格（保留）；问题在于「功能性文字借用展示级排版」与 /25 级透明度，v1 已纠正。文案尺寸阶梯建议后续收敛为 token（现多为任意值）。

## Spacing

面板间距一致性好；空态块 mt-8/mt-6 递进在 v1 简化后自然；小窗下右栏上下留白偏挤（P2-3）。

## Color

graphite 底 + 暖棕文字 + rose/coral accent 和谐；品牌 rose glow 阴影克制。问题集中在低透明度文字（/25、/35、/42、/56 若干处）——v1 修复涉及区块，其余（如 Bilibili 角标 text-white/42、--settings-text-muted 0.52）建议下一轮统一对比度基线（不低于 /45）。

## Components

Button/Input/Panel/Titlebar 风格统一（glass + 圆角 + 细边框）；空态组件此前缺统一模式，v1 确立「诗性句 + 小字状态」的空态范式，可复用到 OmeRadio 等面板。

## Interaction

DOM 快照显示控件齐全（Shuffle/Prev/Play/Next/Queue/Loop/进度条/心情按钮）；Start Broadcast 空态禁用正确。悬停/焦点态未在静态走查覆盖（留给 frontend-qa-playwright 交互轮）。

## Responsive

1440x900 良好；944x620 右栏偏挤（截图归档）；更窄窗口未测（浏览器插件视口固定，以 Playwright 双视口为准）。

## Design Consistency

v1 后空态范式统一；其余组件一致性良好。后续贡献者须延续「暖棕 + 玻璃 + 诗性文案」三要素，避免异质风格。

## AI Design Syndrome Check

无紫色渐变 / 无营销 hero / 无 bento / 无装饰 badge 堆砌 / 无随机 emoji；glass 与 glow 是 AGENTS 明示的产品身份而非模板堆砌 → **通过**。修复前唯一接近项是「巨型空态字」（展示级排版滥用），v1 已消除。

## Recommended Direction（下一轮）

1. 首启不可播曲目静默降级（P2-1，行为层）
2. 结合 docs/TODO-app-refactor.md 的 App.tsx 拆分时，顺带处理小窗布局（P2-3）
3. 建立对比度基线：全局清点 /25-/42 透明度文字，统一不低于 /45（先 settings 面板变量）
4. 空态范式组件化（诗性句+状态小字）推广到 OmeRadio/QueueDrawer 空态