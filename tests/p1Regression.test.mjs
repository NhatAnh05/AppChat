import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeChatHistory } from '../src/services/chatHistoryReconciliation.ts';
import { GroupRealtimeBuffer } from '../src/services/groupRealtimeBuffer.ts';
import { reconnectHistoryPlan } from '../src/services/reconnectHistoryPlan.ts';
import { historyEventCandidates, requestChatHistory, resetHistoryCompatibility } from '../src/services/chatHistoryTransport.ts';
import { UnconfirmedSendError } from '../src/services/requestCorrelation.ts';
import { sendRoomMessage, getRoomHistory, leaveRoom } from '../src/services/roomChatService.ts';
import { peopleChatService } from '../src/services/peopleChatService.ts';
import { userService } from '../src/services/userService.ts';
import { loginAccount, disconnectLoginSession } from '../src/services/loginService.ts';
const storage=new Map();
globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
class Socket {
 static OPEN=1;static CONNECTING=0;static instances=[];
 readyState=0;sent=[];onopen=null;onclose=null;onmessage=null;onerror=null;
 constructor(){Socket.instances.push(this)}
 open(){this.readyState=1;this.onopen?.({})}
 close(){this.readyState=3;this.onclose?.({})}
 send(raw){assert.equal(this.readyState,1);this.sent.push(JSON.parse(raw))}
 receive(frame){this.onmessage?.({data:JSON.stringify(frame)})}
}
globalThis.WebSocket=Socket;
const tick=()=>new Promise(r=>setTimeout(r,0));
const event=s=>s.sent.at(-1)?.data.event;
async function login(){disconnectLoginSession();const p=loginAccount({username:'alice',password:'test'});const s=Socket.instances.at(-1);s.open();s.receive({event:'LOGIN',status:'success',data:{RE_LOGIN_CODE:'token'}});await p;return s;}
async function recover(old){await tick();const s=Socket.instances.at(-1);assert.notEqual(s,old);s.open();assert.equal(event(s),'RE_LOGIN');s.receive({event:'RE_LOGIN',status:'success',data:{RE_LOGIN_CODE:'new-code'}});await tick();return s;}
const row=(id,name='bob',to='alice',mes='hello',type=0)=>({id,name,to,mes,type,createAt:'2026-11-28 17:00:00'});
const history=(data,event='GET_PEOPLE_CHAT_MES')=>({event,status:'success',data});
const ack=data=>({event:'SEND_CHAT',status:'success',data});
const msg=(id,extra={})=>({id,chatId:'bob',senderId:'bob',recipientId:'alice',content:'hello',createdAt:'2026-11-28T17:00:00.000Z',type:0,...extra});
test('P1.01: personal live and group live reconcile to one authoritative ID',()=>{
 for(const type of [0,1]){const extra={type,chatId:type?'room:Team':'bob',recipientId:type?'Team':'alice'};const live=msg('live:1',extra);const saved=msg('10',extra);assert.deepEqual(mergeChatHistory([live],[saved]),[{...saved,reconciledLiveId:live.id}]);}
});
test('P1.01: two equal realtime messages matched one-to-one to two distinct server IDs',()=>{
 const merged=mergeChatHistory([msg('live:1'),msg('live:2')],[msg('1'),msg('2')]);assert.deepEqual(merged.map(m=>m.id),['1','2']);
});
test('P1.02: refreshing page one preserves older pages and deduplicates stable IDs',()=>{
 const previous=Array.from({length:150},(_,i)=>msg(String(i+1)));const next=Array.from({length:50},(_,i)=>msg(String(i+106)));
 const merged=mergeChatHistory(previous,next);assert.equal(merged.length,155);assert.equal(new Set(merged.map(m=>m.id)).size,155);assert.ok(merged.some(m=>m.id==='1'));
});
test('P1.01/P0.03: old matching rows never confirm unacknowledged sends; different server IDs remain distinct',()=>{
 const pending=msg('local:x',{sendStatus:'unconfirmed',senderId:'alice',recipientId:'bob'});
 const server=msg('1',{senderId:'alice',recipientId:'bob'});
 const merged=mergeChatHistory([pending],[server,{...server,id:'2'}]);assert.equal(merged.length,3);assert.equal(merged.find(m=>m.id==='local:x').sendStatus,'unconfirmed');assert.equal(merged.find(m=>m.id==='1').sendStatus,undefined);
 const live=msg('live:new',{createdAt:'2026-11-28T17:01:00Z'});assert.equal(mergeChatHistory([msg('3'),live],[msg('3')]).length,2);
});
test('P1.03: production priority retained and literal Excel profile supported for both histories',()=>{
 resetHistoryCompatibility();assert.deepEqual(historyEventCandidates('people',false),['GET_PEOPLE_CHAT_MES','CHAT_PEOPLE_GET_MES']);assert.deepEqual(historyEventCandidates('room',false),['GET_ROOM_CHAT_MES','CHAT_PEOPLE_GET_MES']);
 assert.deepEqual(historyEventCandidates('people',true),['CHAT_PEOPLE_GET_MES','GET_PEOPLE_CHAT_MES']);assert.deepEqual(historyEventCandidates('room',true),['CHAT_PEOPLE_GET_MES','GET_ROOM_CHAT_MES']);
});
test('P1.04: history from a different account or peer cannot fulfill the outstanding request',async()=>{
 const s=await login();try{const p=peopleChatService.getHistory('bob');let resolved=false;void p.then(()=>{resolved=true;});await tick();s.receive(history([row(1,'mallory','alice')]));s.receive(history([row(2,'bob','mallory')]));s.receive(history([row(3,'bob','alice','hello',1)]));await tick();assert.equal(resolved,false);s.receive(history([row(4,'BOB','Alice')]));assert.equal((await p)[0].id,'4');}finally{disconnectLoginSession();}
});
test('P1.04: a timed-out history channel is replaced before another request; late empty reply cannot match',async()=>{
 const old=await login();try{await assert.rejects(requestChatHistory('bob',1,'people',8),/chưa phản hồi/);const p=requestChatHistory('carol',1,'people',1000);const fresh=await recover(old);assert.equal(event(fresh),'GET_PEOPLE_CHAT_MES');old.receive(history([]));fresh.receive(history([row(5,'carol','alice')]));assert.equal((await p).data[0].id,5);assert.equal(old.sent.filter(f=>f.data.event==='GET_PEOPLE_CHAT_MES').length,1);}finally{disconnectLoginSession();}
});
test('P1.06: same-room identical message from another sender and replayed server ID do not confirm group send',async()=>{
 const s=await login();try{const p=sendRoomMessage('Team','hello',{timeoutMs:1000,knownMessageIds:['1']});let done=false;void p.then(()=>{done=true;});await tick();s.receive(ack(row(2,'bob','Team','hello',1)));s.receive(ack(row(1,'alice','Team','hello',1)));await tick();assert.equal(done,false);s.receive(ack(row(3,'Alice','Team','hello',1)));const result=await p;assert.equal(result.id,'3');assert.equal(result.sendStatus,'confirmed');}finally{disconnectLoginSession();}
});
test('P1.05: group timeout is unconfirmed, not retried; next people send uses fresh socket',async()=>{
 const old=await login();try{await assert.rejects(sendRoomMessage('Team','hello',{timeoutMs:8}),UnconfirmedSendError);const next=peopleChatService.sendMessage('alice','bob','new');const fresh=await recover(old);assert.equal(event(fresh),'SEND_CHAT');old.receive(ack(row(7,'alice','Team','hello',1)));fresh.receive(ack(row(8,'alice','bob','new')));assert.equal((await next).id,'8');assert.equal(old.sent.filter(f=>f.data.event==='SEND_CHAT').length,1);}finally{disconnectLoginSession();}
});
test('P1.07: unknown rooms buffered only until confirmed membership; duplicate ID and expired entries dropped',()=>{
 const b=new GroupRealtimeBuffer(3,100);const make=(id,to)=>({id,name:'bob',to,mes:'hello',type:1});b.push(make('0','Team'),0);b.push(make('1','Team'),80);b.push(make('1','team'),81);b.push(make('2','Secret'),82);assert.deepEqual(b.drain(['TEAM'],150).map(x=>x.message.id),['1']);assert.equal(b.drain(['Secret'],150).length,0);b.push(make('3','Team'),200);b.discard('team');assert.equal(b.drain(['Team'],200).length,0);
});
test('P1.08: online response with mismatched identity is ignored; valid boolean accepted',async()=>{
 const s=await login();try{const p=userService.checkUserOnline('bob');let done=false;void p.then(()=>{done=true;});await tick();s.receive({event:'CHECK_USER_ONLINE',status:'success',data:{user:'carol',status:true}});await tick();assert.equal(done,false);s.receive({event:'CHECK_USER_ONLINE',status:'success',data:{status:false}});assert.equal(await p,false);}finally{disconnectLoginSession();}
});
test('P1.10: reconnect plan prioritizes active chat, cached chats and changed actionTime, skips untouched chats',()=>{
 const items=[{name:'Bob',type:0,actionTime:'new'},{name:'Team',type:1,actionTime:'old'},{name:'Carol',type:0,actionTime:'old'},{name:'Dan',type:0,actionTime:'new'}];const before=new Map([['0:bob','old'],['1:team','old'],['0:carol','old'],['0:dan','old']]);const active={id:'Dan',name:'Dan',kind:'people'};
 assert.deepEqual(reconnectHistoryPlan(items,before,['bob','room:Team'],active).map(x=>x.chatId),['Dan','bob','room:Team']);assert.deepEqual(reconnectHistoryPlan(items,null,[],null),[]);
});
test('P1.11: pending and failed sends preserved without manufacturing ACK',()=>{
 const pending=msg('local:1',{sendStatus:'pending'}),failed=msg('local:2',{sendStatus:'failed'});const merged=mergeChatHistory([pending,failed],[msg('1')]);assert.equal(merged.length,3);assert.equal(merged.find(m=>m.id==='local:1').sendStatus,'pending');assert.equal(merged.find(m=>m.id==='local:2').sendStatus,'failed');
});
test('P1.12: OUT_ROOM ACK cancels outstanding group history, late frames cannot resolve it',async()=>{
 const s=await login();try{const p=getRoomHistory('Team',1,{timeoutMs:1000});const rejected=assert.rejects(p,/hủy/);await tick();const leaving=leaveRoom('Team');await tick();s.receive({event:'OUT_ROOM',status:'success',data:{name:'Team',mes:'left'}});await leaving;await rejected;s.receive(history({name:'Team',user:[{id:1,name:'alice'}],chatMess:[]},'GET_ROOM_CHAT_MES'));}finally{disconnectLoginSession();}
});
test('P1.02/P1.12 Redux: page retention and group history cannot reappear after leaving',async t=>{
 try{await import('@reduxjs/toolkit')}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'){t.skip('Requires npm ci (@reduxjs/toolkit not installed)');return;}throw error;}
 const {rootReducer}=await import('../src/store/store.ts');const {setCredentials}=await import('../src/features/auth/authSlice.ts');const {setGroups,removeGroup}=await import('../src/features/contacts/contactsSlice.ts');const {fetchPeopleChatHistory,fetchRoomChatHistory,addMessage}=await import('../src/features/messages/messagesSlice.ts');
 let state=rootReducer(undefined,setCredentials({userId:'alice'}));
 const people={username:'bob',chatId:'bob',page:2};state=rootReducer(state,fetchPeopleChatHistory.pending('p2',people));state=rootReducer(state,fetchPeopleChatHistory.fulfilled({chatId:'bob',page:2,messages:[msg('old')]},'p2',people));const page1={...people,page:1};state=rootReducer(state,fetchPeopleChatHistory.pending('p1',page1));state=rootReducer(state,fetchPeopleChatHistory.fulfilled({chatId:'bob',page:1,messages:[msg('new')]},'p1',page1));assert.deepEqual(state.messages.messages.map(m=>m.id),['old','new']);assert.deepEqual(state.messages.historyByChat.bob.loadedPages,[1,2]);
 const room={username:'Team',chatId:'room:Team',page:1};state=rootReducer(state,setGroups([{id:'Team',name:'Team',initials:'TE',color:'#333'}]));state=rootReducer(state,fetchRoomChatHistory.pending('old',room));state=rootReducer(state,removeGroup('team'));const entry=msg('room-row',{chatId:room.chatId,type:1,recipientId:'Team'});state=rootReducer(state,fetchRoomChatHistory.fulfilled({chatId:room.chatId,page:1,messages:[entry]},'old',room));state=rootReducer(state,addMessage(entry));assert.equal(state.messages.messages.some(m=>m.chatId===room.chatId),false);assert.equal(state.messages.historyByChat[room.chatId],undefined);
});

