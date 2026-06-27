import { NetEaseMusicProvider, type MusicSourceSong } from "../musicSources/provider";
import type { RadioKind, RadioSession } from "../radio/omeRadio";
import type { Track, TrackMood } from "../../types/music";

export type CuratorAgentStatus =
  | "Listening..."
  | "Searching..."
  | "Turning..."
  | "Queued."
  | "Playlist ready."
  | "Paused."
  | "Playing."
  | "Softened."
  | "Louder."
  | "Tuning the room..."
  | "Searching the room..."
  | "Choosing the next record..."
  | "Placing records on the shelf..."
  | "On Air"
  | "Unchanged.";

export interface CuratorAgentContext {
  currentTrack: Track | null;
  localTracks: Track[];
  isPlaying: boolean;
  volume: number;
  playLocalTrack: (track: Track) => void;
  playNetEaseSong: (song: MusicSourceSong) => Promise<boolean>;
  importNetEaseSong: (song: MusicSourceSong) => Promise<Track | null>;
  queueTrack: (track: Track) => void;
  playTemporaryPlaylist: (title: string, tracks: Track[]) => void;
  playNextTrack: (mood?: TrackMood) => void;
  playPreviousTrack: () => void;
  togglePlayback: () => void;
  setVolume: (volume: number) => void;
  createRadioSession: (args: {
    kind?: RadioKind;
    theme?: string;
    mood?: TrackMood;
    scene?: string;
  }) => RadioSession | null;
  startRadioSession: (sessionId?: string) => boolean;
  softenRadio: (level?: number) => RadioSession | null;
  brightenRadio: (level?: number) => RadioSession | null;
  switchRadioTheme: (kind: RadioKind, theme?: string) => RadioSession | null;
}

export interface CuratorAgentResult {
  handled: boolean;
  status: CuratorAgentStatus;
  reply: string;
  playbackChanged: boolean;
  candidates?: Array<Track | MusicSourceSong>;
  debug: CuratorAgentDebug;
}

export interface CuratorAgentDebug {
  userMessage: string;
  detectedIntent: string;
  plannedAction: string;
  selectedTool: string;
  toolArguments: Record<string, unknown>;
  searchResultsCount: number;
  selectedTrack?: string;
  playableUrlStatus?: string;
  playbackChanged: boolean;
  createdPlaylistId?: string;
  queueLength: number;
  finalReply: string;
  error?: string;
}

type VolumeDirection = "up" | "down" | "mute" | "restore";
type MusicSourceScope = "local" | "netease" | "all";

interface ParsedIntent {
  type:
    | "play_artist"
    | "play_song"
    | "queue_song"
    | "recommend"
    | "create_playlist"
    | "create_radio"
    | "start_radio"
    | "soften_radio"
    | "brighten_radio"
    | "switch_radio_theme"
    | "next"
    | "previous"
    | "pause"
    | "resume"
    | "volume"
    | "mood_signal"
    | "greeting"
    | "chat";
  query?: string;
  label?: string;
  mood?: TrackMood;
  theme?: string;
  scene?: string;
  language?: "zh" | "en" | "unknown";
  source?: MusicSourceScope;
  volumeDirection?: VolumeDirection;
  radioKind?: RadioKind;
}

interface SearchMusicArgs {
  query?: string;
  mood?: TrackMood;
  artist?: string;
  theme?: string;
  language?: "zh" | "en" | "unknown";
  source?: MusicSourceScope;
  limit?: number;
}

interface SearchMusicResult {
  local: Track[];
  netease: MusicSourceSong[];
}

const neteaseProvider = new NetEaseMusicProvider();

