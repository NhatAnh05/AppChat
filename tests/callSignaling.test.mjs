import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const port = 39000 + Math.floor(Math.random()*1800);
const address = `ws://127.0.0.1:${port}/api/calls/ws`;
const awaitMessage = (socket, type, timeout=2500) => new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.removeEventListener('message',listener);reject(new Error(`Không nhận ${type}`));},timeout);
  const listener=e=>{const msg=JSON.parse(e.data);if(msg.type!==type)return;clearTimeout(timer);socket.removeEventListener('message',listener);resolve(msg);};
  socket.addEventListener('message',listener);
});
const open = async (username) => {
  const ws = new WebSocket(address+`?user=${username}`);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  return ws;
};
test('WebRTC signaling gửi lời mời, trả lời, chuyển ICE và kết thúc',async t=>{
  const child=spawn(process.execPath,['server/call-signaling.mjs'],{env:{...process.env,CALL_PORT:String(port)},stdio:'ignore'});
  t.after(()=>child.kill());
  let alice;
  for(let i=0;i<30;i++){
    try {alice=await open('alice_test');break;}catch{await delay(50);}
  }
  assert.ok(alice,'signaling server khởi chạy');
  const bob=await open('bob_test');
  t.after(()=>{alice.close();bob.close();});
  const incoming=awaitMessage(bob,'incoming');
  const ringing=awaitMessage(alice,'ringing');
  alice.send(JSON.stringify({type:'invite',to:'bob_test',mode:'video'}));
  const invitation=await incoming;
  assert.equal(invitation.from,'alice_test');assert.equal(invitation.mode,'video');
  assert.equal((await ringing).callId,invitation.callId);
  const accepted=awaitMessage(alice,'accept');
  bob.send(JSON.stringify({type:'accept',callId:invitation.callId}));
  assert.equal((await accepted).callId,invitation.callId);
  const candidate=awaitMessage(bob,'ice');
  alice.send(JSON.stringify({type:'ice',callId:invitation.callId,candidate:{candidate:'candidate:test',sdpMid:'0',sdpMLineIndex:0}}));
  assert.equal((await candidate).candidate.candidate,'candidate:test');
  const ended=awaitMessage(bob,'hangup');
  alice.send(JSON.stringify({type:'hangup',callId:invitation.callId}));
  assert.equal((await ended).callId,invitation.callId);
});
