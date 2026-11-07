import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChatRequest, makeTextMessageRequest } from '../src/services/chatProtocol.ts';

test('SEND_CHAT 1-1 khớp đúng JSON tài liệu thầy cung cấp', () => {
  assert.deepEqual(makeTextMessageRequest(' TuyetMinh ', ' Xin chào '), {
    action: 'onchat',
    data: { event: 'SEND_CHAT', data: { type: 'people', to: 'TuyetMinh', mes: 'Xin chào' } },
  });
});
test('SEND_CHAT nhóm có type room', () => {
  assert.equal(makeTextMessageRequest('ABC', 'hi', true).data.data.type, 'room');
});
test('CHAT_PEOPLE_GET_MES có name và page', () => {
  assert.deepEqual(makeChatRequest('CHAT_PEOPLE_GET_MES', { name:'TuyetMinh', page:1 }), {
    action:'onchat', data:{event:'CHAT_PEOPLE_GET_MES',data:{name:'TuyetMinh',page:1}},
  });
});
test('Không cho gửi tin trống', () => {
  assert.throws(() => makeTextMessageRequest('A', '  '));
});