export async function runCuratorAgent(
  message: string,
  context: CuratorAgentContext,
): Promise<CuratorAgentResult> {
  const intent = parseCuratorIntent(message);
  const debug = createDebug(message, intent);

  try {
    switch (intent.type) {
      case "greeting":
        return finish(debug, {
          handled: true,
          status: "Listening...",
          reply: greetingReply(context.currentTrack),
          playbackChanged: false,
        });

      case "pause":
        debug.plannedAction = "pause playback";
        debug.selectedTool = "pause_player";
        if (context.isPlaying) context.togglePlayback();
        return finish(debug, {
          handled: true,
          status: "Paused.",
          reply: "I will let the room go quiet for a moment.",
          playbackChanged: context.isPlaying,
        });

      case "resume":
        debug.plannedAction = "resume playback";
        debug.selectedTool = "resume_player";
        if (!context.isPlaying) context.togglePlayback();
        return finish(debug, {
          handled: true,
          status: "Playing.",
          reply: "Back on the air, softly.",
          playbackChanged: !context.isPlaying,
        });

      case "next":
        debug.plannedAction = "skip to next track";
        debug.selectedTool = "next_track";
        context.playNextTrack(intent.mood);
        return finish(debug, {
          handled: true,
          status: "Turning...",
          reply: intent.mood ? moodReply(intent.mood) : "Let us move the needle along.",
          playbackChanged: true,
        });

      case "previous":
        debug.plannedAction = "play previous track";
        debug.selectedTool = "previous_track";
        context.playPreviousTrack();
        return finish(debug, {
          handled: true,
          status: "Turning...",
          reply: "One step back on the record shelf.",
          playbackChanged: true,
        });

      case "volume":
        debug.plannedAction = "adjust volume";
        debug.selectedTool = "set_volume";
        debug.toolArguments = { direction: intent.volumeDirection };
        context.setVolume(nextVolumeValue(context.volume, intent.volumeDirection));
        return finish(debug, {
          handled: true,
          status: volumeStatus(intent.volumeDirection),
          reply: volumeReply(intent.volumeDirection),
          playbackChanged: false,
        });

      case "create_radio":
        return createAndStartRadio(intent, context, debug);

      case "start_radio":
        return startCurrentRadio(intent, context, debug);

      case "soften_radio":
        return softenCurrentRadio(intent, context, debug);

      case "brighten_radio":
        return brightenCurrentRadio(intent, context, debug);

      case "switch_radio_theme":
        return switchRadioTheme(intent, context, debug);

      case "recommend":
        return recommendAndPlay(intent, context, debug);

      case "create_playlist":
        return createAndPlayTemporaryPlaylist(intent, context, debug);

      case "play_artist":
      case "play_song":
        return searchAndPlay(intent, context, debug);

      case "queue_song":
        return searchAndQueue(intent, context, debug);

      case "mood_signal":
        debug.plannedAction = "record mood and ask before changing music";
        debug.selectedTool = "update_mood_signal";
        debug.toolArguments = { mood: intent.mood, confidence: 0.72, sourceMessage: message };
        return finish(debug, {
          handled: true,
          status: "Listening...",
          reply: "I hear you. Shall I make the room softer?",
          playbackChanged: false,
        });

      default:
        return finish(debug, {
          handled: false,
          status: "Listening...",
          reply: "",
          playbackChanged: false,
        });
    }
  } catch (error) {
    debug.error = error instanceof Error ? error.message : String(error);
    return finish(debug, {
      handled: true,
      status: "Unchanged.",
      reply: "The booth caught a little dust there. Try me once more, and I will keep it simple.",
      playbackChanged: false,
    });
  }
}

async function searchAndQueue(
  intent: ParsedIntent,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): Promise<CuratorAgentResult> {
  const query = intent.query || intent.label || debug.userMessage;
  debug.plannedAction = "search music and queue first playable match";
  debug.selectedTool = "search_music";
  debug.toolArguments = { query, source: intent.source ?? "all", limit: 8 };

  const results = await searchMusic(
    { query, source: intent.source ?? "all", limit: 8 },
    context.localTracks,
  );
  debug.searchResultsCount = results.local.length + results.netease.length;
  const track = await materializeFirstPlayable(results, context, debug);

  if (track) {
    debug.selectedTool = "queue_track";
    debug.selectedTrack = track.title;
    context.queueTrack(track);
    return finish(debug, {
      handled: true,
      status: "Queued.",
      reply: "I have slipped it into the queue for you.",
      playbackChanged: false,
      candidates: [track, ...results.local, ...results.netease].slice(0, 4),
    });
  }

  return finish(debug, {
    handled: true,
    status: "Unchanged.",
    reply: "I found the name, but not a clean playable pressing for the queue.",
    playbackChanged: false,
    candidates: [...results.local, ...results.netease].slice(0, 4),
  });
}

async function searchAndPlay(
  intent: ParsedIntent,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): Promise<CuratorAgentResult> {
  const query = intent.query || intent.label || debug.userMessage;
  debug.plannedAction = "search music and play first playable match";
  debug.selectedTool = "search_music";
  debug.toolArguments = { query, source: intent.source ?? "all", limit: 8 };

  const results = await searchMusic(
    { query, source: intent.source ?? "all", limit: 8 },
    context.localTracks,
  );
  debug.searchResultsCount = results.local.length + results.netease.length;

  const selected = await playFirstPlayable(results, context, debug);
  if (selected) {
    return finish(debug, {
      handled: true,
      status: "Turning...",
      reply: playReply(intent.label || query, selected),
      playbackChanged: true,
      candidates: [...results.local, ...results.netease].slice(0, 4),
    });
  }

  return finish(debug, {
    handled: true,
    status: "Unchanged.",
    reply: "I found the name, but not a clean playable pressing tonight.",
    playbackChanged: false,
    candidates: [...results.local, ...results.netease].slice(0, 4),
  });
}

async function recommendAndPlay(
  intent: ParsedIntent,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): Promise<CuratorAgentResult> {
  debug.plannedAction = "recommend tracks and play the best match";
  debug.selectedTool = "recommend_tracks";
  debug.toolArguments = {
    mood: intent.mood,
    theme: intent.theme,
    scene: intent.scene,
    source: intent.source ?? "all",
    limit: 12,
  };

  const results = await recommendTracks(intent, context.localTracks, 12);
  debug.searchResultsCount = results.local.length + results.netease.length;
  const selected = await playFirstPlayable(results, context, debug);
  if (selected) {
    return finish(debug, {
      handled: true,
      status: "Turning...",
      reply: moodReply(intent.mood, intent.theme),
      playbackChanged: true,
      candidates: [...results.local, ...results.netease].slice(0, 4),
    });
  }

  return finish(debug, {
    handled: true,
    status: "Unchanged.",
    reply: "I looked through the shelf, but nothing playable felt right just now.",
    playbackChanged: false,
    candidates: [...results.local, ...results.netease].slice(0, 4),
  });
}

