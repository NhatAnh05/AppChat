import { currentSessionSignal, isCurrentSession, assertCurrentSession } from './services/sessionScope.ts';
import { parseChatTime, formatChatTime } from "./utils/chatTime";
import {useCallback, useEffect, useMemo, useState, useRef, type FormEvent} from "react";
import {useDispatch, useSelector, useStore} from "react-redux";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ChatList } from "./components/ChatList";
import { GroupDashboard } from "./components/GroupDashboard";
import { ContactDirectory } from "./components/ContactDirectory";
import { Sidebar } from "./components/Sidebar";
import { SettingsDialog } from "./components/SettingsDialog";
import { Login } from "./components/Login";
import { Register } from "./components/Register";
import ChatWindow from "./components/ChatWindow";
import {clearCredentials, setCredentials,} from "./features/auth/authSlice";
import { AuthInitializer } from "./features/auth/AuthInitializer";
import { contactService } from "./services/contactService";
import { createRoom } from "./services/createRoomService.ts";
import { joinRoom, leaveRoom } from "./services/roomChatService.ts";
import { mapRoomMessage, roomChatId } from "./services/roomChatProtocol.ts";
import { makeGroupContact, readableGroupError, sameGroupName } from "./services/groupManagement.ts";
import type { UserListItem } from "./services/contactService";
import {setContactsError, setContactsLoading, setFriends, setGroups, addGroup, removeGroup} from "./features/contacts/contactsSlice";
import { addMessage, fetchPeopleChatHistory, fetchRoomChatHistory, importLocalMessages, clearConversationMessages } from "./features/messages/messagesSlice";
import { websocketService, type ApiLogEntry, type WebSocketState } from "./services/websocket";
import type { AppDispatch, RootState } from "./store/store";
import type { Chat } from "./types/chat";
import type { ContactEntry } from "./types/contact";
import "./App.css";
import { parseServerChatMessage } from './services/serverMessage.ts';
import { GroupRealtimeBuffer } from './services/groupRealtimeBuffer.ts';
import { activityKey, reconnectHistoryPlan } from './services/reconnectHistoryPlan.ts';
import { isHistoryUnsupported } from './services/chatHistoryTransport.ts';
import { decodeChatContent } from "./services/chatContentCodec";
import { mediaMessagePreview } from "./services/mediaMessage";
import { parseInteraction, visibleMessageContent } from "./services/messageInteractions";
import {userService} from "./services/userService.ts";
import { parseChatBackup, MAX_CHAT_BACKUP_BYTES } from "./services/chatBackup.ts";
import { isUserMessage } from "./services/messageWorkspace.ts";
import { notifyIncomingMessage } from "./services/desktopNotifications.ts";
import { PRESENCE_REFRESH_MS } from "./services/chatRefreshPolicy.ts";
import { logoutCurrentSession } from "./services/logoutService.ts";
import { setContactOnline, clearOnlineStatuses, expireOnlineStatuses, recordContactIncoming } from "./features/contacts/contactsSlice";
import { getConnectionState, subscribeConnectionState } from "./services/connectionHealth.ts";
import { getChatUnread, getTotalUnreadForChats, markChatRead, readUnreadLedger, recordIncomingMessage,
    reconcileUnreadMessages, saveUnreadLedger } from "./services/unreadNotifications.ts";

function mapUserToContact(item: UserListItem, type: "friend" | "group"): ContactEntry {
    return {
        id: item.name,
        name: item.name,
        initials: item.name.trim().slice(0, 2).toUpperCase(),
        color: type === "friend" ? "#46978a" : "#5e7893",
        detail: item.actionTime,
        online: undefined,
    };
}

function mapContactToChat(contact: ContactEntry, kind: "people" | "group"): Chat {
    return {
        id: kind === 'group' ? roomChatId(contact.id) : contact.id,
        name: contact.name,
        avatar: contact.initials,
        avatarColor: contact.color,
        actionTime: contact.detail,
        lastMessage: "",
        time: "",
        online: contact.online,
        recentIncomingAt: contact.recentIncomingAt,
        kind,
    };
}