test('P1.08: late online reply after timeout cannot resolve the next user check',async()=>{
 const old=await login();try{await assert.rejects(userService.checkUserOnline('bob'),/không phản hồi/);const pending=userService.checkUserOnline('carol');const fresh=await recover(old);assert.equal(event(fresh),'CHECK_USER_ONLINE');old.receive({event:'CHECK_USER_ONLINE',status:'success',data:{status:true}});fresh.receive({event:'CHECK_USER_ONLINE',status:'success',data:{status:false}});assert.equal(await pending,false);}finally{disconnectLoginSession();}
});

test('Hotfix: room history timeout tries Excel alias only on a fresh authenticated socket',async()=>{
  const old=await login();
  try {
    const p=getRoomHistory('Team',1,{timeoutMs:60});
    await tick();assert.equal(event(old),'GET_ROOM_CHAT_MES');
    const deadline=Date.now()+1500;
    while(Socket.instances.at(-1)===old && Date.now()<deadline)await new Promise(r=>setTimeout(r,5));
    const fresh=await recover(old);
    assert.equal(event(fresh),'CHAT_PEOPLE_GET_MES');
    old.receive(history({name:'Team',user:[{id:1,name:'alice'}],chatMess:[row(91,'bob','Team','old',1)]},'GET_ROOM_CHAT_MES'));
    fresh.receive(history({data:{name:' Team ',user:[{id:'1',name:'alice'}],chatMess:[row(92,'bob','Team','new','1')]}},'CHAT_PEOPLE_GET_MES'));
    assert.equal((await p).messages[0].id,'92');
    const next=getRoomHistory('Team',2);await tick();assert.equal(event(fresh),'CHAT_PEOPLE_GET_MES');
    fresh.receive(history({name:'Team',user:[{id:1,name:'alice'}],chatMess:[]},'CHAT_PEOPLE_GET_MES'));
    assert.deepEqual((await next).messages,[]);
  }finally{disconnectLoginSession();}
});
test('Hotfix: a malformed matching room returns a protocol error, not a timeout',async()=>{
 const socket=await login();try{const p=getRoomHistory('Team',1);await tick();socket.receive(history({name:'Team',chatMess:'invalid'},'GET_ROOM_CHAT_MES'));await assert.rejects(p,/chatMess phải là mảng/);}finally{disconnectLoginSession();}
});
test('Hotfix: late realtime pairs once to an already loaded stable ID; second real row is preserved',()=>{
 const server=msg('10');const late=msg('live:late');const first=mergeChatHistory([server],[late]);assert.equal(first.length,1);assert.equal(first[0].reconciledLiveId,late.id);
 const second=mergeChatHistory(first,[msg('live:other')]);assert.equal(second.length,2);
 const third=mergeChatHistory(second,[msg('11')]);assert.deepEqual(third.map(m=>m.id),['10','11']);
});
test('Hotfix: unconfirmed local history link is display-only and rejects old known and ambiguous rows',async()=>{
 const {historyDisplayMessages}=await import('../src/services/chatHistoryReconciliation.ts');
 const local=msg('local:send',{senderId:'alice',recipientId:'bob',sendStatus:'unconfirmed',knownServerIds:['1']});
 const old=msg('1',{senderId:'alice',recipientId:'bob'});const saved=msg('2',{senderId:'alice',recipientId:'bob'});
 assert.equal(historyDisplayMessages(mergeChatHistory([old,local],[old])).length,2);
 const linked=mergeChatHistory([old,local],[saved]);assert.equal(linked.length,3);assert.equal(linked.find(m=>m.id===local.id).sendStatus,'unconfirmed');assert.equal(linked.find(m=>m.id==='2').sendStatus,undefined);
 const visible=historyDisplayMessages(linked);assert.equal(visible.length,2);assert.equal(visible.find(m=>m.id==='2').sendStatus,'unconfirmed');
 const ambiguous=mergeChatHistory(linked,[{...saved,id:'3'}]);assert.equal(historyDisplayMessages(ambiguous).length,4);
});
test('Hotfix: a stable ID confirmed by a different ACK cannot hide an unconfirmed send',async()=>{
 const {historyDisplayMessages}=await import('../src/services/chatHistoryReconciliation.ts');
 const local=msg('local:x',{knownServerIds:[],sendStatus:'unconfirmed'});const confirmed=msg('1',{sendStatus:'confirmed'});
 assert.equal(historyDisplayMessages(mergeChatHistory([local],[confirmed])).length,2);
});