async function createAndPlayTemporaryPlaylist(
  intent: ParsedIntent,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): Promise<CuratorAgentResult> {
  const theme = intent.theme || intent.query || "late night";
  const title = temporaryPlaylistTitle(theme, intent.mood);
  debug.plannedAction = "create temporary playlist and play it";
  debug.selectedTool = "create_temporary_playlist";
  debug.toolArguments = {
    title,
    theme,
    mood: intent.mood,
    source: intent.source ?? "all",
    limit: 16,
  };

  const results = await recommendTracks(
    { ...intent, theme, source: intent.source ?? "all" },
    context.localTracks,
    24,
  );
  debug.searchResultsCount = results.local.length + results.netease.length;
  const playlistTracks = await materializePlaylistTracks(results, context, 16, debug);
  debug.queueLength = Math.max(0, playlistTracks.length - 1);

  if (playlistTracks.length === 0) {
    return finish(debug, {
      handled: true,
      status: "Unchanged.",
      reply: "I tried to build the set, but the shelf did not give me enough playable records.",
      playbackChanged: false,
      candidates: [...results.local, ...results.netease].slice(0, 4),
    });
  }

  debug.createdPlaylistId = `temporary:${Date.now()}`;
  debug.selectedTrack = playlistTracks[0].title;
  debug.selectedTool = "play_playlist";
  context.playTemporaryPlaylist(title, playlistTracks);

  return finish(debug, {
    handled: true,
    status: "Playlist ready.",
    reply: playlistReply(theme),
    playbackChanged: true,
    candidates: playlistTracks.slice(0, 4),
  });
}

function createAndStartRadio(
  intent: ParsedIntent,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): CuratorAgentResult {
  const kind = intent.radioKind ?? radioKindFromTheme(intent.theme) ?? "daily";
  debug.plannedAction = "create an Ome Radio session and start it";
  debug.selectedTool = "create_radio_session";
  debug.toolArguments = { kind, theme: intent.theme, mood: intent.mood, scene: intent.scene };

  const session = context.createRadioSession({
    kind,
    theme: intent.theme,
    mood: intent.mood,
    scene: intent.scene,
  });
  debug.createdPlaylistId = session?.id;
  debug.queueLength = Math.max(0, (session?.tracks.length ?? 0) - 1);
  debug.selectedTrack = session?.tracks[0]?.title;

  if (!session || session.tracks.length === 0) {
    return finish(debug, {
      handled: true,
      status: "Unchanged.",
      reply: "I tried to tune the room, but the shelf needs a few playable records first.",
      playbackChanged: false,
    });
  }

  debug.selectedTool = "start_radio_session";
  const started = context.startRadioSession(session.id);
  return finish(debug, {
    handled: true,
    status: started ? "On Air" : "Unchanged.",
    reply: radioStartedReply(kind),
    playbackChanged: started,
    candidates: session.tracks.slice(0, 4),
  });
}

function startCurrentRadio(
  intent: ParsedIntent,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): CuratorAgentResult {
  debug.plannedAction = "start the current Ome Radio session";
  debug.selectedTool = "start_radio_session";
  debug.toolArguments = { theme: intent.theme };
  const started = context.startRadioSession();

  return finish(debug, {
    handled: true,
    status: started ? "On Air" : "Unchanged.",
    reply: started
      ? "We are on air. I will keep the records close to the room."
      : "The radio needs a few playable records before it can breathe.",
    playbackChanged: started,
  });
}

function softenCurrentRadio(
  intent: ParsedIntent,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): CuratorAgentResult {
  debug.plannedAction = "soften the Ome Radio session";
  debug.selectedTool = "soften_radio";
  debug.toolArguments = { level: 1, mood: intent.mood ?? "calm" };
  const session = context.softenRadio(1);
  debug.createdPlaylistId = session?.id;
  debug.queueLength = Math.max(0, (session?.tracks.length ?? 0) - 1);
  debug.selectedTrack = session?.tracks[0]?.title;

  if (!session || session.tracks.length === 0) {
    return finish(debug, {
      handled: true,
      status: "Unchanged.",
      reply: "I would soften it, but the quiet shelf is a little bare tonight.",
      playbackChanged: false,
    });
  }

  debug.selectedTool = "start_radio_session";
  const started = context.startRadioSession(session.id);
  return finish(debug, {
    handled: true,
    status: started ? "Softened." : "Unchanged.",
    reply: "I have softened the room. We will stay near the quieter records.",
    playbackChanged: started,
    candidates: session.tracks.slice(0, 4),
  });
}

