import { useEffect, useState } from "react";
import clsx from "clsx";

interface ArtworkImageProps {
  src?: string | null;
  alt: string;
  source?: string | null;
  className?: string;
  fallbackClassName?: string;
}

export function ArtworkImage({ src, alt, source, className, fallbackClassName }: ArtworkImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;

  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  if (failed) {
    return (
      <div
        className={clsx(
          "artwork-fallback flex items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#6f4432,#b88768_58%,#d4b39a)]",
          className,
          fallbackClassName
        )}
        role="img"
        aria-label={`${alt || "Track"} artwork unavailable`}
      >
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/62">
          {source === "bilibili" ? "Bilibili" : "Ome"}
        </span>
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} onError={() => setFailedSrc(src)} />;
}
