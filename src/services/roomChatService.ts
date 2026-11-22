/** Group-related authenticated WebSocket operations. No success is invented on timeout. */
import { ensureLoginConnection } from './loginService.ts';
import { websocketService, type WebSocketMessage } from './websocket.ts';
import { normalizeRoomName, parseJoinRoomResponse, parseLeaveRoomResponse,
  parseRoomHistoryResponse, parseRoomSendResponse, makeRoomHistoryRequest,
  makeRoomMessageRequest, type RoomDetails } from './roomChatProtocol.ts';
import type { ChatMessage } from '../types/chat.ts';

type Options={timeoutMs?:number;signal?:AbortSignal};
const TIMEOUT=10000;
// Responses do not carry client request IDs. Serialize requests sharing an event.
const queues=new Map<string,Promise<unknown>>();
function serialize<T>(event:string,action:()=>Promise<T>):Promise<T>{
  const previous=queues.get(event)??Promise.resolve();
  const run=previous.catch(()=>undefined).then(action);
  queues.set(event,run.then(()=>undefined,()=>undefined));return run;
}
async function request<T>(event:string,payload:object,interpret:(frame:WebSocketMessage)=>T|null,options:Options={}):Promise<T>{
  if(options.signal?.aborted)throw new Error('Đã hủy thao tác.');
  await ensureLoginConnection();
  if(options.signal?.aborted)throw new Error('Đã hủy thao tác.');
  const socket=websocketService.getSocket();
  if(!socket||!websocketService.isAuthenticated())throw new Error('Cần đăng nhập trước khi thao tác nhóm.');
  return new Promise<T>((resolve,reject)=>{
    let ended=false;
    let offMsg=()=>{};let offStatus=()=>{};
    const cleanup=()=>{clearTimeout(timer);offMsg();offStatus();options.signal?.removeEventListener('abort',abort)};
    const fail=(e:Error)=>{if(ended)return;ended=true;cleanup();reject(e)};
    const succeed=(value:T)=>{if(ended)return;ended=true;cleanup();resolve(value)};
    const abort=()=>fail(new Error('Đã hủy thao tác.'));
    const timer=setTimeout(()=>fail(new Error(`Máy chủ chưa xác nhận ${event}.`)),options.timeoutMs??TIMEOUT);
    offMsg=websocketService.on(event,frame=>{
      if(websocketService.getSocket()!==socket||!websocketService.isAuthenticated()){
        fail(new Error('Phiên đăng nhập đã thay đổi.'));return;
      }
      try{const result=interpret(frame);if(result!==null)succeed(result)}catch(e){fail(e instanceof Error?e:new Error('Phản hồi không hợp lệ.'))}
    });
    offStatus=websocketService.onStatus(s=>{if(s==='DISCONNECTED'||s==='ERROR')fail(new Error('Mất kết nối WebSocket.'))});
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted){abort();return}
    try{websocketService.send(event,payload)}catch(e){fail(e instanceof Error?e:new Error('Không gửi được yêu cầu.'))}
  });
}
export async function joinRoom(rawName:string,options:Options={}):Promise<RoomDetails>{
  const name=normalizeRoomName(rawName);
  return serialize('JOIN_ROOM',()=>request('JOIN_ROOM',{name},frame=>{
    const result=parseJoinRoomResponse(frame);if(!result)return null;
    if(result.status==='error')throw new Error(result.message);
    return result.room.name.toLowerCase()===name.toLowerCase()?result.room:null;
  },options));
}
export async function leaveRoom(rawName:string,options:Options={}):Promise<void>{
  const name=normalizeRoomName(rawName);
  return serialize('OUT_ROOM',()=>request('OUT_ROOM',{name},frame=>{
    // Một số phản hồi có tên phòng, một số chỉ có data.mes.
    // Nếu server có tên phòng, bỏ qua phản hồi của phòng khác.
    const receivedName = frame.data && typeof frame.data === 'object' && 'name' in frame.data
      ? (frame.data as {name?:unknown}).name : undefined;
    if (typeof receivedName === 'string' && receivedName.toLowerCase() !== name.toLowerCase()) return null;
    const result=parseLeaveRoomResponse(frame);if(!result)return null;
    if(result.status==='error')throw new Error(result.message);
    return true;
  },options).then(()=>undefined));
}
export async function getRoomHistory(rawName:string,page=1,options:Options={}):Promise<{room:RoomDetails;messages:ChatMessage[]}>{
  const name=normalizeRoomName(rawName);
  makeRoomHistoryRequest(name,page);
  return serialize('GET_ROOM_CHAT_MES',()=>request('GET_ROOM_CHAT_MES',{name,page},frame=>{
    // The event is shared across rooms; ignore a delayed response for another room.
    const receivedName = (frame.data && typeof frame.data === 'object' && 'name' in frame.data) ? (frame.data as {name?:unknown}).name : undefined;
    if (typeof receivedName === 'string' && receivedName.toLowerCase() !== name.toLowerCase()) return null;
    const result=parseRoomHistoryResponse(frame,name);if(!result)return null;
    if(result.status==='error')throw new Error(result.message);
    return {room:result.room,messages:result.messages};
  },options));
}
export async function sendRoomMessage(rawName:string,content:string,options:Options={}):Promise<ChatMessage>{
  const name=normalizeRoomName(rawName);
  const payload=makeRoomMessageRequest(name,content).data.data;
  return serialize('SEND_CHAT',()=>request('SEND_CHAT',payload,frame=>{
    const result=parseRoomSendResponse(frame,name,content);
    if(!result)return null;
    if(result.status==='error')throw new Error(result.message);
    return result.message;
  },options));
}
