import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeServerHistory } from '../src/services/historyMerge.ts';
import { readConversationPreferences, saveConversationPreferences, readDraft, saveDraft } from '../src/services/conversationStorage.ts';
import { getConnectionState, setConnectionState, subscribeConnectionState } from '../src/services/connectionHealth.ts';

const msg = (id, text, at, fromMe = true, clientSentAt) => ({id, text, fromMe, time:'08:00', ...(at ? {createdAt:at}:{}), ...(clientSentAt ? {clientSentAt}: {})});

test('lịch sử mới hợp nhất tin realtime và không lặp theo server id', () => {
  const old = [msg('101','cũ','2026-11-08T07:00:00'), msg('102','mới','2026-11-08T08:00:00')];
  const page = [msg('102','mới','2026-11-08T08:00:00'), msg('103','mới hơn','2026-11-08T09:00:00')];
  assert.deepEqual(mergeServerHistory(old,page,1).map(m=>m.id), ['101','102','103']);
});
test('trang lịch sử cũ được sắp theo thời gian tăng dần', () => {
  const current = [msg('200','new','2026-11-08T12:00:00')];
  const older = [msg('2','middle','2026-11-07T12:00:00'), msg('1','old','2026-11-06T12:00:00')];
  assert.deepEqual(mergeServerHistory(current,older,2).map(m=>m.id), ['1','2','200']);
});
test('ACK có thời gian tương ứng được đối chiếu, không nhân đôi tin', () => {
  const when = Date.parse('2026-11-08T12:00:00Z');
  const pending = [msg('ack:local:1','xin chào',undefined,true,when)];
  const page = [msg('55','xin chào','2026-11-08T12:00:02.000Z')];
  assert.deepEqual(mergeServerHistory(pending,page,1).map(m=>m.id), ['55']);
});
test('tin chưa xác nhận vẫn giữ nguyên nếu lịch sử chưa có bản ghi tương ứng', () => {
  const pending = [msg('unverified:1','xin chào',undefined,true,Date.now())];
  const page = [msg('4','khác',new Date().toISOString())];
  assert.deepEqual(mergeServerHistory(pending,page,1).map(m=>m.id), ['4','unverified:1']);
});
test('không xác nhận nhầm một tin cũ cùng nội dung', () => {
  const pending = [msg('failed:1','xin chào',undefined,true,Date.parse('2026-11-08T14:00:00Z'))];
  const page = [msg('3','xin chào','2026-10-01T14:00:00Z')];
  assert.deepEqual(mergeServerHistory(pending,page,1).map(m=>m.id), ['3','failed:1']);
});
test('broadcast tin đến không có id được khớp an toàn khi lịch sử có id', () => {
  const t = Date.parse('2026-11-08T12:00:00Z');
  const old = [{...msg('live:abc','xin chào',undefined,false),clientReceivedAt:t}];
  const page = [msg('90','xin chào','2026-11-08T12:00:02Z',false)];
  assert.deepEqual(mergeServerHistory(old,page,1).map(m=>m.id),['90']);
});
test('tin nhắn có cùng nội dung nhưng id server khác nhau vẫn được giữ', () => {
  const same = [msg('1','hi','2026-11-08T08:00:00Z'),msg('2','hi','2026-11-08T08:01:00Z')];
  assert.equal(mergeServerHistory([],same,1).length,2);
});

test('ghim / tắt thông báo / lưu trữ lưu riêng cho mỗi tài khoản', () => {
  const map = new Map();
  globalThis.localStorage = {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  saveConversationPreferences('TuyetMinh',{'people:TuanAnh':{pinned:true,muted:true,archived:false}});
  assert.equal(readConversationPreferences('TuyetMinh')['people:TuanAnh'].pinned,true);
  assert.deepEqual(readConversationPreferences('TuanAnh'),{});
});
test('nháp khác nhau theo người dùng và hội thoại', () => {
  saveDraft('A','people:B','chào B');
  saveDraft('A','people:C','chào C');
  saveDraft('B','people:A','chào A');
  assert.equal(readDraft('A','people:B'),'chào B');
  assert.equal(readDraft('A','people:C'),'chào C');
  assert.equal(readDraft('B','people:A'),'chào A');
  saveDraft('A','people:B','');
  assert.equal(readDraft('A','people:B'),'');
});
test('storage không khả dụng không làm treo ứng dụng', () => {
  globalThis.localStorage = {getItem:()=>{throw new Error('disabled')},setItem:()=>{throw new Error('full')},removeItem:()=>{throw new Error('disabled')}};
  assert.deepEqual(readConversationPreferences('user'),{});
  assert.equal(readDraft('user','people:A'),'');
  assert.doesNotThrow(()=>saveDraft('user','people:A','abc'));
  assert.doesNotThrow(()=>saveConversationPreferences('user',{}));
  delete globalThis.localStorage;
});
test('cập nhật trạng thái kết nối và hủy đăng ký listener', () => {
  const seen = [];
  const dispose = subscribeConnectionState(state=>seen.push(state));
  setConnectionState('connected');
  setConnectionState('offline');
  dispose();
  setConnectionState('signed-out');
  assert.deepEqual(seen.slice(-2),['connected','offline']);
  assert.equal(getConnectionState(),'signed-out');
});