test('Hotfix 2: a quarantined probe waits for an active SEND_CHAT before reconnecting', async()=>{
 const old=await login();
 try {
  await assert.rejects(requestChatHistory('bob',1,'people',8),/chưa phản hồi/);
  const send=peopleChatService.sendMessage('alice','bob','keep this send');
  await tick();assert.equal(event(old),'SEND_CHAT');
  const probe=userService.checkUserOnline('bob');
  await tick();assert.equal(Socket.instances.at(-1),old);assert.equal(old.readyState,1);
  old.receive(ack(row(901,'alice','bob','keep this send')));
  assert.equal((await send).id,'901');
  const fresh=await recover(old);assert.equal(event(fresh),'CHECK_USER_ONLINE');
  fresh.receive({event:'CHECK_USER_ONLINE',status:'success',data:{status:true}});
  assert.equal(await probe,true);assert.equal(old.sent.filter(f=>f.data.event==='SEND_CHAT').length,1);
 } finally {disconnectLoginSession();}
});

test('Hotfix 3: only complete nested personal ACK matches, diagnostics do not disclose message content',async()=>{
 const {websocketService}=await import('../src/services/websocket.ts');
 const s=await login();const logs=[];const off=websocketService.onLog(e=>logs.push(e));
 try {
  const pending=peopleChatService.sendMessage('alice','bob','private marker',['123']);let settled=false;void pending.then(()=>{settled=true;});await tick();
  s.receive({event:'SEND_CHAT',status:'success',data:{data:{name:'alice',to:'bob',mes:'private marker'}}});
  s.receive({event:'SEND_CHAT',status:'success',data:{data:{...row(123,'alice','bob','private marker')}}});
  s.receive({event:'SEND_CHAT',status:'success',data:{data:{...row(124,'alice','other','private marker')}}});
  s.receive({event:'SEND_CHAT',status:'error',data:{data:{type:1,to:'Team'}}});
  await tick();assert.equal(settled,false);
  s.receive({event:'SEND_CHAT',status:'success',data:{data:row(125,'ALICE','BOB','private marker')}});
  assert.equal((await pending).id,'125');assert.ok(logs.some(e=>e.detail==='ack-matched'));assert.ok(logs.some(e=>e.detail==='ack-replay'));assert.ok(logs.some(e=>e.detail==='ack-incomplete'));
  assert.doesNotMatch(JSON.stringify(logs),/private marker|alice|bob|token/);
 }finally{off();disconnectLoginSession();}
});

