/** Group chat protocol. Request/response shapes from chat_API.xlsx (JOIN/OUT/HISTORY/SEND_CHAT room). */
import { decodeChatContent, encodeChatContent } from './chatContentCodec.ts';
import type { ChatMessage } from '../types/chat.ts';
import { normalizeRoomName, type CreatedRoom, type CreatedRoomMember, parseCreateRoomResponse } from './createRoomProtocol.ts';
import { parseServerChatMessage, parseSendAcknowledgement } from './serverMessage.ts';
import { CHAT_HISTORY_EVENT, ROOM_HISTORY_EVENT } from './chatApiEvents.ts';

export { normalizeRoomName };
/** Local-only namespace; transport requests continue using the raw server room name. */
export const roomChatId = (name:string):string => `room:${normalizeRoomName(name)}`;
export const roomNameFromChatId = (id:string):string => id.startsWith('room:')?id.slice(5):id;
export type RoomDetails = CreatedRoom;
// The history read can succeed independently of optional/invalid roster metadata.
// JOIN/CREATE remain strict, and a missing roster never grants membership.
export type RoomHistoryDetails = Omit<CreatedRoom, 'user'> & {user?: CreatedRoomMember[]};
export type RoomHistoryDiagnostic = 'room-history-ok' | 'room-history-name' | 'room-history-data' | 'room-history-rows' | 'room-history-row-scope' | 'room-history-row-invalid' | 'room-history-members' | 'room-history-rejected' | 'room-history-timeout' | 'room-history-rows-missing' | 'room-history-rows-null' | 'room-history-rows-string' | 'room-history-rows-object' | 'room-history-rows-other';
export type RoomResult = {status:'success'; room:RoomDetails} | {status:'error'; message:string};
export type LeaveResult = {status:'success'} | {status:'error'; message:string};