function brightenCurrentRadio(
  intent: ParsedIntent,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): CuratorAgentResult {
  debug.plannedAction = "brighten the Ome Radio session";
  debug.selectedTool = "brighten_radio";
  debug.toolArguments = { level: 1, theme: intent.theme ?? "brighter room" };
  const session = context.brightenRadio(1);
  debug.createdPlaylistId = session?.id;
  debug.queueLength = Math.max(0, (session?.tracks.length ?? 0) - 1);
  debug.selectedTrack = session?.tracks[0]?.title;

  if (!session || session.tracks.length === 0) {
    return finish(debug, {
      handled: true,
      status: "Unchanged.",
      reply: "I looked for a brighter shelf, but nothing playable stepped forward.",
      playbackChanged: false,
    });
  }

  debug.selectedTool = "start_radio_session";
  const started = context.startRadioSession(session.id);
  return finish(debug, {
    handled: true,
    status: started ? "On Air" : "Unchanged.",
    reply: "A little more daylight in the room. I have opened the window just enough.",
    playbackChanged: started,
    candidates: session.tracks.slice(0, 4),
  });
}

function switchRadioTheme(
  intent: ParsedIntent,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): CuratorAgentResult {
  const kind = intent.radioKind ?? radioKindFromTheme(intent.theme) ?? "memory";
  debug.plannedAction = "switch Ome Radio theme";
  debug.selectedTool = "switch_radio_theme";
  debug.toolArguments = { kind, theme: intent.theme, mood: intent.mood, scene: intent.scene };
  const session = context.switchRadioTheme(kind, intent.theme);
  debug.createdPlaylistId = session?.id;
  debug.queueLength = Math.max(0, (session?.tracks.length ?? 0) - 1);
  debug.selectedTrack = session?.tracks[0]?.title;

  if (!session || session.tracks.length === 0) {
    return finish(debug, {
      handled: true,
      status: "Unchanged.",
      reply: "I reached for that shelf, but there is not enough playable music there yet.",
      playbackChanged: false,
    });
  }

  debug.selectedTool = "start_radio_session";
  const started = context.startRadioSession(session.id);
  return finish(debug, {
    handled: true,
    status: started ? "On Air" : "Unchanged.",
    reply: radioStartedReply(kind),
    playbackChanged: started,
    candidates: session.tracks.slice(0, 4),
  });
}

async function materializeFirstPlayable(
  results: SearchMusicResult,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): Promise<Track | null> {
  const local = results.local.find((track) => !track.filePath.startsWith("unavailable:"));
  if (local) {
    debug.playableUrlStatus = "local";
    return local;
  }

  for (const song of results.netease.filter((item) => !item.unavailable).slice(0, 8)) {
    const imported = await context.importNetEaseSong(song);
    if (imported) {
      debug.playableUrlStatus = "playable";
      return imported;
    }
    debug.playableUrlStatus = "candidate_unavailable";
  }

  return null;
}

async function playFirstPlayable(
  results: SearchMusicResult,
  context: CuratorAgentContext,
  debug: CuratorAgentDebug,
): Promise<Track | MusicSourceSong | null> {
  const local = results.local.find((track) => !track.filePath.startsWith("unavailable:"));
  if (local) {
    debug.selectedTool = "play_track";
    debug.selectedTrack = local.title;
    debug.playableUrlStatus = "local";
    context.playLocalTrack(local);
    return local;
  }

  for (const song of results.netease.filter((item) => !item.unavailable).slice(0, 8)) {
    debug.selectedTool = "play_track";
    debug.selectedTrack = song.title;
    debug.toolArguments = { trackId: song.id, source: "netease" };
    const played = await context.playNetEaseSong(song);
    if (played) {
      debug.playableUrlStatus = "playable";
      return song;
    }
    debug.playableUrlStatus = "candidate_unavailable";
  }

  return null;
}

async function materializePlaylistTracks(
  results: SearchMusicResult,
  context: CuratorAgentContext,
  limit: number,
  debug: CuratorAgentDebug,
): Promise<Track[]> {
  const tracks: Track[] = [];
  const seen = new Set<string>();
  const addTrack = (track: Track) => {
    if (seen.has(track.id) || track.filePath.startsWith("unavailable:")) return;
    seen.add(track.id);
    tracks.push(track);
  };

  for (const track of results.local) {
    addTrack(track);
    if (tracks.length >= limit) return tracks;
  }

  for (const song of results.netease.filter((item) => !item.unavailable).slice(0, limit * 2)) {
    if (tracks.length >= limit) break;
    const imported = await context.importNetEaseSong(song);
    if (imported) {
      addTrack(imported);
      debug.playableUrlStatus = "playlist_candidate_playable";
    } else {
      debug.playableUrlStatus = "playlist_candidate_unavailable";
    }
  }

  return tracks;
}

