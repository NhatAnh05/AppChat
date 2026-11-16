import type { ChatMessage } from '../types/chat';

/** Client-side read state for API 1–5. The teacher server has no read-receipt endpoint. */
export type UnreadLedger = {
  version: 1;
  initialized: boolean;
  /** Conversation IDs whose initial server history has been observed. */
  initializedChats: string[];
  /** Only hashes/IDs are saved; message content is never stored here. */
  known: string[];
  unread: Record<string, string[]>;
};

const MAX_KNOWN = 12000;
const MAX_PER_CHAT = 300;
export const emptyUnreadLedger = (): UnreadLedger => ({version: 1, initialized: false, initializedChats: [], known: [], unread: {}});
const normalize = (value: string): string => value.trim().toLocaleLowerCase();
const hash = (text: string): string => {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
};

/** Include a content/time alias because an incoming WS message can later receive a server ID. */
export function messageKeys(message: ChatMessage): string[] {
  const chat = normalize(message.chatId);
  const sender = normalize(message.senderId);
  const createdAt = message.createdAt.trim();
  const contentFingerprint = hash(`${message.content.length}|${message.content}`);
  const bodyKey = `${chat}|${sender}|${createdAt}|${contentFingerprint}`;
  return [bodyKey, ...(message.id ? [`${chat}|id|${message.id}`] : [])];
}

export function readUnreadLedger(account: string, storage?: Pick<Storage, 'getItem'>): UnreadLedger {
  const actualStorage = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!actualStorage || !account.trim()) return emptyUnreadLedger();
  try {
    const raw = actualStorage.getItem(`lyra-unread-v1-${normalize(account)}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return emptyUnreadLedger();
    const state = parsed as Partial<UnreadLedger>;
    if (state.version !== 1 || typeof state.initialized !== 'boolean' ||
      !Array.isArray(state.known) || !Array.isArray(state.initializedChats) ||
      !state.unread || typeof state.unread !== 'object' || Array.isArray(state.unread)) return emptyUnreadLedger();
    const known = state.known.filter((entry): entry is string => typeof entry === 'string').slice(-MAX_KNOWN);
    const initializedChats = state.initializedChats.filter((entry): entry is string => typeof entry === 'string').map(normalize);
    const unread: Record<string, string[]> = {};
    for (const [chat, keys] of Object.entries(state.unread)) {
      if (Array.isArray(keys)) unread[normalize(chat)] = keys.filter((key): key is string => typeof key === 'string').slice(-MAX_PER_CHAT);
    }
    return {version: 1, initialized: state.initialized, initializedChats, known, unread};
  } catch { return emptyUnreadLedger(); }
}

export function saveUnreadLedger(account: string, ledger: UnreadLedger, storage?: Pick<Storage, 'setItem'>): void {
  const actualStorage = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!actualStorage || !account.trim()) return;
  try { actualStorage.setItem(`lyra-unread-v1-${normalize(account)}`, JSON.stringify(ledger)); }
  catch { /* storage is optional; app still works in private browsing */ }
}

export function getChatUnread(ledger: UnreadLedger, chatId: string): number {
  return ledger.unread[normalize(chatId)]?.length ?? 0;
}
export function getTotalUnread(ledger: UnreadLedger): number {
  return Object.values(ledger.unread).reduce((total, keys) => total + keys.length, 0);
}
export function markChatRead(ledger: UnreadLedger, chatId: string): UnreadLedger {
  const id = normalize(chatId);
  if (!ledger.unread[id]?.length) return ledger;
  const unread = {...ledger.unread};
  delete unread[id];
  return {...ledger, unread};
}

/** A real-time incoming frame can precede the first history fetch. Do not discard it. */
export function recordIncomingMessage(ledger: UnreadLedger, message: ChatMessage, account: string,
  activeChatId: string | null, isVisible: boolean): UnreadLedger {
  if (normalize(message.senderId) === normalize(account)) return ledger;
  const keys = messageKeys(message);
  const known = new Set(ledger.known);
  if (keys.some(key => known.has(key))) return ledger;
  keys.forEach(key => known.add(key));
  const chat = normalize(message.chatId);
  const isRead = isVisible && chat === normalize(activeChatId ?? '');
  const unread = {...ledger.unread};
  if (!isRead) unread[chat] = [...(unread[chat] ?? []), keys[0]].slice(-MAX_PER_CHAT);
  return {...ledger, known: [...known].slice(-MAX_KNOWN), unread};
}

/**
 * Apply Redux history changes without counting old messages as newly received.
 * Newly loaded conversations are baselined; only later new incoming messages raise badges.
 */
export function reconcileUnreadMessages(ledger: UnreadLedger, messages: readonly ChatMessage[], account: string,
  loadedChatIds: readonly string[], baselineReady: boolean,
  activeChatId: string | null, isVisible: boolean): UnreadLedger {
  if (!ledger.initialized && !baselineReady) return ledger;
  const previousChats = new Set(ledger.initializedChats);
  const allChats = new Set([...ledger.initializedChats, ...loadedChatIds.map(normalize)]);
  const known = new Set(ledger.known);
  const unread: Record<string, string[]> = {...ledger.unread};
  let changed = !ledger.initialized || allChats.size !== previousChats.size;
  for (const message of messages) {
    const keys = messageKeys(message);
    if (keys.some(key => known.has(key))) {
      // Backfill aliases when a server ACK changes the message identifier.
      for (const key of keys) if (!known.has(key)) {known.add(key); changed = true;}
      continue;
    }
    for (const key of keys) known.add(key);
    changed = true;
    const chat = normalize(message.chatId);
    if (normalize(message.senderId) === normalize(account)) continue;
    // First fetch of a chat is the baseline, not a stream of new notifications.
    if (!ledger.initialized || !previousChats.has(chat)) continue;
    if (isVisible && chat === normalize(activeChatId ?? '')) continue;
    unread[chat] = [...(unread[chat] ?? []), keys[0]].slice(-MAX_PER_CHAT);
  }
  if (isVisible && activeChatId) {
    const chat = normalize(activeChatId);
    if (unread[chat]?.length) { delete unread[chat]; changed = true; }
  }
  if (!changed) return ledger;
  return {version: 1, initialized: true, initializedChats: [...allChats], known: [...known].slice(-MAX_KNOWN), unread};
}
