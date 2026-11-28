/** Giai đoạn 2: các tiện ích hiển thị trong LyraChat, không yêu cầu event API mới. */
import type { ChatMessage } from '../types/chat.ts';
import { parseInteraction, visibleMessageContent } from './messageInteractions.ts';
import { parseMediaCollection, mediaMessagePreview, type LyraMedia } from './mediaMessage.ts';

export type WorkspaceMedia = LyraMedia & { messageId: string; sender: string; index: number };

export function humanText(message: ChatMessage): string {
  return visibleMessageContent(message.content);
}

export function isUserMessage(message: ChatMessage): boolean {
  // Một số phản hồi lịch sử thiếu nội dung; không dựng bong bóng chat rỗng.
  // Tin reaction là sự kiện nội bộ, không phải tin nhắn hiển thị riêng.
  return parseInteraction(message.content)?.kind !== 'reaction'
    && visibleMessageContent(message.content).trim().length > 0;
}

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/Đ/g, 'd').toLocaleLowerCase('vi').trim();
}

/** Tìm trên những tin đã tải; không ngụ ý tìm toàn bộ lịch sử lưu trên server. */
export function findLoadedMessages(messages: ChatMessage[], query: string): ChatMessage[] {
  const needle = normalizeSearch(query);
  if (!needle) return messages.filter(isUserMessage);
  return messages.filter(item => isUserMessage(item) &&
    normalizeSearch(`${mediaMessagePreview(humanText(item))} ${parseMediaCollection(humanText(item))?.items.map(m=>m.name ?? m.sticker ?? "").join(" ") ?? ""} ${item.senderName ?? item.senderId}`).includes(needle));
}

/** Bookmark dựa trên định danh ổn định; không lưu nội dung tin nhắn vào localStorage. */
export function bookmarkId(message: ChatMessage): string {
  const value = `${message.chatId}\u001f${message.id}\u001f${message.senderId}`;
  let hash1 = 2166136261;
  let hash2 = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash1 = Math.imul(hash1 ^ value.charCodeAt(i), 16777619);
    hash2 = Math.imul(hash2 ^ value.charCodeAt(value.length - i - 1), 16777619);
  }
  return `${(hash1 >>> 0).toString(36)}-${(hash2 >>> 0).toString(36)}`;
}

export function collectLoadedMedia(messages: ChatMessage[]): WorkspaceMedia[] {
  return messages.filter(isUserMessage).flatMap(message => {
    const media = parseMediaCollection(humanText(message));
    return media?.items.flatMap((item,index) => item.kind !== 'sticker' && item.url ? [{kind:item.kind,url:item.url,name:item.name || 'Tệp đính kèm',size:item.size,messageId:message.id,sender:message.senderName ?? message.senderId,index}] : []) ?? [];
  });
}

/** Chuyển tiếp bằng SEND_CHAT thường; không bịa event FORWARD_CHAT không có trong API. */
export function forwardContent(message: ChatMessage): string | null {
  if (!isUserMessage(message)||message.id.startsWith('unverified:backup:')) return null;
  const original = humanText(message).trim();
  if (!original) return null;
  const media = parseMediaCollection(original);
  // Scoped storage links cannot be forwarded to another conversation without a new permission grant.
  if (media) return media.items.some(item => item.url && new URL(item.url).pathname.startsWith('/api/media/')) ? null : original.length <= 9500 ? original : null;
  if (original.startsWith('[[LYRA_MEDIA_V1]]') || original.startsWith('LYRA_INTERACT_V1:')) return null;
  const value = `↪ Chuyển tiếp:\n${original}`;
  return value.length <= 9500 ? value : null;
}

export function copySelectedMessages(messages: ChatMessage[], currentUserId: string): string {
  return messages.filter(isUserMessage).map(message => {
    const sender = message.senderId.toLowerCase() === currentUserId.toLowerCase()
      ? 'Bạn' : message.senderName ?? message.senderId;
    const content = parseMediaCollection(humanText(message));
    const description = content ? content.items.map(item => `[${item.kind.toUpperCase()}: ${item.name ?? item.sticker ?? 'Tệp đính kèm'}]${item.url && !new URL(item.url).pathname.startsWith('/api/media/') ? ` ${item.url}` : ''}`).join(' · ') + (content.caption ? ` — ${content.caption}` : '') : humanText(message);
    return `[${message.createdAt}] ${sender}: ${description}`;
  }).join('\n');
}
