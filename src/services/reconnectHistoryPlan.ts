import { roomChatId } from './roomChatProtocol.ts';
import type { UserListItem } from './contactService.ts';
import type { Chat } from '../types/chat.ts';
export type HistoryTarget={username:string;chatId:string;kind:'people'|'room'};
export const activityKey=(item:UserListItem)=>`${item.type}:${item.name.trim().toLowerCase()}`;
/** On reconnect, prioritize the open conversation, then changed and cached chats.
 * On initial login leave untouched conversations lazy-loaded. */
export function reconnectHistoryPlan(items:readonly UserListItem[], previous:ReadonlyMap<string,string>|null,
  cached:readonly string[], selected:Chat|null):HistoryTarget[] {
  const result=new Map<string,HistoryTarget>();
  const add=(target:HistoryTarget)=>result.set(target.chatId.toLowerCase(),target);
  if(selected && (selected.kind!=='group'||items.some(i=>i.type===1 && i.name.toLowerCase()===selected.name.toLowerCase()))) {
    add({username:selected.name,chatId:selected.id,kind:selected.kind==='group'?'room':'people'});
  }
  if(previous) for(const item of items) {
    const rawId=item.type===1?roomChatId(item.name):item.name;
    const id=cached.find(key=>key.toLowerCase()===rawId.toLowerCase())??rawId;
    if(result.has(id.toLowerCase()))continue;
    if(cached.some(key=>key.toLowerCase()===id.toLowerCase()) || previous.get(activityKey(item))!==item.actionTime) {
      add({username:item.name,chatId:id,kind:item.type===1?'room':'people'});
    }
  }
  return [...result.values()];
}
