import test from 'node:test';
import assert from 'node:assert/strict';

// Mô phỏng phản hồi server: kiểm tra client sử dụng đúng WebSocket và không ghép ACK sai.
globalThis.window = globalThis;
const store = new Map();
globalThis.sessionStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};
class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances = [];
  readyState = 0;
  sent = [];
  onopen = null;
  onmessage = null;
  onclose = null;
  onerror = null;
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.({}); }
  send(value) { this.sent.push(JSON.parse(value)); }
  receive(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.({}); }
}
globalThis.WebSocket = FakeSocket;
const { loginAccount, disconnectLoginSession } = await import('../src/services/loginService.ts');
const { websocketService } = await import('../src/services/websocket.ts');
const { peopleChatService } = await import('../src/services/peopleChatService.ts');
const { sendRoomMessage } = await import('../src/services/roomChatService.ts');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const sentChats = socket => socket.sent.filter(frame => frame.data.event === 'SEND_CHAT');
async function login(username) {
  disconnectLoginSession();
  const waiting = loginAccount({ username, password: 'fake-password' });
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  socket.receive({ event: 'LOGIN', status: 'success', data: { RE_LOGIN_CODE: `code-${username}` } });
  await waiting;
  return socket;
}
const ack = (id, name, to, mes, type = 0) => ({
  event: 'SEND_CHAT', status: 'success',
  data: { id, name, to, mes, type, createAt: '2026-11-22 20:00:00' },
});

test('Gửi/nhận hai chiều A -> B và B -> A qua giao thức SEND_CHAT (WebSocket giả lập)', async () => {
  const aliceSocket = await login('alice');
  const incomingToAlice = [];
  const unsubscribeAlice = websocketService.on('SEND_CHAT', frame => {
    if (frame.data?.to === 'alice') incomingToAlice.push(frame.data);
  });
  const sentByAlice = peopleChatService.sendMessage('alice', 'bob', 'Chào Bob 😍');
  await tick();
  const outgoingA = sentChats(aliceSocket).at(-1);
  assert.deepEqual({event:outgoingA.data.event,type:outgoingA.data.data.type,to:outgoingA.data.data.to},
    {event:'SEND_CHAT',type:'people',to:'bob'});
  // Phản hồi success thiếu dữ liệu không được xem là đã gửi.
  let confirmed = false;
  void sentByAlice.then(() => { confirmed = true; });
  aliceSocket.receive({ event: 'SEND_CHAT', status: 'success', data: {} });
  await tick();
  assert.equal(confirmed, false);
  aliceSocket.receive(ack(101, 'alice', 'bob', outgoingA.data.data.mes));
  assert.equal((await sentByAlice).content, 'Chào Bob 😍');
  aliceSocket.receive(ack(102, 'bob', 'alice', 'Chào Alice'));
  assert.equal(incomingToAlice.length, 1);
  assert.equal(incomingToAlice[0].mes, 'Chào Alice');
  unsubscribeAlice();

  const bobSocket = await login('bob');
  const sentByBob = peopleChatService.sendMessage('bob', 'alice', 'Đã nhận tin!');
  await tick();
  const outgoingB = sentChats(bobSocket).at(-1);
  assert.equal(outgoingB.data.data.to, 'alice');
  bobSocket.receive(ack(103, 'bob', 'alice', outgoingB.data.data.mes));
  assert.equal((await sentByBob).content, 'Đã nhận tin!');
  disconnectLoginSession();
});

test('Tin cá nhân và tin nhóm không phát SEND_CHAT đồng thời; bỏ qua ACK nhóm không liên quan', async () => {
  const socket = await login('alice');
  const personPending = peopleChatService.sendMessage('alice', 'bob', 'Tin cá nhân');
  await tick();
  const roomPending = sendRoomMessage('Team', 'Tin nhóm');
  await tick();
  assert.equal(sentChats(socket).length, 1);
  // Broadcast không liên quan không thể xác nhận tin cá nhân đang chờ.
  socket.receive(ack(201, 'someone', 'Team', 'Tin nhóm', 1));
  await tick();
  assert.equal(sentChats(socket).length, 1);
  socket.receive(ack(202, 'alice', 'bob', 'Tin cá nhân'));
  assert.equal((await personPending).content, 'Tin cá nhân');
  await tick();
  assert.equal(sentChats(socket).length, 2);
  assert.deepEqual(sentChats(socket)[1].data.data,
    {type:'room',to:'Team',mes:'Tin nhóm'});
  socket.receive(ack(203, 'alice', 'Team', 'Tin nhóm', 1));
  assert.equal((await roomPending).content, 'Tin nhóm');
  disconnectLoginSession();
});