export function makeRoomRequest(event:'JOIN_ROOM'|'OUT_ROOM', name:string) {
  return {action:'onchat', data:{event, data:{name:normalizeRoomName(name)}}};
}
export function makeRoomHistoryRequest(name:string, page:number) {
  if (!Number.isInteger(page) || page < 1) throw new Error('Trang lịch sử phải là số nguyên dương.');
  return {action:'onchat', data:{event:ROOM_HISTORY_EVENT, data:{name:normalizeRoomName(name),page}}};
}
export function makeRoomMessageRequest(name:string, content:string) {
  if (!content.trim()) throw new Error('Nhập nội dung tin nhắn nhóm.');
  const mes = encodeChatContent(content.trim());
  if(mes.length>10000)throw new Error("Nội dung vượt giới hạn API 10000 ký tự sau mã hóa.");
  return {action:'onchat',data:{event:'SEND_CHAT',data:{type:'room',to:normalizeRoomName(name),mes}}};
}
function record(value:unknown): Record<string,unknown>|null {
  return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : null;
}
function parseFrame(input:unknown, event:string):Record<string,unknown>|null {
  let value=input;
  if(typeof value==='string') {try{value=JSON.parse(value)}catch{return null}}
  const outer=record(value); if(!outer)return null;
  const frame=outer.event===event ? outer : record(outer.data)?.event===event ? record(outer.data) : null;
  return frame;
}
function parseMembers(value:unknown):CreatedRoomMember[]|null {
  if(!Array.isArray(value))return null;
  const members:CreatedRoomMember[]=[];
  for(const item of value){const member=record(item);if(!member||typeof member.name!=='string'||!member.name.trim())return null;
    const id=typeof member.id==='number'?member.id:typeof member.id==='string'&&/^\d+$/.test(member.id)?Number(member.id):NaN;
    if(!Number.isSafeInteger(id))return null;
    members.push({id,name:member.name.trim()});}
  return members;
}
function parseRoom(value:unknown):RoomDetails|null {
  const outer=record(value);
  const data=outer && !('name' in outer) ? record(outer.data) : outer;
  if(!data || typeof data.name!=='string'||!data.name.trim()||!Array.isArray(data.chatMess))return null;
  const user=parseMembers(data.user);if(!user)return null;
  return {name:data.name.trim(),user,chatMess:data.chatMess};
}
export function parseJoinRoomResponse(input:unknown):RoomResult|null {
  const frame=parseFrame(input,'JOIN_ROOM');if(!frame)return null;
  if(frame.status==='error')return {status:'error',message:typeof frame.mes==='string'?frame.mes:'Không thể tham gia nhóm.'};
  if(frame.status!=='success')return {status:'error',message:'Máy chủ chưa xác nhận tham gia nhóm.'};
  const room=parseRoom(frame.data);return room?{status:'success',room}:{status:'error',message:'Dữ liệu nhóm không hợp lệ.'};
}
export function parseLeaveRoomResponse(input:unknown):LeaveResult|null {
  const frame=parseFrame(input,'OUT_ROOM');if(!frame)return null;
  if(frame.status==='error')return {status:'error',message:typeof frame.mes==='string'?frame.mes:'Không thể rời nhóm.'};
  if(frame.status!=='success'||typeof record(frame.data)?.mes!=='string')return {status:'error',message:'Máy chủ chưa xác nhận rời nhóm.'};
  return {status:'success'};
}
export function mapRoomMessage(value:unknown, roomName:string):ChatMessage|null {
  const parsed=parseServerChatMessage(value);
  if(!parsed||parsed.type!==1||parsed.to.trim().toLowerCase()!==roomName.trim().toLowerCase())return null;
  const timestamp=parsed.createAt??new Date().toISOString();
  return {id:String(parsed.id??`live:${crypto.randomUUID()}`),chatId:roomChatId(roomName),senderId:parsed.name,senderName:parsed.name,
    recipientId:parsed.to,recipientName:parsed.to,content:decodeChatContent(parsed.mes),createdAt:timestamp,type:1};
}
// Compatibility for explicit JSON array encodings only; never infer empty history.
export function normalizeRoomHistoryRows(value:unknown):unknown[]|null {
  if(Array.isArray(value))return value;
  if(typeof value==='string'&&value.length<=2_000_000){try{const parsed:unknown=JSON.parse(value);return Array.isArray(parsed)?parsed:null;}catch{return null;}}
  const wrapper=record(value);
  if(wrapper&&Object.keys(wrapper).length===1&&Array.isArray(wrapper.data))return wrapper.data;
  return null;
}
export function roomHistoryRowsShape(value:unknown):RoomHistoryDiagnostic {
  return value===undefined?'room-history-rows-missing':value===null?'room-history-rows-null':typeof value==='string'?'room-history-rows-string':typeof value==='object'?'room-history-rows-object':'room-history-rows-other';
}
export function parseRoomHistoryResponse(input:unknown, name:string):
  | {status:'success';room:RoomHistoryDetails;messages:ChatMessage[];membersError?:string}
  | {status:'error';message:string;diagnostic:RoomHistoryDiagnostic} | null {
  // Excel: GET_ROOM_CHAT_MES; vẫn đọc alias cũ nếu server chủ động từ chối event chính.
  const frame=parseFrame(input,ROOM_HISTORY_EVENT) ?? parseFrame(input,CHAT_HISTORY_EVENT);
  if(!frame)return null;
  if(frame.status==='error')return {status:'error',message:typeof frame.mes==='string'?frame.mes:'Không tải được lịch sử nhóm.',diagnostic:'room-history-rejected'};
  if(frame.status!==undefined&&frame.status!=='success')return {status:'error',message:'Máy chủ chưa xác nhận lịch sử nhóm.',diagnostic:'room-history-rejected'};
  const outer=record(frame.data);
  const data=outer && !('name' in outer) ? record(outer.data) : outer;
  if(!data)return {status:'error',message:'Lịch sử nhóm: data không hợp lệ.',diagnostic:'room-history-data'};
  if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().toLowerCase()!==name.trim().toLowerCase())return {status:'error',message:'Dữ liệu lịch sử không khớp tên nhóm.',diagnostic:'room-history-name'};
  const rows=normalizeRoomHistoryRows(data.chatMess);
  if(!rows)return {status:'error',message:'Lịch sử nhóm: chatMess phải là mảng tin nhắn hợp lệ.',diagnostic:'room-history-rows'};
  const user=parseMembers(data.user);
  const room:RoomHistoryDetails={name:data.name.trim(),chatMess:rows,...(user!==null?{user}:{})};
  const messages:ChatMessage[]=[];
  for(const item of room.chatMess){
    const outer=record(item);const row=outer && !('name' in outer)?record(outer.data):outer;
    if(!row || typeof row.to!=='string' || row.to.trim().toLowerCase()!==name.trim().toLowerCase() || ![1,'1','room'].includes(row.type as number|string))return {status:'error',message:'Lịch sử chứa bản ghi không thuộc nhóm.',diagnostic:'room-history-row-scope'};
    if(typeof row.mes==='string' && !row.mes.trim())continue;
    const message=mapRoomMessage(row,name);
    if(!message||!(typeof row.id==='string'&&row.id.trim()&&!/^(local|live|ack|unverified):/.test(row.id)||typeof row.id==='number'&&Number.isSafeInteger(row.id))||typeof row.createAt!=='string'||!row.createAt.trim())return {status:'error',message:'Lịch sử chứa bản ghi không hợp lệ.',diagnostic:'room-history-row-invalid'};
    messages.push(message);
  }
  return {status:'success',room,messages,...(user===null?{membersError:'Máy chủ không cung cấp danh sách thành viên hợp lệ (data.user).'}:{})};
}
export function parseRoomSendResponse(input:unknown, name:string, content:string):
  | {status:'success';message:ChatMessage} | {status:'error';message:string} | null {
  const frame=parseFrame(input,'SEND_CHAT');if(!frame)return null;
  if(frame.status==='error')return {status:'error',message:typeof frame.mes==='string'?frame.mes:'Máy chủ từ chối tin nhắn nhóm.'};
  if(frame.status!=='success')return null;
  const parsed = parseSendAcknowledgement(frame.data);
  const msg=parsed ? mapRoomMessage(parsed,name) : null;
  if(!msg||msg.content!==content.trim())return null;
  return {status:'success',message:msg};
}
// The CREATE_ROOM contract is independently validated by API #6 tests.
export { parseCreateRoomResponse };
