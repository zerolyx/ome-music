import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LyricsSourceMenu } from "./components/LyricsSourceMenu";
import { NowPlayingHero } from "./components/NowPlayingHero";
import { OmeRadioPanel } from "./components/OmeRadioPanel";
import { PlayerControls } from "./components/PlayerControls";
import { TopSearch } from "./components/TopSearch";
import { WindowTitlebar } from "./components/WindowTitlebar";
import {
  importMusicFolder,
  isTrackUnavailable,
  listLocalTracks,
  recordPlaybackEvent,
  toPlayableSrc,
  type PlaybackEventType
} from "./features/library/libraryApi";
import { getCurrentLyricIndex, importLyricsFile, parseLrc, resolveLyrics, saveLyricOffset, type LyricLine } from "./features/lyrics/lyricsResolver";
import {
  ensureNeteaseApiService,
  BilibiliMusicProvider,
  NetEaseAccountSessionProvider,
  NetEaseMusicProvider,
  type DanmakuItem,
  type BilibiliDanmakuDebug,
  type NetEaseLoginStatus,
  type MusicSourceSong,
  type NetEasePlaybackDebug,
  type NetEaseServiceStatus,
  type PlayableUrlOptions,
  type TasteNotes
} from "./features/musicSources/provider";
import {
  buildOmeRadioSession,
  getRadioSegmentsBetweenTracks,
  getRadioSegmentsForTrackStart,
  refillOmeRadioSession,
  updateRadioSessionPlayback,
  type RadioKind,
  type RadioSegment,
  type RadioSession
} from "./features/radio/omeRadio";
import { getSpeechProviderConfig, speakCuratorText } from "./features/speech/provider";
import { loadLastSessionSnapshot, saveLastSessionSnapshot, snapshotToTrack } from "./features/startup/lastSessionSnapshot";
import { markStartup, noteStartupTask, reportStartup } from "./features/startup/startupDebug";
import type { LoopMode, Track } from "./types/music";

const neteaseProvider = new NetEaseMusicProvider();
const neteaseAuthProvider = new NetEaseAccountSessionProvider();
const bilibiliProvider = new BilibiliMusicProvider();
const ProviderSettingsPanel = lazy(() => import("./components/ProviderSettingsPanel").then((module) => ({ default: module.ProviderSettingsPanel })));
const DjCuratorPanel = lazy(() => import("./components/DjCuratorPanel").then((module) => ({ default: module.DjCuratorPanel })));
const GlobalDanmakuAtmosphereLayer = lazy(() => import("./components/GlobalDanmakuAtmosphereLayer").then((module) => ({ default: module.GlobalDanmakuAtmosphereLayer })));

function nextLoopMode(loopMode: LoopMode): LoopMode {
  if (loopMode === "off") return "all";
  if (loopMode === "all") return "one";
  return "off";
}

function sourceIdForTrack(track: Track): string | null {
  if (track.sourceId) return track.sourceId;
  if (track.filePath.startsWith("unavailable:netease:")) {
    return track.filePath.replace("unavailable:netease:", "");
  }
  if (track.filePath.startsWith("unavailable:bilibili:")) {
    return track.filePath.replace("unavailable:bilibili:", "");
  }
  return null;
}

function isRemoteTrack(track: Track): boolean {
  return track.source === "netease" || track.source === "bilibili";
}

function isRestoredOnlyTrack(track: Track): boolean {
  return restoredOnlyPrefixPattern.test(track.filePath);
}

const restoredOnlyPrefixPattern = /^snapshot:/;

