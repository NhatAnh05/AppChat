import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceRms,voiceSignalWarning} from '../src/services/voiceSignal.ts';
import {normalizeRoomHistoryRows,roomHistoryRowsShape,parseRoomHistoryResponse} from '../src/services/roomChatProtocol.ts';
import {readFileSync} from 'node:fs';
const name='Ăn Uống';
const row={id:42,name:'alice',to:name,type:1,mes:'Xin chào',createAt:'2026-11-29 10:00:00'};
const frame=chatMess=>({event:'GET_ROOM_CHAT_MES',status:'success',data:{name,user:[],chatMess}});
test('P2 HF2: RMS recognizes silence, low input and real signal without claiming unavailable meter is silent',()=>{
 assert.equal(voiceRms(new Float32Array(2048)),0);
 assert.match(voiceSignalWarning(10,0),/im lặng/);
 assert.match(voiceSignalWarning(0,0),/Chưa kiểm tra/);
 const tone=Float32Array.from({length:2048},(_,i)=>.2*Math.sin(i*.1));
 assert.ok(voiceRms(tone)>.1);assert.equal(voiceSignalWarning(10,voiceRms(tone)),'');
});
test('P2 HF2: explicit serialized or data-wrapped history arrays keep validation and stable IDs',()=>{
 for(const value of [[row],JSON.stringify([row]),{data:[row]}])assert.equal(parseRoomHistoryResponse(frame(value),name).messages[0].id,'42');
 for(const value of [null,undefined,{},'null','{}','invalid',{data:[],other:true},42]){assert.equal(normalizeRoomHistoryRows(value),null);assert.equal(parseRoomHistoryResponse(frame(value),name).status,'error');}
 assert.equal(parseRoomHistoryResponse(frame(JSON.stringify([{...row,to:'other'}])),name).diagnostic,'room-history-row-scope');
 assert.equal(roomHistoryRowsShape(null),'room-history-rows-null');assert.equal(roomHistoryRowsShape(undefined),'room-history-rows-missing');assert.equal(roomHistoryRowsShape({}),'room-history-rows-object');
});
test('P2 HF2: preview uses a local object URL and cleans it; normal images open dialog rather than new tab',()=>{
 const preview=readFileSync(new URL('../src/components/VoicePreview.tsx',import.meta.url),'utf8');
 const attachment=readFileSync(new URL('../src/components/MediaAttachment.tsx',import.meta.url),'utf8');
 const viewer=readFileSync(new URL('../src/components/MediaViewer.tsx',import.meta.url),'utf8');
 assert.match(preview,/createObjectURL/);assert.match(preview,/revokeObjectURL/);assert.match(attachment,/lyra-viewer-trigger/);assert.match(viewer,/showModal\(\)/);assert.match(viewer,/ArrowLeft/);assert.match(viewer,/no-referrer/);
});
