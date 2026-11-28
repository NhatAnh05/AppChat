import { useEffect, useRef } from 'react';
export default function VoicePreview({file}:{file:File}) {
  const audio=useRef<HTMLAudioElement>(null);
  useEffect(()=>{
    const element=audio.current;if(!element)return;
    const url=URL.createObjectURL(file);element.src=url;
    return ()=>{element.pause();element.removeAttribute('src');element.load();URL.revokeObjectURL(url);};
  },[file]);
  return <audio ref={audio} controls preload="metadata" aria-label="Nghe thử bản ghi âm trước khi gửi"/>;
}
