import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, BookmarkCheck, Check, ChevronDown, ChevronUp, Copy, Download, FileText, FolderOpen, Forward, Image as ImageIcon, Info, ListChecks, StickyNote, Square, CheckSquare, LockKeyhole, MoreHorizontal, Phone, Plus, Reply, Search, SendHorizontal, Smile, UsersRound, Video, X, Paperclip, LoaderCircle, Link as LinkIcon } from 'lucide-react';
import Avatar from './Avatar';
import ActionMenu from './ActionMenu';
import type { Conversation, Message } from '../data/previewContent';
import { isSafeMediaUrl, makeMediaMessage, parseMediaMessage, type MediaItem, type MediaKind } from '../services/mediaMessages';
import { mediaUploadEnabled, MAX_MEDIA_BYTES, uploadMediaFile } from '../services/mediaUpload';
import { readDraft, saveDraft } from '../services/conversationStorage';
import { bookmarkKey, exportConversation, formatQuotedReply, messageExcerpt, parseQuotedReply, safeExportFilename, searchMessageIds, senderLabel, type TranscriptFormat } from '../services/messageProductivity';
import { readMessageBookmarks, saveMessageBookmarks, toggleMessageBookmark } from '../services/messageBookmarks';
import { collectMediaLibrary, filterMediaLibrary, formatSelectedCopy, pickedMessages, prepareForwardMessage, type LibraryFilter } from '../services/advancedMessages';
import { MAX_NOTE_LENGTH, readConversationNote, saveConversationNote } from '../services/conversationNotes';