async function recommendTracks(
  intent: ParsedIntent,
  localTracks: Track[],
  limit: number,
): Promise<SearchMusicResult> {
  const local = rankLocalTracks(localTracks, intent).slice(0, limit);
  const query = buildSearchQuery(intent);
  let netease: MusicSourceSong[] = [];

  if ((intent.source ?? "all") !== "local" && query) {
    try {
      netease = (await neteaseProvider.searchSongs(query)).slice(0, limit);
    } catch {
      netease = [];
    }
  }

  return {
    local: (intent.source ?? "all") === "netease" ? [] : local,
    netease,
  };
}

async function searchMusic(
  args: SearchMusicArgs,
  localTracks: Track[],
): Promise<SearchMusicResult> {
  const query = [args.artist, args.query, args.theme].filter(Boolean).join(" ").trim();
  const normalized = query.toLowerCase();
  const limit = args.limit ?? 8;
  const local =
    (args.source ?? "all") === "netease"
      ? []
      : localTracks
          .filter((track) => {
            const haystack =
              `${track.title} ${track.artist} ${track.album} ${track.genres.join(" ")} ${track.moods.join(" ")}`.toLowerCase();
            return normalized ? haystack.includes(normalized) : matchTrackMoodTheme(track, args);
          })
          .slice(0, limit);

  let netease: MusicSourceSong[] = [];
  if ((args.source ?? "all") !== "local" && query) {
    try {
      netease = (await neteaseProvider.searchSongs(query)).slice(0, limit);
    } catch {
      netease = [];
    }
  }

  return { local, netease };
}

function parseCuratorIntent(raw: string): ParsedIntent {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const radioIntent = parseRadioIntent(text, lower);
  if (radioIntent) return radioIntent;
  const calm =
    /(安静|轻一点|柔和|放松|雨天|夜晚|深夜|慢一点|不吵|quiet|soft|calm|rain|rainy|late|tired|gentle)/i.test(
      text,
    );
  const theme = extractTheme(text);
  const language = /中文|华语|国语|mandarin|chinese/i.test(text) ? "zh" : undefined;

  if (/^(hi|hello|hey|good evening|good night|晚安|晚上好|你好|哈喽|嗨)[。.!！\s]*$/i.test(text)) {
    return { type: "greeting" };
  }
  if (/(暂停|停一下|先停|pause|stop for a moment|hold it)/i.test(text)) {
    return { type: "pause" };
  }
  if (
    /(继续|播放|开始|接着|resume|continue|play again|back on)/i.test(text) &&
    !hasMusicQuery(text)
  ) {
    return { type: "resume" };
  }
  if (/(上一首|上一曲|previous|go back|last track)/i.test(text)) {
    return { type: "previous" };
  }
  if (/(加入队列|排到后面|等下播放|queue|add to queue)/i.test(text)) {
    return {
      type: "queue_song",
      query: cleanupMusicQuery(text),
      label: cleanupMusicQuery(text),
      language,
    };
  }
  if (/(下一首|换一首|切歌|next|change|skip)/i.test(text)) {
    return {
      type: "next",
      mood: calm ? "calm" : undefined,
      scene: isRainy(text, lower) ? "rainy" : undefined,
    };
  }
  if (/(大声|响一点|音量大|louder|volume up|turn it up)/i.test(text)) {
    return { type: "volume", volumeDirection: "up" };
  }
  if (/(小声|轻一点|音量小|lower|quieter|volume down|turn it down)/i.test(text)) {
    return { type: "volume", volumeDirection: "down" };
  }
  if (/(静音|mute)/i.test(text)) {
    return { type: "volume", volumeDirection: "mute" };
  }

  if (
    /(歌单|一组|一套|安排|弄一些|做一个|playlist|set|mix)/i.test(text) &&
    (theme || calm || hasMusicQuery(text))
  ) {
    return {
      type: "create_playlist",
      query: cleanupMusicQuery(text),
      theme: theme || (calm ? "quiet" : cleanupMusicQuery(text)),
      mood: calm ? "calm" : moodFromTheme(theme),
      scene: isRainy(text, lower) ? "rainy" : undefined,
      language,
    };
  }

  if (
    /(推荐|来点|放点|帮我放|给我放|放一首|随便放|recommend|suggest|play something|put on something)/i.test(
      text,
    ) &&
    (calm || theme)
  ) {
    return {
      type: "recommend",
      query: cleanupMusicQuery(text),
      theme: theme || (calm ? "quiet" : undefined),
      mood: calm ? "calm" : moodFromTheme(theme),
      scene: isRainy(text, lower) ? "rainy" : undefined,
      language,
    };
  }

  const artist = extractArtist(text);
  if (artist) {
    return { type: "play_artist", query: artist.query, label: artist.label, language };
  }

  if (hasMusicQuery(text)) {
    return {
      type: "play_song",
      query: cleanupMusicQuery(text),
      label: cleanupMusicQuery(text),
      language,
    };
  }

  if (/(累|疲惫|焦虑|烦|难过|tired|anxious|worn out|drained|sad|blue)/i.test(text)) {
    return { type: "mood_signal", mood: "tired" };
  }

  return { type: "chat" };
}

