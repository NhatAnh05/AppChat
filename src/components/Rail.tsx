import { Archive, ContactRound, MessageCircle, Settings2 } from 'lucide-react';
import Avatar from './Avatar';
export type Section = 'chats' | 'contacts' | 'archive';
type Props = { active: Section; onChange: (section: Section) => void; onSettings: () => void };
const navigation = [
  { id: 'chats' as const, name: 'Đoạn chat', icon: MessageCircle },
  { id: 'contacts' as const, name: 'Danh bạ', icon: ContactRound },
  { id: 'archive' as const, name: 'Lưu trữ', icon: Archive },
];
export default function Rail({ active, onChange, onSettings }: Props) {
  return <nav className="app-rail" aria-label="Điều hướng chính">
    <div className="brand" title="AppChat"><span className="brand-mark"><MessageCircle size={22} strokeWidth={2.6} /></span></div>
    <div className="rail-links">{navigation.map(({ id, name, icon: Icon }) => <button type="button" key={id} className={`rail-link ${active === id ? 'active' : ''}`} aria-label={name} title={name} onClick={() => onChange(id)}><Icon size={21} strokeWidth={1.8}/>{id === 'chats' && <span className="rail-indicator"/>}</button>)}</div>
    <div className="rail-footer"><button type="button" className="rail-link" title="Cài đặt giao diện" aria-label="Cài đặt giao diện" onClick={onSettings}><Settings2 size={21}/></button><button type="button" className="my-avatar" aria-label="Tài khoản của tôi" title="Tài khoản của tôi" onClick={onSettings}><Avatar initial="N" color="#577d87" size={36}/></button></div>
  </nav>;
}
