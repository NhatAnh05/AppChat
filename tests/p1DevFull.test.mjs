import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'lyra-p1-dev-'));await mkdir(path.join(root,'scripts'),{recursive:true});await mkdir(path.join(root,'server'),{recursive:true});await mkdir(path.join(root,'node_modules','vite','bin'),{recursive:true});
 await copyFile(new URL('../scripts/dev-full.mjs',import.meta.url),path.join(root,'scripts','dev-full.mjs'));await copyFile(new URL('../server/media-server.mjs',import.meta.url),path.join(root,'server','media-server.mjs'));
 await writeFile(path.join(root,'node_modules','vite','package.json'),JSON.stringify({name:'vite',version:'0.0.0',type:'module'}));
 await writeFile(path.join(root,'node_modules','vite','bin','vite.js'),"import {writeFileSync} from 'node:fs';writeFileSync('vite-started.txt',String(process.pid));process.exit(7);");return root;
}
function run(root,port){const p=spawn(process.execPath,['scripts/dev-full.mjs'],{cwd:root,env:{...process.env,MEDIA_PORT:String(port),MEDIA_HOST:'127.0.0.1',MEDIA_GATEWAY_SECRET:''},stdio:['ignore','pipe','pipe']});let log='';p.stdout.on('data',d=>log+=d);p.stderr.on('data',d=>log+=d);return {p,log:()=>log};}
async function bind(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');return s;}
test('P1.13/P1.14: occupied media port exits cleanly and never launches Vite or kills existing listener',async()=>{
 const root=await fixture();const busy=await bind();const {p,log}=run(root,busy.address().port);try{const [code]=await once(p,'close');assert.equal(code,1);assert.match(log(),/đang được sử dụng/);assert.doesNotMatch(log(),/Unhandled|DEP0190/);await assert.rejects(readFile(path.join(root,'vite-started.txt')),e=>e.code==='ENOENT');assert.equal(busy.listening,true);}finally{if(p.exitCode===null)p.kill();busy.close();await rm(root,{recursive:true,force:true});}
});
test('P1.15/P1.16: child failure cleans media listener and direct Node launch avoids shell warning',async()=>{
 const root=await fixture();const reservation=await bind();const port=reservation.address().port;await new Promise(r=>reservation.close(r));const {p,log}=run(root,port);try{const [code]=await once(p,'close');assert.equal(code,7);assert.ok((await readFile(path.join(root,'vite-started.txt'),'utf8')).trim());assert.doesNotMatch(log(),/DEP0190/);const check=createServer();check.listen(port,'127.0.0.1');await once(check,'listening');await new Promise(r=>check.close(r));}finally{if(p.exitCode===null)p.kill();await delay(30);await rm(root,{recursive:true,force:true});}
});
