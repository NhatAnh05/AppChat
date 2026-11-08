import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, Message } from '../data/previewContent';
import { attachChatSocket, getError, getRecentChatCommands, sendChatEvent, subscribeChat, type ServerPacket } from '../services/chatSocket';
import { makeTextMessageRequest } from '../services/chatProtocol';
import { messagePreview } from '../services/mediaMessages';

type ApiMessage = { id?: unknown; name?: unknown; to?: unknown; mes?: unknown; createAt?: unknown; type?: unknown };
type Pending = { id:string; conversationId:string; text:string; sentAt:number };
type HistoryJob = { id:string; page:number };
const str = (v:unknown) => typeof v === 'string' ? v : String(v ?? '');
const obj = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const key = (name:string, group:boolean) => `${group?'room':'people'}:${name}`;
const clock = (value:unknown) => {const d=new Date(str(value).replace(' ','T'));return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});};
const now = () => new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
const normalized = (item:ApiMessage,user:string,group:boolean,index:number):Message => ({
  // API SEND_CHAT có thể không trả id/createAt; không dùng cùng một id giả cho mọi tin realtime.
  id:item.id != null ? str(item.id) : `server:${str(item.name)}:${str(item.to)}:${str(item.createAt)}:${index}:${str(item.mes)}`,
  text:str(item.mes),fromMe:str(item.name)===user,time:clock(item.createAt),
  ...(group && str(item.name)!==user ? {replyTo:`Người gửi: ${str(item.name)}`} : {}),
});
const toChat = (name:string,group:boolean):Conversation => ({id:key(name,group),name,initial:name.slice(0,1).toUpperCase(),color:group?'#637f99':'#4c9c8a',preview:'Bắt đầu cuộc trò chuyện',time:'',unread:0,group});
const dedupe = (items:Message[]) => [...new Map(items.map(x=>[x.id,x])).values()];
function readCache(user:string):{conversations:Conversation[];messages:Record<string,Message[]>} {
  try {const parsed=JSON.parse(localStorage.getItem(`lyra:history:v2:${user}`) || '{}');return {
    conversations:Array.isArray(parsed.conversations)?parsed.conversations:[],
    messages:obj(parsed.messages)?Object.fromEntries(Object.entries(parsed.messages).map(([id,list])=>[id,Array.isArray(list)?list.filter(obj).map(m=>({...m,id:str(m.id).replace(/^local:/,'unverified:')})):[]])) as Record<string,Message[]>:{},
  };}catch{return {conversations:[],messages:{}};}
}

