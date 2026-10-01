import { signal } from "@preact/signals";

/** Shared lightweight playback flag for background work that must yield while audio is active. */
export const playbackActive = signal(false);
