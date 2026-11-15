import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/hooks/useServerChats.ts', import.meta.url), 'utf8');
const protocol = readFileSync(new URL('../src/services/chatProtocol.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('Không đổi tên event lịch sử chính thức để chữa ACTION_NOT_EXIT', () => {
  assert.match(protocol, /makeChatRequest\('CHAT_PEOPLE_GET_MES', \{ name, page \}\)/);
});
test('Khi backend từ chối lịch sử, dừng tự động thử và báo rõ tình trạng', () => {
  assert.match(hook, /historyCommandUnsupported\.current=true/);
  assert.match(hook, /setHistoryAvailability\('unsupported'\)/);
  assert.match(hook, /setError\('Máy chủ từ chối CHAT_PEOPLE_GET_MES/);
});
test('Giao diện phân biệt kết nối API với tải lịch sử', () => {
  assert.match(app, /api\.historyAvailability==='unsupported'/);
  assert.match(app, /Server từ chối tải lịch sử/);
});
