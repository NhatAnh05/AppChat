import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLogoutRequest, readLogoutResponse } from '../src/services/logoutProtocol.ts';

test('LOGOUT request matches chat_API.xlsx exactly (no user/code/data)', () => {
  const request = makeLogoutRequest();
  assert.deepEqual(request, { action: 'onchat', data: { event: 'LOGOUT' } });
  assert.equal(JSON.stringify(request), '{"action":"onchat","data":{"event":"LOGOUT"}}');
});
test('LOGOUT success from backend is recognized', () => {
  assert.deepEqual(readLogoutResponse('{"status":"success","event":"LOGOUT","data":"You are Logout!"}'),
    {status:'success',data:'You are Logout!'});
});
test('LOGOUT error is recognized without inventing server error contract', () => {
  assert.deepEqual(readLogoutResponse('{"status":"error","event":"LOGOUT","mes":"not authorized"}'),
    {status:'error',mes:'not authorized'});
  assert.equal(readLogoutResponse('{"event":"LOGOUT","status":"error"}')?.status,'error');
});
test('Ignore unrelated events, malformed packets, and invalid success', () => {
  for (const raw of [
    '{bad JSON', 'null', '[]', '{"status":"success","event":"LOGIN","data":"ok"}',
    '{"status":"success","event":"LOGOUT"}',
    '{"status":"success","event":"LOGOUT","data":{}}',
    '{"status":"pending","event":"LOGOUT"}',
  ]) assert.equal(readLogoutResponse(raw), null);
});
