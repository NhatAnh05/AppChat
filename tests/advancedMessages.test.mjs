import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectMediaLibrary, filterMediaLibrary, formatSelectedCopy,
  pickedMessages, prepareForwardMessage,
} from '../src/services/advancedMessages.ts';
import { MAX_NOTE_LENGTH, readConversationNote, saveConversationNote } from '../src/services/conversationNotes.ts';
import { makeMediaMessage } from '../src/services/mediaMessages.ts';

const m=(id,text,fromMe=false)=>({id,text,fromMe,time:'10:00'});
const storage = new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};

test('chọn tin theo thứ tự lịch sử, bỏ ID không còn tồn tại',()=>{
  const list=[m('1','a'),m('2','b'),m('3','c')];
  assert.deepEqual(pickedMessages(list,new Set(['3','missing','1'])).map(v=>v.id),['1','3']);
  assert.deepEqual(pickedMessages(list,new Set()),[]);
});
test('sao chép nhiều tin không lộ JSON của ảnh',()=>{
  const img=makeMediaMessage([{kind:'image',url:'https://files.example/photo.png'}]);
  const result=formatSelectedCopy('TuanAnh',[m('1','Xin chào'),m('2',img,true)]);
  assert.match(result,/TuanAnh: Xin chào/);
  assert.match(result,/Bạn: 📷 Ảnh/);
  assert.doesNotMatch(result,/LYRA_MEDIA_V1/);
});
test('chuyển tiếp văn bản có nhãn rõ và giữ nội dung',()=>{
  assert.equal(prepareForwardMessage(m('1','Chào bạn')),'↪ Tin nhắn được chuyển tiếp:\nChào bạn');
  assert.equal(prepareForwardMessage(m('2','    ')),'');
});
test('chuyển tiếp nội dung đính kèm giữ envelope hợp lệ, không biến thành text',()=>{
  const payload=makeMediaMessage([{kind:'file',url:'https://cdn.example/test.pdf',name:'test.pdf'}]);
  assert.equal(prepareForwardMessage(m('3',payload)),payload);
  assert.equal(prepareForwardMessage(m('4','[[LYRA_MEDIA_V1]]{bad')),'');
});
test('chặn chuyển tiếp tin dài hơn giới hạn API 10000 ký tự',()=>{
  assert.equal(prepareForwardMessage(m('5','A'.repeat(10000))),'');
  assert.ok(prepareForwardMessage(m('6','A'.repeat(500))));
});
test('thư viện gom ảnh, GIF, video, file, sticker và caption',()=>{
  const payload=makeMediaMessage([
    {kind:'image',url:'https://cdn.example/a.png',name:'A'},
    {kind:'gif',url:'https://cdn.example/b.gif'},
    {kind:'video',url:'https://cdn.example/v.mp4'},
    {kind:'file',url:'https://cdn.example/c.zip'},
    {kind:'sticker',sticker:'🥳'},
  ],'Album');
  const items=collectMediaLibrary([m('1','hello'),m('2',payload)]);
  assert.equal(items.length,5);
  assert.deepEqual(items.map(x=>x.kind),['image','gif','video','file','sticker']);
  assert.ok(items.every(x=>x.messageId==='2' && x.caption==='Album'));
  assert.equal(filterMediaLibrary(items,'image').length,2);
  assert.equal(filterMediaLibrary(items,'file').length,1);
  assert.equal(filterMediaLibrary(items,'all'),items);
});
test('thư viện bỏ qua media lỗi và URL không hợp lệ',()=>{
  const bad='[[LYRA_MEDIA_V1]]'+JSON.stringify({version:1,kind:'media',items:[{kind:'image',url:'javascript:alert(1)'}]});
  assert.deepEqual(collectMediaLibrary([m('1',bad),m('2','hi')]),[]);
});
test('ghi chú lưu riêng từng tài khoản và cuộc trò chuyện',()=>{
  assert.equal(readConversationNote('A','people:B'),'');
  assert.equal(saveConversationNote('A','people:B','Việc cần nhớ'),true);
  assert.equal(readConversationNote('A','people:B'),'Việc cần nhớ');
  assert.equal(readConversationNote('B','people:A'),'');
  assert.equal(readConversationNote('A','people:C'),'');
});
test('ghi chú xóa khi trống và giới hạn tối đa 2000 ký tự',()=>{
  saveConversationNote('A','people:B','x'.repeat(MAX_NOTE_LENGTH+50));
  assert.equal(readConversationNote('A','people:B').length,MAX_NOTE_LENGTH);
  saveConversationNote('A','people:B','  ');
  assert.equal(readConversationNote('A','people:B'),'');
});
test('không lỗi ứng dụng khi localStorage bị chặn',()=>{
  const original=globalThis.localStorage;
  globalThis.localStorage={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')},removeItem:()=>{throw Error('blocked')}};
  assert.equal(readConversationNote('A','B'),'');
  assert.equal(saveConversationNote('A','B','note'),false);
  globalThis.localStorage=original;
});
test('ghi chú không lưu khi thiếu tài khoản hoặc hội thoại',()=>{
  assert.equal(saveConversationNote('','c','hi'),false);
  assert.equal(saveConversationNote('a','','hi'),false);
  assert.equal(readConversationNote('a',''),'');
});
