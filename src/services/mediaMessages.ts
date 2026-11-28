/** Shared decoder for URL-only, single attachment and multi-attachment messages. */
import { MEDIA_PREFIX as PREFIX, isSafeMediaUrl, inferLegacyMediaKind, parseMediaMessage as parseSingle } from './mediaProtocol.ts';
export type MediaKind = 'image' | 'gif' | 'video' | 'file' | 'sticker' | 'audio';
export type MediaItem = {kind: MediaKind; url?: string; name?: string; sticker?: string; size?: number};
export type MediaEnvelope = {version: 1; kind: 'media'; items: MediaItem[]; caption?: string};
const validUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  return isSafeMediaUrl(url);
};
const cleanItem = (candidate: unknown): MediaItem | null => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const item = candidate as Record<string, unknown>;
  const kind = item.kind;
  if (kind !== 'image' && kind !== 'gif' && kind !== 'video' && kind !== 'file' && kind !== 'sticker' && kind !== 'audio') return null;
  if (kind === 'sticker') {
    if (typeof item.sticker !== 'string' || !item.sticker.trim() || item.sticker.length > 100) return null;
    return {kind, sticker: item.sticker};
  }
  if (!validUrl(item.url)) return null;
  const name = typeof item.name === 'string' ? item.name.slice(0, 180) : '';
  return {kind:inferLegacyMediaKind(kind,item.url,name), url:item.url, ...(name ? {name} : {}), ...(typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0 ? {size:item.size} : {})};
};
export function makeMediaMessage(items: MediaItem[], caption = ''): string {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) throw new Error('Số lượng đính kèm không hợp lệ.');
  const clean = items.map(cleanItem);
  if (clean.some(item => !item)) throw new Error('Đính kèm hoặc URL không an toàn.');
  return PREFIX + JSON.stringify({version:1,kind:'media',items:clean,caption:caption.slice(0,1000)});
}
export function parseMediaMessage(value: string): MediaEnvelope | null {
  if (typeof value !== 'string') return null;
  const single = parseSingle(value);
  if (single) return {version:1,kind:'media',items:[single],caption:''};
  if (!value.startsWith(PREFIX)) return null;
  try {
    const packet: unknown = JSON.parse(value.slice(PREFIX.length));
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return null;
    const env = packet as Record<string, unknown>;
    if (env.version !== 1 || env.kind !== 'media' || !Array.isArray(env.items) || env.items.length === 0 || env.items.length > 20) return null;
    const items = env.items.map(cleanItem);
    if (items.some(item => !item)) return null;
    return {version:1,kind:'media',items:items as MediaItem[],caption:typeof env.caption === 'string' ? env.caption.slice(0,1000) : ''};
  } catch { return null; }
}
const mediaLabel: Record<MediaKind, string> = {image:'📷 Ảnh',gif:'🎞️ GIF',video:'🎬 Video',file:'📎 Tệp',sticker:'🌟 Sticker',audio:'🎙️ Ghi âm'};
export function messagePreview(text: string): string {
  const media = parseMediaMessage(text);
  if (!media) return text.startsWith(PREFIX) ? '[Tệp đính kèm không hợp lệ]' : text;
  const kinds=new Set(media.items.map(item=>item.kind));
  const count=media.items.length;
  const labels:Record<MediaKind,string>={image:'hình ảnh',gif:'GIF',video:'video',file:'tệp đính kèm',sticker:'sticker',audio:'tin nhắn thoại'};
  const summary=count===1?mediaLabel[media.items[0].kind]:kinds.size===1?`${count} ${labels[media.items[0].kind]}`:Array.from(kinds).every(kind=>kind==='image'||kind==='gif')?`${count} ảnh và GIF`:`${count} tệp đa phương tiện`;
  return `${summary}${media.caption ? `: ${media.caption}` : ''}`;
}
