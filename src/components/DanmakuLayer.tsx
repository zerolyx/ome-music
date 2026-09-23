/* ============ 弹幕氛围层（Plan 4 Task 2）============
 * 仅 B站曲目且开关开启时渲染：右缘进场向左漂浮的淡色弹幕。
 * 纯装饰（aria-hidden + pointer-events none），不承载任何信息。
 */

import { useMemo } from "preact/hooks";
import { computed } from "@preact/signals";
import type { DanmakuItemDto } from "../lib/api";
import { currentTrack } from "../state/player";
import { danmakuEnabled, items } from "../state/danmaku";

/** 同屏最多漂浮条数（ items 上限 120，这里只取一部分错落展示） */
export const DANMAKU_VISIBLE = 25;

/** 纯逻辑：弹幕颜色整数（0xRRGGBB）→ css rgb()，越界回退白色 */
export function danmakuColor(color: number): string {
  const safe =
    Number.isFinite(color) && color >= 0 ? Math.min(0xffffff, Math.floor(color)) : 0xffffff;
  return `rgb(${(safe >> 16) & 0xff}, ${(safe >> 8) & 0xff}, ${safe & 0xff})`;
}

export interface FloatParams {
  text: string;
  color: string;
  /** 顶部位置（%） */
  top: number;
  /** 单程漂移时长（秒） */
  duration: number;
  /** 负延迟：进场即在画面中段，互相错开 */
  delay: number;
}

/** 纯逻辑：为一批弹幕生成随机漂浮参数（换曲重挂载时会重新洗牌） */
export function buildFloats(list: DanmakuItemDto[]): FloatParams[] {
  return list.slice(0, DANMAKU_VISIBLE).map((item) => {
    const duration = 9 + Math.random() * 7; // 9s ~ 16s
    return {
      text: item.text,
      color: danmakuColor(item.color),
      top: 5 + Math.random() * 65, // 5% ~ 70%
      duration,
      delay: -Math.random() * duration,
    };
  });
}

const visible = computed(
  () => danmakuEnabled.value && items.value.length > 0 && currentTrack.value?.source === "bilibili"
);

export function DanmakuLayer() {
  const list = items.value;
  const track = currentTrack.value;
  const floats = useMemo(
    // 依赖曲 id 与 items：换曲 / 重新加载时重新洗牌；容器 key 强制 remount 重启动画
    () => (visible.value ? buildFloats(list) : []),
    [visible.value, track?.id ?? "", list]
  );
  if (!visible.value) return null;
  return (
    <div class="danmaku-layer" key={track?.id ?? ""} aria-hidden="true">
      {floats.map((float, index) => (
        <span
          key={index}
          class="danmaku-item"
          style={{
            top: `${float.top.toFixed(1)}%`,
            color: float.color,
            animation: `danmaku-float ${float.duration.toFixed(2)}s linear ${float.delay.toFixed(2)}s infinite`,
          }}
        >
          {float.text}
        </span>
      ))}
    </div>
  );
}
