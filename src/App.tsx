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
import { addMessage, fetchPeopleChatHistory, importLocalMessages, invalidateHistory, clearConversationMessages } from "./features/messages/messagesSlice";
import { websocketService, type ApiLogEntry, type WebSocketState } from "./services/websocket";
import type { AppDispatch, RootState } from "./store/store";
import type { Chat } from "./types/chat";
import type { ContactEntry } from "./types/contact";
import "./App.css";
import { decodeChatContent } from "./services/chatContentCodec";
import { mediaMessagePreview } from "./services/mediaMessage";
import { messagePreview as legacyMediaPreview } from "./services/mediaMessages";
import { parseInteraction, visibleMessageContent } from "./services/messageInteractions";
import {userService} from "./services/userService.ts";
import { notifyIncomingMessage } from "./services/desktopNotifications.ts";
import { PRESENCE_REFRESH_MS } from "./services/chatRefreshPolicy.ts";
import { logoutCurrentSession } from "./services/logoutService.ts";
import { setContactOnline, clearOnlineStatuses } from "./features/contacts/contactsSlice";
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
        lastMessage: "",
        time: "",
        online: contact.online,
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

    // Receive forwarded 1-1 messages; outgoing acknowledgements are handled by peopleChatService.
    useEffect(() => websocketService.on("SEND_CHAT", (message) => {
        if (!isCurrentSession(session) || !websocketService.isAuthenticated() || message.status === "error") return;

        const data = message.data as {
            id?: string | number;
            name?: string;
            to?: string;
            mes?: string;
            createAt?: string;
            type?: number | string | null;
        } | null;
        if (!data || typeof data.name !== "string" || typeof data.to !== "string" || typeof data.mes !== "string") return;
        // Group broadcasts use to=room and type=1, not the recipient username.
        if (Number(data.type) === 1 || data.type === 'room') {
            if (data.name.trim().toLowerCase() === currentUserId.trim().toLowerCase()) return;
            const group = groups.find(entry => entry.id.trim().toLowerCase() === data.to.trim().toLowerCase());
            if (!group) return; // Do not invent membership from an unrelated broadcast.
            const incoming = mapRoomMessage(data, group.id);
            if (!incoming) return;
            setUnreadLedger(previous => recordIncomingMessage(previous, incoming, currentUserId,
                selectedChat?.id ?? null, document.visibilityState === 'visible' && document.hasFocus()));
            dispatch(addMessage({...incoming, orderAt: new Date().toISOString()}));
            notifyIncomingMessage(currentUserId, incoming.senderName ?? incoming.senderId,
                `${incoming.chatId}:${incoming.id}`);
            return;
        }
        // The sender already adds the matching SEND_CHAT acknowledgement when the request resolves.
        if (data.name.trim().toLowerCase() === currentUserId.trim().toLowerCase()) return;
        if (data.to.trim().toLowerCase() !== currentUserId.trim().toLowerCase()) return;

        if (!data.name.trim()) return;
        const chatId = friends.find(
            (friend) => friend.id.trim().toLowerCase() === data.name.trim().toLowerCase(),
        )?.id ?? data.name;

        // A sender absent from GET_USER_LIST must still be shown in the chat list.
        // Otherwise unread messages can accumulate with no conversation to open.
        const currentFriends = store.getState().contacts.friends;
        if (!currentFriends.some(friend => friend.id.trim().toLowerCase() === chatId.trim().toLowerCase())) {
            dispatch(setFriends([...currentFriends, mapUserToContact(
                { name: data.name, type: 0, actionTime: '' }, 'friend',
            )]));
        }

        const incomingMessage = {
            id: String(data.id ?? crypto.randomUUID()),
            chatId,
            senderId: data.name,
            senderName: data.name,
            recipientId: data.to,
            recipientName: data.to,
            content: decodeChatContent(data.mes),
            createdAt: data.createAt ?? new Date().toISOString(),
            orderAt: new Date().toISOString(),
            type: typeof data.type === "number" ? data.type : 0,
        };
        setUnreadLedger(previous => recordIncomingMessage(previous, incomingMessage, currentUserId,
            selectedChat?.id ?? null, document.visibilityState === 'visible' && document.hasFocus()));
        dispatch(addMessage(incomingMessage));
        notifyIncomingMessage(currentUserId, incomingMessage.senderName ?? incomingMessage.senderId,
            `${incomingMessage.chatId}:${incomingMessage.id}`);
    }), [currentUserId, dispatch, friends, groups, selectedChat?.id, store, session]);

    // Explicit check allows a user to verify the teacher server's real response.
    // No simulated/guessed Online state when the server does not answer.
    const checkSelectedPresence = async (username: string) => {
        setPresenceError(null);
        setPresenceChecking(true);
        try {
            assertCurrentSession(session);
            const online = await userService.checkUserOnline(username);
            assertCurrentSession(session);
            dispatch(setContactOnline({ id: username, online }));
            return online;
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'Không xác định được phản hồi từ máy chủ.';
            setPresenceError(reason);
            console.warn('[LyraChat] Kiểm tra trạng thái thất bại:', username, reason);
            return undefined;
        } finally {
            setPresenceChecking(false);
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
                    dispatch(setContactOnline({id: activeId, online}));
                    setPresenceError(null);
                }
            } catch (error) {
                if (!cancelled && !userService.isOnlineCheckUnsupported()) {
                    setPresenceError(error instanceof Error ? error.message : 'Không kiểm tra được trạng thái.');
                }
            } finally { checking = false; }
        };
        void checkActive();
        const interval = window.setInterval(() => void checkActive(), PRESENCE_REFRESH_MS);
        return () => { cancelled = true; window.clearInterval(interval); };
    }, [currentUserId, connectionStatus, contactsInitialized, selectedChat?.id, selectedChat?.kind, dispatch, session]);

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

    const refreshUserList = useCallback(async () => {
        if (!isCurrentSession(session)) return;
        dispatch(setContactsLoading(true));
        dispatch(setContactsError(null));
        try {
            const items = await contactService.getUserList();
            assertCurrentSession(session);

            const serverFriends = items
                .filter(item => item.type === 0)
                .map(item => mapUserToContact(item, "friend"));

            const serverGroups = items
                .filter(item => item.type === 1)
                .map(item => mapUserToContact(item, "group"));

            // Lấy danh sách Redux mới nhất, tránh sử dụng friends từ closure cũ.
            const currentFriends = store.getState().contacts.friends;

            const mergedFriends: ContactEntry[] = serverFriends.map(friend => ({
                ...friend,
                online: currentFriends.find(existing => existing.id.toLowerCase() === friend.id.toLowerCase())?.online,
            }));

            currentFriends.forEach(friend => {
                const existed = mergedFriends.some(
                    item => item.name.toLowerCase() === friend.name.toLowerCase()
                );

                if (!existed) {
                    mergedFriends.push(friend);
                }
            });

            dispatch(setFriends(mergedFriends));
            dispatch(setGroups(serverGroups));

        } catch (error) {
            const message = error instanceof Error ? error.message : "Không tải được danh bạ.";
            if (isCurrentSession(session)) dispatch(setContactsError(message));
            console.error("Không thể cập nhật danh sách:", error);
        } finally {
            if (isCurrentSession(session)) {dispatch(setContactsLoading(false)); setContactsInitialized(true);}
        }
    }, [dispatch, store, session]);

    // Socket sau RE_LOGIN là một socket mới: cập nhật danh bạ khi kết nối hồi phục.
    useEffect(() => {
        if (connectionStatus === 'CONNECTED') void refreshUserList();
    }, [connectionStatus, refreshUserList]);

    // Tìm tin nhắn mới nhất và lọc theo tên cuộc trò chuyện
    // Sắp xếp theo hoạt động mới nhất và không để các gói reaction nội bộ
    // chiếm dòng xem trước hội thoại. Tính unread độc lập với từ khóa tìm kiếm.
    const presentedChats = useMemo(() => {
        const latestByChat = new Map<string, typeof messages[number]>();
        for (const message of messages) {
            if (parseInteraction(message.content)?.kind === "reaction") continue;
            const key = message.chatId.toLowerCase();
            const previous = latestByChat.get(key);
            if (!previous || parseChatTime(message.orderAt ?? message.createdAt) >=
                parseChatTime(previous.orderAt ?? previous.createdAt)) latestByChat.set(key, message);
        }
        return chats.map(chat => {
            const latestMessage = latestByChat.get(chat.id.toLowerCase());
            const preview = latestMessage ? mediaMessagePreview(legacyMediaPreview(visibleMessageContent(latestMessage.content))) : '';
            return {
                ...chat,
                unreadCount: getChatUnread(unreadLedger, chat.id),
                lastMessage: latestMessage ? `${latestMessage.senderId.toLowerCase() === currentUserId.toLowerCase() ? "Bạn: " : ""}${preview}` : '',
                time: latestMessage ? formatChatTime(latestMessage.createdAt) : '',
                lastActivity: latestMessage ? parseChatTime(latestMessage.orderAt ?? latestMessage.createdAt) : 0,
            };
        }).sort((a,b) => b.lastActivity - a.lastActivity);
    }, [chats, messages, currentUserId, unreadLedger]);

    const filteredChats = useMemo(() => presentedChats.filter(chat =>
        chat.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [presentedChats, query]);

    const unreadChats = useMemo(() => presentedChats.filter(chat => (chat.unreadCount ?? 0) > 0), [presentedChats]);
    const unreadTotal = getTotalUnreadForChats(unreadLedger, chats.map(chat => chat.id));
    const openConversation = (chat: Chat) => {
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
        return friend ? {...selectedChat, online: friend.online} : selectedChat;
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
        dispatch(removeGroup(roomName));
        dispatch(clearConversationMessages(roomChatId(roomName)));
        setUnreadLedger(previous => markChatRead(previous, roomChatId(roomName)));
        setSelectedChat(previous => previous?.kind === 'group' && sameGroupName(previous.name, roomName) ? null : previous);
        setGroupNotice(`Bạn đã rời nhóm “${roomName}”.`);
        void refreshUserList();
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
                dispatch(addGroup(contact));
                openGroup(contact);
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

    useEffect(() => {
        let cancelled = false;

        const loadContacts = async () => {
            if (!isCurrentSession(session)) return;
            dispatch(setContactsLoading(true));
            dispatch(setContactsError(null));

            try {
                const items = await contactService.getUserList();

                if (cancelled || !isCurrentSession(session)) return;

                const friends = items
                    .filter(item => item.type === 0)
                    .map(item => mapUserToContact(item, "friend"));

                const groups = items
                    .filter(item => item.type === 1)
                    .map(item => mapUserToContact(item, "group"));

                // Keep contacts discovered through incoming WebSocket frames while
                // GET_USER_LIST is in flight, so their unread badges remain reachable.
                const latestFriends = store.getState().contacts.friends;
                const mergedFriends: ContactEntry[] = friends.map(friend => ({
                    ...friend,
                    online: latestFriends.find(existing => existing.id.toLowerCase() === friend.id.toLowerCase())?.online,
                }));
                latestFriends.forEach(friend => {
                    if (!mergedFriends.some(item => item.id.toLowerCase() === friend.id.toLowerCase())) {
                        mergedFriends.push(friend);
                    }
                });
                dispatch(setFriends(mergedFriends));
                dispatch(setGroups(groups));

            } catch (error) {
                if (!cancelled && isCurrentSession(session)) {
                    dispatch(
                        setContactsError(
                            error instanceof Error
                                ? error.message
                                : "Không thể tải danh bạ"
                        )
                    );
                }
            } finally {
                if (!cancelled && isCurrentSession(session)) {
                    dispatch(setContactsLoading(false));
                    setContactsInitialized(true);
                }
            }
        };

        void loadContacts();

        return () => {
            cancelled = true;
        };
    }, [dispatch, store, session]);

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
            // ChatWindow đảm nhiệm việc làm mới nhóm theo chu kỳ và khi lấy focus.
            dispatch(invalidateHistory());
        }
    };

    const exportHistory = () => {
        if (!isCurrentSession(session)) return;
        const data = {format: "lyrachat-local-history-v1", exportedAt: new Date().toISOString(), userId: currentUserId, messages: store.getState().messages.messages};
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: "application/json"}));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `lyrachat-${currentUserId}-history.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const importHistory = async (file: File | undefined) => {
        if (!file) return;
        try {
            const backup = JSON.parse(await file.text()) as {format?: string; userId?: string; messages?: unknown};
            if (backup.format !== "lyrachat-local-history-v1" || backup.userId !== currentUserId || !Array.isArray(backup.messages) || backup.messages.length > 200000) throw new Error("Tệp sao lưu không hợp lệ hoặc không thuộc tài khoản hiện tại.");
            const valid = backup.messages.every(item => item && typeof item === "object" && typeof item.id === "string" && typeof item.chatId === "string" && typeof item.senderId === "string" && typeof item.content === "string" && typeof item.createdAt === "string");
            if (!valid) throw new Error("Dữ liệu tin nhắn không đúng định dạng.");
            assertCurrentSession(session);
            dispatch(importLocalMessages(backup.messages as RootState["messages"]["messages"]));
            alert("Đã nhập lịch sử vào phiên hiện tại. Dữ liệu không được tải lên máy chủ.");
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
            {apiLogOpen && <div className="lyra-modal-backdrop" onMouseDown={e => {if (e.target === e.currentTarget) setApiLogOpen(false);}}><div className="lyra-modal lyra-log-modal"><h2>Nhật ký API WebSocket</h2><p>Chỉ hiển thị loại sự kiện, trạng thái và thời gian, không hiển thị mật khẩu hoặc nội dung tin nhắn.</p><div className="lyra-log-list">{apiLogs.length ? [...apiLogs].reverse().map((entry, index) => <div key={index}><time>{entry.at}</time><strong>{entry.direction}</strong><span>{entry.event}</span><small>{entry.status}</small></div>) : <p>Chưa có sự kiện mới kể từ khi mở ứng dụng.</p>}</div><div className="lyra-modal-actions"><button type="button" onClick={() => {apiLogBuffer.current=[];setApiLogs([]);}}>Xóa nhật ký</button><button type="button" onClick={() => setApiLogOpen(false)}>Đóng</button></div></div></div>}
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
