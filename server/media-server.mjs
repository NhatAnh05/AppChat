import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.MEDIA_UPLOAD_DIR || path.join(root, 'uploads');
const maxBytes = 25 * 1024 * 1024;
const maxConcurrentUploads = 10;
const types = new Map([
  ['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/gif', 'gif'],
  ['image/webp', 'webp'], ['image/avif', 'avif'], ['video/mp4', 'mp4'],
  ['video/webm', 'webm'], ['video/quicktime', 'mov'],
  ['application/pdf', 'pdf'], ['text/plain', 'txt'], ['text/csv', 'csv'],
  ['application/zip', 'zip'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
]);
const secret = process.env.MEDIA_GATEWAY_SECRET || '';
const enabled = Buffer.byteLength(secret) >= 32;
const port = Number(process.env.MEDIA_PORT || 8787);
const host = process.env.MEDIA_HOST || '127.0.0.1';
// Do not expose this internal listener directly, even with a secret configured.
if (!['127.0.0.1','::1'].includes(host)) throw new Error('MEDIA_HOST must be loopback. Use an authenticated HTTPS gateway.');
await mkdir(uploadDir, { recursive:true, mode:0o700 });
const json = (res, status, body) => {
  if (res.destroyed || res.headersSent) return;
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
};
const deny = (req,res,status,error) => { res.setHeader('Connection','close'); req.resume(); return json(res,status,{error}); };
const normalize = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validName = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value === normalize(value) && !/[\x00-\x1f\x7f]/.test(value);
function parseScope(encoded) {
  if (encoded.length > 900) return null;
  try {
    const scope = JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
    if (!Array.isArray(scope) || Buffer.from(JSON.stringify(scope)).toString('base64url') !== encoded) return null;
    if (scope[0] === 'people' && scope.length === 3 && validName(scope[1]) && validName(scope[2]) && scope[1] < scope[2]) return scope;
    if (scope[0] === 'room' && scope.length === 2 && validName(scope[1])) return scope;
  } catch { /* invalid scope */ }
  return null;
}
// Only the trusted gateway may issue a claim after authenticating the user and
// verifying the exact conversation membership. Never trust browser headers.
function authenticate(req, pathname, scope) {
  const token = req.headers['x-lyra-media-authorization'];
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expected = createHmac('sha256',secret).update(payload).digest();
  if (!timingSafeEqual(expected,Buffer.from(sig,'hex'))) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    const now = Math.floor(Date.now()/1000);
    if (!validName(claim.user) || claim.method !== req.method || claim.path !== pathname || !Number.isInteger(claim.exp) || claim.exp <= now || claim.exp > now+60) return null;
    if (scope[0] === 'people' && !scope.slice(1).includes(claim.user)) return null;
    return claim.user;
  } catch { return null; }
}
// No application-level per-account or aggregate storage quota.
// Physical disk capacity still applies; keep per-file, rate and concurrency limits.
let activeUploads = 0;
const rate = new Map();
let globalRate = {until:0,count:0};
function allowRate(user, method) {
  const now = Date.now();
  if (globalRate.until <= now) globalRate={until:now+60000,count:0};
  if (++globalRate.count > 600) return false;
  for (const [key,value] of rate) if (value.until <= now) rate.delete(key);
  const key = `${method}:${user}`;
  if (!rate.has(key) && rate.size >= 1000) return false;
  const value = rate.get(key) || {until:now+60000,count:0};
  value.count++; rate.set(key,value);
  return value.count <= (method==='POST'?10:120);
}
const begins = (buffer, hex) => buffer.subarray(0,hex.length/2).equals(Buffer.from(hex,'hex'));
function validContent(buffer, ext) {
  if (ext==='png') return begins(buffer,'89504e470d0a1a0a');
  if (ext==='jpg') return begins(buffer,'ffd8ff');
  if (ext==='gif') return ['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6));
  if (ext==='webp') return buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP';
  if (ext==='avif') return buffer.toString('ascii',4,8)==='ftyp' && /^(avif|avis)$/.test(buffer.toString('ascii',8,12));
  if (ext==='mp4'||ext==='mov') return buffer.toString('ascii',4,8)==='ftyp';
  if (ext==='webm') return begins(buffer,'1a45dfa3');
  if (ext==='pdf') return begins(buffer,'255044462d');
  if (['zip','docx','xlsx','pptx'].includes(ext)) return begins(buffer,'504b0304')||begins(buffer,'504b0506');
  if (ext==='txt'||ext==='csv') {
    try { new TextDecoder('utf-8',{fatal:true}).decode(buffer); return !buffer.includes(0); } catch { return false; }
  }
  return false;
}
const server = http.createServer(async (req,res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (req.method==='GET' && pathname==='/api/media/health') return json(res,enabled?200:503,{ok:enabled});
  if (!enabled) return deny(req,res,503,'Media chưa cấu hình cổng xác thực.');
  const match = /^\/api\/media\/files\/([A-Za-z0-9_-]+)(?:\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+))?$/.exec(pathname);
  if (!match) return deny(req,res,404,'Không tìm thấy đường dẫn.');
  const [,encoded,id] = match;
  const scope = parseScope(encoded);
  if (!scope) return deny(req,res,400,'Hội thoại không hợp lệ.');
  const owner = authenticate(req,pathname,scope);
  if (!owner) return deny(req,res,401,'Cần xác thực và quyền truy cập hội thoại.');
  if (!allowRate(owner,req.method)) {res.setHeader('Retry-After','60');return deny(req,res,429,'Quá nhiều yêu cầu.');}
  if (req.method==='POST' && !id) {
    const mime = String(req.headers['content-type']||'').split(';')[0].toLowerCase();
    const ext = types.get(mime);
    if (!ext) return deny(req,res,415,'Định dạng không được hỗ trợ.');
    const length = Number(req.headers['content-length']);
    if (!Number.isSafeInteger(length)||length<=0) return deny(req,res,411,'Cần kích thước tệp hợp lệ.');
    if (length>maxBytes) return deny(req,res,413,'Tệp lớn hơn 25 MB.');
    if (activeUploads>=maxConcurrentUploads) {res.setHeader('Retry-After','1');return deny(req,res,429,'Đã đạt giới hạn 10 lượt tải đồng thời.');}
    activeUploads++;
    const fileId = randomUUID()+'.'+ext;
    const location = path.join(uploadDir,fileId);
    let committed=false;
    try {
      const chunks=[]; let size=0;
      for await (const chunk of req) { size+=chunk.length; if(size>length||size>maxBytes) throw new Error('LENGTH'); chunks.push(chunk); }
      if (size!==length) throw new Error('LENGTH');
      const buffer=Buffer.concat(chunks,size);
      if (!validContent(buffer,ext)) return json(res,415,{error:'Nội dung tệp không khớp định dạng.'});
      const metadata=JSON.stringify({owner,scope:encoded,mime,size});
      await writeFile(location,buffer,{flag:'wx',mode:0o600});
      await writeFile(location+'.json',metadata,{flag:'wx',mode:0o600});
      committed=true;
      return json(res,201,{path:`/api/media/files/${encoded}/${fileId}`});
    } catch { return json(res,400,{error:'Tải tệp thất bại.'}); }
    finally {
      if (!committed) {await unlink(location).catch(()=>{});await unlink(location+'.json').catch(()=>{});}
      activeUploads--;
    }
  }
  if (req.method==='GET' && id) {
    const location=path.join(uploadDir,id);
    try {
      const meta=JSON.parse(await readFile(location+'.json','utf8'));
      const stats=await stat(location);
      if (meta.scope!==encoded || types.get(meta.mime)!==id.split('.').at(-1) || meta.size!==stats.size || !stats.isFile()) return json(res,404,{error:'Không tìm thấy tệp.'});
      res.writeHead(200,{'Content-Type':meta.mime,'Content-Length':stats.size,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','Content-Disposition':/^(image|video)\//.test(meta.mime)?'inline':'attachment'});
      const stream=createReadStream(location);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    } catch { return json(res,404,{error:'Không tìm thấy tệp.'}); }
    return;
  }
  return deny(req,res,405,'Phương thức không được hỗ trợ.');
});
server.requestTimeout=30000;server.headersTimeout=10000;server.maxConnections=100;
server.listen(port,host,()=>console.log(`LyraChat media: http://${host}:${server.address().port} (${enabled?'trusted gateway required':'disabled: missing MEDIA_GATEWAY_SECRET'})`));
