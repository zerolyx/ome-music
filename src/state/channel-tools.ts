import { signal } from "@preact/signals";

export const CHANNEL_TOOL_BANDS = ["low", "mid", "high"] as const;
export type ChannelToolBand = (typeof CHANNEL_TOOL_BANDS)[number];
export type ChannelMonoMode = "off" | "sum" | "left" | "right";

export interface ChannelBandGains {
  leftGainDb: number;
  rightGainDb: number;
}

export interface ChannelToolsSettings {
  enabled: boolean;
  balance: number;
  leftGainDb: number;
  rightGainDb: number;
  bandGains: Record<ChannelToolBand, ChannelBandGains>;
  leftDelayMs: number;
  rightDelayMs: number;
  swapLeftRight: boolean;
  monoMode: ChannelMonoMode;
  invertLeft: boolean;
  invertRight: boolean;
  constantPower: boolean;
}

const STORAGE_KEY = "ome.channel-tools.settings";
const PRESETS_STORAGE_KEY = "ome.channel-tools.presets";
const COMPARISON_STORAGE_KEY = "ome.channel-tools.comparison";
export const MAX_CHANNEL_TOOL_PRESETS = 24;
export const MAX_CHANNEL_TOOL_PRESET_NAME_LENGTH = 24;

export const CHANNEL_BALANCE_MIN = -1;
export const CHANNEL_BALANCE_MAX = 1;
export const CHANNEL_GAIN_MIN_DB = -12;
export const CHANNEL_GAIN_MAX_DB = 6;
export const CHANNEL_BAND_MIN_DB = -6;
export const CHANNEL_BAND_MAX_DB = 3;
export const CHANNEL_DELAY_MIN_MS = 0;
export const CHANNEL_DELAY_MAX_MS = 10;

export const DEFAULT_CHANNEL_TOOLS_SETTINGS: Readonly<ChannelToolsSettings> = {
  enabled: false,
  balance: 0,
  leftGainDb: 0,
  rightGainDb: 0,
  bandGains: {
    low: { leftGainDb: 0, rightGainDb: 0 },
    mid: { leftGainDb: 0, rightGainDb: 0 },
    high: { leftGainDb: 0, rightGainDb: 0 },
  },
  leftDelayMs: 0,
  rightDelayMs: 0,
  swapLeftRight: false,
  monoMode: "off",
  invertLeft: false,
  invertRight: false,
  constantPower: true,
};

function clamp(value: number, min: number, max: number, precision: number): number {
  const finiteValue = Number.isFinite(value) ? value : 0;
  const factor = 10 ** precision;
  return Math.min(max, Math.max(min, Math.round(finiteValue * factor) / factor));
}

export function clampChannelBalance(value: number): number {
  return clamp(value, CHANNEL_BALANCE_MIN, CHANNEL_BALANCE_MAX, 3);
}

export function clampChannelGainDb(value: number): number {
  return clamp(value, CHANNEL_GAIN_MIN_DB, CHANNEL_GAIN_MAX_DB, 1);
}

export function clampChannelBandGainDb(value: number): number {
  return clamp(value, CHANNEL_BAND_MIN_DB, CHANNEL_BAND_MAX_DB, 1);
}

