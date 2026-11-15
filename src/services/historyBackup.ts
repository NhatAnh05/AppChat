/**
 * Portable LOCAL history backup.
 * This never talks to the lecturer's server and must not be represented as
 * server-confirmed history. No password, session token or login code is saved.
 */
import type { Conversation, Message } from '../data/previewContent';

export const HISTORY_BACKUP_FORMAT = 'lyra-local-history';
export const HISTORY_BACKUP_MAX_BYTES = 8 * 1024 * 1024;
const MAX_CONVERSATIONS = 150;
const MAX_MESSAGES_PER_CONVERSATION = 300;

export type HistorySnapshot = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
};

type PortableBackup = HistorySnapshot & {
  format: typeof HISTORY_BACKUP_FORMAT;
  version: 1;
  username: string;
  exportedAt: string;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (id: string) => /^(people|room):[^\s].*$/.test(id) && id.length <= 180;
const optionalText = (value: unknown, max = 10000) => typeof value === 'string' ? value.slice(0, max) : undefined;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

function cleanConversation(input: unknown): Conversation | null {
  if (!record(input) || typeof input.id !== 'string' || !validId(input.id)) return null;
  const name = input.id.slice(input.id.indexOf(':') + 1);
  const conversation: Conversation = {
    id: input.id,
    name,
    initial: name.slice(0, 1).toUpperCase(),
    color: input.id.startsWith('room:') ? '#637f99' : '#4c9c8a',
    preview: optionalText(input.preview, 300) || 'Bắt đầu cuộc trò chuyện',
    time: optionalText(input.time, 80) || '',
    unread: 0,
    group: input.id.startsWith('room:'),
  };
  if (typeof input.pinned === 'boolean') conversation.pinned = input.pinned;
  if (typeof input.muted === 'boolean') conversation.muted = input.muted;
  if (typeof input.archived === 'boolean') conversation.archived = input.archived;
  return conversation;
}

function cleanMessage(input: unknown, markImported: boolean): Message | null {
  if (!record(input) || typeof input.id !== 'string' || !input.id || input.id.length > 500 || typeof input.fromMe !== 'boolean') return null;
  const text = optionalText(input.text);
  const attachment = input.attachment === 'photo' || input.attachment === 'file' ? input.attachment : undefined;
  if (text === undefined && !attachment) return null;
  // Preserve the original ID for repeat-import dedupe, but never present a
  // portable copy as server-confirmed, even if the source browser had an ACK.
  const originalId = input.id.replace(/^(unverified:backup:)+/, '');
  const id = markImported ? `unverified:backup:${originalId}` : input.id;
  const result: Message = {
    id, fromMe: input.fromMe,
    time: optionalText(input.time, 40) || '',
  };
  if (text !== undefined) result.text = text;
  if (attachment) result.attachment = attachment;
  for (const field of ['createdAt', 'day', 'fileName', 'fileDetail', 'replyTo', 'emoji'] as const) {
    const value = optionalText(input[field], field === 'replyTo' ? 1000 : 300);
    if (value !== undefined) result[field] = value;
  }
  for (const field of ['clientSentAt', 'clientReceivedAt'] as const) {
    const value = number(input[field]);
    if (value !== undefined) result[field] = value;
  }
  if (typeof input.edited === 'boolean') result.edited = input.edited;
  // Imported history cannot assert a delivery/seen receipt.
  return result;
}

function cleanSnapshot(input: HistorySnapshot | Record<string, unknown>, markImported: boolean): HistorySnapshot {
  const conversations: Conversation[] = [];
  const messages: Record<string, Message[]> = Object.create(null);
  const sourceConversations = Array.isArray(input.conversations) ? input.conversations : [];
  const sourceMessages = record(input.messages) ? input.messages : {};
  const ids = new Set<string>();
  for (const candidate of sourceConversations.slice(0, MAX_CONVERSATIONS)) {
    const entry = cleanConversation(candidate);
    if (entry && !ids.has(entry.id)) { conversations.push(entry); ids.add(entry.id); }
  }
  for (const [id, list] of Object.entries(sourceMessages)) {
    if (!validId(id) || !Array.isArray(list)) continue;
    if (!ids.has(id)) {
      if (conversations.length >= MAX_CONVERSATIONS) continue;
      const entry = cleanConversation({id});
      if (!entry) continue;
      conversations.push(entry);
      ids.add(id);
    }
    messages[id] = list.slice(-MAX_MESSAGES_PER_CONVERSATION).map(item => cleanMessage(item, markImported)).filter((m): m is Message => m !== null);
  }
  return {conversations, messages};
}

export function serializeHistoryBackup(username: string, snapshot: HistorySnapshot): string {
  const safe = cleanSnapshot(snapshot, false);
  const portable: PortableBackup = {
    format: HISTORY_BACKUP_FORMAT, version: 1, username,
    exportedAt: new Date().toISOString(), ...safe,
  };
  const content = JSON.stringify(portable, null, 2);
  if (new TextEncoder().encode(content).length > HISTORY_BACKUP_MAX_BYTES) {
    throw new Error('Lịch sử vượt giới hạn 8 MB. Hãy giảm số tin trong bản sao cục bộ trước khi xuất.');
  }
  return content;
}

export function parseHistoryBackup(content: string, currentUsername: string): HistorySnapshot {
  if (new TextEncoder().encode(content).length > HISTORY_BACKUP_MAX_BYTES) throw new Error('File sao lưu vượt quá 8 MB.');
  let source: unknown;
  try { source = JSON.parse(content); } catch { throw new Error('File không phải JSON hợp lệ.'); }
  if (!record(source) || source.format !== HISTORY_BACKUP_FORMAT || source.version !== 1) {
    throw new Error('Đây không phải file sao lưu lịch sử LyraChat phiên bản 1.');
  }
  if (source.username !== currentUsername) throw new Error('File thuộc tài khoản khác. Không thể nhập lịch sử chéo tài khoản.');
  if (!Array.isArray(source.conversations) || !record(source.messages)) throw new Error('File sao lưu thiếu danh sách lịch sử hợp lệ.');
  return cleanSnapshot(source, true);
}

const sourceId = (id: string) => id.replace(/^(unverified:backup:)+/, '').replace(/^(local|unverified):/, 'pending:');

/** Merge, never replace existing locally saved conversations. Safe to import same file twice. */
export function mergeHistoryBackup(current: HistorySnapshot, imported: HistorySnapshot): HistorySnapshot {
  const conversations = [...current.conversations];
  const ids = new Set(conversations.map(c => c.id));
  for (const conversation of imported.conversations) {
    if (!ids.has(conversation.id)) { conversations.push(conversation); ids.add(conversation.id); }
  }
  const messages: Record<string, Message[]> = {...current.messages};
  for (const [id, list] of Object.entries(imported.messages)) {
    const original = messages[id] || [];
    const seen = new Set(original.map(m => sourceId(m.id)));
    const additions: Message[] = [];
    for (const message of list) {
      const key = sourceId(message.id);
      if (!seen.has(key)) { seen.add(key); additions.push(message); }
    }
    messages[id] = [...original, ...additions].slice(-MAX_MESSAGES_PER_CONVERSATION);
  }
  return {conversations, messages};
}
