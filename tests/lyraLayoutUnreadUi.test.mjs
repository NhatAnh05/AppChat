import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('Thông báo chưa đọc không bị giới hạn bởi bộ lọc tìm kiếm', () => {
  const app = source('src/App.tsx');
  assert.match(app, /const unreadChats = useMemo\(\(\) => presentedChats\.filter/);
  assert.match(app, /const filteredChats = useMemo\(\(\) => presentedChats\.filter/);
});
test('Chỉ đánh dấu tin đã đọc khi hội thoại đang hiển thị và tab focus', () => {
  const app = source('src/App.tsx');
  assert.match(app, /const openConversation = \(chat: Chat\) => \{[\s\S]*?document\.visibilityState === 'visible' && document\.hasFocus\(\)/);
  assert.match(app, /markChatRead\(previous, chat\.id\)/);
});
test('Nút thông báo và tạo cuộc trò chuyện không chỉ là nút trang trí', () => {
  const window = source('src/components/ChatWindow.tsx');
  assert.match(window, /className="topbar-icon-button"[\s\S]*?onClick=\{onOpenNotifications\}/);
  assert.match(window, /className="empty-chat-primary" onClick=\{onCompose\}/);
  assert.match(window, /className="chat-circle-btn lyra-bell-button"[\s\S]*?onClick=\{onOpenNotifications\}/);
});
