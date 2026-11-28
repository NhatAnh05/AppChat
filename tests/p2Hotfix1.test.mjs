import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoomHistoryResponse,parseJoinRoomResponse} from '../src/services/roomChatProtocol.ts';
import {historyResponseMatches} from '../src/services/chatHistoryTransport.ts';
import {albumRows} from '../src/services/albumLayout.ts';
import {makeMediaMessage,messagePreview} from '../src/services/mediaMessages.ts';
import {readFileSync} from 'node:fs';
const name='Ăn Uống';
const row={id:42,name:'alice',to:name,type:1,mes:'Xin chào',createAt:'2026-11-29 10:00:00'};
const frame=data=>({event:'GET_ROOM_CHAT_MES',status:'success',data});
test('P2 hotfix: valid named group history survives missing or malformed member metadata without inventing a roster',()=>{
 for(const user of [undefined,null,{},[{name:'alice'}],[{id:'bad',name:'alice'}]]) {
  const result=parseRoomHistoryResponse(frame({name,user,chatMess:[row]}),name);
  assert.equal(result.status,'success');assert.equal(result.messages[0].id,'42');assert.equal(result.room.user,undefined);assert.match(result.membersError,/data.user/);
 }
 assert.equal(parseJoinRoomResponse({...frame({name,chatMess:[]}),event:'JOIN_ROOM'}).status,'error');
});
test('P2 hotfix: valid roster including an explicitly empty roster is distinct from unavailable roster',()=>{
 for(const user of [[],[{id:'1',name:'alice'}]]) {
  const result=parseRoomHistoryResponse(frame({name,user,chatMess:[row]}),name);
  assert.equal(result.status,'success');assert.deepEqual(result.room.user,user.map(m=>({...m,id:Number(m.id)})));assert.equal(result.membersError,undefined);
 }
});
test('P2 hotfix: room name, chatMess and record scope errors remain distinct; malformed history is never imported',()=>{
 const cases=[[{name:'Other',chatMess:[row]},'room-history-name'],[{name,chatMess:null},'room-history-rows'],[{name,chatMess:[{...row,to:'Other'}]},'room-history-row-scope'],[{name,chatMess:[{...row,id:'local:fake'}]},'room-history-row-invalid']];
 for(const [data,code] of cases){const result=parseRoomHistoryResponse(frame(data),name);assert.equal(result.status,'error');assert.equal(result.diagnostic,code);assert.equal(result.messages,undefined);}
 assert.equal(historyResponseMatches(frame({name:'Other',chatMess:[]}), 'room', name),false);
 assert.equal(historyResponseMatches(frame({name,chatMess:[row]}),'room',name),true);
 assert.equal(parseRoomHistoryResponse(frame({data:{name,user:[],chatMess:[row]}}),name).messages.length,1);
});
test('P2 hotfix: 1–20 visual items fill adaptive rows without losing or reordering attachments',()=>{
 assert.deepEqual(albumRows(['image','gif','image','gif','image']).map(r=>r.length),[2,3]);
 assert.deepEqual(albumRows(['image','image','image','image']).map(r=>r.length),[2,2]);
 for(let n=1;n<=20;n++){const rows=albumRows(Array(n).fill('image'));assert.deepEqual(rows.flat(),Array.from({length:n},(_,i)=>i));assert.ok(rows.every(r=>r.length>=1&&r.length<=3));if(n>1)assert.ok(rows.every(r=>r.length>=2));}
 assert.deepEqual(albumRows(['image','gif','video','file','image','audio']),[[0,1],[2],[3],[4],[5]]);
});
test('P2 hotfix: sidebar summarizes album counts and preserves captions',()=>{
 const image={kind:'image',url:'https://example.test/a.png'},gif={kind:'gif',url:'https://example.test/a.gif'},file={kind:'file',url:'https://example.test/a.pdf'};
 assert.equal(messagePreview(makeMediaMessage(Array(5).fill(image))),'5 hình ảnh');
 assert.equal(messagePreview(makeMediaMessage([image,gif],'Chú thích')),'2 ảnh và GIF: Chú thích');
 assert.equal(messagePreview(makeMediaMessage([file,file])),'2 tệp đính kèm');
 assert.equal(messagePreview(makeMediaMessage([image,file])),'2 tệp đa phương tiện');
});
test('P2 hotfix: member count requires known successful metadata and toolbar is nested in bubble anchor',()=>{
 const chat=readFileSync(new URL('../src/components/ChatWindow.tsx',import.meta.url),'utf8');
 const item=readFileSync(new URL('../src/components/MessageItem.tsx',import.meta.url),'utf8');
 assert.match(chat,/membersKnown && !membersLoading && !membersError/);assert.match(chat,/Chưa xác định số thành viên/);
 assert.match(item,/lyra-bubble-anchor[\s\S]+message-bubble[\s\S]+lyra-message-actions[\s\S]+lyra-message-status/);
});