function ChatWorkspace({ currentUserId }: { currentUserId: string }) {
    const dispatch = useDispatch<AppDispatch>();
    const [session] = useState(currentSessionSignal);
    const navigate = useNavigate();
    const store = useStore<RootState>();

    const [query, setQuery] = useState("");
    const [composeOpen, setComposeOpen] = useState(false);
    const [composeMode, setComposeMode] = useState<"people" | "group" | "join">("people");
    const [composeValue, setComposeValue] = useState("");
    const [composeBusy, setComposeBusy] = useState(false);
    const [composeError, setComposeError] = useState("");
    const [groupNotice, setGroupNotice] = useState("");
    const [logoutBusy, setLogoutBusy] = useState(false);
    const [apiLogOpen, setApiLogOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([]);
    const apiLogBuffer = useRef<ApiLogEntry[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<WebSocketState>(websocketService.getStatus());
    const [authConnectionState, setAuthConnectionState] = useState(getConnectionState());
    const [pinnedIds] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem(`lyra-pins-${currentUserId}`) || "[]") as string[]; }
        catch { return []; }
    });
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [contactsInitialized, setContactsInitialized] = useState(false);
    const [roomBuffer] = useState(()=>new GroupRealtimeBuffer());
    const groupRevision = useRef(0);
    const contactsRefresh = useRef<Promise<UserListItem[]|null>|null>(null);
    const lastActivitySnapshot = useRef<Map<string,string>|null>(null);
    const selectedForSync = useRef<Chat|null>(null);
    useEffect(()=>{selectedForSync.current=selectedChat;},[selectedChat]);
    const [presenceError, setPresenceError] = useState<string | null>(null);
    const [presenceChecking, setPresenceChecking] = useState(false);
    const [unreadLedger, setUnreadLedger] = useState(() => readUnreadLedger(currentUserId));
    const [activeSection, setActiveSection] = useState("Tin nhắn");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [searchingUser, setSearchingUser] = useState(false);
    const [theme, setTheme] = useState<"light" | "dark">(() => localStorage.getItem("lyra-theme") === "dark" ? "dark" : "light");
    useEffect(() => localStorage.setItem("lyra-theme",theme), [theme]);

    const friends = useSelector((state: RootState) => state.contacts.friends);
    const groups = useSelector((state: RootState) => state.contacts.groups);
    const contactsLoading = useSelector((state: RootState) => state.contacts.loading);
    const contactsError = useSelector((state: RootState) => state.contacts.error);
    const historyByChat = useSelector((state: RootState) => state.messages.historyByChat);
    useEffect(() => websocketService.onStatus(setConnectionStatus), []);
    useEffect(() => {
        if (isCurrentSession(session) && connectionStatus !== 'CONNECTED') dispatch(clearOnlineStatuses());
    }, [connectionStatus, dispatch, session]);
    useEffect(() => subscribeConnectionState(state => {
        setAuthConnectionState(state);
        if (state === 'signed-out') {
            dispatch(clearCredentials());
            navigate('/login', {replace:true});
        }
    }), [dispatch, navigate]);
    // Lưu nhật ký trong ref: không render lại TOÀN BỘ trang chat theo mỗi frame WebSocket.
    // Chỉ cập nhật React state khi cửa sổ Nhật ký thực sự mở.
    useEffect(() => websocketService.onLog(entry => {
        apiLogBuffer.current = [...apiLogBuffer.current.slice(-199), entry];
        if (apiLogOpen) setApiLogs([...apiLogBuffer.current]);
    }), [apiLogOpen]);
    useEffect(() => localStorage.setItem(`lyra-pins-${currentUserId}`, JSON.stringify(pinnedIds)), [pinnedIds, currentUserId]);
    const messages = useSelector((state: RootState) => state.messages.messages);
    useEffect(() => saveUnreadLedger(currentUserId, unreadLedger), [currentUserId, unreadLedger]);
    // Backend APIs 1–5 have no read-receipt endpoint. Track client-side unread state per account.
    const loadedChatIds = useMemo(() => Object.entries(historyByChat)
        .filter(([, history]) => history.loadedPages.includes(1) || Boolean(history.error))
        .map(([chatId]) => chatId), [historyByChat]);
    // Mỗi hội thoại được baseline khi trang đầu tải xong; không chờ toàn bộ danh bạ.
    // Nếu chờ tất cả bạn bè, unread có thể không khởi tạo vì chỉ chat đang mở được tải lịch sử.
    const baselineReady = contactsInitialized && loadedChatIds.length > 0;
    useEffect(() => {
        const visible = document.visibilityState === 'visible' && document.hasFocus();
        // The ledger is persistent event history, not derived display state. Reconcile
        // committed Redux snapshots and browser visibility after each relevant update.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the persistent unread ledger with external history.
        setUnreadLedger(previous => reconcileUnreadMessages(previous, messages, currentUserId,
            loadedChatIds, baselineReady, selectedChat?.id ?? null, visible));
    }, [messages, currentUserId, loadedChatIds, baselineReady, selectedChat?.id]);
    useEffect(() => {
        const markVisibleConversation = () => {
            if (document.visibilityState === 'visible' && document.hasFocus() && selectedChat) {
                setUnreadLedger(previous => markChatRead(previous, selectedChat.id));
            }
        };
        // Also mark the chat as read when it is opened directly (search/join/restore),
        // rather than waiting for a new focus or visibilitychange event.
        markVisibleConversation();
        window.addEventListener('focus', markVisibleConversation);
        document.addEventListener('visibilitychange', markVisibleConversation);
        return () => {
            window.removeEventListener('focus', markVisibleConversation);
            document.removeEventListener('visibilitychange', markVisibleConversation);
        };
    }, [selectedChat]);

    const publishRoomMessage = useCallback((data: ReturnType<typeof parseServerChatMessage>, group:ContactEntry, receivedAt=Date.now()) => {
        if (!data || !isCurrentSession(session)) return;
        const incoming = mapRoomMessage(data, group.id);
        if (!incoming) return;
        const message = {...incoming, createdAt:data.createAt??new Date(receivedAt).toISOString(), orderAt:new Date(receivedAt).toISOString()};
        if (store.getState().messages.messages.some(m=>m.chatId===message.chatId&&m.id===message.id))return;
        const before=store.getState().messages.messages;
        dispatch(addMessage(message));
        if(!isUserMessage(message)||store.getState().messages.messages.some(row=>row.chatId===message.chatId&&row.reconciledLiveId===message.id&&before.some(old=>old.chatId===row.chatId&&old.id===row.id)))return;
        setUnreadLedger(previous => recordIncomingMessage(previous, message, currentUserId,
            selectedForSync.current?.id ?? null, document.visibilityState === 'visible' && document.hasFocus()));
        notifyIncomingMessage(currentUserId, message.senderName ?? message.senderId, `${message.chatId}:${message.id}`);
    },[currentUserId,dispatch,session,store]);

    // Receive realtime events on the authenticated socket; only known room membership can publish.
    useEffect(() => websocketService.on("SEND_CHAT", (message) => {
        if (!isCurrentSession(session) || !websocketService.isAuthenticated() || message.status === "error") return;
        const data=parseServerChatMessage(message.data);
        if(!data)return;
        if(data.name.trim().toLowerCase()===currentUserId.trim().toLowerCase())return;
        if(data.type===1) {
            const group=store.getState().contacts.groups.find(entry=>sameGroupName(entry.id,data.to));
            if(group)publishRoomMessage(data,group);
            else roomBuffer.push(data); // bounded until the next authoritative membership snapshot
            return;
        }
        if(data.to.trim().toLowerCase()!==currentUserId.trim().toLowerCase())return;
        const currentFriends=store.getState().contacts.friends;
        const chatId=currentFriends.find(friend=>sameGroupName(friend.id,data.name))?.id??data.name;
        if(!currentFriends.some(friend=>sameGroupName(friend.id,chatId))) {
            dispatch(setFriends([...currentFriends,mapUserToContact({name:data.name,type:0,actionTime:''},'friend')]));
        }
        const incomingMessage={
            id:String(data.id??`live:${crypto.randomUUID()}`),chatId,senderId:data.name,senderName:data.name,
            recipientId:data.to,recipientName:data.to,content:decodeChatContent(data.mes),
            createdAt:data.createAt??new Date().toISOString(),orderAt:new Date().toISOString(),type:0,
        };
        if(store.getState().messages.messages.some(m=>m.chatId===chatId&&m.id===incomingMessage.id))return;
        dispatch(addMessage(incomingMessage));
        dispatch(recordContactIncoming({id:chatId,at:Date.now()}));
        if(!isUserMessage(incomingMessage)||store.getState().messages.messages.some(row=>row.chatId===chatId&&row.reconciledLiveId===incomingMessage.id))return;
        setUnreadLedger(previous=>recordIncomingMessage(previous,incomingMessage,currentUserId,
            selectedForSync.current?.id??null,document.visibilityState==='visible'&&document.hasFocus()));
        notifyIncomingMessage(currentUserId,data.name,`${chatId}:${incomingMessage.id}`);
    }),[currentUserId,dispatch,publishRoomMessage,roomBuffer,store,session]);

    // Explicit check allows a user to verify the teacher server's real response.
    // No simulated/guessed Online state when the server does not answer.
    const checkSelectedPresence = async (username: string) => {
        setPresenceError(null);
        setPresenceChecking(true);
        try {
            assertCurrentSession(session);
            const online = await userService.checkUserOnline(username);
            assertCurrentSession(session);
            dispatch(setContactOnline({ id: username, online, checkedAt: Date.now() }));
            return online;
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'Không xác định được phản hồi từ máy chủ.';
            if (isCurrentSession(session)) {
                dispatch(setContactOnline({id:username,online:undefined}));
                if (selectedForSync.current?.id === username) setPresenceError(reason);
            }
            console.warn('[LyraChat] Kiểm tra trạng thái thất bại:', username, reason);
            return undefined;
        } finally {
            if (isCurrentSession(session)) setPresenceChecking(false);
        }
    };

    // Chỉ kiểm tra người đang trò chuyện. Không quét nền cả danh bạ mỗi 15 giây:
    // phần lớn API online không có requestId nên một danh sách dài dễ nghẽn WebSocket.
    useEffect(() => {
        const activeId = selectedChat?.kind === 'people' ? selectedChat.id : null;
        if (!activeId || connectionStatus !== 'CONNECTED' || !contactsInitialized) return;
        let cancelled = false;
        let checking = false;
        const checkActive = async () => {
            if (!isCurrentSession(session) || cancelled || checking || !websocketService.isAuthenticated() ||
                userService.isOnlineCheckUnsupported() || !navigator.onLine ||
                document.visibilityState !== 'visible') return;
            checking = true;
            try {
                const online = await userService.checkUserOnline(activeId);
                if (!cancelled && isCurrentSession(session) && websocketService.isAuthenticated()) {
                    dispatch(setContactOnline({id: activeId, online, checkedAt: Date.now()}));
                    setPresenceError(null);
                }
            } catch (error) {
                if (!cancelled && isCurrentSession(session)) {
                    dispatch(setContactOnline({id:activeId,online:undefined}));
                    setPresenceError(error instanceof Error ? error.message : 'Không kiểm tra được trạng thái.');
                }
            } finally { checking = false; }
        };
        void checkActive();
        const interval = window.setInterval(() => void checkActive(), PRESENCE_REFRESH_MS);
        const focus = () => { void checkActive(); };
        window.addEventListener('focus',focus);
        return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('focus',focus); };
    }, [currentUserId, connectionStatus, contactsInitialized, selectedChat?.id, selectedChat?.kind, dispatch, session]);

    useEffect(() => {
        const expire = () => { if (isCurrentSession(session)) dispatch(expireOnlineStatuses(Date.now())); };
        const timer = window.setInterval(expire, 15_000);
        window.addEventListener('focus',expire);
        return () => { window.clearInterval(timer); window.removeEventListener('focus',expire); };
    }, [dispatch, session]);

    // Không tải lịch sử của toàn bộ danh bạ khi đăng nhập.
    // CHAT_PEOPLE_GET_MES không có request ID nên các yêu cầu phải tuần tự;
    // tải hàng loạt sẽ chặn cuộc trò chuyện đang được người dùng mở.
    // ChatWindow tải trang đầu khi người dùng chọn một cuộc trò chuyện.

    // Gộp bạn bè và nhóm thành danh sách
    const chats = useMemo(() => {
        const contactChats = [
            ...friends.map(contact => mapContactToChat(contact, "people")),
            ...groups.map(contact => mapContactToChat(contact, "group")),
        ];

        // Thêm cuộc trò chuyện vừa tìm thấy nếu chưa có trong danh sách.
        if (selectedChat && !contactChats.some(chat => chat.id.toLowerCase() === selectedChat.id.toLowerCase())) {
            contactChats.unshift(selectedChat);
        }

        return contactChats;
    }, [friends, groups, selectedChat]);

    const refreshUserList = useCallback(():Promise<UserListItem[]|null> => {
        if(!isCurrentSession(session))return Promise.resolve(null);
        if(contactsRefresh.current)return contactsRefresh.current;
        const revision=groupRevision.current;
        dispatch(setContactsLoading(true));dispatch(setContactsError(null));
        const task=(async()=>{
            try {
                const items=await contactService.getUserList();
                assertCurrentSession(session);
                const current=store.getState().contacts;
                const mergedFriends:ContactEntry[]=items.filter(item=>item.type===0).map(item=>{
                    const existing=current.friends.find(friend=>sameGroupName(friend.id,item.name));
                    return {...mapUserToContact(item,'friend'),id:existing?.id??item.name,online:existing?.online,onlineCheckedAt:existing?.onlineCheckedAt,recentIncomingAt:existing?.recentIncomingAt};
                });
                for(const friend of current.friends)if(!mergedFriends.some(item=>sameGroupName(item.id,friend.id)))mergedFriends.push(friend);
                dispatch(setFriends(mergedFriends));
                // A stale list cannot undo a CREATE/JOIN/OUT_ROOM confirmed during the request.
                if(revision!==groupRevision.current)return null;
                const serverGroups=items.filter(item=>item.type===1).map(item=>{
                    const existing=current.groups.find(group=>sameGroupName(group.id,item.name));
                    return {...mapUserToContact(item,'group'),id:existing?.id??item.name};
                });
                dispatch(setGroups(serverGroups));
                for(const entry of roomBuffer.drain(serverGroups.map(group=>group.id))) {
                    const group=serverGroups.find(g=>sameGroupName(g.id,entry.message.to));
                    if(group)publishRoomMessage(entry.message,group,entry.receivedAt);
                }
                setSelectedChat(previous=>previous?.kind==='group'&&!serverGroups.some(g=>sameGroupName(g.id,previous.name))?null:previous);
                setContactsInitialized(true);
                return items;
            } catch(error) {
                if(isCurrentSession(session))dispatch(setContactsError(error instanceof Error?error.message:'Không tải được danh bạ.'));
                return null;
            } finally {
                if(isCurrentSession(session))dispatch(setContactsLoading(false));
            }
        })();
        contactsRefresh.current=task;
        void task.finally(()=>{if(contactsRefresh.current===task)contactsRefresh.current=null;});
        return task;
    },[dispatch,store,session,roomBuffer,publishRoomMessage]);

    // After LOGIN/RE_LOGIN refresh membership, then catch up the open chat and changed/cached chats.
    // Sequential dispatch avoids flooding an API with no request IDs.
    useEffect(()=>{
        if(connectionStatus!=='CONNECTED')return;
        const socket=websocketService.getSocket();
        if(!socket)return;
        let cancelled=false;
        const active=()=>!cancelled&&isCurrentSession(session)&&websocketService.getSocket()===socket;
        const synchronize=async()=>{
            const items=await refreshUserList();
            if(!items||!active())return;
            const before=lastActivitySnapshot.current;
            const plan=reconnectHistoryPlan(items,before,Object.keys(store.getState().messages.historyByChat),selectedForSync.current);
            const snapshot=new Map(items.map(item=>[activityKey(item),item.actionTime]));
            // Preserve previous actionTime on failed or skipped sync so the next reconnect retries.
            lastActivitySnapshot.current=before?new Map(before):snapshot;
            for(const target of plan) {
                if(!active())return;
                if(isHistoryUnsupported(target.kind))continue;
                const args={username:target.username,chatId:target.chatId,page:1,force:true};
                const cached=store.getState().messages.messages.filter(m=>m.chatId===target.chatId&&!/^(live|ack|local):/.test(m.id));
                const known=new Set(cached.map(m=>m.id));
                // Backfill until an existing server row is reached. Bound each reconnect to ten pages per chat.
                let ok=false;
                let failed=false;
                for(let page=1;page<=10&&active();page++) {
                    const result=await dispatch(target.kind==='room'?fetchRoomChatHistory({...args,page}):fetchPeopleChatHistory({...args,page}));
                    if(!active())return;
                    if(result.meta.requestStatus!=='fulfilled'){failed=true;break;}
                    const rows=(result.payload as {messages:{id:string}[]}).messages;
                    if(rows.length<50||known.size===0||rows.some(row=>known.has(row.id))) {ok=true;break;}
                }
                const key=`${target.kind==='room'?1:0}:${target.username.trim().toLowerCase()}`;
                if(ok&&snapshot.has(key))lastActivitySnapshot.current?.set(key,snapshot.get(key)!);
                // Avoid a reconnect cascade if the uncorrelated response channel timed out.
                if(failed)return;
                if(!ok && active())dispatch(setContactsError(`Lịch sử ${target.username} chưa đồng bộ hết sau 10 trang. Hãy tải thêm hoặc làm mới hội thoại.`));
            }
        };
        void synchronize().catch(error=>{if(active())dispatch(setContactsError(error instanceof Error?error.message:"Không đồng bộ được lịch sử."));});
        return ()=>{cancelled=true;};
    },[connectionStatus,refreshUserList,dispatch,session,store]);

    // Tìm tin nhắn mới nhất và lọc theo tên cuộc trò chuyện
    // Sắp xếp theo hoạt động mới nhất và không để các gói reaction nội bộ
    // chiếm dòng xem trước hội thoại. Tính unread độc lập với từ khóa tìm kiếm.
    const presentedChats = useMemo(() => {
        const latestByChat = new Map<string, typeof messages[number]>();
        for (const message of messages) {
            if (parseInteraction(message.content)?.kind === "reaction" || message.id.startsWith('unverified:backup:')) continue;
            const key = message.chatId.toLowerCase();
            const previous = latestByChat.get(key);
            if (!previous || parseChatTime(message.orderAt ?? message.createdAt) >=
                parseChatTime(previous.orderAt ?? previous.createdAt)) latestByChat.set(key, message);
        }
        return chats.map(chat => {
            const latestMessage = latestByChat.get(chat.id.toLowerCase());
            const preview = latestMessage ? mediaMessagePreview(visibleMessageContent(latestMessage.content)) : '';
            return {
                ...chat,
                unreadCount: getChatUnread(unreadLedger, chat.id),
                lastMessage: latestMessage ? `${latestMessage.senderId.toLowerCase() === currentUserId.toLowerCase() ? "Bạn: " : ""}${preview}` : '',
                time: latestMessage ? formatChatTime(latestMessage.createdAt) : (chat.actionTime&&Number.isFinite(parseChatTime(chat.actionTime))?formatChatTime(chat.actionTime):''),
                lastActivity: Math.max((latestMessage?parseChatTime(latestMessage.orderAt??latestMessage.createdAt):0)||0,parseChatTime(chat.actionTime??'')||0),
            };
        }).sort((a,b) => b.lastActivity - a.lastActivity);
    }, [chats, messages, currentUserId, unreadLedger]);

    const filteredChats = useMemo(() => presentedChats.filter(chat =>
        chat.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [presentedChats, query]);

    const unreadChats = useMemo(() => presentedChats.filter(chat => (chat.unreadCount ?? 0) > 0), [presentedChats]);
    const unreadTotal = getTotalUnreadForChats(unreadLedger, chats.map(chat => chat.id));
    const openConversation = (chat: Chat) => {
        setPresenceError(null);
        setSelectedChat(chat);
        setNotificationsOpen(false);
        if (document.visibilityState === 'visible' && document.hasFocus()) {
            setUnreadLedger(previous => markChatRead(previous, chat.id));
        }
        if (activeSection !== 'Tin nhắn' && !(activeSection === 'Nhóm' && chat.kind === 'group')) setActiveSection('Tin nhắn');
    };
    const currentChat = useMemo(() => {
        if (!selectedChat || selectedChat.kind === 'group') return selectedChat;
        const friend = friends.find(item => item.id.toLowerCase() === selectedChat.id.toLowerCase());
        return {...selectedChat, online: friend?.online, recentIncomingAt:friend?.recentIncomingAt};
    }, [selectedChat, friends]);

    const handleLogout = async () => {
        if (logoutBusy || !isCurrentSession(session)) return;
        setLogoutBusy(true);
        try {
            const result = await logoutCurrentSession();
            if (!result.backendConfirmed) {
                console.warn(`Đã đăng xuất cục bộ; backend chưa xác nhận (${result.reason}).`);
            }
        } finally {
            // signed-out connection event atomically clears Redux; an old logout
            // completion must not clear a newer login.
            setLogoutBusy(false);
        }
    };

    // Xóa dữ liệu nhóm trên giao diện CHỈ sau khi OUT_ROOM được máy chủ xác nhận.
    const onGroupLeft = (roomName: string) => {
        if (!isCurrentSession(session)) return;
        groupRevision.current++;
        roomBuffer.discard(roomName);
        dispatch(removeGroup(roomName));
        dispatch(clearConversationMessages(roomChatId(roomName)));
        setUnreadLedger(previous => markChatRead(previous, roomChatId(roomName)));
        setSelectedChat(previous => previous?.kind === 'group' && sameGroupName(previous.name, roomName) ? null : previous);
        setGroupNotice(`Bạn đã rời nhóm “${roomName}”.`);
        void refreshUserList().then(()=>{if(isCurrentSession(session))void refreshUserList();});
    };

    const leaveGroupFromDashboard = async (roomName: string) => {
        assertCurrentSession(session);
        await leaveRoom(roomName);
        assertCurrentSession(session);
        onGroupLeft(roomName);
    };

    const openGroup = (group: ContactEntry) => {
        const chat = mapContactToChat(group, 'group');
        setSelectedChat(chat);
        setUnreadLedger(previous => markChatRead(previous, chat.id));
        setQuery('');
        setActiveSection('Nhóm');
    };

    const openCompose = (mode: "people" | "group" | "join" = "people") => {
        setComposeMode(mode);
        setComposeValue("");
        setComposeError("");
        setComposeOpen(true);
    };

    const handleComposeSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const value = composeValue.trim();
        if (!isCurrentSession(session) || !value || composeBusy) return;
        setComposeBusy(true);
        setComposeError("");
        try {
            if (composeMode === "group" || composeMode === "join") {
                // The group is added only after CREATE_ROOM / JOIN_ROOM success from Backend.
                const created = composeMode === "group" ? await createRoom(value) : await joinRoom(value);
                assertCurrentSession(session);
                const contact = makeGroupContact(created);
                groupRevision.current++;
                dispatch(addGroup(contact));
                for(const entry of roomBuffer.drain(store.getState().contacts.groups.map(group=>group.id))) {
                    const group=store.getState().contacts.groups.find(g=>sameGroupName(g.id,entry.message.to));
                    if(group)publishRoomMessage(entry.message,group,entry.receivedAt);
                }
                openGroup(contact);
                void refreshUserList().then(()=>{if(isCurrentSession(session))void refreshUserList();});
                setGroupNotice(composeMode === 'group'
                    ? `Đã tạo nhóm “${created.name}” và được máy chủ xác nhận.`
                    : `Đã tham gia nhóm “${created.name}” thành công.`);
            } else {
                await handleSearchUser(value);
            }
            setComposeOpen(false);
            setComposeValue("");
        } catch (error) {
            setComposeError(readableGroupError(error));
        } finally { setComposeBusy(false); }
    };

    const handleSearchUser = async (username: string) => {
        const user = username.trim();

        if (!isCurrentSession(session) || !user || searchingUser) return;

        if (user.toLowerCase() === currentUserId.toLowerCase()) {
            alert("Bạn không thể tìm chính mình.");
            return;
        }

        setSearchingUser(true);

        try {
            const exists = await userService.checkUserExist(user);
            assertCurrentSession(session);

            if (!exists) {
                alert("Không tìm thấy tài khoản.");
                return;
            }

            let online: boolean | undefined;
            try {
                online = await userService.checkUserOnline(user);
            } catch {
                // Không tự gán offline nếu API không trả lời.
                online = undefined;
            }

            assertCurrentSession(session);
            const chat: Chat = {
                id: user,
                name: user,
                avatar: user.slice(0, 2).toUpperCase(),
                avatarColor: "#46978a",
                lastMessage: "",
                time: "",
                online,
                kind: "people",
            };

            const newContact: ContactEntry = {
                id: user,
                name: user,
                initials: user.slice(0, 2).toUpperCase(),
                color: "#989bff",
                detail: "",
                online,
                onlineCheckedAt: online === undefined ? undefined : Date.now(),
            };

            // Không thêm trùng tài khoản.
            const alreadyExists = friends.some(
                friend => friend.name.toLowerCase() === user.toLowerCase()
            );

            if (!alreadyExists) {
                dispatch(setFriends([...friends, newContact]));
            }

            // Mở cuộc trò chuyện và xóa badge ngay, kể cả khi chọn từ tìm kiếm.
            setSelectedChat(chat);
            setUnreadLedger(previous => markChatRead(previous, chat.id));
            setActiveSection("Tin nhắn");
            setQuery("");

        } catch (error) {
            alert(
                error instanceof Error
                    ? error.message
                    : "Không thể tìm kiếm người dùng."
            );
        } finally {
            setSearchingUser(false);
        }
    };

    const refreshChats = async () => {
        // Chỉ làm mới cuộc trò chuyện đang xem. Không đưa tất cả bạn bè
        // vào hàng đợi lịch sử trên cùng một WebSocket.
        await refreshUserList();
        if (!isCurrentSession(session) || !selectedChat) return;
        if (selectedChat.kind === 'people') {
            await dispatch(fetchPeopleChatHistory({
                username: selectedChat.name, chatId: selectedChat.id, page: 1, force: true,
            }));
        } else {
            await dispatch(fetchRoomChatHistory({username:selectedChat.name,chatId:selectedChat.id,page:1,force:true}));
        }
    };

    const exportHistory = () => {
        if (!isCurrentSession(session)) return;
        const data = {format: "lyrachat-local-history-v1", exportedAt: new Date().toISOString(), userId: currentUserId, messages: store.getState().messages.messages};
        const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
        if(blob.size>MAX_CHAT_BACKUP_BYTES){alert('Bản sao vượt 8 MiB, không thể nhập lại bằng phiên bản này.');return;}
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `lyrachat-${currentUserId}-history.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const importHistory = async (file: File | undefined) => {
        if (!file) return;
        try {
            if(file.size>MAX_CHAT_BACKUP_BYTES)throw new Error('Tệp sao lưu vượt 8 MiB.');
            const text=await file.text();assertCurrentSession(session);
            const contacts=store.getState().contacts;
            const allowed=[...contacts.friends.map(f=>f.id),...contacts.groups.map(g=>roomChatId(g.id))];
            const backup=parseChatBackup(text,currentUserId,allowed);
            dispatch(importLocalMessages(backup));
            alert(`Đã đọc ${backup.length} bản ghi hợp lệ. Bản sao chỉ hiển thị cục bộ, không xác nhận máy chủ; ID đã có sẽ không nhập lại.`);
        } catch(error) { alert(error instanceof Error ? error.message : "Không đọc được tệp sao lưu."); }
    };

    return (
        <main className={`app-shell lyra-workspace ${theme === "dark" ? "theme-dark" : ""} ${activeSection === "Danh bạ" ? "contacts-view" : ""}`}>
            <Sidebar unreadCount={unreadTotal} activeSection={activeSection} onSectionChange={(section) => {setSettingsOpen(false);setActiveSection(section); if(section !== "Cài đặt")setSelectedChat(null);}} settingsOpen={settingsOpen}
                     onSettingsToggle={() => {setSettingsOpen(true);setActiveSection("Cài đặt");}} onLogout={handleLogout}/>

            {activeSection === "Cài đặt" ? <SettingsDialog theme={theme} onThemeChange={setTheme} onLogout={handleLogout} onClose={() => {setSettingsOpen(false);setActiveSection("Tin nhắn");}} /> : activeSection === "Danh bạ" ? <ContactDirectory
                onRefresh={() => { void refreshUserList(); }}
                onCreateRoom={() => openCompose("group")}
                onJoinRoom={() => openCompose("join")}
                onOpenGroup={openGroup}
            /> : <>
                <ChatList
                    chats={activeSection === "Nhóm" ? filteredChats.filter(chat => chat.kind === "group") : (activeSection === "Thư mục" || activeSection === "Yêu thích") ? filteredChats.filter(chat => pinnedIds.includes(chat.id)) : activeSection === "Cuộc gọi" ? [] : filteredChats}
                    selectedId={selectedChat?.id}
                    onSelect={openConversation}
                    query={query}
                    onQueryChange={setQuery}
                    onSearchUser={handleSearchUser}
                    searchingUser={searchingUser}
                    groupMode={activeSection === 'Nhóm'}
                    onCompose={() => openCompose(activeSection === "Nhóm" ? "group" : "people")}
                />
                <section className="conversation-panel" aria-label="Nội dung cuộc trò chuyện">
                    {activeSection === "Cuộc gọi" ? <div className="feature-placeholder"><i className="bi bi-telephone"/><h2>Cuộc gọi</h2><p>Máy chủ hiện chưa cung cấp API gọi thoại/video. Không thể thực hiện cuộc gọi thực.</p></div>
                        : activeSection === "Nhóm" && !selectedChat ? <GroupDashboard
                            groups={groups}
                            loading={contactsLoading}
                            error={contactsError}
                            onCreate={() => openCompose('group')}
                            onJoin={() => openCompose('join')}
                            onOpen={openGroup}
                            onRefresh={() => { void refreshUserList(); }}
                            onLeave={leaveGroupFromDashboard}
                        />
                            : (activeSection === "Thư mục" || activeSection === "Yêu thích") && !selectedChat ? <div className="feature-placeholder"><i className="bi bi-star"/><h2>Cuộc trò chuyện yêu thích</h2><p>Đánh dấu các cuộc trò chuyện quan trọng để truy cập nhanh ở mục này.</p></div>
                                : <>

                                    <ChatWindow key={`${currentUserId}:${currentChat?.id ?? 'empty'}`} chat={currentChat} currentUserId={currentUserId} onMessageSent={refreshUserList}
                                                presenceError={presenceError} presenceChecking={presenceChecking}
                                                onCheckPresence={checkSelectedPresence}
                                                onOpenApiLog={() => {setApiLogs([...apiLogBuffer.current]);setApiLogOpen(true);}}
                                                onRoomLeft={onGroupLeft}
                                                unreadCount={unreadTotal} onOpenNotifications={() => setNotificationsOpen(true)}
                                                onCompose={() => openCompose("people")} onOpenSettings={() => {setSettingsOpen(true);setActiveSection("Cài đặt");}}/>
                                </>}
                    {groupNotice && activeSection === 'Nhóm' && <div className="lyra-group-notification" role="status">
                        <i className="bi bi-check-circle" /> {groupNotice}
                        <button type="button" aria-label="Đóng thông báo nhóm" onClick={() => setGroupNotice('')}>×</button>
                    </div>}
                    <div className="lyra-status-dock">
                        <span className={`api-state ${connectionStatus === "CONNECTED" ? "connected" : ""}`}><i className="bi bi-wifi"/> {authConnectionState === "offline" ? "Tạm mất kết nối — phiên đăng nhập vẫn được giữ" : authConnectionState === "reconnecting" ? "Đang khôi phục kết nối..." : connectionStatus === "CONNECTED" ? "Đã kết nối API" : connectionStatus === "CONNECTING" ? "Đang kết nối" : "Mất kết nối API"}</span>
                        <button onClick={() => void refreshChats()}><i className="bi bi-arrow-repeat"/> Làm mới hội thoại</button>
                        <button onClick={exportHistory}><i className="bi bi-download"/> Sao lưu lịch sử</button>
                        <label className="dock-upload"><i className="bi bi-upload"/> Nhập lịch sử<input type="file" accept=".json,application/json" onChange={(event) => {void importHistory(event.target.files?.[0]); event.target.value = "";}}/></label>
                        <button onClick={() => {setApiLogs([...apiLogBuffer.current]);setApiLogOpen(true);}}><i className="bi bi-file-earmark-text"/> Nhật ký API</button>
                    </div>
                </section>
            </>}
            {notificationsOpen && <div className="lyra-modal-backdrop" onMouseDown={event => {if (event.target === event.currentTarget) setNotificationsOpen(false);}}>
                <section className="lyra-modal lyra-notification-center" role="dialog" aria-modal="true" aria-label="Thông báo tin nhắn chưa đọc">
                    <header className="lyra-notifications-heading"><div><h2>Thông báo</h2><p>{unreadTotal ? `${unreadTotal} tin nhắn chưa đọc` : 'Bạn đã đọc hết tin nhắn'}</p></div>
                        <button type="button" aria-label="Đóng thông báo" onClick={() => setNotificationsOpen(false)}><i className="bi bi-x-lg"/></button>
                    </header>
                    <div className="lyra-notifications-list">
                        {unreadChats.length ? unreadChats.map(chat => <button type="button" className="lyra-notification-item" key={chat.id} onClick={() => openConversation(chat)}>
                            <span className="lyra-notification-avatar">{chat.avatar}</span>
                            <span className="lyra-notification-copy"><strong>{chat.name}</strong><small>{chat.lastMessage || 'Có tin nhắn mới'}</small></span>
                            <span className="lyra-notification-count">{chat.unreadCount}</span>
                        </button>) : <div className="lyra-notifications-empty"><i className="bi bi-bell-check"/><p>Hiện chưa có tin nhắn chưa đọc.</p></div>}
                    </div>
                    <p className="lyra-notifications-note">Chỉ đánh dấu đã đọc khi bạn mở hội thoại trong cửa sổ đang hoạt động. Thông báo này được tính từ dữ liệu tin nhắn đã nhận trên thiết bị.</p>
                </section>
            </div>}
            {composeOpen && <div className="lyra-modal-backdrop" onMouseDown={(e) => {if (e.target === e.currentTarget && !composeBusy) setComposeOpen(false);}}>
                <form className="lyra-modal" onSubmit={event => {void handleComposeSubmit(event);}}>
                    <h2>{composeMode === "group" ? "Tạo nhóm mới (API 6)" : composeMode === "join" ? "Tham gia nhóm (JOIN_ROOM)" : "Tạo cuộc trò chuyện"}</h2>
                    <div className="lyra-compose-tabs" role="group" aria-label="Loại cuộc trò chuyện">
                        <button type="button" className={composeMode === "people" ? "is-active" : ""} aria-pressed={composeMode === "people"} disabled={composeBusy} onClick={() => { setComposeMode("people"); setComposeValue(""); setComposeError(""); }}>Cá nhân</button>
                        <button type="button" className={composeMode === "group" ? "is-active" : ""} aria-pressed={composeMode === "group"} disabled={composeBusy} onClick={() => { setComposeMode("group"); setComposeValue(""); setComposeError(""); }}>Tạo nhóm</button>
                        <button type="button" className={composeMode === "join" ? "is-active" : ""} aria-pressed={composeMode === "join"} disabled={composeBusy} onClick={() => { setComposeMode("join"); setComposeValue(""); setComposeError(""); }}>Tham gia nhóm</button>
                    </div>
                    <p>{composeMode === "group" ? "Tạo nhóm và chờ CREATE_ROOM thành công. Người tạo là chủ phòng." : composeMode === "join" ? "Nhập tên nhóm đã có, chỉ tham gia khi Backend xác nhận JOIN_ROOM." : "Nhập username đã tồn tại trên máy chủ để bắt đầu trò chuyện cá nhân."}</p>
                    <input autoFocus aria-label={composeMode !== "people" ? "Tên nhóm" : "Username"} value={composeValue} onChange={event => setComposeValue(event.target.value)} placeholder={composeMode !== "people" ? "Ví dụ: Nhóm học tập" : "Username"} maxLength={composeMode !== "people" ? 80 : undefined} required disabled={composeBusy}/>
                    {composeError && <p role="alert" className="login-error">{composeError}</p>}
                    <div className="lyra-modal-actions"><button type="button" disabled={composeBusy} onClick={() => setComposeOpen(false)}>Hủy</button><button type="submit" disabled={composeBusy || !composeValue.trim()}>{composeBusy ? "Đang chờ máy chủ..." : composeMode === "group" ? "Tạo nhóm" : composeMode === "join" ? "Tham gia" : "Bắt đầu trò chuyện"}</button></div>
                </form>
            </div>}
            {apiLogOpen && <div className="lyra-modal-backdrop" onMouseDown={e => {if (e.target === e.currentTarget) setApiLogOpen(false);}}><div className="lyra-modal lyra-log-modal"><h2>Nhật ký API WebSocket</h2><p>Hiển thị sự kiện, trạng thái, thời gian và mã chẩn đoán; không hiển thị mật khẩu, mã phiên hoặc nội dung tin nhắn.</p><div className="lyra-log-list">{apiLogs.length ? [...apiLogs].reverse().map((entry, index) => <div key={index}><time>{entry.at}</time><strong>{entry.direction}</strong><span>{entry.event}</span><small>{entry.status}{entry.detail ? ` ${entry.detail}` : ''}</small></div>) : <p>Chưa có sự kiện mới kể từ khi mở ứng dụng.</p>}</div><div className="lyra-modal-actions"><button type="button" onClick={() => {apiLogBuffer.current=[];setApiLogs([]);}}>Xóa nhật ký</button><button type="button" onClick={() => setApiLogOpen(false)}>Đóng</button></div></div></div>}
        </main>
    );
}

function ProtectedChatRoute() {
    const { isAuthenticated, userId } = useSelector((state: RootState) => state.auth);

    return isAuthenticated && userId ? (
        <ChatWorkspace key={userId} currentUserId={userId} />) : (<Navigate to="/login" replace />);
}

function AppRoutes() {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();

    const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

    const handleLogin = (userId: string) => {
        dispatch(setCredentials({ userId }));
        navigate("/chat", { replace: true });
    };

    return (
        <Routes>
            <Route path="/" element={<Navigate to={isAuthenticated ? "/chat" : "/login"} replace/>} />

            <Route path="/login" element={isAuthenticated ? (<Navigate to="/chat" replace />) : (<Login onLogin={handleLogin} onRegister={() => navigate("/register")}/>)}/>

            <Route path="/register" element={isAuthenticated ? (<Navigate to="/chat" replace />) : (<Register onBackToLogin={() => navigate("/login")}/>)}/>

            <Route path="/chat" element={<ProtectedChatRoute />}/>

            <Route path="*" element={<Navigate to={isAuthenticated ? "/chat" : "/login"} replace/>}/>

        </Routes>
    );
}

function App() {
    return (
        <AuthInitializer>
            <AppRoutes />
        </AuthInitializer>
    );
}

export default App;
