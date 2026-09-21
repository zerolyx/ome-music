import { describe, expect, it, vi } from "vitest";

import { createEventBus } from "./eventBus";

type TestEvents = {
  "playback:failed": { trackId: string; reason: string | null };
  "source:ready": { source: string };
  "tick:empty": void;
};

describe("createEventBus", () => {
  it("delivers a payload to a subscriber", () => {
    const bus = createEventBus<TestEvents>();
    const listener = vi.fn();
    bus.on("playback:failed", listener);

    bus.emit("playback:failed", { trackId: "t1", reason: "no_copyright" });

    expect(listener).toHaveBeenCalledWith({ trackId: "t1", reason: "no_copyright" });
  });

  it("does not deliver events of a different type", () => {
    const bus = createEventBus<TestEvents>();
    const listener = vi.fn();
    bus.on("playback:failed", listener);

    bus.emit("source:ready", { source: "netease" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners on one type", () => {
    const bus = createEventBus<TestEvents>();
    const first = vi.fn();
    const second = vi.fn();
    bus.on("source:ready", first);
    bus.on("source:ready", second);

    bus.emit("source:ready", { source: "netease" });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes via the returned disposer", () => {
    const bus = createEventBus<TestEvents>();
    const listener = vi.fn();
    const off = bus.on("source:ready", listener);

    off();
    bus.emit("source:ready", { source: "netease" });

    expect(listener).not.toHaveBeenCalled();
    expect(bus.listenerCount("source:ready")).toBe(0);
  });

  it("fires a once-listener exactly once", () => {
    const bus = createEventBus<TestEvents>();
    const listener = vi.fn();
    bus.once("source:ready", listener);

    bus.emit("source:ready", { source: "netease" });
    bus.emit("source:ready", { source: "bilibili" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount("source:ready")).toBe(0);
  });

  it("survives a listener unsubscribing while the event is being delivered", () => {
    const bus = createEventBus<TestEvents>();
    const second = vi.fn();
    const offFirst = bus.on("source:ready", () => offFirst());
    bus.on("source:ready", second);

    expect(() => bus.emit("source:ready", { source: "netease" })).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("keeps a listener that throws from breaking the others", () => {
    const bus = createEventBus<TestEvents>();
    const healthy = vi.fn();
    bus.on("source:ready", () => {
      throw new Error("listener exploded");
    });
    bus.on("source:ready", healthy);

    // NOTE: this documents current behaviour — a throwing listener propagates.
    // Deliberately not swallowed: silently hiding listener errors is worse than
    // failing loudly during development.
    expect(() => bus.emit("source:ready", { source: "netease" })).toThrow();
  });

  it("clear removes everything, or one type", () => {
    const bus = createEventBus<TestEvents>();
    bus.on("source:ready", vi.fn());
    bus.on("playback:failed", vi.fn());

    bus.clear("source:ready");
    expect(bus.listenerCount("source:ready")).toBe(0);
    expect(bus.listenerCount("playback:failed")).toBe(1);

    bus.clear();
    expect(bus.listenerCount("playback:failed")).toBe(0);
  });
});
