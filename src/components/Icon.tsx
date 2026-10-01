interface IconProps {
  name: keyof typeof PATHS;
  size?: number;
}

// 24x24 线性图标，stroke 用 currentColor
const PATHS = {
  home: "M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z",
  search: "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm5.2 11.7L20 20",
  refresh: "M20 11a8 8 0 0 0-14.9-3M5 4v4h4M4 13a8 8 0 0 0 14.9 3M19 20v-4h-4",
  library: "M5 4v16M10 4v16M15 5l4.5 14.5",
  "eye-off": "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.3A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-3.1 3.8M6.2 6.2C3.9 7.8 3 12 3 12s3.5 7 9 7c1.2 0 2.3-.3 3.3-.8",
  copy: "M8 8.5V5.8A1.8 1.8 0 0 1 9.8 4h8.4A1.8 1.8 0 0 1 20 5.8v10.4a1.8 1.8 0 0 1-1.8 1.8h-2.7M5.8 8h8.4A1.8 1.8 0 0 1 16 9.8v8.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18.2V9.8A1.8 1.8 0 0 1 5.8 8z",
  edit: "M4 16.5V20h3.5L19 8a2.1 2.1 0 0 0-3-3L4 16.5zM13.5 6.5l4 4",
  tag: "M20 13.5 13.5 20 4 10.5V4h6.5L20 13.5zM7.5 7.5h.01",
  trash: "M4 7h16M10 11v6M14 11v6M5.5 7l1 14h11l1-14M9 7V4h6v3",
  settings:
    "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm7.4 3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2-1.2L14.6 3h-4l-.4 2.7a7.6 7.6 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7.6 7.6 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z",
  play: "M8 5.5v13l11-6.5z",
  pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
  "skip-back": "M18 5.5v13L8.5 12zM6 5v14",
  "skip-forward": "M6 5.5v13L15.5 12zM18 5v14",
  heart:
    "M12 20s-7-4.6-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.4 12 20 12 20z",
  "music-note":
    "M9 18.5V5l10-2v13.5M9 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  volume: "M4 9v6h3.5L12 19V5L7.5 9zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10",
  plus: "M12 5v14M5 12h14",
  minimize: "M5 12h14",
  maximize: "M5.5 5.5h13v13h-13z",
  close: "M6 6l12 12M18 6L6 18",
  "chevron-down": "M6 9l6 6 6-6",
  pin: "M16 3v5l4 4H4l4-4V3h8zM12 12v9",
  queue: "M4 6h16M4 12h16M4 18h9",
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  "repeat-one": "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3M11 10v4l2 1",
  list: "M4 6h3M4 12h3M4 18h3M9.5 6H20M9.5 12H20M9.5 18H20",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
  history: "M4 12a8 8 0 1 1 2.3 5.6M4 12H2.2M4 12l-1.6-2.2M12 8v4l3 2",
  "play-next": "M5 5.5v13l8.5-6.5zM16.5 5v14",
  playlist: "M4 5h16v14H4zM10.5 9.5l4.5 2.5-4.5 2.5z",
  video: "M4 6h11v12H4zM15 10l5-3v10l-5-3z",
  lyrics: "M4 5h16M4 10h16M4 15h16M4 20h8",
  moon: "M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z",
  folder: "M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  lock:
    "M8 10.5V8a4 4 0 0 1 8 0v2.5M6.5 10.5h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1z",
  "lock-open":
    "M8 10.5V8a4 4 0 0 1 7.7-1.5M6.5 10.5h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1z",
} as const;

export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
