import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {localMediaRequestAllowed} from '../scripts/local-media-policy.ts';
import {encodeMediaMessage,parseMediaMessage} from '../src/services/mediaMessage.ts';
const scope=Buffer.from(JSON.stringify(['people','alice','bob'])).toString('base64url');
const room=Buffer.from(JSON.stringify(['room','team'])).toString('base64url');
const key=randomBytes(32).toString('hex');
async function start(t){
 const dir=await mkdtemp(path.join(tmpdir(),'lyra-hotfix-'));
 const child=spawn(process.execPath,['server/media-server.mjs'],{env:{...process.env,MEDIA_PORT:'0',MEDIA_HOST:'127.0.0.1',MEDIA_GATEWAY_SECRET:'',MEDIA_UPLOAD_DIR:path.join(dir,'production'),MEDIA_LOCAL_UPLOAD_DIR:path.join(dir,'sandbox'),LYRA_LOCAL_MEDIA_MODE:'1',LYRA_LOCAL_MEDIA_KEY:key},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}await rm(dir,{recursive:true,force:true});});
 const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup timeout')),3000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`exit ${code}`));});child.stdout.on('data',chunk=>{const m=chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
 return {base,dir};
}
test('Hotfix media: sandbox only accepts loopback, same-origin uploads and no cross-site requests',()=>{
 assert.equal(localMediaRequestAllowed(true,'127.0.0.1','localhost:5173','POST','http://localhost:5173','same-origin'),true);
 assert.equal(localMediaRequestAllowed(false,'127.0.0.1','localhost:5173','POST','http://localhost:5173'),false);
 assert.equal(localMediaRequestAllowed(true,'192.168.1.2','localhost:5173','POST','http://localhost:5173'),false);
 assert.equal(localMediaRequestAllowed(true,'127.0.0.1','evil.test','POST','http://evil.test'),false);
 assert.equal(localMediaRequestAllowed(true,'127.0.0.1','localhost:5173','POST','https://evil.test'),false);
 assert.equal(localMediaRequestAllowed(true,'127.0.0.1','localhost:5173','GET',undefined,'cross-site'),false);
 assert.equal(localMediaRequestAllowed(true,'127.0.0.1','localhost:5173','GET',undefined,'none'),true);
});
test('Hotfix media: real HTTP upload image and PDF, protected capability reads, isolated storage and production fail closed',async t=>{
 const {base,dir}=await start(t);const headers={'X-Lyra-Local-Gateway':key};
 const route=`/api/media/local/files/${scope}`;
 const png=Buffer.from('89504e470d0a1a0a00000000','hex');
 assert.equal((await fetch(base+'/api/media/health')).status,503);
 assert.equal((await fetch(base+'/api/media/local/health',{headers})).status,200);
 assert.equal((await fetch(base+route,{method:'POST',body:png,headers:{'Content-Type':'image/png'}})).status,403);
 const response=await fetch(base+route,{method:'POST',body:png,headers:{...headers,'Content-Type':'image/png','X-File-Name':encodeURIComponent('ảnh mẫu.png')}});assert.equal(response.status,201);const {path:link}=await response.json();
 assert.equal((await fetch(base+link)).status,403);
 assert.equal((await fetch(base+link.split('?')[0],{headers})).status,404);
 assert.equal((await fetch(base+link.replace(scope,room),{headers})).status,404);
 const image=await fetch(base+link,{headers});assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);assert.match(image.headers.get('content-disposition'),/filename\*=UTF-8''/);
 const pdf=Buffer.from('%PDF-1.7\nexample');const file=await fetch(base+`/api/media/local/files/${room}`,{method:'POST',body:pdf,headers:{...headers,'Content-Type':'application/pdf','X-File-Name':'test.pdf'}});assert.equal(file.status,201);const doc=await file.json();const loaded=await fetch(base+doc.path,{headers});assert.equal(loaded.status,200);assert.equal(await loaded.text(),pdf.toString());
 assert.equal((await fetch(base+route,{method:'POST',body:'invalid',headers:{...headers,'Content-Type':'image/png'}})).status,415);
 assert.equal((await fetch(base+`/api/media/files/${scope}`,{method:'POST',body:png,headers:{...headers,'Content-Type':'image/png'}})).status,503);
 assert.equal((await readdir(path.join(dir,'production'))).length,0);
 const metadata=JSON.parse(await readFile(path.join(dir,'sandbox',link.split('/').at(-1).split('?')[0]+'.json'),'utf8'));assert.equal(metadata.name,'ảnh mẫu.png');assert.ok(metadata.capHash);assert.ok(!JSON.stringify(metadata).includes(link.split('cap=')[1]));
});
test('Hotfix media: name and size roundtrip, older URL retained, normal URL remains text',()=>{
 const media={kind:'file',url:'https://example.com/api/media/files/abc/id.pdf',name:'Bài tập.pdf',size:4096};
 assert.deepEqual(parseMediaMessage(encodeMediaMessage(media)),media);
 assert.equal(parseMediaMessage('https://example.com/guide'),null);
 assert.equal(parseMediaMessage('https://example.com/old.jpg').kind,'image');
 assert.equal(parseMediaMessage('[[LYRA_MEDIA_V1]]{"kind":"file","url":"javascript:alert(1)","name":"bad"}'),null);
});
test('P2: authenticated audio upload and byte ranges preserve capability checks',async t=>{
 const {base}=await start(t);const headers={'X-Lyra-Local-Gateway':key};
 const bytes=Buffer.from('1a45dfa300010203040506070809','hex');
 const response=await fetch(base+`/api/media/local/files/${scope}`,{method:'POST',body:bytes,headers:{...headers,'Content-Type':'audio/webm','X-File-Name':'record.weba'}});
 assert.equal(response.status,201);const {path:link}=await response.json();
 const range=await fetch(base+link,{headers:{...headers,Range:'bytes=2-5'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 2-5/${bytes.length}`);assert.equal(range.headers.get('content-type'),'audio/webm');assert.equal(range.headers.get('accept-ranges'),'bytes');assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(2,6));
 const tail=await fetch(base+link,{headers:{...headers,Range:'bytes=-3'}});assert.equal(tail.status,206);assert.deepEqual(Buffer.from(await tail.arrayBuffer()),bytes.subarray(-3));
 const invalid=await fetch(base+link,{headers:{...headers,Range:'bytes=999-'}});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),`bytes */${bytes.length}`);
 assert.equal((await fetch(base+link,{headers:{...headers,Range:'bytes=0-1,3-4'}})).status,416);
 assert.equal((await fetch(base+link.split('?')[0],{headers:{...headers,Range:'bytes=0-1'}})).status,404);
 assert.equal((await fetch(base+link,{headers:{Range:'bytes=0-1'}})).status,403);
 const full=await fetch(base+link,{headers:{...headers,Range:'bytes=0-1','If-Range':'"old"'}});assert.equal(full.status,200);assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);
});

test('Voice hotfix: canonical WAV roundtrips through real HTTP with range and access checks',async t=>{
 const {encodeVoiceWav,voiceBytesMatch}=await import('../src/services/voiceWav.ts');
 const {base}=await start(t);const headers={'X-Lyra-Local-Gateway':key};const route=`/api/media/local/files/${scope}`;
 const audio=encodeVoiceWav(Float32Array.from({length:24000},(_,i)=>.25*Math.sin(i*2*Math.PI*440/24000)));
 const upload=body=>fetch(base+route,{method:'POST',body,headers:{...headers,'Content-Type':'audio/wav','X-File-Name':'sample.wav'}});
 const bad=audio.slice(0);new DataView(bad).setUint32(40,0,true);
 assert.equal((await upload(bad)).status,415);
 const result=await upload(audio);assert.equal(result.status,201);const {path:link}=await result.json();
 const full=await fetch(base+link,{headers});assert.equal(full.status,200);assert.equal(full.headers.get('content-type'),'audio/wav');assert.equal(Number(full.headers.get('content-length')),audio.byteLength);assert.ok(voiceBytesMatch(audio,await full.arrayBuffer()));
 const range=await fetch(base+link,{headers:{...headers,Range:'bytes=44-99'}});assert.equal(range.status,206);assert.ok(voiceBytesMatch(audio.slice(44,100),await range.arrayBuffer()));
 assert.equal((await fetch(base+link.split('?')[0],{headers})).status,404);assert.equal((await fetch(base+link)).status,403);
});
