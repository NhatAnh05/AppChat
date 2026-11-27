import { useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store";

type Theme = "light" | "dark";
type SettingsProps = {theme: Theme; onThemeChange: (theme: Theme) => void; onLogout: () => void; onClose: () => void};
type LocalProfile = {displayName: string; bio: string; avatar: string; notifications: boolean; showOnline: boolean; phone: string; email: string; location: string};

export function SettingsDialog({theme, onThemeChange, onLogout, onClose}: SettingsProps) {
  const username = useSelector((state: RootState) => state.auth.userId) || "Người dùng";
  const storageKey = `lyra-local-profile-${username}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"profile" | "appearance" | "privacy">("profile");
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<LocalProfile>(() => {
    let saved: Partial<LocalProfile> = {};
    try {saved = JSON.parse(localStorage.getItem(storageKey) || "{}");} catch { /* ignore bad local data */ }
    return {displayName:saved.displayName || username, bio:saved.bio || "", avatar:saved.avatar || "", notifications:saved.notifications ?? true, showOnline:saved.showOnline ?? true, phone:saved.phone || "", email:saved.email || "", location:saved.location || ""};
  });
  function update<K extends keyof LocalProfile>(key: K, value: LocalProfile[K]) {setProfile(previous => ({...previous, [key]:value}));setMessage("");}
  function save() {
    try {localStorage.setItem(storageKey, JSON.stringify(profile));window.dispatchEvent(new Event("lyra-profile-update"));setMessage("Đã lưu thông tin trên trình duyệt này.");}
    catch {setMessage("Không đủ dung lượng để lưu. Hãy chọn ảnh nhỏ hơn.");}
  }
  async function enableDesktopNotifications() {
    if (typeof Notification === 'undefined') { setMessage('Trình duyệt không hỗ trợ thông báo hệ thống.'); return; }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        update('notifications', true);
        setMessage('Trình duyệt đã cấp quyền. Hãy bấm Lưu thay đổi để bật thông báo.');
      } else setMessage('Trình duyệt chưa cấp quyền thông báo. Có thể đổi quyền trong phần cài đặt trang web.');
    } catch {setMessage('Không thể yêu cầu quyền thông báo trên thiết bị này.');}
  }
  async function chooseAvatar(file?: File) {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) {setMessage("Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF.");return;}
    if (file.size > 1_500_000) {setMessage("Ảnh quá lớn. Vui lòng chọn ảnh dưới 1,5 MB.");return;}
    const reader = new FileReader();
    reader.onload = () => {if (typeof reader.result === 'string') update('avatar',reader.result);};
    reader.onerror = () => setMessage("Không đọc được ảnh đã chọn.");
    reader.readAsDataURL(file);
  }
  return <section className="lyra-settings-page" aria-label="Cài đặt tài khoản">
    <div className="lyra-settings-top"><div><span className="lyra-settings-eyebrow">TÀI KHOẢN & TÙY CHỈNH</span><h1>Cài đặt</h1><p>Quản lý hồ sơ và trải nghiệm sử dụng LyraChat</p></div><button type="button" className="lyra-back-to-chat" onClick={onClose}><i className="bi bi-arrow-left"/> Quay lại tin nhắn</button></div>
    <div className="lyra-settings-layout">
      <nav className="lyra-settings-menu" aria-label="Danh mục cài đặt">
        <button className={tab==='profile'?'selected':''} onClick={()=>setTab('profile')}><i className="bi bi-person-vcard"/><span><strong>Trang cá nhân</strong><small>Thông tin và ảnh đại diện</small></span></button>
        <button className={tab==='appearance'?'selected':''} onClick={()=>setTab('appearance')}><i className="bi bi-palette"/><span><strong>Giao diện</strong><small>Chế độ sáng, tối</small></span></button>
        <button className={tab==='privacy'?'selected':''} onClick={()=>setTab('privacy')}><i className="bi bi-shield-check"/><span><strong>Quyền riêng tư</strong><small>Tùy chọn tài khoản</small></span></button>
        <div className="lyra-settings-menu-footer"><button onClick={onLogout}><i className="bi bi-box-arrow-right"/> Đăng xuất</button></div>
      </nav>
      <div className="lyra-settings-content">
        {tab==='profile' && <>
          <div className="lyra-profile-cover"><span>Hồ sơ cá nhân</span><div className="lyra-profile-cover-shape"/></div>
          <div className="lyra-profile-summary"><button type="button" className="lyra-profile-photo" onClick={()=>fileRef.current?.click()} title="Đổi ảnh đại diện">{profile.avatar?<img src={profile.avatar} alt="Ảnh đại diện"/>:<span>{username.slice(0,2).toUpperCase()}</span>}<i className="bi bi-camera-fill"/></button><div><h2>{profile.displayName || username}</h2><p>@{username}</p></div><button type="button" className="lyra-photo-change" onClick={()=>fileRef.current?.click()}><i className="bi bi-camera"/> Đổi ảnh đại diện</button></div>
          <input className="lyra-hidden-upload" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{void chooseAvatar(e.target.files?.[0]);e.target.value='';}}/>
          <div className="lyra-profile-fields"><h3>Thông tin cơ bản</h3><p>Những thông tin bạn muốn hiển thị trên thiết bị này.</p><div className="lyra-field-grid"><label>Tên hiển thị<input value={profile.displayName} maxLength={40} onChange={e=>update('displayName',e.target.value)} placeholder="Tên hiển thị"/></label><label>Tên đăng nhập<input disabled value={username}/></label><label className="full">Giới thiệu bản thân<textarea rows={4} maxLength={200} value={profile.bio} onChange={e=>update('bio',e.target.value)} placeholder="Viết đôi dòng giới thiệu về bạn..."/></label><label>Email liên hệ<input type="email" maxLength={100} value={profile.email} onChange={e=>update('email',e.target.value)} placeholder="email@example.com"/></label><label>Số điện thoại<input type="tel" maxLength={20} value={profile.phone} onChange={e=>update('phone',e.target.value)} placeholder="Số điện thoại"/></label><label className="full">Khu vực<input maxLength={100} value={profile.location} onChange={e=>update('location',e.target.value)} placeholder="Tỉnh / Thành phố"/></label></div></div>
        </>}
        {tab==='appearance' && <div className="lyra-settings-card"><h2>Giao diện</h2><p>Lựa chọn chế độ hiển thị phù hợp.</p><div className="lyra-appearance-choices"><button className={`lyra-appearance-choice ${theme==='light'?'selected':''}`} onClick={()=>onThemeChange('light')}><span className="lyra-theme-mini light"><i/><i/><i/></span><strong><i className="bi bi-sun"/> Chế độ sáng</strong><small>Nền sáng, dễ quan sát</small></button><button className={`lyra-appearance-choice ${theme==='dark'?'selected':''}`} onClick={()=>onThemeChange('dark')}><span className="lyra-theme-mini dark"><i/><i/><i/></span><strong><i className="bi bi-moon-stars"/> Chế độ tối</strong><small>Dịu mắt khi dùng ban đêm</small></button></div></div>}
        {tab==='privacy' && <div className="lyra-settings-card"><h2>Quyền riêng tư và thông báo</h2><p>Các tùy chọn được lưu trên trình duyệt, chưa được máy chủ áp dụng.</p><label className="lyra-preference"><span><strong>Ưu tiên thông báo</strong><small>Thông báo khi nhận tin mới và ứng dụng đang ở nền, chỉ sau khi bạn cấp quyền</small></span><input type="checkbox" checked={profile.notifications} onChange={e=>update('notifications',e.target.checked)}/></label><button type="button" className="lyra-desktop-permission" onClick={() => {void enableDesktopNotifications();}}><i className="bi bi-bell"/> Cấp quyền thông báo trên thiết bị</button><label className="lyra-preference"><span><strong>Hiển thị trạng thái trực tuyến</strong><small>Chỉ lưu tùy chọn, chưa thay đổi trạng thái trên server</small></span><input type="checkbox" checked={profile.showOnline} onChange={e=>update('showOnline',e.target.checked)}/></label></div>}
        {tab!=='appearance' && <div className="lyra-settings-bottom"><p>Thông tin và ảnh đại diện chỉ được lưu tại trình duyệt này, chưa cập nhật lên API của thầy hoặc thiết bị khác.</p><div>{message && <span role="status">{message}</span>}<button className="lyra-settings-save" disabled={!profile.displayName.trim()} onClick={save}><i className="bi bi-check2-circle"/> Lưu thay đổi</button></div></div>}
      </div>
    </div>
  </section>;
}
