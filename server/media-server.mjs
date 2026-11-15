import http from 'node:http';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const root = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(root, 'uploads');
const maxBytes = 25 * 1024 * 1024;
const types = new Map([
  ['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/gif', 'gif'],
  ['image/webp', 'webp'], ['image/avif', 'avif'], ['video/mp4', 'mp4'],
  ['video/webm', 'webm'], ['video/quicktime', 'mov'],
  ['application/pdf', 'pdf'], ['text/plain', 'txt'], ['text/csv', 'csv'],
  ['application/zip', 'zip'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
]);
const mimeByExtension = new Map([...types].map(([type, ext]) => [ext, type]));
const port = Number(process.env.MEDIA_PORT || 8787);
// Chỉ lắng nghe máy cục bộ theo mặc định. Không public khi chưa có xác thực / rate limit.
const host = process.env.MEDIA_HOST || '127.0.0.1';
await mkdir(uploadDir, { recursive: true });
const json = (res, status, body) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };

http.createServer(async (req, res) => {
  const requestPath = new URL(req.url || '/', 'http://localhost').pathname;
  if (req.method === 'GET' && requestPath === '/api/media/health') return json(res, 200, {ok:true});
  if (req.method === 'POST' && requestPath === '/api/media/files') {
    if (req.headers['x-lyra-upload'] !== '1') { req.resume(); return json(res, 403, {error:'Yêu cầu tải tệp không hợp lệ.'}); }
    const mime = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    const ext = types.get(mime);
    if (!ext) { req.resume(); return json(res, 415, {error:'Định dạng tệp chưa được hỗ trợ.'}); }
    if (Number(req.headers['content-length']) > maxBytes) { req.resume(); return json(res, 413, {error:'Tệp lớn hơn 25 MB.'}); }
    const id = randomUUID() + '.' + ext;
    const filePath = path.join(uploadDir, id);
    let length = 0;
    const limiter = new Transform({
      transform(chunk, _, callback) {
        length += chunk.length;
        callback(length > maxBytes ? new Error('TOO_LARGE') : null, chunk);
      }
    });
    try {
      await pipeline(req, limiter, createWriteStream(filePath, {flags:'wx'}));
      if (!length) throw new Error('EMPTY');
      return json(res, 201, {path:'/api/media/files/' + id});
    } catch (err) {
      await unlink(filePath).catch(() => {});
      if (!res.headersSent && !res.destroyed) return json(res, err.message === 'TOO_LARGE' ? 413 : 400, {error:err.message === 'TOO_LARGE' ? 'Tệp lớn hơn 25 MB.' : 'Tải tệp thất bại.'});
      return;
    }
  }
  const match = req.method === 'GET' && /^\/api\/media\/files\/([0-9a-f-]{36})\.([a-z0-9]+)$/.exec(requestPath);
  if (match) {
    const [, uuid, ext] = match;
    const mime = mimeByExtension.get(ext);
    if (!mime) return json(res, 404, {error:'Không tìm thấy tệp.'});
    const filePath = path.join(uploadDir, uuid + '.' + ext);
    try {
      const stats = await stat(filePath);
      res.writeHead(200, {
        'Content-Type':mime,
        'Content-Length':stats.size,
        'X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; sandbox",
        'Cache-Control':'private, max-age=3600',
        'Content-Disposition': mime.startsWith('image/') || mime.startsWith('video/') ? 'inline' : 'attachment',
      });
      createReadStream(filePath).pipe(res);
    } catch { return json(res, 404, {error:'Không tìm thấy tệp.'}); }
    return;
  }
  return json(res, 404, {error:'Không tìm thấy đường dẫn.'});
}).listen(port, host, () => console.log(`LyraChat media server: http://${host}:${port} (local only)`));
