import test from 'node:test';
import assert from 'node:assert/strict';

// Kiểm tra giao thức đúng với nhật ký production, không gọi mạng thật.
const storage = new Map();
globalThis.sessionStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances = [];
  readyState = 0;
  sent = [];
  onmessage = null;
  onopen = null;
  onclose = null;
  onerror = null;
  constructor() { FakeSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.({}); }
  send(frame) { this.sent.push(JSON.parse(frame)); }
  receive(frame) { this.onmessage?.({data:JSON.stringify(frame)}); }
  close() { this.readyState = 3; this.onclose?.({}); }
}
globalThis.WebSocket = FakeSocket;
const {loginAccount, disconnectLoginSession} = await import('../src/services/loginService.ts');
const {peopleChatService} = await import('../src/services/peopleChatService.ts');
const {userService} = await import('../src/services/userService.ts');
const waitTick = () => new Promise(r => setTimeout(r, 0));
async function login() {
  disconnectLoginSession();
  const pending = loginAccount({username:'bob',password:'secret'});
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  socket.receive({event:'LOGIN', status:'success', data:{RE_LOGIN_CODE:'test-code'}});
  await pending;
  return socket;
}

test('Production: tải lịch sử cá nhân bằng event đã xác nhận và không phát ACTION_NOT_EXIT', async () => {
  const socket = await login();
  const request = peopleChatService.getHistory('alice');
  await waitTick();
  const historyEvents = socket.sent.filter(f => /CHAT_MES|GET_MES/.test(f.data.event));
  assert.deepEqual(historyEvents.map(f => f.data.event), ['GET_PEOPLE_CHAT_MES']);
  socket.receive({event:'GET_PEOPLE_CHAT_MES', status:'success', data:[
    {id:4,name:'alice',to:'bob',mes:'Đã nhận!',type:0,createAt:'2026-11-22 23:33:38'},
  ]});
  const messages = await request;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].content, 'Đã nhận!');
  assert.equal(socket.sent.some(f => f.data.event === 'CHAT_PEOPLE_GET_MES'), false);
  disconnectLoginSession();
});

test('Production: kiểm tra online bằng event thành công, không dò thêm alias sai', async () => {
  const socket = await login();
  const request = userService.checkUserOnline('alice');
  await waitTick();
  assert.deepEqual(socket.sent.filter(f => /CHECK_USER_ONLINE/.test(f.data.event)).map(f => f.data.event), ['CHECK_USER_ONLINE']);
  socket.receive({event:'CHECK_USER_ONLINE',status:'success',data:{status:true}});
  assert.equal(await request, true);
  assert.equal(socket.sent.some(f => f.data.event==='CHAT_CHECK_USER_ONLINE'),false);
  disconnectLoginSession();
});

test('Deployment khác: CHECK_USER_ONLINE bị từ chối thì thử alias Excel đúng một lần', async () => {
  const socket = await login();
  const request = userService.checkUserOnline('alice');
  await waitTick();
  assert.equal(socket.sent.at(-1).data.event,'CHECK_USER_ONLINE');
  socket.receive({event:'ACTION_NOT_EXIT',status:'error',mes:'Unknown action'});
  await waitTick();
  assert.equal(socket.sent.at(-1).data.event,'CHAT_CHECK_USER_ONLINE');
  socket.receive({event:'CHECK_USER_ONLINE',status:'success',data:{status:false}});
  assert.equal(await request,false);
  disconnectLoginSession();
});
