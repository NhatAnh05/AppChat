import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store";
import {websocketService, type WebSocketState} from "../services/websocket.ts";

type SidebarProps = {
  activeSection: string;
  unreadCount: number;
  onSectionChange: (section: string) => void;
  settingsOpen: boolean;
  onSettingsToggle: () => void;
  onLogout: () => void;
};

const navItems = [
  { label: 'Tin nh\u1EAFn', icon: 'message' },
  { label: 'Danh b\u1EA1', icon: 'users' },
  { label: 'Nhóm', icon: 'group' },
  { label: 'Cuộc gọi', icon: 'phone' },
  { label: 'Thư mục', icon: 'folder' },
  { label: 'C\u00E0i \u0111\u1EB7t', icon: 'settings' },
];

function NavIcon({ name }: { name: string }) {
  if (name === 'message') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1 2v-5.5A7.5 7.5 0 1 1 20 11.5Z" /></svg>;
  if (name === 'users') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20M16 5a3.5 3.5 0 0 1 0 6.8M18 14a5 5 0 0 1 3.5 4.8V20" /></svg>;
  if (name === 'group') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 15a5 5 0 0 1 4 5"/></svg>;
  if (name === 'phone') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-2.6 2.3a15 15 0 0 0 4.3 4.3L16 12l5 2v4a3 3 0 0 1-3 3A15 15 0 0 1 3 6a3 3 0 0 1 3-3Z"/></svg>;
  if (name === 'folder') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 3h9v11H3V6Z"/><path d="M17 12v6m-3-3h6"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></svg>;
}

export function Sidebar({ activeSection, unreadCount, onSectionChange, settingsOpen, onSettingsToggle, onLogout }: SidebarProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileActionsRef = useRef<HTMLDivElement>(null);
  const userId = useSelector((state: RootState) => state.auth.userId);
  const [connectionStatus, setConnectionStatus] = useState<WebSocketState>(
      websocketService.getStatus()
  );
  const displayName = userId || "Người dùng";

  const [avatarImage, setAvatarImage] = useState(() => { try { return JSON.parse(localStorage.getItem(`lyra-local-profile-${userId}`) || "{}").avatar || ""; } catch { return ""; }});
  useEffect(() => { const update = () => {try {setAvatarImage(JSON.parse(localStorage.getItem(`lyra-local-profile-${userId}`) || "{}").avatar || "");} catch {setAvatarImage("");}}; window.addEventListener("lyra-profile-update",update); return () => window.removeEventListener("lyra-profile-update",update); }, [userId]);
  const avatarText = displayName
      .slice(0, 2)
      .toUpperCase();

  useEffect(() => {
    if (!profileMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileActionsRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [profileMenuOpen]);

  useEffect(() => {
    const unsubscribe = websocketService.onStatus((status) => {
      setConnectionStatus(status);
    });

    return unsubscribe;
  }, []);

  return <aside className="sidebar">
    <a className="brand" href="/chat" aria-label="LyraChat"><img className="lyra-logo" src="/lyra-logo.png" alt=""/><span>LyraChat</span></a>
    <nav className="sidebar-nav" aria-label="&#272;i&#7873;u h&#432;&#7899;ng ch&#237;nh">
      {navItems.map((item) => {
        const isSettings = item.icon === 'settings';
        const selected = isSettings ? settingsOpen : activeSection === item.label;
        const button = <button className={`nav-item ${selected ? 'is-active' : ''}`} onClick={() => isSettings ? onSettingsToggle() : onSectionChange(item.label)}><NavIcon name={item.icon} /><span>{item.label}</span>{item.icon === 'message' && unreadCount > 0 && <span className="nav-unread-badge" aria-label={`${unreadCount} tin nhắn chưa đọc`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>;
        return <div key={item.label}>{button}</div>;
      })}
    </nav>
    <div className="user-profile">
      <button type="button" className="profile-avatar lyra-avatar-button" onClick={onSettingsToggle} title="Mở cài đặt tài khoản" aria-label="Mở cài đặt tài khoản">
        {avatarImage ? <img src={avatarImage} alt="Ảnh đại diện" className="lyra-sidebar-avatar-img"/> : avatarText}
        <span className="online-dot" />
      </button>

      <div className="profile-copy" style={{display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", flex: 1, minWidth: 0}}>
        <button type="button" className="lyra-profile-name-button" onClick={onSettingsToggle} title="Xem cài đặt cá nhân">
          <strong>{displayName}</strong>
          <span>{connectionStatus === "CONNECTED" ? "Online" : connectionStatus === "CONNECTING" ? "Đang kết nối..." : "Ngoại tuyến"}
          </span>
        </button>

        <div className="profile-actions" ref={profileActionsRef} style={{ flexShrink: 0, marginLeft: "8px" }}>
          <button className="more-button" aria-label="Tùy chọn tài khoản" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>
            <span aria-hidden="true">⌄</span>
          </button>

          {profileMenuOpen && (
              <div className="profile-menu">
                <button className="lyra-account-menu-item" onClick={() => {setProfileMenuOpen(false); onSettingsToggle();}}><i className="bi bi-person-gear" /> Cài đặt trang cá nhân</button>
                <button className="settings-logout" onClick={() => {setProfileMenuOpen(false);onLogout();}}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 17l5-5-5-5M15 12H3m9-8h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7" />
                  </svg>
                  Đăng xuất
                </button>
              </div>
          )}
        </div>
      </div>
    </div>
  </aside>;
}
