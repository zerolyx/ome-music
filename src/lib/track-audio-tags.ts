import type { TrackAudioTagUpdates, TrackAudioTags } from "./api";

export interface TrackAudioTagForm {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: string;
  genre: string;
  trackNumber: string;
  discNumber: string;
  bpm: string;
  comment: string;
}

export function trackAudioTagsToForm(tags: TrackAudioTags): TrackAudioTagForm {
  return {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    albumArtist: tags.albumArtist,
    year: tags.year ?? "",
    genre: tags.genre,
    trackNumber: tags.trackNumber?.toString() ?? "",
    discNumber: tags.discNumber?.toString() ?? "",
    bpm: tags.bpm ?? "",
    comment: tags.comment,
  };
}

export function trackAudioTagUpdates(
  original: TrackAudioTags,
  form: TrackAudioTagForm,
): TrackAudioTagUpdates | null {
  const coreChanged = original.title.trim() !== form.title.trim()
    || original.artist.trim() !== form.artist.trim()
    || original.album.trim() !== form.album.trim();
  const albumArtist = form.albumArtist.trim();
  const year = form.year.trim();
  const genre = form.genre.trim();
  const trackNumber = form.trackNumber.trim();
  const discNumber = form.discNumber.trim();
  const bpm = form.bpm.trim();
  const comment = form.comment.trim();
  const updates: TrackAudioTagUpdates = {
    title: coreChanged ? form.title.trim() : null,
    artist: coreChanged ? form.artist.trim() : null,
    album: coreChanged ? form.album.trim() : null,
    albumArtist: original.albumArtist.trim() === albumArtist ? null : albumArtist,
    year: (original.year ?? "") === year ? null : year,
    genre: original.genre.trim() === genre ? null : genre,
    trackNumber: (original.trackNumber?.toString() ?? "") === trackNumber ? null : trackNumber,
    discNumber: (original.discNumber?.toString() ?? "") === discNumber ? null : discNumber,
    bpm: (original.bpm ?? "").trim() === bpm ? null : bpm,
    comment: original.comment.trim() === comment ? null : comment,
    syncLibraryMetadata: coreChanged,
  };
  return Object.entries(updates).some(([key, value]) => key !== "syncLibraryMetadata" && value !== null)
    ? updates
    : null;
}

export function changedTrackAudioTagLabels(
  original: TrackAudioTags,
  form: TrackAudioTagForm,
): string[] {
  const updates = trackAudioTagUpdates(original, form);
  if (!updates) return [];
  const coreChanged = updates.title !== null;
  return [
    ...(coreChanged ? ["曲名", "艺人", "专辑"] : []),
    ...(updates.albumArtist !== null ? ["专辑艺人"] : []),
    ...(updates.year !== null ? ["年份"] : []),
    ...(updates.genre !== null ? ["流派"] : []),
    ...(updates.trackNumber !== null ? ["音轨号"] : []),
    ...(updates.discNumber !== null ? ["碟号"] : []),
    ...(updates.bpm !== null ? ["BPM"] : []),
    ...(updates.comment !== null ? ["备注"] : []),
  ];
}

export function validateTrackAudioTagForm(
  original: TrackAudioTags,
  form: TrackAudioTagForm,
): string | null {
  const updates = trackAudioTagUpdates(original, form);
  if (!updates) return null;
  if (updates.syncLibraryMetadata && (!form.title.trim() || !form.artist.trim())) {
    return "曲名和艺人不能为空";
  }
  const year = form.year.trim();
  if (year && !/^(1\d{3}|[2-9]\d{3})$/.test(year)) return "年份需填写 1000 至 9999 之间的四位数字";
  for (const [value, label] of [[form.trackNumber, "音轨号"], [form.discNumber, "碟号"]] as const) {
    const number = value.trim();
    if (number && (!/^\d+$/.test(number) || !Number.isSafeInteger(Number(number)) || Number(number) <= 0 || Number(number) > 0xffff_ffff)) {
      return `${label}需填写正整数或留空`;
    }
  }
  const bpm = form.bpm.trim();
  if (bpm && (!/^\d+$/.test(bpm) || Number(bpm) < 1 || Number(bpm) > 999)) {
    return "BPM 需填写 1 至 999 的正整数或留空";
  }
  if (form.comment.trim().length > 4_000) return "备注不能超过 4,000 个字符";
  return null;
}