function parseRadioIntent(text: string, lower: string): ParsedIntent | null {
  const language = /中文|华语|国语|mandarin|chinese/i.test(text) ? "zh" : undefined;
  const kind = radioKindFromText(text, lower);
  const theme = extractTheme(text) || (kind ? themeFromRadioKind(kind) : undefined);

  if (wantsSofterRadio(text, lower)) {
    return {
      type: "soften_radio",
      radioKind: "quietRoom",
      theme: "quiet",
      mood: "calm",
      scene: sceneFromRadioKind("quietRoom"),
      language,
    };
  }

  if (wantsBrighterRadio(text, lower)) {
    return {
      type: "brighten_radio",
      radioKind: "discovery",
      theme: "brighter room",
      mood: "energetic",
      scene: "A brighter room",
      language,
    };
  }

  if (wantsFamiliarRadio(text, lower)) {
    return {
      type: "switch_radio_theme",
      radioKind: "memory",
      theme: "familiar records",
      scene: sceneFromRadioKind("memory"),
      language,
    };
  }

  if (kind && wantsRadio(text, lower)) {
    return {
      type: "create_radio",
      radioKind: kind,
      theme,
      mood: moodFromRadioKind(kind),
      scene: sceneFromRadioKind(kind),
      language,
    };
  }

  if (wantsStartCurrentRadio(text, lower)) {
    return {
      type: "start_radio",
      theme,
      mood: moodFromTheme(theme),
      scene: sceneFromRadioKind("daily"),
      language,
    };
  }

  return null;
}

function wantsRadio(text: string, lower: string): boolean {
  return (
    /radio|station|broadcast|on air/i.test(lower) || /电台|开播|放送|私人台|私人电台/.test(text)
  );
}

function wantsStartCurrentRadio(text: string, lower: string): boolean {
  return (
    /(start|begin|go on air|turn on|play)\s+(the\s+)?(radio|station|broadcast)/i.test(lower) ||
    /开始电台|开播|播放电台|打开电台/.test(text)
  );
}

function wantsSofterRadio(text: string, lower: string): boolean {
  const mentionsVolume =
    /volume|sound|turn it down|lower the volume|音量|小声/.test(lower) || /音量|小声/.test(text);
  if (mentionsVolume) return false;
  return (
    /make it softer|soften|quieter records|quiet room|calmer|less loud|slow it down/i.test(lower) ||
    /安静一点|安静点|柔和一点|柔和点|轻一点|轻点|慢一点|不吵|放松一点/.test(text)
  );
}

function wantsBrighterRadio(text: string, lower: string): boolean {
  return (
    /make it brighter|brighter|more light|more energy|lift it up/i.test(lower) ||
    /亮一点|亮点|轻快一点|更轻快|精神一点|有活力一点/.test(text)
  );
}

function wantsFamiliarRadio(text: string, lower: string): boolean {
  return (
    /more familiar|familiar records|old favorites|my usual|closer to home|memory radio/i.test(
      lower,
    ) || /更熟悉|熟悉一点|熟悉点|老歌|回忆电台|记忆电台|常听的/.test(text)
  );
}

function radioKindFromText(text: string, lower: string): RadioKind | undefined {
  if (/青春|少年|年轻/.test(text) || /youth|young|school days/i.test(lower)) return "youth";
  if (/雨天|下雨/.test(text) || /rain|rainy/i.test(lower)) return "rainyDay";
  if (/深夜|夜晚|晚上|午夜/.test(text) || /late night|midnight|after dark|night radio/i.test(lower))
    return "lateNight";
  if (/安静|柔和|放松|不吵/.test(text) || /quiet|soft|calm|gentle/i.test(lower)) return "quietRoom";
  if (/探索|新鲜|没听过/.test(text) || /discovery|discover|surprise me|something new/i.test(lower))
    return "discovery";
  if (/回忆|记忆|熟悉|常听/.test(text) || /memory|familiar|old favorites/i.test(lower))
    return "memory";
  if (wantsRadio(text, lower)) return "daily";
  return undefined;
}

function radioKindFromTheme(theme?: string): RadioKind | undefined {
  if (theme === "youth") return "youth";
  if (theme === "rainy day") return "rainyDay";
  if (theme === "late night") return "lateNight";
  if (theme === "quiet" || theme === "writing") return "quietRoom";
  if (theme === "nostalgia") return "memory";
  return undefined;
}

function themeFromRadioKind(kind: RadioKind): string {
  switch (kind) {
    case "youth":
      return "youth";
    case "rainyDay":
      return "rainy day";
    case "lateNight":
      return "late night";
    case "quietRoom":
      return "quiet";
    case "discovery":
      return "soft discovery";
    case "memory":
      return "familiar records";
    case "artist":
      return "artist shelf";
    default:
      return "private radio";
  }
}

function moodFromRadioKind(kind: RadioKind): TrackMood | undefined {
  switch (kind) {
    case "quietRoom":
    case "lateNight":
    case "rainyDay":
      return "calm";
    case "youth":
      return "dreamy";
    case "memory":
      return "melancholy";
    case "discovery":
      return "energetic";
    default:
      return undefined;
  }
}

