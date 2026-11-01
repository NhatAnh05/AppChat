import { Archive, ArchiveRestore, BellOff, ChevronDown, MessageSquarePlus, Pin, PinOff, Search, Trash2, UsersRound, X } from 'lucide-react';
import { useMemo } from 'react';
import Avatar from './Avatar';
import ActionMenu from './ActionMenu';
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
  onUpdateChat: (id: string, changes: Partial<Conversation>) => void;
  onRemoveChat: (id: string) => void;
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

export default function Sidebar({ conversations, section, selected, filter, search, onSelect, onFilter, onSearch, onNewChat, onShowChat, onUpdateChat, onRemoveChat }: Props) {
  const visible = useMemo(() => conversations.filter(chat => {
    if (section === 'archive' ? !chat.archived : chat.archived) return false;
    if (section === 'chats' && filter === 'unread' && chat.group) return false;
    if (section === 'chats' && filter === 'groups' && !chat.group) return false;
    return `${chat.name} ${chat.preview}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'));
  }), [conversations, section, filter, search]);
  const ordered = [...visible].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  return <aside className="sidebar" aria-label="Danh sách hội thoại">
    <div className="sidebar-header"><div><span className="eyebrow">LYRACHAT</span><h1>{section === 'chats' ? 'Tin nhắn' : section === 'archive' ? 'Đã lưu trữ' : 'Danh bạ'}</h1></div><div className="sidebar-heading-tools"><button type="button" title="Tin nhắn mới" aria-label="Tin nhắn mới" className="new-chat-button" onClick={onNewChat}><MessageSquarePlus size={20}/></button></div></div>
    <div className="search-box"><Search size={18}/><input aria-label="Tìm kiếm" placeholder={section === 'contacts' ? 'Tìm trong danh bạ' : 'Tìm kiếm cuộc trò chuyện'} value={search} onChange={event => onSearch(event.target.value)}/>{search && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => onSearch('')}><X size={16}/></button>}</div>
    {section === 'chats' && <div className="filters" role="group" aria-label="Bộ lọc hội thoại">{filters.map(f => <button type="button" key={f.id} onClick={() => onFilter(f.id)} className={filter === f.id ? 'active' : ''}>{f.label}</button>)}</div>}
    {section === 'contacts' ? <><div className="section-note"><span>Gần đây</span><ChevronDown size={16}/></div><div className="contact-list">{contacts.filter(contact => contact.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map(contact => <div className="contact-row" key={contact.name}><Avatar initial={contact.initial} color={contact.color} size={42} presence={contact.online ? 'online' : 'offline'}/><span><strong>{contact.name}</strong><small>{contact.online ? 'Đang hoạt động' : 'Liên hệ'}</small></span></div>)}</div></> : <>
      {section === 'archive' && <p className="sidebar-help"><Archive size={16}/> Bạn có thể khôi phục cuộc trò chuyện từ menu tùy chọn.</p>}
      <div className="conversation-list">{ordered.map(chat => <div key={chat.id} className="conversation-entry">
        <ChatRow chat={chat} selected={selected === chat.id} onClick={() => { onSelect(chat.id); onShowChat(); }}/>
        <ActionMenu
          label={`Tùy chọn hội thoại ${chat.name}`}
          triggerClassName="conversation-more-button"
          items={[
            { label: chat.pinned ? 'Bỏ ghim đoạn chat' : 'Ghim đoạn chat', icon: chat.pinned ? <PinOff size={17}/> : <Pin size={17}/>, onSelect: () => onUpdateChat(chat.id, { pinned: !chat.pinned }) },
            { label: chat.archived ? 'Khôi phục đoạn chat' : 'Lưu trữ đoạn chat', icon: chat.archived ? <ArchiveRestore size={17}/> : <Archive size={17}/>, onSelect: () => onUpdateChat(chat.id, { archived: !chat.archived }) },
            { label: 'Xóa đoạn chat', icon: <Trash2 size={17}/>, danger: true, dividerBefore: true, onSelect: () => { if (window.confirm(`Xóa hội thoại "${chat.name}" và các tin nhắn đã lưu trên thiết bị này?`)) onRemoveChat(chat.id); } },
          ]}
        />
      </div>)}
        {!visible.length && <div className="list-empty"><UsersRound size={28}/><strong>Không có kết quả</strong><small>Thử tìm bằng từ khóa khác.</small></div>}
      </div>
    </>}
    <div className="sidebar-bottom"><span className="sidebar-bottom-status"/><span>Chế độ trải nghiệm</span><span className="preview-pill">DEMO</span></div>
  </aside>;
}
