import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, FileText, Image as ImageIcon, Info, LockKeyhole, MoreHorizontal, Phone, Plus, Search, SendHorizontal, Smile, UsersRound, Video, X, Paperclip, LoaderCircle, Link as LinkIcon } from 'lucide-react';
import Avatar from './Avatar';
import ActionMenu from './ActionMenu';
import type { Conversation, Message } from '../data/previewContent';
import { isSafeMediaUrl, makeMediaMessage, parseMediaMessage, messagePreview, type MediaItem, type MediaKind } from '../services/mediaMessages';
import { mediaUploadEnabled, MAX_MEDIA_BYTES, uploadMediaFile } from '../services/mediaUpload';
import { readDraft, saveDraft } from '../services/conversationStorage';


type Props = { chat: Conversation | undefined; onBack: () => void; onDetails: () => void; onOpenCallPreview: () => void; messages: Message[]; onSend: (text: string) => boolean; onEdit: (id: string, text: string) => void; onDelete: (id: string) => void; onManageGroup?: () => void; roomBlocked?: boolean; onJoinRoom?: () => void; onRetryMessage?: (id:string)=>boolean; draftNamespace: string; canSend?: boolean };
function MessageBubble({ message, color, onExpand, onRetry }: { message: Message; color: string; onExpand: (url:string)=>void; onRetry?: (id:string)=>boolean }) {
  const media = parseMediaMessage(message.text ?? '');
  return <div className={`message-line ${message.fromMe ? 'mine' : 'theirs'}`}>
    {!message.fromMe && <Avatar initial="L" color={color} size={28} className="message-avatar" />}
    <div className="message-body">
      {message.replyTo && <div className="reply-snippet"><span>Đã trả lời tin nhắn</span>{message.replyTo}</div>}
      {message.attachment === 'photo' && <div className="photo-sample"><div className="photo-sample-graphic"><span className="photo-sample-window"><span/><span/><span/></span><span className="photo-sample-illustration"><i/><i/><i/></span></div><span className="photo-sample-caption"><ImageIcon size={14}/> Bản xem trước thiết kế</span></div>}
      {message.attachment === 'file' && <div className="file-sample"><span className="file-symbol"><FileText size={23}/></span><span className="file-description"><strong>{message.fileName}</strong><small>{message.fileDetail}</small></span><span className="file-menu"><MoreHorizontal size={17}/></span></div>}
      {media && <div className="ly-media-items">{media.items.map((item,i)=>{
        if(item.kind==='sticker')return <div key={i} className="ly-sticker" aria-label="Sticker">{item.sticker}</div>;
        if(!item.url)return null;
        if(item.kind==='image'||item.kind==='gif')return <button type="button" key={i} className="ly-media-photo" onClick={()=>onExpand(item.url!)} title="Xem ảnh lớn"><img loading="lazy" src={item.url} alt={item.name||'Ảnh trong tin nhắn'} referrerPolicy="no-referrer"/><span>{item.kind==='gif'?'GIF':''}</span></button>;
        if(item.kind==='video')return <video key={i} className="ly-media-video" controls preload="metadata" src={item.url} />;
        return <a key={i} className="ly-media-file" href={item.url} target="_blank" rel="noopener noreferrer"><FileText size={24}/><span><strong>{item.name||'Mở tệp đính kèm'}</strong><small>Mở hoặc tải tệp từ liên kết</small></span></a>;
      })}{media.caption && <div className="bubble">{media.caption}</div>}</div>}
      {message.text && !media && <div className="bubble">{message.text.startsWith('[[LYRA_MEDIA_V1]]')?'Không thể đọc nội dung đính kèm.':message.text}</div>}
      {message.emoji && <span className="reaction-preview">{message.emoji}</span>}
      <div className="message-meta"><time>{message.time}</time>{message.id.startsWith('local:') && <span title="Đã gửi qua WebSocket, chưa có xác nhận từ máy chủ"> · Đang chờ xác nhận</span>}{message.id.startsWith('unverified:') && <span role="status"> · Chưa xác minh đã lưu trên server</span>}{message.id.startsWith('failed:') && <span role="alert"> · Máy chủ từ chối</span>}{message.fromMe && !/^(local|unverified|failed):/.test(message.id) && (<Check size={14} aria-label="Máy chủ ghi nhận, chưa xác nhận đã đọc"/>)}</div>
      {message.fromMe && /^(unverified|failed):/.test(message.id) && onRetry && <button type="button" className="ly-message-retry" title="Gửi lại có thể tạo tin trùng nếu máy chủ đã nhận lần trước" onClick={()=>{if(window.confirm('Gửi lại tin này? Nếu máy chủ đã nhận lần trước, người nhận có thể thấy hai bản.')) onRetry(message.id);}}>Gửi lại thủ công</button>}
    </div>
  </div>;
}
export default function ChatPanel({ chat, onBack, onDetails, onOpenCallPreview, messages, onSend, onEdit: _onEdit, onDelete: _onDelete, onManageGroup, roomBlocked = false, onJoinRoom, onRetryMessage, draftNamespace, canSend = true }: Props) {
  const [text, setText] = useState(() => readDraft(draftNamespace, chat?.id ?? ''));
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [mediaTab, setMediaTab] = useState<'image'|'gif'|'video'|'file'|'sticker'|null>(null);
  const [mediaUrls, setMediaUrls] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const stickers=['❤️','🥰','😂','🥳','😭','🔥','👍','👋','💐','🎉','🐱','🐻','🌈','✨','💯','💖'];
  const closeMedia = () => {setMediaTab(null);setMediaError('');setMediaUrls('');setMediaCaption('');};
  const sendMedia = (items:MediaItem[]) => {
    try {const payload=makeMediaMessage(items,mediaCaption);if(onSend(payload)){closeMedia();return true;}setMediaError('Không gửi được vì WebSocket chưa kết nối hoặc máy chủ từ chối yêu cầu.');}
    catch(error){setMediaError(error instanceof Error?error.message:'Nội dung không hợp lệ.');}
    return false;
  };
  const sendLinks = () => {
    if(!mediaTab||mediaTab==='sticker')return;
    const urls=mediaUrls.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
    if(!urls.length){setMediaError('Vui lòng nhập ít nhất một liên kết.');return;}
    if(urls.some(url=>!isSafeMediaUrl(url))){setMediaError('Chỉ chấp nhận liên kết http:// hoặc https:// hợp lệ.');return;}
    sendMedia(urls.map(url=>({kind:mediaTab,url,name:mediaTab==='file'?url.split('/').pop()?.split('?')[0]||'Tệp đính kèm':undefined})));
  };
  const sendSelectedFiles = async(files:FileList|null) => {
    if(!files?.length||!mediaTab||mediaTab==='sticker')return;
    if(!mediaUploadEnabled){setMediaError('API WebSocket của thầy chưa hỗ trợ upload. Hãy tải tệp lên nơi lưu trữ bạn quản lý rồi dán liên kết, hoặc cấu hình dịch vụ VITE_MEDIA_UPLOAD_URL.');return;}
    if(files.length>10){setMediaError('Chọn tối đa 10 tệp mỗi lần.');return;}
    if(Array.from(files).some(f=>f.size>MAX_MEDIA_BYTES)){setMediaError('Tệp vượt giới hạn 25 MB.');return;}
    setUploading(true);setMediaError('');
    try {const items:MediaItem[]=[];
      for(const f of Array.from(files)){const url=await uploadMediaFile(f);const kind:MediaKind=f.type.startsWith('image/gif')?'gif':f.type.startsWith('image/')?'image':f.type.startsWith('video/')?'video':'file';items.push({kind,url,name:f.name,mime:f.type,size:f.size});}
      sendMedia(items);
    }catch(error){setMediaError(error instanceof Error?error.message:'Tải tệp lên thất bại.');}
    finally{setUploading(false);if(fileRef.current)fileRef.current.value='';}
  };
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {setQuery('');setShowSearch(false);setShowEmoji(false);setMediaTab(null);setLightbox('');}, [chat?.id]);
  useEffect(() => {saveDraft(draftNamespace, chat?.id ?? '', text);}, [draftNamespace, chat?.id, text]);
  useEffect(() => {endRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });}, [chat?.id, messages.length]);
  if (!chat) return <main className="chat-main"><div className="welcome-empty"><div className="welcome-glyph"><SendHorizontal size={30}/></div><h2>Tin nhắn của bạn</h2><p>Chọn một cuộc trò chuyện, hoặc tạo hội thoại bằng username thật.</p><span className="ui-only-hint"><LockKeyhole size={14}/> Tin nhắn và phòng chat kết nối WebSocket của giảng viên.</span></div></main>;
  const send = () => { if (!text.trim() || !canSend) return; if (onSend(text)) setText(''); };
  const conversationMatches = messages.filter(message => messagePreview(message.text ?? message.fileName ?? '').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  return <main className="chat-main" aria-label="Nội dung hội thoại">
    <header className="chat-header">
      <button className="icon-button back-button" type="button" title="Quay lại" aria-label="Quay lại danh sách" onClick={onBack}><ArrowLeft size={21}/></button>
      <Avatar initial={chat.initial} color={chat.color} size={41} group={chat.group} presence={chat.presence} />
      <div className="chat-title"><strong>{chat.name}</strong><span>{chat.group ? chat.members : chat.presence === 'online' ? 'Đang hoạt động' : chat.presence === 'away' ? 'Hoạt động gần đây' : 'Trò chuyện riêng tư'}</span></div>
      <div className="chat-header-tools"><button className="icon-button" type="button" aria-label="Gọi thoại" title="Xem giao diện gọi thoại" onClick={onOpenCallPreview}><Phone size={19}/></button><button className="icon-button" type="button" aria-label="Gọi video" title="Xem giao diện gọi video" onClick={onOpenCallPreview}><Video size={21}/></button><button className={`icon-button ${showSearch ? 'pressed' : ''}`} type="button" title="Tìm trong cuộc trò chuyện" aria-label="Tìm tin nhắn" onClick={() => setShowSearch(value => !value)}><Search size={20}/></button><button className="icon-button" type="button" title="Thông tin cuộc trò chuyện" aria-label="Thông tin hội thoại" onClick={onDetails}><Info size={20}/></button><ActionMenu label="Tùy chọn cuộc trò chuyện" triggerClassName="chat-header-more-button" items={[
        { label: 'Tìm trong cuộc trò chuyện', icon: <Search size={17}/>, onSelect: () => setShowSearch(true) },
        { label: 'Xem thông tin hội thoại', icon: <Info size={17}/>, onSelect: onDetails },
        ...(chat.group && onManageGroup ? [{ label: 'Quản lý thành viên nhóm', icon: <UsersRound size={17}/>, onSelect: onManageGroup }] : []),
      ]}/></div>
    </header>
    {showSearch && <div className="in-chat-search"><Search size={17}/><input autoFocus placeholder="Tìm nội dung trong đoạn chat..." aria-label="Tìm trong cuộc trò chuyện" value={query} onChange={e => setQuery(e.target.value)}/><span>{query ? `${conversationMatches.length} kết quả` : 'Nhập từ khóa'}</span><button type="button" aria-label="Đóng tìm kiếm" onClick={() => {setShowSearch(false);setQuery('');}}><X size={18}/></button></div>}
    <section className="message-scroll" aria-label="Tin nhắn từ máy chủ">
      <div className="conversation-intro"><Avatar initial={chat.initial} color={chat.color} group={chat.group} size={66}/><h2>{chat.name}</h2><p>{chat.group ? chat.members : 'Bắt đầu cuộc trò chuyện'}</p><span>Lịch sử được tải từ máy chủ khi chọn hội thoại.</span></div>
      <div className="timeline"><span>Hôm nay</span></div>
      <div className="message-flow">{messages.map((message, index) => <div key={message.id} className={query && messagePreview(message.text ?? message.fileName ?? '').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')) ? 'search-hit' : ''}>
        {message.day && index !== 0 && <div className="timeline"><span>{message.day}</span></div>}
        <MessageBubble message={message} color={chat.color} onExpand={setLightbox} onRetry={onRetryMessage}/>
      </div>)}</div><div ref={endRef}/>
    </section>
    {chat.group && roomBlocked && <div className="room-join-notice" role="status" style={{padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,background:"#f0f5f3"}}><span>Bạn chưa tham gia phòng này nên chưa thể gửi tin nhắn.</span><button type="button" onClick={onJoinRoom} style={{padding:"9px 13px",borderRadius:9,background:"#286456",color:"white",border:0,cursor:"pointer"}}>Tham gia phòng</button></div>}
    <div className="composer" aria-label="Khung soạn tin nhắn">
      <div className="composer-tools"><button type="button" title="Thêm ảnh, GIF, video và tệp" aria-label="Thêm nội dung" className="composer-add" onClick={() => {setShowEmoji(false);setMediaTab(value=>value?null:'image');}}><Plus size={21}/></button><button type="button" title="Chọn biểu tượng cảm xúc" aria-label="Biểu tượng cảm xúc" className="emoji-trigger" onClick={() => setShowEmoji(value => !value)}><Smile size={20}/></button></div>
      <div className="compose-field"><textarea rows={1} aria-label="Soạn tin nhắn" placeholder={roomBlocked ? "Tham gia phòng để nhắn tin" : !canSend ? "Đang mất kết nối – bản nháp được lưu trên máy" : "Nhập tin nhắn..."} disabled={roomBlocked} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/><span className="compose-note">Enter để gửi · Shift + Enter xuống dòng</span></div>
      <button type="button" className="send-button" title="Gửi tin nhắn" aria-label="Gửi tin nhắn" onClick={send} disabled={!text.trim() || roomBlocked || !canSend}><SendHorizontal size={19}/></button>
      {showEmoji && <div className="emoji-sample"><div className="popover-heading">Biểu tượng cảm xúc <button type="button" aria-label="Đóng emoji" onClick={() => setShowEmoji(false)}><X size={15}/></button></div><div className="emoji-grid">{['😀','🙂','😍','😅','😂','👍','❤️','✨','🎉','🙏','💙','🔥'].map(emoji => <button type="button" key={emoji} onClick={() => {setText(t => t + emoji);setShowEmoji(false);}}>{emoji}</button>)}</div><div className="emoji-caption">Emoji Unicode có thể gửi qua SEND_CHAT của thầy.</div></div>}
      {mediaTab && <div className="ly-media-picker" role="dialog" aria-label="Gửi nội dung đính kèm">
        <div className="ly-media-picker-head"><strong>Gửi nội dung</strong><button type="button" aria-label="Đóng" onClick={closeMedia}><X size={17}/></button></div>
        <div className="ly-media-tabs">{([['image','Ảnh'],['gif','GIF'],['video','Video'],['file','Tệp'],['sticker','Sticker']] as const).map(([id,label])=><button type="button" key={id} className={mediaTab===id?'selected':''} onClick={()=>{setMediaTab(id);setMediaError('');}}>{label}</button>)}</div>
        {mediaTab==='sticker' ? <div className="ly-sticker-picker">{stickers.map(st=><button type="button" key={st} title="Gửi sticker" onClick={()=>sendMedia([{kind:'sticker',sticker:st}])}>{st}</button>)}</div> : <div className="ly-media-fields">
          <label>Liên kết {mediaTab==='image'?'ảnh (mỗi dòng một ảnh)':mediaTab==='file'?'tệp':mediaTab.toUpperCase()} công khai
            <textarea rows={3} placeholder="https://example.com/media..." value={mediaUrls} onChange={e=>setMediaUrls(e.target.value)} />
          </label>
          <label>Chú thích (không bắt buộc)<input maxLength={500} value={mediaCaption} onChange={e=>setMediaCaption(e.target.value)} placeholder="Thêm chú thích..." /></label>
          <div className="ly-media-actions"><button type="button" onClick={()=>fileRef.current?.click()} disabled={uploading}><Paperclip size={15}/> Chọn tệp</button><input ref={fileRef} type="file" multiple hidden accept={mediaTab==='image'?'image/*':mediaTab==='gif'?'image/gif':mediaTab==='video'?'video/*':undefined} onChange={e=>void sendSelectedFiles(e.target.files)}/><button type="button" className="primary" disabled={uploading} onClick={sendLinks}>{uploading?<LoaderCircle size={15}/>:<LinkIcon size={15}/>} Gửi liên kết</button></div>
          <small className="ly-media-hint">{mediaUploadEnabled?'Tệp chọn từ máy được tải lên dịch vụ upload đã cấu hình, sau đó gửi liên kết qua API thầy.':'API của thầy hiện chỉ có SEND_CHAT văn bản. Có thể gửi liên kết công khai; muốn tải trực tiếp từ máy cần cấu hình VITE_MEDIA_UPLOAD_URL.'}</small>
        </div>}
        {mediaError && <p className="ly-media-error" role="alert">{mediaError}</p>}
      </div>}
    </div>
    {lightbox && <div className="ly-media-lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh lớn" onClick={()=>setLightbox('')}><button type="button" aria-label="Đóng" onClick={()=>setLightbox('')}><X size={22}/></button><img src={lightbox} alt="Ảnh phóng to" onClick={e=>e.stopPropagation()}/></div>}
    <div className="composer-bottom"><LockKeyhole size={12}/>{!canSend && <strong style={{color:'#ad5c23'}}>Mất kết nối · bản nháp được lưu cục bộ · </strong>} Tin chỉ được xác nhận sau khi máy chủ trả về hoặc xuất hiện trong lịch sử <ChevronDown size={13}/></div>
  </main>;
}
