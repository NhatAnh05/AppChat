import { useEffect, useRef, useState } from 'react';
import { isCurrentSession } from './sessionScope.ts';
import { MAX_FILE_SIZE } from './mediaUpload.ts';
import { voiceRms, voiceSignalWarning, VOICE_SIGNAL_THRESHOLD } from './voiceSignal.ts';
import { finalizeVoiceRecording } from './voiceWav.ts';

const MAX_RECORDING_MS=120_000;
type Capture={stream?:MediaStream; recorder?:MediaRecorder; timer?:ReturnType<typeof setTimeout>; meter?:ReturnType<typeof setInterval>; context?:AudioContext; source?:MediaStreamAudioSourceNode; cancelled:boolean; samples:number; peak:number; started?:number};
function release(capture:Capture) {
  if(capture.timer)clearTimeout(capture.timer);
  if(capture.meter)clearInterval(capture.meter);
  capture.source?.disconnect();
  if(capture.context&&capture.context.state!=='closed')void capture.context.close().catch(()=>{});
  capture.stream?.getTracks().forEach(track=>{track.onmute=null;track.onunmute=null;track.onended=null;track.stop();});
}
export function useVoiceRecorder(session:AbortSignal) {
  const active=useRef<Capture|null>(null);
  const [phase,setPhase]=useState<'idle'|'permission'|'recording'|'stopping'>('idle');
  const [file,setFile]=useState<File|null>(null);
  const [error,setError]=useState('');
  const [warning,setWarning]=useState('');
  const [level,setLevel]=useState(0);
  const [elapsed,setElapsed]=useState(0);
  const [device,setDevice]=useState('');
  useEffect(()=>{
    const dispose=()=>{const capture=active.current;active.current=null;if(!capture)return;capture.cancelled=true;if(capture.recorder?.state==='recording')capture.recorder.stop();release(capture);};
    session.addEventListener('abort',dispose,{once:true});
    return ()=>{session.removeEventListener('abort',dispose);dispose();};
  },[session]);
  const start=async()=>{
    if(active.current||!isCurrentSession(session))return;
    setFile(null);setError('');setWarning('');setLevel(0);setElapsed(0);setDevice('');
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Trình duyệt cần HTTPS hoặc localhost và hỗ trợ ghi âm.');return;}
    const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime){setError('Trình duyệt không hỗ trợ định dạng ghi âm WebM/MP4.');return;}
    const capture:Capture={cancelled:false,samples:0,peak:0};active.current=capture;setPhase('permission');
    // Create/resume while still in the click gesture. Meter failure must not stop recording.
    try {if(typeof AudioContext!=='undefined'){capture.context=new AudioContext();void capture.context.resume().catch(()=>{});}}catch{/* no meter available */}
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:{ideal:1}}});capture.stream=stream;
      if(capture.cancelled||active.current!==capture||!isCurrentSession(session)){release(capture);return;}
      const track=stream.getAudioTracks()[0];
      if(!track||track.readyState!=='live'||!track.enabled)throw new Error('Microphone không có luồng âm thanh đang hoạt động.');
      setDevice(track.label||'Microphone mặc định');
      const recorder=new MediaRecorder(stream,{mimeType:mime});capture.recorder=recorder;
      const current=()=>active.current===capture&&isCurrentSession(session)&&!capture.cancelled;
      track.onmute=()=>{if(current())setWarning('Microphone đang mất tín hiệu. Kiểm tra thiết bị đầu vào.');};
      track.onunmute=()=>{if(current())setWarning('');};
      track.onended=()=>{if(current()){capture.cancelled=true;setError('Microphone đã ngắt kết nối. Hãy ghi âm lại.');if(recorder.state!=='inactive')recorder.stop();release(capture);}};
      let analyser:AnalyserNode|undefined;
      try {if(capture.context){analyser=capture.context.createAnalyser();analyser.fftSize=2048;capture.source=capture.context.createMediaStreamSource(stream);capture.source.connect(analyser);void capture.context.resume().catch(()=>{});}}catch{analyser=undefined;}
      const samples=new Float32Array(2048);
      const chunks:Blob[]=[];let total=0;
      recorder.ondataavailable=event=>{if(capture.cancelled||!event.data.size)return;total+=event.data.size;if(total>MAX_FILE_SIZE){capture.cancelled=true;setError('Bản ghi vượt giới hạn 25 MiB.');if(recorder.state!=='inactive')recorder.stop();return;}chunks.push(event.data);};
      recorder.onstop=()=>{
        release(capture);if(active.current!==capture||!isCurrentSession(session))return;
        setLevel(0);
        if(capture.cancelled||!total){active.current=null;setPhase('idle');if(!capture.cancelled)setError('Bản ghi rỗng.');return;}
        setPhase('stopping');
        void (async()=>{
          try {
            const result=await finalizeVoiceRecording(chunks,recorder.mimeType||mime);
            if(!current())return;
            if(result.peak<VOICE_SIGNAL_THRESHOLD&&capture.peak>=VOICE_SIGNAL_THRESHOLD){
              setError('Microphone có tín hiệu nhưng dữ liệu ghi được gần như im lặng. Hãy ghi lại hoặc thử microphone khác.');return;
            }
            setWarning(voiceSignalWarning(1,result.peak));
            setFile(result.file);
          }catch{if(current())setError('Không giải mã được bản ghi âm. Hãy thử ghi lại hoặc kiểm tra trình duyệt.');}
          finally{if(active.current===capture){active.current=null;if(isCurrentSession(session))setPhase('idle');}}
        })();
      };
      recorder.onerror=()=>{capture.cancelled=true;release(capture);if(active.current===capture){active.current=null;setPhase('idle');setError('Ghi âm thất bại.');}};
      recorder.start(250);capture.started=performance.now();setPhase('recording');
      capture.meter=setInterval(()=>{
        if(!current())return;
        setElapsed(Math.floor((performance.now()-(capture.started??performance.now()))/1000));
        if(!analyser||capture.context?.state!=='running')return;
        analyser.getFloatTimeDomainData(samples);const rms=voiceRms(samples);
        capture.samples++;capture.peak=Math.max(capture.peak,rms);setLevel(Math.min(1,rms*10));
      },100);
      capture.timer=setTimeout(()=>{if(recorder.state==='recording'){setPhase('stopping');recorder.stop();}},MAX_RECORDING_MS);
    } catch(err){release(capture);if(active.current===capture){active.current=null;setPhase('idle');setError(err instanceof Error?err.message:'Không mở được microphone.');}}
  };
  const stop=()=>{const recorder=active.current?.recorder;if(recorder?.state==='recording'){setPhase('stopping');recorder.stop();}};
  const cancel=()=>{const capture=active.current;active.current=null;if(capture){capture.cancelled=true;if(capture.recorder?.state==='recording')capture.recorder.stop();release(capture);}setFile(null);setPhase('idle');setError('');setWarning('');setLevel(0);};
  return {phase,file,error,warning,level,elapsed,device,start,stop,cancel,clearFile:()=>{setFile(null);setWarning('');}};
}
