import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, ChevronDown, FileText, Image as ImageIcon, Info, LockKeyhole, MoreHorizontal, Paperclip, Phone, Plus, Search, SendHorizontal, Smile, Video, X } from 'lucide-react';
import Avatar from './Avatar';
import type { Conversation, Message } from '../data/previewContent';


type Props = { chat: Conversation | undefined; onBack: () => void; onDetails: () => void; onOpenCallPreview: () => void; messages: Message[]; onSend: (text: string) => void };
function MessageBubble({ message, color }: { message: Message; color: string }) {
  return <div className={`message-line ${message.fromMe ? 'mine' : 'theirs'}`}>
    {!message.fromMe && <Avatar initial="L" color={color} size={28} className="message-avatar" />}
    <div className="message-body">
      {message.replyTo && <div className="reply-snippet"><span>Đã trả lời tin nhắn</span>{message.replyTo}</div>}
      {message.attachment === 'photo' && <div className="photo-sample"><div className="photo-sample-graphic"><span className="photo-sample-window"><span/><span/><span/></span><span className="photo-sample-illustration"><i/><i/><i/></span></div><span className="photo-sample-caption"><ImageIcon size={14}/> Bản xem trước thiết kế</span></div>}
      {message.attachment === 'file' && <div className="file-sample"><span className="file-symbol"><FileText size={23}/></span><span className="file-description"><strong>{message.fileName}</strong><small>{message.fileDetail}</small></span><span className="file-menu"><MoreHorizontal size={17}/></span></div>}
      {message.text && <div className="bubble">{message.text}</div>}
      {message.emoji && <span className="reaction-preview">{message.emoji}</span>}
      <div className="message-meta"><time>{message.time}</time>{message.fromMe && (message.seen ? <CheckCheck size={14} className="seen-icon"/> : <CheckCheck size={14}/>)}</div>
    </div>
  </div>;
}
export default function ChatPanel({ chat, onBack, onDetails, onOpenCallPreview, messages, onSend }: Props) {
  const [text, setText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [menu, setMenu] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {setText('');setQuery('');setShowSearch(false);setShowEmoji(false);setMenu(false);}, [chat?.id]);
  useEffect(() => {endRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });}, [chat?.id, messages.length]);
  if (!chat) return <main className="chat-main"><div className="welcome-empty"><div className="welcome-glyph"><SendHorizontal size={30}/></div><h2>Tin nhắn của bạn</h2><p>Chọn một cuộc trò chuyện ở bên trái để xem bản thiết kế cửa sổ nhắn tin.</p><span className="ui-only-hint"><LockKeyhole size={14}/> Đây là nguyên mẫu giao diện, chưa kết nối API.</span></div></main>;
  const send = () => { if (!text.trim()) return; onSend(text); setText(''); };
  const conversationMatches = messages.filter(message => (message.text ?? message.fileName ?? '').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  return <main className="chat-main" aria-label="Nội dung hội thoại">
    <header className="chat-header">
      <button className="icon-button back-button" type="button" title="Quay lại" aria-label="Quay lại danh sách" onClick={onBack}><ArrowLeft size={21}/></button>
      <Avatar initial={chat.initial} color={chat.color} size={41} group={chat.group} presence={chat.presence} />
      <div className="chat-title"><strong>{chat.name}</strong><span>{chat.group ? chat.members : chat.presence === 'online' ? 'Đang hoạt động' : chat.presence === 'away' ? 'Hoạt động gần đây' : 'Trò chuyện riêng tư'}</span></div>
      <div className="chat-header-tools"><button className="icon-button" type="button" aria-label="Gọi thoại" title="Xem giao diện gọi thoại" onClick={onOpenCallPreview}><Phone size={19}/></button><button className="icon-button" type="button" aria-label="Gọi video" title="Xem giao diện gọi video" onClick={onOpenCallPreview}><Video size={21}/></button><button className={`icon-button ${showSearch ? 'pressed' : ''}`} type="button" title="Tìm trong cuộc trò chuyện" aria-label="Tìm tin nhắn" onClick={() => setShowSearch(value => !value)}><Search size={20}/></button><button className="icon-button" type="button" title="Thông tin cuộc trò chuyện" aria-label="Thông tin hội thoại" onClick={onDetails}><Info size={20}/></button><button className="icon-button more-trigger" type="button" title="Thêm tùy chọn" aria-label="Thêm tùy chọn" onClick={() => setMenu(value => !value)}><MoreHorizontal size={20}/></button></div>
      {menu && <div className="floating-menu header-menu"><button type="button" onClick={() => {setShowSearch(true);setMenu(false);}}>Tìm trong cuộc trò chuyện</button><button type="button" onClick={() => {onDetails();setMenu(false);}}>Xem thông tin hội thoại</button><span className="menu-footnote">Các thao tác dữ liệu sẽ được bổ sung khi có API.</span></div>}
    </header>
    {showSearch && <div className="in-chat-search"><Search size={17}/><input autoFocus placeholder="Tìm nội dung trong đoạn chat..." aria-label="Tìm trong cuộc trò chuyện" value={query} onChange={e => setQuery(e.target.value)}/><span>{query ? `${conversationMatches.length} kết quả` : 'Nhập từ khóa'}</span><button type="button" aria-label="Đóng tìm kiếm" onClick={() => {setShowSearch(false);setQuery('');}}><X size={18}/></button></div>}
    <section className="message-scroll" aria-label="Tin nhắn minh họa">
      <div className="conversation-intro"><Avatar initial={chat.initial} color={chat.color} group={chat.group} size={66}/><h2>{chat.name}</h2><p>{chat.group ? chat.members : 'Bắt đầu cuộc trò chuyện'}</p><span>Nội dung bên dưới dùng để minh họa giao diện.</span></div>
      <div className="timeline"><span>Hôm nay</span></div>
      <div className="message-flow">{messages.map((message, index) => <div key={message.id} className={query && (message.text ?? message.fileName ?? '').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')) ? 'search-hit' : ''}>
        {message.day && index !== 0 && <div className="timeline"><span>{message.day}</span></div>}
        <MessageBubble message={message} color={chat.color}/>
      </div>)}</div><div ref={endRef}/>
    </section>
    <div className="composer" aria-label="Khung soạn tin nhắn minh họa">
      <div className="composer-tools"><button type="button" title="Thêm nội dung" aria-label="Thêm nội dung" className="composer-add" onClick={() => setShowEmoji(value => !value)}><Plus size={21}/></button><button type="button" title="Đính kèm (giao diện)" aria-label="Đính kèm (giao diện)"><Paperclip size={20}/></button><button type="button" title="Chọn biểu tượng cảm xúc" aria-label="Biểu tượng cảm xúc" className="emoji-trigger" onClick={() => setShowEmoji(value => !value)}><Smile size={20}/></button></div>
      <div className="compose-field"><textarea rows={1} aria-label="Soạn tin nhắn" placeholder="Nhập tin nhắn..." value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/><span className="compose-note">Enter để gửi · Shift + Enter xuống dòng</span></div>
      <button type="button" className="send-button" title="Gửi tin nhắn demo" aria-label="Gửi tin nhắn demo" onClick={send} disabled={!text.trim()}><SendHorizontal size={19}/></button>
      {showEmoji && <div className="emoji-sample"><div className="popover-heading">Biểu tượng cảm xúc <button type="button" aria-label="Đóng emoji" onClick={() => setShowEmoji(false)}><X size={15}/></button></div><div className="emoji-grid">{['😀','🙂','😍','😅','😂','👍','❤️','✨','🎉','🙏','💙','🔥'].map(emoji => <button type="button" key={emoji} onClick={() => {setText(t => t + emoji);setShowEmoji(false);}}>{emoji}</button>)}</div><div className="emoji-caption">Bảng emoji minh họa</div></div>}
    </div>
    <div className="composer-bottom"><LockKeyhole size={12}/> Tin nhắn chỉ lưu cục bộ trên trình duyệt · chưa gửi cho người khác <ChevronDown size={13}/></div>
  </main>;
}
