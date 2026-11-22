import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChatHistory, parseServerChatMessage } from '../src/services/serverMessage.ts';
import { parseUserList } from '../src/services/contactService.ts';

test('Chat lịch sử 1-1 chấp nhận mảng dữ liệu từ server', () => {
  const data=[{id:55,name:'ti',to:'long',mes:'Chào bạn nhé',createAt:'2026-11-02 09:30:00',type:0}];
  assert.deepEqual(parseChatHistory(data)?.map(x=>x.mes),['Chào bạn nhé']);
});
test('Chat lịch sử phòng chấp nhận mảng chatMess và không tự tạo ACK', () => {
  const data={name:'ABC',user:[{id:1,name:'long'}],chatMess:[{id:101,name:'long',to:'ABC',mes:'Hello room',createAt:'2026-11-02 10:00:00',type:1}]};
  assert.deepEqual(parseChatHistory(data)?.map(x=>x.mes),['Hello room']);
  assert.equal(parseServerChatMessage({event:'SEND_CHAT',status:'success'}),null);
});
test('GET_USER_LIST phân loại type và bỏ dữ liệu lỗi',()=>{
  assert.equal(parseUserList([{name:'abc',type:0,actionTime:'now'},{name:'room',type:1,actionTime:''}])?.length,2);
  assert.equal(parseUserList({list:[]}),null);
});
