import { useState } from 'react';
import { Info, Search, UsersRound, Video, X } from 'lucide-react';
import { contacts } from './data/previewContent';
import { useDemoChats } from './hooks/useDemoChats';
import { getDemoSession, setDemoSession, clearDemoSession, readDemo, saveDemo } from './services/demoStorage';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';
import type { DemoAccount } from './types/account';
import type { Filter } from './components/Sidebar';
import type { Section } from './components/Rail';
import Rail from './components/Rail';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import DetailsPanel from './components/DetailsPanel';
import Avatar from './components/Avatar';
type Modal = 'new' | 'settings' | 'call' | 'group' | null;
export default function App() {
  const [account, setAccount] = useState<DemoAccount | null>(() => getDemoSession());
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => readDemo('notifications', true));
  const { conversations, messages, sendMessage, addConversation, changeMessage, deleteMessage, updateConversation, removeConversation, createGroup, updateGroup } = useDemoChats();
  const [section, setSection] = useState<Section>('chats');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('linh');
  const [details, setDetails] = useState(true);
  const [mobileChat, setMobileChat] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [newSearch, setNewSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const chat = conversations.find(item => item.id === selected);
  const selectSection = (next: Section) => {setSection(next);setSearch('');setMobileChat(false);setDetails(false);if (next === 'archive') setSelected('archive');if (next === 'chats') {setSelected('linh');setFilter('all');}};
  if (!account) return <AuthPage onLogin={value => { setDemoSession(value); setAccount(value); }} />;
  if (profileOpen) return <ProfilePage account={account} onBack={() => setProfileOpen(false)} onSave={value => { const accounts = readDemo<Record<string, DemoAccount>>('accounts', {}); saveDemo('accounts', {...accounts,[value.email]:value}); setDemoSession(value); setAccount(value); setProfileOpen(false); }} />;
  return <div className={`app-shell ${mobileChat ? 'is-mobile-chat' : ''} ${details ? 'details-open' : ''}`}>
    <Rail active={section} onChange={selectSection} onSettings={() => setModal('settings')} onGroups={() => {setSection('chats');setFilter('groups');setDetails(false);setModal('group');setEditingGroup(null);setGroupName('');setGroupMembers([]);}} onCalls={() => setModal('call')} accountName={account.name}/>
    <Sidebar conversations={conversations} section={section} filter={filter} onFilter={setFilter} search={search} onSearch={setSearch} selected={selected} onSelect={setSelected} onNewChat={() => setModal('new')} onShowChat={() => setMobileChat(true)} onUpdateChat={updateConversation} onRemoveChat={id => {removeConversation(id);if(selected === id)setSelected("");}}/>
    <ChatPanel key={selected} messages={messages[selected] ?? []} onSend={value => sendMessage(selected, value)} onEdit={(id, text) => changeMessage(selected, id, text)} onDelete={id => deleteMessage(selected, id)} chat={section === 'contacts' ? undefined : chat} onBack={() => setMobileChat(false)} onDetails={() => setDetails(value => !value)} onOpenCallPreview={() => setModal('call')}/>
    {details && chat && section !== 'contacts' && <DetailsPanel key={chat.id} chat={chat} onClose={() => setDetails(false)} onManageGroup={() => {setEditingGroup(chat.id);setGroupName(chat.name);setGroupMembers(chat.memberNames ?? []);setModal("group");}}/>}
    {modal && <div className="modal-backdrop" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal(null);}}><div className="modal" role="dialog" aria-modal="true" aria-label={modal === 'new' ? 'Tin nhắn mới' : modal === 'group' ? 'Quản lý nhóm' : modal === 'settings' ? 'Cài đặt giao diện' : 'Gọi thoại và video'}>
      <div className="modal-heading"><div><span className="eyebrow">LYRACHAT / GIAO DIỆN</span><h2>{modal === 'new' ? 'Tin nhắn mới' : modal === 'group' ? (editingGroup ? 'Chỉnh sửa nhóm' : 'Tạo nhóm') : modal === 'settings' ? 'Cài đặt' : 'Giao diện cuộc gọi'}</h2></div><button className="icon-button" type="button" aria-label="Đóng hộp thoại" onClick={() => setModal(null)}><X size={20}/></button></div>
      {modal === 'new' && <><div className="modal-search"><Search size={18}/><input value={newSearch} onChange={event => setNewSearch(event.target.value)} placeholder="Tìm tên người liên hệ..." aria-label="Tìm người liên hệ"/></div><div className="modal-subhead">Danh bạ gợi ý</div><div className="modal-contact-list">{contacts.filter(contact => contact.name.toLocaleLowerCase('vi').includes(newSearch.toLocaleLowerCase('vi'))).map(contact => <button type="button" key={contact.name} className="modal-contact" onClick={() => { const id = addConversation(contact.name); setSelected(id); setSection('chats'); setMobileChat(true); setModal(null); }} ><Avatar initial={contact.initial} color={contact.color} size={42}/><span>{contact.name}</span><span className="selection-circle"/></button>)}</div><div className="modal-hint"><Info size={16}/> Chọn một người để bắt đầu hội thoại demo trên thiết bị này.</div></>}
      {modal === 'group' && <form className="group-form" onSubmit={e => {e.preventDefault();if(!groupName.trim() || groupMembers.length===0)return;const id = editingGroup ?? createGroup(groupName,groupMembers);if(editingGroup)updateGroup(editingGroup,groupName,groupMembers);setSelected(id);setSection('chats');setFilter('groups');setModal(null);}}><label>Tên nhóm<input required maxLength={80} value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nhập tên nhóm"/></label><p>Chọn thành viên (ít nhất 1):</p><div className="group-member-list">{contacts.map(c => <label key={c.name}><input type="checkbox" checked={groupMembers.includes(c.name)} onChange={e => setGroupMembers(old => e.target.checked ? [...old,c.name] : old.filter(n => n !== c.name))}/>{c.name}</label>)}</div><button type="submit" disabled={!groupName.trim() || !groupMembers.length}>{editingGroup ? 'Lưu thay đổi' : 'Tạo nhóm'}</button></form>}
      {modal === 'settings' && <><div className="settings-profile"><Avatar initial={account.name[0]?.toUpperCase() ?? 'U'} color="#577d87" size={52}/><span><strong>{account.name}</strong><small>{account.email}</small></span></div><button type="button" className="settings-action" onClick={() => {setModal(null);setProfileOpen(true);}}>Chỉnh sửa hồ sơ cá nhân</button><button type="button" className="settings-row settings-toggle" onClick={() => {setNotifications(!notifications); saveDemo('notifications', !notifications);}}><span><strong>Thông báo trong ứng dụng</strong><small>{notifications ? 'Đang bật' : 'Đã tắt'} · cài đặt demo</small></span><span className={`switch-preview ${notifications ? 'active' : ''}`}/></button><div className="settings-row"><span><strong>Chủ đề giao diện</strong><small>Chế độ sáng (Light)</small></span><span className="setting-chip">Mặc định</span></div><button className="settings-action logout" type="button" onClick={() => {clearDemoSession();setAccount(null);setModal(null);}}>Đăng xuất</button><div className="modal-hint"><Info size={16}/> Chỉ là bản demo frontend; chưa có máy chủ và xác thực thật.</div></>}
      {modal === 'call' && <div className="call-preview"><div className="call-art"><Video size={40}/><span><UsersRound size={18}/> Bản xem trước</span></div><h3>Màn hình gọi thoại và video</h3><p>Đây là vị trí dành cho giao diện cuộc gọi khi dự án được cung cấp API hoặc SDK phù hợp.</p><button type="button" onClick={() => setModal(null)}>Quay lại hội thoại</button></div>}
    </div></div>}
  </div>;
}
