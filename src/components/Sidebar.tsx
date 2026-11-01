import { Archive, BellOff, ChevronDown, MessageSquarePlus, MoreHorizontal, Pin, Search, UsersRound, X } from 'lucide-react';
import { useMemo } from 'react';
import Avatar from './Avatar';
import type { Conversation } from '../data/previewContent';
import { contacts } from '../data/previewContent';
import type { Section } from './Rail';
export type Filter = 'all' | 'unread' | 'groups';
type Props = {
  section: Section;
  conversations: Conversation[];
  selected: string;
  filter: Filter;
  search: string;
  onSelect: (id: string) => void;
  onFilter: (filter: Filter) => void;
  onSearch: (search: string) => void;
  onNewChat: () => void;
  onShowChat: () => void;
};
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'unread', label: 'Cá nhân' }, { id: 'groups', label: 'Nhóm' },
];
function ChatRow({ chat, selected, onClick }: { chat: Conversation; selected: boolean; onClick: () => void }) {
  return <button type="button" className={`conversation ${selected ? 'selected' : ''}`} onClick={onClick} aria-current={selected ? 'true' : undefined}>
    <Avatar initial={chat.initial} color={chat.color} group={chat.group} presence={chat.presence} size={48}/>
    <span className="conversation-copy"><span className="conversation-title">{chat.name}</span><span className={`conversation-preview ${chat.unread ? 'unread' : ''}`}>{chat.preview}</span></span>
    <span className="conversation-end"><span className={`conversation-time ${chat.unread ? 'emphasis' : ''}`}>{chat.time}</span>{chat.unread ? <span className="unread-bubble">{chat.unread}</span> : chat.muted ? <BellOff size={13}/> : chat.pinned ? <Pin size={13}/> : null}</span>
  </button>;
}
export default function Sidebar({ conversations, section, selected, filter, search, onSelect, onFilter, onSearch, onNewChat, onShowChat }: Props) {
  const visible = useMemo(() => conversations.filter(chat => {
    if (section === 'archive' ? !chat.archived : chat.archived) return false;
    if (section === 'chats' && filter === 'unread' && chat.group) return false;
    if (section === 'chats' && filter === 'groups' && !chat.group) return false;
    return `${chat.name} ${chat.preview}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'));
  }), [conversations, section, filter, search]);
  return <aside className="sidebar" aria-label="Danh sách hội thoại">
    <div className="sidebar-header"><div><span className="eyebrow">LYRACHAT</span><h1>{section === 'chats' ? 'Tin nhắn' : section === 'archive' ? 'Đã lưu trữ' : 'Danh bạ'}</h1></div><div className="sidebar-heading-tools"><button type="button" title="Tùy chọn hiển thị" aria-label="Tùy chọn hiển thị"><MoreHorizontal size={21}/></button><button type="button" title="Tin nhắn mới" aria-label="Tin nhắn mới" className="new-chat-button" onClick={onNewChat}><MessageSquarePlus size={20}/></button></div></div>
    <div className="search-box"><Search size={18}/><input aria-label="Tìm kiếm" placeholder={section === 'contacts' ? 'Tìm trong danh bạ' : 'Tìm kiếm cuộc trò chuyện'} value={search} onChange={event => onSearch(event.target.value)}/>{search && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => onSearch('')}><X size={16}/></button>}</div>
    {section === 'chats' && <div className="filters" role="group" aria-label="Bộ lọc hội thoại">{filters.map(f => <button type="button" key={f.id} onClick={() => onFilter(f.id)} className={filter === f.id ? 'active' : ''}>{f.label}</button>)}</div>}
    {section === 'contacts' ? <><div className="section-note"><span>Gần đây</span><ChevronDown size={16}/></div><div className="contact-list">{contacts.filter(contact => contact.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map((contact) => <div className="contact-row" key={contact.name}><Avatar initial={contact.initial} color={contact.color} size={42} presence={contact.online ? 'online' : 'offline'}/><span><strong>{contact.name}</strong><small>{contact.online ? 'Đang hoạt động' : 'Liên hệ'}</small></span></div>)}</div></> : <>
      {section === 'chats' && filter === 'all' && !search && <div className="section-note"><span>Gần đây</span><span className="note-count">{visible.length} cuộc trò chuyện</span></div>}
      {section === 'archive' && <p className="sidebar-help"><Archive size={16}/> Hội thoại lưu trữ chỉ để minh họa giao diện.</p>}
      <div className="conversation-list">{visible.map(chat => <ChatRow key={chat.id} chat={chat} selected={selected === chat.id} onClick={() => {onSelect(chat.id);onShowChat();}} />)}
        {!visible.length && <div className="list-empty"><UsersRound size={28}/><strong>Không có kết quả</strong><small>Thử tìm bằng từ khóa khác.</small></div>}
      </div>
    </>}
    <div className="sidebar-bottom"><span className="sidebar-bottom-status"/><span>Chế độ trải nghiệm</span><span className="preview-pill">DEMO</span></div>
  </aside>;
}
