import test from 'node:test';
import assert from 'node:assert/strict';
import { parseServerChatMessage, parseChatHistory, belongsToConversation } from '../src/services/serverMessage.ts';
import * as realtime from '../src/services/serverMessage.ts';

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

test('SEND_CHAT vào hội thoại đã có dù server đổi chữ hoa/thường username', () => {
  const { resolveRealtimeConversationId } = realtime;
  const msg = parseServerChatMessage({name:'tuyetminh',to:'TUANANH',mes:'Hiii',type:0});
  assert.ok(msg);
  assert.equal(resolveRealtimeConversationId(msg,'TuanAnh',['people:TuyetMinh']), 'people:TuyetMinh');
  assert.equal(belongsToConversation(msg,'TuanAnh','people:TuyetMinh'), true);
});

test('SEND_CHAT người dùng tự gửi xác định đúng hội thoại nếu server trả username khác kiểu chữ', () => {
  const msg=parseServerChatMessage({name:'tuananh',to:'TuyetMinh',mes:'Xin chào',type:0});
  assert.ok(msg);
  assert.equal(realtime.sameChatUser(msg.name,'TuanAnh'),true);
  assert.equal(realtime.resolveRealtimeConversationId(msg,'TuanAnh',['people:TuyetMinh']),'people:TuyetMinh');
});

test('không gán SEND_CHAT của người dùng khác vào tài khoản hiện tại', () => {
  const msg=parseServerChatMessage({name:'Hoa',to:'Binh',mes:'Riêng tư',type:0});
  assert.ok(msg);
  assert.equal(realtime.resolveRealtimeConversationId(msg,'TuanAnh',['people:Hoa']),null);
});

test('gói SEND_CHAT được lồng thêm data vẫn đọc và định tuyến được', () => {
  const msg=parseServerChatMessage({data:{name:'TuyetMinh',to:'TuanAnh',mes:'Hiii',type:0}});
  assert.ok(msg);
  assert.equal(realtime.resolveRealtimeConversationId(msg,'TuanAnh',['people:TuyetMinh']),'people:TuyetMinh');
});

test('không biến gói ACK lồng data thiếu nội dung thành tin nhắn', () => {
  assert.equal(parseServerChatMessage({data:{status:'success',event:'SEND_CHAT'}}),null);
});

test('tin nhắn nhóm dùng đúng tên phòng dù khác chữ hoa/thường', () => {
  const msg=parseServerChatMessage({name:'TuyetMinh',to:'myroom',mes:'hello nhóm',type:1});
  assert.ok(msg);
  assert.equal(realtime.resolveRealtimeConversationId(msg,'TuanAnh',['room:MyRoom']),'room:MyRoom');
});
