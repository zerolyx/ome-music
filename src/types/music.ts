export type MusicSource = "local" | "netease" | "bilibili";

/** 网易云搜索结果 DTO（后端 serde camelCase，见 NeteaseSongDto） */
export interface NeteaseSong {
  id: number;
  name: string;
  /** 多歌手「、」连接 */
  artists: string;
  album: string;
  durationMs: number;
  /** 0 免费 / 8 低音质免费，其余多为 VIP */
  coverUrl?: string | null;
  fee: number;
  /** fee 0/8 可播判定 */
  plain: boolean;
}

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
