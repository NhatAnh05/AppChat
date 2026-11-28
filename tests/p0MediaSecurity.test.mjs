import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,truncate} from 'node:fs/promises';
import http from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHmac,randomBytes} from 'node:crypto';
const secret=randomBytes(32).toString('hex');
const scope=users=>Buffer.from(JSON.stringify(users)).toString('base64url');
const aliceBob=`/api/media/files/${scope(['people','alice','bob'])}`;
const signed=(method,pathname,user='alice',expires=Math.floor(Date.now()/1000)+30,key=secret)=>{
  const payload=Buffer.from(JSON.stringify({method,path:pathname,user,exp:expires})).toString('base64url');
  return payload+'.'+createHmac('sha256',key).update(payload).digest('hex');
};
async function server(t,enabled=true,seed){
  const dir=await mkdtemp(path.join(tmpdir(),'lyra-p0-'));
  if(seed) await seed(dir);
  const child=spawn(process.execPath,['server/media-server.mjs'],{env:{...process.env,MEDIA_PORT:'0',MEDIA_HOST:'127.0.0.1',MEDIA_UPLOAD_DIR:dir,MEDIA_GATEWAY_SECRET:enabled?secret:''},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',resolve);});await rm(dir,{recursive:true,force:true});});
  return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server startup timeout')),3000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`server exited ${code}`));});child.stdout.on('data',data=>{const match=data.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});});
}
const post=(base,route,token,body='hello',mime='text/plain')=>fetch(base+route,{method:'POST',body,headers:{'Content-Type':mime,...(token?{'X-Lyra-Media-Authorization':token}:{'X-Lyra-Upload':'1'})}});
const read=(base,route,token)=>fetch(base+route,{headers:token?{'X-Lyra-Media-Authorization':token}:{}});
test('P0 media: fail closed without gateway secret',async t=>{
  const base=await server(t,false);assert.equal((await fetch(base+'/api/media/health')).status,503);assert.equal((await post(base,aliceBob,null)).status,503);
});
test('P0 media: signed identity/path/method, membership, and protected reads',async t=>{
  const base=await server(t);
  assert.equal((await post(base,aliceBob,null)).status,401);
  assert.equal((await post(base,aliceBob,signed('POST',aliceBob,'mallory'))).status,401);
  assert.equal((await post(base,aliceBob,signed('GET',aliceBob))).status,401);
  assert.equal((await post(base,aliceBob,signed('POST',aliceBob,'alice',Math.floor(Date.now()/1000)-1))).status,401);
  assert.equal((await post(base,aliceBob,signed('POST',aliceBob,'alice',Math.floor(Date.now()/1000)+30,'wrong-secret'))).status,401);
  const result=await post(base,aliceBob,signed('POST',aliceBob));assert.equal(result.status,201);const {path:route}=await result.json();
  assert.equal((await read(base,route,null)).status,401);
  assert.equal((await read(base,route,signed('GET',route,'mallory'))).status,401);
  const wrongScope=route.replace(scope(['people','alice','bob']),scope(['people','alice','carol']));
  assert.equal((await read(base,wrongScope,signed('GET',wrongScope))).status,404);
  const file=await read(base,route,signed('GET',route,'bob'));assert.equal(file.status,200);assert.equal(await file.text(),'hello');assert.equal(file.headers.get('cache-control'),'private, no-store');
});
test('P0 media: reject forged MIME and enforce per-user upload rate',async t=>{
  const base=await server(t);const token=signed('POST',aliceBob);
  assert.equal((await post(base,aliceBob,token,'not an image','image/png')).status,415);
  for(let i=0;i<9;i++){const res=await post(base,aliceBob,token);assert.equal(res.status,201);await res.arrayBuffer();}
  assert.equal((await post(base,aliceBob,token)).status,429);
});

// Sparse file proves old per-account and overall byte quotas are gone without
// writing gigabytes of physical data to the test machine.
test('P0 media: no account or aggregate storage quota',async t=>{
  const base=await server(t,true,async dir=>{
    const name='00000000-0000-4000-8000-000000000001.txt';
    const size=2*1024**3+1024;
    await writeFile(path.join(dir,name),'x');
    await truncate(path.join(dir,name),size);
    await writeFile(path.join(dir,name+'.json'),JSON.stringify({owner:'alice',scope:scope(['people','alice','bob']),mime:'text/plain',size}));
  });
  const response=await post(base,aliceBob,signed('POST',aliceBob));
  assert.equal(response.status,201);
  await response.arrayBuffer();
});

// Hold ten valid request bodies open so they occupy real server-side slots.
test('P0 media: ten concurrent uploads accepted, eleventh rejected, slots released', {timeout:10000},async t=>{
  const base=await server(t);
  const route=`/api/media/files/${scope(['room','test-room'])}`;
  const pending=[];
  t.after(()=>{for(const item of pending)item.request.destroy();});
  for(let i=0;i<10;i++){
    let ready;
    const started=new Promise(resolve=>{ready=resolve;});
    let request;
    const result=new Promise((resolve,reject)=>{
      request=http.request(base+route,{method:'POST',headers:{'Content-Type':'text/plain','Content-Length':2,'Expect':'100-continue','X-Lyra-Media-Authorization':signed('POST',route,`user${i}`)}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});
      request.on('error',reject);
      request.on('continue',()=>{request.write('a');ready();});
      request.flushHeaders();
    });
    // Attach a handler immediately in case an unexpected network error occurs.
    result.catch(()=>{});
    pending.push({request,result});
    await started;
  }
  const extra=await post(base,route,signed('POST',route,'extra'));
  assert.equal(extra.status,429);assert.match(await extra.text(),/10 lượt tải đồng thời/);
  for(const item of pending)item.request.end('b');
  assert.deepEqual(await Promise.all(pending.map(item=>item.result)),Array(10).fill(201));
  const next=await post(base,route,signed('POST',route,'extra'));
  assert.equal(next.status,201);await next.arrayBuffer();
});
