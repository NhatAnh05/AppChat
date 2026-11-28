import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeChatContent, decodeChatContent } from '../src/services/chatContentCodec.ts';
import { encodeMediaCollection, encodeMediaMessage, parseMediaCollection, mediaMessagePreview } from '../src/services/mediaMessage.ts';
import { collectLoadedMedia, forwardContent, copySelectedMessages } from '../src/services/messageWorkspace.ts';
import { makeReaction, makeReply } from '../src/services/messageInteractions.ts';
import { emptyUnreadLedger, reconcileUnreadMessages, recordIncomingMessage, getTotalUnread } from '../src/services/unreadNotifications.ts';
import { parseChatBackup, mergeChatBackup } from '../src/services/chatBackup.ts';
import { mergeChatHistory } from '../src/services/chatHistoryReconciliation.ts';
import { parseUserList } from '../src/services/contactService.ts';
import { readDraft, saveDraft } from '../src/services/conversationStorage.ts';
import { mediaMime } from '../src/services/mediaUpload.ts';
import { makeRoomMessageRequest } from '../src/services/roomChatProtocol.ts';
const msg=(id,content='hello',createdAt='2026-01-02T10:00:00Z')=>({id,chatId:'Bob',senderId:'Bob',recipientId:'Alice',type:0,content,createdAt});
const sample=[{kind:'image',url:'https://files.example/a.png',name:'Ảnh gốc.png',size:100},{kind:'video',url:'https://files.example/b.mp4',name:'Video.mp4',size:500}];

test('P2.06/P2.15: shared album parser retains names, sizes and all items, including reply media',()=>{
 const content=encodeMediaCollection(sample);assert.deepEqual(parseMediaCollection(content).items,sample);
 assert.equal(collectLoadedMedia([msg('1',makeReply(content,{id:'2',sender:'Bob',excerpt:'test'}))]).length,2);
 assert.equal(mediaMessagePreview(content),'2 tệp đa phương tiện');
 assert.deepEqual(parseMediaCollection(encodeMediaMessage(sample[0])).items,[sample[0]]);
 assert.equal(forwardContent(msg('1',content)),content);
 assert.match(copySelectedMessages([msg('1',content)],'Alice'),/Ảnh gốc.png/);
});
test('P2 media: reject unsafe album items and do not forward scoped capabilities',()=>{
 assert.throws(()=>encodeMediaCollection([{kind:'file',url:'javascript:alert(1)',name:'bad'}]));
 const scoped=encodeMediaMessage({kind:'file',url:'https://example.test/api/media/local/files/a/id.pdf?cap=secret',name:'a.pdf'});
 assert.equal(forwardContent(msg('1',scoped)),null);
 assert.doesNotMatch(copySelectedMessages([msg('1',scoped)],'Alice'),/cap=secret/);
 assert.equal(parseMediaCollection('https://example.test/help'),null);
});
test('P2.05: audio media uses normalized recorder MIME and preserves recording metadata',()=>{
 assert.equal(mediaMime({type:'audio/webm;codecs=opus',name:'record.weba'}),'audio/webm');
 assert.equal(mediaMime({type:'',name:'record.m4a'}),'audio/mp4');
 const recording={kind:'audio',url:'https://example.test/record.weba',name:'Ghi âm.weba',size:999};
 assert.deepEqual(parseMediaCollection(encodeMediaMessage(recording)).items,[recording]);
 assert.match(mediaMessagePreview(encodeMediaMessage(recording)),/Ghi âm/);
});
test('P2.10: reserved literal emoji tokens and mixed Unicode survive roundtrip; old encoded history remains readable',()=>{
 for(const text of ['LYE1f600X','LYE1f600X 😀','LYRAU8_aGVsbG8','LYRA_TEXT_V2:eA','Tiếng Việt 𠮷','Xin chào 👍🏽'])assert.equal(decodeChatContent(encodeChatContent(text)),text);
 assert.equal(decodeChatContent('LYE1f600X'),'😀');
 assert.throws(()=>makeRoomMessageRequest('team','😀'.repeat(2000)),/10000/);
});
test('P2.11/P2.13: reactions, imported copies and older pages never create unread badges',()=>{
 let ledger=reconcileUnreadMessages(emptyUnreadLedger(),[msg('100')],'Alice',['Bob'],true,null,false);
 ledger=recordIncomingMessage(ledger,msg('101',makeReaction('100','👍')),'Alice',null,false);
 ledger=reconcileUnreadMessages(ledger,[msg('100'),{...msg('old','old','2025-01-01T00:00:00Z'),historyPage:2},msg('unverified:backup:a')],'Alice',['Bob'],true,null,false);
 assert.equal(getTotalUnread(ledger),0);
});
test('P2.12: two stable server IDs with equal body/time count twice, paired realtime history does not count again',()=>{
 let ledger=reconcileUnreadMessages(emptyUnreadLedger(),[],'Alice',['Bob'],true,null,false);
 ledger=recordIncomingMessage(ledger,msg('live:abc'),'Alice',null,false);
 ledger=reconcileUnreadMessages(ledger,[{...msg('1'),reconciledLiveId:'live:abc'},msg('2')],'Alice',['Bob'],true,null,false);
 assert.equal(getTotalUnread(ledger),2);
 ledger=reconcileUnreadMessages(ledger,[{...msg('1'),reconciledLiveId:'live:abc'},msg('2')],'Alice',['Bob'],true,null,false);
 assert.equal(getTotalUnread(ledger),2);
});
test('P2.18: backup import strips fake ACK, ignores foreign rooms and reactions, and yields to server ID',()=>{
 const text=JSON.stringify({format:'lyrachat-local-history-v1',userId:'Alice',messages:[{...msg('1'),sendStatus:'confirmed',knownServerIds:['x']}, {...msg('2'),chatId:'room:forbidden'},msg('3',makeReaction('1','👍'))]});
 const result=parseChatBackup(text,'Alice',['Bob']);assert.equal(result.length,1);assert.equal(result[0].id,'unverified:backup:1');assert.equal(result[0].sendStatus,undefined);assert.equal(result[0].knownServerIds,undefined);
 assert.equal(mergeChatBackup(result,result).length,1);assert.equal(mergeChatHistory(result,[msg('1')]).length,1);
 assert.equal(mergeChatHistory(result,[msg('1')])[0].id,'1');
 assert.throws(()=>parseChatBackup(text,'Other',['Bob']),/tài khoản/);
});
test('P2.17/P2.20: contact snapshot deduplicates casing, preserves server spelling and newest actionTime',()=>{
 assert.deepEqual(parseUserList([{name:'Bob',type:0,actionTime:'2026-01-01T00:00:00Z'},{name:'BOB',type:0,actionTime:'2026-02-01T00:00:00Z'},{name:'Bob',type:1,actionTime:''}]),[{name:'Bob',type:0,actionTime:'2026-02-01T00:00:00Z'},{name:'Bob',type:1,actionTime:''}]);
});
test('P2.19: old encoded reply drafts show text, new literal drafts are not reinterpreted',()=>{
 const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const reply=makeReply('Xin chào',{id:'1',sender:'Bob',excerpt:'Hi'});store.set('lyra:draft:v1:Alice:Bob',reply);
 assert.equal(readDraft('Alice','Bob'),'Xin chào');saveDraft('Alice','Bob',reply);assert.equal(readDraft('Alice','Bob'),reply);saveDraft('Alice','Bob','');assert.equal(readDraft('Alice','Bob'),'');
});