export function clampChannelDelayMs(value: number): number {
  return clamp(value, CHANNEL_DELAY_MIN_MS, CHANNEL_DELAY_MAX_MS, 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSettings(value: unknown): ChannelToolsSettings {
  const source = isRecord(value) ? value : {};
  const bandSource = isRecord(source.bandGains) ? source.bandGains : {};
  const bands = Object.fromEntries(CHANNEL_TOOL_BANDS.map((band) => {
    const values = isRecord(bandSource[band]) ? bandSource[band] : {};
    return [band, {
      leftGainDb: clampChannelBandGainDb(Number(values.leftGainDb ?? 0)),
      rightGainDb: clampChannelBandGainDb(Number(values.rightGainDb ?? 0)),
    }];
  })) as ChannelToolsSettings["bandGains"];
  const monoMode = source.monoMode === "sum" || source.monoMode === "left" || source.monoMode === "right"
    ? source.monoMode
    : "off";

  return {
    enabled: source.enabled === true,
    balance: clampChannelBalance(Number(source.balance ?? 0)),
    leftGainDb: clampChannelGainDb(Number(source.leftGainDb ?? 0)),
    rightGainDb: clampChannelGainDb(Number(source.rightGainDb ?? 0)),
    bandGains: bands,
    leftDelayMs: clampChannelDelayMs(Number(source.leftDelayMs ?? 0)),
    rightDelayMs: clampChannelDelayMs(Number(source.rightDelayMs ?? 0)),
    swapLeftRight: source.swapLeftRight === true,
    monoMode,
    invertLeft: source.invertLeft === true,
    invertRight: source.invertRight === true,
    constantPower: source.constantPower !== false,
  };
}

function loadSettings(): ChannelToolsSettings {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    return serialized ? normalizeSettings(JSON.parse(serialized) as unknown) : normalizeSettings(DEFAULT_CHANNEL_TOOLS_SETTINGS);
  } catch {
    return normalizeSettings(DEFAULT_CHANNEL_TOOLS_SETTINGS);
  }
}

export const channelToolsSettings = signal<ChannelToolsSettings>(loadSettings());

export interface ChannelToolsPreset {
  id: string;
  name: string;
  settings: ChannelToolsSettings;
}

export type ChannelToolsCompareSlot = "A" | "B";
export interface ChannelToolsComparisonSlots {
  A: ChannelToolsSettings | null;
  B: ChannelToolsSettings | null;
}

const EMPTY_COMPARISON_SLOTS: ChannelToolsComparisonSlots = { A: null, B: null };

function loadPresets(): ChannelToolsPreset[] {
  try {
    const serialized = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!serialized) return [];
    const parsed: unknown = JSON.parse(serialized);
    return isValidChannelToolsPresetList(parsed) ? structuredClone(parsed) : [];
  } catch {
    return [];
  }
}

function loadComparisonSlots(): ChannelToolsComparisonSlots {
  try {
    const serialized = localStorage.getItem(COMPARISON_STORAGE_KEY);
    if (!serialized) return structuredClone(EMPTY_COMPARISON_SLOTS);
    const parsed: unknown = JSON.parse(serialized);
    return isValidChannelToolsComparisonSlots(parsed) ? structuredClone(parsed) : structuredClone(EMPTY_COMPARISON_SLOTS);
  } catch {
    return structuredClone(EMPTY_COMPARISON_SLOTS);
  }
}

export const channelToolsPresets = signal<ChannelToolsPreset[]>(loadPresets());
export const channelToolsComparisonSlots = signal<ChannelToolsComparisonSlots>(loadComparisonSlots());
export const activeChannelToolsCompareSlot = signal<ChannelToolsCompareSlot | null>(null);

export const CHANNEL_TOOLS_BUILTIN_PRESETS: ReadonlyArray<{
  id: string;
  name: string;
  settings: ChannelToolsSettings;
}> = [
  { id: "stereo", name: "标准立体声", settings: { ...structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS), enabled: true } },
  { id: "mono-sum", name: "单声道混合", settings: { ...structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS), enabled: true, monoMode: "sum" } },
  { id: "monitor-left", name: "只听左声道", settings: { ...structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS), enabled: true, monoMode: "left" } },
  { id: "monitor-right", name: "只听右声道", settings: { ...structuredClone(DEFAULT_CHANNEL_TOOLS_SETTINGS), enabled: true, monoMode: "right" } },
];

export interface ChannelMatrixGains {
  /** Output rows, input columns: [left output, right output] × [left input, right input]. */
  outputs: [[number, number], [number, number]];
}

