/**
 * Kiểm tra gửi/nhận SEND_CHAT hai chiều trên server THẬT, độc lập React/localStorage.
 * Node.js >= 22. Chỉ dùng tài khoản thử nghiệm được phép sử dụng.
 * Không in mật khẩu, mã RE_LOGIN_CODE hoặc nội dung chat riêng tư ra terminal.
 * Script có chủ đích gửi hai tin thử nghiệm (mỗi tài khoản một tin).
 */
import { randomUUID } from 'node:crypto';

const endpoint = process.env.CHAT_API_WS_URL || 'wss://chat.longapp.io.vn/chat/chat';
const accounts = [
  { label: 'A', user: process.env.CHAT_TEST_USER_A?.trim(), pass: process.env.CHAT_TEST_PASS_A },
  { label: 'B', user: process.env.CHAT_TEST_USER_B?.trim(), pass: process.env.CHAT_TEST_PASS_B },
];
const timeoutMs = 15000;

if (accounts.some(a => !a.user || !a.pass) || accounts[0].user.toLocaleLowerCase() === accounts[1].user.toLocaleLowerCase()) {
  console.error('Thiếu thông tin hai tài khoản thử nghiệm khác nhau: CHAT_TEST_USER_A/PASS_A và CHAT_TEST_USER_B/PASS_B.');
  process.exit(2);
}
if (typeof WebSocket !== 'function') {
  console.error('Cần Node.js 22+ (WebSocket tích hợp sẵn).');
  process.exit(2);
}

function send(ws, event, data = {}) {
  if (ws.readyState !== WebSocket.OPEN) throw new Error('Socket đã ngắt trước khi gửi ' + event);
  ws.send(JSON.stringify({ action: 'onchat', data: { event, data } }));
}
function connect() {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(endpoint); }
    catch (e) { reject(e); return; }
    let finished = false;
    const timer = setTimeout(() => finish(new Error('Timeout khi kết nối WSS')), timeoutMs);
    const onOpen = () => finish(null);
    const onError = e => finish(e?.error || new Error('WebSocket handshake/đường truyền lỗi'));
    const onClose = () => finish(new Error('Socket đóng khi chưa kết nối'));
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
      ws.removeEventListener('close', onClose);
      if (error) { try { ws.close(); } catch {} reject(error); }
      else resolve(ws);
    }
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);
  });
}
function readFrame(raw) {
  const outer=JSON.parse(String(raw));
  if (!outer || typeof outer!=='object') return null;
  const frame=typeof outer.event==='string'?outer:outer.data;
  if (!frame || typeof frame.event!=='string') return null;
  return {...frame,status:frame.status??outer.status};
}
function chatPayload(packet) {
  const data=packet?.data;
  return data && typeof data==='object' && data.name===undefined && data.to===undefined ? data.data??data : data;
}
function waitPacket(ws, predicate, label) {
  let done = false;
  let resolveFn;
  const promise = new Promise(resolve => { resolveFn = resolve; });
  const timer = setTimeout(() => finish({ ok: false, reason: `Không nhận ${label} trong ${timeoutMs / 1000} giây` }), timeoutMs);
  const onMessage = event => {
    let packet;
    try { packet = readFrame(event.data); } catch { return; }
    if (packet?.status === 'error' && ['AUTH', 'ACTION_NOT_EXIT', label].includes(packet.event)) {
      finish({ ok: false, reason: `Server từ chối (${packet.event}: ${'error'})` });
    } else if (predicate(packet)) {
      finish({ ok: true, packet });
    }
  };
  const onClose = () => finish({ ok: false, reason: 'Socket bị đóng trước khi nhận ' + label });
  function finish(value) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    ws.removeEventListener('message', onMessage);
    ws.removeEventListener('close', onClose);
    resolveFn(value);
  }
  ws.addEventListener('message', onMessage);
  ws.addEventListener('close', onClose);
  return promise;
}
async function request(ws, event, data) {
  const pending = waitPacket(ws, packet => packet?.event === event && packet?.status === 'success', event);
  send(ws, event, data);
  const result = await pending;
  if (!result.ok) throw new Error(`${event}: ${result.reason}`);
}
const sameUser = (one, another) => typeof one === 'string' && one.trim().toLocaleLowerCase() === another.trim().toLocaleLowerCase();

