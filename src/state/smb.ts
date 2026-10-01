import { signal } from "@preact/signals";
import {
  isTauriRuntime,
  smbConnect,
  smbDisconnect,
  smbListDirectory,
  smbStatus,
  type SmbDirectory,
  type SmbEntry,
  type SmbStatus,
} from "../lib/api";
import type { Track } from "../types/music";

const DISCONNECTED: SmbStatus = { connected: false, serverLabel: null, rootId: null };

export const connection = signal<SmbStatus>(DISCONNECTED);
export const breadcrumbs = signal<SmbDirectory["breadcrumbs"]>([]);
export const entries = signal<SmbEntry[]>([]);
export const currentDirectoryId = signal<string | null>(null);
export const loading = signal(false);
export const connecting = signal(false);
export const error = signal<string | null>(null);

let sessionRevision = 0;
let listingRevision = 0;

function clearDirectory(): void {
  listingRevision += 1;
  breadcrumbs.value = [];
  entries.value = [];
  currentDirectoryId.value = null;
  loading.value = false;
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export async function refreshSmbStatus(): Promise<boolean> {
  const revision = ++sessionRevision;
  if (!isTauriRuntime()) {
    connection.value = DISCONNECTED;
    clearDirectory();
    return false;
  }
  try {
    const status = await smbStatus();
    if (revision !== sessionRevision) return connection.value.connected;
    connection.value = status;
    if (!status.connected) clearDirectory();
    error.value = null;
    return status.connected;
  } catch (cause) {
    if (revision === sessionRevision) {
      connection.value = DISCONNECTED;
      clearDirectory();
      error.value = errorMessage(cause, "无法读取 SMB 连接状态");
    }
    return false;
  }
}

export async function connectSmb(input: {
  host: string;
  share: string;
  subPath?: string;
  username: string;
  password: string;
}): Promise<boolean> {
  const revision = ++sessionRevision;
  connecting.value = true;
  error.value = null;
  try {
    const status = await smbConnect(
      input.host.trim(),
      input.share.trim(),
      input.subPath?.trim(),
      input.username.trim(),
      input.password,
    );
    if (revision !== sessionRevision) return false;
    connection.value = status;
    clearDirectory();
    return true;
  } catch (cause) {
    if (revision === sessionRevision) error.value = errorMessage(cause, "连接 SMB 曲库失败");
    return false;
  } finally {
    if (revision === sessionRevision) connecting.value = false;
  }
}

export async function disconnectSmb(): Promise<boolean> {
  const revision = ++sessionRevision;
  connecting.value = false;
  error.value = null;
  try {
    await smbDisconnect();
    if (revision !== sessionRevision) return false;
    connection.value = DISCONNECTED;
    clearDirectory();
    return true;
  } catch (cause) {
    if (revision === sessionRevision) error.value = errorMessage(cause, "断开 SMB 曲库失败");
    return false;
  }
}

export async function loadSmbDirectory(directoryId: string | null = currentDirectoryId.value): Promise<void> {
  if (!connection.value.connected) {
    error.value = "请先连接 SMB 曲库";
    return;
  }
  const session = sessionRevision;
  const revision = ++listingRevision;
  loading.value = true;
  error.value = null;
  try {
    const directory = await smbListDirectory(directoryId);
    if (revision !== listingRevision || session !== sessionRevision || !connection.value.connected) return;
    breadcrumbs.value = directory.breadcrumbs;
    entries.value = directory.entries;
    currentDirectoryId.value = directory.breadcrumbs[directory.breadcrumbs.length - 1]?.id ?? null;
  } catch (cause) {
    if (revision === listingRevision && session === sessionRevision) {
      error.value = errorMessage(cause, "无法读取 SMB 目录");
      entries.value = [];
    }
  } finally {
    if (revision === listingRevision && session === sessionRevision) loading.value = false;
  }
}

export function tracksFromSmbEntries(): Track[] {
  const album = breadcrumbs.value[breadcrumbs.value.length - 1]?.name ?? "SMB 曲库";
  return entries.value
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      id: `smb:${entry.id}`,
      sourceId: entry.id,
      source: "smb" as const,
      title: entry.name.replace(/\.[^.]+$/, "") || entry.name,
      artist: "",
      album,
      durationSeconds: 0,
      filePath: "",
      coverPath: null,
      liked: false,
      playCount: 0,
    }));
}

export function resetSmbState(): void {
  sessionRevision += 1;
  connection.value = DISCONNECTED;
  error.value = null;
  connecting.value = false;
  clearDirectory();
}
