import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const localMode=process.argv.includes('--local-media');
const viteArgs=process.argv.slice(2).filter(arg=>arg!=='--local-media');
// Only explicit local demo runs receive the random server-to-server key.
const childEnv={...process.env,LYRA_LOCAL_MEDIA_MODE:localMode?'1':'0',LYRA_LOCAL_MEDIA_KEY:localMode?randomBytes(32).toString('hex'):'',VITE_LYRA_LOCAL_MEDIA:localMode?'1':'0'};
const children=new Set();
let stopping=false;
let forceTimer;
function stop(code=0){
  if(stopping)return;
  stopping=true;process.exitCode=code;
  for(const child of children)if(child.exitCode===null&&!child.killed)child.kill();
  if(children.size){forceTimer=setTimeout(()=>{for(const child of children)if(child.exitCode===null)child.kill('SIGKILL');},3000);forceTimer.unref();}
}
function launch(label,entry,args=[],ipc=false){
  const child=spawn(process.execPath,[entry,...args],{cwd:root,env:childEnv,stdio:ipc?['inherit','inherit','inherit','ipc']:'inherit',shell:false});
  children.add(child);
  child.on('error',error=>{console.error(`[${label}] ${error.message}`);children.delete(child);stop(1);});
  child.on('exit',(code,signal)=>{
    children.delete(child);
    if(!stopping){console.error(`[${label}] Dừng (code=${code}, signal=${signal??'none'}). Dọn các tiến trình AppChat.`);stop(code??1);}
    if(!children.size&&forceTimer)clearTimeout(forceTimer);
  });
  return child;
}
process.once('SIGINT',()=>stop(130));
process.once('SIGTERM',()=>stop(143));
try {
  if(localMode && viteArgs.some(arg=>arg==='--host'||arg.startsWith('--host=')||arg==='--config'||arg.startsWith('--config=')||arg==='-c')) throw new Error('Local media chỉ hỗ trợ cấu hình Vite mặc định và localhost.');
  if(localMode) {viteArgs.push('--host','127.0.0.1');console.log('Media thử nghiệm localhost: chỉ dùng tệp mẫu, không xác thực tài khoản giảng viên; không dùng production.');}
  const viteEntry=path.join(path.dirname(require.resolve('vite/package.json')),'bin','vite.js');
  const media=launch('media',path.join(root,'server','media-server.mjs'),[],true);
  media.on('message',message=>{if(!stopping&&message?.type==='media-ready'){media.disconnect();launch('vite',viteEntry,viteArgs);}});
}catch(error){console.error(`Không khởi động được AppChat: ${error.message}. Hãy chạy npm ci.`);stop(1);}
