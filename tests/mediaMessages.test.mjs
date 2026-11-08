import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMediaMessage, parseMediaMessage, messagePreview, isSafeMediaUrl } from '../src/services/mediaMessages.ts';

test('sticker đóng gói vào SEND_CHAT.mes và giải mã được', () => {
  const wire = makeMediaMessage([{kind:'sticker',sticker:'🐱'}]);
  assert.equal(parseMediaMessage(wire)?.items[0].sticker,'🐱');
  assert.equal(messagePreview(wire),'😊 Sticker');
});
test('gửi nhiều ảnh bằng URL và caption, hỗ trợ preview', () => {
  const wire = makeMediaMessage([{kind:'image',url:'https://example.org/a.jpg'},{kind:'image',url:'https://example.org/b.jpg'}],'Hình hôm nay');
  assert.equal(parseMediaMessage(wire)?.items.length,2);
  assert.equal(messagePreview(wire),'📷 Ảnh (2) · Hình hôm nay');
});
test('video và file có thể mở từ HTTP(S) URL', () => {
  for(const kind of ['gif','video','file']) {
    const raw=makeMediaMessage([{kind,url:'https://cdn.example.org/file.mp4',name:'file.mp4'}]);
    assert.equal(parseMediaMessage(raw)?.items[0].kind,kind);
  }
});
test('từ chối javascript URL và file local', () => {
  for (const url of ['javascript:alert(1)','file:///etc/passwd','data:text/html,hello','https://user:pass@example.org/private']) {
    assert.equal(isSafeMediaUrl(url),false);
    assert.throws(()=>makeMediaMessage([{kind:'image',url}]));
  }
});
test('không giải mã JSON không tin cậy', () => {
  assert.equal(parseMediaMessage('hello'),null);
  assert.equal(parseMediaMessage('[[LYRA_MEDIA_V1]]{broken'),null);
  assert.equal(parseMediaMessage('[[LYRA_MEDIA_V1]]{"kind":"media","version":1,"items":[{"kind":"image","url":"javascript:alert(1)"}]}'),null);
});
