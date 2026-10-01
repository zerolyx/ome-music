export type MusicSource = "local" | "netease" | "bilibili" | "subsonic" | "jellyfin" | "emby" | "webdav" | "smb";
export type TrackMetadataSource = "fileTags" | "netease" | "qq" | "kugou" | "manual" | "unknown";
export type TrackMetadataProvider = Extract<TrackMetadataSource, "netease" | "qq" | "kugou">;

export interface TrackMetadataCandidate {
  source: TrackMetadataProvider;
  id: string;
  name: string;
  artists: string;
  album: string;
  durationMs: number;
  coverUrl?: string | null;
}

export interface TrackMetadataSources {
  title: TrackMetadataSource;
  artist: TrackMetadataSource;
  album: TrackMetadataSource;
}

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
  artistId?: string | null;
  albumId?: string | null;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  filePath: string;
  source: MusicSource;
  sourceId?: string | null;
  unavailableReason?: string | null;
  coverPath?: string | null;
  genres?: string[];
  liked: boolean;
  playCount: number;
  replayGainTrackGainDb?: number | null;
  replayGainAlbumGainDb?: number | null;
  replayGainTrackPeak?: number | null;
  replayGainAlbumPeak?: number | null;
  hasMetadataOverride?: boolean;
  metadataSnapshotAvailable?: boolean;
  metadataSources?: TrackMetadataSources | null;
}
