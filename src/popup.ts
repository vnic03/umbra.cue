import { loadPoster, removePoster } from './posters';
import type { Entry } from './model';
import { sourceUrl } from './site';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const list = get('list'),
  message = get('message'),
  dialog = get<HTMLDialogElement>('editor');

const form = get<HTMLFormElement>('form');

const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

let editing: Entry | undefined;

async function request(type: string, data: Record<string, unknown> = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...data });
  if (!result?.ok) throw Error(result?.error ?? 'Cannot read local storage.');
  return result.value;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, value: string) {
  const el = document.createElement(tag);
  el.textContent = value;
  return el;
}

function clock(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60]
    .map((v, i) => (i ? String(v).padStart(2, '0') : String(v)))
    .join(':');
}

const pictures = new Map<string, { image: HTMLImageElement; ready: Promise<void> }>();

const POSTER_WIDTH = 104;
const POSTER_HEIGHT = 156;
function showPoster(article: HTMLElement, entry: Entry) {
  let picture = pictures.get(entry.id);

  if (!picture) {
    const image = new Image(POSTER_WIDTH, POSTER_HEIGHT);
    image.alt = '';

    const ready = loadPoster(entry)
      .then((blob) => {
        if (blob && pictures.get(entry.id)?.image === image) image.src = URL.createObjectURL(blob);
      })
      .catch(() => {});

    picture = { image, ready };
    pictures.set(entry.id, picture);
  }

  const { image, ready } = picture;

  void ready.then(() => {
    if (article.isConnected && image.hasAttribute('src'))
      article.querySelector('.series-summary')?.prepend(image);
  });
}

const observer = new IntersectionObserver((items) => {
  for (const item of items) {
    if (!item.isIntersecting) continue;

    const article = item.target as HTMLElement;
    observer.unobserve(article);
    const entry = entriesByCard.get(article);

    if (entry) showPoster(article, entry);
  }
});

const entriesByCard = new WeakMap<HTMLElement, Entry>();

function card(entry: Entry) {
  const article = document.createElement('article');
  const summary = document.createElement('div');
  summary.className = 'series-summary';

  const details = document.createElement('div');
  details.className = 'series-details';
  const title = node('h2', '');
  const episode = node('p', '');
  const position = node('p', '');
  details.append(title, episode, position);
  summary.append(details);

  const bar = document.createElement('progress');
  bar.setAttribute('aria-label', 'Playback Progress');
  const watched = node('small', '');
  article.append(summary, watched);

  const actions = document.createElement('footer'),
    link = node('a', 'View Series');

  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const edit = node('button', 'Edit'),
    remove = node('button', 'Delete');

  edit.onclick = () => {
    editing = entry;
    const p = entry.episodes[entry.latest];

    get('series').textContent = entry.title;
    get('error').textContent = '';

    for (const key of ['season', 'episode', 'currentTime'] as const)
      field(key).value = String(p[key]);

    field('completed').checked = p.status === 'completed';

    dialog.showModal();
  };

  remove.onclick = () => {
    deletingId = entry.id;
    get('delete-description').textContent = `Delete “${entry.title}” and all saved episodes?`;
    deleteDialog.showModal();
  };

  actions.append(link, edit, remove);
  article.append(actions);

  function update(next: Entry) {
    entry = next;
    entriesByCard.set(article, entry);
    const p = entry.episodes[entry.latest];

    title.textContent = entry.title;
    episode.textContent = `Season ${p.season} · Episode ${p.episode}`;
    position.textContent =
      (p.status === 'completed' ? 'Completed · ' : '') +
      clock(p.currentTime) +
      (p.duration ? ' / ' + clock(p.duration) : '');
    watched.textContent = 'Last Watched · ' + dateFormat.format(new Date(entry.lastWatchedAt));
    link.href = sourceUrl(entry.sourceUrl);

    if (p.duration) {
      bar.max = p.duration;
      bar.value = p.currentTime;
      if (!bar.parentNode) watched.before(bar);
    } else {
      bar.remove();
    }
  }

  update(entry);
  observer.observe(article);

  return { article, update };
}

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'short' });
const cards = new Map<string, ReturnType<typeof card>>();
const deleteDialog = get<HTMLDialogElement>('delete-dialog');
let deletingId: string | undefined;

get('delete-cancel').onclick = () => deleteDialog.close();
deleteDialog.onclose = () => {
  deletingId = undefined;
};

get('delete-confirm').onclick = async () => {
  const id = deletingId;
  if (!id) return;
  deleteDialog.close();

  try {
    await request('delete', { id });

    const picture = pictures.get(id);
    pictures.delete(id);

    await picture?.ready;

    if (picture?.image.src) URL.revokeObjectURL(picture.image.src);

    await removePoster(id).catch(() => {});
    await refresh();
  } catch (e) {
    message.textContent = String(e);
  }
};

async function refresh() {
  try {
    const entries: Entry[] = await request('list');
    const ids = new Set(entries.map((entry) => entry.id));
    for (const [id, { article }] of cards) {
      if (ids.has(id)) continue;
      observer.unobserve(article);
      article.remove();
      cards.delete(id);
    }

    entries.forEach((entry, index) => {
      let view = cards.get(entry.id);
      if (!view) {
        view = card(entry);
        cards.set(entry.id, view);
      } else if (entriesByCard.get(view.article)?.revision !== entry.revision) {
        view.update(entry);
      }

      const current = list.children.item(index);
      if (current !== view.article) list.insertBefore(view.article, current);
    });
    message.textContent = entries.length ? '' : 'Start watching something to see it here.';
  } catch (e) {
    message.textContent = String(e);
  }
}

get('cancel').onclick = () => dialog.close();

form.onsubmit = async (event) => {
  event.preventDefault();

  if (!editing) return;

  try {
    await request('edit', {
      id: editing.id,
      revision: editing.revision,
      season: field('season').valueAsNumber,
      episode: field('episode').valueAsNumber,
      currentTime: field('currentTime').valueAsNumber,
      completed: field('completed').checked,
    });

    dialog.close();
    await refresh();
  } catch (e) {
    get('error').textContent = String(e);
  }
};

chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'local') void refresh();
});

void refresh();
