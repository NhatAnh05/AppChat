export type LyraMediaKind = "image" | "video" | "file" | "gif" | "audio";
export type LyraMedia = { kind: LyraMediaKind; url: string; name: string; size?: number };
export const MEDIA_PREFIX = "[[LYRA_MEDIA_V1]]";

export function isSafeMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || (import.meta.env?.DEV && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

/** Only rebase explicit local-sandbox capability URLs. Never rewrite production or old unscoped files. */
export function resolveLocalMediaUrl(value: string, currentOrigin: string, localEnabled: boolean): string {
  if (!localEnabled) return value;
  try {
    const source = new URL(value), target = new URL(currentOrigin);
    const loopback = (url: URL) => url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname) && !url.username && !url.password;
    if (!loopback(source) || !loopback(target) || !/^\/api\/media\/local\/files\/[A-Za-z0-9_-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/.test(source.pathname) || !/^[a-f0-9]{64}$/i.test(source.searchParams.get('cap') ?? '')) return value;
    return new URL(source.pathname + source.search, target.origin).href;
  } catch { return value; }
}

export function inferLegacyMediaKind(kind: LyraMediaKind, url: string, name: string): LyraMediaKind {
  const extension = (text: string) => text.split('.').at(-1)?.toLowerCase() ?? '';
  const pathExt = extension(new URL(url).pathname);
  const nameExt = extension(name);
  // The server path is authoritative when it has a known extension; only
  // use a filename for extensionless media paths on our own API.
  const ext = pathExt && /^[a-z0-9]{2,5}$/.test(pathExt) ? pathExt : new URL(url).pathname.startsWith('/api/media/') ? nameExt : '';
  if ((kind === 'file' || kind === 'image') && ext === 'gif') return 'gif';
  if (kind === 'file' && ['jpg','jpeg','png','webp','avif'].includes(ext)) return 'image';
  if (kind === 'file' && ['mp4','webm','mov'].includes(ext)) return 'video';
  if (kind === 'file' && ['weba','m4a','wav'].includes(ext)) return 'audio';
  return kind;
}

export function encodeMediaMessage(media: LyraMedia): string {
  if (!isSafeMediaUrl(media.url)) throw new Error("Đường dẫn tệp phải dùng HTTPS (localhost được phép khi phát triển).");
  // WebSocket giảng viên nhận `mes` dưới dạng tin nhắn văn bản.
  // Preserve name and size in the existing text-only transport. Older URL-only
  // messages remain readable; clients without this codec may show raw text.
  return MEDIA_PREFIX + JSON.stringify({kind:media.kind,url:media.url,name:media.name.slice(0,180),size:media.size});
}

export function parseMediaMessage(content: string): LyraMedia | null {
  if (!content.startsWith(MEDIA_PREFIX)) {
    // Tương thích với tin URL-only từ các phiên bản trước.
    if (!isSafeMediaUrl(content.trim())) return null;
    try {
      const url = new URL(content.trim());
      const rawName = decodeURIComponent(url.pathname.split("/").pop() || "Tệp đính kèm");
      const fileName = rawName.slice(0, 180);
      const ext = url.pathname.split(".").pop()?.toLowerCase();
      if (!url.pathname.startsWith("/api/media/files/") && !url.pathname.startsWith("/api/media/local/files/") && !["jpg","jpeg","png","webp","avif","gif","mp4","webm","mov","weba","m4a","wav","pdf","txt","csv","zip","docx","xlsx","pptx"].includes(ext || "")) return null;
      const kind: LyraMediaKind = ext === "gif" ? "gif" :
          ["jpg", "jpeg", "png", "webp", "avif"].includes(ext || "") ? "image" :
              ["mp4", "webm", "mov"].includes(ext || "") ? "video" : ["weba", "m4a", "wav"].includes(ext || "") ? "audio" : "file";
      return {kind, url: content.trim(), name: fileName};
    } catch { return null; }
  }
  try {
    const parsed: unknown = JSON.parse(content.slice(MEDIA_PREFIX.length));
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<LyraMedia>;
    if (!value.kind || !["image", "video", "file", "gif", "audio"].includes(value.kind)) return null;
    if (typeof value.url !== "string" || !isSafeMediaUrl(value.url)) return null;
    if (typeof value.name !== "string" || !value.name.trim()) return null;
    // Earlier clients sent GIFs via the generic file picker. A GIF path can
    // safely use the existing image renderer; URL security checks stay intact.
    const kind = inferLegacyMediaKind(value.kind, value.url, value.name);
    return {kind, url: value.url, name: value.name.slice(0, 180), size: typeof value.size === "number" && Number.isFinite(value.size) && value.size >= 0 ? value.size : undefined};
  } catch { return null; }
}

