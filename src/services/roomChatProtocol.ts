/** Group chat protocol. Request/response shapes from chat_API.xlsx (JOIN/OUT/HISTORY/SEND_CHAT room). */
import { decodeChatContent, encodeChatContent } from './chatContentCodec.ts';
import type { ChatMessage } from '../types/chat.ts';
import { normalizeRoomName, type CreatedRoom, type CreatedRoomMember, parseCreateRoomResponse } from './createRoomProtocol.ts';
import { parseServerChatMessage } from './serverMessage.ts';

export { normalizeRoomName };
/** Local-only namespace; transport requests continue using the raw server room name. */
export const roomChatId = (name:string):string => `room:${normalizeRoomName(name)}`;
export const roomNameFromChatId = (id:string):string => id.startsWith('room:')?id.slice(5):id;
export type RoomDetails = CreatedRoom;
export type RoomResult = {status:'success'; room:RoomDetails} | {status:'error'; message:string};
export type LeaveResult = {status:'success'} | {status:'error'; message:string};

export function makeRoomRequest(event:'JOIN_ROOM'|'OUT_ROOM', name:string) {
  return {action:'onchat', data:{event, data:{name:normalizeRoomName(name)}}};
}
export function makeRoomHistoryRequest(name:string, page:number) {
  if (!Number.isInteger(page) || page < 1) throw new Error('Trang lịch sử phải là số nguyên dương.');
  return {action:'onchat', data:{event:'GET_ROOM_CHAT_MES', data:{name:normalizeRoomName(name),page}}};
}
export function makeRoomMessageRequest(name:string, content:string) {
  if (!content.trim()) throw new Error('Nhập nội dung tin nhắn nhóm.');
  const mes = encodeChatContent(content.trim());
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
  for(const item of value){const member=record(item);if(!member||!Number.isInteger(member.id)||typeof member.name!=='string'||!member.name.trim())return null;
    members.push({id:member.id as number,name:member.name.trim()});}
  return members;
}
function parseRoom(value:unknown):RoomDetails|null {
  const data=record(value);
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
export function parseRoomHistoryResponse(input:unknown, name:string):
  | {status:'success';room:RoomDetails;messages:ChatMessage[]}
  | {status:'error';message:string} | null {
  const frame=parseFrame(input,'GET_ROOM_CHAT_MES');if(!frame)return null;
  if(frame.status==='error')return {status:'error',message:typeof frame.mes==='string'?frame.mes:'Không tải được lịch sử nhóm.'};
  if(frame.status!=='success')return {status:'error',message:'Máy chủ chưa xác nhận lịch sử nhóm.'};
  const room=parseRoom(frame.data);
  if(!room||room.name.toLowerCase()!==name.trim().toLowerCase())return {status:'error',message:'Dữ liệu lịch sử không khớp tên nhóm.'};
  const messages:ChatMessage[]=[];
  for(const item of room.chatMess){ const row=record(item);const message=mapRoomMessage(item,name);if(!message||!row||(typeof row.id!=='string' && typeof row.id!=='number')||typeof row.createAt!=='string')return {status:'error',message:'Lịch sử chứa bản ghi không hợp lệ.'};messages.push(message); }
  return {status:'success',room,messages};
}
export function parseRoomSendResponse(input:unknown, name:string, content:string):
  | {status:'success';message:ChatMessage} | {status:'error';message:string} | null {
  const frame=parseFrame(input,'SEND_CHAT');if(!frame)return null;
  if(frame.status==='error')return {status:'error',message:typeof frame.mes==='string'?frame.mes:'Máy chủ từ chối tin nhắn nhóm.'};
  if(frame.status!=='success')return null;
  const msg=mapRoomMessage(frame.data,name);
  if(!msg||msg.content!==content.trim())return null;
  return {status:'success',message:msg};
}
// The CREATE_ROOM contract is independently validated by API #6 tests.
export { parseCreateRoomResponse };
