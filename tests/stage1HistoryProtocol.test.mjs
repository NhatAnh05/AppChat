import test from 'node:test';
import assert from 'node:assert/strict';
import { historyResponseMatches, HISTORY_EVENT } from '../src/services/chatHistoryTransport.ts';
import { encodeChatContent, decodeChatContent } from '../src/services/chatContentCodec.ts';
import { makeRoomHistoryRequest, parseRoomHistoryResponse } from '../src/services/roomChatProtocol.ts';

const people = [{ id:1,name:'alice',to:'bob',mes:'Xin chào',createAt:'2026-11-22 20:00:00',type:0 }];
const room = {name:'Team',user:[{id:1,name:'alice'}],chatMess:[{id:2,name:'alice',to:'Team',mes:'Chào nhóm',createAt:'2026-11-22 20:00:00',type:1}]};

test('Giai đoạn 1: yêu cầu lịch sử nhóm dùng GET_ROOM_CHAT_MES theo Excel', () => {
  assert.equal(HISTORY_EVENT,'CHAT_PEOPLE_GET_MES'); // alias cũ vẫn đọc được
  assert.equal(makeRoomHistoryRequest('Team',1).data.event,'GET_ROOM_CHAT_MES');
});
test('Giai đoạn 1: phản hồi lịch sử cá nhân không bị nhận làm lịch sử nhóm', () => {
  const frame={event:HISTORY_EVENT,status:'success',data:people};
  assert.equal(historyResponseMatches(frame,'people','alice'),true);
  assert.equal(historyResponseMatches(frame,'room','Team'),false);
});
test('Giai đoạn 1: phản hồi phòng đúng tên được nhận, phòng khác bị bỏ qua', () => {
  const frame={event:'GET_ROOM_CHAT_MES',status:'success',data:room};
  assert.equal(historyResponseMatches(frame,'people','alice'),false);
  assert.equal(historyResponseMatches(frame,'room','Other'),false);
  assert.equal(historyResponseMatches(frame,'room','Team'),true);
  assert.equal(parseRoomHistoryResponse(frame,'Team').messages[0].content,'Chào nhóm');
});
test('Giai đoạn 1: lỗi lịch sử nhóm chấp nhận tên event phản hồi khác biệt trong tài liệu', () => {
  const frame={event:'GET_ROOM_CHAT_MES',status:'error',mes:'Room not found'};
  assert.equal(historyResponseMatches(frame,'room','Team'),true);
  assert.equal(historyResponseMatches(frame,'people','alice'),false);
  assert.equal(parseRoomHistoryResponse(frame,'Team').status,'error');
});
test('Giai đoạn 1: emoji và chữ tiếng Việt đi cùng nhau roundtrip', () => {
  const examples=['Xin chào 😍','😀 Xin chào thế giới ❤️','Gia đình 👨‍👩‍👧‍👦','Cảm ơn 👍🏽'];
  for(const example of examples){
    const encoded=encodeChatContent(example);
    assert.equal(decodeChatContent(encoded),example);
    assert.equal(!/[\uD800-\uDFFF]/u.test(encoded),true);
  }
});
