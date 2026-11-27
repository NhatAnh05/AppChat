import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseUserExistResponse, USER_EXIST_REQUEST_EVENT, USER_EXIST_RESPONSE_EVENT } from '../src/services/userExistProtocol.ts';

test('API 16 dùng event gửi CHAT_CHECK_USER_EXIST và nhận CHECK_USER_EXIST', () => {
  assert.equal(USER_EXIST_REQUEST_EVENT, 'CHAT_CHECK_USER_EXIST');
  assert.equal(USER_EXIST_RESPONSE_EVENT, 'CHECK_USER_EXIST');
});

test('API 16 phân biệt tài khoản có và không tồn tại theo data.status', () => {
  assert.equal(parseUserExistResponse({ status: true }), true);
  assert.equal(parseUserExistResponse({ status: false }), false);
  assert.equal(parseUserExistResponse({ status: 'true' }), null);
  assert.equal(parseUserExistResponse({ exists: true }), null);
  assert.equal(parseUserExistResponse(undefined), null);
});

test('Màn hình tìm người dùng sử dụng API 16 chung, không gửi CHECK_USER_EXIST trực tiếp', () => {
  const source = readFileSync(new URL('../src/components/UserSearchDialog.tsx', import.meta.url), 'utf8');
  assert.match(source, /userService\.checkUserExist\(username\.trim\(\)\)/);
  assert.doesNotMatch(source, /websocketService\.send\(['"]CHECK_USER_EXIST['"]/);
});
