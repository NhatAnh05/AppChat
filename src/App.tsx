import { parseChatTime, formatChatTime } from "./utils/chatTime";
import {useEffect, useMemo, useState} from "react";
import {useDispatch, useSelector, useStore} from "react-redux";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ChatList } from "./components/ChatList";
import { ContactDirectory } from "./components/ContactDirectory";
import { Sidebar } from "./components/Sidebar";
import { SettingsDialog } from "./components/SettingsDialog";
import { Login } from "./components/Login";
import { Register } from "./components/Register";
import ChatWindow from "./components/ChatWindow";
import {clearCredentials, setCredentials,} from "./features/auth/authSlice";
import { AuthInitializer } from "./features/auth/AuthInitializer";
import { authService } from "./services/authService";
import { contactService } from "./services/contactService";
import type { UserListItem } from "./services/contactService";
import {setContactsError, setContactsLoading, setFriends, setGroups,} from "./features/contacts/contactsSlice";
import { addMessage, fetchPeopleChatHistory, importLocalMessages, invalidateHistory } from "./features/messages/messagesSlice";
import { websocketService, type ApiLogEntry, type WebSocketState } from "./services/websocket";
import type { AppDispatch, RootState } from "./store/store";
import type { Chat } from "./types/chat";
import type { ContactEntry } from "./types/contact";
import "./App.css";
import { decodeChatContent } from "./services/chatContentCodec";
import {userService} from "./services/userService.ts";

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
        id: contact.id,
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
    const [composeValue, setComposeValue] = useState("");
    const [apiLogOpen, setApiLogOpen] = useState(false);
    const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<WebSocketState>(websocketService.getStatus());
    const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
      try { return JSON.parse(localStorage.getItem(`lyra-pins-${currentUserId}`) || "[]") as string[]; }
      catch { return []; }
    });
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [activeSection, setActiveSection] = useState("Tin nhắn");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [searchingUser, setSearchingUser] = useState(false);
    const [theme, setTheme] = useState<"light" | "dark">(() => localStorage.getItem("lyra-theme") === "dark" ? "dark" : "light");
    useEffect(() => localStorage.setItem("lyra-theme",theme), [theme]);

    const friends = useSelector((state: RootState) => state.contacts.friends);
    const groups = useSelector((state: RootState) => state.contacts.groups);
    useEffect(() => websocketService.onStatus(setConnectionStatus), []);
    useEffect(() => websocketService.onLog(entry => setApiLogs(current => [...current.slice(-199), entry])), []);
    useEffect(() => localStorage.setItem(`lyra-pins-${currentUserId}`, JSON.stringify(pinnedIds)), [pinnedIds, currentUserId]);
    const messages = useSelector((state: RootState) => state.messages.messages);

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
        // The sender already adds the matching SEND_CHAT acknowledgement when the request resolves.
        if (data.name.trim().toLowerCase() === currentUserId.trim().toLowerCase()) return;
        if (data.to.trim().toLowerCase() !== currentUserId.trim().toLowerCase()) return;

        const chatId = friends.find(
            (friend) => friend.id.trim().toLowerCase() === data.name.trim().toLowerCase(),
        )?.id ?? data.name;

        dispatch(addMessage({
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
        }));
    }), [currentUserId, dispatch, friends]);

    // Nạp trước lịch sử trang đầu để danh sách chat có preview và thời gian ngay khi mở ứng dụng.
    useEffect(() => {
        friends.forEach((friend) => {
            void dispatch(fetchPeopleChatHistory({
                username: friend.name,
                chatId: friend.id,
                page: 1,
            }));
        });
    }, [dispatch, friends]);

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

            const mergedFriends = [...serverFriends];

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
            console.error("Không thể cập nhật danh sách:", error);
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
    }, [chats, messages, currentUserId, query]);

    const handleLogout = () => {
        try {
            authService.logout();
        } catch {
            // Xóa xác thực cục bộ ngay cả khi WebSocket không khả dụng.
        }

        dispatch(clearCredentials());
        navigate("/login", { replace: true });
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

                dispatch(setFriends(friends));
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
                }
            }
        };

        void loadContacts();

        return () => {
            cancelled = true;
        };
    }, [dispatch]);

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

            let online = false;

            try {
                online = await userService.checkUserOnline(user);
            } catch {
                // Không lấy được trạng thái online nhưng tài khoản vẫn tồn tại.
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

            // Mở cuộc trò chuyện.
            setSelectedChat(chat);
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
        dispatch(invalidateHistory());
        await refreshUserList();
        const entries = store.getState().contacts.friends;
        await Promise.allSettled(entries.map(friend => dispatch(fetchPeopleChatHistory({username: friend.name, chatId: friend.id, page: 1})).unwrap()));
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
            <Sidebar activeSection={activeSection} onSectionChange={(section) => {setSettingsOpen(false);setActiveSection(section); if(section !== "Cài đặt")setSelectedChat(null);}} settingsOpen={settingsOpen}
                onSettingsToggle={() => {setSettingsOpen(true);setActiveSection("Cài đặt");}} onLogout={handleLogout}/>

            {activeSection === "Cài đặt" ? <SettingsDialog theme={theme} onThemeChange={setTheme} onLogout={handleLogout} onClose={() => {setSettingsOpen(false);setActiveSection("Tin nhắn");}} /> : activeSection === "Danh bạ" ? <ContactDirectory /> : <>
                <ChatList
                    chats={activeSection === "Nhóm" ? filteredChats.filter(chat => chat.kind === "group") : activeSection === "Thư mục" ? filteredChats.filter(chat => pinnedIds.includes(chat.id)) : activeSection === "Cuộc gọi" ? [] : filteredChats}
                    selectedId={selectedChat?.id}
                    onSelect={(chat) => { setSelectedChat(chat); if (activeSection !== "Tin nhắn") setActiveSection("Tin nhắn"); }}
                    query={query}
                    onQueryChange={setQuery}
                    onSearchUser={handleSearchUser}
                    searchingUser={searchingUser}
                    onCompose={() => setComposeOpen(true)}
                />
                <section className="conversation-panel" aria-label="Nội dung cuộc trò chuyện">
                    {activeSection === "Cuộc gọi" ? <div className="feature-placeholder"><i className="bi bi-telephone"/><h2>Cuộc gọi</h2><p>Máy chủ hiện chưa cung cấp API gọi thoại/video. Không thể thực hiện cuộc gọi thực.</p></div>
                      : activeSection === "Nhóm" && !selectedChat ? <div className="feature-placeholder"><i className="bi bi-people"/><h2>Nhóm trò chuyện</h2><p>Các nhóm được lấy từ danh sách máy chủ. Gửi tin nhắn nhóm yêu cầu API nhóm riêng.</p></div>
                      : activeSection === "Thư mục" && !selectedChat ? <div className="feature-placeholder"><i className="bi bi-folder2-open"/><h2>Thư mục đã lưu</h2><p>Mở cuộc trò chuyện ở mục Tin nhắn và bấm “Lưu vào thư mục” để đánh dấu ngay trên trình duyệt này.</p></div>
                      : <>
                        
                        <ChatWindow chat={selectedChat} currentUserId={currentUserId} onMessageSent={refreshUserList}/>
                      </>}
                    <div className="lyra-status-dock">
                        <span className={`api-state ${connectionStatus === "CONNECTED" ? "connected" : ""}`}><i className="bi bi-wifi"/> {connectionStatus === "CONNECTED" ? "Đã kết nối API" : connectionStatus === "CONNECTING" ? "Đang kết nối" : "Mất kết nối API"}</span>
                        <button onClick={() => void refreshChats()}><i className="bi bi-arrow-repeat"/> Làm mới hội thoại</button>
                        <button onClick={exportHistory}><i className="bi bi-download"/> Sao lưu lịch sử</button>
                        <label className="dock-upload"><i className="bi bi-upload"/> Nhập lịch sử<input type="file" accept=".json,application/json" onChange={(event) => {void importHistory(event.target.files?.[0]); event.target.value = "";}}/></label>
                        <button onClick={() => setApiLogOpen(true)}><i className="bi bi-file-earmark-text"/> Nhật ký API</button>
                    </div>
                </section>
            </>}
            {composeOpen && <div className="lyra-modal-backdrop" onMouseDown={(e) => {if (e.target === e.currentTarget) setComposeOpen(false);}}>
                <form className="lyra-modal" onSubmit={event => {event.preventDefault(); if (!composeValue.trim()) return; void handleSearchUser(composeValue.trim()); setComposeOpen(false); setComposeValue("");}}>
                    <h2>Tạo cuộc trò chuyện</h2><p>Nhập username của tài khoản đang tồn tại trên máy chủ.</p>
                    <input autoFocus value={composeValue} onChange={event => setComposeValue(event.target.value)} placeholder="Nhập username" required/>
                    <div className="lyra-modal-actions"><button type="button" onClick={() => setComposeOpen(false)}>Hủy</button><button type="submit">Bắt đầu trò chuyện</button></div>
                </form>
            </div>}
            {apiLogOpen && <div className="lyra-modal-backdrop" onMouseDown={e => {if (e.target === e.currentTarget) setApiLogOpen(false);}}><div className="lyra-modal lyra-log-modal"><h2>Nhật ký API WebSocket</h2><p>Chỉ hiển thị loại sự kiện, trạng thái và thời gian, không hiển thị mật khẩu hoặc nội dung tin nhắn.</p><div className="lyra-log-list">{apiLogs.length ? [...apiLogs].reverse().map((entry, index) => <div key={index}><time>{entry.at}</time><strong>{entry.direction}</strong><span>{entry.event}</span><small>{entry.status}</small></div>) : <p>Chưa có sự kiện mới kể từ khi mở ứng dụng.</p>}</div><div className="lyra-modal-actions"><button type="button" onClick={() => setApiLogs([])}>Xóa nhật ký</button><button type="button" onClick={() => setApiLogOpen(false)}>Đóng</button></div></div></div>}
        </main>
    );
}

function ProtectedChatRoute() {
    const { isAuthenticated, userId } = useSelector(
        (state: RootState) => state.auth
    );

    return isAuthenticated && userId ? (
        <ChatWorkspace currentUserId={userId} />
    ) : (
        <Navigate to="/login" replace />
    );
}

function AppRoutes() {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();

    const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

    const handleLogin = (userId: string, reLoginCode: string) => {
        dispatch(setCredentials({ userId, reLoginCode }));
        navigate("/chat", { replace: true });
    };

    return (
        <Routes>
            <Route path="/" element={
                <Navigate to={isAuthenticated ? "/chat" : "/login"} replace/>
            }
            />

            <Route path="/login" element={isAuthenticated ? (
                <Navigate to="/chat" replace />
            ) : (
                <Login onLogin={handleLogin} onRegister={() => navigate("/register")}/>
            )}
            />

            <Route path="/register" element={
                isAuthenticated ? (
                    <Navigate to="/chat" replace />
                ) : (
                    <Register onBackToLogin={() => navigate("/login")}/>
                )
                }
            />

            <Route path="/chat" element={<ProtectedChatRoute />}/>

            <Route path="*" element={
                <Navigate to={isAuthenticated ? "/chat" : "/login"} replace/>
            }/>
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
