/**
 * Smoke test the teacher's WebSocket with two EXISTING, user-supplied test accounts.
 * Do not create accounts or disclose login credentials in output.
 * Requires Node.js >= 22 (built-in global WebSocket).
 *
 * CHAT_TEST_USER_A=... CHAT_TEST_PASS_A=... CHAT_TEST_USER_B=... CHAT_TEST_PASS_B=... node scripts/test-teacher-chat.mjs
 */
import { randomUUID } from 'node:crypto';

const url = process.env.CHAT_API_WS_URL || 'wss://chat.longapp.io.vn/chat/chat';
const aUser = process.env.CHAT_TEST_USER_A?.trim();
const aPass = process.env.CHAT_TEST_PASS_A;
const bUser = process.env.CHAT_TEST_USER_B?.trim();
const bPass = process.env.CHAT_TEST_PASS_B;
if (!aUser || !aPass || !bUser || !bPass || aUser === bUser) {
  console.error('Cần 2 tài khoản thử nghiệm riêng biệt: CHAT_TEST_USER_A, CHAT_TEST_PASS_A, CHAT_TEST_USER_B, CHAT_TEST_PASS_B.');
  process.exit(2);
}
if (typeof WebSocket !== 'function') {
  console.error('Yêu cầu Node.js 22+ để chạy kiểm thử WebSocket.');
  process.exit(2);
}
const send = (ws, event, data = {}) => ws.send(JSON.stringify({ action:'onchat', data:{event,data} }));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => { ws.close(); reject(new Error('Kết nối WebSocket quá thời gian 10 giây.')); }, 10000);
    ws.addEventListener('open', () => { clearTimeout(timeout); resolve(ws); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Không kết nối được WebSocket. Kiểm tra URL, mạng và TLS.')); }, { once: true });
  });
}
function waitFor(ws, predicate, label, ms = 10000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {clearTimeout(timer);ws.removeEventListener('message', onMessage);ws.removeEventListener('close', onClose);};
    const timer = setTimeout(() => {cleanup(); reject(new Error(`Hết thời gian chờ ${label}.`));}, ms);
    const onClose = () => {cleanup();reject(new Error(`Mất kết nối khi chờ ${label}.`));};
    const onMessage = e => {
      try {
        const p = JSON.parse(String(e.data));
        if (p?.status === 'error' && (p?.event === label || p?.event === 'ACTION_NOT_EXIT')) {
          cleanup();reject(new Error(`${label} bị server từ chối: ${String(p.mes || p.event)}`));return;
        }
        if (predicate(p)) {cleanup();resolve(p);}
      } catch(error) {
        if (error instanceof SyntaxError) return; // ignore non-JSON server data
        cleanup();reject(error);
      }
    };
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
  });
}
async function request(ws, event, data, timeout = 10000) {
  const pending = waitFor(ws, p => p?.event === event && p?.status === 'success', event, timeout);
  send(ws, event, data);
  return pending;
}
async function main() {
  let a, b;
  try {
    [a,b] = await Promise.all([connect(url),connect(url)]);
    await Promise.all([
      request(a,'LOGIN',{user:aUser,pass:aPass}),
      request(b,'LOGIN',{user:bUser,pass:bPass}),
    ]);
    console.log('PASS 1/3: Hai tài khoản đã LOGIN qua WebSocket thật.');
    const marker = `AppChat test ${randomUUID().slice(0,8)}`;
    const incoming = waitFor(b, p => p?.event === 'SEND_CHAT' && p?.data?.mes === marker && p?.data?.name === aUser, 'SEND_CHAT (realtime)', 6000).then(() => true, () => false);
    send(a,'SEND_CHAT',{type:'people',to:bUser,mes:marker});
    const realtime = await incoming;
    console.log(realtime ? 'PASS 2/3: Tài khoản B nhận SEND_CHAT realtime.' : 'FAIL 2/3: Không quan sát được tin realtime ở tài khoản B trong 6 giây.');
    const response = await request(b,'CHAT_PEOPLE_GET_MES',{name:aUser,page:1});
    const rows = Array.isArray(response.data) ? response.data : response.data?.chatMess;
    const saved = Array.isArray(rows) && rows.some(x => x?.name === aUser && x?.to === bUser && x?.mes === marker);
    console.log(saved ? 'PASS 3/3: Tin đã tồn tại trong lịch sử trả từ server.' : 'FAIL 3/3: Không tìm thấy tin vừa gửi ở lịch sử 50 tin mới nhất.');
    if (!realtime || !saved) process.exitCode = 1;
  } catch (error) {
    console.error('FAIL:',error instanceof Error?error.message:String(error));
    process.exitCode = 1;
  } finally {
    for (const ws of [a,b]) if (ws?.readyState === WebSocket.OPEN) ws.close();
  }
}
await main();
