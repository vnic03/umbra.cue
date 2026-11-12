import assert from 'node:assert/strict';
import test from 'node:test';
import { posterUrl, seriesLink } from '../src/site';

const page = 'https://ramoflix.net/the-mentalist/';
test('episodes share a poster while series identifiers stay distinct', () => {
  assert.equal(seriesLink(page + '?s=2&e=17#player'), page);
  assert.notEqual(seriesLink(page + '?id=1'), seriesLink(page + '?id=2'));
});

test('recognizes small TMDB and local upload images and skips placeholders', () => {
  assert.equal(
    posterUrl('https://image.tmdb.org/t/p/w600_and_h900_bestv2/abc.jpg', page),
    'https://image.tmdb.org/t/p/w154/abc.jpg',
  );
  assert.equal(
    posterUrl('/wp-content/uploads/a.jpg', page),
    'https://ramoflix.net/wp-content/uploads/a.jpg',
  );
  assert.equal(posterUrl('data:image/webp;base64,abc', page), undefined);
});

import { applySample } from '../src/model';
import { posterLinks } from '../src/site';

test('a lazy-loaded result associates its real image with its enclosing series link', () => {
  const root = {
    querySelectorAll: () => [
      {
        dataset: { src: '/wp-content/uploads/mentalist.jpg' },
        currentSrc: 'data:image/webp;base64,abc',
        closest: () => ({ getAttribute: () => '/the-mentalist/' }),
      },
    ],
  } as unknown as ParentNode;
  const links = posterLinks(root, 'https://ramoflix.net/?s=mentalist');
  assert.equal(links.get(page), 'https://ramoflix.net/wp-content/uploads/mentalist.jpg');
  assert.equal(links.get(page + 'remake/'), undefined);
});

test('watch progress carries earlier episodes across a season change', () => {
  const series = { id: 'tmdb:1', title: 'The Mentalist', sourceUrl: page };
  const sample = { season: 1, episode: 1, currentTime: 20, ended: false, at: 1000 };
  const first = applySample(series, sample);
  const next = applySample(series, { ...sample, season: 2, at: 2000 }, first);
  assert.equal(next?.latest, '2/1');
  assert.equal(next?.episodes['1/1'].currentTime, 20);
  assert.equal(next?.id, first?.id);
});