type Props = { chat: Conversation | undefined; onBack: () => void; onDetails: () => void; onOpenCallPreview: () => void; messages: Message[]; onSend: (text: string) => boolean; onEdit: (id: string, text: string) => void; onDelete: (id: string) => void; onManageGroup?: () => void; roomBlocked?: boolean; onJoinRoom?: () => void; onRetryMessage?: (id:string)=>boolean; draftNamespace: string; canSend?: boolean; forwardTargets?: Conversation[]; onForward?: (conversationId:string, payload:string)=>boolean };
function MessageBubble({ message, color, onExpand, onRetry, onReply, onCopy, onBookmark, onForward, onSelect, selectionMode, selected, bookmarked }: { message: Message; color: string; onExpand: (url:string)=>void; onRetry?: (id:string)=>boolean; onReply:(message:Message)=>void; onCopy:(message:Message)=>void; onBookmark:(message:Message)=>void; onForward:(message:Message)=>void; onSelect:(id:string)=>void; selectionMode:boolean; selected:boolean; bookmarked:boolean }) {
  const media = parseMediaMessage(message.text ?? '');
  const quoted = media ? null : parseQuotedReply(message.text ?? '');
  return <div className={`message-line ${message.fromMe ? 'mine' : 'theirs'} ${selected ? 'ly-selected-message' : ''}`}>
    {selectionMode && <button type="button" className="ly-message-select" aria-label={selected?'Bỏ chọn tin nhắn':'Chọn tin nhắn'} aria-pressed={selected} onClick={()=>onSelect(message.id)}>{selected?<CheckSquare size={21}/>:<Square size={21}/>}</button>}
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
      {quoted && <div className="reply-snippet ly-quote-reply"><span>↪ {quoted.sender}</span>{quoted.excerpt}</div>}
      {message.text && !media && <div className="bubble">{message.text.startsWith('[[LYRA_MEDIA_V1]]')?'Không thể đọc nội dung đính kèm.':(quoted?.body ?? message.text)}</div>}
      {message.emoji && <span className="reaction-preview">{message.emoji}</span>}
      <div className="message-meta"><time>{message.time}</time>{message.id.startsWith('local:') && <span title="Đã gửi qua WebSocket, chưa có xác nhận từ máy chủ"> · Đang chờ xác nhận</span>}{message.id.startsWith('unverified:') && <span role="status"> · Chưa xác minh đã lưu trên server</span>}{message.id.startsWith('failed:') && <span role="alert"> · Máy chủ từ chối</span>}{message.fromMe && !/^(local|unverified|failed):/.test(message.id) && (<Check size={14} aria-label="Máy chủ ghi nhận, chưa xác nhận đã đọc"/>)}</div>
      {message.fromMe && /^(unverified|failed):/.test(message.id) && onRetry && <button type="button" className="ly-message-retry" title="Gửi lại có thể tạo tin trùng nếu máy chủ đã nhận lần trước" onClick={()=>{if(window.confirm('Gửi lại tin này? Nếu máy chủ đã nhận lần trước, người nhận có thể thấy hai bản.')) onRetry(message.id);}}>Gửi lại thủ công</button>}
      <div className="ly-message-tools" role="group" aria-label="Thao tác tin nhắn">
        <button type="button" title="Trả lời tin nhắn" aria-label="Trả lời tin nhắn" onClick={()=>onReply(message)}><Reply size={15}/></button>
        <button type="button" title="Sao chép nội dung" aria-label="Sao chép nội dung" onClick={()=>onCopy(message)}><Copy size={15}/></button>
        <button type="button" title="Chuyển tiếp đến hội thoại khác" aria-label="Chuyển tiếp tin nhắn" onClick={()=>onForward(message)}><Forward size={15}/></button>
        <button type="button" title={bookmarked?'Bỏ lưu tin nhắn':'Lưu tin nhắn trên máy'} aria-label={bookmarked?'Bỏ lưu tin nhắn':'Lưu tin nhắn trên máy'} aria-pressed={bookmarked} onClick={()=>onBookmark(message)}>{bookmarked?<BookmarkCheck size={15}/>:<Bookmark size={15}/>}</button>
      </div>
    </div>
  </div>;
}
export default function ChatPanel({ chat, onBack, onDetails, onOpenCallPreview, messages, onSend, onEdit: _onEdit, onDelete: _onDelete, onManageGroup, roomBlocked = false, onJoinRoom, onRetryMessage, draftNamespace, canSend = true, forwardTargets = [], onForward }: Props) {
  const [text, setText] = useState(() => readDraft(draftNamespace, chat?.id ?? ''));
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [onlySaved, setOnlySaved] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>(() => readMessageBookmarks(draftNamespace, chat?.id ?? ''));
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [feedback, setFeedback] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [forwardDestination, setForwardDestination] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [showPersonalNote, setShowPersonalNote] = useState(false);
  const [personalNote, setPersonalNote] = useState(() => readConversationNote(draftNamespace, chat?.id ?? ''));
  const [jumpId, setJumpId] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const composeInputRef = useRef<HTMLTextAreaElement>(null);
  const messageElements = useRef(new Map<string, HTMLDivElement>());
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
  const libraryEntries = useMemo(() => collectMediaLibrary(messages), [messages]);
  const displayedLibrary = useMemo(() => filterMediaLibrary(libraryEntries, libraryFilter), [libraryEntries, libraryFilter]);
  const selectedMessages = useMemo(() => pickedMessages(messages, new Set(selectedIds)), [messages, selectedIds]);
  const savedCount = useMemo(() => messages.filter(message => bookmarks.includes(bookmarkKey(message))).length, [bookmarks, messages]);
  const visibleMessages = useMemo(() => onlySaved ? messages.filter(message => bookmarks.includes(bookmarkKey(message))) : messages, [onlySaved, messages, bookmarks]);
  const matchingIds = useMemo(() => searchMessageIds(visibleMessages, query), [visibleMessages, query]);
  const matchingSet = useMemo(() => new Set(matchingIds), [matchingIds]);
  const activeMatchId = matchingIds[Math.min(activeMatch, Math.max(0, matchingIds.length - 1))];
  useEffect(() => {setQuery('');setActiveMatch(0);setShowSearch(false);setOnlySaved(false);setReplyTarget(null);setBookmarks(readMessageBookmarks(draftNamespace, chat?.id ?? ''));setShowEmoji(false);setMediaTab(null);setLightbox('');setSelectionMode(false);setSelectedIds([]);setShowLibrary(false);setForwardMessage(null);setForwardDestination('');setShowPersonalNote(false);setPersonalNote(readConversationNote(draftNamespace, chat?.id ?? ''));setJumpId('');}, [draftNamespace,chat?.id]);
  useEffect(() => {saveDraft(draftNamespace, chat?.id ?? '', text);}, [draftNamespace, chat?.id, text]);
  useEffect(() => {saveConversationNote(draftNamespace, chat?.id ?? '', personalNote);}, [draftNamespace, chat?.id, personalNote]);
  useEffect(() => {if (!showSearch && !onlySaved) endRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });}, [chat?.id, messages.length, showSearch, onlySaved]);
  useEffect(() => {if(showSearch && query.trim() && activeMatchId) messageElements.current.get(activeMatchId)?.scrollIntoView({block:'center',behavior:'smooth'});},[showSearch,query,activeMatchId]);
  useEffect(() => {if (showSearch) searchInputRef.current?.focus();}, [showSearch]);
  useEffect(()=>{if(jumpId && messageElements.current.has(jumpId))messageElements.current.get(jumpId)?.scrollIntoView({block:'center',behavior:'smooth'});},[jumpId,visibleMessages]);
  useEffect(() => {
    const keyboard = (event:KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase()==='f') {event.preventDefault();setShowSearch(true);}
      if (event.key==='Escape') {setLightbox('');setMediaTab(null);setShowEmoji(false);setShowSearch(false);setReplyTarget(null);setForwardMessage(null);setShowLibrary(false);setSelectedIds([]);setSelectionMode(false);}
    };
    window.addEventListener('keydown',keyboard);
    return () => window.removeEventListener('keydown',keyboard);
  },[]);
  const toggleBookmark = (message:Message) => {
    const next = toggleMessageBookmark(bookmarks,bookmarkKey(message));
    setBookmarks(next);saveMessageBookmarks(draftNamespace, chat?.id ?? '',next);
    setFeedback(next.length>bookmarks.length?'Đã lưu tin nhắn trên thiết bị này.':'Đã bỏ lưu tin nhắn.');
  };
  const copyMessage = async (message:Message) => {
    const content = message.text ?? message.fileName ?? '';
    try {if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(content);setFeedback('Đã sao chép nội dung tin nhắn.');}
    catch {window.prompt('Trình duyệt không cho sao chép tự động. Sao chép nội dung sau:',content);}
  };
  const exportLoadedMessages = (format:TranscriptFormat) => {
    if (!chat || !messages.length) {setFeedback('Chưa có tin nhắn để xuất.');return;}
    const content=exportConversation(chat.name,messages,format);
    const blob = new Blob([content],{type:format==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=safeExportFilename(chat.name,format);document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    setFeedback(`Đã xuất ${messages.length} tin đang tải trong trình duyệt (không phải toàn bộ lịch sử server).`);
  };
  const clearSelection = () => {setSelectedIds([]);setSelectionMode(false);};
  const toggleSelected = (id:string) => setSelectedIds(old=>old.includes(id)?old.filter(item=>item!==id):[...old,id]);
  const bulkSave = () => {
    if(!selectedMessages.length)return;
    const saved = new Set(bookmarks);
    selectedMessages.forEach(message=>saved.add(bookmarkKey(message)));
    const next=[...saved].slice(-500);
    setBookmarks(next);saveMessageBookmarks(draftNamespace, chat?.id ?? '',next);
    setFeedback(`Đã lưu ${selectedMessages.length} tin được chọn trên thiết bị này.`);clearSelection();
  };
  const bulkCopy = async () => {
    if(!chat || !selectedMessages.length)return;
    const content = formatSelectedCopy(chat.name,selectedMessages);
    try{if(!navigator.clipboard?.writeText)throw new Error('clipboard');await navigator.clipboard.writeText(content);setFeedback(`Đã sao chép ${selectedMessages.length} tin.`);}
    catch{window.prompt('Sao chép nội dung đã chọn:',content);}
  };
  const bulkExport = (format:TranscriptFormat) => {
    if(!chat || !selectedMessages.length)return;
    const content=exportConversation(chat.name,selectedMessages,format);
    const blob=new Blob([content],{type:format==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');
    link.href=url;link.download=safeExportFilename(`${chat.name}-da-chon`,format);
    document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    setFeedback(`Đã xuất ${selectedMessages.length} tin được chọn (chỉ những tin đang tải).`);
  };
  const startForward = (message:Message) => {setForwardMessage(message);setForwardDestination('');};
  const forwardSelected = () => {
    if(!forwardMessage || !forwardDestination || !onForward || !canSend) return;
    const payload=prepareForwardMessage(forwardMessage);
    if(!payload){setFeedback('Tin này không thể chuyển tiếp dưới dạng SEND_CHAT.');return;}
    if(onForward(forwardDestination,payload)) {
      setFeedback('Đã gửi yêu cầu chuyển tiếp; cần chờ máy chủ xác nhận việc nhận tin.');
      setForwardMessage(null);setForwardDestination('');
    }else{setFeedback('Chuyển tiếp không thành công. Kiểm tra kết nối hoặc quyền gửi vào phòng.');}
  };
  const goToMessage = (id:string) => {setOnlySaved(false);setShowSearch(false);setShowLibrary(false);setJumpId(id);};
  if (!chat) return <main className="chat-main"><div className="welcome-empty"><div className="welcome-glyph"><SendHorizontal size={30}/></div><h2>Tin nhắn của bạn</h2><p>Chọn một cuộc trò chuyện, hoặc tạo hội thoại bằng username thật.</p><span className="ui-only-hint"><LockKeyhole size={14}/> Tin nhắn và phòng chat kết nối WebSocket của giảng viên.</span></div></main>;
  const send = () => {
    if (!text.trim() || !canSend || roomBlocked) return;
    const content = replyTarget ? formatQuotedReply(replyTarget,senderLabel(replyTarget,chat.name),text) : text;
    if (onSend(content)) {setText('');setReplyTarget(null);}
  };
  const replyToMessage = (message:Message) => {setReplyTarget(message);composeInputRef.current?.focus();};
  const goToMatch = (step:number) => {if(matchingIds.length)setActiveMatch(current => (current + step + matchingIds.length) % matchingIds.length);};
  return <main className="chat-main" aria-label="Nội dung hội thoại">
    <header className="chat-header">
      <button className="icon-button back-button" type="button" title="Quay lại" aria-label="Quay lại danh sách" onClick={onBack}><ArrowLeft size={21}/></button>
      <Avatar initial={chat.initial} color={chat.color} size={41} group={chat.group} presence={chat.presence} />
      <div className="chat-title"><strong>{chat.name}</strong><span>{chat.group ? chat.members : chat.presence === 'online' ? 'Đang hoạt động' : chat.presence === 'away' ? 'Hoạt động gần đây' : 'Trò chuyện riêng tư'}</span></div>
      <div className="chat-header-tools"><button className="icon-button" type="button" aria-label="Gọi thoại" title="Xem giao diện gọi thoại" onClick={onOpenCallPreview}><Phone size={19}/></button><button className="icon-button" type="button" aria-label="Gọi video" title="Xem giao diện gọi video" onClick={onOpenCallPreview}><Video size={21}/></button><button className={`icon-button ${showLibrary ? 'pressed' : ''}`} type="button" title="Xem thư viện ảnh, video, tệp đã tải" aria-label="Thư viện hội thoại" aria-pressed={showLibrary} onClick={()=>setShowLibrary(value=>!value)}><FolderOpen size={19}/></button><button className={`icon-button ${onlySaved ? 'pressed' : ''}`} type="button" title="Hiện tin đã lưu trên thiết bị" aria-label="Lọc tin đã lưu" aria-pressed={onlySaved} onClick={()=>{setOnlySaved(value=>!value);setActiveMatch(0);}}>{onlySaved?<BookmarkCheck size={19}/>:<Bookmark size={19}/>}</button><button className={`icon-button ${showSearch ? 'pressed' : ''}`} type="button" title="Tìm trong cuộc trò chuyện" aria-label="Tìm tin nhắn" onClick={() => setShowSearch(value => !value)}><Search size={20}/></button><button className="icon-button" type="button" title="Thông tin cuộc trò chuyện" aria-label="Thông tin hội thoại" onClick={onDetails}><Info size={20}/></button><ActionMenu label="Tùy chọn cuộc trò chuyện" triggerClassName="chat-header-more-button" items={[
        { label: 'Chọn nhiều tin nhắn', icon: <ListChecks size={17}/>, onSelect: () => {setSelectionMode(value=>!value);setSelectedIds([]);} },
        { label: 'Ghi chú cá nhân (chỉ trên máy)', icon: <StickyNote size={17}/>, onSelect: () => setShowPersonalNote(value=>!value) },
        { label: 'Thư viện ảnh, video và tệp', icon: <FolderOpen size={17}/>, onSelect: () => setShowLibrary(value=>!value) },
        { label: 'Tìm trong cuộc trò chuyện', icon: <Search size={17}/>, onSelect: () => setShowSearch(true) },
        { label: 'Chỉ hiện tin đã lưu (trên máy)', icon: <Bookmark size={17}/>, onSelect: () => {setOnlySaved(value=>!value);setActiveMatch(0);} },
        { label: 'Xuất tin đã tải (.txt)', icon: <Download size={17}/>, onSelect: () => exportLoadedMessages('txt') },
        { label: 'Xuất tin đã tải (.json)', icon: <Download size={17}/>, onSelect: () => exportLoadedMessages('json') },
        { label: 'Xem thông tin hội thoại', icon: <Info size={17}/>, onSelect: onDetails },
        ...(chat.group && onManageGroup ? [{ label: 'Quản lý thành viên nhóm', icon: <UsersRound size={17}/>, onSelect: onManageGroup }] : []),
      ]}/></div>
    </header>
    {showSearch && <div className="in-chat-search ly-search-nav"><Search size={17}/><input ref={searchInputRef} placeholder="Tìm trong tin đã tải (không dấu cũng được)..." aria-label="Tìm trong cuộc trò chuyện" value={query} onChange={e => {setQuery(e.target.value);setActiveMatch(0);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();goToMatch(e.shiftKey?-1:1);}}}/><span aria-live="polite">{query ? `${matchingIds.length ? Math.min(activeMatch+1,matchingIds.length) : 0}/${matchingIds.length}` : 'Nhập từ khóa'}</span><button type="button" disabled={!matchingIds.length} title="Kết quả trước" aria-label="Kết quả trước" onClick={()=>goToMatch(-1)}><ChevronUp size={18}/></button><button type="button" disabled={!matchingIds.length} title="Kết quả sau" aria-label="Kết quả sau" onClick={()=>goToMatch(1)}><ChevronDown size={18}/></button><button type="button" aria-label="Đóng tìm kiếm" onClick={() => {setShowSearch(false);setQuery('');}}><X size={18}/></button></div>}
    {showPersonalNote && <section className="ly-private-note" aria-label="Ghi chú cá nhân">
      <div><StickyNote size={16}/><strong>Ghi chú cá nhân — {chat.name}</strong><button type="button" aria-label="Đóng ghi chú" onClick={()=>setShowPersonalNote(false)}><X size={17}/></button></div>
      <textarea aria-label="Nội dung ghi chú" value={personalNote} maxLength={MAX_NOTE_LENGTH} onChange={event=>setPersonalNote(event.target.value)} placeholder="Lưu nhắc nhở riêng về cuộc trò chuyện này..." rows={3}/>
      <small>Tự lưu trên trình duyệt này, không gửi đến máy chủ và không chia sẻ cho người khác · {personalNote.length}/{MAX_NOTE_LENGTH} ký tự.</small>
    </section>}
    {showLibrary && <section className="ly-library" aria-label="Thư viện nội dung đã tải">
      <div className="ly-library-head"><strong><FolderOpen size={16}/> Thư viện của hội thoại ({libraryEntries.length})</strong><button type="button" aria-label="Đóng thư viện" onClick={()=>setShowLibrary(false)}><X size={17}/></button></div>
      <div className="ly-library-filters">{([['all','Tất cả'],['image','Ảnh & GIF'],['video','Video'],['file','Tệp'],['sticker','Sticker']] as const).map(([id,label])=><button type="button" key={id} className={libraryFilter===id?'selected':''} aria-pressed={libraryFilter===id} onClick={()=>setLibraryFilter(id)}>{label}</button>)}</div>
      <div className="ly-library-grid">{displayedLibrary.map(item=><div className="ly-library-entry" key={`${item.messageId}:${item.index}`}>
        {(item.kind==='image'||item.kind==='gif') && item.url ? <button type="button" className="ly-library-thumb" title="Xem lớn" onClick={()=>setLightbox(item.url!)}><img src={item.url} alt={item.name} loading="lazy" referrerPolicy="no-referrer"/></button> : <div className="ly-library-symbol">{item.kind==='video'?'🎬':item.kind==='file'?'📎':'😊'}</div>}
        <span title={item.caption || item.name}>{item.name}</span><button type="button" onClick={()=>goToMessage(item.messageId)} title="Đi đến tin nhắn gốc">Xem tin</button>
      </div>)}{!displayedLibrary.length && <div className="ly-library-empty">Không có nội dung phù hợp trong các tin nhắn đã tải.</div>}</div>
      <small>Chỉ liệt kê nội dung có trong lịch sử đã tải. Liên kết đính kèm vẫn phụ thuộc nơi lưu trữ bên ngoài.</small>
    </section>}
    {selectionMode && <div className="ly-bulk-bar" role="toolbar" aria-label="Thao tác nhiều tin nhắn"><ListChecks size={17}/><strong>{selectedMessages.length} tin đã chọn</strong>
      <button type="button" disabled={!messages.length} onClick={()=>setSelectedIds(messages.map(message=>message.id))}>Chọn tất cả tin đã tải</button>
      <button type="button" disabled={!selectedMessages.length} onClick={()=>void bulkCopy()}><Copy size={14}/> Sao chép</button>
      <button type="button" disabled={!selectedMessages.length} onClick={bulkSave}><Bookmark size={14}/> Lưu tin</button>
      <button type="button" disabled={!selectedMessages.length} onClick={()=>bulkExport('txt')}><Download size={14}/> TXT</button>
      <button type="button" disabled={!selectedMessages.length} onClick={()=>bulkExport('json')}><Download size={14}/> JSON</button>
      <button type="button" onClick={clearSelection}><X size={14}/> Đóng</button>
    </div>}
    {onlySaved && <div className="ly-saved-filter" role="status"><BookmarkCheck size={15}/> Đang xem {savedCount} tin đã lưu trong lịch sử đã tải. Dữ liệu lưu riêng trên trình duyệt này. <button type="button" onClick={()=>setOnlySaved(false)}>Hiện tất cả</button></div>}
    {feedback && <div className="ly-message-feedback" role="status">{feedback}<button type="button" aria-label="Đóng thông báo" onClick={()=>setFeedback('')}><X size={13}/></button></div>}
    <section className="message-scroll" aria-label="Tin nhắn từ máy chủ">
      <div className="conversation-intro"><Avatar initial={chat.initial} color={chat.color} group={chat.group} size={66}/><h2>{chat.name}</h2><p>{chat.group ? chat.members : 'Bắt đầu cuộc trò chuyện'}</p><span>Lịch sử được tải từ máy chủ khi chọn hội thoại.</span></div>
      <div className="timeline"><span>Hôm nay</span></div>
      <div className="message-flow">{visibleMessages.map((message, index) => <div ref={node=>{if(node)messageElements.current.set(message.id,node);else messageElements.current.delete(message.id);}} key={message.id} className={`${matchingSet.has(message.id) ? 'search-hit' : ''} ${activeMatchId===message.id && showSearch && query ? 'ly-search-current' : ''} ${jumpId===message.id ? 'ly-library-jump' : ''}`}>
        {message.day && index !== 0 && <div className="timeline"><span>{message.day}</span></div>}
        <MessageBubble message={message} color={chat.color} onExpand={setLightbox} onRetry={onRetryMessage} onReply={replyToMessage} onCopy={copyMessage} onBookmark={toggleBookmark} onForward={startForward} onSelect={toggleSelected} selectionMode={selectionMode} selected={selectedIds.includes(message.id)} bookmarked={bookmarks.includes(bookmarkKey(message))}/>
      </div>)}{onlySaved && !visibleMessages.length && <div className="ly-saved-empty">Chưa có tin nhắn được lưu trong cuộc trò chuyện này.</div>}</div><div ref={endRef}/>
    </section>
    {chat.group && roomBlocked && <div className="room-join-notice" role="status" style={{padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,background:"#f0f5f3"}}><span>Bạn chưa tham gia phòng này nên chưa thể gửi tin nhắn.</span><button type="button" onClick={onJoinRoom} style={{padding:"9px 13px",borderRadius:9,background:"#286456",color:"white",border:0,cursor:"pointer"}}>Tham gia phòng</button></div>}
    {replyTarget && <div className="ly-compose-reply"><Reply size={16}/><div><strong>Đang trả lời {senderLabel(replyTarget,chat.name)}</strong><span>{messageExcerpt(replyTarget)}</span></div><button type="button" aria-label="Hủy trả lời" onClick={()=>setReplyTarget(null)}><X size={17}/></button></div>}
    <div className="composer" aria-label="Khung soạn tin nhắn">
      <div className="composer-tools"><button type="button" title="Thêm ảnh, GIF, video và tệp" aria-label="Thêm nội dung" className="composer-add" onClick={() => {setShowEmoji(false);setMediaTab(value=>value?null:'image');}}><Plus size={21}/></button><button type="button" title="Chọn biểu tượng cảm xúc" aria-label="Biểu tượng cảm xúc" className="emoji-trigger" onClick={() => setShowEmoji(value => !value)}><Smile size={20}/></button></div>
      <div className="compose-field"><textarea ref={composeInputRef} rows={1} aria-label="Soạn tin nhắn" placeholder={roomBlocked ? "Tham gia phòng để nhắn tin" : !canSend ? "Đang mất kết nối – bản nháp được lưu trên máy" : "Nhập tin nhắn..."} disabled={roomBlocked} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/><span className="compose-note">Enter để gửi · Shift + Enter xuống dòng</span></div>
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
    {forwardMessage && <div className="ly-forward-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setForwardMessage(null);}}>
      <div className="ly-forward-modal" role="dialog" aria-modal="true" aria-label="Chuyển tiếp tin nhắn">
        <div className="ly-library-head"><strong><Forward size={17}/> Chuyển tiếp tin nhắn</strong><button type="button" aria-label="Đóng chuyển tiếp" onClick={()=>setForwardMessage(null)}><X size={18}/></button></div>
        <p className="ly-forward-preview">{messageExcerpt(forwardMessage,220)}</p>
        <label>Chọn hội thoại nhận
          <select aria-label="Hội thoại nhận chuyển tiếp" value={forwardDestination} onChange={event=>setForwardDestination(event.target.value)}>
            <option value="">-- Chọn hội thoại --</option>
            {forwardTargets.filter(target=>target.id!==chat.id).map(target=><option key={target.id} value={target.id}>{target.group?'[Nhóm] ':''}{target.name}</option>)}
          </select>
        </label>
        {!forwardTargets.some(target=>target.id!==chat.id) && <p>Chưa có hội thoại khác. Hãy tạo hội thoại trước khi chuyển tiếp.</p>}
        <small>Nội dung được gửi bằng SEND_CHAT của giảng viên. Tin ảnh/tệp được chuyển dưới dạng liên kết gốc; gửi đi chưa đồng nghĩa người nhận đã đọc.</small>
        <div className="ly-forward-actions"><button type="button" onClick={()=>setForwardMessage(null)}>Hủy</button><button type="button" disabled={!forwardDestination || !canSend || !onForward} onClick={forwardSelected}><Forward size={15}/> Chuyển tiếp</button></div>
      </div>
    </div>}
    {lightbox && <div className="ly-media-lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh lớn" onClick={()=>setLightbox('')}><button type="button" aria-label="Đóng" onClick={()=>setLightbox('')}><X size={22}/></button><img src={lightbox} alt="Ảnh phóng to" onClick={e=>e.stopPropagation()}/></div>}
    <div className="composer-bottom"><LockKeyhole size={12}/>{!canSend && <strong style={{color:'#ad5c23'}}>Mất kết nối · bản nháp được lưu cục bộ · </strong>} Ctrl+Shift+F tìm trong chat · Tin chỉ được xác nhận sau khi máy chủ trả về hoặc xuất hiện trong lịch sử <ChevronDown size={13}/></div>
  </main>;
}
