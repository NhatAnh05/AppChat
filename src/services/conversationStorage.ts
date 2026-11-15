/** Local-only preferences and drafts. The server does not provide these operations. */
import type { Conversation } from '../data/previewContent';

export type ConversationPreference = Pick<Conversation, 'pinned' | 'muted' | 'archived'>;
const PREF_PREFIX = 'lyra:conversation-preferences:v1:';
const DRAFT_PREFIX = 'lyra:draft:v1:';
const safeSegment = (s: string) => encodeURIComponent(s);
const storage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
};

export function readConversationPreferences(user: string): Record<string, ConversationPreference> {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(PREF_PREFIX + safeSegment(user)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => !!v && typeof v === 'object' && !Array.isArray(v)).map(([id, value]) => {
      const flags = value as Record<string, unknown>;
      return [id, { pinned: flags.pinned === true, muted: flags.muted === true, archived: flags.archived === true }];
    }));
  } catch { return {}; }
}

export function saveConversationPreferences(user: string, preferences: Record<string, ConversationPreference>): void {
  try { storage()?.setItem(PREF_PREFIX + safeSegment(user), JSON.stringify(preferences)); }
  catch { /* Storage unavailable or full: preferences remain usable in memory. */ }
}

const draftKey = (user: string, conversationId: string) => `${DRAFT_PREFIX}${safeSegment(user)}:${safeSegment(conversationId)}`;
export function readDraft(user: string, conversationId: string): string {
  if (!user || !conversationId) return '';
  try { return (storage()?.getItem(draftKey(user, conversationId)) ?? '').slice(0, 10000); }
  catch { return ''; }
}
export function saveDraft(user: string, conversationId: string, value: string): void {
  if (!user || !conversationId) return;
  try {
    const key = draftKey(user, conversationId);
    if (value) storage()?.setItem(key, value.slice(0, 10000));
    else storage()?.removeItem(key);
  } catch { /* Ignore storage quota errors. */ }
}
