/**
 * Read-only history API probe, independent of React/localStorage.
 * Requires Node.js >= 22, an existing TEST account, and a recipient username.
 * Never prints passwords, RE_LOGIN_CODE, message content, or raw server packets.
 * Windows CMD:
 *   set CHAT_TEST_USER=MyTestUser
 *   set CHAT_TEST_PASS=my_password
 *   set CHAT_TEST_PEER=OtherTestUser
 *   node scripts/check-teacher-history.mjs
 */
const url = process.env.CHAT_API_WS_URL || 'wss://chat.longapp.io.vn/chat/chat';
const username = process.env.CHAT_TEST_USER?.trim();
const password = process.env.CHAT_TEST_PASS;
const peer = process.env.CHAT_TEST_PEER?.trim();
const timeoutMs = 12000;

if (!username || !password || !peer) {
  console.error('Thiếu CHAT_TEST_USER, CHAT_TEST_PASS hoặc CHAT_TEST_PEER. Chỉ dùng tài khoản thử nghiệm của bạn.');
  process.exit(2);
}
if (typeof WebSocket !== 'function') {
  console.error('Cần Node.js 22 trở lên để chạy script này.');
  process.exit(2);
}

function connect() {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(url); }
    catch { reject(new Error('Không thể khởi tạo WebSocket.')); return; }
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
      if (error) reject(error); else resolve(ws);
    };
    const onOpen = () => finish();
    const onError = () => finish(new Error('Kết nối WebSocket không thành công.'));
    const timer = setTimeout(() => { finish(new Error('WebSocket không mở trong 12 giây.')); ws.close(); }, timeoutMs);
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
  });
}
function request(ws, event, data = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const complete = (err, response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
      if (err) reject(err); else resolve(response);
    };
    const onClose = () => complete(new Error('WebSocket bị đóng khi đang kiểm tra.'));
    const onMessage = (e) => {
      let packet;
      try { packet = JSON.parse(String(e.data)); }
      catch { return; }
      if (packet?.status === 'error' && packet.event === 'AUTH') {
        complete(new Error('Máy chủ trả AUTH. Phiên đăng nhập không hợp lệ.'));
      } else if (packet?.status === 'error' && packet.event === 'ACTION_NOT_EXIT') {
        complete(Object.assign(new Error('Server trả ACTION_NOT_EXIT: không nhận diện event ' + event + '.'), {code:'UNSUPPORTED'}));
      } else if (packet?.event === event) {
        if (packet.status === 'success') complete(null, packet);
        else complete(new Error('Server từ chối ' + event + ' (status=error).'));
      }
    };
    const timer = setTimeout(() => complete(new Error('Không có phản hồi cho ' + event + ' trong 12 giây.')), timeoutMs);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
    try { ws.send(JSON.stringify({action:'onchat',data:{event,data}})); }
    catch { complete(new Error('Không gửi được ' + event + '.')); }
  });
}

let socket;
try {
  socket = await connect();
  await request(socket, 'LOGIN', {user:username, pass:password});
  console.log('PASS: LOGIN đã được server xác nhận.');
  const list = await request(socket, 'GET_USER_LIST', {});
  console.log('PASS: GET_USER_LIST hoạt động; số hội thoại:', Array.isArray(list.data) ? list.data.length : 'không xác định');
  const history = await request(socket, 'CHAT_PEOPLE_GET_MES', {name:peer, page:1});
  const rows = Array.isArray(history.data) ? history.data : history.data?.chatMess;
  console.log('PASS: CHAT_PEOPLE_GET_MES được hỗ trợ, số bản ghi trang 1:', Array.isArray(rows) ? rows.length : 'không xác định');
} catch (error) {
  if (error?.code === 'UNSUPPORTED') {
    console.error('FAIL: API thật không nhận diện CHAT_PEOPLE_GET_MES dù đã đăng nhập và GET_USER_LIST thành công.');
    console.error('Cần giảng viên xác nhận/cập nhật backend. Không nên đổi tên event theo phỏng đoán.');
  } else {
    console.error('FAIL:',error instanceof Error ? error.message : 'Lỗi không xác định');
  }
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
}