/** ECHO DSP's equal-power balance curve, with a unity-compensated center position. */
export function channelBalanceGains(balance: number, constantPower: boolean): [number, number] {
  const safeBalance = clampChannelBalance(balance);
  if (!constantPower) {
    return [
      safeBalance > 0 ? 1 - safeBalance : 1,
      safeBalance < 0 ? 1 + safeBalance : 1,
    ];
  }

  const pan = (safeBalance + 1) * Math.PI * 0.25;
  const compensation = Math.sqrt(2);
  return [Math.min(1, Math.cos(pan) * compensation), Math.min(1, Math.sin(pan) * compensation)];
}

/** Build the stereo routing matrix after per-channel EQ, delay, and phase processing. */
export function channelMatrixGains(settings: ChannelToolsSettings): ChannelMatrixGains {
  const active = settings.enabled ? settings : DEFAULT_CHANNEL_TOOLS_SETTINGS;
  const [leftBalance, rightBalance] = channelBalanceGains(active.balance, active.constantPower);
  const leftOutput = leftBalance * (10 ** (clampChannelGainDb(active.leftGainDb) / 20));
  const rightOutput = rightBalance * (10 ** (clampChannelGainDb(active.rightGainDb) / 20));

  if (active.monoMode === "sum") {
    return { outputs: [[leftOutput * 0.5, leftOutput * 0.5], [rightOutput * 0.5, rightOutput * 0.5]] };
  }
  if (active.monoMode === "left") {
    return { outputs: [[leftOutput, 0], [leftOutput, 0]] };
  }
  if (active.monoMode === "right") {
    return { outputs: [[0, rightOutput], [0, rightOutput]] };
  }
  if (active.swapLeftRight) {
    return { outputs: [[0, rightOutput], [leftOutput, 0]] };
  }
  return { outputs: [[leftOutput, 0], [0, rightOutput]] };
}

interface ChannelPath {
  filters: BiquadFilterNode[];
  delay: DelayNode;
  polarity: GainNode;
}

export interface ChannelToolsAudioChain {
  input: GainNode;
  output: GainNode;
  bypass: GainNode;
  context: AudioContext;
  paths: [ChannelPath, ChannelPath];
  routes: [[GainNode, GainNode], [GainNode, GainNode]];
}

let activeChain: ChannelToolsAudioChain | null = null;

function setSmoothValue(param: AudioParam, value: number, context: AudioContext): void {
  try {
    const now = context.currentTime;
    param.cancelAndHoldAtTime(now);
    param.linearRampToValueAtTime(value, now + 0.02);
  } catch {
    param.value = value;
  }
}

function applySettings(): void {
  const chain = activeChain;
  if (!chain) return;

  const settings = channelToolsSettings.value;
  const active = settings.enabled ? settings : DEFAULT_CHANNEL_TOOLS_SETTINGS;
  const filterFrequencies: Record<ChannelToolBand, number> = { low: 140, mid: 1200, high: 8000 };
  const filterTypes: Record<ChannelToolBand, BiquadFilterType> = {
    low: "lowshelf",
    mid: "peaking",
    high: "highshelf",
  };

  for (const side of [0, 1] as const) {
    const path = chain.paths[side];
    CHANNEL_TOOL_BANDS.forEach((band, index) => {
      const filter = path.filters[index];
      filter.type = filterTypes[band];
      filter.frequency.value = filterFrequencies[band];
      if (band === "mid") filter.Q.value = 0.9;
      setSmoothValue(filter.gain, active.bandGains[band][side === 0 ? "leftGainDb" : "rightGainDb"], chain.context);
    });
    setSmoothValue(path.delay.delayTime, (side === 0 ? active.leftDelayMs : active.rightDelayMs) / 1000, chain.context);
    setSmoothValue(path.polarity.gain, (side === 0 ? active.invertLeft : active.invertRight) ? -1 : 1, chain.context);
  }

  const matrix = channelMatrixGains(settings).outputs;
  for (let input = 0; input < 2; input += 1) {
    for (let output = 0; output < 2; output += 1) {
      setSmoothValue(chain.routes[input as 0 | 1][output as 0 | 1].gain, matrix[output as 0 | 1][input as 0 | 1], chain.context);
    }
  }
  setSmoothValue(chain.input.gain, settings.enabled ? 1 : 0, chain.context);
  setSmoothValue(chain.output.gain, settings.enabled ? 1 : 0, chain.context);
  setSmoothValue(chain.bypass.gain, settings.enabled ? 0 : 1, chain.context);
}

