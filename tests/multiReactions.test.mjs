import test from 'node:test';
import assert from 'node:assert/strict';
import {applyReactionEvent} from '../src/services/reactionState.ts';
import {makeReaction, parseInteraction} from '../src/services/messageInteractions.ts';

test('một người thả nhiều emoji trên một tin nhắn', () => {
  const state = new Map();
  applyReactionEvent(state, {targetId:'42', senderId:'A', emoji:'❤️', operation:'add'});
  applyReactionEvent(state, {targetId:'42', senderId:'A', emoji:'😂', operation:'add'});
  applyReactionEvent(state, {targetId:'42', senderId:'B', emoji:'👍', operation:'add'});
  assert.deepEqual([...state.get('42').get('a')], ['❤️','😂']);
  assert.deepEqual([...state.get('42').get('b')], ['👍']);
});

test('gỡ một reaction không xóa những reaction khác', () => {
  const state = new Map();
  for (const emoji of ['❤️','😂','👍']) applyReactionEvent(state,{targetId:'1',senderId:'A',emoji,operation:'add'});
  applyReactionEvent(state,{targetId:'1',senderId:'A',emoji:'😂',operation:'remove'});
  assert.deepEqual([...state.get('1').get('a')], ['❤️','👍']);
});

test('reaction cũ vẫn tương thích với định dạng một emoji', () => {
  const state = new Map();
  applyReactionEvent(state,{targetId:'1',senderId:'A',emoji:'❤️',operation:'add'});
  applyReactionEvent(state,{targetId:'1',senderId:'A',emoji:'😂'});
  assert.deepEqual([...state.get('1').get('a')], ['😂']);
});

test('encode/decode thao tác add/remove giữ nguyên nội dung', () => {
  for (const operation of ['add','remove']) {
    assert.deepEqual(parseInteraction(makeReaction('abc','❤️',operation)), {
      kind:'reaction', targetId:'abc', emoji:'❤️', operation,
    });
  }
});
