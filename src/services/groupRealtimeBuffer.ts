import type { ServerChatMessage } from './serverMessage.ts';
import { sameChatUser } from './serverMessage.ts';

/** Session-local bounded buffer. Never publishes a room message before confirmed membership. */
export class GroupRealtimeBuffer {
  private entries: {message:ServerChatMessage; receivedAt:number}[] = [];
  private readonly limit:number;
  private readonly ttlMs:number;
  constructor(limit=200, ttlMs=30_000) {this.limit=limit;this.ttlMs=ttlMs;}
  push(message:ServerChatMessage, now=Date.now()):void {
    this.entries=this.entries.filter(item=>now-item.receivedAt<=this.ttlMs);
    if(message.id!==undefined && this.entries.some(item=>item.message.id===message.id && sameChatUser(item.message.to,message.to))) return;
    this.entries.push({message,receivedAt:now});
    this.entries=this.entries.slice(-this.limit);
  }
  discard(room:string):void { this.entries=this.entries.filter(item=>!sameChatUser(item.message.to,room)); }
  drain(rooms:readonly string[], now=Date.now()):{message:ServerChatMessage;receivedAt:number}[] {
    const ready=this.entries.filter(item=>now-item.receivedAt<=this.ttlMs && rooms.some(room=>sameChatUser(room,item.message.to)));
    // A completed membership snapshot is authoritative; unknown rooms are not retained.
    this.entries=[];
    return ready;
  }
}
