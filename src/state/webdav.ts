import { signal } from "@preact/signals";
import {
  isTauriRuntime,
  webdavConnect,
  webdavDisconnect,
  webdavListDirectory,
  webdavStatus,
  type WebDavDirectory,
  type WebDavEntry,
  type WebDavStatus,
} from "../lib/api";
import type { Track } from "../types/music";

const DISCONNECTED: WebDavStatus = { connected: false, serverLabel: null };

export const connection = signal<WebDavStatus>(DISCONNECTED);
export const breadcrumbs = signal<WebDavDirectory["breadcrumbs"]>([]);
export const entries = signal<WebDavEntry[]>([]);
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

export async function refreshWebDavStatus(): Promise<boolean> {
  const revision = ++sessionRevision;
  if (!isTauriRuntime()) {
    connection.value = DISCONNECTED;
    clearDirectory();
    return false;
  }
  try {
    const status = await webdavStatus();
    if (revision !== sessionRevision) return connection.value.connected;
    connection.value = status;
    if (!status.connected) clearDirectory();
    error.value = null;
    return status.connected;
  } catch (cause) {
    if (revision === sessionRevision) {
      connection.value = DISCONNECTED;
      clearDirectory();
      error.value = errorMessage(cause, "无法读取 WebDAV 连接状态");
    }
    return false;
  }
}

export async function connectWebDav(input: {
  serverUrl: string;
  username?: string;
  password?: string;
}): Promise<boolean> {
  const revision = ++sessionRevision;
  connecting.value = true;
  error.value = null;
  try {
    const status = await webdavConnect(input.serverUrl, input.username, input.password);
    if (revision !== sessionRevision) return false;
    connection.value = status;
    clearDirectory();
    return true;
  } catch (cause) {
    if (revision === sessionRevision) error.value = errorMessage(cause, "连接 WebDAV 曲库失败");
    return false;
  } finally {
    if (revision === sessionRevision) connecting.value = false;
  }
}

export async function disconnectWebDav(): Promise<boolean> {
  const revision = ++sessionRevision;
  connecting.value = false;
  error.value = null;
  try {
    await webdavDisconnect();
    if (revision !== sessionRevision) return false;
    connection.value = DISCONNECTED;
    clearDirectory();
    return true;
  } catch (cause) {
    if (revision === sessionRevision) error.value = errorMessage(cause, "断开 WebDAV 曲库失败");
    return false;
  }
}

export async function loadWebDavDirectory(directoryId: string | null = currentDirectoryId.value): Promise<void> {
  if (!connection.value.connected) {
    error.value = "请先连接 WebDAV 曲库";
    return;
  }
  const session = sessionRevision;
  const revision = ++listingRevision;
  loading.value = true;
  error.value = null;
  try {
    const directory = await webdavListDirectory(directoryId);
    if (revision !== listingRevision || session !== sessionRevision || !connection.value.connected) return;
    breadcrumbs.value = directory.breadcrumbs;
    entries.value = directory.entries;
    currentDirectoryId.value = directory.breadcrumbs[directory.breadcrumbs.length - 1]?.id ?? null;
  } catch (cause) {
    if (revision === listingRevision && session === sessionRevision) {
      error.value = errorMessage(cause, "无法读取 WebDAV 目录");
      entries.value = [];
    }
  } finally {
    if (revision === listingRevision && session === sessionRevision) loading.value = false;
  }
}

export function tracksFromWebDavEntries(): Track[] {
  const album = breadcrumbs.value[breadcrumbs.value.length - 1]?.name ?? "WebDAV 曲库";
  return entries.value
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      id: `webdav:${entry.id}`,
      sourceId: entry.id,
      source: "webdav" as const,
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

export function resetWebDavState(): void {
  sessionRevision += 1;
  connection.value = DISCONNECTED;
  error.value = null;
  connecting.value = false;
  clearDirectory();
}
