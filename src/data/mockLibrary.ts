import type { Track, UserMusicProfile } from "../types/music";

export const mockTracks: Track[] = [
  {
    id: "trk-001",
    title: "Late Night Coastline",
    artist: "Mira Vale",
    album: "Glass Weather",
    durationSeconds: 245,
    filePath: "sample-library/Mira Vale/Glass Weather/Late Night Coastline.flac",
    source: "local",
    sourceId: "mock-local-001",
    coverUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=500&q=80",
    genres: ["Dream Pop", "Indie"],
    moods: ["dreamy", "calm"],
    language: "en",
    year: 2024,
    playCount: 42,
    skipCount: 2,
    liked: true,
    importedAt: "2026-06-10T12:00:00.000Z"
  },
  {
    id: "trk-002",
    title: "Rainlit Neon",
    artist: "Lin Xu",
    album: "Slow City",
    durationSeconds: 216,
    filePath: "sample-library/Lin Xu/Slow City/Rainlit Neon.mp3",
    source: "local",
    sourceId: "mock-local-002",
    coverUrl: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=500&q=80",
    genres: ["Mandopop", "Electronic"],
    moods: ["melancholy", "focused"],
    language: "zh",
    year: 2023,
    playCount: 35,
    skipCount: 4,
    liked: true,
    importedAt: "2026-06-10T12:04:00.000Z"
  },
  {
    id: "trk-003",
    title: "Soft Engine",
    artist: "North Atlas",
    album: "Machines In Bloom",
    durationSeconds: 198,
    filePath: "sample-library/North Atlas/Machines In Bloom/Soft Engine.wav",
    source: "local",
    sourceId: "mock-local-003",
    coverUrl: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=500&q=80",
    genres: ["Synthwave", "Electronic"],
    moods: ["energetic", "focused"],
    language: "instrumental",
    year: 2021,
    playCount: 19,
    skipCount: 6,
    liked: false,
    importedAt: "2026-06-10T12:07:00.000Z"
  }
];

export const mockProfile: UserMusicProfile = {
  favoriteArtists: [
    { label: "Mira Vale", weight: 0.81, confidence: 0.78 },
    { label: "Lin Xu", weight: 0.69, confidence: 0.66 }
  ],
  favoriteAlbums: [{ label: "Glass Weather", weight: 0.74, confidence: 0.68 }],
  favoriteGenres: [
    { label: "Dream Pop", weight: 0.72, confidence: 0.69 },
    { label: "Electronic", weight: 0.58, confidence: 0.58 }
  ],
  favoriteMoods: [
    { label: "calm", weight: 0.86, confidence: 0.76 },
    { label: "focused", weight: 0.63, confidence: 0.6 }
  ],
  preferredListeningHours: [
    { hour: 22, weight: 1, confidence: 0.84 },
    { hour: 9, weight: 0.62, confidence: 0.62 }
  ],
  nightListeningPreference: { score: 0.72, confidence: 0.8 },
  skipPatterns: [{ label: "Electronic", weight: 0.42, confidence: 0.36 }],
  repeatPatterns: [{ label: "Mira Vale", weight: 0.86, confidence: 0.7 }],
  likedSongPatterns: [
    { label: "Dream Pop", weight: 0.78, confidence: 0.74 },
    { label: "calm", weight: 0.71, confidence: 0.68 }
  ],
  explorationScore: { score: 0.48, confidence: 0.66 },
  calmMusicPreference: { score: 0.76, confidence: 0.72 },
  energeticMusicPreference: { score: 0.36, confidence: 0.5 },
  eventCount: 24,
  confidence: 0.82,
  isLearning: false,
  updatedAt: "2026-06-10T12:30:00.000Z"
};
