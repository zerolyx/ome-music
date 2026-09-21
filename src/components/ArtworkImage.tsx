import { useEffect, useState } from "react";
import clsx from "clsx";

interface ArtworkImageProps {
  src?: string | null;
  alt: string;
  source?: string | null;
  className?: string;
  fallbackClassName?: string;
}

export function ArtworkImage({
  src,
  alt,
  source,
  className,
  fallbackClassName,
}: ArtworkImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;

  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  if (failed) {
    const fallback = buildArtworkFallback(alt, source);

    return (
      <div
        style={{
          background:
            `radial-gradient(circle at 22% 18%, ${fallback.glow}, transparent 34%), ` +
            `linear-gradient(145deg, ${fallback.from}, ${fallback.mid} 56%, ${fallback.to})`,
        }}
        className={clsx(
          "artwork-fallback relative flex items-center justify-center overflow-hidden",
          className,
          fallbackClassName,
        )}
        role="img"
        aria-label={`${alt || "Track"} artwork unavailable`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_38%,rgba(48,24,12,0.12))]" />
        <div className="pointer-events-none absolute inset-[12%] rounded-[24px] border border-white/10 opacity-50" />
        <span className="relative flex h-[38%] w-[38%] items-center justify-center rounded-[28%] bg-white/10 text-[clamp(0.7rem,3vw,1.8rem)] font-black uppercase tracking-[0.08em] text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-sm">
          {fallback.mark}
        </span>
        <span className="absolute bottom-[9%] left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[0.22em] text-white/42">
          {fallback.sourceLabel}
        </span>
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} onError={() => setFailedSrc(src)} />;
}

function buildArtworkFallback(alt: string, source?: string | null) {
  const palettes: Record<
    string,
    { from: string; mid: string; to: string; glow: string; label: string }
  > = {
    netease: {
      from: "#6f3a2d",
      mid: "#b88468",
      to: "#d8b49a",
      glow: "rgba(255,214,182,0.46)",
      label: "NetEase",
    },
    bilibili: {
      from: "#4f6f72",
      mid: "#b58b74",
      to: "#d9b4a0",
      glow: "rgba(177,232,235,0.38)",
      label: "Bilibili",
    },
    local: {
      from: "#5c4c3f",
      mid: "#a8997e",
      to: "#d6c8ad",
      glow: "rgba(250,239,201,0.42)",
      label: "Local",
    },
    unknown: {
      from: "#5d3f35",
      mid: "#b18a70",
      to: "#d6b79d",
      glow: "rgba(255,226,196,0.38)",
      label: "Ome",
    },
  };
  const key = source && palettes[source] ? source : "unknown";
  const palette = palettes[key];
  const words = (alt || "Ome")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const mark =
    words.length >= 2
      ? `${words[0][0] ?? "O"}${words[1][0] ?? ""}`
      : (words[0]?.slice(0, 2) ?? palette.label.slice(0, 2));
  return { ...palette, sourceLabel: palette.label, mark };
}
