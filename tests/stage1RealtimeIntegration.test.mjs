import test from 'node:test';
import assert from 'node:assert/strict';

const saved=new Map();
globalThis.sessionStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
class Socket {
  static OPEN=1; static CONNECTING=0; static instances=[];
  readyState=0;sent=[];onopen=null;onmessage=null;onclose=null;onerror=null;
  constructor(url){this.url=url;Socket.instances.push(this)}
  open(){this.readyState=1;this.onopen?.({})}
  send(message){this.sent.push(JSON.parse(message))}
  receive(value){this.onmessage?.({data:JSON.stringify(value)})}
  close(){this.readyState=3;this.onclose?.({})}
}
globalThis.WebSocket=Socket;
const {loginAccount,disconnectLoginSession}=await import('../src/services/loginService.ts');
const {peopleChatService}=await import('../src/services/peopleChatService.ts');
const {getRoomHistory}=await import('../src/services/roomChatService.ts');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function login(){
  disconnectLoginSession();
  const request=loginAccount({username:'bob',password:'pw'});
  const socket=Socket.instances.at(-1);
  socket.open();socket.receive({event:'LOGIN',status:'success',data:{RE_LOGIN_CODE:'code'}});
  await request;return socket;
}
const historyFrame=(name,content,type=0)=>({id:12,name,to:type===1?'Team':'bob',mes:content,createAt:'2026-11-22 20:00:00',type});
const room={name:'Team',user:[{id:1,name:'bob'}],chatMess:[historyFrame('alice','Chào nhóm',1)]};

test('Stage1: queue shares one request channel for people and group histories',async()=>{
  const socket=await login();
  const peoplePromise=peopleChatService.getHistory('alice',1);
  await tick();
  const roomPromise=getRoomHistory('Team',1);
  await tick();
  const outgoing=()=>socket.sent.filter(value=>['CHAT_PEOPLE_GET_MES', 'GET_PEOPLE_CHAT_MES'].includes(value.data.event));
  assert.equal(outgoing().length,1);
  assert.equal(outgoing()[0].data.data.name,'alice');
  assert.equal(outgoing()[0].data.event, 'GET_PEOPLE_CHAT_MES'); // API production đã xác nhận
  // A room payload must NOT resolve a personal history request.
  socket.receive({event:'CHAT_PEOPLE_GET_MES',status:'success',data:room});
  await tick();
  assert.equal(outgoing().length,1);
  socket.receive({event:'CHAT_PEOPLE_GET_MES',status:'success',data:[historyFrame('alice','Xin chào 😍')]});
  assert.equal((await peoplePromise)[0].content,'Xin chào 😍');
  await tick();
  assert.equal(outgoing().length,2);
  assert.equal(outgoing()[1].data.data.name,'Team');
  assert.equal(outgoing()[1].data.event, 'CHAT_PEOPLE_GET_MES'); // phòng giữ event theo tài liệu
  socket.receive({event:'CHAT_PEOPLE_GET_MES',status:'success',data:room});
  assert.equal((await roomPromise).messages[0].content,'Chào nhóm');
  disconnectLoginSession();
});

test('Stage1: reconnect channel rejects outstanding history on socket close',async()=>{
  const socket=await login();
  const request=peopleChatService.getHistory('alice');
  await tick();
  socket.close();
  await assert.rejects(request,/Mất kết nối/);
  disconnectLoginSession();
});
