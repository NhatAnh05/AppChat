import test from 'node:test';
import assert from 'node:assert/strict';
const values = new Map();
globalThis.sessionStorage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
class Socket {
  static OPEN=1; static CONNECTING=0; static instances=[];
  readyState=0; sent=[]; listeners=new Map();
  constructor(){Socket.instances.push(this);}
  addEventListener(event,fn){let set=this.listeners.get(event);if(!set){set=new Set();this.listeners.set(event,set);}set.add(fn);}
  removeEventListener(event,fn){this.listeners.get(event)?.delete(fn);}
  emit(event,value){this['on'+event]?.(value);for(const fn of [...(this.listeners.get(event)||[])])fn(value);}
  open(){this.readyState=1;this.emit('open',{});}
  close(){this.readyState=3;this.emit('close',{});}
  send(data){this.sent.push(JSON.parse(data));}
  receive(data){this.emit('message',{data:JSON.stringify(data)});}
}
globalThis.WebSocket=Socket;
const {loginAccount,disconnectLoginSession}=await import('../src/services/loginService.ts');
const {logoutCurrentSession}=await import('../src/services/logoutService.ts');
const {peopleChatService,UnconfirmedSendError}=await import('../src/services/peopleChatService.ts');
const {getRoomHistory,sendRoomMessage,joinRoom}=await import('../src/services/roomChatService.ts');
const {contactService}=await import('../src/services/contactService.ts');
const {userService}=await import('../src/services/userService.ts');
const {createRoom}=await import('../src/services/createRoomService.ts');
const {currentSessionSignal,sessionQueue,rotateSessionScope}=await import('../src/services/sessionScope.ts');
const tick=()=>new Promise(setImmediate);
async function login(username){const p=loginAccount({username,password:'test'});const s=Socket.instances.at(-1);s.open();s.receive({event:'LOGIN',status:'success',data:{RE_LOGIN_CODE:'code-'+username}});await p;return s;}
const ack=(name,to,mes,id)=>({event:'SEND_CHAT',status:'success',data:{name,to,mes,id,type:0}});
const events=s=>s.sent.map(frame=>frame.data.event);

