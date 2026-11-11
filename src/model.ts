export interface Episode {
  season: number;
  episode: number;
}

export interface Series {
  id: string;
  title: string;
  sourceUrl: string;
  tmdbId?: string;
}

export interface Progress extends Episode {
  seriesId: string;
  currentTime: number;
  duration?: number;
  status: 'in-progress' | 'completed';
  updatedAt: string;
}

export interface Entry extends Series {
  lastWatchedAt: string;
  latest: string;
  episodes: Record<string, Progress>;
  revision: number;
}

export interface Sample extends Episode {
  currentTime: number;
  duration?: number;
  ended: boolean;
  at: number;
}

export function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)))
    return;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
}

export function parseEpisode(season: unknown, episode: unknown): Episode | undefined {
  const s = numeric(season),
    e = numeric(episode);
  if (
    s !== undefined &&
    e !== undefined &&
    Number.isSafeInteger(s) &&
    Number.isSafeInteger(e) &&
    e > 0
  )
    return { season: s, episode: e };
}

export function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

export function applySample(series: Series, sample: Sample, old?: Entry): Entry | undefined {
  if (
    !parseEpisode(sample.season, sample.episode) ||
    numeric(sample.currentTime) === undefined ||
    !Number.isFinite(sample.at) ||
    sample.at <= (old?.revision ?? 0)
  )
    return;

  const key = sample.season + '/' + sample.episode;
  const prev = old?.episodes[key];
  const duration = sample.duration ?? prev?.duration;

  if (
    duration !== undefined &&
    (!Number.isFinite(duration) || duration <= 0 || sample.currentTime > duration)
  )
    return;

  const status = sample.ended ? 'completed' : 'in-progress';

  if (
    old?.latest === key &&
    prev?.currentTime === sample.currentTime &&
    prev?.duration === duration &&
    prev?.status === status
  )
    return;

  const date = new Date(sample.at).toISOString();
  const progress: Progress = {
    seriesId: series.id,
    season: sample.season,
    episode: sample.episode,
    currentTime: sample.currentTime,
    ...(duration === undefined ? {} : { duration }),
    status,
    updatedAt: date,
  };

  return {
    ...series,
    latest: key,
    episodes: { ...old?.episodes, [key]: progress },
    revision: sample.at,
    lastWatchedAt: date,
  };
}
