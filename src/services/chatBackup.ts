import type { ChatMessage } from '../types/chat.ts';
import { sameChatUser } from './serverMessage.ts';
import { parseChatTime } from '../utils/chatTime.ts';
import { parseInteraction } from './messageInteractions.ts';
export const MAX_CHAT_BACKUP_BYTES=8*1024*1024;
export function parseChatBackup(input:string,user:string,allowedChats:readonly string[]):ChatMessage[] {
  if(new TextEncoder().encode(input).length>MAX_CHAT_BACKUP_BYTES)throw new Error('Tệp sao lưu vượt 8 MiB.');
  const data:unknown=JSON.parse(input);
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Tệp sao lưu không hợp lệ.');
  const backup=data as Record<string,unknown>;
  if(backup.format!=='lyrachat-local-history-v1'||backup.userId!==user||!Array.isArray(backup.messages)||backup.messages.length>200000)throw new Error('Tệp sao lưu không hợp lệ hoặc không thuộc tài khoản hiện tại.');
  const chats=new Map(allowedChats.map(id=>[id.trim().toLowerCase(),id]));
  const result:ChatMessage[]=[];
  for(const entry of backup.messages){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
    const row=entry as Record<string,unknown>;
    if(typeof row.id!=='string'||!row.id||row.id.length>500||typeof row.chatId!=='string'||typeof row.senderId!=='string'||!row.senderId.trim()||row.senderId.length>128||typeof row.content!=='string'||row.content.length>10000||!row.content.trim()||typeof row.createdAt!=='string'||!Number.isFinite(parseChatTime(row.createdAt)))continue;
    const chatId=chats.get(row.chatId.trim().toLowerCase());if(!chatId)continue;
    const group=chatId.startsWith('room:');
    const recipient=typeof row.recipientId==='string'?row.recipientId:undefined;
    if(group ? (recipient&&!sameChatUser(recipient,chatId.slice(5))) : !(sameChatUser(row.senderId,user)&&(!recipient||sameChatUser(recipient,chatId))||sameChatUser(row.senderId,chatId)&&(!recipient||sameChatUser(recipient,user))))continue;
    // A portable copy is not a trusted reaction, ACK, unread event or membership grant.
    if(parseInteraction(row.content)?.kind==='reaction')continue;
    const originalId=row.id.replace(/^(unverified:backup:)+/,'');
    result.push({id:`unverified:backup:${originalId}`,backupOriginalId:originalId,chatId,senderId:row.senderId,
      senderName:typeof row.senderName==='string'?row.senderName.slice(0,128):row.senderId,recipientId:recipient,
      content:row.content,createdAt:row.createdAt,type:group?1:0});
  }
  return result;
}
export function mergeChatBackup(existing:readonly ChatMessage[], imported:readonly ChatMessage[]):ChatMessage[] {
  const seen=new Set(existing.map(m=>`${m.chatId}\u001f${m.id}`));
  const result=[...existing];
  for(const row of imported){
    if(!row.id.startsWith('unverified:backup:')||!row.backupOriginalId)continue;
    const key=`${row.chatId}\u001f${row.id}`;
    if(seen.has(key)||seen.has(`${row.chatId}\u001f${row.backupOriginalId}`))continue;
    seen.add(key);result.push(row);
  }
  return result;
}
