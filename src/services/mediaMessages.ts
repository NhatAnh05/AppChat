/** Compatible legacy media envelope. The active chat composer uses mediaMessage.ts. */
export type MediaKind = 'image' | 'gif' | 'video' | 'file' | 'sticker';
export type MediaItem = {kind: MediaKind; url?: string; name?: string; sticker?: string};
export type MediaEnvelope = {version: 1; kind: 'media'; items: MediaItem[]; caption?: string};
const PREFIX = '[[LYRA_MEDIA_V1]]';
const validUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password && Boolean(parsed.hostname); }
  catch { return false; }
};
const cleanItem = (candidate: unknown): MediaItem | null => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const item = candidate as Record<string, unknown>;
  const kind = item.kind;
  if (kind !== 'image' && kind !== 'gif' && kind !== 'video' && kind !== 'file' && kind !== 'sticker') return null;
  if (kind === 'sticker') {
    if (typeof item.sticker !== 'string' || !item.sticker.trim() || item.sticker.length > 100) return null;
    return {kind, sticker: item.sticker};
  }
  if (!validUrl(item.url)) return null;
  const name = typeof item.name === 'string' ? item.name.slice(0, 180) : '';
  return {kind, url:item.url, ...(name ? {name} : {})};
};
export function makeMediaMessage(items: MediaItem[], caption = ''): string {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) throw new Error('Số lượng đính kèm không hợp lệ.');
  const clean = items.map(cleanItem);
  if (clean.some(item => !item)) throw new Error('Đính kèm hoặc URL không an toàn.');
  return PREFIX + JSON.stringify({version:1,kind:'media',items:clean,caption:caption.slice(0,1000)});
}
export function parseMediaMessage(value: string): MediaEnvelope | null {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return null;
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
const mediaLabel: Record<MediaKind, string> = {image:'📷 Ảnh',gif:'🎞️ GIF',video:'🎬 Video',file:'📎 Tệp',sticker:'🌟 Sticker'};
export function messagePreview(text: string): string {
  const media = parseMediaMessage(text);
  if (!media) return text.startsWith(PREFIX) ? '[Tệp đính kèm không hợp lệ]' : text;
  return `${media.items.map(item => mediaLabel[item.kind]).join(', ')}${media.caption ? `: ${media.caption}` : ''}`;
}
