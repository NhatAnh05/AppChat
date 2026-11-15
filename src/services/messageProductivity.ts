/** Productivity helpers. These functions never introduce unsupported server actions. */
import type { Message } from '../data/previewContent';
import { messagePreview } from './mediaMessages.ts';

const stripAccents = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').replace(/đ/g, 'd');

export function messageExcerpt(message: Message, limit = 130): string {
  const content = messagePreview(message.text ?? message.fileName ?? '[Đính kèm]')
    .replace(/\s+/g, ' ').trim();
  return content.length > limit ? `${content.slice(0, Math.max(1, limit - 1))}…` : content;
}

/** The server's group history uses replyTo as a UI-only sender hint. */
export function senderLabel(message: Message, chatName: string): string {
  if (message.fromMe) return 'Bạn';
  const sender = message.replyTo?.match(/^Người gửi: (.+)$/)?.[1]?.trim();
  return sender || chatName;
}

/** Quoted replies are sent as ordinary text through SEND_CHAT. No new API event is assumed. */
export function formatQuotedReply(original: Message, sender: string, response: string): string {
  const clean = response.trim();
  if (!clean) return '';
  const safeSender = sender.replace(/[\r\n:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Người dùng';
  const quoted = messageExcerpt(original, 140).replace(/[\r\n]/g, ' ');
  return `↪ Trả lời ${safeSender}: ${quoted}\n\n${clean}`;
}

export function parseQuotedReply(value: string): { sender: string; excerpt: string; body: string } | null {
  const match = /^↪ Trả lời ([^:\n]{1,60}): ([^\n]{1,200})\n\n([\s\S]+)$/.exec(value);
  if (!match?.[3]?.trim()) return null;
  return { sender: match[1], excerpt: match[2], body: match[3] };
}

export function searchMessageIds(messages: Message[], search: string): string[] {
  const query = stripAccents(search.trim());
  if (!query) return [];
  return messages.filter(message => stripAccents(messageExcerpt(message, 20000)).includes(query)).map(message => message.id);
}

/** Store a non-reversible short key rather than persisting message content in preferences. */
export function bookmarkKey(message: Message): string {
  const source = `${message.fromMe ? 'me' : 'them'}\u001f${message.createdAt ?? `${message.day ?? ''} ${message.time}`}\u001f${message.text ?? message.fileName ?? message.id}`;
  let first = 2166136261;
  let second = 2166136261;
  for (let i = 0; i < source.length; i++) {
    first = Math.imul(first ^ source.charCodeAt(i), 16777619);
    second = Math.imul(second ^ source.charCodeAt(source.length - 1 - i), 16777619);
  }
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export type TranscriptFormat = 'txt' | 'json';
export function exportConversation(chatName: string, messages: Message[], format: TranscriptFormat, at = new Date()): string {
  const exportedAt = at.toISOString();
  const entries = messages.map(message => ({
    sender: senderLabel(message, chatName),
    time: message.createdAt ?? message.time,
    content: message.text ?? (message.fileName ? `[Tệp: ${message.fileName}]` : '[Nội dung đính kèm]'),
    status: /^(local|unverified|failed):/.test(message.id) ? 'chưa_xac_minh' : 'nhan_tu_ung_dung',
  }));
  if (format === 'json') return JSON.stringify({ conversation: chatName, exportedAt, scope: 'Tin đã tải trong trình duyệt', messages: entries }, null, 2);
  return [`LYRACHAT - HỘI THOẠI: ${chatName}`, `Xuất lúc: ${exportedAt}`, 'Chỉ bao gồm tin đang tải trong trình duyệt; chưa chắc là toàn bộ lịch sử.', '', ...entries.map(entry => `[${entry.time || 'Không rõ thời gian'}] ${entry.sender}${entry.status === 'chưa_xac_minh' ? ' (chưa xác minh)' : ''}: ${entry.content}`)].join('\n');
}

export function safeExportFilename(chatName: string, format: TranscriptFormat): string {
  const slug = stripAccents(chatName).replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'hoi-thoai';
  return `LyraChat-${slug}.${format}`;
}
