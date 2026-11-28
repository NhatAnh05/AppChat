import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeMediaMessage,parseMediaMessage,mediaMessagePreview} from '../src/services/mediaMessage.ts';
import {makeMediaMessage} from '../src/services/mediaMessages.ts';

// Two siblings sharing a key can leave stale mounted scroll views in React.
// Keep separate semantic prefixes even when both remount for the same chat.
test('UI: history and composer use distinct React sibling keys', () => {
  const source=readFileSync(new URL('../src/components/ChatWindow.tsx',import.meta.url),'utf8');
  const history=source.match(/<MessageList\s+key=\{(`[^`]+`)\}/)?.[1];
  const composer=source.match(/<MessageInput\s+key=\{(`[^`]+`)\}/)?.[1];
  assert.equal(history,'`history:${currentUserId}:${chat.id}`');
  assert.equal(composer,'`composer:${currentUserId}:${chat.id}`');
  assert.notEqual(history,composer);
});

test('UI: previously attached GIF files render as GIF without losing name, URL or size', () => {
  const media={kind:'file',url:'https://example.com/api/media/files/scope/test.GIF?cap=sample',name:'Despicable Me.gif',size:1400000};
  const content=encodeMediaMessage(media);
  assert.deepEqual(parseMediaMessage(content),{...media,kind:'gif'});
  assert.equal(mediaMessagePreview(content),'🎞️ GIF');
});

test('UI: sidebar supports both current and legacy media envelope formats', () => {
  const current=encodeMediaMessage({kind:'file',url:'https://example.com/file.pdf',name:'Tài liệu.pdf',size:1024});
  assert.equal(mediaMessagePreview(current),'📎 Tệp đính kèm');
  const legacy=makeMediaMessage([{kind:'image',url:'https://example.com/picture.png'}]);
  assert.equal(mediaMessagePreview(legacy),'📷 Ảnh');
  assert.equal(mediaMessagePreview('Xin chào'),'Xin chào');
  assert.equal(mediaMessagePreview('[[LYRA_MEDIA_V1]]invalid'),'[Tệp đính kèm không hợp lệ]');
});
