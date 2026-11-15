/**
 * API chat trả createAt dạng yyyy-MM-dd HH:mm:ss mà không kèm múi giờ.
 * Máy chủ dùng UTC; diễn giải chuỗi không có offset là UTC và hiển thị UTC+7.
 * Giá trị ISO có Z / +HH:mm đã chứa múi giờ và được giữ nguyên ý nghĩa.
 */
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function parseChatTime(value: string): number {
  const text = value.trim();
  const withoutZone = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (withoutZone) {
    const [, y, m, d, h, min, sec = "0", millis = "0"] = withoutZone;
    const timestamp = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(sec), Number(millis.padEnd(3, "0")));
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() + 1 !== Number(m) || date.getUTCDate() !== Number(d)) return NaN;
    return timestamp;
  }
  return Date.parse(text);
}

export function formatChatTime(value: string, includeDate = false): string {
  const timestamp = parseChatTime(value);
  if (!Number.isFinite(timestamp)) return value;
  const date = new Date(timestamp);
  const format = new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(includeDate ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}),
  });
  if (!includeDate) return format.format(date);
  const parts = format.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("day")}/${get("month")}/${get("year")}`;
}
