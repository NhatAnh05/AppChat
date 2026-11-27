import {useCallback, useEffect, useRef, useState} from 'react';
import type {CallMode,CallRequest} from '../services/callEvents';

type Signal = {type:string; callId?:string; from?:string; to?:string; mode?:CallMode; message?:string; sdp?:RTCSessionDescriptionInit; candidate?:RTCIceCandidateInit};
type State = {status:'idle'|'incoming'|'ringing'|'permission'|'connecting'|'active';callId?:string;peer?:string;mode?:CallMode;error?:string;permissionFor?:'self'|'peer'};
const idle:State={status:'idle'};
const iceServers: RTCIceServer[] = [{urls:'stun:stun.l.google.com:19302'}];
const mediaError = (err:unknown) => err instanceof Error ? err.message : 'Không truy cập được micro/camera.';

export default function CallOverlay({username}:{username:string}) {
  const [state,setState]=useState<State>(idle);
  const [connected,setConnected]=useState(false);
  const [muted,setMuted]=useState(false);
  const [cameraOff,setCameraOff]=useState(false);
  const ws=useRef<WebSocket|null>(null);
  const pc=useRef<RTCPeerConnection|null>(null);
  const local=useRef<MediaStream|null>(null);
  const remote=useRef<MediaStream|null>(null);
  const localVideo=useRef<HTMLVideoElement|null>(null);
  const remoteVideo=useRef<HTMLVideoElement|null>(null);
  const remoteAudio=useRef<HTMLAudioElement|null>(null);
  const current=useRef<State>(idle);
  const pendingIce=useRef<RTCIceCandidateInit[]>([]);
  const ready=useRef(false);
  const reconnect=useRef<ReturnType<typeof setTimeout>|null>(null);
  const ringingTimeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  const mediaPermissionTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const mounted=useRef(true);

  const update=(next:State)=>{current.current=next;setState(next);};
  const signal=(data:Record<string,unknown>)=>{if(ws.current?.readyState===WebSocket.OPEN)ws.current.send(JSON.stringify(data));};
  const stopMedia=()=>{
    pc.current?.close(); pc.current=null;
    local.current?.getTracks().forEach(t=>t.stop());local.current=null;
    remote.current?.getTracks().forEach(t=>t.stop());remote.current=null;
    if(localVideo.current)localVideo.current.srcObject=null;
    if(remoteVideo.current)remoteVideo.current.srcObject=null;
    if(remoteAudio.current)remoteAudio.current.srcObject=null;
    pendingIce.current=[];
    if(ringingTimeout.current)clearTimeout(ringingTimeout.current);
    ringingTimeout.current=null;
    if(mediaPermissionTimer.current)clearTimeout(mediaPermissionTimer.current);
    mediaPermissionTimer.current=null;
    setMuted(false);setCameraOff(false);
  };
  const end=useCallback((notify=true)=>{
    const active=current.current;
    if(notify && active.callId)signal({type:'hangup',callId:active.callId});
    stopMedia();update(idle);
  },[]);
  const fail=(message:string)=>{end();update({...idle,error:message});};
  const getMedia=async(mode:CallMode)=>{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Trình duyệt cần HTTPS hoặc localhost để sử dụng micro/camera.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==='video'});
    local.current=stream;
    if(localVideo.current)localVideo.current.srcObject=stream;
    return stream;
  };
  const createPeer=async(mode:CallMode,callId:string)=>{
    const stream=await getMedia(mode);
    if(current.current.callId!==callId){stream.getTracks().forEach(t=>t.stop());throw new Error('Cuộc gọi đã kết thúc.');}
    const conn=new RTCPeerConnection({iceServers});
    pc.current=conn;
    const incoming=new MediaStream();remote.current=incoming;
    if(remoteVideo.current)remoteVideo.current.srcObject=incoming;
    if(remoteAudio.current)remoteAudio.current.srcObject=incoming;
    stream.getTracks().forEach(track=>conn.addTrack(track,stream));
    conn.ontrack=e=>{
      if(pc.current!==conn)return;
      e.streams[0]?.getTracks().forEach(track=>{if(!incoming.getTracks().some(t=>t.id===track.id))incoming.addTrack(track);});
      if(!e.streams[0] && !incoming.getTracks().some(t=>t.id===e.track.id))incoming.addTrack(e.track);
      if(remoteVideo.current)remoteVideo.current.srcObject=incoming;
      if(remoteAudio.current)remoteAudio.current.srcObject=incoming;
      if(current.current.callId===callId)update({...current.current,status:'active'});
    };
    conn.onicecandidate=e=>{if(e.candidate)signal({type:'ice',callId,candidate:e.candidate.toJSON()});};
    conn.onconnectionstatechange=()=>{
      if(pc.current!==conn)return;
      if(conn.connectionState==='connected' && current.current.callId===callId)update({...current.current,status:'active'});
      if(['failed','closed'].includes(conn.connectionState) && current.current.callId===callId)fail('Kết nối cuộc gọi bị gián đoạn. Có thể cần máy chủ TURN.');
    };
    return conn;
  };
  const applyIce=async()=>{
    if(!pc.current?.remoteDescription)return;
    const queue=pendingIce.current.splice(0);
    for(const candidate of queue){try{await pc.current?.addIceCandidate(candidate);}catch{/* ICE candidate incompatible */}}
  };
  const onSignal=async(msg:Signal)=>{
    const active=current.current;
    if(msg.type==='error'){if(active.status!=='idle')fail(msg.message||'Không thể thiết lập cuộc gọi.');else update({...idle,error:msg.message});return;}
    if(msg.type==='incoming' && msg.callId && msg.from && msg.mode){
      if(active.status!=='idle'){signal({type:'reject',callId:msg.callId});return;}
      update({status:'incoming',callId:msg.callId,peer:msg.from,mode:msg.mode});return;
    }
    if(msg.type==='ringing' && active.status==='ringing' && msg.callId){
      update({...active,callId:msg.callId});
      ringingTimeout.current=setTimeout(()=>{if(current.current.callId===msg.callId)fail('Không có người nhận cuộc gọi.');},45000);
      return;
    }
    if(!msg.callId || active.callId!==msg.callId)return;
    try{
      if(msg.type==='reject'){end(false);update({...idle,error:'Người nhận đã từ chối cuộc gọi.'});}
      else if(msg.type==='hangup'){end(false);update({...idle,error:'Cuộc gọi đã kết thúc.'});}
      else if(msg.type==='preparing' && active.status==='ringing'){
        if(ringingTimeout.current)clearTimeout(ringingTimeout.current);
        ringingTimeout.current=null;
        update({...active,status:'permission',permissionFor:'peer'});
        ringingTimeout.current=setTimeout(()=>{if(current.current.callId===msg.callId)fail('Người nhận chưa cấp quyền micro/camera.');},60000);
      }
      else if(msg.type==='accept' && ['ringing','permission'].includes(active.status) && active.mode){
        if(ringingTimeout.current)clearTimeout(ringingTimeout.current);
        update({...active,status:'connecting'});
        const conn=await createPeer(active.mode,msg.callId);
        if(current.current.callId!==msg.callId){end(false);return;}
        const offer=await conn.createOffer();await conn.setLocalDescription(offer);
        signal({type:'offer',callId:msg.callId,sdp:conn.localDescription});
      }
      else if(msg.type==='offer' && msg.sdp && pc.current){
        await pc.current.setRemoteDescription(msg.sdp);await applyIce();
        const answer=await pc.current.createAnswer();await pc.current.setLocalDescription(answer);
        signal({type:'answer',callId:msg.callId,sdp:pc.current.localDescription});
      }
      else if(msg.type==='answer' && msg.sdp && pc.current){await pc.current.setRemoteDescription(msg.sdp);await applyIce();}
      else if(msg.type==='ice' && msg.candidate){
        if(pc.current?.remoteDescription)await pc.current.addIceCandidate(msg.candidate).catch(()=>{});
        else pendingIce.current.push(msg.candidate);
      }
    }catch(err){fail(mediaError(err));}
  };
  const onSignalRef=useRef(onSignal);onSignalRef.current=onSignal;
  useEffect(()=>{
    mounted.current=true; ready.current=false;
    const connect=()=>{
      if(!mounted.current)return;
      const protocol=location.protocol==='https:'?'wss:':'ws:';
      const socket=new WebSocket(`${protocol}//${location.host}/api/calls/ws?user=${encodeURIComponent(username)}`);
      ws.current=socket;
      socket.onopen=()=>{if(ws.current===socket){ready.current=true;setConnected(true);}};
      socket.onmessage=e=>{try{void onSignalRef.current(JSON.parse(String(e.data)) as Signal);}catch{/* malformed */}};
      socket.onclose=()=>{
        if(ws.current!==socket)return;
        ready.current=false;setConnected(false);
        if(current.current.status!=='idle'){stopMedia();update({...idle,error:'Đã mất kết nối máy chủ cuộc gọi.'});}
        if(mounted.current)reconnect.current=setTimeout(connect,3000);
      };
      socket.onerror=()=>{};
    };
    connect();
    return()=>{mounted.current=false;if(reconnect.current)clearTimeout(reconnect.current);if(ringingTimeout.current)clearTimeout(ringingTimeout.current);ws.current?.close();ws.current=null;stopMedia();};
  },[username]);
  useEffect(()=>{
    const onStart=(evt:Event)=>{
      const {to,mode}=(evt as CustomEvent<CallRequest>).detail;
      if(!ready.current){update({...idle,error:'Chưa kết nối máy chủ cuộc gọi. Hãy chạy npm run dev:full.'});return;}
      if(current.current.status!=='idle'){update({...current.current,error:'Bạn đang có một cuộc gọi.'});return;}
      if(to===username){update({...idle,error:'Không thể tự gọi cho chính mình.'});return;}
      update({status:'ringing',peer:to,mode});
      signal({type:'invite',to,mode});
    };
    window.addEventListener('lyra:start-call',onStart);
    return()=>window.removeEventListener('lyra:start-call',onStart);
  },[username]);
  const accept=async()=>{
    const active=current.current;
    if(active.status!=='incoming'||!active.callId||!active.mode)return;
    update({...active,status:'permission',permissionFor:'self'});
    signal({type:'preparing',callId:active.callId});
    try {await createPeer(active.mode,active.callId);if(current.current.callId===active.callId){update({...current.current,status:'connecting'});signal({type:'accept',callId:active.callId});}}
    catch(err){fail(mediaError(err));}
  };
  const reject=()=>{if(current.current.callId)signal({type:'reject',callId:current.current.callId});end(false);};
  const toggleMic=()=>{const next=!muted;local.current?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next);};
  const toggleVideo=()=>{const next=!cameraOff;local.current?.getVideoTracks().forEach(t=>t.enabled=!next);setCameraOff(next);};
  const statusLabel={incoming:'đang gọi cho bạn',ringing:'Đang đổ chuông...',permission:'Đang chờ cấp quyền micro/camera...',connecting:'Đang kết nối...',active:'Đang trong cuộc gọi',idle:''};
  return <>
    {state.status!=='idle' && <div className="lyra-overlay lyra-call-overlay" role="presentation">
      <section className="lyra-live-call" role="dialog" aria-modal="true" aria-label="Cuộc gọi LyraChat">
        <div className="lyra-live-head"><div className="lyra-call-avatar">{state.peer?.slice(0,2).toUpperCase()}</div><h2>{state.peer}</h2><p>{state.status==='incoming'?`${state.mode==='video'?'Video call':'Cuộc gọi thoại'} ${statusLabel.incoming}`:statusLabel[state.status]}</p></div>
        {state.status==='permission' && <p className="lyra-call-hint">{state.permissionFor==='peer' ? 'Người nhận đang cấp quyền micro/camera trong trình duyệt.' : 'Hãy chọn Cho phép (Allow) trong trình duyệt để tiếp tục cuộc gọi.'}</p>}
        {state.mode==='video' && <div className="lyra-call-videos"><video ref={remoteVideo} autoPlay playsInline className="lyra-remote-video"/><video ref={localVideo} autoPlay playsInline muted className="lyra-local-video"/></div>}
        {state.mode==='voice' && <audio ref={remoteAudio} autoPlay playsInline/>}
        {state.status==='incoming' ? <div className="lyra-call-controls"><button className="lyra-call-danger" onClick={reject}><i className="bi bi-telephone-x"/> Từ chối</button><button className="lyra-call-accept" onClick={()=>void accept()}><i className="bi bi-telephone"/> Trả lời</button></div> :
        <div className="lyra-call-controls"><button onClick={toggleMic} disabled={!local.current}><i className={`bi bi-mic${muted?'-mute':''}`}/>{muted?'Bật mic':'Tắt mic'}</button>{state.mode==='video' && <button onClick={toggleVideo} disabled={!local.current}><i className={`bi bi-camera-video${cameraOff?'-off':''}`}/>{cameraOff?'Bật camera':'Tắt camera'}</button>}<button className="lyra-call-danger" onClick={()=>end()}><i className="bi bi-telephone-x"/> Kết thúc</button></div>}
      </section>
    </div>}
    {state.error && state.status==='idle' && <div className="lyra-call-toast" role="alert"><span>{state.error}</span><button onClick={()=>update(idle)} aria-label="Đóng thông báo"><i className="bi bi-x"/></button></div>}
    {!connected && <span className="lyra-call-connection" title="Signaling server chưa kết nối">Cuộc gọi chưa kết nối</span>}
  </>;
}
