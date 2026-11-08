/** Optional external upload service. This does not modify the teacher's WebSocket protocol.
 * Set VITE_MEDIA_UPLOAD_URL only if you control a trusted uploader that returns { url: "https://..." }.
 */
import { isSafeMediaUrl } from './mediaMessages';
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export const mediaUploadEnabled = Boolean(import.meta.env.VITE_MEDIA_UPLOAD_URL?.trim());
export async function uploadMediaFile(file:File):Promise<string> {
  const endpoint = import.meta.env.VITE_MEDIA_UPLOAD_URL?.trim();
  if (!endpoint) throw new Error('API của thầy chưa có chức năng upload. Hãy dùng liên kết công khai hoặc cấu hình VITE_MEDIA_UPLOAD_URL.');
  if (!isSafeMediaUrl(endpoint)) throw new Error('Địa chỉ dịch vụ upload không hợp lệ.');
  if (file.size > MAX_MEDIA_BYTES) throw new Error('Dung lượng tối đa mỗi tệp là 25 MB.');
  const body=new FormData();body.append('file',file);
  const response=await fetch(endpoint,{method:'POST',body});
  if (!response.ok) throw new Error(`Tải tệp thất bại (HTTP ${response.status}).`);
  const data:unknown=await response.json();
  const url=typeof data==='object' && data!==null && 'url' in data ? (data as {url:unknown}).url : null;
  if(typeof url!=='string'||!isSafeMediaUrl(url)) throw new Error('Dịch vụ upload cần trả JSON dạng {"url":"https://..."}.');
  return url;
}
