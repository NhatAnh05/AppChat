/** Personal notes are local to this browser, account and conversation. */
const PREFIX = 'lyra:private-notes:v1:';
export const MAX_NOTE_LENGTH = 2000;
const scopedKey = (account: string, conversation: string) => `${PREFIX}${encodeURIComponent(account)}:${encodeURIComponent(conversation)}`;

export function readConversationNote(account: string, conversation: string): string {
  if (!account || !conversation) return '';
  try {
    const value = globalThis.localStorage?.getItem(scopedKey(account, conversation));
    return typeof value === 'string' ? value.slice(0, MAX_NOTE_LENGTH) : '';
  } catch { return ''; }
}

export function saveConversationNote(account: string, conversation: string, note: string): boolean {
  if (!account || !conversation) return false;
  try {
    const key = scopedKey(account, conversation);
    if (!note.trim()) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, note.slice(0, MAX_NOTE_LENGTH));
    return true;
  } catch { return false; }
}
