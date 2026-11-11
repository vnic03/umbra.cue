import type { Entry } from './model';

const prefix = 'series:';

export const repository = {
  async get(id: string): Promise<Entry | undefined> {
    const key = prefix + id;
    return (await chrome.storage.local.get(key))[key];
  },

  async all(): Promise<Entry[]> {
    const values = await chrome.storage.local.get(null);

    return Object.keys(values)
      .filter((k) => k.startsWith(prefix))
      .map((k) => values[k] as Entry)
      .sort((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt));
  },

  put(entry: Entry) {
    return chrome.storage.local.set({ [prefix + entry.id]: entry });
  },

  remove(id: string) {
    return chrome.storage.local.remove(prefix + id);
  },
};
