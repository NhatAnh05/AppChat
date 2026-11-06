import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRegisterRequest, readRegisterResponse } from '../src/services/registerProtocol.ts';

test('REGISTER request khớp mẫu tài liệu Excel', () => {
  assert.deepEqual(makeRegisterRequest('test_01', '123456'), {
    action: 'onchat', data: { event: 'REGISTER', data: { user: 'test_01', pass: '123456' } },
  });
});
test('Nhận phản hồi REGISTER success', () => {
  assert.deepEqual(readRegisterResponse('{"status":"success","event":"REGISTER","data":"Creating account successful"}'), {
    event: 'REGISTER', status: 'success', data: 'Creating account successful', mes: undefined,
  });
});
test('Nhận lỗi trùng username từ máy chủ', () => {
  assert.deepEqual(readRegisterResponse('{"status":"error","event":"REGISTER","mes":"User already exists!"}'), {
    event: 'REGISTER', status: 'error', data: undefined, mes: 'User already exists!',
  });
});
test('Bỏ qua dữ liệu lỗi JSON hoặc không thuộc REGISTER', () => {
  assert.equal(readRegisterResponse('bad json'), null);
  assert.equal(readRegisterResponse('{"event":"LOGIN","status":"success"}'), null);
});
