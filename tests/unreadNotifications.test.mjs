import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyUnreadLedger, getChatUnread, getTotalUnread, getTotalUnreadForChats, markChatRead,
  readUnreadLedger, recordIncomingMessage, reconcileUnreadMessages, saveUnreadLedger,
} from '../src/services/unreadNotifications.ts';

const incoming = (id, chatId = 'Alice', content = 'Chào!', createdAt = '2026-11-16T09:00:00.000Z') => ({
  id, chatId, senderId: chatId, recipientId:'Me', content, createdAt,
});
const sent = (id, chatId = 'Alice') => ({
  id, chatId, senderId: 'Me', recipientId:chatId, content: 'Tôi đã trả lời', createdAt:'2026-11-16T09:01:00Z',
});
const baseline = (messages = [], chats=['Alice']) => reconcileUnreadMessages(
    emptyUnreadLedger(), messages, 'Me', chats, true, null, true,
);

test('Initial historical messages do not create unread notifications', () => {
  const state = baseline([incoming('1'), sent('2')]);
  assert.equal(state.initialized, true);
  assert.equal(getTotalUnread(state), 0);
});
test('New incoming increments exactly once, even after page refresh and repeated history loads', () => {
  const initial = baseline([incoming('1')]);
  const next = reconcileUnreadMessages(initial, [incoming('1'), incoming('3', 'Alice', 'Xin chào lần hai', '2026-11-16T09:02:00Z')], 'Me', ['Alice'], true, null, true);
  assert.equal(getChatUnread(next, 'ALICE'), 1);
  const repeated = reconcileUnreadMessages(next, [incoming('1'), incoming('3', 'Alice', 'Xin chào lần hai', '2026-11-16T09:02:00Z')], 'Me', ['Alice'], true, null, true);
  assert.equal(getTotalUnread(repeated), 1);
});
test('Sending and confirming my own message does not raise a badge', () => {
  const state = baseline([]);
  const first = reconcileUnreadMessages(state, [sent('local:1')], 'me', ['Alice'], true, null, true);
  const confirmed = reconcileUnreadMessages(first, [sent('server:1')], 'me', ['Alice'], true, null, true);
  assert.equal(getTotalUnread(confirmed), 0);
});
test('Opening a chat clears only its unread; subsequent own messages keep the badge at zero', () => {
  const initial = baseline([]);
  const a = recordIncomingMessage(initial, incoming('a'), 'Me', null, false);
  const b = recordIncomingMessage(a, incoming('b', 'Bob'), 'Me', null, false);
  assert.equal(getTotalUnread(b), 2);
  const readAlice = markChatRead(b, 'aLiCe');
  assert.equal(getChatUnread(readAlice, 'Alice'), 0);
  assert.equal(getChatUnread(readAlice, 'Bob'), 1);
  const afterSent = reconcileUnreadMessages(readAlice, [sent('mine')], 'Me', ['Alice', 'Bob'], true, 'Alice', true);
  assert.equal(getTotalUnread(afterSent), 1);
});
test('Open and visible conversation is marked read; hidden browser receives unread until focus', () => {
  let state = baseline([]);
  state = recordIncomingMessage(state, incoming('1'), 'Me', 'Alice', true);
  assert.equal(getTotalUnread(state), 0);
  state = recordIncomingMessage(state, incoming('2', 'Alice', 'second', '2026-11-16T09:04:00Z'), 'Me', 'Alice', false);
  assert.equal(getChatUnread(state, 'Alice'), 1);
  state = markChatRead(state, 'Alice');
  assert.equal(getTotalUnread(state), 0);
});
test('Different conversations and users remain isolated', () => {
  let state = baseline([]);
  state = recordIncomingMessage(state, incoming('1', 'Alice'), 'Me', null, true);
  state = recordIncomingMessage(state, incoming('2', 'Bob'), 'Me', null, true);
  assert.equal(getTotalUnread(state), 2);
  const store = new Map();
  const storage = {getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  saveUnreadLedger('Me', state, storage);
  assert.equal(getTotalUnread(readUnreadLedger('Me', storage)), 2);
  assert.equal(getTotalUnread(readUnreadLedger('AnotherUser', storage)), 0);
});
test('A new chat initial history is baselined rather than counted as unread', () => {
  const initial = baseline([], ['Alice']);
  const next = reconcileUnreadMessages(initial, [incoming('old', 'Bob')], 'Me', ['Alice', 'Bob'], true, null, true);
  assert.equal(getChatUnread(next, 'Bob'), 0);
  const again = reconcileUnreadMessages(next, [incoming('old', 'Bob'), incoming('new', 'Bob', 'new!', '2026-11-16T09:05:00Z')], 'Me', ['Alice', 'Bob'], true, null, true);
  assert.equal(getChatUnread(again, 'Bob'), 1);
});
test('Incoming websocket event before initial history is not lost', () => {
  let state = emptyUnreadLedger();
  state = recordIncomingMessage(state, incoming('new'), 'Me', null, true);
  assert.equal(getChatUnread(state, 'Alice'), 1);
  state = reconcileUnreadMessages(state, [incoming('old', 'Alice', 'old!', '2026-11-16T08:00:00Z'), incoming('new')], 'Me', ['Alice'], true, null, true);
  assert.equal(getChatUnread(state, 'Alice'), 1);
});
test('No false increment when WebSocket ID becomes a server history ID', () => {
  const initial = baseline([]);
  const live = recordIncomingMessage(initial, incoming('live:temporary'), 'Me', null, true);
  const history = reconcileUnreadMessages(live, [{...incoming('server-234'),reconciledLiveId:'live:temporary'}], 'Me', ['Alice'], true, null, true);
  assert.equal(getTotalUnread(history), 1);
});
test('Bad or unavailable localStorage does not crash the app', () => {
  const broken = {getItem() {throw new Error('blocked')},setItem() {throw new Error('blocked')}};
  assert.equal(getTotalUnread(readUnreadLedger('Me', broken)), 0);
  assert.doesNotThrow(() => saveUnreadLedger('Me', emptyUnreadLedger(), broken));
});


test('Sidebar total excludes orphaned chat keys, while preserving unread for accessible chats', () => {
  let ledger = baseline([], ['Alice']);
  ledger = recordIncomingMessage(ledger, incoming('ghost1', 'Removed'), 'Me', null, false);
  ledger = recordIncomingMessage(ledger, incoming('ghost2', 'Removed', '2', '2026-11-16T10:00:00Z'), 'Me', null, false);
  ledger = recordIncomingMessage(ledger, incoming('ghost3', 'Removed', '3', '2026-11-16T11:00:00Z'), 'Me', null, false);
  assert.equal(getTotalUnread(ledger), 3);
  assert.equal(getTotalUnreadForChats(ledger, ['Alice']), 0);
  assert.equal(getTotalUnreadForChats(ledger, ['Removed', 'Alice']), 3);
  assert.equal(getTotalUnreadForChats(ledger, ['Removed', 'removed', 'Alice']), 3);
  assert.equal(getTotalUnreadForChats(markChatRead(ledger, 'Removed'), ['Removed']), 0);
});

test('Sidebar unread total covers group IDs with room: prefix and does not count duplicates', () => {
  let ledger = baseline([]);
  ledger = recordIncomingMessage(ledger, incoming('g1', 'room:Study'), 'Me', null, false);
  ledger = recordIncomingMessage(ledger, incoming('p1', 'Alice'), 'Me', null, false);
  assert.equal(getTotalUnreadForChats(ledger, ['Alice', 'room:Study']), 2);
  assert.equal(getTotalUnreadForChats(ledger, ['room:Study', 'ROOM:STUDY']), 1);
  assert.equal(getTotalUnreadForChats(markChatRead(ledger, 'room:Study'), ['room:Study']), 0);
});
