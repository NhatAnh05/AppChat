import type { ChatMessage } from '../types/chat.ts';
import { parseChatTime } from '../utils/chatTime.ts';
import { sameChatUser } from './serverMessage.ts';

const provisional = (m: ChatMessage) => /^(live|ack|local):/.test(m.id);
const sameParty = (a?:string,b?:string) => (!a && !b) || sameChatUser(a ?? '',b ?? '');
const time = (m:ChatMessage) => parseChatTime(m.createdAt);
function sameMessage(a:ChatMessage,b:ChatMessage,tolerance=2000):boolean {
  return a.chatId===b.chatId && (a.type??0)===(b.type??0) && sameParty(a.senderId,b.senderId) &&
    sameParty(a.recipientId,b.recipientId) && a.content===b.content &&
    Number.isFinite(time(a)) && Number.isFinite(time(b)) && Math.abs(time(a)-time(b))<=tolerance;
}

/** One-to-one reconciliation. Never infer a SEND_CHAT ACK from history.
 * Retain both server IDs for repeated text and retain unresolved local sends in
 * state. A unique plausible history row may be linked for display only. */
export function mergeChatHistory(previous: ChatMessage[], page: ChatMessage[]): ChatMessage[] {
  const stable = new Map(previous.filter(m => !provisional(m)).map(m => [m.id, m]));
  const fresh = new Set(page.filter(m => !provisional(m) && !stable.has(m.id)).map(m => m.id));
  for (const m of page) {
    if (provisional(m)) continue;
    const old=stable.get(m.id);
    stable.set(m.id, {...m,...(old?.sendStatus==='confirmed'?{sendStatus:'confirmed' as const}:{}),
      ...(old?.reconciledLiveId?{reconciledLiveId:old.reconciledLiveId}:{})});
  }
  const pending = [...new Map([...previous,...page].filter(provisional).map(m=>[m.id,m])).values()];
  const rows=[...stable.values()];
  const temporary = pending.filter(m=>/^(live|ack):/.test(m.id));
  const matches = (m:ChatMessage,row:ChatMessage) => !row.reconciledLiveId && sameMessage(m,row, fresh.has(row.id) || (m.id.startsWith('ack:') && m.knownServerIds && !m.knownServerIds.includes(row.id)) ? 2000 : 0);
  const used = new Set<string>();
  const visited = new Set<string>();
  for (const start of temporary) {
    if (visited.has(start.id)) continue;
    const group=[start]; const candidates=new Set<ChatMessage>(); visited.add(start.id);
    for(let i=0;i<group.length;i++) for(const row of rows) {
      if(!matches(group[i],row)||candidates.has(row))continue;
      candidates.add(row);
      for(const other of temporary) if(!visited.has(other.id)&&matches(other,row)){visited.add(other.id);group.push(other);}
    }
    if(group.length!==candidates.size)continue;
    const sorted=[...candidates].sort((a,b)=>time(a)-time(b)); group.sort((a,b)=>time(a)-time(b));
    if(!group.every((m,i)=>matches(m,sorted[i])))continue;
    group.forEach((m,i)=>{
      used.add(m.id);
      stable.set(sorted[i].id,{...sorted[i],reconciledLiveId:m.id,...(m.sendStatus==='confirmed'?{sendStatus:'confirmed' as const}:{})});
    });
  }
  // Local sends never get confirmed by history. Link only a single previously
  // unknown, close-in-time server row to a single unconfirmed send. Do not link
  // failed or pending sends, old known IDs, or ambiguous equal-message batches.
  const locals=pending.filter(m=>m.id.startsWith('local:')&&m.sendStatus==='unconfirmed'&&Array.isArray(m.knownServerIds));
  const eligible=(m:ChatMessage,row:ChatMessage)=>row.sendStatus!=='confirmed'&&!row.reconciledLiveId?.startsWith('ack:')&&!m.knownServerIds?.includes(row.id)&&sameMessage(m,row);
  const links=new Map<string,string>();
  for(const local of locals){
    const candidates=[...stable.values()].filter(row=>eligible(local,row));
    if(candidates.length!==1)continue;
    const row=candidates[0];
    if(locals.filter(other=>eligible(other,row)).length!==1)continue;
    links.set(local.id,row.id);
  }
  return [...stable.values(),...pending.filter(m=>!used.has(m.id)).map(m=>m.id.startsWith('local:')?{...m,historyMatchId:links.get(m.id)}:m)];
}

/** Render one bubble for a linked send, but explicitly report that its ACK is missing. */
export function historyDisplayMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const stableIds=new Set(messages.filter(m=>!provisional(m)).map(m=>m.id));
  const linked=new Set(messages.filter(m=>m.sendStatus==='unconfirmed'&&m.historyMatchId&&stableIds.has(m.historyMatchId)).map(m=>m.historyMatchId));
  return messages.filter(m=>!(m.sendStatus==='unconfirmed'&&m.historyMatchId&&stableIds.has(m.historyMatchId)))
    .map(m=>linked.has(m.id)?{...m,sendStatus:'unconfirmed' as const,historyMatchId:m.id}:m);
}

/** The banner is tied to the exact attempted send, not any other matching text. */
export function hasLinkedServerHistory(messages: readonly ChatMessage[], chatId: string, localId: string | null): boolean {
  if (!localId) return false;
  const local = messages.find(m => m.chatId === chatId && m.id === localId && m.id.startsWith('local:') && m.sendStatus === 'unconfirmed');
  return Boolean(local?.historyMatchId && messages.some(row => row.chatId === chatId && !provisional(row) && row.id === local.historyMatchId));
}
