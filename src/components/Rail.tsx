import { ContactRound, MessageCircleMore, Settings, UsersRound, Phone, FolderArchive, ChevronDown } from 'lucide-react';
import Avatar from './Avatar';
export type Section = 'chats' | 'contacts' | 'archive' | 'settings';
type Props = { active: Section; onChange: (section: Section) => void; onSettings: () => void; onGroups: () => void; onCalls: () => void; accountName: string };
export default function Rail({ active, onChange, onSettings, onGroups, onCalls, accountName }: Props) {
  return <nav className="app-rail" aria-label="Điều hướng chính">
    <div className="brand"><img src="/assets/lyra-logo.png" alt="Biểu tượng LyraChat"/><strong>LyraChat</strong></div>
    <div className="rail-links">
      <button type="button" className={`rail-link ${active === 'chats' ? 'active' : ''}`} onClick={() => onChange('chats')}><MessageCircleMore size={22}/><span>Tin nhắn</span><i className="rail-count">3</i></button>
      <button type="button" className={`rail-link ${active === 'contacts' ? 'active' : ''}`} onClick={() => onChange('contacts')}><ContactRound size={22}/><span>Danh bạ</span></button>
      <button type="button" className="rail-link" onClick={onGroups}><UsersRound size={22}/><span>Nhóm</span></button>
      <button type="button" className="rail-link" onClick={onCalls}><Phone size={22}/><span>Cuộc gọi</span></button>
      <button type="button" className={`rail-link ${active === 'archive' ? 'active' : ''}`} onClick={() => onChange('archive')}><FolderArchive size={22}/><span>Thư mục</span></button>
      <button type="button" className={`rail-link ${active === 'settings' ? 'active' : ''}`} onClick={onSettings}><Settings size={22}/><span>Cài đặt</span></button>
    </div>
    <div className="rail-footer"><div className="rail-decoration">❧</div><button className="rail-user" type="button" onClick={onSettings} aria-label="Cài đặt tài khoản"><Avatar initial={accountName[0]?.toUpperCase() ?? 'U'} color="#3e9e88" size={43} presence="online"/><span><strong>{accountName}</strong><small>Online</small></span><ChevronDown size={17}/></button><div className="rail-footer-dot">♥</div></div>
  </nav>;
}
