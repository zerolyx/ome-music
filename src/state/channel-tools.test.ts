import { afterEach, describe, expect, it } from "vitest";
import {
  channelBalanceGains,
  channelMatrixGains,
  activeChannelToolsCompareSlot,
  applyChannelToolsCompareSlot,
  applyChannelToolsPreset,
  channelToolsComparisonSlots,
  channelToolsPresets,
  channelToolsSettings,
  createChannelToolsPreset,
  createChannelToolsAudioChain,
  deleteChannelToolsPreset,
  DEFAULT_CHANNEL_TOOLS_SETTINGS,
  patchChannelToolsSettings,
  renameChannelToolsPreset,
  restoreChannelToolsProfiles,
  resetChannelToolsSettings,
  saveCurrentChannelToolsToCompareSlot,
  updateChannelToolsPreset,
  type ChannelToolsSettings,
} from "./channel-tools";

const settings = (overrides: Partial<ChannelToolsSettings> = {}): ChannelToolsSettings => ({
  ...structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS),
  ...overrides,
});

const fakeAudioParam = () => ({
  value: 0,
  cancelAndHoldAtTime() {},
  linearRampToValueAtTime(value: number) { this.value = value; },
});

const fakeAudioNode = () => ({
  channelCount: 2,
  channelCountMode: "max",
  channelInterpretation: "speakers",
  gain: fakeAudioParam(),
  delayTime: fakeAudioParam(),
  frequency: { value: 0 },
  Q: { value: 0 },
  type: "lowpass",
  connections: [] as Array<{ target: unknown; output?: number; input?: number }>,
  connect(target: unknown, output?: number, input?: number) { this.connections.push({ target, output, input }); },
});

const fakeAudioContext = () => ({
  currentTime: 0,
  createGain: fakeAudioNode,
  createChannelSplitter: fakeAudioNode,
  createChannelMerger: fakeAudioNode,
  createBiquadFilter: fakeAudioNode,
  createDelay: fakeAudioNode,
});

afterEach(() => {
  resetChannelToolsSettings();
  restoreChannelToolsProfiles([], { A: null, B: null });
  localStorage.clear();
});

