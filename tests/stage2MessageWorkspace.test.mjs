import test from 'node:test';
import assert from 'node:assert/strict';
import { bookmarkId, collectLoadedMedia, copySelectedMessages, findLoadedMessages, forwardContent, isUserMessage, normalizeSearch } from '../src/services/messageWorkspace.ts';
import { makeReaction, makeReply } from '../src/services/messageInteractions.ts';

const msg=(id,content,senderId='anna') => ({id,chatId:'bob',senderId,content,createdAt:'2026-11-22T10:00:00.000Z'});
test('tìm không dấu, không phân biệt chữ hoa/thường',()=>{
  assert.equal(normalizeSearch('Đi Xuống Cầu Thang'), 'di xuong cau thang');
  assert.deepEqual(findLoadedMessages([msg('1','Đang ở nhà'), msg('2','Hello')],'dang o').map(x=>x.id),['1']);
});
test('tìm trên nội dung hiển thị của reply, không lọt reaction ẩn',()=>{
  const reply=msg('2',makeReply('Chào Béo',{id:'1',sender:'anna',excerpt:'test'}));
  const reaction=msg('3',makeReaction('1','❤️'));
  assert.equal(isUserMessage(reaction),false);
  assert.deepEqual(findLoadedMessages([reply,reaction],'chao beo').map(x=>x.id),['2']);
  assert.equal(findLoadedMessages([reply,reaction],'').length,1);
});
test('bookmark không chứa nội dung và phân biệt hội thoại',()=>{
  const a=msg('1','bí mật');
  assert.match(bookmarkId(a),/^[a-z0-9]+-[a-z0-9]+$/);
  assert.equal(bookmarkId(a),bookmarkId({...a,content:'khác'}));
  assert.notEqual(bookmarkId(a),bookmarkId({...a,chatId:'khác'}));
});
test('thư viện nhận diện URL media và bỏ qua văn bản, reaction',()=>{
  const media=msg('4','https://files.example/photo.png');
  assert.deepEqual(collectLoadedMedia([media,msg('1','chào'),msg('5',makeReaction('4','😂'))]).map(x=>x.kind),['image']);
});
test('chuyển tiếp văn bản/reply và URL media nhưng chặn nội dung lỗi',()=>{
  assert.equal(forwardContent(msg('1','Chào')), '↪ Chuyển tiếp:\nChào');
  assert.equal(forwardContent(msg('2','https://files.example/a.pdf')), 'https://files.example/a.pdf');
  assert.equal(forwardContent(msg('3',makeReply('OK',{id:'1',sender:'A',excerpt:'hi'}))),'↪ Chuyển tiếp:\nOK');
  assert.equal(forwardContent(msg('4',makeReaction('1','❤️'))),null);
  assert.equal(forwardContent(msg('5','A'.repeat(10000))),null);
});
test('sao chép nhiều tin có tên người gửi và tệp đính kèm',()=>{
  const text=copySelectedMessages([msg('1','Xin chào','bob'),msg('2','https://files.example/a.pdf')],'bob');
  assert.match(text,/Bạn: Xin chào/);
  assert.match(text,/FILE: a.pdf/);
});