test('Hotfix 3: personal send without ACK releases queue after four seconds without retransmission',async t=>{
 const s=await login();try{
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=peopleChatService.sendMessage('alice','bob','forward only');const rejected=assert.rejects(pending,UnconfirmedSendError);
  await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  // Wait for the actual send before advancing its clock (no real timer).
  for(let i=0;i<20&&event(s)!=='SEND_CHAT';i++)await Promise.resolve();
  assert.equal(event(s),'SEND_CHAT');t.mock.timers.tick(4000);await rejected;
  assert.equal(s.sent.filter(f=>f.data.event==='SEND_CHAT').length,1);
 }finally{disconnectLoginSession();}
});

test('Hotfix 3: nested presence ignores other-user errors and returns actual boolean',async()=>{
 const s=await login();try{
  const pending=userService.checkUserOnline('bob');let settled=false;void pending.then(()=>{settled=true;});await tick();
  s.receive({event:'CHECK_USER_ONLINE',status:'error',data:{data:{user:'carol',status:false}}});
  s.receive({event:'CHECK_USER_ONLINE',status:'success',data:{data:{user:'carol',status:true}}});
  await tick();assert.equal(settled,false);
  s.receive({event:'CHECK_USER_ONLINE',status:'success',data:{data:{user:'BOB',status:false}}});assert.equal(await pending,false);
 }finally{disconnectLoginSession();}
});

