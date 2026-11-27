import test from 'node:test';
import assert from 'node:assert/strict';
import { readLoginSession, saveLoginSession, SESSION_KEY } from '../src/services/sessionStore.ts';
import { getConnectionState } from '../src/services/connectionHealth.ts';

const storage = new Map();
globalThis.sessionStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
globalThis.window = new EventTarget();
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];
  readyState = 0;
  onopen = null;
  onmessage = null;
  onerror = null;
  onclose = null;
  messages = [];
  constructor() { FakeSocket.instances.push(this); }
  send(raw) { this.messages.push(JSON.parse(raw)); }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.({}); }
  receive(packet) { this.onmessage?.({data: JSON.stringify(packet)}); }
  close() {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({});
  }
}
globalThis.WebSocket = FakeSocket;
const { loginAccount, restoreLoginSession, disconnectLoginSession, getAuthenticatedSocket } =
  await import('../src/services/loginService.ts');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('LOGIN lưu mã được Backend cấp; socket được giữ mở', async () => {
  disconnectLoginSession();
  const pending = loginAccount({username:'abc_01',password:'test-only'});
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  assert.equal(socket.messages[0].data.event, 'LOGIN');
  socket.receive({event:'LOGIN',status:'success',data:{RE_LOGIN_CODE:'nlu_first'}});
  assert.deepEqual(await pending, {username:'abc_01',reLoginCode:'nlu_first'});
  assert.equal(readLoginSession()?.reLoginCode, 'nlu_first');
  assert.equal(getAuthenticatedSocket(), socket);
  assert.equal(storage.get(SESSION_KEY).includes('test-only'), false);
  disconnectLoginSession();
});

test('F5: khôi phục từ sessionStorage, đổi mã và giữ socket vừa được xác thực', async () => {
  disconnectLoginSession();
  saveLoginSession({username:'abc_01',reLoginCode:'nlu_first'});
  const pending = restoreLoginSession();
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  assert.deepEqual(socket.messages[0], {
    action:'onchat',data:{event:'RE_LOGIN',data:{user:'abc_01',code:'nlu_first'}},
  });
  socket.receive({event:'RE_LOGIN',status:'success',data:{RE_LOGIN_CODE:'nlu_second'}});
  assert.deepEqual(await pending, {username:'abc_01',reLoginCode:'nlu_second'});
  assert.equal(readLoginSession()?.reLoginCode, 'nlu_second');
  assert.equal(getAuthenticatedSocket(), socket);
  assert.equal(getConnectionState(), 'connected');
  disconnectLoginSession();
});

test('Mất socket ngoài ý muốn: tự kết nối lại đúng một lần với mã mới nhất', async () => {
  disconnectLoginSession();
  saveLoginSession({username:'abc_01',reLoginCode:'nlu_second'});
  const pending = restoreLoginSession();
  const previous = FakeSocket.instances.at(-1);
  previous.open(); previous.receive({event:'RE_LOGIN',status:'success',data:{RE_LOGIN_CODE:'nlu_third'}});
  await pending;
  const count = FakeSocket.instances.length;
  previous.close();
  assert.equal(FakeSocket.instances.length, count + 1);
  const next = FakeSocket.instances.at(-1);
  next.open();
  assert.equal(next.messages[0].data.data.code, 'nlu_third');
  next.receive({event:'RE_LOGIN',status:'success',data:{RE_LOGIN_CODE:'nlu_fourth'}});
  await tick();
  assert.equal(getAuthenticatedSocket(), next);
  assert.equal(readLoginSession()?.reLoginCode, 'nlu_fourth');
  disconnectLoginSession();
});

test('Server báo expired: xóa session, không thử lại mã cũ', async () => {
  disconnectLoginSession();
  saveLoginSession({username:'abc_01',reLoginCode:'nlu_expired'});
  const count = FakeSocket.instances.length;
  const pending = restoreLoginSession();
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  socket.receive({event:'RE_LOGIN',status:'error',mes:'Re-Login error, session expired!'});
  assert.equal(await pending, null);
  assert.equal(readLoginSession(), null);
  assert.equal(getConnectionState(), 'signed-out');
  assert.equal(FakeSocket.instances.length, count + 1);
});

test('Đóng phiên trong lúc đang RE_LOGIN: đóng socket, không được hồi sinh phiên', async () => {
  saveLoginSession({username:'abc_01',reLoginCode:'nlu_old'});
  const pending = restoreLoginSession();
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  disconnectLoginSession();
  assert.equal(await pending, null);
  assert.equal(socket.readyState, FakeSocket.CLOSED);
  assert.equal(storage.get(SESSION_KEY), undefined);
  assert.equal(getAuthenticatedSocket(), null);
});

