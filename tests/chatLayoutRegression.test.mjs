import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isUserMessage } from '../src/services/messageWorkspace.ts';
import { makeReaction, makeReply } from '../src/services/messageInteractions.ts';

const base = {id:'m1',chatId:'people:Lan',senderId:'Lan',content:'',createdAt:'2026-11-22 22:00:00'};

test('Không tạo bong bóng chat rỗng khi lịch sử trả chuỗi rỗng hoặc chỉ khoảng trắng', () => {
  assert.equal(isUserMessage({...base,content:''}), false);
  assert.equal(isUserMessage({...base,content:'  \n\t  '}), false);
  assert.equal(isUserMessage({...base,content:'Xin chào'}), true);
});

test('Reaction không thành tin nhắn riêng, reply hợp lệ vẫn hiển thị', () => {
  assert.equal(isUserMessage({...base,content:makeReaction('m0','❤️')}), false);
  assert.equal(isUserMessage({...base,content:makeReply('Chào nhé',{id:'m0',sender:'Lan',excerpt:'Hi'})}), true);
  assert.equal(isUserMessage({...base,content:makeReply(' ',{id:'m0',sender:'Lan',excerpt:'Hi'})}), false);
});

test('CSS bảo vệ chiều cao từng hàng và khống chế chiều rộng ảnh', () => {
  const css = readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
  const theme = readFileSync(new URL('../src/App.css',import.meta.url),'utf8');
  assert.match(css,/\.message-list\s*>\s*\.message-row\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
  assert.match(css,/\.message-list\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(theme,/\.chat-media img, \.chat-media video\s*\{[^}]*max-width:\s*100%/s);
});
