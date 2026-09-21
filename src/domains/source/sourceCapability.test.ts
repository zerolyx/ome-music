import { describe, expect, it } from "vitest";

import {
  canResolvePlayableUrl,
  capabilitiesOf,
  describeSource,
  supports,
  type MusicSourceId,
} from "./sourceCapability";

/**
 * The capability table is a description of what the app does TODAY. If a
 * source gains a real capability, this test should be updated in the same
 * commit — that is the point of having it.
 */
describe("source capability table", () => {
  it("local files never resolve a remote playable URL", () => {
    expect(canResolvePlayableUrl("local")).toBe(false);
    expect(canResolvePlayableUrl("netease")).toBe(true);
    expect(canResolvePlayableUrl("bilibili")).toBe(true);
    expect(canResolvePlayableUrl("qqmusic")).toBe(true);
  });

  it("only Bilibili provides danmaku atmosphere", () => {
    const sources: MusicSourceId[] = ["local", "netease", "bilibili", "qqmusic"];
    expect(sources.filter((source) => supports(source, "danmaku"))).toEqual(["bilibili"]);
  });

  it("every remote source can be signed in to", () => {
    expect(supports("local", "login")).toBe(false);
    expect(supports("netease", "login")).toBe(true);
    expect(supports("bilibili", "login")).toBe(true);
    expect(supports("qqmusic", "login")).toBe(true);
  });

  it("quality selection is not offered where it does not exist", () => {
    expect(supports("bilibili", "quality")).toBe(false);
    expect(supports("netease", "quality")).toBe(true);
  });

  it("QQ Music stays described but experimental", () => {
    // Interface Ready, not finished: the descriptor exists so the boundary is
    // real, and the capability list stays honest about what actually works.
    const descriptor = describeSource("qqmusic");
    expect(descriptor.label).toBe("QQ音乐");
    expect(descriptor.capabilities.has("search")).toBe(true);
    expect(descriptor.capabilities.has("import")).toBe(false);
  });

  it("returns a copy so callers cannot mutate the table", () => {
    const first = capabilitiesOf("netease");
    (first as Set<string>).add("danmaku");
    expect(supports("netease", "danmaku")).toBe(false);
  });
});
