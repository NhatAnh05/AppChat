import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChatHistory, parseServerChatMessage } from '../src/services/serverMessage.ts';
import { makeHistoryRequest, makeTextMessageRequest } from '../src/services/chatProtocol.ts';

test('Ảnh API: CHAT_PEOPLE_GET_MES trả data là mảng cho chat cá nhân', () => {
  const data=[{id:55,name:'ti',to:'long',mes:'Chào bạn nhé',createAt:'2026-11-02 09:30:00',type:0}];
  assert.deepEqual(parseChatHistory(data)?.map(x=>x.mes),['Chào bạn nhé']);
  assert.equal(makeHistoryRequest('ti',1).data.event,'CHAT_PEOPLE_GET_MES');
});
test('Ảnh API: CHAT_PEOPLE_GET_MES trả data.chatMess và data.user cho phòng', () => {
  const data={name:'ABC',user:[{id:1,name:'long'}],chatMess:[{id:101,name:'long',to:'ABC',mes:'Hello room',createAt:'2026-11-02 10:00:00',type:1}]};
  assert.deepEqual(parseChatHistory(data)?.map(x=>x.mes),['Hello room']);
  assert.equal(makeHistoryRequest('ABC',1,true).data.event,'CHAT_PEOPLE_GET_MES');
});
test('Ảnh API: SEND_CHAT trả dữ liệu không có id/createAt vẫn là tin hợp lệ', () => {
  const data={name:'long',to:'ti',mes:'Hello bạn',type:0};
  assert.equal(parseServerChatMessage(data)?.mes,'Hello bạn');
  assert.deepEqual(makeTextMessageRequest('ti','Hello bạn').data.data,{type:'people',to:'ti',mes:'Hello bạn'});
});
