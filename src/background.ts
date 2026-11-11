import { applySample, isObject, numeric, parseEpisode } from './model';
import { repository } from './repository';
import { sites, sourceUrl } from './site';

async function handle(msg: unknown, sender: chrome.runtime.MessageSender) {
  if (!isObject(msg) || sender.id !== chrome.runtime.id) throw Error('Unknown Request');

  if (msg.type === 'sample') {
    if (
      !sender.tab ||
      sender.frameId !== 0 ||
      !sender.url ||
      !sites.has(new URL(sender.url).origin)
    )
      return;

    if (typeof msg.page !== 'string' || new URL(msg.page).origin !== new URL(sender.url).origin)
      return;

    const page = sourceUrl(msg.page);

    if (
      typeof msg.title !== 'string' ||
      !msg.title.trim() ||
      msg.title.length > 240 ||
      !isObject(msg.sample)
    )
      return;

    const tmdbId = msg.tmdbId;

    if (tmdbId !== undefined && (typeof tmdbId !== 'string' || !/^\d{1,16}$/.test(tmdbId))) return;

    const id = tmdbId
      ? 'tmdb:' + tmdbId
      : 'ramoflix:' + msg.title.trim().normalize('NFC').toLowerCase();

    const s = msg.sample;
    const ep = parseEpisode(s.season, s.episode),
      currentTime = numeric(s.currentTime),
      duration = numeric(s.duration);

    if (
      !ep ||
      currentTime === undefined ||
      (s.duration !== undefined && duration === undefined) ||
      typeof s.ended !== 'boolean' ||
      typeof s.at !== 'number' ||
      s.at > Date.now() + 1000
    )
      return;

    const next = applySample(
      { id, title: msg.title.trim(), sourceUrl: page, ...(tmdbId ? { tmdbId } : {}) },
      { ...ep, currentTime, duration, ended: s.ended, at: s.at },
      await repository.get(id),
    );

    if (next) await repository.put(next);
    return;
  }

  if (sender.url !== chrome.runtime.getURL('popup.html')) throw Error('Invaild Sender');
  if (msg.type === 'list') return repository.all();
  if (typeof msg.id !== 'string') throw Error('Missing Series');

  const entry = await repository.get(msg.id);

  if (!entry || entry.revision !== msg.revision) throw Error('Changed Entry. Please Open again.');

  if (msg.type === 'delete') return repository.remove(entry.id);
  if (msg.type !== 'edit') throw Error('Unknown Action');

  const ep = parseEpisode(msg.season, msg.episode),
    time = numeric(msg.currentTime);

  if (!ep || time === undefined || typeof msg.completed !== 'boolean')
    throw Error('Invalid Progress');

  const latest = ep.season + '/' + ep.episode;

  const prev = entry.episodes[latest];

  if (prev?.duration !== undefined && time > prev.duration) throw Error('Exceeded Duration');

  const revision = Math.max(Date.now(), entry.revision + 1);

  entry.episodes[latest] = {
    ...prev,
    ...ep,
    seriesId: entry.id,
    currentTime: time,
    status: msg.completed ? 'completed' : 'in-progress',
    updatedAt: new Date(revision).toISOString(),
  };
  await repository.put({ ...entry, latest, revision });
}

let pending = Promise.resolve();

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const task = pending.then(() => handle(msg, sender));

  pending = task.then(
    () => {},
    () => {},
  );

  task.then(
    (value) => reply({ ok: true, value }),
    (error) => reply({ ok: false, error: String(error.message ?? error) }),
  );

  return true;
});