function sceneFromRadioKind(kind: RadioKind): string {
  switch (kind) {
    case "lateNight":
      return "A late room";
    case "rainyDay":
      return "Rain on the window";
    case "quietRoom":
      return "A softer room";
    case "discovery":
      return "A small detour";
    case "youth":
      return "A younger light";
    case "memory":
      return "The private archive";
    default:
      return "Today";
  }
}

function extractArtist(text: string): { query: string; label: string } | null {
  const knownAliases: Array<[RegExp, string, string]> = [
    [/\bjj\b|林俊杰|林俊傑/i, "林俊杰", "JJ Lin"],
    [/周杰伦|周杰倫|jay chou/i, "周杰伦", "Jay Chou"],
    [/陈奕迅|陳奕迅|eason/i, "陈奕迅", "Eason Chan"],
    [/王菲|faye wong/i, "王菲", "Faye Wong"],
    [/孙燕姿|孫燕姿|stefanie sun/i, "孙燕姿", "Stefanie Sun"],
  ];

  for (const [pattern, query, label] of knownAliases) {
    if (pattern.test(text)) return { query, label };
  }

  const match = text.match(
    /(?:想听|聽|听|播放|放|来点|play|put on)\s*([A-Za-z0-9\u4e00-\u9fa5 .·-]{1,32})(?:的|音乐|歌|music|songs)?/i,
  );
  const value = match?.[1]?.trim();
  return value ? { query: value, label: value } : null;
}

function extractTheme(text: string): string | undefined {
  const themes: Array<[RegExp, string]> = [
    [/青春|少年|年轻|youth|young/i, "youth"],
    [/雨天|下雨|rain|rainy/i, "rainy day"],
    [/深夜|夜晚|晚上|late night|night/i, "late night"],
    [/写作|写东西|writing/i, "writing"],
    [/安静|不吵|柔和|quiet|soft|gentle/i, "quiet"],
    [/怀旧|nostalgic|old days/i, "nostalgia"],
  ];
  return themes.find(([pattern]) => pattern.test(text))?.[1];
}

function moodFromTheme(theme?: string): TrackMood | undefined {
  if (!theme) return undefined;
  if (["quiet", "rainy day", "late night", "writing"].includes(theme)) return "calm";
  if (theme === "nostalgia") return "melancholy";
  if (theme === "youth") return "dreamy";
  return undefined;
}

function cleanupMusicQuery(text: string): string {
  return (
    text
      .replace(
        /我想听|想听|播放|给我放|帮我放|放一首|来点|放点|推荐|弄一些|做一个|搞一个|歌单|play|put on|recommend|music|songs|音乐|歌曲|的歌/gi,
        " ",
      )
      .replace(/加入队列|排到后面|等下播放|queue|add to queue/gi, " ")
      .replace(/\s+/g, " ")
      .trim() || text
  );
}

function hasMusicQuery(text: string): boolean {
  return /(想听|播放|给我放|帮我放|放一首|来点|放点|play|put on)/i.test(text);
}

function isRainy(text: string, lower: string): boolean {
  return lower.includes("rain") || text.includes("雨");
}

