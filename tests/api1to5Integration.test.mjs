import test from 'node:test';
import assert from 'node:assert/strict';

const saved = new Map();
globalThis.sessionStorage = {
  getItem(key) { return saved.get(key) ?? null; },
  setItem(key,value) { saved.set(key,value); },
  removeItem(key) { saved.delete(key); },
};
class MockSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static all = [];
  readyState = 0; onopen = null; onclose = null; onerror = null; onmessage = null;
  sent = []; handlers = new Map();
  constructor(url) { this.url = url; MockSocket.all.push(this); }
  addEventListener(type,fn) { if(!this.handlers.has(type)) this.handlers.set(type,new Set()); this.handlers.get(type).add(fn); }
  removeEventListener(type,fn) { this.handlers.get(type)?.delete(fn); }
  emit(type,packet) { const event={data:packet === undefined? undefined:JSON.stringify(packet)}; this[`on${type}`]?.(event); for(const fn of this.handlers.get(type)??[]) fn(event); }
  send(raw) { if (this.readyState!==1) throw new Error('not open'); this.sent.push(JSON.parse(raw)); }
  open() { this.readyState=1; this.emit('open'); }
  receive(packet) { this.emit('message',packet); }
  close() { if(this.readyState===3)return; this.readyState=3; this.emit('close'); }
}
globalThis.WebSocket = MockSocket;
const { websocketService } = await import('../src/services/websocket.ts');
const { registerAccount } = await import('../src/services/authService.ts');
const { loginAccount, restoreLoginSession, disconnectLoginSession, getAuthenticatedSocket } = await import('../src/services/loginService.ts');
const { readLoginSession } = await import('../src/services/sessionStore.ts');
const { logoutCurrentSession } = await import('../src/services/logoutService.ts');
const { contactService } = await import('../src/services/contactService.ts');

const last = () => MockSocket.all.at(-1);
const tick = () => new Promise(resolve=>setTimeout(resolve,0));

async function login(name='test_user') {
  const pending = loginAccount({username:name,password:'do-not-store'});
  const socket=last();socket.open();
  assert.deepEqual(socket.sent.at(-1),{action:'onchat',data:{event:'LOGIN',data:{user:name,pass:'do-not-store'}}});
  socket.receive({event:'LOGIN',status:'success',data:{RE_LOGIN_CODE:'secret-from-server'}});
  await pending;
  return socket;
}

test('API 1 register -> API 2 login use separate sockets; chat reuses authenticated one',async()=>{
  disconnectLoginSession();
  const registered=registerAccount('new_user','secret');
  const registerSocket=last(); registerSocket.open(); await tick();
  assert.deepEqual(registerSocket.sent[0],{action:'onchat',data:{event:'REGISTER',data:{user:'new_user',pass:'secret'}}});
  registerSocket.receive({event:'REGISTER',status:'success',data:'Creating account successful'});
  assert.equal((await registered).status,'success');
  const socket=await login();
  assert.equal(registerSocket.readyState,3);
  assert.equal(websocketService.getSocket(),socket);
  assert.equal(websocketService.isAuthenticated(),true);
  assert.equal(getAuthenticatedSocket(),socket);
  assert.equal(JSON.stringify([...saved.values()]).includes('do-not-store'),false);
  disconnectLoginSession();
});

test('API 5 GET_USER_LIST is sent only after LOGIN, returns friends and rooms',async()=>{
  const socket=await login();
  const before=MockSocket.all.length;
  const waiting=contactService.getUserList();
  await tick();
  assert.equal(MockSocket.all.length,before);
  assert.deepEqual(socket.sent.at(-1),{action:'onchat',data:{event:'GET_USER_LIST',data:{}}});
  socket.receive({event:'SEND_CHAT',status:'success',data:[]});
  socket.receive({event:'GET_USER_LIST',status:'success',data:[{name:'alice',type:0,actionTime:'2026-11-16'},{name:'team',type:1,actionTime:''}]});
  assert.deepEqual(await waiting,[{name:'alice',type:0,actionTime:'2026-11-16'},{name:'team',type:1,actionTime:''}]);
  disconnectLoginSession();
});

test('API 5 rejects malformed data and server error',async()=>{
  const socket=await login();
  const a=contactService.getUserList();await tick();
  socket.receive({event:'GET_USER_LIST',status:'success',data:{not:'array'}});
  await assert.rejects(a,/không hợp lệ/);
  const b=contactService.getUserList();await tick();
  socket.receive({event:'GET_USER_LIST',status:'error',mes:'NOT_AUTHORIZED'});
  await assert.rejects(b,/NOT_AUTHORIZED/);
  disconnectLoginSession();
});


test('API 3 F5 restores session and rotates code on the same chat transport',async()=>{
  await login('recover');
  // Simulate reload: old socket must be closed without deleting browser session.
  const old=last();
  websocketService.release(old); old.onclose=null; old.close();
  const pending=restoreLoginSession();const newSocket=last();newSocket.open();
  assert.equal(newSocket.sent[0].data.event,'RE_LOGIN');
  newSocket.receive({event:'RE_LOGIN',status:'success',data:{RE_LOGIN_CODE:'rotated-new'}});
  await pending;
  assert.equal(readLoginSession()?.reLoginCode,'rotated-new');
  assert.equal(websocketService.getSocket(),newSocket);
  disconnectLoginSession();
});

test('API 4 LOGOUT sends no extra data, clears session and F5 cannot recover',async()=>{
  const socket=await login();
  const result=logoutCurrentSession();
  assert.deepEqual(socket.sent.at(-1),{action:'onchat',data:{event:'LOGOUT'}});
  socket.receive({event:'LOGOUT',status:'success',data:'You are Logout!'});
  assert.equal((await result).backendConfirmed,true);
  assert.equal(readLoginSession(),null);
  assert.equal(await restoreLoginSession(),null);
});

test('REGISTER duplicate username shows backend error, never pretends success', async()=>{
  disconnectLoginSession();
  const task=registerAccount('already_exists','password');
  const socket=last();socket.open();await tick();
  socket.receive({event:'REGISTER',status:'error',mes:'User already exists!'});
  await assert.rejects(task,/User already exists/);
  websocketService.disconnect();
});

test('LOGIN wrong password and missing code do not authenticate', async()=>{
  disconnectLoginSession();
  const attempt=loginAccount({username:'abc',password:'wrong'});
  let socket=last();socket.open();socket.receive({event:'LOGIN',status:'error',mes:'Wrong Username or Password'});
  await assert.rejects(attempt,/Wrong Username or Password/);
  assert.equal(getAuthenticatedSocket(),null);
  assert.equal(readLoginSession(),null);
  const missing=loginAccount({username:'abc',password:'x'});
  socket=last();socket.open();socket.receive({event:'LOGIN',status:'success',data:{}});
  await assert.rejects(missing,/thiếu RE_LOGIN_CODE/);
  disconnectLoginSession();
});

test('GET_USER_LIST refuses to send on unauthenticated socket',async()=>{
  disconnectLoginSession();
  const before=MockSocket.all.length;
  await assert.rejects(contactService.getUserList(),/đăng nhập lại/);
  assert.equal(MockSocket.all.length,before);
});

test('GET_USER_LIST accepts valid array when teacher server omits status',async()=>{
  const socket=await login();
  const pending=contactService.getUserList();await tick();
  socket.receive({event:'GET_USER_LIST',data:[{name:'bob',type:0,actionTime:'now'}]});
  assert.equal((await pending)[0].name,'bob');
  disconnectLoginSession();
});

