import { describe, expect, it } from "vitest";
import {
  consumeTrackEndSleep,
  formatSleepRemaining,
  setSleepAtTrackEnd,
  setSleepTimer,
  sleepEndAt,
  sleepMode,
  cancelSleepTimer,
} from "./sleeptimer";

describe("formatSleepRemaining", () => {
  it("分:秒格式，向上取整", () => {
    expect(formatSleepRemaining(60_000, 0)).toBe("1:00");
    expect(formatSleepRemaining(61_000, 0)).toBe("1:01");
    expect(formatSleepRemaining(65_500, 0)).toBe("1:06"); // 65.5s → 66s
    expect(formatSleepRemaining(600_000, 0)).toBe("10:00");
  });

  it("到点钳在 0:00，不倒计时成负数", () => {
    expect(formatSleepRemaining(60_000, 120_000)).toBe("0:00");
  });
});

describe("睡眠定时状态机", () => {
  it("setSleepTimer 设置模式与到点时刻，cancel 复位", () => {
    setSleepTimer(15, 1_000);
    expect(sleepMode.value).toBe("timer");
    expect(sleepEndAt.value).toBe(1_000 + 15 * 60_000);
    cancelSleepTimer();
    expect(sleepMode.value).toBeNull();
    expect(sleepEndAt.value).toBeNull();
  });

  it("非法分钟数直接忽略", () => {
    cancelSleepTimer();
    setSleepTimer(0);
    setSleepTimer(-5);
    setSleepTimer(Number.NaN);
    expect(sleepMode.value).toBeNull();
  });

  it("播完当前：consume 一次后复位，未命中返回 false", () => {
    setSleepAtTrackEnd();
    expect(sleepMode.value).toBe("track");
    expect(consumeTrackEndSleep()).toBe(true);
    expect(sleepMode.value).toBeNull();
    // 已复位：再次 consume 不命中
    expect(consumeTrackEndSleep()).toBe(false);
  });

  it("定时器模式不响应 consume（只认 track 模式）", () => {
    setSleepTimer(30);
    expect(consumeTrackEndSleep()).toBe(false);
    cancelSleepTimer();
  });
});
