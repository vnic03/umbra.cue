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
  // TODO: explain magic numbers
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60]
    .map((v, i) => (i ? String(v).padStart(2, '0') : String(v)))
    .join(':');
}

function card(entry: Entry) {
  const p = entry.episodes[entry.latest];

  const article = document.createElement('article');
  const date = new Intl.DateTimeFormat('en', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(entry.lastWatchedAt));

  article.append(
    node('h2', entry.title),
    node('p', 'Season ' + p.season + ' · Episode ' + p.episode),
    node(
      'p',
      (p.status === 'completed' ? 'Completed · ' : '') +
        clock(p.currentTime) +
        (p.duration ? ' / ' + clock(p.duration) : ''),
    ),
  );

  if (p.duration) {
    const bar = document.createElement('progress');
    bar.max = p.duration;
    bar.value = p.currentTime;
    bar.setAttribute('aria-label', 'Playback Progress');
    article.append(bar);
  }

  article.append(node('small', 'Last Watched · ' + date));
  const actions = document.createElement('footer'),
    link = node('a', 'View Series');

  link.href = sourceUrl(entry.sourceUrl);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const edit = node('button', 'Edit'),
    remove = node('button', 'Delete');

  edit.onclick = () => {
    editing = entry;

    get('series').textContent = entry.title;
    get('error').textContent = '';

    for (const key of ['season', 'episode', 'currentTime'] as const)
      field(key).value = String(p[key]);

    field('completed').checked = p.status === 'completed';

    dialog.showModal();
  };

  remove.onclick = async () => {
    if (!confirm(`Delete "${entry.title}" and all saved episodes?`)) return;

    try {
      await request('delete', { id: entry.id, revision: entry.revision });
      await refresh();
    } catch (e) {
      message.textContent = String(e);
    }
  };

  actions.append(link, edit, remove);
  article.append(actions);

  return article;
}

async function refresh() {
  try {
    const entries: Entry[] = await request('list');
    list.replaceChildren(...entries.map(card));
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
