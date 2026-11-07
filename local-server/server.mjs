/** Máy chủ dự phòng độc lập cho đồ án, tương thích các event WebSocket được cung cấp.
 * Chạy: node local-server/server.mjs
 * Phạm vi: demo lớp học / LAN tin cậy. Không triển khai public Internet.
 */
import http from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PORT = Number(process.env.CHAT_PORT || 8787);
const HOST = process.env.CHAT_HOST || '127.0.0.1';
const DB_PATH = resolve(process.env.CHAT_DB_PATH || './local-server/chat-data.json');
const MAX_PAYLOAD = 64 * 1024;
const sessions = new Map();
const sockets = new Set();
let db = { users: {}, rooms: {}, messages: [], nextId: 1 };
try { if (existsSync(DB_PATH)) db = JSON.parse(readFileSync(DB_PATH, 'utf8')); } catch (error) { throw new Error(`Không thể đọc dữ liệu ${DB_PATH}: ${error.message}`); }
db.users ||= {}; db.rooms ||= {}; db.messages ||= []; db.nextId ||= 1;
function persist() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const temp = `${DB_PATH}.tmp`;
  writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
  renameSync(temp, DB_PATH);
}
function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  try { const [salt, hash] = stored.split(':'); const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); } catch { return false; }
}
function frame(data, opcode = 1) {
  const payload = opcode === 1 ? Buffer.from(JSON.stringify(data)) : Buffer.from(data);
  const header = payload.length < 126 ? Buffer.from([0x80 | opcode, payload.length]) : payload.length <= 65535 ? Buffer.from([0x80 | opcode, 126, payload.length >> 8, payload.length & 255]) : (() => { const h=Buffer.alloc(10); h[0]=0x80|opcode; h[1]=127; h.writeBigUInt64BE(BigInt(payload.length),2); return h; })();
  return Buffer.concat([header, payload]);
}
function send(peer, packet) { if (!peer.closed && peer.socket.writable) peer.socket.write(frame(packet)); }
function result(peer, event, data) { send(peer, { status: 'success', event, data }); }
function error(peer, event, mes) { send(peer, { status: 'error', event, mes }); }
function userOnline(name) { return [...sockets].some(peer => !peer.closed && peer.user === name); }
function broadcast(usernames, packet) { for (const peer of sockets) if (usernames.has(peer.user)) send(peer, packet); }
function handle(peer, raw) {
  let packet;
  try { packet = JSON.parse(raw); } catch { return error(peer, 'INVALID_JSON', 'JSON không hợp lệ.'); }
  const event = packet?.data?.event;
  const data = packet?.data?.data ?? {};
  if (packet?.action !== 'onchat' || typeof event !== 'string') return error(peer, 'ACTION_NOT_EXIT', 'Yêu cầu phải có action=onchat và data.event.');
  const username = String(data.user ?? '').trim();
  if (event === 'REGISTER') {
    const pass = String(data.pass ?? '');
    if (!/^[\p{L}\p{N}_]{3,40}$/u.test(username) || pass.length < 6) return error(peer, event, 'Tên đăng nhập 3–40 ký tự, mật khẩu ít nhất 6 ký tự.');
    if (db.users[username]) return error(peer, event, 'User already exists!');
    db.users[username] = { password: hashPassword(pass) }; persist();
    return result(peer, event, 'Creating account successful');
  }
  if (event === 'LOGIN') {
    const stored = db.users[username];
    if (!stored || !verifyPassword(String(data.pass ?? ''), stored.password)) return error(peer, event, 'Login error, Wrong Username or Password');
    peer.user = username; peer.code = randomBytes(24).toString('hex');
    sessions.set(peer.code, { username, expires: Date.now() + 24*60*60*1000 });
    return result(peer, event, { RE_LOGIN_CODE: peer.code });
  }
  if (event === 'RE_LOGIN') {
    const session = sessions.get(String(data.code ?? ''));
    if (!session || session.username !== username || session.expires < Date.now()) return error(peer, event, 'Re-Login error, session expired!');
    sessions.delete(String(data.code));
    for (const old of sockets) if (old !== peer && old.code === data.code) { old.user = ''; old.code = ''; }
    peer.user = username; peer.code = randomBytes(24).toString('hex');
    sessions.set(peer.code, { username, expires: Date.now() + 24*60*60*1000 });
    return result(peer, event, { RE_LOGIN_CODE: peer.code });
  }
  if (event === 'LOGOUT') { sessions.delete(peer.code); peer.user = ''; peer.code = ''; return result(peer, event, 'You are Logout!'); }
  if (!peer.user) return error(peer, event, 'Vui lòng đăng nhập trước.');
  if (event === 'GET_USER_LIST') {
    const all = new Map();
    for (const [name, room] of Object.entries(db.rooms)) {
      if (room.members.includes(peer.user)) all.set(`1:${name}`, {name,type:1,actionTime:room.updatedAt || room.createdAt});
    }
    for (const message of db.messages) if (message.type === 0 && (message.name === peer.user || message.to === peer.user)) {
      const name = message.name === peer.user ? message.to : message.name;
      all.set(`0:${name}`, { name, type:0, actionTime:message.createAt });
    }
    return result(peer,event,[...all.values()].sort((a,b)=>String(b.actionTime).localeCompare(String(a.actionTime))));
  }
  if (event === 'CHAT_CHECK_USER_EXIST') return result(peer,event,{status: !!db.users[username]});
  if (event === 'CHAT_CHECK_USER_ONLINE') return result(peer,event,{status: userOnline(username)});
  const name = String(data.name ?? '').trim();
  if (event === 'CREATE_ROOM') {
    if (!name || db.rooms[name]) return error(peer,event,'Tên phòng trống hoặc đã tồn tại.');
    db.rooms[name]={owner:peer.user,members:[peer.user],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; persist();
    return result(peer,event,{name,user:[{id:1,name:peer.user}]});
  }
  if (event === 'JOIN_ROOM') {
    const room=db.rooms[name]; if(!room) return error(peer,event,'Không tìm thấy phòng.');
    if (!room.members.includes(peer.user)) {room.members.push(peer.user);room.updatedAt=new Date().toISOString();persist();}
    return result(peer,event,{name,user:room.members.map((user,id)=>({id:id+1,name:user}))});
  }
  if (event === 'OUT_ROOM') {
    const room=db.rooms[name]; if(!room || !room.members.includes(peer.user) || room.owner===peer.user) return error(peer,event,'Room not found, or you are not a member (or you are the room owner)');
    room.members=room.members.filter(user=>user!==peer.user);persist();return result(peer,event,{mes:'You left the room successfully!'});
  }
  if (event === 'CHAT_PEOPLE_GET_MES') {
    if (!name) return error(peer,event,'Thiếu tên cuộc trò chuyện.');
    const room=db.rooms[name];
    const isRoom=!!room;
    if (isRoom && !room.members.includes(peer.user)) return error(peer,event,'Bạn chưa tham gia phòng.');
    if (!isRoom && !db.users[name]) return error(peer,event,'Người dùng không tồn tại.');
    const page=Math.max(1,Number(data.page)||1);
    const messages=db.messages.filter(item=>isRoom?item.type===1 && item.to===name:item.type===0 && ((item.name===peer.user && item.to===name)||(item.name===name && item.to===peer.user)));
    const list=messages.slice(-page*50, messages.length-(page-1)*50 || undefined).slice(-50);
    return result(peer,event,{name,user:isRoom?room.members.map((user,id)=>({id:id+1,name:user})):[],chatMess:list});
  }
  if (event === 'SEND_CHAT') {
    const type = data.type === 'room' ? 1 : data.type === 'people' ? 0 : -1;
    const to=String(data.to ?? '').trim(), mes=String(data.mes ?? '').trim();
    if (type<0 || !to || !mes || mes.length>10000) return error(peer,event,'Dữ liệu tin nhắn không hợp lệ.');
    if (type===0 && !db.users[to]) return error(peer,event,'Người nhận không tồn tại.');
    if (type===1 && (!db.rooms[to] || !db.rooms[to].members.includes(peer.user))) return error(peer,event,'You are not in this room!');
    const message={id:db.nextId++,name:peer.user,to,mes,createAt:new Date().toISOString(),type};
    db.messages.push(message); if(type===1) db.rooms[to].updatedAt=message.createAt;persist();
    const recipients=new Set(type===1?db.rooms[to].members:[peer.user,to]);
    broadcast(recipients,{status:'success',event,data:message});
    return;
  }
  error(peer,'ACTION_NOT_EXIT',`Không hỗ trợ event ${event}`);
}
const server=http.createServer((request,response)=>{
  response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'});
  response.end(JSON.stringify({service:'LyraChat local fallback',status:'ok',websocket:`ws://${HOST}:${PORT}/chat/chat`}));
});
server.on('upgrade',(request,socket,head)=>{
  const key=request.headers['sec-websocket-key'];
  if(request.headers.upgrade?.toLowerCase()!=='websocket'||typeof key!=='string'||!request.url?.startsWith('/chat/chat')) {socket.destroy();return;}
  const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const peer={socket,buffer:Buffer.alloc(0),user:'',code:'',closed:false}; sockets.add(peer);
  const close=()=>{peer.closed=true;sockets.delete(peer);};
  socket.on('close',close);socket.on('error',close);
  socket.on('data',chunk=>{
    peer.buffer=Buffer.concat([peer.buffer,chunk]);
    while (peer.buffer.length>=2) {
      const header=peer.buffer[0],opcode=header&15,masked=(peer.buffer[1]&0x80)!==0;
      let length=peer.buffer[1]&127, offset=2;
      if(length===126){if(peer.buffer.length<4)return;length=peer.buffer.readUInt16BE(2);offset=4;}
      if(length===127){socket.destroy();return;}
      if(length>MAX_PAYLOAD||!masked){socket.destroy();return;}
      if(peer.buffer.length<offset+4+length)return;
      const mask=peer.buffer.subarray(offset,offset+4),payload=Buffer.from(peer.buffer.subarray(offset+4,offset+4+length));
      peer.buffer=peer.buffer.subarray(offset+4+length);
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
      if(opcode===8){socket.end(frame(Buffer.alloc(0),8));return;}
      if(opcode===9){socket.write(frame(payload,10));continue;}
      if(opcode!==1 || (header&0x80)===0){socket.destroy();return;}
      try{handle(peer,payload.toString('utf8'));}catch(err){error(peer,'SERVER_ERROR','Máy chủ dự phòng gặp lỗi xử lý.');console.error(err);}
    }
  });
  if(head.length)socket.emit('data',head);
});
server.listen(PORT,HOST,()=>console.log(`LyraChat dự phòng: ws://${HOST}:${PORT}/chat/chat | Dữ liệu: ${DB_PATH}`));
