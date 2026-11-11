import { frameInfo, players, sourceUrl, title } from './site';
import { parsePlayerEvent } from './player';
import type { Episode } from './model';

type Frame = HTMLIFrameElement;

interface Binding {
  src: string;
  page: string;
  stop(): void;
}

const bindings = new Map<Frame, Binding>();

function bind(frame: Frame, info: NonNullable<ReturnType<typeof frameInfo>>): Binding {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const src = frame.src,
    page = location.href;
  let selection: Episode | undefined;
  let strictSelection = false;
  let confirmed = false;
  let ended = false;
  let lastTime: number | undefined;
  let tmdbId = info.tmdbId;
  let wrapped: Window | null = null;

  function receive(event: MessageEvent) {
    if (
      !frame.isConnected ||
      frame.src !== src ||
      page !== location.href ||
      !players.has(event.origin)
    )
      return;

    if (info.wrapper) {
      if (event.currentTarget !== wrapped || !wrapped || !event.source) return;

      const child = Array.from(wrapped.document.querySelectorAll('iframe')).find(
        (f) => f.contentWindow === event.source,
      );

      if (!child) return;
    } else if (event.source !== frame.contentWindow) return;

    const data = parsePlayerEvent(event.data);

    if (!data || (tmdbId && data.tmdbId && tmdbId !== data.tmdbId)) return;

    tmdbId ??= data.tmdbId;

    if (data.kind === 'episode') {
      selection = data.selection;
      strictSelection = true;
      confirmed = false;
      ended = false;
      lastTime = undefined;
      return;
    }

    if (
      strictSelection &&
      selection &&
      data.selection &&
      (selection.season !== data.selection.season || selection.episode !== data.selection.episode)
    )
      return;

    selection = data.selection ?? selection ?? info.selection;
    if (!selection) return;

    if (!confirmed && data.kind !== 'progress' && data.kind !== 'unpaused') return;

    if (data.currentTime === undefined && !confirmed) return;

    const currentTime =
      data.currentTime ?? (data.kind === 'ended' ? (data.duration ?? lastTime) : lastTime);
    if (currentTime === undefined) return;

    // A zero-position progress notification can also occur while the player initializes.
    if (!confirmed && data.kind === 'progress' && currentTime === 0) return;

    if (ended && data.kind !== 'unpaused' && (lastTime === undefined || currentTime >= lastTime))
      return;

    ended = data.kind === 'ended';
    confirmed = true;
    strictSelection = true;
    lastTime = currentTime;
    const name = title();
    if (!name) return;

    void chrome.runtime
      .sendMessage({
        type: 'sample',
        title: name,
        tmdbId,
        page: sourceUrl(page),
        sample: {
          ...selection,
          currentTime,
          duration: data.duration,
          ended: data.kind === 'ended',
          at: performance.timeOrigin + performance.now(),
        },
      })
      .catch(() => {});
  }

  function attach() {
    try {
      wrapped?.removeEventListener('message', receive);
    } catch {
      /* Frame navigated cross-origin. */
    }

    wrapped = null;
    ended = false;
    confirmed = false;
    selection = undefined;
    strictSelection = false;
    tmdbId = info.tmdbId;
    lastTime = undefined;

    if (info.wrapper) {
      try {
        if (frame.contentWindow?.location.origin !== location.origin) return;
        wrapped = frame.contentWindow;
        wrapped.addEventListener('message', receive, options);
      } catch {
        wrapped = null;
      }
    }
  }

  if (!info.wrapper) window.addEventListener('message', receive, options);
  frame.addEventListener('load', attach, options);
  attach();

  return { src, page, stop: () => controller.abort() };
}

function refresh() {
  for (const [frame, binding] of bindings) {
    if (!frame.isConnected || binding.src !== frame.src || binding.page !== location.href) {
      binding.stop();
      bindings.delete(frame);
    }
  }
  for (const frame of document.querySelectorAll('iframe')) {
    if (bindings.has(frame)) continue;
    const info = frameInfo(frame.src);
    if (info) bindings.set(frame, bind(frame, info));
  }
}

new MutationObserver((changes) => {
  if (
    changes.some(
      (c) =>
        (c.type === 'attributes' && c.target instanceof HTMLIFrameElement) ||
        [...c.addedNodes, ...c.removedNodes].some(
          (n) => n instanceof Element && (n.matches('iframe') || n.querySelector('iframe')),
        ),
    )
  )
    refresh();
}).observe(document, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['src'],
});

window.addEventListener('popstate', refresh);
window.addEventListener('pageshow', refresh);

refresh();
