import type { LyraMedia, LyraMediaKind } from "./mediaMessage";
import { isSafeMediaUrl } from "./mediaMessage";

// Tải file trực tiếp vào máy chủ media đi kèm dự án, không dùng Cloudinary.
// Trong môi trường phát triển, Vite proxy /api/media đến http://127.0.0.1:8787.
const endpoint = "/api/media/files";
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function uploadMedia(file: File, kind: LyraMediaKind): Promise<LyraMedia> {
  if (file.size > MAX_FILE_SIZE) throw new Error("Tệp vượt quá 25 MB.");
  if (kind === "image" && !file.type.startsWith("image/")) throw new Error("Hãy chọn tệp ảnh.");
  if (kind === "video" && !file.type.startsWith("video/")) throw new Error("Hãy chọn tệp video.");
  if (kind === "gif" && file.type !== "image/gif") throw new Error("Hãy chọn tệp GIF.");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
        "X-Lyra-Upload": "1",
      },
      body: file,
    });
  } catch {
    throw new Error("Không kết nối được máy chủ lưu tệp. Hãy chạy npm run dev:full.");
  }
  const body: unknown = await response.json().catch(() => null);
  const data = body && typeof body === "object" ? body as { path?: string; error?: string } : {};
  if (!response.ok || !data.path) {
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      throw new Error(`Máy chủ lưu tệp không khả dụng (HTTP ${response.status}). Chạy npm run dev:full, kiểm tra http://localhost:5173/api/media/health.`);
    }
    throw new Error(data.error || `Tải tệp thất bại (HTTP ${response.status}).`);
  }

  // Khi triển khai cho nhiều máy, bắt buộc cấu hình HTTPS công khai (cùng reverse-proxy /api/media).
  const publicBase = (import.meta.env.VITE_MEDIA_PUBLIC_BASE_URL || window.location.origin).replace(/\/$/, "");
  const url = new URL(data.path, publicBase).toString();
  if (!isSafeMediaUrl(url)) throw new Error("Địa chỉ file không an toàn. Máy chủ triển khai phải chạy HTTPS.");
  return { kind, url, name: file.name, size: file.size };
}
