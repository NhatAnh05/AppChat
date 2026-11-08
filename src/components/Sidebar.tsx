import { Archive, ArchiveRestore, Bell, BellOff, MessageSquarePlus, Pin, Search, UsersRound, X } from 'lucide-react';
import { useMemo } from 'react';
import Avatar from './Avatar';
import ActionMenu from './ActionMenu';
import type { Conversation, Message } from '../data/previewContent';
import { messagePreview as previewMediaMessage } from '../services/mediaMessages';
import type { Section } from './Rail';

export type Filter = 'all' | 'unread' | 'groups';
type Props = {
  section: Section;
  messagePreview?: boolean;
  conversations: Conversation[];
  messages?: Record<string,Message[]>;
  selected: string;
  filter: Filter;
  search: string;
  onSelect: (id: string) => void;
  onFilter: (filter: Filter) => void;
  onSearch: (search: string) => void;
  onNewChat: () => void;
  onShowChat: () => void;
  onUpdateChat: (id: string, changes: Partial<Conversation>) => void;
  onRemoveChat: (id: string) => void;
};

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'unread', label: 'Cá nhân' }, { id: 'groups', label: 'Nhóm' },
];

function ChatRow({ chat, selected, messagePreview, onClick }: { chat: Conversation; selected: boolean; messagePreview: boolean; onClick: () => void }) {
  return <button type="button" className={`conversation ${selected ? 'selected' : ''}`} onClick={onClick} aria-current={selected ? 'true' : undefined}>
    <Avatar initial={chat.initial} color={chat.color} group={chat.group} presence={chat.presence} size={48}/>
    <span className="conversation-copy"><span className="conversation-title">{chat.name}</span><span className={`conversation-preview ${chat.unread ? 'unread' : ''}`}>{messagePreview ? previewMediaMessage(chat.preview) : "Nội dung xem trước đã ẩn"}</span></span>
    <span className="conversation-end"><span className={`conversation-time ${chat.unread ? 'emphasis' : ''}`}>{chat.time}</span>{chat.unread ? <span className="unread-bubble">{chat.unread}</span> : chat.muted ? <BellOff size={13}/> : chat.pinned ? <Pin size={13}/> : null}</span>
  </button>;
}

export default function Sidebar({ messagePreview = true, conversations, messages = {}, section, selected, filter, search, onSelect, onFilter, onSearch, onNewChat, onShowChat, onUpdateChat, onRemoveChat: _onRemoveChat }: Props) {
  const visible = useMemo(() => conversations.filter(chat => {
    if (section === 'archive' ? !chat.archived : chat.archived) return false;
    if (section === 'chats' && filter === 'unread' && chat.group) return false;
    if (section === 'chats' && filter === 'groups' && !chat.group) return false;
    const needle=search.trim().toLocaleLowerCase('vi');
    return !needle || `${chat.name} ${chat.preview}`.toLocaleLowerCase('vi').includes(needle) || (messages[chat.id]??[]).some(m=>previewMediaMessage(m.text??'').toLocaleLowerCase('vi').includes(needle));
  }), [conversations, messages, section, filter, search]);
  const ordered = [...visible].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  return <aside className="sidebar" aria-label="Danh sách hội thoại">
    <div className="sidebar-header"><div><span className="eyebrow">LYRACHAT</span><h1>{section === 'chats' ? 'Tin nhắn' : section === 'archive' ? 'Đã lưu trữ' : 'Danh bạ'}</h1></div><div className="sidebar-heading-tools"><button type="button" title="Tin nhắn mới" aria-label="Tin nhắn mới" className="new-chat-button" onClick={onNewChat}><MessageSquarePlus size={20}/></button></div></div>
    <div className="search-box"><Search size={18}/><input aria-label="Tìm kiếm" placeholder={section === 'contacts' ? 'Tìm trong danh bạ' : 'Tìm kiếm cuộc trò chuyện'} value={search} onChange={event => onSearch(event.target.value)}/>{search && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => onSearch('')}><X size={16}/></button>}</div>
    {section === 'chats' && <div className="filters" role="group" aria-label="Bộ lọc hội thoại">{filters.map(f => <button type="button" key={f.id} onClick={() => onFilter(f.id)} className={filter === f.id ? 'active' : ''}>{f.label}</button>)}</div>}
    {section === 'contacts' && <p className="sidebar-help">Nhập username ở nút Tin nhắn mới để kiểm tra người dùng trên máy chủ.</p>}
    <div className="conversation-list">{ordered.map(chat => <div key={chat.id} className="conversation-entry"><ChatRow chat={chat} messagePreview={messagePreview} selected={selected===chat.id} onClick={()=>{onSelect(chat.id);onShowChat();}}/><ActionMenu label={`Tùy chọn ${chat.name}`} triggerClassName="conversation-more-button" items={[
        {label:chat.pinned?'Bỏ ghim':'Ghim lên đầu',icon:<Pin size={17}/>,onSelect:()=>onUpdateChat(chat.id,{pinned:!chat.pinned})},
        {label:chat.muted?'Bật thông báo':'Tắt thông báo',icon:chat.muted?<Bell size={17}/>:<BellOff size={17}/>,onSelect:()=>onUpdateChat(chat.id,{muted:!chat.muted})},
        {label:chat.archived?'Bỏ lưu trữ':'Lưu trữ hội thoại',icon:chat.archived?<ArchiveRestore size={17}/>:<Archive size={17}/>,onSelect:()=>onUpdateChat(chat.id,{archived:!chat.archived})},
      ]}/></div>)}
      {!visible.length && <div className="list-empty"><UsersRound size={28}/><strong>Chưa có hội thoại</strong><small>Hãy tạo hội thoại hoặc tham gia phòng chat.</small></div>}
    </div>
    <div className="sidebar-bottom"><span className="sidebar-bottom-status"/><span>Kết nối API giảng viên</span><span className="preview-pill">LIVE</span></div>
  </aside>;
}