describe("stereo channel tools", () => {
  it("keeps a centered signal at unity with the equal-power curve", () => {
    expect(channelBalanceGains(0, true)).toEqual([1, 1]);
    expect(channelBalanceGains(-1, true)[0]).toBeCloseTo(1);
    expect(channelBalanceGains(-1, true)[1]).toBe(0);
    expect(channelBalanceGains(1, false)).toEqual([0, 1]);
  });

  it("routes left and right channels independently by default", () => {
    expect(channelMatrixGains(settings({ enabled: true })).outputs).toEqual([[1, 0], [0, 1]]);
  });

  it("swaps stereo outputs without changing channel polarity", () => {
    expect(channelMatrixGains(settings({ enabled: true, swapLeftRight: true })).outputs).toEqual([[0, 1], [1, 0]]);
  });

  it("mixes mono-sum from both inputs to both outputs without adding 6 dB", () => {
    const matrix = channelMatrixGains(settings({ enabled: true, monoMode: "sum" })).outputs;
    expect(matrix).toEqual([[0.5, 0.5], [0.5, 0.5]]);
  });

  it("duplicates the selected source channel to both speakers", () => {
    expect(channelMatrixGains(settings({ enabled: true, monoMode: "left" })).outputs).toEqual([[1, 0], [1, 0]]);
    expect(channelMatrixGains(settings({ enabled: true, monoMode: "right" })).outputs).toEqual([[0, 1], [0, 1]]);
  });

  it("lets the left/right gain and balance adjust the routed outputs", () => {
    const matrix = channelMatrixGains(settings({ enabled: true, balance: 0.5, constantPower: false, rightGainDb: -6 })).outputs;
    expect(matrix[0][0]).toBeCloseTo(0.5);
    expect(matrix[1][1]).toBeCloseTo(10 ** (-6 / 20));
  });

  it("fully bypasses all channel settings when disabled", () => {
    expect(channelMatrixGains(settings({ monoMode: "sum", swapLeftRight: true, balance: 1, leftGainDb: 6 })).outputs)
      .toEqual([[1, 0], [0, 1]]);
  });

  it("builds an upmixed, muted DSP branch and crossfades it in when enabled", () => {
    const context = fakeAudioContext();
    const chain = createChannelToolsAudioChain(context as unknown as AudioContext);
    expect(chain.input.channelCount).toBe(2);
    expect(chain.input.channelCountMode).toBe("explicit");
    expect(chain.input.channelInterpretation).toBe("speakers");
    expect(chain.bypass.gain.value).toBe(1);
    expect(chain.input.gain.value).toBe(0);
    expect(chain.output.gain.value).toBe(0);

    patchChannelToolsSettings({ enabled: true, monoMode: "sum", leftDelayMs: 3 });
    expect(chain.bypass.gain.value).toBe(0);
    expect(chain.input.gain.value).toBe(1);
    expect(chain.output.gain.value).toBe(1);
    expect(chain.paths[0].delay.delayTime.value).toBeCloseTo(0.003);
    expect(chain.routes[0][0].gain.value).toBe(0.5);
    expect(chain.routes[0][1].gain.value).toBe(0.5);
    expect(chain.routes[1][0].gain.value).toBe(0.5);
    expect(chain.routes[1][1].gain.value).toBe(0.5);
  });

  it("saves, applies, renames, updates, and removes named local presets", () => {
    patchChannelToolsSettings({ enabled: true, balance: 0.35 });
    const id = createChannelToolsPreset("  夜间耳机  ");
    expect(id).toMatch(/^ctp-/);
    expect(createChannelToolsPreset("夜间耳机")).toBeNull();

    patchChannelToolsSettings({ balance: -0.4 });
    expect(applyChannelToolsPreset(id!)).toBe(true);
    expect(channelToolsSettings.value.balance).toBe(0.35);

    patchChannelToolsSettings({ rightGainDb: -3 });
    expect(updateChannelToolsPreset(id!)).toBe(true);
    expect(renameChannelToolsPreset(id!, "耳机夜听")).toBe(true);
    expect(channelToolsPresets.value[0].name).toBe("耳机夜听");
    expect(channelToolsPresets.value[0].settings.rightGainDb).toBe(-3);
    expect(deleteChannelToolsPreset(id!)).toBe(true);
    expect(channelToolsPresets.value).toEqual([]);
  });

  it("keeps A/B snapshots and switches the live settings immediately", () => {
    patchChannelToolsSettings({ enabled: true, balance: -0.2 });
    saveCurrentChannelToolsToCompareSlot("A");
    patchChannelToolsSettings({ balance: 0.6, rightGainDb: -2 });
    saveCurrentChannelToolsToCompareSlot("B");

    expect(channelToolsComparisonSlots.value.A?.balance).toBe(-0.2);
    expect(channelToolsComparisonSlots.value.B?.balance).toBe(0.6);
    expect(applyChannelToolsCompareSlot("A")).toBe(true);
    expect(activeChannelToolsCompareSlot.value).toBe("A");
    expect(channelToolsSettings.value.balance).toBe(-0.2);
    expect(applyChannelToolsCompareSlot("B")).toBe(true);
    expect(activeChannelToolsCompareSlot.value).toBe("B");
    expect(channelToolsSettings.value.balance).toBe(0.6);
    expect(channelToolsSettings.value.rightGainDb).toBe(-2);

    patchChannelToolsSettings({ balance: 0.1 });
    expect(activeChannelToolsCompareSlot.value).toBeNull();
  });

  it("validates and restores complete preset profiles atomically", () => {
    const id = createChannelToolsPreset("客厅");
    const presets = structuredClone(channelToolsPresets.value);
    const slots = { A: null, B: structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS) };
    expect(restoreChannelToolsProfiles(presets, slots)).toBe(true);
    expect(channelToolsComparisonSlots.value).toEqual(slots);

    const invalid = [{ ...presets[0], settings: { ...presets[0].settings, balance: 3 } }];
    expect(restoreChannelToolsProfiles(invalid, { A: null, B: null })).toBe(false);
    expect(channelToolsPresets.value[0].id).toBe(id);
  });
});
