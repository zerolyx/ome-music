import { signal } from "@preact/signals";
import { importMusicFolder, listTracks, setTrackLiked } from "../lib/api";
import type { Track } from "../types/music";
import { playTracks } from "./player";

export const tracks = signal<Track[]>([]);
export const importing = signal(false);
export const importNotice = signal<string | null>(null);
export const loadError = signal<string | null>(null);

export async function refreshTracks(): Promise<void> {
  try {
    tracks.value = await listTracks();
    loadError.value = null;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  }
}

export async function importFolder(): Promise<void> {
  importing.value = true;
  importNotice.value = null;
  try {
    const result: Awaited<ReturnType<typeof importMusicFolder>> = await importMusicFolder();
    importNotice.value = `新增 ${result.added} 首，更新 ${result.updated} 首，共 ${result.total} 首`;
    await refreshTracks();
  } catch (error) {
    importNotice.value = error instanceof Error ? error.message : String(error);
  } finally {
    importing.value = false;
  }
}

export function playFromLibrary(index: number): void {
  playTracks(tracks.value, index);
}

export async function toggleLiked(track: Track): Promise<void> {
  const nextLiked = !track.liked;
  tracks.value = tracks.value.map((item) =>
    item.id === track.id ? { ...item, liked: nextLiked } : item
  );
  try {
    await setTrackLiked(track.id, nextLiked);
  } catch {
    tracks.value = tracks.value.map((item) =>
      item.id === track.id ? { ...item, liked: track.liked } : item
    );
  }
}
