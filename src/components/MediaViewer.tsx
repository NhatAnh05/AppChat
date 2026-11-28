import { useEffect, useRef, useState } from 'react';
import { resolveLocalMediaUrl, type LyraMedia } from '../services/mediaMessage';
import { currentSessionSignal, assertCurrentSession, isCurrentSession } from '../services/sessionScope.ts';

function mediaUrl(item:LyraMedia) {return resolveLocalMediaUrl(item.url,window.location.origin,Boolean(import.meta.env.DEV&&import.meta.env.VITE_LYRA_LOCAL_MEDIA==='1'));}
export default function MediaViewer({items,initialIndex,onClose}:{items:LyraMedia[];initialIndex:number;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  useEffect(()=>{closeRef.current=onClose;},[onClose]);
  const [index,setIndex]=useState(initialIndex);
  const [zoom,setZoom]=useState(1);
  const [rotation,setRotation]=useState(0);
  const [failed,setFailed]=useState(false);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [session]=useState(currentSessionSignal);
  const item=items[index];
  const select=(next:number)=>{if(next<0||next>=items.length)return;setIndex(next);setZoom(1);setRotation(0);setFailed(false);setNotice('');stage.current?.scrollTo(0,0);};
  useEffect(()=>{
    const el=dialog.current;if(!el)return;
    const previous=document.activeElement;
    const abort=()=>closeRef.current();session.addEventListener('abort',abort,{once:true});
    if(!session.aborted)el.showModal();else abort();
    return ()=>{session.removeEventListener('abort',abort);if(document.fullscreenElement===el)void document.exitFullscreen().catch(()=>{});if(el.open)el.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
  },[session]);
  const download=async()=>{
    if(busy||!item)return;setBusy(true);setNotice('');
    try{
      const response=await fetch(mediaUrl(item),{credentials:'same-origin',referrerPolicy:'no-referrer',signal:session});
      if(!response.ok||!/^image\//i.test(response.headers.get('content-type')||''))throw new Error('Không tải được ảnh gốc.');
      const blob=await response.blob();assertCurrentSession(session);
      if(!dialog.current?.open)return;
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=item.name||'Hinh-anh';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch{if(isCurrentSession(session))setNotice('Không tải được ảnh gốc. Kiểm tra quyền truy cập hoặc kết nối.');}
    finally{if(isCurrentSession(session))setBusy(false);}
  };
  const fullscreen=async()=>{try{if(document.fullscreenElement===dialog.current)await document.exitFullscreen();else await dialog.current?.requestFullscreen();}catch{setNotice('Trình duyệt không hỗ trợ toàn màn hình.');}};
  return <dialog className="lyra-media-viewer" ref={dialog} aria-label="Trình xem ảnh và GIF" onCancel={e=>{e.preventDefault();onClose();}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();select(index+(e.key==='ArrowLeft'?-1:1));}}}>
    <header><span>{item?.name} · {index+1}/{items.length}</span><button type="button" onClick={()=>void download()} disabled={busy}>Tải ảnh</button><button type="button" onClick={onClose} aria-label="Đóng trình xem">✕</button></header>
    <div className="lyra-viewer-main"><button type="button" onClick={()=>select(index-1)} disabled={index===0} aria-label="Ảnh trước">‹</button><div className="lyra-viewer-stage" ref={stage}>
      {failed?<div role="alert">Không tải được ảnh. <button type="button" onClick={()=>setFailed(false)}>Thử lại</button></div>:item&&<img key={index} src={mediaUrl(item)} alt={item.name} referrerPolicy="no-referrer" onError={()=>setFailed(true)} style={{transform:`scale(${zoom}) rotate(${rotation}deg)`}}/>}
    </div><button type="button" onClick={()=>select(index+1)} disabled={index===items.length-1} aria-label="Ảnh sau">›</button></div>
    <div className="lyra-viewer-tools"><button type="button" onClick={()=>setZoom(v=>Math.max(.5,v-.25))} disabled={zoom<=.5} aria-label="Thu nhỏ">−</button><span>{Math.round(zoom*100)}%</span><button type="button" onClick={()=>setZoom(v=>Math.min(4,v+.25))} disabled={zoom>=4} aria-label="Phóng to">+</button><button type="button" onClick={()=>setRotation(v=>(v+90)%360)}>Xoay</button><button type="button" onClick={()=>{setZoom(1);setRotation(0);}}>Đặt lại</button><button type="button" onClick={()=>void fullscreen()}>Toàn màn hình</button></div>
    {notice&&<p role="status">{notice}</p>}
    <div className="lyra-viewer-thumbs">{items.map((entry,i)=><button type="button" key={i} aria-label={`Xem ảnh ${i+1}`} aria-current={i===index} onClick={()=>select(i)}><img src={mediaUrl(entry)} alt="" loading="lazy" referrerPolicy="no-referrer"/></button>)}</div>
  </dialog>;
}
