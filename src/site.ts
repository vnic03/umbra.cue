import { parseEpisode } from './model';

export const sites = new Set(['https://ramoflix.net', 'https://www.ramoflix.net']);

export const players = new Set(['https://embed.vidrift.net', 'https://embed.vidrift.in']);

export function sourceUrl(raw: string) {
  const u = new URL(raw);

  if (!sites.has(u.origin) || u.username || u.password) throw Error('Unknown Site');

  const safe = new URL(u.pathname, u.origin);

  if (safe.origin !== u.origin) throw Error('Invalid Path');

  for (const name of [
    'id',
    'p',
    'tv',
    'series',
    'tmdb',
    'tmdb_id',
    't',
    'watch',
    's',
    'e',
    'season',
    'episode',
  ]) {
    const value = u.searchParams.get(name);
    if (value && /^[\w-]{1,120}$/.test(value)) safe.searchParams.set(name, value);
  }
  return safe.href;
}

export function frameInfo(src: string) {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return;
  }

  const path = /^\/embed2\/tv\/(\d+)\/(\d+)\/(\d+)\/?$/.exec(url.pathname);

  if (players.has(url.origin) && path)
    return { tmdbId: path[1], selection: parseEpisode(path[2], path[3]), wrapper: false };

  if (!sites.has(url.origin) || !url.searchParams.has('player_tv')) return;
  const q = url.searchParams;

  return {
    selection: parseEpisode(q.get('season') ?? q.get('s'), q.get('episode') ?? q.get('e')),
    wrapper: true,
    tmdbId: undefined,
  };
}

export function title() {
  const text =
    document.querySelector('h1')?.textContent?.trim() ||
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
    document.title;

  return text
    .replace(/\s*[|–—-]\s*RamoFlix.*$/i, '')
    .trim()
    .slice(0, 240);
}