async function oneWay(sender, receiver, senderSocket, receiverSocket) {
  const marker = `CHAT_DIAGNOSTIC_${randomUUID().slice(0, 10)}`;
  const started = performance.now();
  let senderFrames=0, incomplete=0, receivedAt, acknowledgedAt;
  const matches = packet => {
    const row=chatPayload(packet);
    return packet?.event==='SEND_CHAT' && packet.status==='success' && [0,'0','people'].includes(row?.type) &&
      row?.mes===marker && sameUser(row?.name,sender.user) && sameUser(row?.to,receiver.user);
  };
  const countSender = event => {
    try {
      const packet=readFrame(event.data);
      if(packet?.event==='SEND_CHAT') {
        senderFrames++;
        if (!matches(packet)) incomplete++;
      }
    } catch { /* malformed frame */ }
  };
  senderSocket.addEventListener('message', countSender);
  try {
    const incoming=waitPacket(receiverSocket,packet=>{if(!matches(packet))return false;receivedAt=performance.now()-started;return true;},'SEND_CHAT receiver');
    const acknowledgement=waitPacket(senderSocket,packet=>{if(!matches(packet))return false;acknowledgedAt=performance.now()-started;return true;},'SEND_CHAT sender');
    send(senderSocket,'SEND_CHAT',{type:'people',to:receiver.user,mes:marker});
    const [result,ack]=await Promise.all([incoming,acknowledgement]);
    console.log(`${sender.label} → ${receiver.label}: receiver=${result.ok?'PASS '+Math.round(receivedAt)+'ms':'NO_MATCH'}; sender_ACK=${ack.ok?'MATCH '+Math.round(acknowledgedAt)+'ms':'NO_MATCH in 15s'}`);
    console.log(`  SEND_CHAT frames at sender=${senderFrames}; not matching test tuple=${incomplete}`);
    return result.ok;
  } finally {senderSocket.removeEventListener('message',countSender);}
}

async function checkPresence(ws, peer, label, requestEvent) {
  const pending=waitPacket(ws,packet=>{
    if(!['CHECK_USER_ONLINE','CHAT_CHECK_USER_ONLINE'].includes(packet?.event)||packet.status==='error')return false;
    const outer=packet.data;const nested=outer?.data;
    for(const identity of [outer?.user,outer?.username,nested?.user,nested?.username])if(identity!==undefined&&!sameUser(identity,peer.user))return false;
    return typeof outer?.status==='boolean'||typeof nested?.status==='boolean';
  },'CHECK_USER_ONLINE');
  send(ws,requestEvent,{user:peer.user});
  const result=await pending;
  const outer=result.packet?.data;const nested=outer?.data;
  const conflict=typeof outer?.status==='boolean'&&typeof nested?.status==='boolean'&&outer.status!==nested.status;
  const value=typeof outer?.status==='boolean'?outer.status:nested?.status;
  console.log(`${label}: ${requestEvent} => ${result.ok&&!conflict?String(value):'UNKNOWN'}`);
}

let wsA;
let wsB;
try {
  [wsA, wsB] = await Promise.all([connect(), connect()]);
  console.log('PASS: Đã mở hai kết nối WebSocket độc lập.');
  await Promise.all([
    request(wsA, 'LOGIN', { user: accounts[0].user, pass: accounts[0].pass }),
    request(wsB, 'LOGIN', { user: accounts[1].user, pass: accounts[1].pass }),
  ]);
  console.log('PASS: Cả hai tài khoản LOGIN thành công.');
  await Promise.all([request(wsA, 'GET_USER_LIST', {}), request(wsB, 'GET_USER_LIST', {})]);
  console.log('PASS: Cả hai socket xử lý GET_USER_LIST thành công.');
  if(process.env.CHAT_TEST_ONLINE_EVENT) {
    const probe=process.env.CHAT_TEST_ONLINE_EVENT;
    if(!['CHECK_USER_ONLINE','CHAT_CHECK_USER_ONLINE'].includes(probe))throw new Error('CHAT_TEST_ONLINE_EVENT không hợp lệ.');
    await Promise.all([checkPresence(wsA,accounts[1],'A kiểm tra B',probe),checkPresence(wsB,accounts[0],'B kiểm tra A',probe)]);
  }
  const resultAB = await oneWay(accounts[0], accounts[1], wsA, wsB);
  const resultBA = await oneWay(accounts[1], accounts[0], wsB, wsA);
  console.log(resultAB && resultBA
    ? 'KẾT LUẬN: API truyền SEND_CHAT hai chiều ở hai phiên kiểm thử độc lập.'
    : 'KẾT LUẬN: Ít nhất một chiều không nhận được frame; đây không phải lỗi hiển thị React vì phép thử không dùng Frontend.');
  if (!resultAB || !resultBA) process.exitCode = 1;
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  for (const ws of [wsA, wsB]) {
    if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
  }
}
