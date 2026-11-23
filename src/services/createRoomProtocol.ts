/** API 6 CREATE_ROOM — contract from chat_API.xlsx, row CREATE_ROOM. */
export type CreatedRoomMember = { id: number; name: string };
export type CreatedRoom = {
  name: string;
  user: CreatedRoomMember[];
  chatMess: unknown[];
};

export type CreateRoomResponse =
  | { status: 'success'; room: CreatedRoom }
  | { status: 'error'; message: string };

/** Frontend guardrail, not a claimed server-side length restriction. */
export function normalizeRoomName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error('Vui lòng nhập tên nhóm.');
  if (normalized.length > 80) throw new Error('Tên nhóm không được vượt quá 80 ký tự.');
  if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error('Tên nhóm chứa ký tự không hợp lệ.');
  return normalized;
}

export function makeCreateRoomRequest(name: string) {
  return { action: 'onchat', data: { event: 'CREATE_ROOM', data: { name: normalizeRoomName(name) } } };
}

export function parseCreateRoomResponse(input: unknown): CreateRoomResponse | null {
  let value = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const frame = value as Record<string, unknown>;
  if (frame.event !== 'CREATE_ROOM') return null;
  if (frame.status === 'error') {
    return {status: 'error', message: typeof frame.mes === 'string' && frame.mes.trim()
      ? frame.mes.trim() : 'Máy chủ từ chối tạo nhóm.'};
  }
  if (frame.status !== 'success') return {status:'error',message:'Phản hồi CREATE_ROOM thiếu trạng thái hợp lệ.'};
  // An ACK with status=success is not enough to reconstruct the room. The
  // documented CREATE_ROOM response must include data.name/user/chatMess.
  // Report the specific incompatible field without printing room/member data.
  // A malformed ACK might still mean the server created the room; callers
  // must not retry automatically and risk creating duplicate rooms.
  const data = frame.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {status:'error',message:'CREATE_ROOM: data không phải đối tượng nhóm theo chat_API.xlsx (cần name, user, chatMess). Kiểm tra phòng đã tồn tại trước khi thử lại.'};
  }
  const room = data as Record<string, unknown>;
  if (typeof room.name !== 'string' || !room.name.trim()) {
    return {status:'error',message:'CREATE_ROOM: thiếu data.name (tên nhóm dạng chuỗi) trong phản hồi máy chủ. Kiểm tra phòng đã tồn tại trước khi thử lại.'};
  }
  if (!Array.isArray(room.user)) {
    return {status:'error',message:'CREATE_ROOM: data.user phải là mảng thành viên theo chat_API.xlsx. Kiểm tra phòng đã tồn tại trước khi thử lại.'};
  }
  if (!Array.isArray(room.chatMess)) {
    return {status:'error',message:'CREATE_ROOM: data.chatMess phải là mảng tin nhắn theo chat_API.xlsx. Kiểm tra phòng đã tồn tại trước khi thử lại.'};
  }
  const members: CreatedRoomMember[] = [];
  for (const [index, item] of room.user.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return {status:'error',message:`CREATE_ROOM: data.user[${index}] phải là đối tượng thành viên {id, name}.`};
    }
    const member = item as Record<string, unknown>;
    if (!Number.isInteger(member.id)) {
      return {status:'error',message:`CREATE_ROOM: data.user[${index}].id phải là số nguyên theo chat_API.xlsx.`};
    }
    if (typeof member.name !== 'string' || !member.name.trim()) {
      return {status:'error',message:`CREATE_ROOM: data.user[${index}].name phải là tên thành viên dạng chuỗi.`};
    }
    members.push({id: member.id as number, name: member.name.trim()});
  }
  return {status:'success',room:{name:room.name.trim(),user:members,chatMess:room.chatMess}};
}
