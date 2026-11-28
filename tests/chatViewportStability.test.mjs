import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HISTORY_REFRESH_MS, PRESENCE_REFRESH_MS } from '../src/services/chatRefreshPolicy.ts';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Giảm polling: lịch sử không nhanh hơn 60s, online không nhanh hơn 120s', () => {
  assert.ok(HISTORY_REFRESH_MS >= 60_000);
  assert.ok(PRESENCE_REFRESH_MS >= 120_000);
  const windowSource = read('src/components/ChatWindow.tsx');
  const appSource = read('src/App.tsx');
  assert.match(windowSource, /setInterval\(refresh, HISTORY_REFRESH_MS\)/);
  assert.doesNotMatch(windowSource, /addEventListener\('focus', refresh\)/);
  assert.match(appSource, /setInterval\(\(\) => void checkActive\(\), PRESENCE_REFRESH_MS\)/);
  assert.doesNotMatch(appSource, /Check ONE additional contact per cycle/);
});

test('Một MessageList duy nhất và công cụ chỉ hiện trong hộp thoại mở từ header', () => {
  const windowSource = read('src/components/ChatWindow.tsx');
  const listSource = read('src/components/MessageList.tsx');
  const css = read('src/App.css');
  assert.equal((windowSource.match(/<MessageList\s/g) ?? []).length, 1);
  assert.equal((windowSource.match(/className="chat-tools-trigger"/g) ?? []).length, 1);
  assert.equal((listSource.match(/className="lyra-workspace-toolbar"/g) ?? []).length, 0);
  assert.match(listSource, /toolsOpen && createPortal\(<div className=/);
  assert.equal((listSource.match(/className="message-list"/g) ?? []).length, 1);
  assert.match(listSource, /ref=\{listRef\} onScroll=\{handleHistoryScroll\}/);
  assert.doesNotMatch(listSource, /bottomRef\.current\?\.scrollIntoView/);
  assert.match(css, /\.lyra-tools-modal-backdrop\s*\{/);
});

test('Nhật ký API không làm toàn bộ chat rerender khi đóng modal', () => {
  const source = read('src/App.tsx');
  assert.match(source, /apiLogBuffer = useRef<ApiLogEntry\[\]>/);
  assert.match(source, /if \(apiLogOpen\) setApiLogs\(\[\.\.\.apiLogBuffer\.current\]\)/);
  assert.doesNotMatch(source, /onLog\(entry => setApiLogs\(current =>/);
});

test('Danh sách tin nhắn dùng luồng block và không ép paint containment', () => {
  const css = read('src/App.css');
  assert.match(css, /\.lyra-conversation-content\s*>\s*\.message-list\s*\{[^}]*display:\s*block\s*;/s);
  assert.match(css, /\.lyra-conversation-content\s*>\s*\.message-list\s*\{[^}]*contain:\s*none\s*;/s);
  assert.match(css, /\.lyra-conversation-content\s+\.lyra-history-content\s*>\s*\.message-row\s*\{[^}]*height:\s*auto\s*;/s);
});