test('P0: queued work rejects at session rotation; new session does not wait for old task',async()=>{
  const q=sessionQueue();const old=currentSessionSignal();let release;
  const a=q(()=>new Promise(r=>{release=r;}));const b=q(()=>{assert.fail('old queue executed');});
  const rejects=Promise.all([assert.rejects(a,/Phiên đăng nhập/),assert.rejects(b,/Phiên đăng nhập/)]);
  await tick();rotateSessionScope();await rejects;assert.equal(old.aborted,true);
  assert.equal(await q(async()=>42),42);release(1);
});
test('P0: pending and queued SEND_CHAT/history/user/group work never transmits on the next account',async()=>{
  const a=await login('alice');
  const sends=[peopleChatService.sendMessage('alice','bob','old active'),peopleChatService.sendMessage('alice','bob','old queued'),sendRoomMessage('team','old room')];
  const reads=[peopleChatService.getHistory('bob'),getRoomHistory('team'),contactService.getUserList(),userService.checkUserExist('bob'),joinRoom('team'),joinRoom('oldroom'),createRoom('newroom')];
  const rejects=Promise.all([...sends,...reads].map(p=>assert.rejects(p)));
  await tick();assert.equal(events(a).filter(e=>e==='SEND_CHAT').length,1);
  const b=await login('carol');await rejects;await tick();
  assert.deepEqual(events(b),['LOGIN']);
  a.receive(ack('alice','bob','old active',1));
  const fresh=peopleChatService.sendMessage('carol','bob','new');await tick();
  assert.equal(events(b).filter(e=>e==='SEND_CHAT').length,1);
  b.receive(ack('carol','bob','new',2));assert.equal((await fresh).senderId,'carol');
  disconnectLoginSession();
});
test('P0: old logout completion cannot disconnect a newer authenticated socket',async()=>{
  await login('alice');const logout=logoutCurrentSession({timeoutMs:100});
  const b=await login('bob');await logout;
  const p=peopleChatService.sendMessage('bob','alice','fresh');await tick();b.receive(ack('bob','alice','fresh',3));assert.equal((await p).content,'fresh');disconnectLoginSession();
});
test('P0: ACK without sender or replayed ID does not confirm a fresh send',async()=>{
  const s=await login('alice');const p=peopleChatService.sendMessage('alice','bob','same',['1']);let settled=false;
  void p.then(()=>{settled=true;});await tick();s.receive(ack(undefined,'bob','same',2));s.receive(ack('alice','bob','same',1));await tick();assert.equal(settled,false);
  s.receive(ack('alice','bob','same',3));assert.equal((await p).id,'3');
  const second=peopleChatService.sendMessage('alice','bob','same');settled=false;void second.then(()=>{settled=true;});await tick();s.receive(ack('alice','bob','same',3));await tick();assert.equal(settled,false);s.receive(ack('alice','bob','same',4));assert.equal((await second).id,'4');disconnectLoginSession();
});
test('P0: missing ACK cannot turn a matching old history record into success',async t=>{
  const s=await login('alice');t.mock.timers.enable({apis:['setTimeout']});
  const p=peopleChatService.sendMessage('alice','bob','same');const rejected=assert.rejects(p,UnconfirmedSendError);await tick();
  s.receive({event:'GET_PEOPLE_CHAT_MES',status:'success',data:[{id:4,name:'alice',to:'bob',mes:'same',createAt:'2020-01-01 00:00:00',type:0}]});
  t.mock.timers.tick(10000);await rejected;
  assert.deepEqual(events(s),['LOGIN','SEND_CHAT']);
  // Next send must use a fresh authenticated transport, not the old ambiguous ACK channel.
  const next=peopleChatService.sendMessage('alice','bob','same');
  await tick();const fresh=Socket.instances.at(-1);assert.notEqual(fresh,s);fresh.open();
  assert.equal(events(fresh).at(-1),'RE_LOGIN');
  fresh.receive({event:'RE_LOGIN',status:'success',data:{RE_LOGIN_CODE:'rotated'}});
  await tick();assert.equal(events(fresh).at(-1),'SEND_CHAT');
  s.receive(ack('alice','bob','same',4));
  fresh.receive(ack('alice','bob','same',5));assert.equal((await next).id,'5');
  assert.deepEqual(events(s),['LOGIN','SEND_CHAT']);disconnectLoginSession();
});
test('P0: Redux clears messages, contacts and page cache, ignores old history completion',async t=>{
  try { await import('@reduxjs/toolkit'); } catch(error) { if(error.code==='ERR_MODULE_NOT_FOUND'){t.skip('Requires npm ci (@reduxjs/toolkit not installed)');return;} throw error; }
  const {rootReducer}=await import('../src/store/store.ts');
  const {clearCredentials,setCredentials}=await import('../src/features/auth/authSlice.ts');
  const {addMessage,fetchPeopleChatHistory}=await import('../src/features/messages/messagesSlice.ts');
  const {setFriends}=await import('../src/features/contacts/contactsSlice.ts');
  const old={chatId:'shared',id:'old',senderId:'alice',content:'private',createdAt:'2020-01-01'};
  const args={username:'shared',chatId:'shared',page:1};let state=rootReducer(undefined,setCredentials({userId:'alice'}));
  state=rootReducer(state,addMessage(old));state=rootReducer(state,setFriends([{id:'shared',name:'shared'}]));state=rootReducer(state,fetchPeopleChatHistory.pending('old-request',args));
  state=rootReducer(state,clearCredentials());assert.deepEqual(state.messages.messages,[]);assert.deepEqual(state.messages.historyByChat,{});assert.deepEqual(state.contacts.friends,[]);
  state=rootReducer(state,addMessage(old));assert.deepEqual(state.messages.messages,[]);
  state=rootReducer(state,setCredentials({userId:'bob'}));state=rootReducer(state,fetchPeopleChatHistory.pending('new-request',args));
  state=rootReducer(state,fetchPeopleChatHistory.fulfilled({chatId:'shared',page:1,messages:[old]},'old-request',args));assert.deepEqual(state.messages.messages,[]);assert.equal(state.messages.historyByChat.shared.requestId,'new-request');
  state=rootReducer(state,fetchPeopleChatHistory.fulfilled({chatId:'shared',page:1,messages:[{...old,id:'new',senderId:'bob'}]},'new-request',args));assert.equal(state.messages.messages[0].id,'new');
  state=rootReducer(state,setCredentials({userId:'carol'}));assert.deepEqual(state.messages.messages,[]);
});
