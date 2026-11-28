import { currentSessionSignal, assertCurrentSession } from './sessionScope.ts';
/** Group-related authenticated WebSocket operations. No success is invented on timeout. */
import { getAuthenticatedUsername } from './loginService.ts';
import { websocketService, type WebSocketMessage } from './websocket.ts';
import { normalizeRoomName, parseJoinRoomResponse, parseLeaveRoomResponse,
  parseRoomHistoryResponse, parseRoomSendResponse, makeRoomHistoryRequest,
  makeRoomMessageRequest, type RoomDetails } from './roomChatProtocol.ts';
import type { ChatMessage } from '../types/chat.ts';
import { requestChatHistory } from './chatHistoryTransport.ts';
import { ensureCorrelatedConnection, quarantineResponse, UnconfirmedSendError, enqueueAuthenticatedRequest } from './requestCorrelation.ts';
import { enqueueChatSend } from './chatSendQueue.ts';

type Options={fallbackOnTimeout?:boolean;timeoutMs?:number;signal?:AbortSignal;knownMessageIds?:readonly string[]};
const groupAcknowledged = new WeakMap<WebSocket, Set<string>>();
const TIMEOUT=10000;
const roomHistoryRequests = new Map<string,Set<AbortController>>();
function cancelRoomHistory(name:string):void {
  for(const controller of roomHistoryRequests.get(name.trim().toLowerCase())??[]) controller.abort();
}
// Responses do not carry client request IDs. Serialize requests sharing an event.
async function request<T>(event:string,payload:object,interpret:(frame:WebSocketMessage)=>T|null,options:Options={}):Promise<T>{
  if(options.signal?.aborted)throw new Error('Đã hủy thao tác.');
  const session=currentSessionSignal();
  const channel = event === 'SEND_CHAT' ? 'send' : 'room-membership';
  await ensureCorrelatedConnection(session,channel);
  assertCurrentSession(session);
  if(options.signal?.aborted)throw new Error('Đã hủy thao tác.');
  const socket=websocketService.getSocket();
  if(!socket||!websocketService.isAuthenticated())throw new Error('Cần đăng nhập trước khi thao tác nhóm.');
  return new Promise<T>((resolve,reject)=>{
    let ended=false;
    let offMsg=()=>{};let offStatus=()=>{};
    const cleanup=()=>{clearTimeout(timer);offMsg();offStatus();options.signal?.removeEventListener('abort',abort);session.removeEventListener('abort',abort)};
    const fail=(e:Error)=>{if(ended)return;ended=true;cleanup();reject(e)};
    const succeed=(value:T)=>{if(ended)return;ended=true;cleanup();resolve(value)};
    let sent=false;
    const abort=()=>{if(sent)quarantineResponse(socket,channel);fail(new Error('Đã hủy thao tác.'));};
    const timer=setTimeout(()=>{quarantineResponse(socket,channel);fail(event==='SEND_CHAT' ? new UnconfirmedSendError('Máy chủ chưa xác nhận tin nhóm. Kiểm tra lịch sử trước khi gửi lại.') : new Error(`Máy chủ chưa xác nhận ${event}.`));},options.timeoutMs??TIMEOUT);
    offMsg=websocketService.on(event,frame=>{
      if(websocketService.getSocket()!==socket||!websocketService.isAuthenticated()){
        fail(new Error('Phiên đăng nhập đã thay đổi.'));return;
      }
      try{const result=interpret(frame);if(result!==null)succeed(result)}catch(e){fail(e instanceof Error?e:new Error('Phản hồi không hợp lệ.'))}
    });
    offStatus=websocketService.onStatus(s=>{if(s==='DISCONNECTED'||s==='ERROR'){if(sent)quarantineResponse(socket,channel);fail(event==='SEND_CHAT' && sent ? new UnconfirmedSendError('Mất kết nối khi gửi tin nhóm. Kiểm tra lịch sử trước khi gửi lại.') : new Error('Mất kết nối WebSocket.'));}});
    session.addEventListener('abort',abort,{once:true});
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted||session.aborted){abort();return}
    try{sent=true;websocketService.send(event,payload)}catch(e){fail(e instanceof Error?e:new Error('Không gửi được yêu cầu.'))}
  });
}
export async function joinRoom(rawName:string,options:Options={}):Promise<RoomDetails>{
  const name=normalizeRoomName(rawName);
  return enqueueAuthenticatedRequest(()=>request('JOIN_ROOM',{name},frame=>{
    const result=parseJoinRoomResponse(frame);if(!result)return null;
    if(result.status==='error')throw new Error(result.message);
    return result.room.name.toLowerCase()===name.toLowerCase()?result.room:null;
  },options));
}
export async function leaveRoom(rawName:string,options:Options={}):Promise<void>{
  const name=normalizeRoomName(rawName);
  // Cancel outstanding room reads before queueing the mutation; membership/data
  // is removed only after ACK. A failed leave can reload history normally.
  cancelRoomHistory(name);
  return enqueueAuthenticatedRequest(()=>request('OUT_ROOM',{name},frame=>{
    // Một số phản hồi có tên phòng, một số chỉ có data.mes.
    // Nếu server có tên phòng, bỏ qua phản hồi của phòng khác.
    const receivedName = frame.data && typeof frame.data === 'object' && 'name' in frame.data
      ? (frame.data as {name?:unknown}).name : undefined;
    if (typeof receivedName === 'string' && receivedName.toLowerCase() !== name.toLowerCase()) return null;
    const result=parseLeaveRoomResponse(frame);if(!result)return null;
    if(result.status==='error')throw new Error(result.message);
    return true;
  },options).then(()=>{cancelRoomHistory(name);}));
}
/** Lịch sử cá nhân và nhóm chia sẻ đúng một hàng đợi vì server dùng cùng event. */
export async function getRoomHistory(rawName:string,page=1,options:Options={}):Promise<{room:RoomDetails;messages:ChatMessage[]}>{
  const name=normalizeRoomName(rawName);
  makeRoomHistoryRequest(name,page); // Kiểm tra số trang trước khi gửi.
  const session=currentSessionSignal();
  const controller=new AbortController();
  const key=name.toLowerCase();
  const requests=roomHistoryRequests.get(key)??new Set<AbortController>();
  requests.add(controller);roomHistoryRequests.set(key,requests);
  const abort=()=>controller.abort();
  options.signal?.addEventListener('abort',abort,{once:true});
  session.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted||session.aborted)abort();
  try {
    const frame=await requestChatHistory(name,page,'room',options.timeoutMs??TIMEOUT,controller.signal,options.fallbackOnTimeout??true);
    assertCurrentSession(session);
    if(controller.signal.aborted)throw new Error('Đã hủy tải lịch sử nhóm.');
    const result=parseRoomHistoryResponse(frame,name);
    if(!result) throw new Error('Máy chủ trả dữ liệu lịch sử nhóm không đúng định dạng.');
    if(result.status==='error') throw new Error(result.message);
    return {room:result.room,messages:result.messages};
  } finally {
    requests.delete(controller);if(!requests.size && roomHistoryRequests.get(key)===requests)roomHistoryRequests.delete(key);
    options.signal?.removeEventListener('abort',abort);session.removeEventListener('abort',abort);
  }
}
export async function sendRoomMessage(rawName:string,content:string,options:Options={}):Promise<ChatMessage>{
  const name=normalizeRoomName(rawName);
  const payload=makeRoomMessageRequest(name,content).data.data;
  const session=currentSessionSignal();
  return enqueueChatSend(()=>{assertCurrentSession(session);return request('SEND_CHAT',payload,frame=>{
    if(frame.status==='error' && frame.data && typeof frame.data==='object' && 'type' in frame.data && (frame.data.type===0 || frame.data.type==='0' || frame.data.type==='people'))return null;
    const result=parseRoomSendResponse(frame,name,content);
    if(!result)return null;
    if(result.status==='error')throw new Error(result.message);
    const user=getAuthenticatedUsername();
    if(!user || result.message.senderId.toLowerCase()!==user.toLowerCase())return null;
    const socket=websocketService.getSocket();
    const id=result.message.id;
    if (socket && !id.startsWith('live:')) {
      const seen=groupAcknowledged.get(socket)??new Set<string>();
      const scopedId=JSON.stringify([name.toLowerCase(),id]);
      if (seen.has(scopedId) || options.knownMessageIds?.includes(id)) return null;
      seen.add(scopedId);groupAcknowledged.set(socket,seen);
    }
    return {...result.message, id:id.startsWith('live:') ? id.replace('live:','ack:') : id, sendStatus:'confirmed' as const};
  },options);});
}
