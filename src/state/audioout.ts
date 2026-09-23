import { signal } from "@preact/signals";

/**
 * 输出设备选择（ECHO WASAPI 选择的 Web 等价版）：HTMLAudio.setSinkId。
 * 设备列表来自 enumerateDevices；标签拿不到权限时为匿名，回退「默认」。
 */
const KEY = "ome.audioout";

export interface OutputDevice {
  id: string;
  label: string;
}

export const outputDevices = signal<OutputDevice[]>([]);
export const outputDeviceId = signal<string>(load());

function load(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export async function refreshOutputDevices(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs: OutputDevice[] = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device, index) => ({
        id: device.deviceId,
        label: device.label || `输出设备 ${index + 1}`,
      }));
    // 去重（相同 deviceId 理论上不重复，防御）
    const seen = new Set<string>();
    outputDevices.value = outputs.filter((device) => {
      if (seen.has(device.id)) return false;
      seen.add(device.id);
      return true;
    });
  } catch {
    /* 枚举失败：保持现状 */
  }
}

/** 把选择应用到 audio 元素；元素不支持 setSinkId 时静默跳过 */
export function applySinkId(element: HTMLAudioElement): void {
  const id = outputDeviceId.value;
  const sink = element as HTMLAudioElement & {
    setSinkId?: (sinkId: string) => Promise<void>;
  };
  if (!sink.setSinkId) return;
  sink
    .setSinkId(id)
    .then(() => undefined)
    .catch(() => {
      /* 设备拔出/失效：回退默认 */
      if (outputDeviceId.value === id) setOutputDevice("");
    });
}

export function setOutputDevice(id: string): void {
  outputDeviceId.value = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* 存储不可用忽略 */
  }
  // 通知 player.ts 里已存在的元素（通过自定义事件解耦，避免循环依赖）
  window.dispatchEvent(new CustomEvent("ome:output-device", { detail: id }));
}
