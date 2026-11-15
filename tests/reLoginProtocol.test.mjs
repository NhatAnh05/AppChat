import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReLoginRequest, readReLoginResponse } from '../src/services/reLoginProtocol.ts';

test('API #3: đúng request RE_LOGIN từ Excel', () => {
  assert.deepEqual(makeReLoginRequest('long', 'nlu_2055829137'), {
    action: 'onchat', data: { event: 'RE_LOGIN', data: { user: 'long', code: 'nlu_2055829137' } },
  });
});
test('Nhận mã RE_LOGIN_CODE mới từ máy chủ', () => {
  assert.deepEqual(readReLoginResponse(JSON.stringify({
    status: 'success', event: 'RE_LOGIN', data: { RE_LOGIN_CODE: 'nlu_3928172635' },
  })), { event: 'RE_LOGIN', status: 'success', data: { RE_LOGIN_CODE: 'nlu_3928172635' } });
});
test('Mã phiên hết hạn: server trả error', () => {
  assert.deepEqual(readReLoginResponse(JSON.stringify({
    status: 'error', event: 'RE_LOGIN', mes: 'Re-Login error, session expired!',
  })), { event: 'RE_LOGIN', status: 'error', mes: 'Re-Login error, session expired!' });
});
test('Không tự tạo mã giả khi server success nhưng thiếu code', () => {
  assert.deepEqual(readReLoginResponse('{"event":"RE_LOGIN","status":"success","data":{}}'),
    { event: 'RE_LOGIN', status: 'success', data: undefined });
});
test('Bỏ qua JSON hỏng, mảng và sự kiện không phải RE_LOGIN', () => {
  assert.equal(readReLoginResponse('bad'), null);
  assert.equal(readReLoginResponse('[]'), null);
  assert.equal(readReLoginResponse('{"event":"LOGIN","status":"success"}'), null);
});
