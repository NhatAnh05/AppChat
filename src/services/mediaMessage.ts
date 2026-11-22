export type LyraMediaKind = "image" | "video" | "file" | "gif";
export type LyraMedia = { kind: LyraMediaKind; url: string; name: string; size?: number };
const PREFIX = "[[LYRA_MEDIA_V1]]";

export function isSafeMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || (import.meta.env.DEV && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function encodeMediaMessage(media: LyraMedia): string {
  if (!isSafeMediaUrl(media.url)) throw new Error("Đường dẫn tệp phải dùng HTTPS (localhost được phép khi phát triển).");
  // WebSocket giảng viên nhận `mes` dưới dạng tin nhắn văn bản.
  // Gửi URL ngắn thay vì chuỗi JSON dài có emoji/metadata; người nhận vẫn
  // xem được tệp qua phần nhận diện URL trong LyraChat.
  return media.url;
}

export function parseMediaMessage(content: string): LyraMedia | null {
  if (!content.startsWith(PREFIX)) {
    // Tệp gửi mới được biểu diễn bằng URL HTTPS thông thường.
    if (!isSafeMediaUrl(content.trim())) return null;
    try {
      const url = new URL(content.trim());
      const rawName = decodeURIComponent(url.pathname.split("/").pop() || "Tệp đính kèm");
      const fileName = rawName.slice(0, 180);
      const ext = url.pathname.split(".").pop()?.toLowerCase();
      const kind: LyraMediaKind = ext === "gif" ? "gif" :
          ["jpg", "jpeg", "png", "webp", "avif"].includes(ext || "") ? "image" :
              ["mp4", "webm", "mov"].includes(ext || "") ? "video" : "file";
      return {kind, url: content.trim(), name: fileName};
    } catch { return null; }
  }
  try {
    const parsed: unknown = JSON.parse(content.slice(PREFIX.length));
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<LyraMedia>;
    if (!value.kind || !["image", "video", "file", "gif"].includes(value.kind)) return null;
    if (typeof value.url !== "string" || !isSafeMediaUrl(value.url)) return null;
    if (typeof value.name !== "string" || !value.name.trim()) return null;
    return {kind: value.kind, url: value.url, name: value.name.slice(0, 180), size: value.size};
  } catch { return null; }
}

export function mediaMessagePreview(content: string): string {
  const media = parseMediaMessage(content);
  if (!media) return content;
  return ({image: "📷 Hình ảnh", video: "🎬 Video", gif: "🎞️ GIF", file: "📎 Tệp đính kèm"})[media.kind];
}
