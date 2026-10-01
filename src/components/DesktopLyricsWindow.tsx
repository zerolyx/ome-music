import { useEffect, useRef, useState } from "preact/hooks";
import type { CSSProperties } from "preact";
import { emit, listen } from "@tauri-apps/api/event";
import {
  availableMonitors,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { Icon } from "./Icon";
import { isTauriRuntime } from "../lib/api";
import {
  cycleDeskSize,
  deskLineProgress,
  deskPositionAt,
  deskSizeFor,
  DESK_LYRIC_PALETTES,
  DESK_CLOSE_EVENT,
  DESK_HELLO_EVENT,
  DESK_LOCK_EVENT,
  DESK_LYRIC_EVENT,
  readDeskRect,
  readDeskLyricPalette,
  readDeskSizeId,
  readDeskVertical,
  saveDeskRect,
  saveDeskLyricPalette,
  saveDeskSizeId,
  saveDeskVertical,
  type DeskLyricSnapshot,
  type DeskSizeId,
  type DeskSnapshotWord,
} from "../state/desklyrics";

/** 逐字行（yrc）：未唱暗、正在唱亮，与歌词舞台同语义 */
function DlxWords({ words, pos }: { words: DeskSnapshotWord[]; pos: number }) {
  return (
    <>
      {words.map((word, i) => {
        const state = pos >= word.end ? "sung" : pos >= word.start ? "singing" : "next";
        return (
          <span key={i} class={`dlx-word is-${state}`}>
            {word.text}
          </span>
        );
      })}
    </>
  );
}

/** 整行扫光（lrc 无字级时间轴，按行进度估算） */
function DlxFill({ text, progress }: { text: string; progress: number }) {
  return (
    <>
      <span class="dlx-base">{text}</span>
      <span class="dlx-lit" style={{ width: `${Math.round(progress * 10000) / 100}%` }} aria-hidden="true">
        {text}
      </span>
    </>
  );
}

/**
 * 桌面歌词独立窗口（label=desklyrics）。
 * 整窗深色玻璃胶囊：任何桌面上都可读；hover 浮现字号/关闭，平时零干扰。
 * 整条可拖动；不抢焦点；位置/字号自持久化；显示器拓扑变化时回中自愈。
 */
export function DesktopLyricsWindow() {
  const [snap, setSnap] = useState<DeskLyricSnapshot | null>(null);
  const [pos, setPos] = useState(0);
  const [hover, setHover] = useState(false);
  const [sizeId, setSizeId] = useState<DeskSizeId>(() => readDeskSizeId());
  const [vertical, setVertical] = useState<boolean>(() => readDeskVertical());
  const [paletteId, setPaletteId] = useState(() => readDeskLyricPalette());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const snapRef = useRef<DeskLyricSnapshot | null>(null);
  snapRef.current = snap;

  // 订阅主窗快照 + 就绪握手（主窗立即补推当前帧）
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let un: (() => void) | undefined;
    void listen<DeskLyricSnapshot>(DESK_LYRIC_EVENT, (event) => {
      setSnap(event.payload);
    }).then((fn) => {
      un = fn;
    });
    void emit(DESK_HELLO_EVENT);
    return () => un?.();
  }, []);

  // 播放中逐帧本地插值；暂停时快照位置即真实位置
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const current = snapRef.current;
      if (current) setPos(deskPositionAt(current, Date.now()));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 开窗序列：恢复上次位置 → 屏外自愈（显示器拓扑变化回中）→ 定位就绪再显示
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const win = getCurrentWindow();
    void (async () => {
      const rect = readDeskRect();
      if (rect) {
        await win.setPosition(new PhysicalPosition(rect.x, rect.y)).catch(() => undefined);
      }
      try {
        const [outer, monitors] = await Promise.all([win.outerPosition(), availableMonitors()]);
        const inside = monitors.some(
          (m) =>
            outer.x >= m.position.x - 40 &&
            outer.y >= m.position.y - 40 &&
            outer.x < m.position.x + m.size.width - 80 &&
            outer.y < m.position.y + m.size.height - 40,
        );
        if (!inside) await win.center();
      } catch {
        /* 平台/权限差异：定位失败直接显示 */
      }
      await win.show().catch(() => undefined);
    })();
  }, []);

  // 拖动/缩放后记住位置（物理像素，防抖 400ms）
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const win = getCurrentWindow();
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void win
          .outerPosition()
          .then((p) => saveDeskRect({ x: p.x, y: p.y }))
          .catch(() => undefined);
      }, 400);
    };
    const moved = win.onMoved(schedule);
    const resized = win.onResized(schedule);
    return () => {
      void moved.then((fn) => fn());
      void resized.then((fn) => fn());
      window.clearTimeout(timer);
    };
  }, []);

  const applySize = (next: DeskSizeId) => {
    setSizeId(next);
    saveDeskSizeId(next);
    resizeWindow(next, vertical);
  };

  const applyVertical = (next: boolean) => {
    setVertical(next);
    saveDeskVertical(next);
    resizeWindow(sizeId, next);
  };

  const resizeWindow = (id: DeskSizeId, isVertical: boolean) => {
    if (!isTauriRuntime()) return;
    const size = deskSizeFor(id, isVertical);
    void getCurrentWindow()
      .setSize(new LogicalSize(size.width, size.height))
      .catch(() => undefined);
  };

  const track = snap?.track ?? null;
  const line = snap?.line ?? null;
  const palette = DESK_LYRIC_PALETTES.find((item) => item.id === paletteId) ?? DESK_LYRIC_PALETTES[0];
  const paletteStyle = palette.gradient
    ? ({ "--dlx-lyric-gradient": palette.gradient } as CSSProperties)
    : undefined;
  const applyPalette = (next: typeof palette.id) => {
    setPaletteId(next);
    saveDeskLyricPalette(next);
    setPaletteOpen(false);
    paletteTriggerRef.current?.focus();
  };
  const renderPaletteOptions = (verticalMode: boolean) => (
    <div
      id="dlx-palette-options"
      class={`dlx-palette-options ${verticalMode ? "is-vertical" : ""}`}
      role="group"
      aria-label="选择歌词色彩"
    >
      {DESK_LYRIC_PALETTES.map((option) => (
        <button
          key={option.id}
          type="button"
          class="dlx-palette-option"
          style={{ background: option.swatch }}
          aria-label={option.label}
          aria-pressed={palette.id === option.id}
          title={option.label}
          onClick={() => applyPalette(option.id)}
        />
      ))}
    </div>
  );
  const emptyText = snap?.pending
    ? "歌词加载中…"
    : track
      ? "暂无歌词，尽情聆听"
      : "等待播放…";
  const subtitles = line && snap && snap.subtitles.length > 0
    ? snap.subtitles
    : line && snap?.next
      ? [{ kind: "translation" as const, text: snap.next }]
      : !line
        ? [{ kind: "translation" as const, text: emptyText }]
        : [];

  return (
    <div
      class="dlx"
      data-size={sizeId}
      data-palette={palette.id}
      data-vertical={vertical || undefined}
      style={paletteStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPaletteOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && paletteOpen) {
          event.preventDefault();
          event.stopPropagation();
          setPaletteOpen(false);
          paletteTriggerRef.current?.focus();
        }
      }}
    >
      <div class="dlx-glass">
        {track && (
          <p class="dlx-kicker" data-tauri-drag-region>
            {track.title} · {track.artist}
          </p>
        )}
        <p class="dlx-line" data-tauri-drag-region key={line ? `${line.start}|${line.text}` : "idle"}>
          {line && snap?.words ? (
            <DlxWords words={snap.words} pos={pos} />
          ) : line && snap?.plain ? (
            <span class="dlx-plain-line">{line.text}</span>
          ) : line ? (
            <DlxFill text={line.text} progress={deskLineProgress(line, pos)} />
          ) : (
            <span class="dlx-idle">…</span>
          )}
        </p>
        {subtitles.map(({ kind, text }) => (
          <p key={kind} class={`dlx-sub ${kind === "romanization" ? "dlx-sub-romanization" : ""}`} data-tauri-drag-region>
            {text}
          </p>
        ))}
        <div class={`dlx-tools ${hover || paletteOpen ? "is-on" : ""}`}>
          <button
            class="dlx-btn dlx-btn-text"
            onClick={() => applySize(cycleDeskSize(sizeId))}
            aria-label={`切换字号（当前${deskSizeFor(sizeId, vertical).label}）`}
          >
            {deskSizeFor(sizeId, vertical).label}
          </button>
          <button
            class="dlx-btn dlx-btn-text"
            onClick={() => applyVertical(!vertical)}
            aria-label={vertical ? "切换为横排" : "切换为竖排"}
            title={vertical ? "横排" : "竖排"}
          >
            {vertical ? "横" : "竖"}
          </button>
          <div class="dlx-palette-control">
            <button
              ref={paletteTriggerRef}
              type="button"
              class="dlx-btn dlx-btn-text dlx-palette-trigger"
              onClick={() => setPaletteOpen((open) => !open)}
              aria-label={`歌词色彩：${palette.label}`}
              aria-expanded={paletteOpen}
              aria-controls="dlx-palette-options"
              title={`歌词色彩：${palette.label}`}
            >
              <span class="dlx-palette-current" style={{ background: palette.swatch }} aria-hidden="true" />
              <span class="dlx-palette-label">色</span>
            </button>
            {paletteOpen && !vertical && renderPaletteOptions(false)}
          </div>
          <button
            class="dlx-btn"
            onClick={() => void emit(DESK_LOCK_EVENT)}
            aria-label="锁定桌面歌词（在主窗设置中解锁）"
            title="锁定（在主窗设置中解锁）"
          >
            <Icon name="lock" size={13} />
          </button>
          <button class="dlx-btn" onClick={() => void emit(DESK_CLOSE_EVENT)} aria-label="关闭桌面歌词">
            <Icon name="close" size={13} />
          </button>
        </div>
        {paletteOpen && vertical && renderPaletteOptions(true)}
      </div>
    </div>
  );
}
