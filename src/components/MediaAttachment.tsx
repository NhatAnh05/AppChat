import { useState } from 'react';
import { resolveLocalMediaUrl, type LyraMedia } from '../services/mediaMessage';
import { currentSessionSignal, assertCurrentSession, isCurrentSession } from '../services/sessionScope.ts';

function formatSize(size:number|undefined):string {
  if(size===undefined)return '';
  if(size<1024)return `${size} B`;
  if(size<1024*1024)return `${(size/1024).toFixed(1)} KB`;
  return `${(size/(1024*1024)).toFixed(1)} MB`;
}
/** One media item has its own loading/error state. Remount on URL change. */
export default function MediaAttachment({media}:{media:LyraMedia}) {
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [downloadBusy,setDownloadBusy]=useState(false);
  const [downloadError,setDownloadError]=useState('');
  const url = resolveLocalMediaUrl(media.url, window.location.origin, Boolean(import.meta.env.DEV && import.meta.env.VITE_LYRA_LOCAL_MEDIA === '1'));
  const ownMedia=new URL(url).origin===window.location.origin && new URL(url).pathname.startsWith('/api/media/');
  const download=async()=>{
    if(downloadBusy)return;
    const session=currentSessionSignal();
    setDownloadBusy(true);setDownloadError('');
    try{
      const response=await fetch(url,{credentials:'same-origin',signal:session});
      if(!response.ok || /^(application\/json|text\/html)/i.test(response.headers.get('content-type')||''))throw new Error(`Không tải được tệp (HTTP ${response.status}). Tệp cũ có thể chưa có quyền hoặc không còn tồn tại.`);
      const blob=await response.blob();assertCurrentSession(session);
      const blobUrl=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=blobUrl;anchor.download=media.name;anchor.click();
      setTimeout(()=>URL.revokeObjectURL(blobUrl),30_000);
    }catch(error){if(isCurrentSession(session))setDownloadError(error instanceof Error?error.message:'Không tải được tệp.');}
    finally{if(isCurrentSession(session))setDownloadBusy(false);}
  };
  const retry=()=>{setFailed(false);setAttempt(v=>v+1);};
  if(failed)return <div className="lyra-media-fallback" role="status">
    <i className="bi bi-exclamation-circle" aria-hidden="true" />
    <span>Không tải được {media.kind==='video'?'video':'ảnh'}. Tệp có thể đã mất hoặc bạn chưa có quyền truy cập.</span>
    <button type="button" onClick={retry}>Thử lại</button>
    <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Mở tệp</a>
  </div>;
  return <div className="chat-media">
    {(media.kind==='image'||media.kind==='gif')&&<a className="lyra-visual-media" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><img key={attempt} src={url} alt={media.name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)} /></a>}
    {media.kind==='video'&&<video className="lyra-visual-media" key={attempt} src={url} controls playsInline preload="metadata" onError={()=>setFailed(true)} />}
    {media.kind==='file'&&ownMedia&&<><button type="button" className="lyra-file-card lyra-file-download" disabled={downloadBusy} onClick={()=>void download()}>
      <i className="bi bi-file-earmark-arrow-down" aria-hidden="true" />
      <span><strong>{media.name}</strong><small>{downloadBusy?'Đang tải…':formatSize(media.size)||'Tải tệp đính kèm'}</small></span>
    </button>{downloadError&&<p role="alert" className="lyra-file-error">{downloadError}</p>}</>}
    {media.kind==='file'&&!ownMedia&&<a className="media-file-link lyra-file-card" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" download={media.name}>
      <i className="bi bi-file-earmark-arrow-down" aria-hidden="true" />
      <span><strong>{media.name}</strong><small>{formatSize(media.size)||'Tải tệp đính kèm'}</small></span>
    </a>}
  </div>;
}
