/** Media travels as a versioned JSON envelope in the teacher's existing SEND_CHAT.mes string.
 * The teacher's API only documents text; URLs must be reachable by both participants.
 * Real local file uploads require a separate user-configured upload endpoint.
 */
export const MEDIA_PREFIX = '[[LYRA_MEDIA_V1]]';
export type MediaKind = 'image' | 'video' | 'gif' | 'sticker' | 'file';
export type MediaItem = {kind: MediaKind; url?: string; name?: string; mime?: string; size?: number; sticker?: string};
export type MediaPayload = {version:1; kind:'media'; items:MediaItem[]; caption?:string};
const allowed = new Set<MediaKind>(['image','video','gif','sticker','file']);
export function isSafeMediaUrl(value: string): boolean {
  try {const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname && !url.username && !url.password;}
  catch {return false;}
}
export function makeMediaMessage(items: MediaItem[], caption = ''): string {
  if (!items.length || items.length > 10) throw new Error('Chọn từ 1 đến 10 nội dung.');
  for (const item of items) {
    if (!allowed.has(item.kind)) throw new Error('Loại nội dung không hỗ trợ.');
    if (item.kind === 'sticker') {
      if (!item.sticker || item.sticker.length > 16) throw new Error('Sticker không hợp lệ.');
    } else if (!item.url || !isSafeMediaUrl(item.url)) throw new Error('Cần liên kết HTTP(S) hợp lệ để gửi nội dung.');
  }
  const body = MEDIA_PREFIX + JSON.stringify({version:1,kind:'media',items,caption:caption.slice(0,500)} satisfies MediaPayload);
  if (body.length > 9000) throw new Error('Tin nhắn chứa quá nhiều dữ liệu.');
  return body;
}
export function parseMediaMessage(raw: string): MediaPayload | null {
  if (!raw.startsWith(MEDIA_PREFIX)) return null;
  try {
    const parsed:unknown = JSON.parse(raw.slice(MEDIA_PREFIX.length));
    if (!parsed || typeof parsed !== 'object') return null;
    const data = parsed as Partial<MediaPayload>;
    if (data.version !== 1 || data.kind !== 'media' || !Array.isArray(data.items) || !data.items.length || data.items.length > 10) return null;
    const items:MediaItem[]=[];
    for (const item of data.items) {
      if (!item || typeof item !== 'object' || !allowed.has(item.kind)) return null;
      if (item.kind === 'sticker') {
        if (typeof item.sticker !== 'string' || item.sticker.length > 16) return null;
        items.push({kind:'sticker',sticker:item.sticker});
      } else {
        if (typeof item.url !== 'string' || !isSafeMediaUrl(item.url)) return null;
        items.push({kind:item.kind,url:item.url,name:typeof item.name==='string'?item.name.slice(0,150):undefined,mime:typeof item.mime==='string'?item.mime.slice(0,90):undefined,size:typeof item.size==='number'?item.size:undefined});
      }
    }
    return {kind:'media',version:1,items,caption:typeof data.caption==='string'?data.caption.slice(0,500):undefined};
  } catch {return null;}
}
export function messagePreview(text:string):string {
  const media=parseMediaMessage(text);
  if (!media) return text.startsWith(MEDIA_PREFIX)?'Nội dung đính kèm không hợp lệ':text;
  const labels:{[K in MediaKind]:string}={image:'📷 Ảnh',video:'🎬 Video',gif:'🎞️ GIF',sticker:'😊 Sticker',file:'📎 Tệp'};
  return `${labels[media.items[0].kind]}${media.items.length>1?` (${media.items.length})`:''}${media.caption?` · ${media.caption}`:''}`;
}
