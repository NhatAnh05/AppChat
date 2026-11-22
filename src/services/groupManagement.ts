/**
 * Các hàm thuần phục vụ giao diện nhóm.
 * Không tự nhận người dùng là thành viên nếu máy chủ chưa xác nhận.
 */
import type { ContactEntry } from '../types/contact.ts';
import type { CreatedRoom } from './createRoomProtocol.ts';

export function sameGroupName(first: string, second: string): boolean {
  return first.trim().toLocaleLowerCase('vi') === second.trim().toLocaleLowerCase('vi');
}

export function makeGroupContact(room: Pick<CreatedRoom, 'name'>): ContactEntry {
  const name = room.name.trim();
  return {
    id: name,
    name,
    initials: name.slice(0, 2).toLocaleUpperCase('vi'),
    color: '#428d83',
    detail: 'Nhóm trò chuyện',
  };
}

/** Để tìm nhanh theo tên tiếng Việt, kể cả khi người dùng gõ không dấu. */
export function normalizeGroupSearch(keyword: string): string {
  return keyword
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLocaleLowerCase('vi');
}

export function filterAndSortGroups(
  groups: readonly ContactEntry[],
  keyword: string,
  ascending = true,
): ContactEntry[] {
  const search = normalizeGroupSearch(keyword);
  return groups
    .filter(group => normalizeGroupSearch(group.name).includes(search))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }) * (ascending ? 1 : -1));
}

/** API JOIN_ROOM nhận tên nhóm; không có đường dẫn mời riêng từ backend. */
export function makeGroupShareText(roomName: string): string {
  return `Mời bạn vào nhóm "${roomName.trim()}" trên LyraChat. Mở mục Nhóm → Tham gia nhóm và nhập đúng tên nhóm này.`;
}

/** Đưa thông báo API kỹ thuật về tiếng Việt, nhưng giữ nguyên lỗi chưa biết. */
export function readableGroupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/room exist or error|already exist|room already exists/i.test(message)) {
    return 'Tên nhóm đã tồn tại hoặc máy chủ không cho phép tạo nhóm này. Hãy thử tên khác.';
  }
  if (/room not found|room does not exist/i.test(message)) {
    return 'Không tìm thấy nhóm. Hãy kiểm tra chính xác tên nhóm rồi thử lại.';
  }
  if (/room owner|owner cannot leave|you are owner/i.test(message)) {
    return 'Máy chủ không cho phép chủ phòng rời nhóm này.';
  }
  if (/not in (this |the )?room|you not in room/i.test(message)) {
    return 'Tài khoản hiện tại chưa là thành viên của nhóm.';
  }
  return message || 'Thao tác nhóm chưa thực hiện được. Vui lòng thử lại.';
}
