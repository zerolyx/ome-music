import { ChevronRight, Disc3, Radio, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { radioStatusLabel, type RadioKind, type RadioSession } from "../features/radio/omeRadio";
import type { Track } from "../types/music";

interface OmeRadioPanelProps {
  session: RadioSession | null;
  currentTrack: Track | null;
  onCreateRadio: (kind: RadioKind) => void;
  onStartRadio: () => void;
}

const radioKinds: Array<{ kind: RadioKind; label: string }> = [
  { kind: "memory", label: "Memory" },
  { kind: "lateNight", label: "Late" },
  { kind: "quietRoom", label: "Soft" },
  { kind: "discovery", label: "Drift" },
];

export function OmeRadioPanel({
  session,
  currentTrack,
  onCreateRadio,
  onStartRadio,
}: OmeRadioPanelProps) {
  const [isOpen, setOpen] = useState(false);
  const activeTrack = session?.tracks[session.currentTrackIndex] ?? currentTrack;
  const hostNote = session?.hostNotes[session.hostNotes.length - 1]?.text;
  const nextTrack = useMemo(() => {
    if (!session) return null;
    return session.tracks[session.currentTrackIndex + 1] ?? session.tracks[1] ?? null;
  }, [session]);

  return (
    <aside
      data-danmaku-safe-zone="radio"
      className={clsx(
        "fixed left-5 top-1/2 z-30 w-[min(310px,calc(100vw-56px))] -translate-y-1/2 transition duration-[520ms] ease-out hover:opacity-100",
        isOpen ? "translate-x-0 opacity-100" : "-translate-x-[calc(100%-48px)] opacity-45",
      )}
    >
      <div className="overflow-hidden rounded-[30px] border border-[#4a2108]/[0.035] bg-[#eadbcd]/[0.18] shadow-[0_22px_70px_rgba(74,33,8,0.10)] backdrop-blur-3xl">
        <div className="flex items-center gap-3 px-3.5 py-3.5 text-[#4a2108]">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="app-transition flex h-9 w-9 items-center justify-center rounded-full bg-[#4a2108]/[0.10] text-[#4a2108]/62 hover:bg-[#4a2108]/[0.16] hover:text-[#4a2108]"
            aria-label={isOpen ? "Fold Ome Radio" : "Open Ome Radio"}
          >
            {isOpen ? <ChevronRight className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
          </button>
          <div
            className={clsx(
              "min-w-0 transition duration-[420ms]",
              isOpen ? "opacity-100" : "opacity-0",
            )}
          >
            <p className="text-xs font-semibold text-[#4a2108]/46">
              {session ? radioStatusLabel(session.status) : "Off Air"}
            </p>
            <h2 className="truncate text-[15px] font-black text-[#4a2108]">Ome Radio</h2>
          </div>
        </div>

        <div
          className={clsx(
            "transition duration-[520ms] ease-out",
            isOpen ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="px-5 pb-5 pt-3">
            <div className="rounded-[24px] bg-[#4a2108]/[0.045] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#4a2108]/30">
                {session?.scene ?? "Private station"}
              </p>
              <h3 className="mt-2 text-2xl font-black leading-tight text-[#4a2108]/86">
                {session?.title ?? "Create My Radio"}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#4a2108]/48">
                {hostNote ?? "Turn your listening memory into a private broadcast."}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <RadioLine label="Now" track={activeTrack} />
              <RadioLine label="Next" track={nextTrack} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {radioKinds.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => onCreateRadio(item.kind)}
                  className="app-transition rounded-full bg-[#4a2108]/[0.07] px-3 py-2 text-xs font-black text-[#4a2108]/58 hover:bg-[#4a2108]/[0.12] hover:text-[#4a2108]/82"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onStartRadio}
              disabled={!session?.tracks.length}
              className="app-transition mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#4a2108]/[0.82] px-4 text-sm font-black text-[#efe4d8] shadow-[0_14px_34px_rgba(74,33,8,0.18)] hover:bg-[#4a2108] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              Start Broadcast
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function RadioLine({ label, track }: { label: string; track: Track | null }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-[#4a2108]/[0.04] px-3 py-2">
      {track ? (
        <img
          src={track.coverUrl}
          alt=""
          className="h-9 w-9 rounded-[10px] object-cover shadow-[0_10px_24px_rgba(74,33,8,0.16)]"
        />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#4a2108]/[0.06] text-[#4a2108]/38">
          <Disc3 className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4a2108]/28">
          {label}
        </p>
        <p className="truncate text-sm font-black text-[#4a2108]/70">
          {track?.title ?? "Waiting for records"}
        </p>
      </div>
    </div>
  );
}
