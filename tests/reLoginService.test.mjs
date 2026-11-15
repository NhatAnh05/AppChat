import test from 'node:test';
import assert from 'node:assert/strict';
import { reLoginOnce, ReLoginRejectedError } from '../src/services/reLoginService.ts';

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
  sent = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  send(value) { this.sent.push(JSON.parse(value)); }
  open() { this.readyState = 1; this.onopen?.({}); }
  receive(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
  close() { this.readyState = 3; this.onclose?.({}); }
}
globalThis.WebSocket = FakeSocket;
const session = { username: 'long', reLoginCode: 'nlu_old' };
const url = 'wss://chat.longapp.io.vn/chat/chat';

test('RE_LOGIN mở socket mới, giữ socket khi nhận success và mã mới', async () => {
  const promise = reLoginOnce(url, session);
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  assert.deepEqual(socket.sent[0], {
    action: 'onchat', data: { event: 'RE_LOGIN', data: { user: 'long', code: 'nlu_old' } },
  });
  socket.receive({ event: 'GET_USER_LIST', status: 'success', data: [] });
  socket.receive({ event: 'RE_LOGIN', status: 'success', data: { RE_LOGIN_CODE: 'nlu_new' } });
  const result = await promise;
  assert.equal(result.socket, socket);
  assert.equal(socket.readyState, FakeSocket.OPEN);
  assert.deepEqual(result.session, { username: 'long', reLoginCode: 'nlu_new' });
  socket.close();
});
test('RE_LOGIN lỗi hết hạn: đóng socket và từ chối', async () => {
  const promise = reLoginOnce(url, session);
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  socket.receive({ event: 'RE_LOGIN', status: 'error', mes: 'Re-Login error, session expired!' });
  await assert.rejects(promise, ReLoginRejectedError);
  assert.equal(socket.readyState, FakeSocket.CLOSED);
});
test('RE_LOGIN success thiếu mã mới không cho vào chat', async () => {
  const promise = reLoginOnce(url, session);
  const socket = FakeSocket.instances.at(-1);
  socket.open(); socket.receive({ event: 'RE_LOGIN', status: 'success', data: {} });
  await assert.rejects(promise, ReLoginRejectedError);
});
test('Hủy yêu cầu đang chờ, không để socket mồ côi', async () => {
  const controller = new AbortController();
  const promise = reLoginOnce(url, session, { signal: controller.signal });
  const socket = FakeSocket.instances.at(-1);
  controller.abort();
  await assert.rejects(promise, /Đã hủy/);
  assert.equal(socket.readyState, FakeSocket.CLOSED);
});
