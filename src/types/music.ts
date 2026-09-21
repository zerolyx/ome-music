export type MusicSource = "local" | "netease" | "bilibili";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  filePath: string;
  source: MusicSource;
  sourceId?: string | null;
  unavailableReason?: string | null;
  coverPath?: string | null;
  liked: boolean;
  playCount: number;
}
