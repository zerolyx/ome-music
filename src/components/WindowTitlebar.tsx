import { Maximize2, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

export function WindowTitlebar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void appWindow.isMaximized().then((value) => {
      if (!disposed) setIsMaximized(value);
    }).catch(() => undefined);
    void appWindow.onResized(async () => {
      if (disposed) return;
      setIsMaximized(await appWindow.isMaximized().catch(() => false));
    }).then((dispose) => {
      if (disposed) {
        dispose();
      } else {
        unlisten = dispose;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const runWindowAction = async (action: "minimize" | "maximize" | "close") => {
    if (!isTauriRuntime()) return;
    const appWindow = getCurrentWindow();

    if (action === "minimize") await appWindow.minimize();
    if (action === "maximize") {
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized().catch(() => false));
    }
    if (action === "close") await appWindow.close();
  };

  return (
    <header className="window-titlebar fixed inset-x-0 top-0 z-30 h-8 select-none" aria-label="Window title bar">
      <div
        data-tauri-drag-region
        className="absolute inset-0"
        onMouseDown={(event) => {
          if (event.button !== 0 || event.detail !== 1 || !isTauriRuntime()) return;
          void getCurrentWindow().startDragging();
        }}
      />

      <div data-tauri-drag-region className="pointer-events-none absolute left-3 top-0 flex h-8 items-center gap-2">
        <span className="window-titlebar-mark h-1.5 w-1.5 rounded-full" />
        <span className="text-[10px] font-bold tracking-[0.08em] text-[#4a2108]/28">Ome Music</span>
      </div>

      <div className="absolute right-1.5 top-1 z-50 flex h-6 items-center gap-0.5" data-danmaku-safe-zone="window-controls">
        <WindowButton label="Minimize" onClick={() => void runWindowAction("minimize")}>
          <Minus className="h-3.5 w-3.5" strokeWidth={1.7} />
        </WindowButton>
        <WindowButton label={isMaximized ? "Restore" : "Maximize"} onClick={() => void runWindowAction("maximize")}>
          {isMaximized ? <Square className="h-2.5 w-2.5" strokeWidth={1.6} /> : <Maximize2 className="h-3 w-3" strokeWidth={1.6} />}
        </WindowButton>
        <WindowButton label="Close" onClick={() => void runWindowAction("close")} close>
          <X className="h-3.5 w-3.5" strokeWidth={1.7} />
        </WindowButton>
      </div>
    </header>
  );
}

function WindowButton({
  label,
  onClick,
  close = false,
  children
}: {
  label: string;
  onClick: () => void;
  close?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={close ? "window-control-button window-control-close" : "window-control-button"}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