/** Create a stereo WebAudio graph; explicit 2-channel upmix preserves mono tracks on both speakers. */
export function createChannelToolsAudioChain(context: AudioContext): ChannelToolsAudioChain {
  const input = context.createGain();
  input.channelCount = 2;
  input.channelCountMode = "explicit";
  input.channelInterpretation = "speakers";

  const splitter = context.createChannelSplitter(2);
  const merger = context.createChannelMerger(2);
  const output = context.createGain();
  const bypass = context.createGain();
  input.connect(splitter);

  const paths = ([0, 1] as const).map((side) => {
    const filters = CHANNEL_TOOL_BANDS.map((band) => {
      const filter = context.createBiquadFilter();
      filter.type = band === "low" ? "lowshelf" : band === "mid" ? "peaking" : "highshelf";
      filter.frequency.value = band === "low" ? 140 : band === "mid" ? 1200 : 8000;
      filter.Q.value = 0.9;
      filter.gain.value = 0;
      return filter;
    });
    for (let index = 0; index < filters.length - 1; index += 1) filters[index].connect(filters[index + 1]);
    const delay = context.createDelay(0.02);
    delay.delayTime.value = 0;
    const polarity = context.createGain();
    polarity.gain.value = 1;
    splitter.connect(filters[0], side);
    filters[filters.length - 1].connect(delay);
    delay.connect(polarity);
    return { filters, delay, polarity };
  }) as [ChannelPath, ChannelPath];

  const routes = ([0, 1] as const).map((inputIndex) => ([0, 1] as const).map((outputIndex) => {
    const route = context.createGain();
    route.gain.value = inputIndex === outputIndex ? 1 : 0;
    paths[inputIndex].polarity.connect(route);
    route.connect(merger, 0, outputIndex);
    return route;
  })) as [[GainNode, GainNode], [GainNode, GainNode]];

  merger.connect(output);
  const chain = { input, output, bypass, context, paths, routes };
  registerChannelToolsAudioChain(chain);
  return chain;
}

export function registerChannelToolsAudioChain(chain: ChannelToolsAudioChain): void {
  activeChain = chain;
  applySettings();
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channelToolsSettings.value));
  } catch {
    /* Private browsing or full storage must not interrupt playback. */
  }
}

export function setChannelToolsEnabled(enabled: boolean): void {
  channelToolsSettings.value = { ...channelToolsSettings.value, enabled };
  activeChannelToolsCompareSlot.value = null;
  applySettings();
  persist();
}

export function patchChannelToolsSettings(patch: Partial<ChannelToolsSettings>): void {
  const current = channelToolsSettings.value;
  channelToolsSettings.value = normalizeSettings({
    ...current,
    ...patch,
    bandGains: patch.bandGains ? { ...current.bandGains, ...patch.bandGains } : current.bandGains,
  });
  activeChannelToolsCompareSlot.value = null;
  applySettings();
  persist();
}

export function restoreChannelToolsSettings(settings: ChannelToolsSettings): boolean {
  if (!isValidChannelToolsSettings(settings)) return false;
  channelToolsSettings.value = normalizeSettings(settings);
  activeChannelToolsCompareSlot.value = null;
  applySettings();
  persist();
  return true;
}

export function resetChannelToolsSettings(): void {
  channelToolsSettings.value = normalizeSettings(DEFAULT_CHANNEL_TOOLS_SETTINGS);
  applySettings();
  persist();
}