function rankLocalTracks(tracks: Track[], intent: ParsedIntent): Track[] {
  return tracks
    .map((track) => ({ track, score: scoreTrack(track, intent) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);
}

function scoreTrack(track: Track, intent: ParsedIntent): number {
  let score = 0;
  const haystack =
    `${track.title} ${track.artist} ${track.album} ${track.genres.join(" ")} ${track.moods.join(" ")}`.toLowerCase();
  const theme = intent.theme?.toLowerCase();
  const query = intent.query?.toLowerCase();
  const calmWords = ["calm", "dreamy", "romantic", "melancholy", "focused", "tired"];

  if (query && haystack.includes(query)) score += 4;
  if (intent.mood && track.moods.includes(intent.mood)) score += 5;
  if (intent.mood === "calm" && track.moods.some((mood) => calmWords.includes(mood))) score += 2;
  if (intent.language && intent.language !== "unknown" && track.language === intent.language)
    score += 2;
  if (theme && matchTheme(track, theme)) score += 4;
  if (track.liked) score += 1.5;
  score += Math.min(2, track.playCount * 0.12);
  score -= Math.min(2, track.skipCount * 0.25);
  return score;
}

function matchTrackMoodTheme(track: Track, args: SearchMusicArgs): boolean {
  return Boolean(
    (args.mood && track.moods.includes(args.mood)) ||
    (args.theme && matchTheme(track, args.theme)) ||
    (args.language && args.language !== "unknown" && track.language === args.language),
  );
}

function matchTheme(track: Track, theme: string): boolean {
  const value =
    `${track.title} ${track.artist} ${track.album} ${track.genres.join(" ")} ${track.moods.join(" ")}`.toLowerCase();
  if (theme === "youth") return /青春|少年|young|youth|sun|bright|dream|pop/.test(value);
  if (theme === "rainy day")
    return /rain|雨|ambient|jazz|lo-fi|lofi|dream|melancholy|calm/.test(value);
  if (theme === "late night") return /night|夜|jazz|ambient|lo-fi|lofi|calm|dream|soul/.test(value);
  if (theme === "writing")
    return /ambient|piano|lo-fi|lofi|focus|calm|instrumental|jazz/.test(value);
  if (theme === "quiet") return /calm|quiet|soft|ambient|piano|ballad|jazz|acoustic/.test(value);
  if (theme === "nostalgia") return /old|memory|nostalgia|retro|melancholy|dream/.test(value);
  return value.includes(theme.toLowerCase());
}

function buildSearchQuery(intent: ParsedIntent): string {
  if (intent.theme === "youth")
    return intent.language === "zh" ? "青春 华语" : "youth nostalgic pop";
  if (intent.theme === "rainy day")
    return intent.language === "zh" ? "雨天 安静" : "rainy day soft";
  if (intent.theme === "late night")
    return intent.language === "zh" ? "深夜 安静" : "late night soft";
  if (intent.theme === "writing")
    return intent.language === "zh" ? "写作 安静 纯音乐" : "writing calm instrumental";
  if (intent.theme === "quiet") return intent.language === "zh" ? "安静 华语" : "quiet soft";
  if (intent.query) return intent.query;
  return intent.mood === "calm" ? "安静" : "";
}

function nextVolumeValue(current: number, direction: VolumeDirection = "down"): number {
  if (direction === "mute") return 0;
  if (direction === "restore") return Math.max(current, 0.42);
  const delta = direction === "up" ? 0.12 : -0.12;
  return Math.max(0, Math.min(1, current + delta));
}

function volumeStatus(direction?: VolumeDirection): CuratorAgentStatus {
  if (direction === "up") return "Louder.";
  return "Softened.";
}

function volumeReply(direction?: VolumeDirection): string {
  if (direction === "up") return "A little more glow in the speakers.";
  if (direction === "mute") return "I have taken the room down to silence.";
  return "I have lowered the lamp a touch.";
}

function greetingReply(track: Track | null): string {
  if (track) return `Good evening. ${track.title} is keeping the booth warm.`;
  return "Good evening. The booth is warm, and the first record is waiting.";
}

function playReply(query: string, track: Track | MusicSourceSong): string {
  const isExternal = !("filePath" in track);
  if (isExternal) return `I have put ${query} on the turntable for you.`;
  return `I found the record. Let us give it the room.`;
}

function moodReply(mood?: TrackMood, theme?: string): string {
  if (theme === "youth") {
    return "I have turned the room toward youth, bright and a little wistful.";
  }
  if (theme === "rainy day") {
    return "There we are, something with rain in the windows.";
  }
  if (mood === "calm" || mood === "tired") {
    return "There we are, something softer.";
  }
  return "I have moved the needle closer to the room.";
}

function playlistReply(theme: string): string {
  if (theme === "youth") {
    return "I have made a small youth-tinted set for you. Let us begin with something bright and a little nostalgic.";
  }
  if (theme === "rainy day") {
    return "I have made a rainy little set. The first record is already breathing.";
  }
  if (theme === "writing") {
    return "I have made a quiet writing set. Nothing too sharp, nothing too loud.";
  }
  return "I have made a small set for the room. Let us start gently.";
}

function radioStartedReply(kind: RadioKind): string {
  switch (kind) {
    case "youth":
      return "I have tuned a youth-tinted radio for you. Bright at the edges, tender in the middle.";
    case "rainyDay":
      return "Rain Window Radio is on. Let the room blur a little at the glass.";
    case "lateNight":
      return "Late Room Radio is on. Nothing too sharp, nothing in a hurry.";
    case "quietRoom":
      return "The Quiet Room is on. I will keep the records low and close.";
    case "discovery":
      return "I have opened a small side door. Familiar air, with a few new lights inside.";
    case "memory":
      return "Memory Radio is on. I have moved closer to the records that know you already.";
    case "artist":
      return "Artist Radio is on. We will stay near that shelf and let it wander.";
    default:
      return "Your private radio is on. I will keep the room warm.";
  }
}

function temporaryPlaylistTitle(theme: string, mood?: TrackMood): string {
  if (theme === "youth") return "Songs for Youth";
  if (theme === "rainy day") return "Rain on the Window";
  if (theme === "writing") return "Writing After Dark";
  if (theme === "late night") return "Late-Night Records";
  if (theme === "quiet" || mood === "calm") return "Quiet Room";
  return "Private Set";
}

function createDebug(message: string, intent: ParsedIntent): CuratorAgentDebug {
  return {
    userMessage: message,
    detectedIntent: intent.type,
    plannedAction: "reply",
    selectedTool: "none",
    toolArguments: {},
    searchResultsCount: 0,
    playbackChanged: false,
    queueLength: 0,
    finalReply: "",
  };
}

function finish(
  debug: CuratorAgentDebug,
  result: Omit<CuratorAgentResult, "debug">,
): CuratorAgentResult {
  debug.finalReply = result.reply;
  debug.playbackChanged = result.playbackChanged;
  if (debug.plannedAction === "reply")
    debug.plannedAction = result.handled ? result.status : "reply";
  return { ...result, debug };
}
