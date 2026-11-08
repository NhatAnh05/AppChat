import test from 'node:test';
import assert from 'node:assert/strict';
import { parseServerChatMessage, parseChatHistory, belongsToConversation } from '../src/services/serverMessage.ts';

test('đọc đúng SEND_CHAT người dùng theo tài liệu', () => {
  const msg = parseServerChatMessage({ name:'TuyetMinh', to:'TuanAnh', mes:'chào', type:0 });
  assert.equal(msg?.name, 'TuyetMinh');
  assert.equal(belongsToConversation(msg, 'TuanAnh', 'people:TuyetMinh'), true);
  assert.equal(belongsToConversation(msg, 'Hoa', 'people:TuyetMinh'), false);
});
test('không biến ACK rỗng thành tin nhắn', () => {
  assert.equal(parseServerChatMessage({ status:'success' }), null);
});
test('đọc lịch sử cá nhân dạng mảng', () => {
  const rows = parseChatHistory([{id:55,name:'TuanAnh',to:'TuyetMinh',mes:'hi',type:0}]);
  assert.equal(rows?.[0]?.id, 55);
});
test('đọc lịch sử phòng dạng chatMess', () => {
  const rows = parseChatHistory({name:'ABC',chatMess:[{name:'TuanAnh',to:'ABC',mes:'hi',type:1}]});
  assert.equal(rows?.[0]?.type, 1);
});
test('từ chối dữ liệu lịch sử không đúng định dạng', () => {
  assert.equal(parseChatHistory({error:'no data'}), null);
});