const CHANNEL_KEYS = [
  "enabled", "balance", "leftGainDb", "rightGainDb", "bandGains", "leftDelayMs", "rightDelayMs",
  "swapLeftRight", "monoMode", "invertLeft", "invertRight", "constantPower",
];

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function isValidChannelToolsSettings(value: unknown): value is ChannelToolsSettings {
  if (!isRecord(value) || !hasExactKeys(value, CHANNEL_KEYS)) return false;
  if (
    typeof value.enabled !== "boolean" || typeof value.swapLeftRight !== "boolean" ||
    typeof value.invertLeft !== "boolean" || typeof value.invertRight !== "boolean" ||
    typeof value.constantPower !== "boolean" ||
    (value.monoMode !== "off" && value.monoMode !== "sum" && value.monoMode !== "left" && value.monoMode !== "right") ||
    typeof value.balance !== "number" || !Number.isFinite(value.balance) || value.balance < CHANNEL_BALANCE_MIN || value.balance > CHANNEL_BALANCE_MAX ||
    typeof value.leftGainDb !== "number" || !Number.isFinite(value.leftGainDb) || value.leftGainDb < CHANNEL_GAIN_MIN_DB || value.leftGainDb > CHANNEL_GAIN_MAX_DB ||
    typeof value.rightGainDb !== "number" || !Number.isFinite(value.rightGainDb) || value.rightGainDb < CHANNEL_GAIN_MIN_DB || value.rightGainDb > CHANNEL_GAIN_MAX_DB ||
    typeof value.leftDelayMs !== "number" || !Number.isFinite(value.leftDelayMs) || value.leftDelayMs < CHANNEL_DELAY_MIN_MS || value.leftDelayMs > CHANNEL_DELAY_MAX_MS ||
    typeof value.rightDelayMs !== "number" || !Number.isFinite(value.rightDelayMs) || value.rightDelayMs < CHANNEL_DELAY_MIN_MS || value.rightDelayMs > CHANNEL_DELAY_MAX_MS
  ) return false;
  const bandGains = value.bandGains;
  if (!isRecord(bandGains) || !hasExactKeys(bandGains, CHANNEL_TOOL_BANDS)) return false;
  return CHANNEL_TOOL_BANDS.every((band) => {
    const gains = bandGains[band];
    return isRecord(gains) && hasExactKeys(gains, ["leftGainDb", "rightGainDb"]) &&
      typeof gains.leftGainDb === "number" && Number.isFinite(gains.leftGainDb) && gains.leftGainDb >= CHANNEL_BAND_MIN_DB && gains.leftGainDb <= CHANNEL_BAND_MAX_DB &&
      typeof gains.rightGainDb === "number" && Number.isFinite(gains.rightGainDb) && gains.rightGainDb >= CHANNEL_BAND_MIN_DB && gains.rightGainDb <= CHANNEL_BAND_MAX_DB;
  });
}

function persistPresets(): void {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(channelToolsPresets.value));
  } catch {
    /* Preset persistence must not interrupt playback. */
  }
}

function persistComparisonSlots(): void {
  try {
    localStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(channelToolsComparisonSlots.value));
  } catch {
    /* A/B comparison persistence must not interrupt playback. */
  }
}

