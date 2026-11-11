import { isObject, numeric, parseEpisode, type Episode } from './model';

const kinds = ['progress', 'paused', 'unpaused', 'episode', 'ended'] as const;

type Kind = (typeof kinds)[number];

export interface PlayerEvent {
  kind: Kind;
  tmdbId?: string;
  selection?: Episode;
  currentTime?: number;
  duration?: number;
}

export function parsePlayerEvent(raw: unknown): PlayerEvent | undefined {
  // Limit incoming player event strings to 4096 UTF-16 code units.
  if (typeof raw === 'string' && raw.length <= 4096) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return;
    }
  }

  if (!isObject(raw)) return;

  const type = raw.type ?? raw.event;
  const kind = kinds.find((k) => type === 'vidrift:' + k);

  if (!kind) return;

  const data = raw.data ?? raw.payload ?? raw;
  if (!isObject(data)) return;

  const season = data.season ?? data.seasonNumber,
    episode = data.episode ?? data.episodeNumber;

  const selection = parseEpisode(season, episode);
  if (!selection && (season !== undefined || episode !== undefined || kind === 'episode')) return;

  const currentTime = numeric(data.currentTime ?? data.time),
    duration = numeric(data.duration);

  if (kind === 'progress' && currentTime === undefined) return;

  if ((data.currentTime !== undefined || data.time !== undefined) && currentTime === undefined)
    return;

  if (data.duration !== undefined && (!duration || (currentTime ?? 0) > duration)) return;
  const id = data.tmdbId;

  if (id !== undefined && !/^\d{1,16}$/.test(String(id))) return;
  return {
    kind,
    selection,
    currentTime,
    duration,
    tmdbId: id === undefined ? undefined : String(id),
  };
}