function playbackReasonMessage(reason?: string | null): string {
  switch (reason) {
    case "not_logged_in":
    case "cookie_missing":
      return "Sign in to your music source to try again.";
    case "cookie_expired":
      return "Your session has expired. Please reconnect NetEase Cloud Music.";
    case "vip_required":
      return "This track needs an active membership from the current source.";
    case "trial_only":
      return "Only a preview is available from the current source.";
    case "no_copyright":
    case "region_restricted":
    case "song_removed":
    case "video_removed":
    case "url_null":
      return "This track is unavailable from the current source.";
    case "playurl_failed":
    case "audio_stream_missing":
      return "This Bilibili track is unavailable from the current source.";
    case "api_failed":
      return "The music source could not be reached just now.";
    default:
      return "This track is unavailable from the current source.";
  }
}

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayEventKeyRef = useRef<string | null>(null);
  const lyricRequestRef = useRef(0);
  const playableRequestRef = useRef(0);
  const bilibiliSelectionRef = useRef(0);
  const neteaseSelectionRef = useRef(0);
  const [startupSnapshot] = useState(() => loadLastSessionSnapshot());
  const [restoredSnapshotTrack] = useState<Track | null>(() => (startupSnapshot ? snapshotToTrack(startupSnapshot) : null));
  const snapshotSaveTimerRef = useRef<number | null>(null);
  const preparedPlayableRef = useRef<Map<string, { audioUrl: string; videoUrl?: string | null }>>(new Map());
  const progressSecondsRef = useRef(startupSnapshot?.position ?? 0);
  const currentTrackRef = useRef<Track | null>(null);
  const loopModeRef = useRef<LoopMode>("all");
  const playableSrcRef = useRef("");
  const playableSrcForTrackIdRef = useRef<{ trackId: string; quality: NonNullable<PlayableUrlOptions["level"]> } | null>(null);
  const [tracks, setTracks] = useState<Track[]>(() => (restoredSnapshotTrack ? [restoredSnapshotTrack] : []));
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(() => restoredSnapshotTrack?.id ?? null);
  const [agentQueue, setAgentQueue] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressSeconds, setProgressSeconds] = useState(() => startupSnapshot?.position ?? 0);
  const [volume, setVolume] = useState(() => startupSnapshot?.volume ?? 0.72);
  const [shuffle, setShuffle] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>("all");
  const [isImporting, setIsImporting] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [playableSrc, setPlayableSrc] = useState("");
  const [videoAtmosphereSrc, setVideoAtmosphereSrc] = useState("");
  const [isVoiceDucking, setVoiceDucking] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricCacheKey, setLyricCacheKey] = useState<string | null>(null);
  const [lyricWarning, setLyricWarning] = useState<string | null>(null);
  const [lyricOffsetMs, setLyricOffsetMs] = useState(0);
  const [isLyricsLoading, setLyricsLoading] = useState(false);
  const [isProviderSettingsOpen, setProviderSettingsOpen] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState<"all" | "music" | "atmosphere">("music");
  const [playbackDebug, setPlaybackDebug] = useState<NetEasePlaybackDebug | null>(null);
  const [sourceServiceStatus, setSourceServiceStatus] = useState<NetEaseServiceStatus | null>(null);
  const [sourceLoginStatus, setSourceLoginStatus] = useState<NetEaseLoginStatus | null>(null);
  const [tasteNotes, setTasteNotes] = useState<TasteNotes | null>(null);
  const [danmakuItems, setDanmakuItems] = useState<DanmakuItem[]>([]);
  const [danmakuDebug, setDanmakuDebug] = useState<BilibiliDanmakuDebug | null>(null);
  const [essentialRestoreDone, setEssentialRestoreDone] = useState(false);
  const [showDjPanel, setShowDjPanel] = useState(false);
  const [radioSession, setRadioSession] = useState<RadioSession | null>(null);
  const radioSessionRef = useRef<RadioSession | null>(null);
  const spokenRadioSegmentsRef = useRef<Set<string>>(new Set());
  const radioTransitionRef = useRef(false);
  const [playbackQuality, setPlaybackQuality] = useState<NonNullable<PlayableUrlOptions["level"]>>(() => {
    const stored = window.localStorage.getItem("ome.playback.netease.quality");
    return stored === "standard" || stored === "higher" || stored === "exhigh" || stored === "lossless" || stored === "hires"
      ? stored
      : "hires";
  });

  const currentIndex = useMemo(
    () => tracks.findIndex((track) => track.id === currentTrackId),
    [currentTrackId, tracks]
  );
  const currentTrack = useMemo(
    () => (currentIndex >= 0 ? tracks[currentIndex] ?? null : null),
    [currentIndex, tracks]
  );
  const currentLyricIndex = useMemo(
    () => getCurrentLyricIndex(lyrics, progressSeconds, lyricOffsetMs),
    [lyrics, lyricOffsetMs, progressSeconds]
  );

  useEffect(() => {
    progressSecondsRef.current = progressSeconds;
  }, [progressSeconds]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    loopModeRef.current = loopMode;
  }, [loopMode]);

  useEffect(() => {
    playableSrcRef.current = playableSrc;
  }, [playableSrc]);

  useEffect(() => {
    if (!currentTrack) return;
    if (snapshotSaveTimerRef.current !== null) window.clearTimeout(snapshotSaveTimerRef.current);
    snapshotSaveTimerRef.current = window.setTimeout(() => {
      saveLastSessionSnapshot(currentTrack, progressSeconds, volume);
    }, 900);
    return () => {
      if (snapshotSaveTimerRef.current !== null) window.clearTimeout(snapshotSaveTimerRef.current);
    };
  }, [currentTrack, progressSeconds, volume]);

  const recordEvent = useCallback(async (eventType: PlaybackEventType, track: Track | null, position?: number) => {
    if (!track) return;
    const resolvedPosition = position ?? progressSecondsRef.current;

    try {
      await recordPlaybackEvent({
        trackId: track.id,
        eventType,
        positionSeconds: Math.max(0, Math.floor(resolvedPosition))
      });
    } catch (error) {
      console.error(`failed to record ${eventType}`, error);
    }
  }, []);

  useEffect(() => {
    markStartup("frontendMountedAt");
    markStartup("shellVisibleAt");
    if (startupSnapshot) markStartup("lastSessionLoadedAt");
    noteStartupTask("music-source-status delayed until after first paint");
    reportStartup("Ome shell visible");

    let cancelled = false;
    const restoreTimer = window.setTimeout(() => {
      listLocalTracks()
        .then((loadedTracks) => {
          if (cancelled) return;
          const restoredTrack = restoredSnapshotTrack;
          const mergedTracks = restoredTrack && !loadedTracks.some((track) => track.id === restoredTrack.id)
            ? [restoredTrack, ...loadedTracks]
            : loadedTracks;
          setTracks(mergedTracks);
          setCurrentTrackId((value) => value ?? mergedTracks[0]?.id ?? null);
          setEssentialRestoreDone(true);
          markStartup("settingsLoadedAt");
          markStartup("firstInteractiveAt");
          reportStartup("Ome essential restore");
        })
        .catch((error) => {
          if (cancelled) return;
          setEssentialRestoreDone(true);
          setLibraryError(error instanceof Error ? error.message : String(error));
        });
    }, 120);

    const backgroundTimer = window.setTimeout(() => {
      markStartup("providersInitStartedAt");
      void Promise.allSettled([
        ensureNeteaseApiService()
          .then((status) => {
            if (!cancelled) setSourceServiceStatus(status);
          })
          .catch(() => {
            if (!cancelled) setSourceServiceStatus(null);
          }),
        neteaseAuthProvider
          .getLoginStatus()
          .then((login) => {
            if (!cancelled) setSourceLoginStatus(login);
          })
          .catch(() => {
            if (!cancelled) setSourceLoginStatus(null);
          }),
        neteaseProvider
          .getLatestTasteNotes()
          .then((notes) => {
            if (!cancelled) setTasteNotes(notes);
          })
          .catch(() => {
            if (!cancelled) setTasteNotes(null);
          })
      ]).finally(() => {
        if (!cancelled) {
          markStartup("providersReadyAt");
          reportStartup("Ome background ready");
        }
      });
    }, 1700);

    const djTimer = window.setTimeout(() => setShowDjPanel(true), 1100);

    return () => {
      cancelled = true;
      window.clearTimeout(restoreTimer);
      window.clearTimeout(backgroundTimer);
      window.clearTimeout(djTimer);
    };
  }, [restoredSnapshotTrack]);

  useEffect(() => {
    setRadioSession((session) => updateRadioSessionPlayback(session, currentTrackId, isPlaying));
  }, [currentTrackId, isPlaying]);

  useEffect(() => {
    radioSessionRef.current = radioSession;
  }, [radioSession]);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const reloadLyrics = useCallback(() => {
    if (!currentTrack) return;
    const requestId = lyricRequestRef.current + 1;
    lyricRequestRef.current = requestId;
    setLyrics([]);
    setLyricWarning(null);
    setLyricOffsetMs(0);
    setLyricsLoading(true);

    resolveLyrics(currentTrack)
      .then((resolved) => {
        if (lyricRequestRef.current !== requestId) return;
        setLyricCacheKey(resolved.cacheKey);
        setLyrics(parseLrc(resolved.lyrics));
        setLyricWarning(resolved.warning ?? null);
        setLyricOffsetMs(resolved.offsetMs);
      })
      .catch(() => {
        if (lyricRequestRef.current !== requestId) return;
        setLyrics([]);
        setLyricWarning("No matched lyrics for this version.");
        setLyricOffsetMs(0);
      })
      .finally(() => {
        if (lyricRequestRef.current === requestId) setLyricsLoading(false);
      });
  }, [currentTrack]);

  const importLyrics = useCallback(() => {
    if (!currentTrack) return;
    const requestId = lyricRequestRef.current + 1;
    lyricRequestRef.current = requestId;
    setLyricsLoading(true);

    importLyricsFile(currentTrack)
      .then((resolved) => {
        if (lyricRequestRef.current !== requestId) return;
        setLyricCacheKey(resolved.cacheKey);
        setLyrics(parseLrc(resolved.lyrics));
        setLyricWarning(resolved.warning ?? null);
        setLyricOffsetMs(resolved.offsetMs);
      })
      .catch((error) => {
        if (lyricRequestRef.current !== requestId) return;
        setLyricWarning(error instanceof Error ? error.message : "Could not import that lyrics file.");
      })
      .finally(() => {
        if (lyricRequestRef.current === requestId) setLyricsLoading(false);
      });
  }, [currentTrack]);

  useEffect(() => {
    setProgressSeconds(0);
    lastPlayEventKeyRef.current = null;
    if (!currentTrack || (!essentialRestoreDone && isRemoteTrack(currentTrack))) {
      setLyrics([]);
      setLyricWarning(null);
      setLyricOffsetMs(0);
      setLyricsLoading(false);
      return;
    }
    reloadLyrics();
  }, [currentTrack, currentTrackId, essentialRestoreDone, reloadLyrics]);

  useEffect(() => {
    if (!currentTrack) {
      playableSrcForTrackIdRef.current = null;
      setPlayableSrc("");
      setVideoAtmosphereSrc("");
      setLibraryError(null);
      setPlaybackDebug(null);
      return;
    }

    // If we already have a playable URL resolved for this track at the current quality, keep it across isPlaying toggles.
    if (playableSrcForTrackIdRef.current?.trackId === currentTrack.id && playableSrcForTrackIdRef.current?.quality === playbackQuality) return;

    const requestId = playableRequestRef.current + 1;
    playableRequestRef.current = requestId;
    setPlayableSrc("");
    setVideoAtmosphereSrc("");
    setLibraryError(null);
    setPlaybackDebug(null);

    const prepared = preparedPlayableRef.current.get(currentTrack.id);
    if (!prepared && isRemoteTrack(currentTrack) && !isPlaying) return;

    const resolvePlayable = async () => {
      if (prepared) {
        preparedPlayableRef.current.delete(currentTrack.id);
        return prepared;
      }

      const sourceId = currentTrack.source === "netease" ? sourceIdForTrack(currentTrack) : null;
      if (sourceId) {
        const result = await neteaseProvider.getPlayableUrl(sourceId, { level: playbackQuality });
        if (playableRequestRef.current === requestId) setPlaybackDebug(result.debug ?? null);
        if (!result.url || result.unavailable) {
          throw new Error(playbackReasonMessage(result.reason));
        }
        return { audioUrl: result.url };
      }

      const bilibiliSourceId = currentTrack.source === "bilibili" ? sourceIdForTrack(currentTrack) : null;
      if (bilibiliSourceId) {
        const result = await bilibiliProvider.getPlayableUrl(bilibiliSourceId);
        if (playableRequestRef.current === requestId) setPlaybackDebug(null);
        if (!result.url || result.unavailable) {
          throw new Error(playbackReasonMessage(result.reason));
        }
        return { audioUrl: result.url, videoUrl: result.videoUrl };
      }

      const src = toPlayableSrc(currentTrack);
      if (!src || isTrackUnavailable(currentTrack)) {
        throw new Error(playbackReasonMessage(currentTrack.unavailableReason));
      }
      return { audioUrl: src };
    };

    resolvePlayable()
      .then(({ audioUrl, videoUrl }) => {
        if (playableRequestRef.current !== requestId) return;
        playableSrcForTrackIdRef.current = { trackId: currentTrack.id, quality: playbackQuality };
        setPlayableSrc(audioUrl);
        setVideoAtmosphereSrc(videoUrl ?? "");
      })
      .catch((error) => {
        if (playableRequestRef.current !== requestId) return;
        playableSrcForTrackIdRef.current = null;
        audioRef.current?.pause();
        setIsPlaying(false);
        setLibraryError(error instanceof Error ? error.message : playbackReasonMessage());
      });
  }, [currentTrack, isPlaying, playbackQuality]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    setDanmakuItems([]);
    setDanmakuDebug(null);

    if (!currentTrack || currentTrack.source !== "bilibili" || !isPlaying) return;
    const sourceId = sourceIdForTrack(currentTrack);
    if (!sourceId) return;

    const loadDanmaku = async (allowRetry: boolean) => {
      try {
        let resolvedId = sourceId;
        let cid: string | undefined = sourceId.split(":")[1] || undefined;
        if (!cid) {
          const metadata = await bilibiliProvider.getVideoMetadata(sourceId);
          cid = metadata.cid ?? undefined;
          if (cid) resolvedId = `${metadata.bvid ?? sourceId}:${cid}`;
        }
        if (!cid) throw new Error("This video has no danmaku channel.");
        const response = await bilibiliProvider.getDanmaku(resolvedId, cid);
        if (!cancelled) {
          setDanmakuItems(response.items);
          setDanmakuDebug(response.debug ?? null);
        }
      } catch (error) {
        if (cancelled) return;
        if (allowRetry) {
          retryTimer = window.setTimeout(() => void loadDanmaku(false), 1600);
          return;
        }
        console.warn("Bilibili danmaku unavailable", error);
        const cid = sourceId.split(":")[1] || "";
        setDanmakuDebug({
          bvid: sourceId.split(":")[0],
          aid: null,
          cid,
          danmakuRequestUrl: cid ? `https://comment.bilibili.com/${cid}.xml` : "-",
          rawDanmakuLoaded: false,
          rawDanmakuLength: 0,
          parsedDanmakuCount: 0,
          firstDanmakuTime: null,
          fromCache: false,
          error: error instanceof Error ? error.message : String(error)
        });
        setDanmakuItems([]);
      }
    };

    void loadDanmaku(true);

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack || !playableSrc) return;

    if (audio.src !== playableSrc) {
      audio.pause();
      audio.currentTime = 0;
      setProgressSeconds(0);
      audio.src = playableSrc;
      audio.load();
    }
    audio.volume = isVoiceDucking ? volume * 0.36 : volume;

    if (!isPlaying) {
      audio.pause();
      return;
    }

    audio
      .play()
      .then(() => {
        const eventKey = `${currentTrack.id}:${audio.src}`;
        if (lastPlayEventKeyRef.current !== eventKey) {
          lastPlayEventKeyRef.current = eventKey;
          void recordEvent("play", currentTrack, 0);
        }
      })
      .catch(() => {
        setIsPlaying(false);
        setLibraryError("This track is unavailable from the current source.");
      });
  }, [currentTrack, isPlaying, isVoiceDucking, playableSrc, recordEvent, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = isVoiceDucking ? volume * 0.36 : volume;
  }, [isVoiceDucking, volume]);

  const handleAudioEndedRef = useRef<() => void>(() => {});

  useEffect(() => {
    handleAudioEndedRef.current = () => {
      const audio = audioRef.current;
      const track = currentTrackRef.current;
      const loop = loopModeRef.current;
      if (!audio) return;

      void recordEvent("completed", track, audio.duration || progressSecondsRef.current);

      if (loop === "one" && track) {
        audio.currentTime = 0;
        setProgressSeconds(0);
        void recordEvent("replayed", track, 0);
        void audio.play();
        return;
      }

      if (playNextQueuedTrack()) return;

      if (loop === "all" && tracks.length > 1) {
        playAdjacentTrack("next", { markSkip: false });
        return;
      }

      setIsPlaying(false);
      setProgressSeconds(0);
      lastPlayEventKeyRef.current = null;
    };
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setProgressSeconds(audio.currentTime);
    const handleEnded = () => handleAudioEndedRef.current();
    const handleError = () => {
      const track = currentTrackRef.current;
      if (!track || !playableSrcRef.current) return;
      setIsPlaying(false);
      setLibraryError(playbackReasonMessage(track.unavailableReason));
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  const importFolder = async () => {
    setIsImporting(true);
    setLibraryError(null);

    try {
      const result = await importMusicFolder();
      setTracks(result.tracks);
      setCurrentTrackId(result.tracks[0]?.id ?? null);
      setProgressSeconds(0);
      lastPlayEventKeyRef.current = null;
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  };

  const setActiveRadioSession = (session: RadioSession | null) => {
    radioSessionRef.current = session;
    setRadioSession(session);
  };

  const speakRadioSegments = async (segments: RadioSegment[]) => {
    for (const segment of segments) {
      if (spokenRadioSegmentsRef.current.has(segment.id)) continue;
      spokenRadioSegmentsRef.current.add(segment.id);
      if (segment.type === "silence" || !segment.text.trim()) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        continue;
      }
      publishRadioLine(segment.text);
      await speakCuratorText(segment.text, getSpeechProviderConfig(), {
        onStart: () => setVoiceDucking(true),
        onEnd: () => setVoiceDucking(false),
        onError: () => setVoiceDucking(false)
      }).catch(() => {
        setVoiceDucking(false);
        return false;
      });
    }
  };

  const publishRadioLine = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setRadioSession((session) => {
      if (!session) return session;
      const nextSession: RadioSession = {
        ...session,
        hostNotes: [
          ...session.hostNotes.slice(-4),
          {
            id: `note-on-air-${Date.now()}`,
            text: trimmed,
            createdAt: new Date().toISOString()
          }
        ]
      };
      return nextSession;
    });
  };

  const refillRadioIfNeeded = (session: RadioSession, nextIndex: number): RadioSession => {
    const remaining = session.tracks.length - nextIndex - 1;
    if (remaining > 2) return session;
    const refilled = refillOmeRadioSession(session, tracks, tasteNotes, 4);
    if (refilled !== session) {
      setActiveRadioSession(refilled);
      setAgentQueue(refilled.tracks.slice(nextIndex + 1));
    }
    return refilled;
  };

  const beginRadioBroadcast = async (session: RadioSession) => {
    if (radioTransitionRef.current) return;
    radioTransitionRef.current = true;

    try {
      const firstTrack = session.tracks[0];
      if (!firstTrack) return;
      const preparingSession: RadioSession = { ...session, status: "preparing", currentTrackIndex: 0 };
      setActiveRadioSession(preparingSession);
      setAgentQueue(preparingSession.tracks.slice(1));
      await speakRadioSegments(getRadioSegmentsForTrackStart(preparingSession, 0));
      const playingSession: RadioSession = { ...preparingSession, status: "playing" };
      setActiveRadioSession(playingSession);
      playLocalTrack(firstTrack);
    } finally {
      radioTransitionRef.current = false;
    }
  };

  const playRadioTrackAtIndex = async (track: Track, trackIndex: number, remainingTracks: Track[]) => {
    if (radioTransitionRef.current) return;
    radioTransitionRef.current = true;

    try {
      const session = radioSessionRef.current;
      if (!session) {
        setAgentQueue(remainingTracks);
        playLocalTrack(track);
        return;
      }

      const afterIndex = Math.max(0, trackIndex - 1);
      await speakRadioSegments(getRadioSegmentsBetweenTracks(session, afterIndex, trackIndex));
      const refilled = refillRadioIfNeeded(
        {
          ...session,
          status: "playing",
          currentTrackIndex: trackIndex
        },
        trackIndex
      );
      setActiveRadioSession({ ...refilled, status: "playing", currentTrackIndex: trackIndex });
      setAgentQueue(refilled.tracks.slice(trackIndex + 1));
      playLocalTrack(track);
    } finally {
      radioTransitionRef.current = false;
    }
  };

  const playNextQueuedTrack = (): boolean => {
    if (agentQueue.length === 0) return false;
    const [nextTrack, ...remainingTracks] = agentQueue;
    const radioIndex = radioSessionRef.current?.tracks.findIndex((track) => track.id === nextTrack.id) ?? -1;
    if (radioIndex >= 0) {
      void playRadioTrackAtIndex(nextTrack, radioIndex, remainingTracks);
      return true;
    }
    setAgentQueue(remainingTracks);
    playLocalTrack(nextTrack);
    return true;
  };

  const playAdjacentTrack = (direction: "next" | "previous", options: { markSkip?: boolean } = {}) => {
    if (tracks.length === 0 || currentIndex < 0) return;
    const { markSkip = true } = options;

    if (direction === "next" && playNextQueuedTrack()) {
      if (markSkip && currentTrack) {
        void recordEvent("skip", currentTrack);
      }
      return;
    }

    if (markSkip && currentTrack) {
      void recordEvent("skip", currentTrack);
    }

    const offset = direction === "next" ? 1 : -1;
    const nextIndex = shuffle
      ? Math.floor(Math.random() * tracks.length)
      : (currentIndex + offset + tracks.length) % tracks.length;
    lastPlayEventKeyRef.current = null;
    setCurrentTrackId(tracks[nextIndex].id);
    setProgressSeconds(0);
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (!currentTrack) return;

    if (!playableSrc) {
      if (isRemoteTrack(currentTrack) && !isTrackUnavailable(currentTrack)) {
        setLibraryError(null);
        setIsPlaying(true);
        return;
      }
      setLibraryError(isTrackUnavailable(currentTrack) ? playbackReasonMessage(currentTrack.unavailableReason) : "Preparing this track.");
      setIsPlaying(false);
      return;
    }

    if (isPlaying) {
      audioRef.current?.pause();
      void recordEvent("pause", currentTrack);
      setIsPlaying(false);
      lastPlayEventKeyRef.current = null;
      return;
    }

    setLibraryError(null);
    setIsPlaying(true);
  };

  const setProgress = (seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seconds;
    }
    setProgressSeconds(seconds);
  };

  const adjustLyricOffset = (deltaMs: number) => {
    if (!lyricCacheKey) return;
    const nextOffset = Math.max(-10000, Math.min(10000, lyricOffsetMs + deltaMs));
    setLyricOffsetMs(nextOffset);
    void saveLyricOffset(lyricCacheKey, nextOffset);
  };

  const resetLyricOffset = () => {
    if (!lyricCacheKey) return;
    setLyricOffsetMs(0);
    void saveLyricOffset(lyricCacheKey, 0);
  };

  const changePlaybackQuality = (level: NonNullable<PlayableUrlOptions["level"]>) => {
    setPlaybackQuality(level);
    window.localStorage.setItem("ome.playback.netease.quality", level);
  };

  const playLocalTrack = (track: Track) => {
    lastPlayEventKeyRef.current = null;
    setCurrentTrackId(track.id);
    setProgressSeconds(0);
    setIsPlaying(true);
    setLibraryError(null);
  };

  const queueLocalTrack = (track: Track) => {
    setAgentQueue((value) => [...value.filter((item) => item.id !== track.id), track]);
  };

  const playTemporaryPlaylist = (title: string, playlistTracks: Track[]) => {
    if (playlistTracks.length === 0) {
      setLibraryError("I could not find a clean playable set for that mood.");
      return;
    }

    const [firstTrack, ...queuedTracks] = playlistTracks;
    setAgentQueue(queuedTracks);
    playLocalTrack(firstTrack);
  };

  const createRadioSession = (request: RadioKind | { kind?: RadioKind; theme?: string; mood?: Track["moods"][number]; scene?: string }): RadioSession | null => {
    const options = typeof request === "string" ? { kind: request } : request;
    const session = buildOmeRadioSession({
      tracks,
      tasteNotes,
      kind: options.kind,
      theme: options.theme,
      mood: options.mood,
      scene: options.scene,
      source: tasteNotes ? "taste_notes" : "time_context",
      trackCount: 12
    });
    spokenRadioSegmentsRef.current = new Set();
    setActiveRadioSession(session);
    return session;
  };

  const startRadioSession = (sessionId?: string): boolean => {
    let session = radioSessionRef.current;
    if (sessionId && session?.id !== sessionId) {
      session = radioSession;
    }
    session = session ?? buildOmeRadioSession({
      tracks,
      tasteNotes,
      source: tasteNotes ? "taste_notes" : "time_context",
      trackCount: 12
    });

    if (!session.tracks.length) {
      setLibraryError("The radio needs a few playable records before it can go on air.");
      setActiveRadioSession(session);
      return false;
    }

    const activeSession: RadioSession = { ...session, status: "preparing", currentTrackIndex: 0 };
    setActiveRadioSession(activeSession);
    void beginRadioBroadcast(activeSession);
    return true;
  };

  const softenRadio = (): RadioSession | null => {
    return createRadioSession({
      kind: "quietRoom",
      theme: "low light and gentle edges",
      mood: "calm",
      scene: "A softer room"
    });
  };

  const brightenRadio = (): RadioSession | null => {
    return createRadioSession({
      kind: "discovery",
      theme: "brighter room",
      mood: "energetic",
      scene: "A brighter room"
    });
  };

  const switchRadioTheme = (kind: RadioKind, theme?: string): RadioSession | null => {
    return createRadioSession({ kind, theme });
  };

  const importNetEaseTrack = async (song: MusicSourceSong): Promise<Track | null> => {
    const requestId = neteaseSelectionRef.current + 1;
    neteaseSelectionRef.current = requestId;
    setLibraryError(null);
    try {
      const status = await ensureNeteaseApiService();
      if (neteaseSelectionRef.current !== requestId) return null;
      setSourceServiceStatus(status);
      const playable = await neteaseProvider.getPlayableUrl(song.id, { level: playbackQuality });
      if (neteaseSelectionRef.current !== requestId) return null;
      setPlaybackDebug(playable.debug ?? null);
      if (!playable.url || playable.unavailable) {
        if (neteaseSelectionRef.current === requestId) setLibraryError(playbackReasonMessage(playable.reason));
        return null;
      }
      const updatedTracks = await neteaseProvider.importSong(song.id);
      if (neteaseSelectionRef.current !== requestId) return null;
      setTracks(updatedTracks);
      const imported = updatedTracks.find((track) => track.source === "netease" && sourceIdForTrack(track) === song.id);
      if (!imported) {
        if (neteaseSelectionRef.current === requestId) setLibraryError("This track is unavailable from the current source.");
        return null;
      }
      if (playable.url) {
        preparedPlayableRef.current.set(imported.id, { audioUrl: playable.url });
      }
      return imported;
    } catch (error) {
      if (neteaseSelectionRef.current !== requestId) return null;
      setLibraryError(error instanceof Error ? error.message : "This track is unavailable from the current source.");
      return null;
    }
  };

  const playNetEaseSong = async (song: MusicSourceSong): Promise<boolean> => {
    const imported = await importNetEaseTrack(song);
    if (imported) {
      playLocalTrack(imported);
      return true;
    }
    return false;
  };

  const importBilibiliTrack = async (song: MusicSourceSong): Promise<Track | null> => {
    const requestId = bilibiliSelectionRef.current + 1;
    bilibiliSelectionRef.current = requestId;
    setLibraryError(null);
    try {
      const songId = song.cid && song.bvid ? `${song.bvid}:${song.cid}` : song.id;
      const importedResult = await bilibiliProvider.importSong(songId);
      if (bilibiliSelectionRef.current !== requestId) return null;
      const updatedTracks = importedResult.tracks;

      const requestedBvid = song.bvid ?? song.id.split(":")[0];
      const imported = updatedTracks.find((track) => {
        if (track.source !== "bilibili") return false;
        const sourceId = sourceIdForTrack(track);
        return sourceId === songId || sourceId === requestedBvid || sourceId?.startsWith(`${requestedBvid}:`);
      });
      if (!imported) {
        setLibraryError("This Bilibili track is unavailable from the current source.");
        return null;
      }

      if (isTrackUnavailable(imported)) {
        setLibraryError(playbackReasonMessage(imported.unavailableReason));
        return null;
      }

      const hydrated: Track = {
        ...imported,
        title: imported.title || song.title,
        artist: imported.artist || song.uploader || song.artist,
        album: imported.album || song.album,
        durationSeconds: imported.durationSeconds || song.durationSeconds,
        coverUrl: imported.coverUrl || song.coverUrl
      };
      const hydratedTracks = updatedTracks.map((track) => (track.id === hydrated.id ? hydrated : track));
      setTracks(hydratedTracks);
      if (importedResult.playback.url) {
        preparedPlayableRef.current.set(hydrated.id, {
          audioUrl: importedResult.playback.url,
          videoUrl: importedResult.playback.videoUrl
        });
      }
      return hydrated;
    } catch (error) {
      if (bilibiliSelectionRef.current !== requestId) return null;
      setLibraryError(error instanceof Error ? error.message : "This Bilibili track is unavailable from the current source.");
      return null;
    }
  };

  const playBilibiliSong = async (song: MusicSourceSong): Promise<boolean> => {
    const imported = await importBilibiliTrack(song);
    if (imported) {
      playLocalTrack(imported);
      return true;
    }
    return false;
  };

  return (
    <div className="startup-shell min-h-screen overflow-x-hidden bg-[#d0c6ba] text-[#4a2108]">
      <div className="fixed inset-0 bg-[#d0c6ba]" />
      {currentTrack && (
        <>
          {currentTrack.coverUrl ? (
            <img
              src={currentTrack.coverUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              className="fixed inset-0 h-full w-full scale-[1.28] object-cover opacity-45 blur-[118px] saturate-[1.25] sepia-[0.18]"
            />
          ) : null}
          <div className="fixed inset-0 bg-[radial-gradient(circle_at_62%_45%,rgba(198,96,67,0.34),transparent_34%),radial-gradient(circle_at_28%_61%,rgba(82,86,83,0.42),transparent_38%),linear-gradient(105deg,rgba(190,193,186,0.86)_0%,rgba(207,190,176,0.74)_48%,rgba(225,168,148,0.58)_100%)]" />
        </>
      )}
      {!currentTrack && <div className="fixed inset-0 bg-[linear-gradient(135deg,#bfc0ba,#ddc0ad)]" />}
      <div className="vintage-grain fixed inset-0" />

      <WindowTitlebar />

      <TopSearch tracks={tracks} onPlayLocal={playLocalTrack} onPlayNetEase={playNetEaseSong} onPlayBilibili={playBilibiliSong} />

      <LyricsSourceMenu
        track={currentTrack}
        localTrackCount={tracks.filter((track) => track.source === "local").length}
        lyricOffsetMs={lyricOffsetMs}
        playbackDebug={playbackDebug}
        serviceStatus={sourceServiceStatus}
        loginStatus={sourceLoginStatus}
        playbackQuality={playbackQuality}
        onReloadLyrics={reloadLyrics}
        onImportLyrics={importLyrics}
        onAdjustLyricOffset={adjustLyricOffset}
        onResetLyricOffset={resetLyricOffset}
        onPlaybackQualityChange={changePlaybackQuality}
        onOpenSettings={() => {
          setSettingsFocus("music");
          setProviderSettingsOpen(true);
        }}
        onOpenAtmosphereSettings={() => {
          setSettingsFocus("atmosphere");
          setProviderSettingsOpen(true);
        }}
      />

      {libraryError && currentTrack && (
        <PlaybackNotice
          message={libraryError}
          reason={playbackDebug?.reason ?? currentTrack.unavailableReason}
          onOpenSettings={() => {
            setSettingsFocus("music");
            setProviderSettingsOpen(true);
          }}
        />
      )}

      <main className="relative h-screen overflow-hidden">
        <NowPlayingHero
          track={currentTrack}
          lyrics={lyrics}
          currentLyricIndex={currentLyricIndex}
          lyricWarning={lyricWarning}
          isPlaying={isPlaying}
          isLyricsLoading={isLyricsLoading}
          videoAtmosphereSrc={videoAtmosphereSrc}
          progressSeconds={progressSeconds}
          danmakuItems={danmakuItems}
          danmakuDebug={danmakuDebug}
          isImporting={isImporting}
          error={libraryError}
          onImport={importFolder}
        />
      </main>

      {currentTrack?.source === "bilibili" && isPlaying && danmakuItems.length > 0 && (
        <Suspense fallback={null}>
          <GlobalDanmakuAtmosphereLayer
            items={danmakuItems}
            currentTime={progressSeconds}
            isPlaying={isPlaying}
            trackId={currentTrack.id}
          />
        </Suspense>
      )}

      <OmeRadioPanel
        session={radioSession}
        currentTrack={currentTrack}
        onCreateRadio={createRadioSession}
        onStartRadio={startRadioSession}
      />

      {showDjPanel && (
        <Suspense fallback={<AmbientDjDockFallback />}>
          <DjCuratorPanel
            track={currentTrack}
            tracks={tracks}
            isPlaying={isPlaying}
            volume={volume}
            onPlayLocal={playLocalTrack}
            onPlayNetEase={playNetEaseSong}
            onImportNetEase={importNetEaseTrack}
            onQueueLocal={queueLocalTrack}
            onPlayTemporaryPlaylist={playTemporaryPlaylist}
            onPlayNextSoftly={() => playAdjacentTrack("next", { markSkip: false })}
            onPlayPrevious={() => playAdjacentTrack("previous")}
            onTogglePlay={togglePlay}
            onSetVolume={setVolume}
            onCreateRadioSession={createRadioSession}
            onStartRadioSession={startRadioSession}
            onSoftenRadio={softenRadio}
            onBrightenRadio={brightenRadio}
            onSwitchRadioTheme={switchRadioTheme}
            onDuckingChange={setVoiceDucking}
          />
        </Suspense>
      )}

      <PlayerControls
        track={currentTrack}
        isPlaying={isPlaying}
        progressSeconds={progressSeconds}
        volume={volume}
        shuffle={shuffle}
        loopMode={loopMode}
        onTogglePlay={togglePlay}
        onNext={() => playAdjacentTrack("next")}
        onPrevious={() => playAdjacentTrack("previous")}
        onToggleShuffle={() => setShuffle((value) => !value)}
        onToggleLoop={() => setLoopMode((value) => nextLoopMode(value))}
        onSetProgress={setProgress}
        onSetVolume={setVolume}
      />
      {isProviderSettingsOpen && (
        <Suspense fallback={<SettingsPanelFallback />}>
          <ProviderSettingsPanel
            open={isProviderSettingsOpen}
            focus={settingsFocus}
            playbackQuality={playbackQuality}
            onPlaybackQualityChange={changePlaybackQuality}
            onClose={() => {
              setProviderSettingsOpen(false);
              void neteaseAuthProvider.getLoginStatus().then(setSourceLoginStatus).catch(() => setSourceLoginStatus(null));
            }}
            onLibraryChanged={(updatedTracks) => {
              setTracks(updatedTracks);
              setCurrentTrackId((value) => value ?? updatedTracks[0]?.id ?? null);
              void neteaseProvider.getLatestTasteNotes().then(setTasteNotes).catch(() => setTasteNotes(null));
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function AmbientDjDockFallback() {
  return (
    <div
      className="fixed right-5 top-1/2 z-30 h-16 w-10 -translate-y-1/2 rounded-full border border-[#4a2108]/[0.045] bg-[#eadbcd]/[0.22] shadow-[0_18px_54px_rgba(74,33,8,0.10)] backdrop-blur-2xl"
      aria-hidden="true"
    />
  );
}

function SettingsPanelFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#120b08]/34 px-6 backdrop-blur-[6px]" aria-hidden="true">
      <div className="h-[min(80vh,720px)] w-[min(1080px,calc(100vw-3rem))] rounded-[28px] border border-white/[0.07] bg-[#1b1410]/82 shadow-[0_34px_110px_rgba(0,0,0,0.45)]" />
    </div>
  );
}

function PlaybackNotice({
  message,
  reason,
  onOpenSettings
}: {
  message: string;
  reason?: string | null;
  onOpenSettings: () => void;
}) {
  const label = playbackNoticeLabel(reason);

  return (
    <div data-danmaku-safe-zone="playback-notice" className="fixed left-1/2 top-[5.6rem] z-40 w-[min(520px,calc(100vw-3rem))] -translate-x-1/2 rounded-[24px] border border-[#4a2108]/[0.055] bg-[#dfd1c4]/45 px-4 py-3 text-[#4a2108] shadow-[0_18px_54px_rgba(74,33,8,0.13)] backdrop-blur-2xl">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#7a2d1c]/65 shadow-[0_0_22px_rgba(122,45,28,0.38)]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#4a2108]/38">{label}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[#4a2108]/68">{message}</p>
        </div>
        {(reason === "not_logged_in" || reason === "cookie_missing" || reason === "cookie_expired" || reason === "vip_required" || reason === "trial_only") && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="app-transition rounded-full bg-[#4a2108]/[0.08] px-3 py-1.5 text-xs font-black text-[#4a2108]/54 hover:bg-[#4a2108]/[0.13] hover:text-[#4a2108]/84"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

function playbackNoticeLabel(reason?: string | null): string {
  switch (reason) {
    case "trial_only":
      return "Preview only";
    case "vip_required":
      return "Membership needed";
    case "not_logged_in":
    case "cookie_missing":
      return "Sign in needed";
    case "cookie_expired":
      return "Reconnect source";
    case "no_copyright":
      return "Copyright limited";
    case "region_restricted":
      return "Region limited";
    case "song_removed":
      return "No longer available";
    case "video_removed":
      return "No longer available";
    case "playurl_failed":
    case "audio_stream_missing":
      return "Source quiet";
    default:
      return "Unable to play";
  }
}
