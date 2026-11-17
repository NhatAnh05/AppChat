import test from 'node:test';
import assert from 'node:assert/strict';

const saved = new Map();
globalThis.sessionStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: key => saved.delete(key),
};

class MockSocket {
  static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
  static all=[];
  readyState=0; onopen=null; onmessage=null; onclose=null; onerror=null; sent=[];
  constructor(url) {this.url=url;MockSocket.all.push(this);}
  send(text) {if(this.readyState!==1) throw new Error('not open');this.sent.push(JSON.parse(text));}
  open() {this.readyState=1;this.onopen?.({});}
  receive(packet) {this.onmessage?.({data:JSON.stringify(packet)});}
  close() {if(this.readyState===3)return;this.readyState=3;this.onclose?.({});}
}
globalThis.WebSocket=MockSocket;
const protocol = await import('../src/services/createRoomProtocol.ts');
const {createRoom} = await import('../src/services/createRoomService.ts');
const {loginAccount, disconnectLoginSession} = await import('../src/services/loginService.ts');
const {websocketService} = await import('../src/services/websocket.ts');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const success=(name='ABC')=>({event:'CREATE_ROOM',status:'success',data:{name,user:[{id:1,name:'author'}],chatMess:[]}});

async function loggedIn() {
  disconnectLoginSession();
  const pending=loginAccount({username:'author',password:'secret'});
  const ws=MockSocket.all.at(-1);
  ws.open();
  ws.receive({event:'LOGIN',status:'success',data:{RE_LOGIN_CODE:'server-code'}});
  await pending;
  return ws;
}

test('API 6 request matches the exact teacher JSON',()=>{
  assert.deepEqual(protocol.makeCreateRoomRequest(' ABC '),{
    action:'onchat',data:{event:'CREATE_ROOM',data:{name:'ABC'}}
  });
});
test('Room names are checked locally before sending',()=>{
  assert.throws(()=>protocol.normalizeRoomName('   '),/tên nhóm/);
  assert.throws(()=>protocol.normalizeRoomName('a'.repeat(81)),/80/);
  assert.throws(()=>protocol.normalizeRoomName('bad\nname'),/không hợp lệ/);
  assert.equal(protocol.normalizeRoomName('  Nhóm học tập  '),'Nhóm học tập');
});
test('Parse teacher CREATE_ROOM success with owner and empty chatMess',()=>{
  assert.deepEqual(protocol.parseCreateRoomResponse(success()),{
    status:'success',room:{name:'ABC',user:[{id:1,name:'author'}],chatMess:[]}
  });
});
test('Parse duplicate room failure from teacher',()=>{
  assert.deepEqual(protocol.parseCreateRoomResponse({event:'CREATE_ROOM',status:'error',mes:'Room Exist or Error'}),
    {status:'error',message:'Room Exist or Error'});
});
test('Reject malformed success and ignore unrelated event',()=>{
  assert.equal(protocol.parseCreateRoomResponse('invalid'),null);
  assert.equal(protocol.parseCreateRoomResponse({event:'GET_USER_LIST',status:'success',data:[]}),null);
  assert.match(protocol.parseCreateRoomResponse({event:'CREATE_ROOM',status:'success',data:{name:'ABC'}}).message,/không hợp lệ/);
  assert.match(protocol.parseCreateRoomResponse({event:'CREATE_ROOM',status:'success',data:{name:'ABC',user:[{id:'wrong',name:'a'}],chatMess:[]}}).message,/không hợp lệ/);
});
test('CREATE_ROOM reuses LOGIN authenticated socket and waits for real ACK',async()=>{
  const socket=await loggedIn();
  const count=MockSocket.all.length;
  const requested=createRoom('ABC');
  await tick();
  assert.equal(MockSocket.all.length,count);
  assert.equal(websocketService.getSocket(),socket);
  assert.deepEqual(socket.sent.at(-1),protocol.makeCreateRoomRequest('ABC'));
  socket.receive({event:'GET_USER_LIST',status:'success',data:[]});
  socket.receive(success());
  assert.equal((await requested).name,'ABC');
  disconnectLoginSession();
});
test('Cannot create when not logged in, and must not open anonymous socket',async()=>{
  disconnectLoginSession();
  const count=MockSocket.all.length;
  await assert.rejects(createRoom('Private'),/đăng nhập lại/);
  assert.equal(MockSocket.all.length,count);
});
test('Server existing-room error does not produce success',async()=>{
  const socket=await loggedIn();
  const p=createRoom('Taken'); await tick();
  socket.receive({event:'CREATE_ROOM',status:'error',mes:'Room Exist or Error'});
  await assert.rejects(p,/Room Exist or Error/);
  disconnectLoginSession();
});
test('Invalid success cannot create phantom room',async()=>{
  const socket=await loggedIn();
  const p=createRoom('ABC');await tick();
  socket.receive({event:'CREATE_ROOM',status:'success',data:{name:'ABC',user:[],chatMess:'not an array'}});
  await assert.rejects(p,/không hợp lệ/);
  disconnectLoginSession();
});
test('Unrelated CREATE_ROOM success is ignored until response name matches',async()=>{
  const socket=await loggedIn();
  let fulfilled=false;
  const p=createRoom('My Group').then(room=>{fulfilled=true;return room;});await tick();
  socket.receive(success('Other Group'));await tick();
  assert.equal(fulfilled,false);
  socket.receive(success('My Group'));
  assert.equal((await p).name,'My Group');
  disconnectLoginSession();
});
test('Double click reuses the in-flight request and cannot create two groups',async()=>{
  const socket=await loggedIn();
  const first=createRoom('Same');
  const second=createRoom('Same');
  assert.equal(first,second);
  await tick();
  assert.equal(socket.sent.filter(packet=>packet.data.event==='CREATE_ROOM').length,1);
  socket.receive(success('Same'));
  await Promise.all([first,second]);
  disconnectLoginSession();
});
test('A different group cannot be created before the previous response',async()=>{
  const socket=await loggedIn();
  const first=createRoom('A');
  await assert.rejects(createRoom('B'),/Đang tạo một nhóm khác/);
  await tick();socket.receive(success('A'));await first;
  disconnectLoginSession();
});
test('Timeout releases the pending request; user can try again',async()=>{
  const socket=await loggedIn();
  const first=createRoom('Timeout',{timeoutMs:5});
  await assert.rejects(first,/không phản hồi/);
  const second=createRoom('Retry');await tick();socket.receive(success('Retry'));
  assert.equal((await second).name,'Retry');
  disconnectLoginSession();
});
test('Connection close before ACK rejects the request',async()=>{
  const socket=await loggedIn();
  const task=createRoom('Closed');await tick();socket.close();
  await assert.rejects(task,/Mất kết nối/);
  disconnectLoginSession();
});
test('Abort before response cleans up and never creates room',async()=>{
  const socket=await loggedIn();
  const controller=new AbortController();
  const task=createRoom('Cancelled',{signal:controller.signal});await tick();
  controller.abort();
  await assert.rejects(task,/Đã hủy/);
  const second=createRoom('New');await tick();socket.receive(success('New'));
  assert.equal((await second).name,'New');
  disconnectLoginSession();
});