test('Hotfix 3: nested group ACK rejects unrelated personal error and other sender',async()=>{
 const s=await login();try{
  const pending=sendRoomMessage('Team','hello',{knownMessageIds:['1']});let settled=false;void pending.then(()=>{settled=true;});await tick();
  s.receive({event:'SEND_CHAT',status:'error',data:{data:{type:0,to:'bob'}}});
  s.receive(ack({data:row(2,'bob','Team','hello',1)}));s.receive(ack({data:row(1,'alice','Team','hello',1)}));
  await tick();assert.equal(settled,false);s.receive(ack({data:row(3,'alice','Team','hello',1)}));assert.equal((await pending).id,'3');
 }finally{disconnectLoginSession();}
});

test('P2 hotfix: wrong room is ignored; matching history with invalid roster resolves and logs only fixed codes',async()=>{
 const {websocketService}=await import('../src/services/websocket.ts');
 const s=await login();const logs=[];const off=websocketService.onLog(x=>logs.push(x));
 try {
  const p=getRoomHistory('Team',1,{timeoutMs:1000});await tick();
  s.receive(history({name:'OtherSecretRoom',user:[],chatMess:[]},'GET_ROOM_CHAT_MES'));
  s.receive(history({name:'Team',user:[{name:'private-member'}],chatMess:[row(42,'alice','Team','private-message',1)]},'GET_ROOM_CHAT_MES'));
  const result=await p;assert.equal(result.messages[0].id,'42');assert.equal(result.room.user,undefined);assert.ok(result.membersError);
  const text=JSON.stringify(logs);assert.match(text,/room-history-name/);assert.match(text,/room-history-members/);assert.doesNotMatch(text,/OtherSecretRoom|private-member|private-message/);
 }finally{off();disconnectLoginSession();}
});
