import type { Entry } from './model';
import { posterLinks, posterUrl, seriesLink } from './site';

let database: Promise<IDBDatabase> | undefined;

function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('umbra-posters', 1);

    request.onupgradeneeded = () => request.result.createObjectStore('posters');
    request.onsuccess = () => resolve(request.result);

    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}

async function record<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('posters', mode);
    const request = action(tx.objectStore('posters'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
}

export function removePoster(id: string) {
  return record('readwrite', (store) => store.delete(id));
}

export async function loadPoster(entry: Entry): Promise<Blob | undefined> {
  return navigator.locks.request('poster:' + entry.id, () => readOrDownload(entry));
}

async function readOrDownload(entry: Entry): Promise<Blob | undefined> {
  const cached: Blob | { retry: number; candidate?: string } | undefined = await record(
    'readonly',
    (store) => store.get(entry.id),
  );
  if (cached instanceof Blob) return cached;

  const link = seriesLink(entry.sourceUrl);
  if (!link) return;

  const key = 'poster-link:' + link;
  const known = (await chrome.storage.local.get(key))[key];
  const candidate = typeof known === 'string' ? posterUrl(known, link) : undefined;

  if (cached && cached.retry > Date.now() && cached.candidate === candidate) return;

  const options = {
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  } as const;

  try {
    let image = candidate;
    if (!image) {
      const search = new URL('/', link);
      search.searchParams.set('s', entry.title);

      const response = await fetch(search, options);
      if (!response.ok) throw Error('Search unavailable');

      const template = document.createElement('template');
      template.innerHTML = await response.text();

      image = posterLinks(template.content, search.href).get(link);
      if (!image) throw Error('No matching poster');
    }

    const response = await fetch(image, options);
    if (!response.ok) throw Error('Poster unavailable');

    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(128, 192);

    try {
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, 128, 192);
    } finally {
      bitmap.close();
    }

    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
    await record('readwrite', (store) => store.put(blob, entry.id));
    return blob;
  } catch {
    await record('readwrite', (store) =>
      store.put({ retry: Date.now() + 86400000, candidate }, entry.id),
    );
  }
}
