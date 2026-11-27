import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoomRequest,makeRoomHistoryRequest,makeRoomMessageRequest,parseJoinRoomResponse,parseLeaveRoomResponse,parseRoomHistoryResponse,parseRoomSendResponse,mapRoomMessage,roomChatId} from '../src/services/roomChatProtocol.ts';
const member={id:1,name:'long'};
const msg={id:101,name:'long',to:'ABC',mes:'Hello room',createAt:'2026-11-02 10:00:00',type:1};
const room={name:'ABC',user:[member],chatMess:[msg]};
test('JOIN_ROOM request matches Excel exactly',()=>assert.deepEqual(makeRoomRequest('JOIN_ROOM',' ABC '),{action:'onchat',data:{event:'JOIN_ROOM',data:{name:'ABC'}}}));
test('OUT_ROOM request matches Excel exactly',()=>assert.deepEqual(makeRoomRequest('OUT_ROOM','ABC'),{action:'onchat',data:{event:'OUT_ROOM',data:{name:'ABC'}}}));
test('CHAT_PEOPLE_GET_MES room request page 1 matches API row 11',()=>assert.deepEqual(makeRoomHistoryRequest('ABC',1),{action:'onchat',data:{event:'CHAT_PEOPLE_GET_MES',data:{name:'ABC',page:1}}}));
test('SEND_CHAT room request matches Excel',()=>assert.deepEqual(makeRoomMessageRequest('ABC',' Hello mọi người '),{action:'onchat',data:{event:'SEND_CHAT',data:{type:'room',to:'ABC',mes:'Hello mọi người'}}}));
test('Client refuses blank group message and invalid page',()=>{assert.throws(()=>makeRoomMessageRequest('ABC','  '));assert.throws(()=>makeRoomHistoryRequest('ABC',0));});
test('JOIN_ROOM parses success and missing room error',()=>{assert.deepEqual(parseJoinRoomResponse({event:'JOIN_ROOM',status:'success',data:room}),{status:'success',room});assert.deepEqual(parseJoinRoomResponse({event:'JOIN_ROOM',status:'error',mes:'Room not found'}),{status:'error',message:'Room not found'});});
test('OUT_ROOM parses success, owner error',()=>{assert.deepEqual(parseLeaveRoomResponse({event:'OUT_ROOM',status:'success',data:{mes:'You left the room successfully!'}}),{status:'success'}); assert.match(parseLeaveRoomResponse({event:'OUT_ROOM',status:'error',mes:'room owner'}).message,/owner/);});
test('History validates user members, page data and room id',()=>{const res=parseRoomHistoryResponse({event:'CHAT_PEOPLE_GET_MES',status:'success',data:room},'ABC');assert.equal(res.status,'success');assert.equal(res.messages.length,1);assert.equal(res.messages[0].id,'101'); assert.equal(res.messages[0].content,'Hello room'); assert.equal(parseRoomHistoryResponse({event:'CHAT_PEOPLE_GET_MES',status:'success',data:room},'OTHER').status,'error');});
test('History returns explicit backend errors',()=>assert.match(parseRoomHistoryResponse({event:'GET_ROOM_CHAT_MES',status:'error',mes:'You not in room'},'ABC').message,/not in room/));
test('Group broadcast is not mistaken for people chat',()=>{ assert.equal(mapRoomMessage({...msg,type:0},'ABC'),null); assert.equal(mapRoomMessage({...msg,to:'DIFFERENT'},'ABC'),null);assert.equal(mapRoomMessage(msg,'ABC').type,1); });
test('Room send accepts matching broadcast only, not unrelated packets',()=>{const packet={event:'SEND_CHAT',status:'success',data:{name:'long',to:'ABC',mes:'Hello room',type:1}};assert.equal(parseRoomSendResponse(packet,'ABC','Hello room').status,'success');assert.equal(parseRoomSendResponse(packet,'ABC','Another'),null);assert.equal(parseRoomSendResponse({...packet,data:{...packet.data,type:0}},'ABC','Hello room'),null);});
test('Malformed data and unrelated events cannot spoof confirmations',()=>{assert.equal(parseJoinRoomResponse({event:'LOGIN',status:'success'}),null);assert.equal(parseRoomHistoryResponse('garbage','ABC'),null);assert.equal(parseRoomSendResponse({event:'SEND_CHAT',status:'success',data:{}},'ABC','Hello room'),null);});

test('Group local message key is namespaced without changing server room name',()=>{
  assert.equal(roomChatId('ABC'),'room:ABC');
  assert.equal(mapRoomMessage(msg,'ABC').chatId,'room:ABC');
  assert.equal(makeRoomMessageRequest('ABC','hello').data.data.to,'ABC');
});
