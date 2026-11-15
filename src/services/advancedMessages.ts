/** Client-side productivity features that do not require new server actions. */
import type { Message } from '../data/previewContent';
import { messagePreview, parseMediaMessage, type MediaKind } from './mediaMessages.ts';
import { senderLabel } from './messageProductivity.ts';

export type LibraryFilter = 'all' | 'image' | 'video' | 'file' | 'sticker';
export type LibraryEntry = {
  messageId: string;
  index: number;
  kind: MediaKind;
  url?: string;
  name: string;
  caption: string;
};

/** Only render media envelopes that passed the existing safe URL parser. */
export function collectMediaLibrary(messages: Message[]): LibraryEntry[] {
  const entries: LibraryEntry[] = [];
  for (const message of messages) {
    const media = parseMediaMessage(message.text ?? '');
    if (!media) continue;
    media.items.forEach((item, index) => {
      entries.push({
        messageId: message.id,
        index,
        kind: item.kind,
        url: item.url,
        name: item.name || ({image:'Ảnh',gif:'GIF',video:'Video',file:'Tệp đính kèm',sticker:'Sticker'}[item.kind]),
        caption: media.caption || '',
      });
    });
  }
  return entries;
}

export function filterMediaLibrary(entries: LibraryEntry[], filter: LibraryFilter): LibraryEntry[] {
  if (filter === 'all') return entries;
  if (filter === 'image') return entries.filter(entry => entry.kind === 'image' || entry.kind === 'gif');
  return entries.filter(entry => entry.kind === filter);
}

/** Return selected messages in timeline order, ignoring stale selection IDs. */
export function pickedMessages(messages: Message[], selected: ReadonlySet<string>): Message[] {
  return messages.filter(message => selected.has(message.id));
}

/** Plain-text bulk copy; media envelopes are represented by readable descriptions. */
export function formatSelectedCopy(chatName: string, messages: Message[]): string {
  return messages.map(message => `[${message.createdAt || message.time || 'Không rõ giờ'}] ${senderLabel(message, chatName)}: ${messagePreview(message.text ?? message.fileName ?? '[Đính kèm]')}`).join('\n');
}

/** An attachment is forwarded unchanged so the recipient can open it in LyraChat. */
export function prepareForwardMessage(message: Message): string {
  const value = message.text || '';
  if (parseMediaMessage(value)) return value;
  if (value.startsWith('[[LYRA_MEDIA_V1]]')) return ''; // refuse malformed media envelope
  const plain = value.trim() || (message.fileName ? `[Tệp: ${message.fileName}]` : '');
  if (!plain) return '';
  const result = `↪ Tin nhắn được chuyển tiếp:\n${plain}`;
  return result.length <= 10000 ? result : '';
}
