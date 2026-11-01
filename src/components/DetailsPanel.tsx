import { useState } from 'react';
import { Bell, ChevronDown, ChevronUp, FileText, Image as ImageIcon, Search, Settings2, ShieldCheck, UserRoundPlus, UsersRound, X } from 'lucide-react';
import type { Conversation } from '../data/previewContent';
import Avatar from './Avatar';
type Props = { chat: Conversation; onClose: () => void; onManageGroup: () => void };
type Group = 'members' | 'media' | 'files' | 'privacy';
export default function DetailsPanel({ chat, onClose, onManageGroup }: Props) {
  const [expanded, setExpanded] = useState<Group[]>(['members', 'media', 'files']);
  const toggle = (key: Group) => setExpanded(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]);
  const section = (key: Group, icon: React.ReactNode, title: string, content: React.ReactNode) => <section className="details-section"><button type="button" className="details-section-head" onClick={() => toggle(key)}><span>{icon}{title}</span>{expanded.includes(key) ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}</button>{expanded.includes(key) && <div className="details-section-body">{content}</div>}</section>;
  return <aside className="details" aria-label="Thông tin hội thoại"><div className="details-top"><strong>Thông tin hội thoại</strong><button type="button" className="icon-button" aria-label="Đóng thông tin hội thoại" onClick={onClose}><X size={20}/></button></div>
    <div className="details-scroll"><div className="details-identity"><Avatar initial={chat.initial} color={chat.color} size={76} group={chat.group}/><h2>{chat.name}</h2><p>{chat.group ? chat.members : chat.presence === 'online' ? 'Đang hoạt động' : 'Cuộc trò chuyện riêng tư'}</p></div>
      <div className="details-actions"><button type="button" title="Tìm tin nhắn — thiết kế"><span><Search size={19}/></span>Tìm kiếm</button><button type="button" title="Thông báo — thiết kế"><span><Bell size={19}/></span>Thông báo</button><button type="button" title="Quyền riêng tư — thiết kế"><span><ShieldCheck size={19}/></span>Riêng tư</button></div>
      {chat.group && section('members', <UsersRound size={17}/>, 'Thành viên trong nhóm', <div className="group-detail-members">
        <div className="group-detail-member"><Avatar initial="B" color="#35695d" size={32}/><span><strong>Bạn</strong><small>Quản trị viên · bản demo</small></span></div>
        {(chat.memberNames ?? []).map(name => <div className="group-detail-member" key={name}><Avatar initial={name.charAt(0).toUpperCase()} color="#66829b" size={32}/><span><strong>{name}</strong><small>Thành viên</small></span></div>)}
        <button type="button" className="manage-group-button" onClick={onManageGroup}><UserRoundPlus size={18}/><span>Thêm hoặc xóa thành viên</span></button>
        <button type="button" className="manage-group-button is-secondary" onClick={onManageGroup}><Settings2 size={18}/><span>Đổi tên và quản lý nhóm</span></button>
      </div>)}
      {section('media', <ImageIcon size={17}/>, 'Ảnh và video', <div className="media-preview"><div className="media-tile mock-1"/><div className="media-tile mock-2"/><div className="media-tile mock-3"/><button type="button">Xem tất cả <span>›</span></button></div>)}
      {section('files', <FileText size={17}/>, 'Tệp đã chia sẻ', <div className="files-preview"><div className="shared-file"><span className="file-icon"><FileText size={19}/></span><span><strong>Giao-dien-LyraChat.pdf</strong><small>PDF · 2,4 MB</small></span></div><div className="shared-file"><span className="file-icon"><FileText size={19}/></span><span><strong>UI-review-notes.docx</strong><small>Word · 184 KB</small></span></div></div>)}
      {section('privacy', <ShieldCheck size={17}/>, 'Quyền riêng tư và hỗ trợ', <div className="privacy-preview"><span>Chặn liên hệ</span><span>Báo cáo cuộc trò chuyện</span><small>Các mục này chỉ là cấu trúc giao diện.</small></div>)}
    </div>
  </aside>;
}
