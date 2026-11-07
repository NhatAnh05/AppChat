import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLoginRequest, readLoginResponse } from '../src/services/loginProtocol.ts';

test('LOGIN request theo đúng chat_API.xlsx', () => {
  assert.deepEqual(makeLoginRequest('test', '123456'), {
    action: 'onchat',
    data: { event: 'LOGIN', data: { user: 'test', pass: '123456' } },
  });
});

test('LOGIN thành công nhận mã RE_LOGIN_CODE của server', () => {
  assert.deepEqual(readLoginResponse(JSON.stringify({
    status: 'success', event: 'LOGIN', data: { RE_LOGIN_CODE: 'nlu_2055829137' },
  })), { event: 'LOGIN', status: 'success', data: { RE_LOGIN_CODE: 'nlu_2055829137' } });
});

test('LOGIN sai tên tài khoản hoặc mật khẩu', () => {
  assert.deepEqual(readLoginResponse(JSON.stringify({
    status: 'error', event: 'LOGIN', mes: 'Login error, Wrong Username or Password',
  })), { event: 'LOGIN', status: 'error', mes: 'Login error, Wrong Username or Password' });
});

test('Bỏ qua frame không thuộc LOGIN hoặc JSON hỏng', () => {
  assert.equal(readLoginResponse('not-json'), null);
  assert.equal(readLoginResponse('{"status":"success","event":"REGISTER"}'), null);
  assert.equal(readLoginResponse('[]'), null);
});

test('LOGIN success thiếu code không được tự tạo code giả', () => {
  assert.deepEqual(readLoginResponse('{"status":"success","event":"LOGIN","data":{}}'), {
    event: 'LOGIN', status: 'success', data: undefined,
  });
});
