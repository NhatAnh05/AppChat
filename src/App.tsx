import { parseChatTime, formatChatTime } from "./utils/chatTime";
import {useEffect, useMemo, useState, type FormEvent} from "react";
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
import {userService} from "./services/userService.ts";
import { logoutCurrentSession } from "./services/logoutService.ts";
import { clearContacts, setContactOnline, clearOnlineStatuses } from "./features/contacts/contactsSlice";
import { subscribeConnectionState } from "./services/connectionHealth.ts";
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
    const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<WebSocketState>(websocketService.getStatus());
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
        if (connectionStatus !== 'CONNECTED') dispatch(clearOnlineStatuses());
    }, [connectionStatus, dispatch]);
    useEffect(() => subscribeConnectionState(state => {
        if (state === 'signed-out') {
            dispatch(clearCredentials());
            navigate('/login', {replace:true});
        }
    }), [dispatch, navigate]);
    useEffect(() => websocketService.onLog(entry => setApiLogs(current => [...current.slice(-199), entry])), []);
    useEffect(() => localStorage.setItem(`lyra-pins-${currentUserId}`, JSON.stringify(pinnedIds)), [pinnedIds, currentUserId]);
    const messages = useSelector((state: RootState) => state.messages.messages);
    useEffect(() => saveUnreadLedger(currentUserId, unreadLedger), [currentUserId, unreadLedger]);
    // Backend APIs 1–5 have no read-receipt endpoint. Track client-side unread state per account.
    const loadedChatIds = useMemo(() => Object.entries(historyByChat)
        .filter(([, history]) => history.loadedPages.includes(1) || Boolean(history.error))
        .map(([chatId]) => chatId), [historyByChat]);
    const baselineReady = contactsInitialized && friends.every(friend => loadedChatIds.some(
        id => id.toLowerCase() === friend.id.toLowerCase()));
    useEffect(() => {
        const visible = document.visibilityState === 'visible' && document.hasFocus();
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
        if (message.status === "error") return;

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
    }), [currentUserId, dispatch, friends, groups, selectedChat?.id, store]);

    // Socket sau RE_LOGIN là một socket mới: cập nhật danh bạ từ Backend khi kết nối hồi phục.
    useEffect(() => {
        if (connectionStatus === 'CONNECTED') void refreshUserList();
        // Callback intentionally uses the latest store when invoked.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionStatus]);

    // Explicit check allows a user to verify the teacher server's real response.
    // No simulated/guessed Online state when the server does not answer.
    const checkSelectedPresence = async (username: string) => {
        setPresenceError(null);
        setPresenceChecking(true);
        try {
            const online = await userService.checkUserOnline(username);
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

    // The active conversation takes precedence over background presence checks.
    // API 15 has no request ID and checks are serialized in userService.
    // Do not queue checks for 20 people (20 * timeout) ahead of the active chat.
    useEffect(() => {
        let cancelled = false;
        let running = false;
        let cursor = 0;
        const activeId = selectedChat?.kind === 'people' ? selectedChat.id : null;
        setPresenceError(null);
        const updateOne = async (id: string) => {
            try {
                const online = await userService.checkUserOnline(id);
                if (!cancelled && websocketService.isAuthenticated()) {
                    dispatch(setContactOnline({ id, online }));
                    if (id.toLowerCase() === activeId?.toLowerCase()) setPresenceError(null);
                }
            } catch (error) {
                // A timeout or invalid response means unknown, not offline.
                // Log which user failed so API troubleshooting is possible.
                if (!userService.isOnlineCheckUnsupported()) console.warn('[LyraChat] Không xác minh được trạng thái:', id, error);
                if (!cancelled && id.toLowerCase() === activeId?.toLowerCase()) {
                    setPresenceError(error instanceof Error ? error.message : 'Kiểm tra trạng thái thất bại.');
                }
            }
        };
        const checkPresence = async () => {
            if (cancelled || running || userService.isOnlineCheckUnsupported() || !websocketService.isAuthenticated() ||
                !navigator.onLine || document.visibilityState !== 'visible') return;
            running = true;
            try {
                const entries = store.getState().contacts.friends.filter(friend =>
                    friend.id.toLowerCase() !== currentUserId.toLowerCase());
                if (activeId && activeId.toLowerCase() !== currentUserId.toLowerCase()) {
                    await updateOne(activeId);
                }
                if (cancelled || !websocketService.isAuthenticated()) return;
                // Check ONE additional contact per cycle, not the entire list.
                // Other contacts will gradually receive presence indicators.
                const background = entries.filter(friend => friend.id.toLowerCase() !== activeId?.toLowerCase());
                if (background.length) {
                    const next = background[cursor % background.length];
                    cursor++;
                    await updateOne(next.id);
                }
            } finally { running = false; }
        };
        const timer = window.setInterval(() => void checkPresence(), 15000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') void checkPresence();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        void checkPresence();
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [currentUserId, connectionStatus, contactsInitialized, selectedChat?.id, selectedChat?.kind, dispatch, store]);

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

    const refreshUserList = async () => {
        dispatch(setContactsLoading(true));
        dispatch(setContactsError(null));
        try {
            const items = await contactService.getUserList();

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
            dispatch(setContactsError(message));
            console.error("Không thể cập nhật danh sách:", error);
        } finally {
            dispatch(setContactsLoading(false));
            setContactsInitialized(true);
        }
    };

    // Tìm tin nhắn mới nhất và lọc theo tên cuộc trò chuyện
    const filteredChats = useMemo(() => {
        return chats
            .map((chat) => {
                const latestMessage = messages
                    .filter((message) => message.chatId === chat.id)
                    .sort(
                        (a, b) =>
                            parseChatTime(b.orderAt ?? b.createdAt) -
                            parseChatTime(a.orderAt ?? a.createdAt)
                    )[0];

                return {
                    ...chat,
                    unreadCount: getChatUnread(unreadLedger, chat.id),
                    lastMessage: latestMessage
                        ? `${latestMessage.senderId === currentUserId ? "Bạn: " : ""}${latestMessage.content}`
                        : "",
                    time: latestMessage
                        ? formatChatTime(latestMessage.createdAt)
                        : "",
                };
            })
            .filter((chat) =>
                chat.name
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase())
            );
    }, [chats, messages, currentUserId, query, unreadLedger]);

    const currentChat = useMemo(() => {
        if (!selectedChat || selectedChat.kind === 'group') return selectedChat;
        const friend = friends.find(item => item.id.toLowerCase() === selectedChat.id.toLowerCase());
        return friend ? {...selectedChat, online: friend.online} : selectedChat;
    }, [selectedChat, friends]);

    const handleLogout = async () => {
        if (logoutBusy) return;
        setLogoutBusy(true);
        try {
            const result = await logoutCurrentSession();
            if (!result.backendConfirmed) {
                console.warn(`Đã đăng xuất cục bộ; backend chưa xác nhận (${result.reason}).`);
            }
        } finally {
            dispatch(clearCredentials());
            dispatch(clearContacts());
            navigate("/login", { replace: true });
            setLogoutBusy(false);
        }
    };

    // Xóa dữ liệu nhóm trên giao diện CHỈ sau khi OUT_ROOM được máy chủ xác nhận.
    const onGroupLeft = (roomName: string) => {
        dispatch(removeGroup(roomName));
        dispatch(clearConversationMessages(roomChatId(roomName)));
        setUnreadLedger(previous => markChatRead(previous, roomChatId(roomName)));
        setSelectedChat(previous => previous?.kind === 'group' && sameGroupName(previous.name, roomName) ? null : previous);
        setGroupNotice(`Bạn đã rời nhóm “${roomName}”.`);
        void refreshUserList();
    };

    const leaveGroupFromDashboard = async (roomName: string) => {
        await leaveRoom(roomName);
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
        if (!value || composeBusy) return;
        setComposeBusy(true);
        setComposeError("");
        try {
            if (composeMode === "group" || composeMode === "join") {
                // The group is added only after CREATE_ROOM / JOIN_ROOM success from Backend.
                const created = composeMode === "group" ? await createRoom(value) : await joinRoom(value);
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
            dispatch(setContactsLoading(true));
            dispatch(setContactsError(null));

            try {
                const items = await contactService.getUserList();

                if (cancelled) return;

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
                if (!cancelled) {
                    dispatch(
                        setContactsError(
                            error instanceof Error
                                ? error.message
                                : "Không thể tải danh bạ"
                        )
                    );
                }
            } finally {
                if (!cancelled) {
                    dispatch(setContactsLoading(false));
                    setContactsInitialized(true);
                }
            }
        };

        void loadContacts();

        return () => {
            cancelled = true;
        };
    }, [dispatch, store]);

    const handleSearchUser = async (username: string) => {
        const user = username.trim();

        if (!user || searchingUser) return;

        if (user.toLowerCase() === currentUserId.toLowerCase()) {
            alert("Bạn không thể tìm chính mình.");
            return;
        }

        setSearchingUser(true);

        try {
            const exists = await userService.checkUserExist(user);

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
        if (!selectedChat) return;
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
            dispatch(importLocalMessages(backup.messages as RootState["messages"]["messages"]));
            alert("Đã nhập lịch sử vào phiên hiện tại. Dữ liệu không được tải lên máy chủ.");
        } catch(error) { alert(error instanceof Error ? error.message : "Không đọc được tệp sao lưu."); }
    };

    return (
        <main className={`app-shell lyra-workspace ${theme === "dark" ? "theme-dark" : ""} ${activeSection === "Danh bạ" ? "contacts-view" : ""}`}>
            <Sidebar unreadCount={getTotalUnreadForChats(unreadLedger, chats.map(chat => chat.id))} activeSection={activeSection} onSectionChange={(section) => {setSettingsOpen(false);setActiveSection(section); if(section !== "Cài đặt")setSelectedChat(null);}} settingsOpen={settingsOpen}
                     onSettingsToggle={() => {setSettingsOpen(true);setActiveSection("Cài đặt");}} onLogout={handleLogout}/>

            {activeSection === "Cài đặt" ? <SettingsDialog theme={theme} onThemeChange={setTheme} onLogout={handleLogout} onClose={() => {setSettingsOpen(false);setActiveSection("Tin nhắn");}} /> : activeSection === "Danh bạ" ? <ContactDirectory
                onRefresh={() => { void refreshUserList(); }}
                onCreateRoom={() => openCompose("group")}
                onJoinRoom={() => openCompose("join")}
                onOpenGroup={openGroup}
            /> : <>
                <ChatList
                    chats={activeSection === "Nhóm" ? filteredChats.filter(chat => chat.kind === "group") : activeSection === "Thư mục" ? filteredChats.filter(chat => pinnedIds.includes(chat.id)) : activeSection === "Cuộc gọi" ? [] : filteredChats}
                    selectedId={selectedChat?.id}
                    onSelect={(chat) => { setSelectedChat(chat); setUnreadLedger(previous => markChatRead(previous, chat.id)); if (activeSection !== 'Nhóm' && activeSection !== 'Tin nhắn') setActiveSection('Tin nhắn'); }}
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
                            : activeSection === "Thư mục" && !selectedChat ? <div className="feature-placeholder"><i className="bi bi-folder2-open"/><h2>Thư mục đã lưu</h2><p>Mở cuộc trò chuyện ở mục Tin nhắn và bấm “Lưu vào thư mục” để đánh dấu ngay trên trình duyệt này.</p></div>
                                : <>

                                    <ChatWindow key={`${currentUserId}:${currentChat?.id ?? 'empty'}`} chat={currentChat} currentUserId={currentUserId} onMessageSent={refreshUserList}
                                                presenceError={presenceError} presenceChecking={presenceChecking}
                                                onCheckPresence={checkSelectedPresence}
                                                onRoomLeft={onGroupLeft}/>
                                </>}
                    {groupNotice && activeSection === 'Nhóm' && <div className="lyra-group-notification" role="status">
                        <i className="bi bi-check-circle" /> {groupNotice}
                        <button type="button" aria-label="Đóng thông báo nhóm" onClick={() => setGroupNotice('')}>×</button>
                    </div>}
                    <div className="lyra-status-dock">
                        <span className={`api-state ${connectionStatus === "CONNECTED" ? "connected" : ""}`}><i className="bi bi-wifi"/> {connectionStatus === "CONNECTED" ? "Đã kết nối API" : connectionStatus === "CONNECTING" ? "Đang kết nối" : "Mất kết nối API"}</span>
                        <button onClick={() => void refreshChats()}><i className="bi bi-arrow-repeat"/> Làm mới hội thoại</button>
                        <button onClick={exportHistory}><i className="bi bi-download"/> Sao lưu lịch sử</button>
                        <label className="dock-upload"><i className="bi bi-upload"/> Nhập lịch sử<input type="file" accept=".json,application/json" onChange={(event) => {void importHistory(event.target.files?.[0]); event.target.value = "";}}/></label>
                        <button onClick={() => setApiLogOpen(true)}><i className="bi bi-file-earmark-text"/> Nhật ký API</button>
                    </div>
                </section>
            </>}
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
            {apiLogOpen && <div className="lyra-modal-backdrop" onMouseDown={e => {if (e.target === e.currentTarget) setApiLogOpen(false);}}><div className="lyra-modal lyra-log-modal"><h2>Nhật ký API WebSocket</h2><p>Chỉ hiển thị loại sự kiện, trạng thái và thời gian, không hiển thị mật khẩu hoặc nội dung tin nhắn.</p><div className="lyra-log-list">{apiLogs.length ? [...apiLogs].reverse().map((entry, index) => <div key={index}><time>{entry.at}</time><strong>{entry.direction}</strong><span>{entry.event}</span><small>{entry.status}</small></div>) : <p>Chưa có sự kiện mới kể từ khi mở ứng dụng.</p>}</div><div className="lyra-modal-actions"><button type="button" onClick={() => setApiLogs([])}>Xóa nhật ký</button><button type="button" onClick={() => setApiLogOpen(false)}>Đóng</button></div></div></div>}
        </main>
    );
}

function ProtectedChatRoute() {
    const { isAuthenticated, userId } = useSelector((state: RootState) => state.auth);

    return isAuthenticated && userId ? (
        <ChatWorkspace currentUserId={userId} />) : (<Navigate to="/login" replace />);
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
