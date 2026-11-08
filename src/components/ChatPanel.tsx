import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, ChevronDown, FileText, Image as ImageIcon, Info, LockKeyhole, MoreHorizontal, Phone, Plus, Search, SendHorizontal, Smile, UsersRound, Video, X } from 'lucide-react';
import Avatar from './Avatar';
import ActionMenu from './ActionMenu';
import type { Conversation, Message } from '../data/previewContent';


type Props = { chat: Conversation | undefined; onBack: () => void; onDetails: () => void; onOpenCallPreview: () => void; messages: Message[]; onSend: (text: string) => boolean; onEdit: (id: string, text: string) => void; onDelete: (id: string) => void; onManageGroup?: () => void; roomBlocked?: boolean; onJoinRoom?: () => void };
function MessageBubble({ message, color }: { message: Message; color: string }) {
  return <div className={`message-line ${message.fromMe ? 'mine' : 'theirs'}`}>
    {!message.fromMe && <Avatar initial="L" color={color} size={28} className="message-avatar" />}
    <div className="message-body">
      {message.replyTo && <div className="reply-snippet"><span>Đã trả lời tin nhắn</span>{message.replyTo}</div>}
      {message.attachment === 'photo' && <div className="photo-sample"><div className="photo-sample-graphic"><span className="photo-sample-window"><span/><span/><span/></span><span className="photo-sample-illustration"><i/><i/><i/></span></div><span className="photo-sample-caption"><ImageIcon size={14}/> Bản xem trước thiết kế</span></div>}
      {message.attachment === 'file' && <div className="file-sample"><span className="file-symbol"><FileText size={23}/></span><span className="file-description"><strong>{message.fileName}</strong><small>{message.fileDetail}</small></span><span className="file-menu"><MoreHorizontal size={17}/></span></div>}
      {message.text && <div className="bubble">{message.text}</div>}
      {message.emoji && <span className="reaction-preview">{message.emoji}</span>}
      <div className="message-meta"><time>{message.time}</time>{message.id.startsWith('local:') && <span title="Đã gửi qua WebSocket, chưa có xác nhận từ máy chủ"> · Đang chờ xác nhận</span>}{message.id.startsWith('unverified:') && <span role="status"> · Chưa xác minh đã lưu trên server</span>}{message.id.startsWith('failed:') && <span role="alert"> · Máy chủ từ chối</span>}{message.fromMe && (message.seen ? <CheckCheck size={14} className="seen-icon"/> : <CheckCheck size={14}/>)}</div>
    </div>
  </div>;
}
export default function ChatPanel({ chat, onBack, onDetails, onOpenCallPreview, messages, onSend, onEdit: _onEdit, onDelete: _onDelete, onManageGroup, roomBlocked = false, onJoinRoom }: Props) {
  const [text, setText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {setText('');setQuery('');setShowSearch(false);setShowEmoji(false);}, [chat?.id]);
  useEffect(() => {endRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });}, [chat?.id, messages.length]);
  if (!chat) return <main className="chat-main"><div className="welcome-empty"><div className="welcome-glyph"><SendHorizontal size={30}/></div><h2>Tin nhắn của bạn</h2><p>Chọn một cuộc trò chuyện, hoặc tạo hội thoại bằng username thật.</p><span className="ui-only-hint"><LockKeyhole size={14}/> Tin nhắn và phòng chat kết nối WebSocket của giảng viên.</span></div></main>;
  const send = () => { if (!text.trim()) return; if (onSend(text)) setText(''); };
  const conversationMatches = messages.filter(message => (message.text ?? message.fileName ?? '').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
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
      <div className="message-flow">{messages.map((message, index) => <div key={message.id} className={query && (message.text ?? message.fileName ?? '').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')) ? 'search-hit' : ''}>
        {message.day && index !== 0 && <div className="timeline"><span>{message.day}</span></div>}
        <MessageBubble message={message} color={chat.color}/>
      </div>)}</div><div ref={endRef}/>
    </section>
    {chat.group && roomBlocked && <div className="room-join-notice" role="status" style={{padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,background:"#f0f5f3"}}><span>Bạn chưa tham gia phòng này nên chưa thể gửi tin nhắn.</span><button type="button" onClick={onJoinRoom} style={{padding:"9px 13px",borderRadius:9,background:"#286456",color:"white",border:0,cursor:"pointer"}}>Tham gia phòng</button></div>}
    <div className="composer" aria-label="Khung soạn tin nhắn">
      <div className="composer-tools"><button type="button" title="Thêm nội dung" aria-label="Thêm nội dung" className="composer-add" onClick={() => setShowEmoji(value => !value)}><Plus size={21}/></button><button type="button" title="Chọn biểu tượng cảm xúc" aria-label="Biểu tượng cảm xúc" className="emoji-trigger" onClick={() => setShowEmoji(value => !value)}><Smile size={20}/></button></div>
      <div className="compose-field"><textarea rows={1} aria-label="Soạn tin nhắn" placeholder={roomBlocked ? "Tham gia phòng để nhắn tin" : "Nhập tin nhắn..."} disabled={roomBlocked} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/><span className="compose-note">Enter để gửi · Shift + Enter xuống dòng</span></div>
      <button type="button" className="send-button" title="Gửi tin nhắn" aria-label="Gửi tin nhắn" onClick={send} disabled={!text.trim() || roomBlocked}><SendHorizontal size={19}/></button>
      {showEmoji && <div className="emoji-sample"><div className="popover-heading">Biểu tượng cảm xúc <button type="button" aria-label="Đóng emoji" onClick={() => setShowEmoji(false)}><X size={15}/></button></div><div className="emoji-grid">{['😀','🙂','😍','😅','😂','👍','❤️','✨','🎉','🙏','💙','🔥'].map(emoji => <button type="button" key={emoji} onClick={() => {setText(t => t + emoji);setShowEmoji(false);}}>{emoji}</button>)}</div><div className="emoji-caption">Bảng emoji minh họa</div></div>}
    </div>
    <div className="composer-bottom"><LockKeyhole size={12}/> Tin chỉ được xác nhận sau khi máy chủ trả về hoặc xuất hiện trong lịch sử <ChevronDown size={13}/></div>
  </main>;
}
