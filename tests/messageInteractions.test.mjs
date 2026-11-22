import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReaction, makeReply, parseInteraction, visibleMessageContent } from '../src/services/messageInteractions.ts';

test('reaction encode/decode on the existing text SEND_CHAT transport', () => {
  const encoded = makeReaction('123', '❤️');
  assert.match(encoded, /^LYRA_INTERACT_V1:/);
  assert.deepEqual(parseInteraction(encoded), {kind:'reaction', targetId:'123', emoji:'❤️'});
  assert.deepEqual(parseInteraction(makeReaction('123','')), {kind:'reaction', targetId:'123', emoji:''});
});
test('reply roundtrip Vietnamese / emoji and quoted message', () => {
  const encoded = makeReply('Xin chào 😊', {id:'42', sender:'TuyetMinh', excerpt:'Chào bạn 🌸'});
  assert.deepEqual(parseInteraction(encoded), {kind:'reply', text:'Xin chào 😊', reply:{id:'42', sender:'TuyetMinh', excerpt:'Chào bạn 🌸'}});
  assert.equal(visibleMessageContent(encoded), 'Xin chào 😊');
});
test('normal and corrupted messages remain plain', () => {
  assert.equal(parseInteraction('Hello'), null);
  assert.equal(parseInteraction('LYRA_INTERACT_V1:@@'), null);
  assert.equal(visibleMessageContent('Hello'), 'Hello');
});
