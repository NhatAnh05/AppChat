/** Bookmarks belong only to this browser/user. No server persistence is implied. */
const PREFIX = 'lyra:bookmarks:v1:';
const key = (user: string, conversation: string) => `${PREFIX}${encodeURIComponent(user)}:${encodeURIComponent(conversation)}`;

export function readMessageBookmarks(user: string, conversation: string): string[] {
  if (!user || !conversation) return [];
  try {
    const raw = globalThis.localStorage?.getItem(key(user, conversation));
    const values: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter(value => typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value)))].slice(0, 500);
  } catch { return []; }
}

export function saveMessageBookmarks(user: string, conversation: string, bookmarks: string[]): void {
  if (!user || !conversation) return;
  try {
    globalThis.localStorage?.setItem(key(user, conversation), JSON.stringify([...new Set(bookmarks)].slice(0, 500)));
  } catch { /* Storage may be disabled, full or blocked. */ }
}

export function toggleMessageBookmark(bookmarks: string[], bookmark: string): string[] {
  if (bookmarks.includes(bookmark)) return bookmarks.filter(item => item !== bookmark);
  return [...bookmarks.slice(-499), bookmark];
}
