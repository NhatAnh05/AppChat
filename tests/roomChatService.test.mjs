import test from 'node:test';
import assert from 'node:assert/strict';
const session=new Map();
globalThis.sessionStorage={getItem:key=>session.get(key)??null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
class FakeSocket {
 static CONNECTING=0; static OPEN=1; static CLOSED=3; static instances=[];
 readyState=0;sent=[];onopen=null;onmessage=null;onclose=null;onerror=null;
 constructor(url){this.url=url;FakeSocket.instances.push(this)}
 send(input){if(this.readyState!==1)throw new Error('closed');this.sent.push(JSON.parse(input))}
 open(){this.readyState=1;this.onopen?.({})}
 receive(frame){this.onmessage?.({data:JSON.stringify(frame)})}
 close(){this.readyState=3;this.onclose?.({})}
}
globalThis.WebSocket=FakeSocket;
const {loginAccount,disconnectLoginSession}=await import('../src/services/loginService.ts');
const {joinRoom,leaveRoom,getRoomHistory,sendRoomMessage}=await import('../src/services/roomChatService.ts');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const room=(name='ABC')=>({name,user:[{id:1,name:'owner'},{id:2,name:'participant'}],chatMess:[]});
async function login(){disconnectLoginSession();const p=loginAccount({username:'participant',password:'ok'});const s=FakeSocket.instances.at(-1);s.open();s.receive({event:'LOGIN',status:'success',data:{RE_LOGIN_CODE:'token'}});await p;return s}
test('JOIN_ROOM uses the authenticated socket and waits for confirmed membership',async()=>{const s=await login(),count=FakeSocket.instances.length;p: {const p=joinRoom('ABC');await tick();assert.equal(FakeSocket.instances.length,count);assert.deepEqual(s.sent.at(-1),{action:'onchat',data:{event:'JOIN_ROOM',data:{name:'ABC'}}});s.receive({event:'JOIN_ROOM',status:'success',data:room()});assert.equal((await p).name,'ABC')}disconnectLoginSession()});
test('JOIN_ROOM error does not create phantom group',async()=>{const s=await login();const p=joinRoom('NoRoom');await tick();s.receive({event:'JOIN_ROOM',status:'error',mes:'Room not found'});await assert.rejects(p,/Room not found/);disconnectLoginSession()});
test('OUT_ROOM owner rejection is shown, not treated as a leave',async()=>{const s=await login();const p=leaveRoom('ABC');await tick();s.receive({event:'OUT_ROOM',status:'error',mes:'room owner'});await assert.rejects(p,/owner/);disconnectLoginSession()});
test('OUT_ROOM successful response resolves',async()=>{const s=await login();const p=leaveRoom('ABC');await tick();s.receive({event:'OUT_ROOM',status:'success',data:{mes:'You left the room successfully!'}});await p;disconnectLoginSession()});
test('GET_ROOM_CHAT_MES requests page, keeps server id and maps history',async()=>{const s=await login();const p=getRoomHistory('ABC',2);await tick();assert.deepEqual(s.sent.at(-1),{action:'onchat',data:{event:'GET_ROOM_CHAT_MES',data:{name:'ABC',page:2}}});s.receive({event:'GET_ROOM_CHAT_MES',status:'success',data:{...room(),chatMess:[{id:22,name:'owner',to:'ABC',mes:'Hello',type:1,createAt:'2026-11-02 10:00:00'}]}});const result=await p;assert.equal(result.messages[0].id,'22');disconnectLoginSession()});
test('SEND_CHAT room waits for matching group broadcast',async()=>{const s=await login();const p=sendRoomMessage('ABC','Hello');await tick();assert.deepEqual(s.sent.at(-1),{action:'onchat',data:{event:'SEND_CHAT',data:{type:'room',to:'ABC',mes:'Hello'}}});s.receive({event:'SEND_CHAT',status:'success',data:{name:'owner',to:'DIFFERENT',mes:'Hello',type:1}});s.receive({event:'SEND_CHAT',status:'success',data:{name:'participant',to:'ABC',mes:'Hello',type:1}});const result=await p;assert.equal(result.content,'Hello');disconnectLoginSession()});
test('SEND_CHAT denied when user not a group member',async()=>{const s=await login();const p=sendRoomMessage('ABC','msg');await tick();s.receive({event:'SEND_CHAT',status:'error',mes:'You are not in this room!'});await assert.rejects(p,/not in this room/);disconnectLoginSession()});
test('Timeout cannot fake group success',async()=>{const s=await login();const p=getRoomHistory('ABC',1,{timeoutMs:3});await assert.rejects(p,/chưa xác nhận/);assert.equal(s.readyState,1);disconnectLoginSession()});
test('Logout connection closes pending operation',async()=>{const s=await login();const p=joinRoom('ABC');await tick();s.close();await assert.rejects(p,/Mất kết nối/);disconnectLoginSession()});

test('OUT_ROOM ignores a confirmation for a different named room', async () => {
 const socket = await login();
 const pending = leaveRoom('Room A');
 await tick();
 let settled = false;
 void pending.then(() => { settled = true; });
 socket.receive({ event: 'OUT_ROOM', status: 'success', data: { name: 'Room B', mes: 'You left the room successfully!' } });
 await tick();
 assert.equal(settled, false);
 socket.receive({ event: 'OUT_ROOM', status: 'success', data: { name: 'Room A', mes: 'You left the room successfully!' } });
 await pending;
 disconnectLoginSession();
});

test('OUT_ROOM rejects invalid room name locally without sending a packet', async () => {
 const socket = await login();
 const count = socket.sent.length;
 await assert.rejects(leaveRoom('   '), /tên nhóm/);
 assert.equal(socket.sent.length, count);
 disconnectLoginSession();
});