export function useServerChats(username:string){
  const [conversations,setConversations]=useState<Conversation[]>(()=>readCache(username).conversations);
  const [messages,setMessages]=useState<Record<string,Message[]>>(()=>readCache(username).messages);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [online,setOnline]=useState<Record<string,boolean>>({});
  const [exists,setExists]=useState<Record<string,boolean>>({});
  // null: chưa kiểm tra; false: server báo không thuộc phòng; true: JOIN_ROOM/lịch sử đã được xác nhận.
  const [roomMembership,setRoomMembership]=useState<Record<string,boolean>>({});
  const joiningRoom=useRef<string|null>(null);
  const selected=useRef('');
  const pending=useRef<Pending[]>([]);
  const lastSentAt=useRef(0);
  const historyQueue=useRef<HistoryJob[]>([]);
  const activeHistory=useRef<HistoryJob|null>(null);
  const historyTimeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  const sendTimeouts=useRef<ReturnType<typeof setTimeout>[]>([]);
  const historyReady=useRef(false);
  // Một server báo ACTION_NOT_EXIT cho event tải lịch sử thì không thử lại
  // event ấy trên mọi cuộc trò chuyện cho đến khi người dùng bấm thử thủ công.
  const historyCommandUnsupported=useRef(false);
  // Production hiện có thể trả ACTION_NOT_EXIT cho CHAT_PEOPLE_GET_MES dù tài liệu có ghi lệnh này.
  // Tránh gọi lặp liên tục, nhưng cho phép người dùng thử lại thủ công.
  // Hạn chế tải lại lịch sử riêng từng hội thoại khi production trả ACTION_NOT_EXIT.
  const historyUnsupported=useRef<Set<string>>(new Set());

  // Lưu bản sao lịch sử theo tài khoản. Tin không có ACK luôn giữ nhãn unverified sau F5;
  // localStorage KHÔNG đồng nghĩa đã được server lưu, và không đồng bộ sang thiết bị khác.
  useEffect(()=>{
    try {
      const snapshot:Record<string,Message[]>={};
      for(const [id,list] of Object.entries(messages)) snapshot[id]=list.slice(-300).map(m=>({...m,id:m.id.replace(/^local:/,'unverified:')}));
      localStorage.setItem(`lyra:history:v2:${username}`,JSON.stringify({conversations:conversations.slice(0,150),messages:snapshot}));
    }catch{/* private browsing / quota; server remains authoritative */}
  },[username,conversations,messages]);

  const safely=useCallback((event:Parameters<typeof sendChatEvent>[0],data:Record<string,unknown>={})=>{
    try{sendChatEvent(event,data);return true;}
    catch(reason){setError(reason instanceof Error?reason.message:'Kết nối WebSocket không khả dụng.');return false;}
  },[]);
  const refresh=useCallback(()=>safely('GET_USER_LIST'),[safely]);
  const advanceHistory=useCallback(()=>{
    if(historyCommandUnsupported.current || activeHistory.current || historyQueue.current.length===0)return;
    // Skip only unsupported conversations instead of stopping history for everyone.
    while(historyQueue.current.length && historyUnsupported.current.has(historyQueue.current[0].id))historyQueue.current.shift();
    if(!historyQueue.current.length)return;
    const job=historyQueue.current.shift()!;
    activeHistory.current=job;
    setBusy(true);
    if(!safely('CHAT_PEOPLE_GET_MES',{name:job.id.split(':').slice(1).join(':'),page:job.page})){
      activeHistory.current=null;setBusy(false);return;
    }
    // Avoid permanently blocking the next conversation when the server doesn't respond.
    historyTimeout.current=setTimeout(()=>{
      if(activeHistory.current!==job)return;
      activeHistory.current=null;setBusy(false);
      setError('Máy chủ không phản hồi yêu cầu lịch sử. Bạn vẫn có thể thử gửi tin.');
      window.dispatchEvent(new Event('lyra:history-next'));
    },10000);
  },[safely]);
  const loadHistory=useCallback((id:string,page=1)=>{
    if(!id.includes(':'))return;
    selected.current=id;
    if(historyCommandUnsupported.current || historyUnsupported.current.has(id))return;
    if(activeHistory.current?.id===id && activeHistory.current.page===page)return;
    if(historyQueue.current.some(j=>j.id===id && j.page===page))return;
    historyQueue.current.push({id,page});advanceHistory();
  },[advanceHistory]);
  const retryHistory=useCallback((id:string,page=1)=>{
    // Yêu cầu người dùng kích hoạt lại sau khi API từ chối; không mở lại polling tự động.
    historyUnsupported.current.delete(id);
    historyCommandUnsupported.current=false;
    historyQueue.current=[];
    if(historyTimeout.current)clearTimeout(historyTimeout.current);
    historyTimeout.current=null;activeHistory.current=null;setBusy(false);setError('');
    if(!id.includes(':'))return;
    historyQueue.current.push({id,page});
    advanceHistory();
  },[advanceHistory]);
  const finishHistory=useCallback(()=>{
    if(historyTimeout.current)clearTimeout(historyTimeout.current);
    historyTimeout.current=null;activeHistory.current=null;setBusy(false);
    window.dispatchEvent(new Event('lyra:history-next'));
  },[]);

  useEffect(()=>{
    attachChatSocket();
    const unsubscribe=subscribeChat((packet:ServerPacket)=>{
      if(packet.status==='error'){
        const isHistoryRejection=packet.event==='ACTION_NOT_EXIT' && Boolean(activeHistory.current);
        // Server gửi lỗi không có requestId: chỉ quy cho lịch sử khi một
        // yêu cầu lịch sử đang chờ và không có SEND_CHAT chưa xác nhận.
        if(isHistoryRejection && pending.current.length===0){
          historyCommandUnsupported.current=true;
          if(activeHistory.current) historyUnsupported.current.add(activeHistory.current.id);
          historyQueue.current=[];
          finishHistory();
          console.warn('[LyraChat] API không hỗ trợ action tải lịch sử đang dùng. Đã tạm dừng tự động thử lại.');
          return; // Không làm phiền người dùng bằng toast mỗi lần chọn chat.
        }
        const related=packet.event==='ACTION_NOT_EXIT'?getRecentChatCommands():[];
        const hint=related.length?` Các lệnh vừa gửi: ${related.join(', ')}.`:'';
        setError(`${packet.event??'SERVER'}: ${getError(packet)}${hint}`);
        if(packet.event==='AUTH' && /not login|chưa đăng nhập|unauthori/i.test(getError(packet))) {
          window.dispatchEvent(new Event('lyra:auth-expired'));
          return;
        }
        if(packet.event==='CHAT_PEOPLE_GET_MES' || (packet.event==='ACTION_NOT_EXIT' && activeHistory.current))finishHistory();
        if(packet.event==='JOIN_ROOM')joiningRoom.current=null;
        if(packet.event==='SEND_CHAT' && /not in this room/i.test(getError(packet))){
          const last=pending.current[0];
          if(last?.conversationId.startsWith('room:'))setRoomMembership(old=>({...old,[last.conversationId]:false}));
        }
        if(packet.event==='CHAT_PEOPLE_GET_MES' && activeHistory.current?.id.startsWith('room:') && /not.*(room|member)|chưa tham gia/i.test(getError(packet))){
          setRoomMembership(old=>({...old,[activeHistory.current!.id]:false}));
        }
        if(packet.event==='SEND_CHAT'){
          // SEND_CHAT lỗi thực sự: chỉ đánh dấu tin đang chờ là thất bại.
          const p=pending.current.shift();
          if(p)setMessages(old=>({...old,[p.conversationId]:(old[p.conversationId]??[]).map(m=>m.id===p.id?{...m,id:m.id.replace(/^(local|unverified):/,'failed:')}:m)}));
        }
        return;
      }
      // Một số bản server broadcast SEND_CHAT cho người nhận mà không kèm status.
      // Chỉ xử lý dạng đó khi có đủ dữ liệu tin nhắn thực, không coi là ACK cho tin gửi.
      if(packet.status!=='success' && !(packet.event==='SEND_CHAT' && !packet.status && obj(packet.data)))return;
      const data=packet.data;
      if(packet.event==='GET_USER_LIST' && Array.isArray(data)){
        const server=data.filter(obj).map(entry=>{
          const name=str(entry.name).trim(),group=Number(entry.type)===1;
          return name?{...toChat(name,group),time:clock(entry.actionTime)}:null;
        }).filter((x):x is Conversation=>x!==null);
        setConversations(old=>{
          const existing=new Map(old.map(c=>[c.id,c]));
          const fromServer=server.map(c=>({...existing.get(c.id),...c,preview:existing.get(c.id)?.preview||c.preview,unread:existing.get(c.id)?.unread??0}));
          return [...fromServer,...old.filter(c=>!server.some(s=>s.id===c.id))];
        });
      }
      if(packet.event==='JOIN_ROOM' && joiningRoom.current){
        const id=joiningRoom.current;joiningRoom.current=null;
        setRoomMembership(old=>({...old,[id]:true}));
        loadHistory(id);
      }
      if(packet.event==='OUT_ROOM'){
        // Danh sách server sẽ cập nhật lại sau khi rời phòng.
        setRoomMembership(old=>Object.fromEntries(Object.entries(old).map(([id,val])=>[id,id===selected.current?false:val])));
      }
      if(['CREATE_ROOM','JOIN_ROOM','OUT_ROOM'].includes(packet.event??''))refresh();
      if(packet.event==='CHAT_PEOPLE_GET_MES'){
        historyCommandUnsupported.current=false;
        const job=activeHistory.current;
        if(!job)return; // unmatched late response: never attach it to another chat
        const payload=obj(data)?data:{};
        const explicitName=str(payload.name).trim();
        const expectedName=job.id.split(':').slice(1).join(':');
        if(explicitName && explicitName!==expectedName)return; // stale response, wait for current request
        const group=job.id.startsWith('room:');
        const arr=Array.isArray(data)?data:Array.isArray(payload.chatMess)?payload.chatMess:[];
        const validHistory=(arr as ApiMessage[]).filter(obj);
        const confirmed=validHistory.map((m,i)=>normalized(m,username,group,i));
        historyReady.current=true;
        // Match each optimistic message with at most one server record, preferably newer records.
        const claimed=new Set<number>();
        const confirmedLocalIds=new Set<string>();
        pending.current=pending.current.filter(p=>{
          if(p.conversationId!==job.id)return true;
          const idx=confirmed.findIndex((m,i)=>{
            if(claimed.has(i)||!m.fromMe||m.text!==p.text)return false;
            const rawDate=validHistory[i].createAt;
            if(!rawDate)return false; // Không thể xác nhận tin mới bằng một tin cũ cùng nội dung.
            const sentTime=new Date(str(rawDate).replace(' ','T')).getTime();
            return Number.isFinite(sentTime) && sentTime >= p.sentAt-60000;
          });
          if(idx<0)return true;
          claimed.add(idx);confirmedLocalIds.add(p.id);return false;
        });
        setMessages(old=>{
          const previous=old[job.id]??[];
          // Keep locally stored, unconfirmed and failed messages across reloads and history refresh.
          // Only server-provided ids or explicit SEND_CHAT acknowledgements count as confirmed.
          const localRecords=previous.filter(m=>/^(local|unverified|failed):/.test(m.id) && !confirmedLocalIds.has(m.id));
          return {...old,[job.id]:dedupe(job.page===1?[...confirmed,...localRecords]:[...confirmed,...previous])};
        });
        if(confirmed.length){
          const last=confirmed[confirmed.length-1];
          setConversations(old=>old.map(c=>c.id===job.id?{...c,preview:messagePreview(last.text??c.preview),time:last.time||c.time}:c));
        }
        if(group){setRoomMembership(old=>({...old,[job.id]:true}));}
        if(group && Array.isArray(payload.user)){
          const members=payload.user.filter(obj).map(u=>str(u.name)).filter(Boolean);
          setConversations(old=>old.map(c=>c.id===job.id?{...c,memberNames:members,members:`${members.length} thành viên`}:c));
        }
        finishHistory();
      }
      if(packet.event==='SEND_CHAT' && obj(data)){
        const sender=str(data.name),target=str(data.to),content=str(data.mes),group=data.type==='room'||Number(data.type)===1;
        if(!sender||!target||!content)return;
        const id=key(group?target:sender===username?target:sender,group);
        const idx=sender===username && packet.status==='success' ?pending.current.findIndex(p=>p.conversationId===id && p.text===content):-1;
        const matched=idx>=0?pending.current.splice(idx,1)[0]:undefined;
        const item=normalized(data as ApiMessage,username,group,0);
        // Không tái sử dụng id giả của phản hồi thiếu id/createAt: mỗi tin mới là một sự kiện riêng.
        // Với tin tự gửi, khớp một optimistic message để không hiện tin hai lần.
        if(data.id == null) item.id=matched ? `ack:${matched.id}` : `live:${crypto.randomUUID()}`;
        setMessages(old=>{
          const existing=(old[id]??[]).filter(m=>m.id!==matched?.id);
          // Nếu lịch sử đã có chính bản ghi server này, tránh nhân đôi khi nhận broadcast.
          if(existing.some(m=>m.id===item.id))return old;
          return {...old,[id]:dedupe([...existing,item])};
        });
        setConversations(old=>{
          const existing=old.find(c=>c.id===id);
          const itemChat:Conversation={...(existing??toChat(id.split(':').slice(1).join(':'),group)),preview:messagePreview(content),time:item.time||now(),unread:selected.current===id?0:(existing?.unread??0)+(sender===username?0:1)};
          return [itemChat,...old.filter(c=>c.id!==id)];
        });
      }
      if((packet.event==='CHAT_CHECK_USER_EXIST' || packet.event==='CHECK_USER_EXIST') && obj(data)){
        const name=selected.current.split(':').slice(1).join(':');
        if(name)setExists(old=>({...old,[name]:data.status===true}));
      }
      if((packet.event==='CHAT_CHECK_USER_ONLINE' || packet.event==='CHECK_USER_ONLINE') && obj(data)){
        const name=selected.current.split(':').slice(1).join(':');
        if(name)setOnline(old=>({...old,[name]:data.status===true}));
      }
    });
    const next=()=>advanceHistory();
    const reconnect=()=>{
      // Không tự kích hoạt lại lệnh lịch sử đã bị server từ chối sau mỗi reconnect.
      attachChatSocket();
      if(historyTimeout.current)clearTimeout(historyTimeout.current);
      activeHistory.current=null;historyQueue.current=[];
      refresh();if(selected.current)loadHistory(selected.current);
    };
    window.addEventListener('lyra:history-next',next);
    window.addEventListener('lyra:reconnected',reconnect);
    refresh();
    // Poll nhẹ để phát hiện hội thoại mới. Tin realtime dùng SEND_CHAT, lịch sử dùng API khi hỗ trợ.
    const poll=setInterval(()=>{
      if(document.visibilityState!=='visible')return;
      refresh();
      if(!historyCommandUnsupported.current && !historyUnsupported.current.has(selected.current) && selected.current && pending.current.length===0 && Date.now()-lastSentAt.current>30000)loadHistory(selected.current);
    },45000);
    const onFocus=()=>{refresh();if(!historyCommandUnsupported.current && !historyUnsupported.current.has(selected.current) && selected.current && pending.current.length===0 && Date.now()-lastSentAt.current>30000)loadHistory(selected.current);};
    window.addEventListener('focus',onFocus);
    return ()=>{
      unsubscribe();clearInterval(poll);window.removeEventListener('focus',onFocus);
      window.removeEventListener('lyra:history-next',next);window.removeEventListener('lyra:reconnected',reconnect);
      if(historyTimeout.current)clearTimeout(historyTimeout.current);
      sendTimeouts.current.forEach(clearTimeout);
    };
  },[username,refresh,loadHistory,finishHistory,advanceHistory]);

  const sendMessage=useCallback((id:string,value:string):boolean=>{
    const content=value.trim(),name=id.split(':').slice(1).join(':').trim(),group=id.startsWith('room:');
    if(!name||!content){setError('Hãy chọn người nhận và nhập nội dung tin nhắn.');return false;}
    if(group && roomMembership[id]===false){setError(`Bạn chưa tham gia phòng ${name}. Hãy nhấn Tham gia phòng trước khi gửi tin.`);return false;}
    if(content.length>10000){setError('Tin nhắn quá dài (tối đa 10.000 ký tự).');return false;}
    try {
      const request=makeTextMessageRequest(name,content,group);
      sendChatEvent('SEND_CHAT',request.data.data);
    }catch(e){setError(e instanceof Error?e.message:'Không thể gửi tin nhắn.');return false;}
    lastSentAt.current=Date.now();
    const idLocal=`local:${crypto.randomUUID()}`;
    pending.current.push({id:idLocal,conversationId:id,text:content,sentAt:Date.now()});
    const item:Message={id:idLocal,text:content,fromMe:true,time:now()};
    setMessages(old=>({...old,[id]:[...(old[id]??[]),item]}));
    setConversations(old=>{
      const oldChat=old.find(c=>c.id===id);
      const chat={...(oldChat??toChat(name,group)),preview:messagePreview(content),time:item.time};
      return [chat,...old.filter(c=>c.id!==id)];
    });
    const timer=setTimeout(()=>{
      if(!pending.current.some(p=>p.id===idLocal))return;
      setMessages(old=>({...old,[id]:(old[id]??[]).map(m=>m.id===idLocal?{...m,id:m.id.replace('local:','unverified:')}:m)}));
      pending.current=pending.current.map(p=>p.id===idLocal?{...p,id:p.id.replace('local:','unverified:')}:p);
      // Không gọi lịch sử tự động sau gửi: API thật đang từ chối lệnh này,
      // còn một ACTION_NOT_EXIT không gắn requestId sẽ làm lẫn phản hồi SEND_CHAT.
    },5000);
    sendTimeouts.current.push(timer);
    return true;
  },[roomMembership]);
  const startPerson=useCallback((name:string)=>{
    const clean=name.trim();if(!clean||clean===username){setError('Tên người nhận không hợp lệ.');return '';}
    const id=key(clean,false);setConversations(old=>old.some(x=>x.id===id)?old:[toChat(clean,false),...old]);
    selected.current=id;safely('CHAT_CHECK_USER_EXIST',{user:clean});return id;
  },[username,safely]);
  const createRoom=useCallback((name:string)=>{if(!name.trim())return '';safely('CREATE_ROOM',{name:name.trim()});return key(name.trim(),true);},[safely]);
  const joinRoom=useCallback((name:string)=>{const clean=name.trim();if(!clean)return '';const id=key(clean,true);joiningRoom.current=id;if(!safely('JOIN_ROOM',{name:clean}))joiningRoom.current=null;return id;},[safely]);
  const outRoom=useCallback((id:string)=>safely('OUT_ROOM',{name:id.replace(/^room:/,'')}),[safely]);
  const checkPerson=useCallback((name:string)=>{selected.current=key(name,false);safely('CHAT_CHECK_USER_EXIST',{user:name});},[safely]);
  // Gửi lại phải là thao tác thủ công: server có thể đã lưu tin dù chưa ACK.
  // Không tự phát lại khi reconnect để tránh trùng nội dung ở người nhận.
  const retryMessage=useCallback((id:string,messageId:string)=>{
    const item=messages[id]?.find(m=>m.id===messageId);
    if(!item || !/^(unverified|failed):/.test(item.id))return false;
    return sendMessage(id,item.text??'');
  },[messages,sendMessage]);
  return {conversations,messages,error,busy,online,exists,roomMembership,refresh,loadHistory,retryHistory,retryMessage,sendMessage,startPerson,createRoom,joinRoom,outRoom,checkPerson,clearError:()=>setError('')};
}