function createPresetId(): string {
  return `ctp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isValidChannelToolsPreset(value: unknown): value is ChannelToolsPreset {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "name", "settings"])) return false;
  return typeof value.id === "string" && /^[a-z\d-]{1,64}$/i.test(value.id) &&
    typeof value.name === "string" && value.name === value.name.trim() && value.name.length > 0 &&
    value.name.length <= MAX_CHANNEL_TOOL_PRESET_NAME_LENGTH &&
    isValidChannelToolsSettings(value.settings);
}

export function isValidChannelToolsPresetList(value: unknown): value is ChannelToolsPreset[] {
  if (!Array.isArray(value) || value.length > MAX_CHANNEL_TOOL_PRESETS || !value.every(isValidChannelToolsPreset)) return false;
  const ids = value.map((preset) => preset.id);
  const names = value.map((preset) => preset.name.trim().toLocaleLowerCase());
  return new Set(ids).size === ids.length && new Set(names).size === names.length;
}

export function isValidChannelToolsComparisonSlots(value: unknown): value is ChannelToolsComparisonSlots {
  return isRecord(value) && hasExactKeys(value, ["A", "B"]) &&
    (value.A === null || isValidChannelToolsSettings(value.A)) &&
    (value.B === null || isValidChannelToolsSettings(value.B));
}

export function createChannelToolsPreset(name: string): string | null {
  const normalizedName = name.trim();
  if (
    !normalizedName || normalizedName.length > MAX_CHANNEL_TOOL_PRESET_NAME_LENGTH ||
    channelToolsPresets.value.length >= MAX_CHANNEL_TOOL_PRESETS ||
    channelToolsPresets.value.some((preset) => preset.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())
  ) return null;
  const id = createPresetId();
  channelToolsPresets.value = [...channelToolsPresets.value, {
    id,
    name: normalizedName,
    settings: structuredClone(channelToolsSettings.value),
  }];
  persistPresets();
  return id;
}

export function updateChannelToolsPreset(id: string): boolean {
  const preset = channelToolsPresets.value.find((item) => item.id === id);
  if (!preset) return false;
  channelToolsPresets.value = channelToolsPresets.value.map((item) => item.id === id
    ? { ...item, settings: structuredClone(channelToolsSettings.value) }
    : item);
  persistPresets();
  return true;
}

export function renameChannelToolsPreset(id: string, name: string): boolean {
  const normalizedName = name.trim();
  if (
    !normalizedName || normalizedName.length > MAX_CHANNEL_TOOL_PRESET_NAME_LENGTH ||
    channelToolsPresets.value.some((preset) => preset.id !== id && preset.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())
  ) return false;
  if (!channelToolsPresets.value.some((preset) => preset.id === id)) return false;
  channelToolsPresets.value = channelToolsPresets.value.map((preset) => preset.id === id ? { ...preset, name: normalizedName } : preset);
  persistPresets();
  return true;
}

export function deleteChannelToolsPreset(id: string): boolean {
  if (!channelToolsPresets.value.some((preset) => preset.id === id)) return false;
  channelToolsPresets.value = channelToolsPresets.value.filter((preset) => preset.id !== id);
  persistPresets();
  return true;
}

export function applyChannelToolsPreset(id: string): boolean {
  const preset = channelToolsPresets.value.find((item) => item.id === id);
  return preset ? restoreChannelToolsSettings(preset.settings) : false;
}

export function applyChannelToolsBuiltinPreset(id: string): boolean {
  const preset = CHANNEL_TOOLS_BUILTIN_PRESETS.find((item) => item.id === id);
  return preset ? restoreChannelToolsSettings(preset.settings) : false;
}

export function saveCurrentChannelToolsToCompareSlot(slot: ChannelToolsCompareSlot): void {
  channelToolsComparisonSlots.value = {
    ...channelToolsComparisonSlots.value,
    [slot]: structuredClone(channelToolsSettings.value),
  };
  activeChannelToolsCompareSlot.value = slot;
  persistComparisonSlots();
}

export function applyChannelToolsCompareSlot(slot: ChannelToolsCompareSlot): boolean {
  const settings = channelToolsComparisonSlots.value[slot];
  if (!settings || !restoreChannelToolsSettings(settings)) return false;
  activeChannelToolsCompareSlot.value = slot;
  return true;
}

export function restoreChannelToolsProfiles(
  presets: ChannelToolsPreset[],
  comparisonSlots: ChannelToolsComparisonSlots,
): boolean {
  if (!isValidChannelToolsPresetList(presets) || !isValidChannelToolsComparisonSlots(comparisonSlots)) return false;
  channelToolsPresets.value = structuredClone(presets);
  channelToolsComparisonSlots.value = structuredClone(comparisonSlots);
  activeChannelToolsCompareSlot.value = null;
  persistPresets();
  persistComparisonSlots();
  return true;
}
