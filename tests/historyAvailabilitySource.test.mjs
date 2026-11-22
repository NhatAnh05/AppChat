import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The previous version of this test targeted deleted hook useServerChats.ts.
// In the uploaded React/Redux source the authoritative implementation is peopleChatService.ts.
const chatService=readFileSync(new URL('../src/services/peopleChatService.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

test('Lịch sử chat gọi API từ người dùng đã xác thực, không tự xác nhận kết quả',()=>{
  assert.match(chatService,/await ensureLoginConnection\(\)/);
  assert.match(chatService,/GET_PEOPLE_CHAT_MES/);
  assert.match(chatService,/response\.status === "error"/);
});
test('Giao diện hiển thị trạng thái API, không coi mất mạng là lịch sử thành công',()=>{
  assert.match(app,/connectionStatus === "CONNECTED"/);
  assert.match(app,/setContactsError/);
});
