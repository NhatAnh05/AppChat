/** Mã phiên chỉ lưu trong sessionStorage của tab, KHÔNG lưu mật khẩu hoặc localStorage. */
export interface SavedLoginSession { username: string; reLoginCode: string }
export type SessionStoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const SESSION_KEY = 'appchat:auth:relogin:v1';
// Thời hạn tối đa phía client để tránh thử mã chắc chắn đã cũ; Backend luôn quyết định hiệu lực.
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function getStorage(): SessionStoragePort | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; }
  catch { return null; }
}

export function saveLoginSession(session: SavedLoginSession, storage = getStorage(), now = Date.now()): void {
  if (!storage || !session.username.trim() || !session.reLoginCode.trim()) return;
  try { storage.setItem(SESSION_KEY, JSON.stringify({ ...session, savedAt: now })); }
  catch { /* Safari private mode / restricted storage: session still works until reload. */ }
}

export function readLoginSession(storage = getStorage(), now = Date.now()): SavedLoginSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Bad session');
    const session = data as Record<string, unknown>;
    if (typeof session.username !== 'string' || !session.username.trim()
      || typeof session.reLoginCode !== 'string' || !session.reLoginCode.trim()
      || typeof session.savedAt !== 'number' || !Number.isFinite(session.savedAt)
      || session.savedAt > now || now - session.savedAt >= SESSION_MAX_AGE_MS) {
      throw new Error('Expired or invalid session');
    }
    return { username: session.username, reLoginCode: session.reLoginCode };
  } catch {
    clearLoginSession(storage);
    return null;
  }
}

export function clearLoginSession(storage = getStorage()): void {
  try { storage?.removeItem(SESSION_KEY); } catch { /* storage inaccessible */ }
}