test('Mạng lỗi 3 lần: giữ phiên và trạng thái offline, không tự đăng xuất', async () => {
  disconnectLoginSession();
  saveLoginSession({username:'abc_01',reLoginCode:'nlu_lost_network'});
  const before = FakeSocket.instances.length;
  const pending = restoreLoginSession();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const targetCount = before + attempt;
    for (let i = 0; i < 320 && FakeSocket.instances.length < targetCount; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(FakeSocket.instances.length, targetCount);
    const socket = FakeSocket.instances.at(-1);
    socket.open();
    socket.onerror?.({});
  }
  assert.equal(await pending, null);
  assert.equal(FakeSocket.instances.length, before + 3);
  assert.equal(readLoginSession()?.reLoginCode, 'nlu_lost_network');
  assert.equal(getConnectionState(), 'offline');
  // The next reconnect burst is delayed (no infinite immediate retry loop).
  assert.equal(FakeSocket.instances.length, before + 3);
  disconnectLoginSession();
});

test('Mất kết nối khi đang đọc chat, 3 lần khôi phục lỗi mạng không phá phiên', async () => {
  disconnectLoginSession();
  const pendingLogin = loginAccount({username:'abc_01', password:'test-only'});
  const chatSocket = FakeSocket.instances.at(-1);
  chatSocket.open();
  chatSocket.receive({event:'LOGIN', status:'success', data:{RE_LOGIN_CODE:'nlu_idle'}});
  await pendingLogin;
  assert.equal(getConnectionState(), 'connected');

  const before = FakeSocket.instances.length;
  chatSocket.close(); // Happens when idle or network switches, without clicking Logout.
  assert.equal(getConnectionState(), 'reconnecting');
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (let i = 0; i < 320 && FakeSocket.instances.length < before + attempt; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(FakeSocket.instances.length, before + attempt);
    const recoverySocket = FakeSocket.instances.at(-1);
    recoverySocket.open();
    recoverySocket.onerror?.({});
  }
  for (let i = 0; i < 320 && getConnectionState() !== 'offline'; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(getConnectionState(), 'offline');
  assert.equal(readLoginSession()?.reLoginCode, 'nlu_idle');
  assert.equal(getAuthenticatedSocket(), null);
  disconnectLoginSession();
});

test('Mạng hồi phục: online kích hoạt RE_LOGIN, cập nhật code và giữ người dùng trong chat', async () => {
  disconnectLoginSession();
  saveLoginSession({username:'abc_01',reLoginCode:'nlu_offline'});
  const initial = FakeSocket.instances.length;
  const pending = restoreLoginSession();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wanted = initial + attempt;
    for (let i = 0; i < 320 && FakeSocket.instances.length < wanted; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(FakeSocket.instances.length, wanted);
    const socket = FakeSocket.instances.at(-1);
    socket.open(); socket.onerror?.({});
  }
  assert.equal(await pending, null);
  assert.equal(getConnectionState(), 'offline');
  window.dispatchEvent(new Event('online'));
  assert.equal(FakeSocket.instances.length, initial + 4);
  const next = FakeSocket.instances.at(-1);
  next.open();
  assert.equal(next.messages[0].data.event, 'RE_LOGIN');
  assert.equal(next.messages[0].data.data.code, 'nlu_offline');
  next.receive({event:'RE_LOGIN', status:'success', data:{RE_LOGIN_CODE:'nlu_reconnected'}});
  await tick();
  assert.equal(getConnectionState(), 'connected');
  assert.equal(getAuthenticatedSocket(), next);
  assert.equal(readLoginSession()?.reLoginCode, 'nlu_reconnected');
  disconnectLoginSession();
});

test('Đăng xuất khi offline: không được tái kết nối do sự kiện online/focus', async () => {
  disconnectLoginSession();
  saveLoginSession({username:'abc_01',reLoginCode:'nlu_logout_offline'});
  const initial = FakeSocket.instances.length;
  const pending = restoreLoginSession();
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (let i = 0; i < 320 && FakeSocket.instances.length < initial + attempt; i++) await new Promise(r => setTimeout(r, 10));
    const socket = FakeSocket.instances.at(-1);
    socket.open(); socket.onerror?.({});
  }
  await pending;
  assert.equal(getConnectionState(), 'offline');
  disconnectLoginSession();
  const count = FakeSocket.instances.length;
  window.dispatchEvent(new Event('online'));
  window.dispatchEvent(new Event('focus'));
  await tick();
  assert.equal(FakeSocket.instances.length, count);
  assert.equal(readLoginSession(), null);
  assert.equal(getConnectionState(), 'signed-out');
});
