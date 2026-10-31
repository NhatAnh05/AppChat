import { useState } from 'react';
import { Info, Search, UsersRound, Video, X } from 'lucide-react';
import { conversations, contacts } from './data/previewContent';
import type { Filter } from './components/Sidebar';
import type { Section } from './components/Rail';
import Rail from './components/Rail';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import DetailsPanel from './components/DetailsPanel';
import Avatar from './components/Avatar';
type Modal = 'new' | 'settings' | 'call' | null;
export default function App() {
  const [section, setSection] = useState<Section>('chats');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('linh');
  const [details, setDetails] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [newSearch, setNewSearch] = useState('');
  const chat = conversations.find(item => item.id === selected);
  const selectSection = (next: Section) => {setSection(next);setSearch('');setMobileChat(false);setDetails(false);if (next === 'archive') setSelected('archive');if (next === 'chats') setSelected('linh');};
  return <div className={`app-shell ${mobileChat ? 'is-mobile-chat' : ''} ${details ? 'details-open' : ''}`}>
    <Rail active={section} onChange={selectSection} onSettings={() => setModal('settings')}/>
    <Sidebar section={section} filter={filter} onFilter={setFilter} search={search} onSearch={setSearch} selected={selected} onSelect={setSelected} onNewChat={() => setModal('new')} onShowChat={() => setMobileChat(true)}/>
    <ChatPanel chat={section === 'contacts' ? undefined : chat} onBack={() => setMobileChat(false)} onDetails={() => setDetails(value => !value)} onOpenCallPreview={() => setModal('call')}/>
    {details && chat && section !== 'contacts' && <DetailsPanel key={chat.id} chat={chat} onClose={() => setDetails(false)}/>}
    {modal && <div className="modal-backdrop" onMouseDown={(e) => {if (e.target === e.currentTarget) setModal(null);}}><div className="modal" role="dialog" aria-modal="true" aria-label={modal === 'new' ? 'Tin nhắn mới' : modal === 'settings' ? 'Cài đặt giao diện' : 'Gọi thoại và video'}>
      <div className="modal-heading"><div><span className="eyebrow">APPCHAT / GIAO DIỆN</span><h2>{modal === 'new' ? 'Tin nhắn mới' : modal === 'settings' ? 'Cài đặt' : 'Giao diện cuộc gọi'}</h2></div><button className="icon-button" type="button" aria-label="Đóng hộp thoại" onClick={() => setModal(null)}><X size={20}/></button></div>
      {modal === 'new' && <><div className="modal-search"><Search size={18}/><input value={newSearch} onChange={event => setNewSearch(event.target.value)} placeholder="Tìm tên người liên hệ..." aria-label="Tìm người liên hệ"/></div><div className="modal-subhead">Danh bạ gợi ý</div><div className="modal-contact-list">{contacts.filter(contact => contact.name.toLocaleLowerCase('vi').includes(newSearch.toLocaleLowerCase('vi'))).map(contact => <div key={contact.name} className="modal-contact"><Avatar initial={contact.initial} color={contact.color} size={42}/><span>{contact.name}</span><span className="selection-circle"/></div>)}</div><div className="modal-hint"><Info size={16}/> Giao diện chọn người nhận. Chưa có chức năng tạo hội thoại.</div></>}
      {modal === 'settings' && <><div className="settings-profile"><Avatar initial="N" color="#577d87" size={52}/><span><strong>Người dùng mẫu</strong><small>Xem trước hồ sơ cá nhân</small></span></div><div className="settings-row"><span><strong>Thông báo</strong><small>Bật/tắt thông báo trong ứng dụng</small></span><span className="switch-preview active"/></div><div className="settings-row"><span><strong>Chủ đề giao diện</strong><small>Chế độ sáng (Light)</small></span><span className="setting-chip">Mặc định</span></div><div className="settings-row"><span><strong>Quyền riêng tư</strong><small>Cấu trúc phần cài đặt dành cho người dùng</small></span><span className="setting-chip">›</span></div><div className="modal-hint"><Info size={16}/> Các thành phần cài đặt chỉ là bản thiết kế.</div></>}
      {modal === 'call' && <div className="call-preview"><div className="call-art"><Video size={40}/><span><UsersRound size={18}/> Bản xem trước</span></div><h3>Màn hình gọi thoại và video</h3><p>Đây là vị trí dành cho giao diện cuộc gọi khi dự án được cung cấp API hoặc SDK phù hợp.</p><button type="button" onClick={() => setModal(null)}>Quay lại hội thoại</button></div>}
    </div></div>}
  </div>;
}
