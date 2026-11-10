import test from 'node:test';
import assert from 'node:assert/strict';
import { readLoginSession, saveLoginSession } from '../src/services/sessionStore.ts';
import { getConnectionState } from '../src/services/connectionHealth.ts';

const saved = new Map();
globalThis.sessionStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: key => saved.delete(key),
};
globalThis.window = new EventTarget();
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];
  readyState = FakeSocket.CONNECTING;
  sent = [];
  listeners = new Map();
  onopen = null;
  onmessage = null;
  onerror = null;
  onclose = null;
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
  emit(type, packet) {
    const data = packet === undefined ? undefined : JSON.stringify(packet);
    const event = { data };
    this[`on${type}`]?.(event);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  send(raw) {
    if (this.readyState !== FakeSocket.OPEN) throw new Error('closed');
    this.sent.push(JSON.parse(raw));
  }
  open() { this.readyState = FakeSocket.OPEN; this.emit('open'); }
  receive(packet) { this.emit('message', packet); }
  close() {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.emit('close');
  }
  broken() { this.emit('error'); }
}
globalThis.WebSocket = FakeSocket;
const { loginAccount, disconnectLoginSession, restoreLoginSession, getAuthenticatedSocket } =
  await import('../src/services/loginService.ts');
const { logoutCurrentSession } = await import('../src/services/logoutService.ts');

async function login() {
  disconnectLoginSession();
  const waiting = loginAccount({ username: 'login_test', password: 'local-demo-only' });
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  socket.receive({ event: 'LOGIN', status: 'success', data: { RE_LOGIN_CODE: 'nlu_abc' } });
  await waiting;
  return socket;
}

async function expectLocalSignedOut(socket) {
  assert.equal(readLoginSession(), null);
  assert.equal(getAuthenticatedSocket(), null);
  assert.equal(getConnectionState(), 'signed-out');
  if (socket) assert.equal(socket.readyState, FakeSocket.CLOSED);
  const before = FakeSocket.instances.length;
  assert.equal(await restoreLoginSession(), null);
  assert.equal(FakeSocket.instances.length, before); // F5 must not RE_LOGIN
}

test('LOGOUT sends only the API #4 request and waits for actual ACK', async () => {
  const socket = await login();
  const pending = logoutCurrentSession();
  assert.deepEqual(socket.sent.at(-1), { action: 'onchat', data: { event: 'LOGOUT' } });
  assert.equal(socket.readyState, FakeSocket.OPEN, 'must not close before server ACK');
  assert.equal(getAuthenticatedSocket(), null, 'block chat sends during logout');
  assert.equal(getConnectionState(), 'signing-out');
  assert.equal(readLoginSession()?.reLoginCode, 'nlu_abc', 'clear only after response/timeout');
  socket.receive({ event: 'GET_USER_LIST', status: 'success', data: [] });
  assert.equal(socket.readyState, FakeSocket.OPEN);
  socket.receive({ event: 'LOGOUT', status: 'success', data: 'You are Logout!' });
  assert.deepEqual(await pending, { backendConfirmed: true, reason: 'confirmed' });
  await expectLocalSignedOut(socket);
  assert.equal(socket.count('message'), 0);
  assert.equal(socket.count('close'), 0);
});

test('Double click reuses the same in-flight LOGOUT request', async () => {
  const socket = await login();
  const first = logoutCurrentSession();
  const second = logoutCurrentSession();
  assert.strictEqual(first, second);
  assert.equal(socket.sent.filter(x => x.data.event === 'LOGOUT').length, 1);
  socket.receive({ event: 'LOGOUT', status: 'success', data: 'You are Logout!' });
  assert.equal((await first).backendConfirmed, true);
});

test('Server LOGOUT error => local sign-out, not backend-confirmed', async () => {
  const socket = await login();
  const pending = logoutCurrentSession();
  socket.receive({event:'LOGOUT',status:'error',mes:'access denied'});
  assert.deepEqual(await pending, {backendConfirmed:false,reason:'rejected'});
  await expectLocalSignedOut(socket);
});

test('Timeout => no indefinite hang and no false backend confirmation', async () => {
  const socket = await login();
  const result = await logoutCurrentSession({timeoutMs:5});
  assert.deepEqual(result, {backendConfirmed:false,reason:'timeout'});
  await expectLocalSignedOut(socket);
  assert.equal(socket.count('message'), 0);
});

test('Socket closes before ACK => never start RE_LOGIN', async () => {
  const socket = await login();
  const pending = logoutCurrentSession();
  const before = FakeSocket.instances.length;
  socket.close();
  assert.deepEqual(await pending, {backendConfirmed:false,reason:'disconnected'});
  assert.equal(FakeSocket.instances.length, before);
  await expectLocalSignedOut(socket);
});

test('Socket error before ACK => local sign-out', async () => {
  const socket = await login();
  const pending = logoutCurrentSession();
  socket.broken();
  assert.deepEqual(await pending, {backendConfirmed:false,reason:'disconnected'});
  await expectLocalSignedOut(socket);
});

test('No active authenticated socket => local sign-out without opening one', async () => {
  disconnectLoginSession();
  const before = FakeSocket.instances.length;
  assert.deepEqual(await logoutCurrentSession(), {backendConfirmed:false,reason:'no-connection'});
  assert.equal(FakeSocket.instances.length, before);
  await expectLocalSignedOut();
});

test('Abort before ACK => local sign-out; listeners cleaned', async () => {
  const socket = await login();
  const controller = new AbortController();
  const pending = logoutCurrentSession({signal:controller.signal});
  controller.abort();
  assert.deepEqual(await pending, {backendConfirmed:false,reason:'aborted'});
  await expectLocalSignedOut(socket);
  assert.equal(socket.count('message'), 0);
});

test('Aborted signal => do not send LOGOUT request', async () => {
  const socket = await login();
  const abort = new AbortController(); abort.abort();
  assert.deepEqual(await logoutCurrentSession({signal:abort.signal}), {backendConfirmed:false,reason:'aborted'});
  assert.equal(socket.sent.filter(x => x.data.event === 'LOGOUT').length, 0);
  await expectLocalSignedOut(socket);
});

test('When send throws, local session still ends', async () => {
  const socket = await login();
  socket.send = () => {throw new Error('send failed');};
  assert.deepEqual(await logoutCurrentSession(), {backendConfirmed:false,reason:'send-error'});
  await expectLocalSignedOut(socket);
});

test('Logout while RE_LOGIN is pending cancels recovery and prevents its late acceptance', async () => {
  disconnectLoginSession();
  saveLoginSession({username:'login_test',reLoginCode:'nlu_keep'});
  const pendingRecovery = restoreLoginSession();
  const recoveringSocket = FakeSocket.instances.at(-1);
  recoveringSocket.open();
  const before = FakeSocket.instances.length;
  assert.deepEqual(await logoutCurrentSession(), {backendConfirmed:false,reason:'no-connection'});
  assert.equal(await pendingRecovery, null);
  assert.equal(recoveringSocket.readyState, FakeSocket.CLOSED);
  assert.equal(FakeSocket.instances.length, before);
  await expectLocalSignedOut();
});

test('Can log in again normally after logout with a new session', async () => {
  const socket = await login();
  const pending = logoutCurrentSession();
  socket.receive({event:'LOGOUT',status:'success',data:'You are Logout!'});
  await pending;
  const again = await login();
  assert.equal(getAuthenticatedSocket(), again);
  assert.ok(readLoginSession());
  disconnectLoginSession();
});
