import test from 'node:test';
import assert from 'node:assert/strict';
import { historyResponseMatches, historyEventCandidates, resetHistoryCompatibility, HISTORY_EVENT } from '../src/services/chatHistoryTransport.ts';
import { parseRoomHistoryResponse } from '../src/services/roomChatProtocol.ts';
import { mayNotifyMessage } from '../src/services/desktopNotifications.ts';
import { normalizeSearch } from '../src/services/messageWorkspace.ts';

const room = { name: 'Nhom_HocTap', user: [{id:1,name:'Nguyen'}], chatMess: [{id:5,name:'Nguyen',to:'Nhom_HocTap',mes:'Chao',type:1,createAt:'2026-11-22 22:00:00'}] };
const people = [{id:6,name:'A',to:'B',mes:'Hi',type:0,createAt:'2026-11-22 22:00:00'}];

test('Giai đoạn 3: dùng sự kiện Excel trước, có phương án tương thích khi ACTION_NOT_EXIT', () => {
  resetHistoryCompatibility();
  assert.equal(historyEventCandidates('people')[0], HISTORY_EVENT);
  assert.deepEqual(historyEventCandidates('people'), ['CHAT_PEOPLE_GET_MES', 'GET_PEOPLE_CHAT_MES']);
  assert.deepEqual(historyEventCandidates('room'), ['CHAT_PEOPLE_GET_MES', 'GET_ROOM_CHAT_MES']);
});
test('Giai đoạn 3: nhận đúng phản hồi cũ và mới, không trộn room/people', () => {
  assert.equal(historyResponseMatches({event:'GET_PEOPLE_CHAT_MES',status:'success',data:people},'people','B'),true);
  assert.equal(historyResponseMatches({event:'GET_PEOPLE_CHAT_MES',status:'success',data:people},'room','Nhom_HocTap'),false);
  assert.equal(historyResponseMatches({event:'GET_ROOM_CHAT_MES',status:'success',data:room},'room','Nhom_HocTap'),true);
  assert.equal(historyResponseMatches({event:'GET_ROOM_CHAT_MES',status:'success',data:room},'room','Sai'),false);
  const parsed = parseRoomHistoryResponse({event:'GET_ROOM_CHAT_MES',status:'success',data:room},'Nhom_HocTap');
  assert.equal(parsed?.status, 'success');
  assert.equal(parsed?.messages.length, 1);
});
test('Giai đoạn 3: tìm thành viên bỏ dấu', () => {
  assert.equal(normalizeSearch('Nguyễn Trường'), normalizeSearch('nguyen truong'));
});
test('Giai đoạn 5: thông báo chỉ khi đã bật, được cấp quyền và tài khoản khác gửi', () => {
  assert.equal(mayNotifyMessage(true,true,'granted','Lan','Tuan'),true);
  assert.equal(mayNotifyMessage(false,true,'granted','Lan','Tuan'),false);
  assert.equal(mayNotifyMessage(true,false,'granted','Lan','Tuan'),false);
  assert.equal(mayNotifyMessage(true,true,'default','Lan','Tuan'),false);
  assert.equal(mayNotifyMessage(true,true,'granted','TUAN','Tuan'),false);
});
