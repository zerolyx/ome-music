import { signal } from "@preact/signals";

export type View = "home" | "search" | "library" | "settings";
export const activeView = signal<View>("home");
