import { useState, type FormEvent } from 'react';
import { Bell, CalendarDays, ChevronRight, Eye, Globe2, LockKeyhole, LogOut, Mail, Monitor, Pencil, Phone, Shield, ShieldCheck, UserRound, CircleUserRound, X, Check, Info } from 'lucide-react';
import Avatar from '../components/Avatar';
import type { DemoAccount } from '../types/account';
import { readDemo, saveDemo } from '../services/demoStorage';

type Tab = 'account' | 'notifications' | 'appearance' | 'privacy' | 'security' | 'language';
type Props = { account: DemoAccount; onSave: (a: DemoAccount) => void; onLogout: () => void };
type Extras = { phone: string; birth: string; gender: string; job: string; school: string; online: boolean; notifications: boolean; sounds: boolean; preview: boolean; theme: string; language: string; searchable: boolean };
const initial: Extras = { phone: '', birth: '', gender: 'Chưa cập nhật', job: '', school: '', online: true, notifications: true, sounds: true, preview: true, theme: 'light', language: 'vi', searchable: true };
const tabs: { id: Tab; title: string; desc: string; icon: typeof UserRound }[] = [
  { id:'account', title:'Tài khoản', desc:'Quản lý thông tin cá nhân và hồ sơ', icon:UserRound },
  { id:'notifications', title:'Thông báo', desc:'Thiết lập thông báo tin nhắn, cuộc gọi', icon:Bell },
  { id:'appearance', title:'Giao diện', desc:'Tùy chỉnh giao diện và chế độ hiển thị', icon:Monitor },
  { id:'privacy', title:'Quyền riêng tư', desc:'Kiểm soát ai có thể liên hệ với bạn', icon:Shield },
  { id:'security', title:'Bảo mật', desc:'Đổi mật khẩu, bảo mật 2 lớp', icon:LockKeyhole },
  { id:'language', title:'Ngôn ngữ', desc:'Thay đổi ngôn ngữ sử dụng', icon:Globe2 }
];
export default function SettingsPage({ account, onSave, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('account');
  const [extra, setExtra] = useState<Extras>(() => {
    const stored = readDemo<Partial<Extras> | null>('settings_extra', {});
    return { ...initial, ...(stored && typeof stored === 'object' ? stored : {}) };
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({name: account.name, bio: account.bio, phone: extra.phone, birth: extra.birth, gender: extra.gender, job: extra.job, school: extra.school});
  const [notice, setNotice] = useState('');
  const update = <K extends keyof Extras>(key: K, value: Extras[K]) => { const next={...extra,[key]:value}; setExtra(next); saveDemo('settings_extra', next); };
  const startEdit = () => { setDraft({name: account.name, bio: account.bio, phone: extra.phone, birth: extra.birth, gender: extra.gender, job: extra.job, school: extra.school}); setEditing(true); };
  const save = (event: FormEvent) => { event.preventDefault(); if (!draft.name.trim()) return; const next = {...extra, phone:draft.phone, birth:draft.birth, gender:draft.gender, job:draft.job, school:draft.school}; setExtra(next); saveDemo('settings_extra',next); onSave({...account,name:draft.name.trim(),bio:draft.bio.trim()}); setEditing(false); setNotice('Đã lưu thay đổi trên trình duyệt này.'); };
  const toggle = (key: 'online'|'notifications'|'sounds'|'preview'|'searchable', title: string, subtitle: string) => <div className="ly-setting-toggle-row"><div><strong>{title}</strong><span>{subtitle}</span></div><button type="button" role="switch" aria-label={title} aria-checked={extra[key]} className={`ly-switch ${extra[key] ? 'checked':''}`} onClick={()=>update(key,!extra[key])}><span/></button></div>;
  return <main className="ly-settings-page">
    <header className="ly-settings-title"><h1>Cài đặt</h1><p>Quản lý tài khoản và trải nghiệm sử dụng</p></header>
    <div className="ly-settings-grid">
      <nav className="ly-settings-menu" aria-label="Danh mục cài đặt">
        {tabs.map(t => {const Icon=t.icon;return <button type="button" key={t.id} className={`ly-settings-menu-item ${tab===t.id?'selected':''}`} onClick={()=>{setTab(t.id);setNotice('');}}><span className="ly-settings-menu-icon"><Icon size={25}/></span><span className="ly-settings-menu-copy"><strong>{t.title}</strong><small>{t.desc}</small></span><ChevronRight size={19}/></button>;})}
        <button type="button" className="ly-settings-menu-item logout" onClick={()=>{if(window.confirm('Bạn muốn đăng xuất khỏi LyraChat?')) onLogout();}}><span className="ly-settings-menu-icon"><LogOut size={25}/></span><span className="ly-settings-menu-copy"><strong>Đăng xuất</strong><small>Đăng xuất khỏi tài khoản hiện tại</small></span><ChevronRight size={19}/></button>
      </nav>
      <div className="ly-settings-content">
        {tab==='account' && <>
          <section className="ly-settings-hero"><div className="ly-settings-hero-inner"><Avatar initial={account.name.charAt(0).toUpperCase()} color="#429c88" size={102} presence={extra.online?'online':undefined}/><div className="ly-settings-hero-user"><h2>{account.name}</h2><p><span className={`ly-online-dot ${extra.online?'':'offline'}`}/>{extra.online?'Đang hoạt động':'Đã ẩn trạng thái hoạt động'}</p><span>{[extra.job,extra.school].filter(Boolean).join('  |  ') || account.bio || 'Thành viên LyraChat'}</span></div></div><button type="button" className="ly-edit-profile" onClick={startEdit}><Pencil size={19}/> Chỉnh sửa hồ sơ</button></section>
          <section className="ly-settings-card"><h3>Thông tin cơ bản</h3><div className="ly-profile-fields">
            {[{icon:UserRound,label:'Họ và tên',value:account.name},{icon:Mail,label:'Email',value:account.email},{icon:Phone,label:'Số điện thoại',value:extra.phone || 'Chưa cập nhật'},{icon:CalendarDays,label:'Ngày sinh',value:extra.birth ? new Date(extra.birth+'T00:00:00').toLocaleDateString('vi-VN') : 'Chưa cập nhật'},{icon:CircleUserRound,label:'Giới tính',value:extra.gender}].map((row)=>{const Icon=row.icon;return <div className="ly-profile-field" key={row.label}><Icon size={21}/><strong>{row.label}</strong><span>{row.value}</span><button type="button" aria-label={`Chỉnh sửa ${row.label}`} onClick={startEdit}><Pencil size={19}/></button></div>;})}
          </div></section>
          <section className="ly-settings-card"><h3>Trạng thái hoạt động</h3><div className="ly-setting-highlight-row"><div className="ly-setting-highlight-icon"><Eye size={23}/></div>{toggle('online','Hiển thị trạng thái hoạt động','Cho phép người khác thấy khi bạn đang hoạt động')}</div></section>
          <section className="ly-settings-card"><h3>Tùy chọn nhanh</h3><div className="ly-settings-quick"><button type="button" onClick={()=>setTab('security')}><span><LockKeyhole size={22}/></span><span><strong>Đổi mật khẩu</strong><small>Quản lý bảo mật tài khoản</small></span><ChevronRight/></button><button type="button" onClick={()=>{setNotice('Liên kết tài khoản Google hoặc Microsoft cần tích hợp backend.');}}><span><Monitor size={22}/></span><span><strong>Liên kết tài khoản</strong><small>Kết nối với Google hoặc Microsoft</small></span><ChevronRight/></button></div></section>
        </>}
        {tab==='notifications' && <section className="ly-settings-card ly-tab-card"><h3>Thông báo</h3><p className="ly-tab-intro">Tùy chỉnh cách LyraChat hiển thị thông báo trên thiết bị này.</p>{toggle('notifications','Nhận thông báo','Hiển thị thông báo trong giao diện ứng dụng')}{toggle('sounds','Âm thanh thông báo','Cho phép phát âm thanh khi có tin nhắn mới')}{toggle('preview','Xem trước nội dung','Hiển thị bản xem trước tin nhắn trên thông báo')}</section>}
        {tab==='appearance' && <section className="ly-settings-card ly-tab-card"><h3>Giao diện</h3><p className="ly-tab-intro">Chọn chế độ hiển thị bạn muốn sử dụng.</p><label className="ly-form-line">Chế độ giao diện<select value={extra.theme} onChange={e=>update('theme',e.target.value)}><option value="light">Sáng (mặc định)</option><option value="dark" disabled>Tối (chưa hỗ trợ)</option></select></label><div className="ly-settings-note"><Info size={17}/> Giao diện tối đang được chuẩn bị. Bản demo hiện dùng tông sáng theo mẫu LyraChat.</div></section>}
        {tab==='privacy' && <section className="ly-settings-card ly-tab-card"><h3>Quyền riêng tư</h3><p className="ly-tab-intro">Các tùy chọn hiển thị dành cho bản demo frontend.</p>{toggle('online','Hiển thị trạng thái hoạt động','Cho phép người khác biết khi bạn trực tuyến')}{toggle('searchable','Cho phép tìm thấy hồ sơ','Hiển thị hồ sơ trong danh bạ demo')}<div className="ly-settings-note"><Info size={17}/> Quyền riêng tư thực tế sẽ được thực thi trên server ở giai đoạn backend.</div></section>}
        {tab==='security' && <section className="ly-settings-card ly-tab-card"><h3>Bảo mật</h3><p className="ly-tab-intro">Quản lý các tính năng bảo vệ tài khoản.</p><div className="ly-unavailable"><ShieldCheck size={28}/><strong>Đổi mật khẩu và xác thực hai bước</strong><span>Tính năng này cần backend xác thực an toàn. Chưa thể đổi mật khẩu thật trong bản demo.</span></div></section>}
        {tab==='language' && <section className="ly-settings-card ly-tab-card"><h3>Ngôn ngữ</h3><p className="ly-tab-intro">Lựa chọn ngôn ngữ cho ứng dụng.</p><label className="ly-form-line">Ngôn ngữ hiển thị<select value={extra.language} onChange={e=>update('language',e.target.value)}><option value="vi">Tiếng Việt</option><option value="en" disabled>English (chưa hỗ trợ)</option></select></label><div className="ly-settings-note"><Info size={17}/> Nội dung hiện tại vẫn hiển thị tiếng Việt; bản dịch tiếng Anh sẽ được bổ sung sau.</div></section>}
        {notice && <div className="ly-settings-feedback" role="status"><Check size={17}/>{notice}<button type="button" aria-label="Đóng thông báo" onClick={()=>setNotice('')}><X size={15}/></button></div>}
      </div>
    </div>
    {editing && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget) setEditing(false);}}><form className="ly-edit-dialog" onSubmit={save} role="dialog" aria-modal="true" aria-label="Chỉnh sửa hồ sơ"><div className="ly-edit-head"><h2>Chỉnh sửa hồ sơ</h2><button type="button" aria-label="Đóng" onClick={()=>setEditing(false)}><X size={22}/></button></div><div className="ly-edit-body"><label>Họ và tên<input required maxLength={60} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Email<input value={account.email} readOnly title="Không thể đổi email ở bản demo"/></label><label>Số điện thoại<input maxLength={20} value={draft.phone} onChange={e=>setDraft({...draft,phone:e.target.value})}/></label><label>Ngày sinh<input type="date" value={draft.birth} onChange={e=>setDraft({...draft,birth:e.target.value})}/></label><label>Giới tính<select value={draft.gender} onChange={e=>setDraft({...draft,gender:e.target.value})}><option>Chưa cập nhật</option><option>Nam</option><option>Nữ</option><option>Khác</option><option>Không muốn chia sẻ</option></select></label><label>Nghề nghiệp<input maxLength={80} value={draft.job} onChange={e=>setDraft({...draft,job:e.target.value})}/></label><label>Trường học<input maxLength={100} value={draft.school} onChange={e=>setDraft({...draft,school:e.target.value})}/></label><label className="ly-edit-wide">Giới thiệu<textarea rows={3} maxLength={240} value={draft.bio} onChange={e=>setDraft({...draft,bio:e.target.value})}/></label></div><div className="ly-edit-actions"><button type="button" onClick={()=>setEditing(false)}>Hủy</button><button type="submit">Lưu thay đổi</button></div></form></div>}
  </main>;
}
