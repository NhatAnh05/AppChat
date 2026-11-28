import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeMediaMessage,parseMediaMessage,resolveLocalMediaUrl} from '../src/services/mediaMessage.ts';
import {mergeChatHistory,hasLinkedServerHistory} from '../src/services/chatHistoryReconciliation.ts';
import contactsReducer,{setFriends,setContactOnline,expireOnlineStatuses,clearOnlineStatuses} from '../src/features/contacts/contactsSlice.ts';

test('Hotfix 2: legacy generic MP4/JPG/GIF media infer supported visual kind and retain metadata',()=>{
 for(const [ext,kind] of [['mp4','video'],['webm','video'],['mov','video'],['jpg','image'],['png','image'],['gif','gif'],['pdf','file']]){
  const m={kind:'file',url:`https://example.test/api/media/files/scope/file.${ext}?cap=sample`,name:`original.${ext}`,size:2048};
  assert.deepEqual(parseMediaMessage(encodeMediaMessage(m)),{...m,kind});
 }
});
test('Hotfix 2: only capability-bearing local sandbox URLs rebase to a current loopback origin',()=>{
 const path='/api/media/local/files/YWJj/12345678-abcd-1234-9876-1234567890ab.gif?cap='+'a'.repeat(64);
 const old='http://localhost:5173'+path, current='http://127.0.0.1:5174';
 assert.equal(resolveLocalMediaUrl(old,current,true),current+path);
 for(const source of [old.replace('localhost','example.test'),old.split('?')[0],old.replace('/local/','/'),old.replace('http://','https://'),old.replace('localhost','evil@localhost')])assert.equal(resolveLocalMediaUrl(source,current,true),source);
 assert.equal(resolveLocalMediaUrl(old,current,false),old);
 assert.equal(resolveLocalMediaUrl(old,'https://app.example.test',true),old);
});
test('Hotfix 2: banner clears only for the exact linked unconfirmed send without inventing ACK',()=>{
 const base={chatId:'bob',senderId:'alice',recipientId:'bob',content:'hi',createdAt:'2026-11-28T17:00:00Z',type:0};
 const local={...base,id:'local:1',sendStatus:'unconfirmed',knownServerIds:[]};
 const row={...base,id:'101'};
 const linked=mergeChatHistory([local],[row]);
 assert.equal(hasLinkedServerHistory(linked,'bob','local:1'),true);
 assert.equal(linked.find(m=>m.id==='local:1').sendStatus,'unconfirmed');
 assert.equal(hasLinkedServerHistory(linked,'bob','local:2'),false);
 assert.equal(hasLinkedServerHistory(linked,'carol','local:1'),false);
 assert.equal(hasLinkedServerHistory([local,row],'bob','local:1'),false);
 assert.equal(hasLinkedServerHistory(linked.filter(m=>m.id!=='101'),'bob','local:1'),false);
 const known=mergeChatHistory([{...local,knownServerIds:['101']}],[row]);
 assert.equal(hasLinkedServerHistory(known,'bob','local:1'),false);
});
test('Hotfix 2: presence expires to unknown rather than falsely reporting offline',()=>{
 let state=contactsReducer(undefined,setFriends([{id:'bob',name:'Bob',initials:'BO',color:'#333'}]));
 state=contactsReducer(state,setContactOnline({id:'bob',online:false,checkedAt:1000}));
 state=contactsReducer(state,expireOnlineStatuses(180999));assert.equal(state.friends[0].online,false);
 state=contactsReducer(state,expireOnlineStatuses(181000));assert.equal(state.friends[0].online,undefined);
 state=contactsReducer(state,setContactOnline({id:'bob',online:true,checkedAt:200000}));assert.equal(state.friends[0].online,true);
 state=contactsReducer(state,setContactOnline({id:'bob',online:undefined}));assert.equal(state.friends[0].onlineCheckedAt,undefined);
 state=contactsReducer(state,setContactOnline({id:'bob',online:true,checkedAt:300000}));state=contactsReducer(state,clearOnlineStatuses());assert.equal(state.friends[0].online,undefined);
});
