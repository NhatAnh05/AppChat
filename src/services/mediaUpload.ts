import { assertCurrentSession, currentSessionSignal } from './sessionScope.ts';
import type { LyraMedia, LyraMediaKind } from "./mediaMessage.ts";
import { voiceBytesMatch } from "./voiceWav.ts";
import { isSafeMediaUrl } from "./mediaMessage.ts";

// Tải file trực tiếp vào máy chủ media đi kèm dự án, không dùng Cloudinary.
// Trong môi trường phát triển, Vite proxy /api/media đến http://127.0.0.1:8787.
function mediaEndpoint(user: string, target: string, isGroup: boolean): string {
  const normalized = [user.trim().toLowerCase(), target.trim().toLowerCase()];
  const scope = isGroup ? ['room', normalized[1]] : ['people', ...normalized.sort()];
  const bytes = new TextEncoder().encode(JSON.stringify(scope));
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const local = import.meta.env.DEV && import.meta.env.VITE_LYRA_LOCAL_MEDIA === '1';
  return `/api/media/${local ? 'local/' : ''}files/${encoded}`;
}
const fileTypes: Record<string,string> = {
  png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',
  wav:'audio/wav',weba:'audio/webm',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',zip:'application/zip',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export function mediaMime(file: Pick<File,'name'|'type'>): string {
  if (file.type==='application/x-zip-compressed') return 'application/zip';
  if (file.type==='application/x-zip') return 'application/zip';
  const base = file.type.split(';')[0].trim().toLowerCase();
  return base && base !== 'application/octet-stream' ? base : fileTypes[file.name.split('.').at(-1)?.toLowerCase() || ''] || 'application/octet-stream';
}
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function uploadMedia(file: File, kind: LyraMediaKind, user: string, target: string, isGroup: boolean, session = currentSessionSignal()): Promise<LyraMedia> {
  assertCurrentSession(session);
  const endpoint = mediaEndpoint(user, target, isGroup);
  const mime = mediaMime(file);
  if (!file.size) throw new Error("Tệp rỗng không thể gửi.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Tệp vượt quá 25 MB.");
  if (kind === "image" && !mime.startsWith("image/")) throw new Error("Hãy chọn tệp ảnh.");
  if (kind === "video" && !mime.startsWith("video/")) throw new Error("Hãy chọn tệp video.");
  if (kind === "gif" && mime !== "image/gif") throw new Error("Hãy chọn tệp GIF.");

  if (kind === "audio" && !["audio/webm","audio/mp4","audio/wav"].includes(mime)) throw new Error("Định dạng ghi âm không được hỗ trợ.");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      signal: session,
      headers: {
        "Content-Type": mime,
        "X-File-Name": encodeURIComponent(file.name),
      },
      body: file,
    });
  } catch {
    assertCurrentSession(session);
    throw new Error("Không kết nối được máy chủ lưu tệp. Nếu thử trên máy này, chạy npm run dev:full -- --local-media.");
  }
  const body: unknown = await response.json().catch(() => null);
  assertCurrentSession(session);
  const data = body && typeof body === "object" ? body as { path?: string; error?: string } : {};
  if (!response.ok || !data.path) {
    if (response.status === 401 || response.status === 403 || response.status === 503) throw new Error(data.error || "Chưa có phiên xác thực media hoặc cổng phân quyền chưa được cấu hình.");
    if (response.status === 404 || response.status === 502) {
      throw new Error(`Máy chủ lưu tệp không khả dụng (HTTP ${response.status}). Kiểm tra tiến trình media và Vite; thử local bằng npm run dev:full -- --local-media.`);
    }
    throw new Error(data.error || `Tải tệp thất bại (HTTP ${response.status}).`);
  }

  // Khi triển khai cho nhiều máy, bắt buộc cấu hình HTTPS công khai (cùng reverse-proxy /api/media).
  const publicBase = (import.meta.env.VITE_MEDIA_PUBLIC_BASE_URL || window.location.origin).replace(/\/$/, "");
  const local = endpoint.startsWith("/api/media/local/");
  const url = new URL(data.path, local ? window.location.origin : publicBase).toString();
  if (new URL(url).origin !== window.location.origin || !data.path.startsWith(`${endpoint}/`)) throw new Error("Media cần cổng xác thực cùng origin.");
  if (!isSafeMediaUrl(url)) throw new Error("Địa chỉ file không an toàn. Máy chủ triển khai phải chạy HTTPS.");
  // Link localhost chỉ hoạt động trên chính máy đang chạy media server.
  // Từ máy hoặc điện thoại khác, URL này sẽ trỏ về thiết bị của người nhận.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(?::|\/)/i.test(url) && !import.meta.env.DEV) {
    throw new Error("Không thể gửi tệp bằng địa chỉ localhost khi triển khai. Cấu hình VITE_MEDIA_PUBLIC_BASE_URL trỏ tới máy chủ media HTTPS công khai.");
  }
  // Confirm the exact recording is readable before sending its URL via SEND_CHAT.
  // No automatic retransmission; preserve the local preview if this check fails.
  if(kind==='audio') {
    try {
      const check=await fetch(url,{credentials:'same-origin',signal:session,cache:'no-store'});
      if(!check.ok || check.headers.get('content-type')?.split(';')[0]!==mime || Number(check.headers.get('content-length'))!==file.size)throw new Error('Invalid response');
      const stored=await check.arrayBuffer();assertCurrentSession(session);
      if(!voiceBytesMatch(await file.arrayBuffer(),stored))throw new Error('Mismatched bytes');
    }catch{assertCurrentSession(session);throw new Error('Không xác minh được bản ghi đã tải lên. Bản nghe thử vẫn được giữ; chưa gửi tin nhắn.');}
  }
  const displayKind: LyraMediaKind = mime === "image/gif" ? "gif" : kind === "file" && mime.startsWith("image/") ? "image" : kind === "file" && mime.startsWith("video/") ? "video" : kind === "file" && mime.startsWith("audio/") ? "audio" : kind;
  return { kind: displayKind, url, name: file.name, size: file.size };
}
