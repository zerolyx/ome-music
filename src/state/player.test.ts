import { describe, expect, it } from "vitest";
import { advance, endEventType } from "./player";

describe("endEventType", () => {
  it("播过 90% 以上算 completed", () => {
    expect(endEventType(200, 220)).toBe("completed");
    expect(endEventType(198, 220)).toBe("skip");
  });
  it("时长未知时不判 completed", () => {
    expect(endEventType(100, 0)).toBe("skip");
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
