import { useEffect, useState } from 'react';
import { Check, ChevronRight, Copy, Eye, EyeOff, Info, LockKeyhole, LogOut, MessageSquareText, Monitor, ShieldCheck, UserRound, X } from 'lucide-react';
import Avatar from './Avatar';

type Tab = 'profile' | 'display' | 'security';
export type LocalChatSettings = { compactChats: boolean; messagePreview: boolean };
export const SETTINGS_KEY = 'lyra:chat-settings:v1';
export const DEFAULT_CHAT_SETTINGS: LocalChatSettings = { compactChats: false, messagePreview: true };
export function readChatSettings(): LocalChatSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      compactChats: typeof saved.compactChats === 'boolean' ? saved.compactChats : false,
      messagePreview: typeof saved.messagePreview === 'boolean' ? saved.messagePreview : true,
    };
  } catch { return { ...DEFAULT_CHAT_SETTINGS }; }
}

type Props = {
  username: string;
  settings: LocalChatSettings;
  onSettingsChange: (settings: LocalChatSettings) => void;
  onLogout: () => void;
  onClose: () => void;
};
const menu: { id: Tab; title: string; subtitle: string; icon: typeof UserRound }[] = [
  { id: 'profile', title: 'Tài khoản', subtitle: 'Thông tin tài khoản của bạn', icon: UserRound },
  { id: 'display', title: 'Hiển thị', subtitle: 'Tùy chỉnh danh sách tin nhắn', icon: Monitor },
  { id: 'security', title: 'Bảo mật', subtitle: 'Phiên đăng nhập và quyền riêng tư', icon: ShieldCheck },
];

export default function AccountSettingsDialog({ username, settings, onSettingsChange, onLogout, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('profile');
  const [copied, setCopied] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [onClose]);
  const change = (key: keyof LocalChatSettings, checked: boolean) => {
    onSettingsChange({ ...settings, [key]: checked });
  };
  const copyUsername = async () => {
    try { await navigator.clipboard.writeText(username); setCopied(true); }
    catch { setCopied(false); }
  };
  return <div className="ly-account-dialog" role="dialog" aria-modal="true" aria-labelledby="ly-account-title">
    <header className="ly-account-header">
      <div><span className="eyebrow">LYRACHAT / CÀI ĐẶT</span><h2 id="ly-account-title">Cài đặt tài khoản</h2><p>Quản lý tài khoản và trải nghiệm trò chuyện</p></div>
      <button type="button" className="ly-account-close" onClick={onClose} aria-label="Đóng cài đặt"><X size={19}/></button>
    </header>
    <div className="ly-account-layout">
      <nav className="ly-account-nav" aria-label="Danh mục cài đặt">
        {menu.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={`ly-account-nav-item ${tab===item.id?'active':''}`} onClick={()=>{setTab(item.id);setConfirmLogout(false);}} aria-current={tab===item.id?'page':undefined}>
          <span className="ly-account-nav-icon"><Icon size={19}/></span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><ChevronRight size={16}/>
        </button>; })}
      </nav>
      <div className="ly-account-content">
        {tab === 'profile' && <>
          <section className="ly-account-identity"><Avatar initial={username.charAt(0).toUpperCase() || 'U'} color="#429c88" size={67}/><div><h3>{username}</h3><span className="ly-account-status"><i/>Đã đăng nhập qua WebSocket</span></div></section>
          <h3 className="ly-account-section-title">Thông tin tài khoản</h3>
          <div className="ly-account-info-row"><span><UserRound size={17}/>Tên đăng nhập</span><strong>{username}</strong><button type="button" onClick={copyUsername} aria-label="Sao chép tên đăng nhập" title="Sao chép tên đăng nhập">{copied?<Check size={17}/>:<Copy size={17}/>}</button></div>
          {copied && <p className="ly-account-copy-note" role="status">Đã sao chép tên đăng nhập.</p>}
          <div className="ly-account-info-row"><span><LockKeyhole size={17}/>Xác thực</span><strong>Máy chủ giảng viên</strong></div>
          <div className="ly-account-help"><Info size={17}/><p>API hiện tại chỉ cung cấp đăng nhập, đăng xuất và nhắn tin. Không thể đổi tên đăng nhập, ảnh đại diện, email hoặc mật khẩu từ đây. Thông tin tài khoản thật do máy chủ quản lý.</p></div>
        </>}
        {tab === 'display' && <>
          <h3 className="ly-account-panel-title">Tùy chỉnh hiển thị</h3><p className="ly-account-panel-description">Những lựa chọn dưới đây chỉ áp dụng trên trình duyệt này và không thay đổi dữ liệu máy chủ.</p>
          <label className="ly-account-switch-row"><span className="ly-account-option-icon"><MessageSquareText size={19}/></span><span className="ly-account-switch-text"><strong>Danh sách hội thoại gọn</strong><small>Giảm khoảng cách giữa các cuộc trò chuyện</small></span><input type="checkbox" checked={settings.compactChats} onChange={e=>change('compactChats',e.target.checked)}/><span className="ly-account-switch" aria-hidden="true"/></label>
          <label className="ly-account-switch-row"><span className="ly-account-option-icon">{settings.messagePreview?<Eye size={19}/>:<EyeOff size={19}/>}</span><span className="ly-account-switch-text"><strong>Xem trước tin nhắn</strong><small>Hiển thị nội dung tin gần nhất trong danh sách</small></span><input type="checkbox" checked={settings.messagePreview} onChange={e=>change('messagePreview',e.target.checked)}/><span className="ly-account-switch" aria-hidden="true"/></label>
        </>}
        {tab === 'security' && <>
          <h3 className="ly-account-panel-title">Bảo mật tài khoản</h3><p className="ly-account-panel-description">Phiên của bạn được xác thực bằng giao thức WebSocket của giảng viên.</p>
          <div className="ly-account-security"><ShieldCheck size={23}/><span><strong>Kết nối đăng nhập</strong><small>Đã đăng nhập vào LyraChat</small></span></div>
          <div className="ly-account-help"><Info size={17}/><p>Máy chủ chưa cung cấp lệnh đổi mật khẩu hay xác thực hai bước. LyraChat sẽ không giả lập những thay đổi này.</p></div>
        </>}
        <div className="ly-account-logout-area">
          {!confirmLogout ? <button type="button" className="ly-account-logout" onClick={()=>setConfirmLogout(true)}><LogOut size={18}/>Đăng xuất khỏi tài khoản</button> : <div className="ly-account-confirm"><strong>Bạn có chắc muốn đăng xuất?</strong><span>Phiên WebSocket hiện tại sẽ kết thúc.</span><div><button type="button" onClick={()=>setConfirmLogout(false)}>Hủy</button><button type="button" onClick={onLogout}>Đăng xuất</button></div></div>}
        </div>
      </div>
    </div>
  </div>;
}
