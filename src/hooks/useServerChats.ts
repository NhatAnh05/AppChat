import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, Message } from '../data/previewContent';
import { attachChatSocket, getError, sendChatEvent, subscribeChat, type ServerPacket } from '../services/chatSocket';

type ApiRoom = { name?: unknown; type?: unknown; actionTime?: unknown; user?: unknown; chatMess?: unknown };
type ApiMessage = { id?: unknown; name?: unknown; to?: unknown; mes?: unknown; createAt?: unknown; type?: unknown };
const text = (value: unknown) => typeof value === 'string' ? value : String(value ?? '');
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const time = (value: unknown) => {
  const source = text(value);
  if (!source) return '';
  const date = new Date(source.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? source : date.toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'});
};
const roomKey = (name: string, group: boolean) => `${group ? 'room' : 'people'}:${name}`;
const convertRoom = (entry: ApiRoom): Conversation | null => {
  const name = text(entry.name).trim();
  if (!name) return null;
  const group = Number(entry.type) === 1;
  return { id: roomKey(name,group), name, initial: name.slice(0,1).toUpperCase(), color: group ? '#637f99' : '#4c9c8a',
    preview: group ? 'Phòng chat nhóm' : 'Trò chuyện cá nhân', time: time(entry.actionTime), unread: 0, group };
};
const convertMessages = (entries: ApiMessage[], username: string, recipient: string, group: boolean): Message[] =>
  entries.filter(item => item && typeof item === 'object').map((item, index) => ({
    id: text(item.id || `server-${recipient}-${index}-${text(item.createAt)}`),
    fromMe: text(item.name) === username,
    text: text(item.mes),
    time: time(item.createAt),
    seen: false,
    ...(group && text(item.name) !== username ? { replyTo: `Người gửi: ${text(item.name)}` } : {}),
  }));

export function useServerChats(username: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string,Message[]>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<Record<string,boolean>>({});
  const [exists, setExists] = useState<Record<string,boolean>>({});
  const requests = useRef<Record<string,number>>({});
  const selected = useRef('');
  // API của thầy là nguồn dữ liệu DUY NHẤT; tuyệt đối không giả lập server xác nhận.
  // ACTION_NOT_EXIT có thể xuất hiện khi server chưa hỗ trợ một sự kiện.
  const unsupportedProtocol = useRef(false);
  const pending = useRef<Array<{id: string; conversationId: string; text: string; sentAt: number}>>([]);
  const refreshTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const historyTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastError = useRef('');
  const historySupported = useRef(false);
  const safely = useCallback((event: Parameters<typeof sendChatEvent>[0], data: Record<string,unknown> = {}) => {
    try { sendChatEvent(event,data); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể gửi yêu cầu.'); return false; }
  }, []);
  const refresh = useCallback(() => safely('GET_USER_LIST'),[safely]);
  const loadHistory = useCallback((id: string, page = 1) => {
    const group = id.startsWith('room:');
    const name = id.slice(id.indexOf(':')+1);
    selected.current = id;
    if (!name || unsupportedProtocol.current) return;
    requests.current[id] = page;
    setBusy(true);
    const dispatched = safely('CHAT_PEOPLE_GET_MES', {name,page});
    if (!dispatched) {setBusy(false);return;}
    // Không hỏi online trong mỗi lần tải lịch sử: tránh phát sinh API lỗi liên tục.
  },[safely]);
  useEffect(() => {
    attachChatSocket();
    const unsubscribe = subscribeChat((packet: ServerPacket) => {
      if (packet.status === 'error') {
        if (packet.event === 'ACTION_NOT_EXIT') {
          unsupportedProtocol.current = true;
          // Không quy kết bừa ACTION_NOT_EXIT cho SEND_CHAT khi chưa có request-id.
          // Đồng thời ngừng tự tải lịch sử để không spam API.
        }
        const description = `${packet.event ?? 'SERVER'}: ${getError(packet)}`;
        if (lastError.current !== description) {
          setError(description + (packet.event === 'ACTION_NOT_EXIT'
            ? ' — Máy chủ của thầy không nhận diện yêu cầu. Đã dừng tải lịch sử tự động; hãy kiểm tra WS → Messages.' : ''));
          lastError.current = description;
        }
        if (packet.event === 'SEND_CHAT') {
          const latest = pending.current.shift();
          if (latest) setMessages(previous => ({
            ...previous,
            [latest.conversationId]: (previous[latest.conversationId] ?? []).map(item =>
              item.id === latest.id ? {...item, id: item.id.replace('local:', 'failed:')} : item),
          }));
        }
        setBusy(false);
        return;
      }
      if (packet.status !== 'success') return;
      const data = packet.data;
      if (packet.event === 'GET_USER_LIST' && Array.isArray(data)) {
        setConversations(previous => {
          const fromServer = data.map(entry => isRecord(entry) ? convertRoom(entry) : null).filter((item): item is Conversation => item !== null);
          const unseen = previous.filter(item => !fromServer.some(server => server.id === item.id));
          return [...fromServer,...unseen];
        });
      }
      if (packet.event === 'CREATE_ROOM' || packet.event === 'JOIN_ROOM' || packet.event === 'OUT_ROOM') refresh();
      if (packet.event === 'CHAT_PEOPLE_GET_MES') {
        const object = isRecord(data) ? data : {};
        const name = text(object.name) || selected.current.slice(selected.current.indexOf(':')+1);
        // Không đoán loại hội thoại chỉ từ trường `user`, vì một số
        // response của server cũng trả danh sách user cho chat riêng.
        const group = selected.current.startsWith('room:');
        const id = roomKey(name,group);
        const page = requests.current[id] || 1;
        const arr = Array.isArray(data) ? data : (Array.isArray(object.chatMess) ? object.chatMess : []);
        historySupported.current = true;
        const list = convertMessages(arr as ApiMessage[],username,name,group);
        // API trả lịch sử là nguồn xác thực tin nhắn có được lưu hay chưa.
        // Loại tin tạm nếu tìm thấy tin tương ứng của tài khoản hiện tại.
        const matches = [...list];
        pending.current = pending.current.filter(pendingItem => {
          if (pendingItem.conversationId !== id) return true;
          const matchIndex = matches.findIndex(message => message.fromMe && message.text === pendingItem.text);
          if (matchIndex < 0) return true;
          matches.splice(matchIndex, 1);
          return false;
        });
        setMessages(previous => {
          const old = previous[id] ?? [];
          const local = old.filter(item =>
            (item.id.startsWith('local:') || item.id.startsWith('unverified:') || item.id.startsWith('failed:')) &&
            pending.current.some(pendingItem => pendingItem.id === item.id && pendingItem.conversationId === id)
          );
          const merged = page === 1 ? [...list, ...local] : [...list, ...old];
          const unique = new Map<string, Message>();
          merged.forEach(message => unique.set(message.id,message));
          return {...previous,[id]:[...unique.values()]};
        });
        if (group && Array.isArray(object.user)) {
          const members = object.user.filter(isRecord).map(user => text(user.name)).filter(Boolean);
          setConversations(previous => previous.map(chat=>chat.id===id ? {...chat,memberNames:members,members:`${members.length} thành viên`} : chat));
        }
        setBusy(false);
      }
      if (packet.event === 'SEND_CHAT' && isRecord(data)) {
        const sender = text(data.name); const target = text(data.to);
        const group = Number(data.type) === 1;
        const id = roomKey(group ? target : (sender === username ? target : sender),group);
        const content = text(data.mes);
        const matchingIndex = sender === username
          ? pending.current.findIndex(item => item.conversationId === id && item.text === content)
          : -1;
        const matching = matchingIndex >= 0 ? pending.current.splice(matchingIndex, 1)[0] : undefined;
        const newMessage: Message = { id: text(data.id) || `event:${crypto.randomUUID()}`, text: content, fromMe: sender === username, time: new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}) };
        setMessages(previous => ({
          ...previous,
          [id]: [...(previous[id] ?? []).filter(item => (!matching || item.id !== matching.id) && item.id !== newMessage.id), newMessage],
        }));
        setConversations(previous => {
          const old = previous.find(item=>item.id===id);
          const updated: Conversation = old ? {...old,preview:newMessage.text??'',time:newMessage.time,unread:selected.current===id?0:old.unread+1} : {
            id,name:group?target:(sender===username?target:sender),initial:(group?target:sender).slice(0,1).toUpperCase(),color:'#4c9c8a',preview:newMessage.text??'',time:newMessage.time,unread:1,group};
          return [updated,...previous.filter(item=>item.id!==id)];
        });
      }
      if (packet.event === 'CHAT_CHECK_USER_ONLINE' && isRecord(data)) {
        const name = selected.current.slice(selected.current.indexOf(':')+1);
        if (name) { const status=data.status===true;setOnline(previous=>({...previous,[name]:status}));setConversations(previous=>previous.map(chat=>chat.id===roomKey(name,false)?{...chat,presence:status?'online':'offline'}:chat)); }
      }
      if (packet.event === 'CHAT_CHECK_USER_EXIST' && isRecord(data)) {
        const name = selected.current.slice(selected.current.indexOf(':')+1);
        if(name) setExists(previous=>({...previous,[name]:data.status===true}));
      }
    });
    const onReconnect = () => {
      attachChatSocket();
      unsupportedProtocol.current = false;
      refresh();
      if (selected.current) loadHistory(selected.current,1);
    };
    window.addEventListener('lyra:reconnected',onReconnect);
    refresh();
    // Server có thể chỉ broadcast SEND_CHAT cho người nhận online.
    // Đồng bộ định kỳ qua API lịch sử để không phụ thuộc hoàn toàn vào broadcast.
    historyTimer.current = setInterval(() => {
      if (historySupported.current && !unsupportedProtocol.current && selected.current && document.visibilityState === 'visible') {
        loadHistory(selected.current,1);
      }
    }, 20000);
    return () => {
      unsubscribe();
      window.removeEventListener('lyra:reconnected',onReconnect);
      if (historyTimer.current) clearInterval(historyTimer.current);
      refreshTimers.current.forEach(clearTimeout);
      refreshTimers.current = [];
    };
  },[username,refresh,loadHistory]);
  const sendMessage = useCallback((id: string, value: string): boolean => {
    const group = id.startsWith('room:');
    const recipient = id.slice(id.indexOf(':') + 1).trim();
    const content = value.trim();
    if (!content || !recipient) {
      setError('Hãy chọn hội thoại và nhập nội dung tin nhắn.');
      return false;
    }
    // Chỉ xóa ô nhập khi lệnh socket.send thực sự chạy được.
    if (!safely('SEND_CHAT', {type: group ? 'room' : 'people', to: recipient, mes: content})) return false;
    const messageId = `local:${crypto.randomUUID()}`;
    pending.current.push({id: messageId, conversationId: id, text: content, sentAt: Date.now()});
    const currentTime = new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'});
    setMessages(previous => ({...previous, [id]: [
      ...(previous[id] ?? []),
      {id: messageId, text: content, fromMe: true, time: currentTime, seen: false},
    ]}));
    setConversations(previous => previous.map(item => item.id === id
      ? {...item, preview: content, time: currentTime}
      : item));
    // Chủ động kiểm tra lịch sử: socket.send() chỉ chứng minh gửi lên
    // kết nối thành công, KHÔNG có nghĩa server đã lưu hoặc người kia nhận.
    for (const delay of [2000, 8000]) {
      const timer = setTimeout(() => {
        if (!unsupportedProtocol.current && selected.current === id) loadHistory(id,1);
        if (delay === 8000) {
          const unresolved = pending.current.find(item => item.id === messageId);
          if (unresolved) {
            setMessages(previous => ({...previous,[id]:(previous[id] ?? []).map(message =>
              message.id === messageId ? {...message,id:message.id.replace('local:','unverified:')} : message),
            }));
            pending.current = pending.current.map(item=>item.id===messageId?{...item,id:item.id.replace('local:','unverified:')}:item);
            setError('Chưa được server xác nhận. Nếu API trả ACTION_NOT_EXIT hoặc mã 521, tin có thể chưa được lưu. Kiểm tra phản hồi SEND_CHAT trong Network → WS.');
          }
        }
      },delay);
      refreshTimers.current.push(timer);
    }
    return true;
  }, [safely,loadHistory]);
  const startPerson = useCallback((name:string) => {
    const clean=name.trim(); if(!clean || clean===username) {setError('Tên người nhận không hợp lệ.');return '';}
    const id=roomKey(clean,false);
    setConversations(previous=>previous.some(item=>item.id===id)?previous:[{id,name:clean,initial:clean.charAt(0).toUpperCase(),color:'#4c9c8a',preview:'Chưa có tin nhắn',time:'',unread:0},...previous]);
    safely('CHAT_CHECK_USER_EXIST',{user:clean});
    return id;
  },[username,safely]);
  const createRoom = useCallback((name:string) => { if(!name.trim())return ''; safely('CREATE_ROOM',{name:name.trim()});return roomKey(name.trim(),true); },[safely]);
  const joinRoom = useCallback((name:string) => { if(!name.trim())return ''; safely('JOIN_ROOM',{name:name.trim()});return roomKey(name.trim(),true); },[safely]);
  const outRoom = useCallback((id:string) => safely('OUT_ROOM',{name:id.replace(/^room:/,'')}),[safely]);
  const checkPerson = useCallback((name:string)=>{selected.current=roomKey(name,false);safely('CHAT_CHECK_USER_EXIST',{user:name});},[safely]);
  return {conversations,messages,error,busy,online,exists,refresh,loadHistory,sendMessage,startPerson,createRoom,joinRoom,outRoom,checkPerson,clearError:()=>setError('')};
}
