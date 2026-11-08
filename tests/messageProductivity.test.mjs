import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookmarkKey, exportConversation, formatQuotedReply, messageExcerpt,
  parseQuotedReply, safeExportFilename, searchMessageIds, senderLabel,
} from '../src/services/messageProductivity.ts';
import {
  readMessageBookmarks, saveMessageBookmarks, toggleMessageBookmark,
} from '../src/services/messageBookmarks.ts';

const msg = (id, text, fromMe=false, time='10:30') => ({id,text,fromMe,time});
const saved = new Map();
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key,value) => saved.set(key,value),
  removeItem: key => saved.delete(key),
};

test('trả lời gửi bằng văn bản thông thường, không đổi event API', () => {
  const result = formatQuotedReply(msg('1','Xin chào!'), 'TuanAnh', 'Mình nhận được rồi');
  assert.equal(result,'↪ Trả lời TuanAnh: Xin chào!\n\nMình nhận được rồi');
  assert.deepEqual(parseQuotedReply(result),{sender:'TuanAnh',excerpt:'Xin chào!',body:'Mình nhận được rồi'});
});
test('trả lời trống không được gửi và phản hồi không hợp lệ không bị tách', () => {
  assert.equal(formatQuotedReply(msg('1','a'),'A','   '),'');
  assert.equal(parseQuotedReply('↪ Trả lời A: test'),null);
});
test('người gửi trong phần trích dẫn được làm sạch và giới hạn độ dài', () => {
  const result = formatQuotedReply(msg('1','A'.repeat(1000)),'A:\nAdmin','OK');
  assert.ok(result.startsWith('↪ Trả lời A Admin:'));
  assert.ok(result.length < 260);
});
test('trả lời ảnh hiện trích dẫn dễ đọc thay vì JSON thô', () => {
  const media = '[[LYRA_MEDIA_V1]]'+JSON.stringify({kind:'media',version:1,items:[{kind:'image',url:'https://example.com/a.png'}]});
  assert.equal(messageExcerpt(msg('photo',media)),'📷 Ảnh');
});
test('tìm kiếm tin nhắn tiếng Việt không phân biệt dấu và hoa/thường', () => {
  const messages = [msg('1','Chào Nguyễn Anh'),msg('2','HỌC FRONTEND'),msg('3','Không có')];
  assert.deepEqual(searchMessageIds(messages,'nguyen anh'),['1']);
  assert.deepEqual(searchMessageIds(messages,'học frontend'),['2']);
  assert.deepEqual(searchMessageIds(messages,'   '),[]);
  assert.deepEqual(searchMessageIds([msg('d','Đến ngày mai')],'den'),['d']);
});
test('tìm kiếm không nhầm tin trống', () => {
  assert.deepEqual(searchMessageIds([msg('1',''),msg('2','hello')],'hello'),['2']);
});
test('dấu trang ổn định dù server thay ID sau khi xác nhận', () => {
  assert.equal(bookmarkKey(msg('local:1','Nội dung')),bookmarkKey(msg('server:100','Nội dung')));
});
test('khóa dấu trang phân biệt chiều và thời điểm tin nhắn', () => {
  assert.notEqual(bookmarkKey(msg('1','hi',true)),bookmarkKey(msg('2','hi',false)));
  assert.notEqual(bookmarkKey(msg('1','hi',true,'10:30')),bookmarkKey(msg('2','hi',true,'10:31')));
});
test('đánh dấu và bỏ đánh dấu không làm thay đổi danh sách ban đầu', () => {
  const list=['a']; const next=toggleMessageBookmark(list,'b');
  assert.deepEqual(next,['a','b']); assert.deepEqual(list,['a']);
  assert.deepEqual(toggleMessageBookmark(next,'b'),['a']);
});
test('dấu trang được lưu riêng từng tài khoản và từng hội thoại', () => {
  saveMessageBookmarks('TuyetMinh','people:TuanAnh',['abc']);
  assert.deepEqual(readMessageBookmarks('TuyetMinh','people:TuanAnh'),['abc']);
  assert.deepEqual(readMessageBookmarks('TuanAnh','people:TuyetMinh'),[]);
  assert.deepEqual(readMessageBookmarks('TuyetMinh','people:Khac'),[]);
});
test('dữ liệu lưu bị hỏng hoặc chứa trường không hợp lệ được loại bỏ', () => {
  const key='lyra:bookmarks:v1:U:people%3AB';
  saved.set(key,JSON.stringify(['abc','abc',123,{},'a'.repeat(100)]));
  assert.deepEqual(readMessageBookmarks('U','people:B'),['abc']);
  saved.set(key,'{broken');assert.deepEqual(readMessageBookmarks('U','people:B'),[]);
});
test('lỗi localStorage không ảnh hưởng đến màn hình chat', () => {
  const prior=globalThis.localStorage;
  globalThis.localStorage={getItem:()=>{throw new Error('not allowed')},setItem:()=>{throw new Error('quota')}};
  assert.deepEqual(readMessageBookmarks('U','C'),[]);
  assert.doesNotThrow(()=>saveMessageBookmarks('U','C',['abc']));
  globalThis.localStorage=prior;
});
test('xuất TXT hiển thị trạng thái tin chưa xác nhận và giới hạn phạm vi', () => {
  const result=exportConversation('TuanAnh',[msg('unverified:1','Chào bạn',true)],'txt',new Date('2026-11-08T13:00:00.000Z'));
  assert.match(result,/chưa xác minh/);
  assert.match(result,/Chỉ bao gồm tin đang tải trong trình duyệt/);
  assert.match(result,/Chào bạn/);
});
test('xuất JSON có metadata, dữ liệu đúng và là JSON hợp lệ', () => {
  const result=JSON.parse(exportConversation('TuanAnh',[msg('100','OK',false)],'json',new Date('2026-11-08T13:00:00.000Z')));
  assert.equal(result.conversation,'TuanAnh');
  assert.equal(result.messages[0].sender,'TuanAnh');
  assert.equal(result.messages[0].content,'OK');
  assert.equal(result.messages.length,1);
});
test('tên file xuất an toàn với ký tự tiếng Việt và dấu gạch', () => {
  assert.equal(safeExportFilename('Nhóm dự án / 2026','txt'),'LyraChat-nhom-du-an-2026.txt');
  assert.equal(safeExportFilename('!*','json'),'LyraChat-hoi-thoai.json');
});

test('chat nhóm dùng username thực tế khi trích dẫn và xuất dữ liệu', () => {
  const groupMessage = {...msg('g','Họp lúc 15h'),replyTo:'Người gửi: TuanAnh'};
  assert.equal(senderLabel(groupMessage,'Nhóm FE'),'TuanAnh');
  assert.equal(senderLabel({...groupMessage,fromMe:true},'Nhóm FE'),'Bạn');
  assert.equal(JSON.parse(exportConversation('Nhóm FE',[groupMessage],'json')).messages[0].sender,'TuanAnh');
});
