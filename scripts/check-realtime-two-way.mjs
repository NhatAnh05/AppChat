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
function waitPacket(ws, predicate, label) {
  let done = false;
  let resolveFn;
  const promise = new Promise(resolve => { resolveFn = resolve; });
  const timer = setTimeout(() => finish({ ok: false, reason: `Không nhận ${label} trong ${timeoutMs / 1000} giây` }), timeoutMs);
  const onMessage = event => {
    let packet;
    try { packet = JSON.parse(String(event.data)); } catch { return; }
    if (packet?.status === 'error' && ['AUTH', 'ACTION_NOT_EXIT', label].includes(packet.event)) {
      finish({ ok: false, reason: `Server từ chối (${packet.event}: ${String(packet.mes || 'error')})` });
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
  let seenOnReceiver = 0;
  let seenOnSender = 0;
  const countReceiver = event => {
    try { if (JSON.parse(String(event.data))?.event === 'SEND_CHAT') seenOnReceiver++; } catch {}
  };
  const countSender = event => {
    try { if (JSON.parse(String(event.data))?.event === 'SEND_CHAT') seenOnSender++; } catch {}
  };
  receiverSocket.addEventListener('message', countReceiver);
  senderSocket.addEventListener('message', countSender);
  try {
    const incoming = waitPacket(receiverSocket,
      packet => packet?.event === 'SEND_CHAT' && packet?.data?.mes === marker
        && sameUser(packet?.data?.name, sender.user) && sameUser(packet?.data?.to, receiver.user),
      'SEND_CHAT ở người nhận');
    send(senderSocket, 'SEND_CHAT', { type: 'people', to: receiver.user, mes: marker });
    const result = await incoming;
    const summary = result.ok ? 'PASS: Người nhận có frame SEND_CHAT' : `FAIL: ${result.reason}`;
    console.log(`${sender.label} → ${receiver.label}: ${summary}`);
    console.log(`  Số frame SEND_CHAT quan sát: người gửi=${seenOnSender}, người nhận=${seenOnReceiver}`);
    if (!result.ok && seenOnReceiver > 0) {
      console.log('  Có frame SEND_CHAT khác nhưng không khớp người gửi/người nhận/nội dung thử nghiệm: cần kiểm tra định dạng server.');
    }
    if (!result.ok && seenOnReceiver === 0) {
      console.log('  Server chưa chuyển frame SEND_CHAT phù hợp đến socket người nhận trong thời gian kiểm tra.');
    }
    return result.ok;
  } finally {
    receiverSocket.removeEventListener('message', countReceiver);
    senderSocket.removeEventListener('message', countSender);
  }
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
