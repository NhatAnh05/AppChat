/**
 * Thông báo hệ điều hành chỉ bật sau khi người dùng cấp quyền trình duyệt.
 * Nội dung tin không bị hiển thị trong notification để bảo vệ riêng tư.
 * Không dùng API giảng viên mới, chỉ tận dụng sự kiện SEND_CHAT đã nhận.
 */
const seen = new Set<string>();

export function mayNotifyMessage(isHidden: boolean, enabled: boolean, permission: string, sender: string, self: string): boolean {
  return isHidden && enabled && permission === 'granted' && !!sender && sender.toLowerCase() !== self.toLowerCase();
}

export function notifyIncomingMessage(userId: string, sender: string, messageKey: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Notification === 'undefined') return;
  if (seen.has(messageKey)) return;
  let enabled = true;
  try {
    const value = JSON.parse(localStorage.getItem(`lyra-local-profile-${userId}`) || '{}');
    enabled = value.notifications !== false;
  } catch { /* không đọc được cấu hình: giữ mặc định, quyền trình duyệt vẫn bắt buộc */ }
  if (!mayNotifyMessage(document.visibilityState === 'hidden', enabled, Notification.permission, sender, userId)) return;
  seen.add(messageKey);
  if (seen.size > 500) seen.clear();
  try {
    const notification = new Notification(`Tin nhắn mới từ ${sender}`, {
      body: 'Mở LyraChat để xem nội dung.',
      tag: `lyra-${messageKey}`,
      silent: false,
    });
    notification.onclick = () => { window.focus(); notification.close(); };
  } catch { /* Thông báo không khả dụng trên thiết bị này */ }
}
