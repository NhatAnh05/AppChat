/**
 * Tần suất thăm dò dự phòng được giữ thấp để tránh spam API và vẽ lại UI liên tục.
 * WebSocket SEND_CHAT vẫn nhận tin realtime; đây không phải độ trễ bắt buộc cho mọi tin.
 */
export const HISTORY_REFRESH_MS = 60_000;
export const PRESENCE_REFRESH_MS = 120_000;
