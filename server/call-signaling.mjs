/** LyraChat local WebRTC signaling. Demo only: no trusted account authentication.
 * Binds loopback by default. Do not expose publicly without server-side identity verification.
 */
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

const host = process.env.CALL_HOST || '127.0.0.1';
const port = Number(process.env.CALL_PORT || 8788);
const clients = new Map();
const MAX_FRAME = 256 * 1024;
const MAX_BUFFER = MAX_FRAME * 2;
const validName = name => typeof name === 'string' && /^[\p{L}\p{N}_.-]{1,64}$/u.test(name);
const send = (socket, obj) => {
  if (socket.destroyed || !socket.writable) return;
  const data = Buffer.from(JSON.stringify(obj));
  const header = data.length < 126 ? Buffer.from([0x81, data.length]) : Buffer.from([0x81,126,data.length >> 8, data.length & 255]);
  socket.write(Buffer.concat([header,data]));
};
const closeFrame = (socket, code=1000) => {
  if (!socket.destroyed) { try { socket.write(Buffer.from([0x88,0x02,code>>8,code&255])); } catch { /* closed */ } socket.end(); }
};
const activeCalls = new Map(); // callId -> {caller,callee}
const findPeer = (callId, sender) => {
  const call = activeCalls.get(callId);
  if (!call || (call.caller !== sender && call.callee !== sender)) return null;
  return call.caller === sender ? call.callee : call.caller;
};
const cleanup = (username) => {
  if (clients.get(username)?.destroyed) clients.delete(username);
  for (const [id, call] of activeCalls) {
    if (call.caller !== username && call.callee !== username) continue;
    activeCalls.delete(id);
    const peer = call.caller === username ? call.callee : call.caller;
    send(clients.get(peer) ?? {destroyed:true}, {type:'hangup', callId:id, from:username, reason:'disconnect'});
  }
};
const server = http.createServer((req,res) => {
  res.writeHead(404, {'Content-Type':'application/json'});
  res.end(JSON.stringify({error:'Not found'}));
});
server.on('upgrade',(req,socket,head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const username = url.searchParams.get('user');
  if (url.pathname !== '/api/calls/ws' || !validName(username)) { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string' || !/^[a-zA-Z0-9+/]{22}==$/.test(key) || req.headers['sec-websocket-version'] !== '13') {socket.destroy();return;}
  // Browser-origin protection for local development; remote deployments require authentication.
  const origin = req.headers.origin;
  if (origin) {
    try { const parsed = new URL(origin); if (!['localhost','127.0.0.1'].includes(parsed.hostname)) {socket.destroy();return;} }
    catch {socket.destroy();return;}
  }
  const prior = clients.get(username);
  if (prior && !prior.destroyed) { prior.destroy(); cleanup(username); }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  clients.set(username,socket);
  let buffer = Buffer.alloc(0);
  const processMessage = (value) => {
    let msg;
    try {msg = JSON.parse(value);} catch {return;}
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'invite') {
      const to = msg.to, mode = msg.mode;
      if (!validName(to) || to === username || !['voice','video'].includes(mode)) return send(socket,{type:'error',message:'Người nhận không hợp lệ.'});
      if (![...activeCalls.values()].every(c => ![c.caller,c.callee].includes(username))) return send(socket,{type:'error',message:'Bạn đang trong cuộc gọi khác.'});
      const recipient = clients.get(to);
      if (!recipient || recipient.destroyed) return send(socket,{type:'error',message:'Người nhận chưa mở LyraChat hoặc signaling chưa kết nối.'});
      if (![...activeCalls.values()].every(c => ![c.caller,c.callee].includes(to))) return send(socket,{type:'error',message:'Người nhận đang bận.'});
      const callId = randomUUID();
      activeCalls.set(callId,{caller:username,callee:to});
      send(socket,{type:'ringing',callId,to});
      send(recipient,{type:'incoming',callId,from:username,mode});
      return;
    }
    if (!validName(msg.callId) || !['preparing','accept','reject','offer','answer','ice','hangup'].includes(msg.type)) return;
    const call = activeCalls.get(msg.callId);
    const peer = findPeer(msg.callId, username);
    if (!call || !peer) return;
    if (['preparing','accept'].includes(msg.type) && username !== call.callee) return;
    if (msg.type === 'offer' && username !== call.caller) return;
    if (msg.type === 'answer' && username !== call.callee) return;
    const payload = {type:msg.type,callId:msg.callId,from:username};
    if (msg.type === 'offer' || msg.type === 'answer') {
      if (!msg.sdp || typeof msg.sdp !== 'object' || JSON.stringify(msg.sdp).length > 200_000) return;
      payload.sdp = msg.sdp;
    }
    if (msg.type === 'ice') {
      if (!msg.candidate || typeof msg.candidate !== 'object' || JSON.stringify(msg.candidate).length > 10_000) return;
      payload.candidate = msg.candidate;
    }
    send(clients.get(peer) ?? {destroyed:true},payload);
    if (msg.type === 'reject' || msg.type === 'hangup') activeCalls.delete(msg.callId);
  };
  socket.on('data', chunk => {
    buffer=Buffer.concat([buffer,chunk]);
    if(buffer.length>MAX_BUFFER){socket.destroy();return;}
    while(buffer.length>=2){
      const first=buffer[0], second=buffer[1];
      if ((first & 0x70)!==0 || !(first & 0x80) || !(second&0x80)) {socket.destroy();return;}
      const opcode=first&15;
      let length=second&127, offset=2;
      if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);offset=4;}
      if(length===127){socket.destroy();return;}
      if(length>MAX_FRAME){socket.destroy();return;}
      if(buffer.length<offset+4+length)return;
      const mask=buffer.subarray(offset,offset+4);
      const payload=Buffer.from(buffer.subarray(offset+4,offset+4+length));
      buffer=buffer.subarray(offset+4+length);
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
      if(opcode===0x8){closeFrame(socket);return;}
      if(opcode===0x9){socket.write(Buffer.from([0x8A,payload.length,...payload]));continue;}
      if(opcode!==0x1){socket.destroy();return;}
      processMessage(payload.toString('utf8'));
    }
  });
  socket.on('close', () => {if(clients.get(username)===socket){clients.delete(username);cleanup(username);}});
  socket.on('error',()=>{});
  if (head.length) socket.emit('data',head);
});
server.listen(port,host,()=>console.log(`LyraChat signaling: ws://${host}:${port}/api/calls/ws (local demo only)`));
