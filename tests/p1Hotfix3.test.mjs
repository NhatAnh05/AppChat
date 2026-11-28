import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSendAcknowledgement} from '../src/services/serverMessage.ts';
import {parseUserCheck} from '../src/services/userService.ts';
import reducer,{setFriends,setContactOnline,recordContactIncoming,expireOnlineStatuses,clearContacts} from '../src/features/contacts/contactsSlice.ts';
import {readFileSync} from 'node:fs';

test('Hotfix 3: strict ACK supports explicit chat types but rejects ambiguous type and invalid IDs',()=>{
 const row={name:'a',to:'b',mes:'x',type:0,id:4};
 assert.deepEqual(parseSendAcknowledgement({data:row}),{...row});
 for(const type of [undefined,null,2,'invalid'])assert.equal(parseSendAcknowledgement({...row,type}),null);
 for(const id of ['',{},Infinity])assert.equal(parseSendAcknowledgement({...row,id}),null);
 assert.equal(parseSendAcknowledgement({...row,type:'room'}).type,1);
});
test('Hotfix 3: presence requires boolean and consistent identity, not truthy strings or conflicting wrapper',()=>{
 assert.deepEqual(parseUserCheck({data:{status:true,user:'BOB'}},'bob'),{kind:'value',value:true});
 assert.deepEqual(parseUserCheck({status:false},'bob'),{kind:'value',value:false});
 assert.equal(parseUserCheck({status:false,data:{status:true}},'bob').kind,'invalid');
 assert.equal(parseUserCheck({user:'bob',data:{status:true,username:'other'}},'bob').kind,'other');
 assert.equal(parseUserCheck({status:'false'},'bob').kind,'invalid');
});
test('Hotfix 3: recent realtime activity does not fabricate online and expires independently',()=>{
 let state=reducer(undefined,setFriends([{id:'bob',name:'Bob',initials:'BO',color:'#333'}]));
 state=reducer(state,setContactOnline({id:'bob',online:false,checkedAt:1000}));
 state=reducer(state,recordContactIncoming({id:'BOB',at:2000}));
 assert.equal(state.friends[0].online,false);assert.equal(state.friends[0].recentIncomingAt,2000);
 state=reducer(state,expireOnlineStatuses(181000));assert.equal(state.friends[0].online,undefined);assert.equal(state.friends[0].recentIncomingAt,2000);
 state=reducer(state,expireOnlineStatuses(182000));assert.equal(state.friends[0].recentIncomingAt,undefined);
 assert.equal(reducer(state,clearContacts()).friends.length,0);
});
test('Hotfix 3: message tooltip is confined to metadata and visual wrappers use intrinsic dimensions',()=>{
 const item=readFileSync(new URL('../src/components/MessageItem.tsx',import.meta.url),'utf8');
 const media=readFileSync(new URL('../src/components/MediaAttachment.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(item,/<div id=\{`lyra-message-[^\n]+title=/);assert.match(item,/className="message-meta" title=/);
 assert.match(media,/naturalWidth,e.currentTarget.naturalHeight/);assert.match(media,/videoWidth,e.currentTarget.videoHeight/);
});
test('Hotfix 3: diagnostics can be opened from visible chat header, not just hidden dock',()=>{
 const source=readFileSync(new URL('../src/components/ChatWindow.tsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.match(source,/aria-label="Nhật ký API" onClick=\{onOpenApiLog\}/);assert.match(app,/onOpenApiLog=\{\(\) => \{setApiLogs/);
});
