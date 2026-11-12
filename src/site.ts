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

export function seriesLink(raw: string) {
  const url = new URL(raw);

  if (!sites.has(url.origin) || url.username || url.password) return;

  for (const key of ['season', 'episode', 'e']) url.searchParams.delete(key);

  if (/^\d+$/.test(url.searchParams.get('s') ?? '')) url.searchParams.delete('s');

  url.hash = '';
  url.searchParams.sort();

  return url.href;
}

export function posterUrl(raw: string, base: string) {
  if (!raw) return;

  const url = new URL(raw, base);

  if (url.username || url.password) return;

  if (sites.has(url.origin) && url.pathname.startsWith('/wp-content/uploads/')) return url.href;

  if (
    url.origin === 'https://image.tmdb.org' &&
    /^\/t\/p\/[\w-]+\/[\w-]+\.(jpg|png|webp)$/i.test(url.pathname)
  )
    return url.origin + url.pathname.replace(/^\/t\/p\/[^/]+/, '/t/p/w154');
}

export function posterLinks(root: ParentNode, base: string) {
  const links = new Map<string, string>();

  for (const img of root.querySelectorAll<HTMLImageElement>(
    '.filmlist .item .poster a[href] img',
  )) {
    try {
      const link = seriesLink(new URL(img.closest('a')!.getAttribute('href')!, base).href);
      const image = posterUrl(
        img.dataset.src || img.currentSrc || img.getAttribute('src') || '',
        base,
      );

      if (link && image) links.set(link, image);
    } catch {
      /* Ignore malformed cards. */
    }
  }
  return links;
}
