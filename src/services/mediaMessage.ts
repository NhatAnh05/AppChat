import { messagePreview, parseMediaMessage as parseEnvelope, makeMediaMessage } from './mediaMessages.ts';
import { MEDIA_PREFIX, parseMediaMessage, type LyraMedia } from './mediaProtocol.ts';
export { isSafeMediaUrl, resolveLocalMediaUrl, inferLegacyMediaKind, encodeMediaMessage, parseMediaMessage } from './mediaProtocol.ts';
export type { LyraMedia, LyraMediaKind } from './mediaProtocol.ts';

export function parseMediaCollection(content: string) {
  return parseEnvelope(content);
}
export function encodeMediaCollection(items: LyraMedia[]): string {
  const content = makeMediaMessage(items);
  if (content.length > 10000) throw new Error('Tệp đính kèm vượt giới hạn nội dung API.');
  return content;
}
export function mediaMessagePreview(content: string): string {
  const media = parseMediaMessage(content);
  if (media) return ({image:'📷 Hình ảnh', video:'🎬 Video', gif:'🎞️ GIF', file:'📎 Tệp đính kèm', audio:'🎙️ Ghi âm'})[media.kind];
  return content.startsWith(MEDIA_PREFIX) ? messagePreview(content) : content;
}
