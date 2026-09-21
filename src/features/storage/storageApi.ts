import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../library/libraryApi";

export type StorageBucketKind = "appCache" | "coverCache" | "lyricsCache" | "logs";

export interface StorageBucket {
  label: string;
  bytes: number;
  displaySize: string;
  path: string;
}

export interface StorageReport {
  appCache: StorageBucket;
  webviewCache: StorageBucket;
  coverCache: StorageBucket;
  lyricsCache: StorageBucket;
  logs: StorageBucket;
  database: StorageBucket;
  totalCacheBytes: number;
  totalCacheDisplaySize: string;
  generatedAt: string;
}

const emptyBucket: StorageBucket = {
  label: "Unavailable",
  bytes: 0,
  displaySize: "0 B",
  path: "",
};

export async function getStorageReport(): Promise<StorageReport> {
  if (!isTauriRuntime()) {
    return {
      appCache: emptyBucket,
      webviewCache: emptyBucket,
      coverCache: emptyBucket,
      lyricsCache: emptyBucket,
      logs: emptyBucket,
      database: emptyBucket,
      totalCacheBytes: 0,
      totalCacheDisplaySize: "0 B",
      generatedAt: new Date().toISOString(),
    };
  }

  return invoke<StorageReport>("get_storage_report");
}

export async function clearStorageBucket(kind: StorageBucketKind): Promise<StorageReport> {
  if (!isTauriRuntime()) {
    return getStorageReport();
  }

  return invoke<StorageReport>("clear_storage_bucket", { payload: { kind } });
}

export async function exportStorageDiagnostics(): Promise<string> {
  if (!isTauriRuntime()) {
    return "Ome Music Storage Diagnostics\nDesktop runtime is not active.";
  }

  return invoke<string>("export_storage_diagnostics");
}
