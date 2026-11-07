import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory=mkdtempSync(join(tmpdir(),'lyra-test-'));
const port=18888;
const url=`ws://127.0.0.1:${port}/chat/chat`;
let child;
async function start() {
 child=spawn(process.execPath,['local-server/server.mjs'],{cwd:process.cwd(),env:{...process.env,CHAT_PORT:String(port),CHAT_DB_PATH:join(directory,'chat.json')},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{
  const fail=setTimeout(()=>reject(new Error('Server start timeout')),3000);
  child.stdout.once('data',()=>{clearTimeout(fail);resolve();});
  child.once('error',reject);
 });
}
async function stop(){if(!child)return;const old=child; child=null;old.kill();await new Promise(resolve=>old.once('exit',resolve));}
async function connect(){return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.addEventListener('open',()=>resolve(ws),{once:true});ws.addEventListener('error',reject,{once:true});});}
async function request(ws,event,data={}) {return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(`Timeout: ${event}`)),2500);const handler=e=>{const packet=JSON.parse(e.data);if(packet.event!==event)return;clearTimeout(timeout);ws.removeEventListener('message',handler);resolve(packet);};ws.addEventListener('message',handler);ws.send(JSON.stringify({action:'onchat',data:{event,data}}));});}
function watch(ws,event){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(`Broadcast timeout: ${event}`)),2500);const handler=e=>{const packet=JSON.parse(e.data);if(packet.event!==event)return;clearTimeout(timeout);ws.removeEventListener('message',handler);resolve(packet);};ws.addEventListener('message',handler);});}

test('gửi/nhận 1-1, nhóm và lưu lịch sử qua restart',async()=>{
 try {
  await start();const a=await connect(),b=await connect();
  const accounts=[['LyraTestA','abcdef'],['LyraTestB','abcdef']];
  for(const [ws,[user,pass]] of [[a,accounts[0]],[b,accounts[1]]]){
   assert.equal((await request(ws,'REGISTER',{user,pass})).status,'success');
   assert.equal((await request(ws,'LOGIN',{user,pass})).status,'success');
  }
  const receive=watch(b,'SEND_CHAT');
  assert.equal((await request(a,'SEND_CHAT',{type:'people',to:'LyraTestB',mes:'Một tin nhắn được lưu'})).status,'success');
  assert.equal((await receive).data.mes,'Một tin nhắn được lưu');
  assert.equal((await request(b,'CHAT_PEOPLE_GET_MES',{name:'LyraTestA',page:1})).data.chatMess.length,1);
  assert.equal((await request(a,'CREATE_ROOM',{name:'NhomTest'})).status,'success');
  assert.equal((await request(b,'JOIN_ROOM',{name:'NhomTest'})).status,'success');
  const group=watch(b,'SEND_CHAT');
  await request(a,'SEND_CHAT',{type:'room',to:'NhomTest',mes:'Chào nhóm'});
  assert.equal((await group).data.mes,'Chào nhóm');
  assert.equal((await request(a,'CHAT_PEOPLE_GET_MES',{name:'NhomTest',page:1})).data.chatMess.length,1);
  await request(a,'LOGOUT');await request(b,'LOGOUT');a.close();b.close();await stop();
  await start();const c=await connect();
  assert.equal((await request(c,'LOGIN',{user:'LyraTestB',pass:'abcdef'})).status,'success');
  const history=await request(c,'CHAT_PEOPLE_GET_MES',{name:'LyraTestA',page:1});
  assert.equal(history.data.chatMess[0].mes,'Một tin nhắn được lưu');
  c.close();
 } finally {await stop();rmSync(directory,{recursive:true,force:true});}
});
