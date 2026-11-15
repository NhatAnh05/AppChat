import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLoginSession, readLoginSession, clearLoginSession, SESSION_KEY } from '../src/services/sessionStore.ts';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, val) => map.set(key, val),
    removeItem: key => map.delete(key),
  };
}
const first = { username: 'tester_01', reLoginCode: 'nlu_old' };
test('Lưu phiên hiện tại, không lưu mật khẩu', () => {
  const store = fakeStorage(); saveLoginSession(first, store, 1000);
  assert.deepEqual(readLoginSession(store, 1001), first);
  assert.equal(store.getItem(SESSION_KEY).includes('password'), false);
});
test('RE_LOGIN thành công phải thay mã cũ bằng mã mới', () => {
  const store = fakeStorage(); saveLoginSession(first, store, 1000);
  saveLoginSession({ username: first.username, reLoginCode: 'nlu_new' }, store, 2000);
  assert.deepEqual(readLoginSession(store, 2001), { username: 'tester_01', reLoginCode: 'nlu_new' });
  assert.equal(store.getItem(SESSION_KEY).includes('nlu_old'), false);
});
test('Xóa phiên sau khi người dùng đóng phiên', () => {
  const store = fakeStorage(); saveLoginSession(first, store, 1000); clearLoginSession(store);
  assert.equal(readLoginSession(store, 1001), null);
});
test('Phiên quá 2 giờ hoặc dữ liệu giả mạo không được khôi phục', () => {
  const store = fakeStorage(); saveLoginSession(first, store, 1000);
  assert.equal(readLoginSession(store, 1000 + 2 * 60 * 60 * 1000), null);
  store.setItem(SESSION_KEY, '{"username":"u","reLoginCode":null,"savedAt":1000}');
  assert.equal(readLoginSession(store, 1001), null);
});
