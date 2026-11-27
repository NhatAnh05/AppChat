/** Hợp đồng API 16 do giảng viên cung cấp. */
export const USER_EXIST_REQUEST_EVENT = 'CHAT_CHECK_USER_EXIST';
export const USER_EXIST_RESPONSE_EVENT = 'CHECK_USER_EXIST';

/** true: tồn tại; false: không tồn tại; lỗi định dạng phải được báo rõ. */
export function parseUserExistResponse(data: unknown): boolean | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const status = (data as { status?: unknown }).status;
    return typeof status === 'boolean' ? status : null;
}
