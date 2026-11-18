import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { fetchPeopleChatHistory, fetchRoomChatHistory } from '../features/messages/messagesSlice'
import type { AppDispatch } from '../store/store'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import type { Chat } from '../types/chat'
import { getRoomHistory, leaveRoom } from '../services/roomChatService.ts'
import type { CreatedRoomMember } from '../services/createRoomProtocol.ts'

type ChatWindowProps = {
    chat: Chat | null
    currentUserId: string
    onMessageSent?: () => void
    onRoomLeft?: (name:string) => void
}

export default function ChatWindow({chat, currentUserId, onMessageSent, onRoomLeft}: ChatWindowProps) {
    const dispatch = useDispatch<AppDispatch>()
    const [detailOpen, setDetailOpen] = useState(false)
    const [members, setMembers] = useState<CreatedRoomMember[]>([])
    const [roomError, setRoomError] = useState('')
    const [leaveBusy, setLeaveBusy] = useState(false)
    const [callMode, setCallMode] = useState<"voice" | "video" | null>(null)

    useEffect(() => {
        if (!chat) return
        void dispatch(chat.kind === 'group' ? fetchRoomChatHistory({username:chat.name,chatId:chat.id,page:1}) : fetchPeopleChatHistory({username: chat.name, chatId: chat.id, page: 1}))
    }, [chat?.id, chat?.kind, chat?.name, dispatch])

    // WebSocket của API có thể không đẩy SEND_CHAT đến người nhận. Đồng bộ
    // trang đầu định kỳ trong cuộc trò chuyện đang mở, kể cả khi đã tải trước đó.
    useEffect(() => {
        if (!chat) return;
        const refresh = () => {
            if (document.visibilityState === 'visible' && navigator.onLine) {
                void dispatch(chat.kind === 'group' ? fetchRoomChatHistory({username:chat.name,chatId:chat.id,page:1,force:true}) : fetchPeopleChatHistory({username: chat.name, chatId: chat.id, page: 1, force: true}));
            }
        };
        const interval = window.setInterval(refresh, 4500);
        window.addEventListener('focus', refresh);
        return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
    }, [chat?.id, chat?.kind, chat?.name, dispatch]);

    const openDetails = async () => {
        setDetailOpen(true);
        setRoomError('');
        setMembers([]);
        if (chat?.kind === 'group') {
            try { const {room} = await getRoomHistory(chat.name, 1); setMembers(room.user); }
            catch (error) { setRoomError(error instanceof Error ? error.message : 'Không tải được thành viên.'); }
        }
    };
    const handleLeave = async () => {
        if (!chat || leaveBusy) return;
        setLeaveBusy(true); setRoomError('');
        try { await leaveRoom(chat.name); setDetailOpen(false); onRoomLeft?.(chat.name); }
        catch (error) { setRoomError(error instanceof Error ? error.message : 'Không thể rời nhóm.'); }
        finally { setLeaveBusy(false); }
    };

    if (!chat) {
        return (<main className="chat-window chat-window-empty">
                <div className="empty-chat">
                    <div className="empty-chat-icon"><i className="bi bi-send" /></div>
                    <h2>Tin nhắn của bạn</h2>
                    <p>Chọn một cuộc trò chuyện, hoặc tạo hội thoại bằng username thật.</p>
                    <p className="empty-security"><i className="bi bi-lock" /> Tin nhắn và phòng chat kết nối WebSocket của giảng viên.</p>
                </div>
            </main>
        )
    }

    return (<main className="chat-window">
            <header className="chat-window-header">
                <div className="chat-avatar" style={{ backgroundColor: chat.avatarColor }}>
                    {chat.avatar}
                </div>

                <div className="chat-header-info">
                    <h2>{chat.name}</h2>
                    <span>
                            {chat.kind === 'group' ? 'Nhóm trò chuyện' : chat.online ? 'Đang hoạt động' : 'Ngoại tuyến'}
                        </span>
                </div>
                <div className="chat-header-actions">
                    <button type="button" title="Gọi thoại" aria-label="Gọi thoại" onClick={() => setCallMode("voice")}><i className="bi bi-telephone" /></button>
                    <button type="button" title="Gọi video" aria-label="Gọi video" onClick={() => setCallMode("video")}><i className="bi bi-camera-video" /></button>
                    <button type="button" className="chat-profile-btn" onClick={() => { void openDetails(); }}><i className="bi bi-person-circle" /> <span>{chat.kind === "group" ? "Thông tin nhóm" : "Xem trang cá nhân"}</span></button>
                </div>
            </header>

            {detailOpen && <div className="lyra-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setDetailOpen(false) }}>
                <section className="lyra-detail-card" role="dialog" aria-modal="true" aria-label={chat.kind === "group" ? "Thông tin nhóm" : "Thông tin trang cá nhân"}>
                    <button className="lyra-icon-close" onClick={() => setDetailOpen(false)} aria-label="Đóng"><i className="bi bi-x-lg" /></button>
                    <div className="lyra-detail-cover" />
                    <div className="lyra-detail-avatar" style={{background:chat.avatarColor}}>{chat.avatar}</div>
                    <h2>{chat.name}</h2><span className="lyra-detail-status">{chat.kind === "group" ? "Nhóm trò chuyện" : chat.online ? "Đang hoạt động" : "Ngoại tuyến"}</span>
                    <div className="lyra-detail-info"><i className="bi bi-at" /><div><small>{chat.kind === "group" ? "Tên phòng" : "Tên tài khoản"}</small><strong>{chat.name}</strong></div></div>
                    <div className="lyra-detail-info"><i className="bi bi-shield-check" /><div><small>Thông tin tài khoản</small><span>Hồ sơ chỉ hiển thị dữ liệu máy chủ cung cấp</span></div></div>
                    {chat.kind === 'group' && <section className="lyra-group-members"><h3>Thành viên ({members.length})</h3>
                        {members.map(member => <div key={member.id}>{member.name}</div>)}
                        {roomError && <p role="alert" className="login-error">{roomError}</p>}
                        <button type="button" className="lyra-main-action" disabled={leaveBusy} onClick={() => void handleLeave()}>
                            {leaveBusy ? 'Đang rời nhóm...' : 'Rời nhóm (OUT_ROOM)'}
                        </button><p className="lyra-small-note">Chủ phòng không được tự rời nhóm; Backend sẽ trả lỗi.</p></section>}
                    <button className="lyra-main-action" onClick={() => setDetailOpen(false)}><i className="bi bi-chat-dots" /> Quay lại trò chuyện</button>
                </section>
            </div>}
            {callMode && <div className="lyra-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setCallMode(null) }}>
                <section className="lyra-call-card" role="dialog" aria-modal="true" aria-label="Thông tin cuộc gọi">
                    <button className="lyra-icon-close" onClick={() => setCallMode(null)} aria-label="Đóng"><i className="bi bi-x-lg" /></button>
                    <div className="lyra-call-symbol"><i className={`bi bi-${callMode === "video" ? "camera-video" : "telephone"}`} /></div>
                    <h2>{callMode === "video" ? "Gọi video" : "Gọi thoại"}</h2>
                    <p>Cuộc gọi đến <strong>{chat.name}</strong> chưa thể bắt đầu. API hiện tại chưa cung cấp tín hiệu thiết lập cuộc gọi WebRTC.</p>
                    <button className="lyra-main-action" onClick={() => setCallMode(null)}>Đã hiểu</button>
                </section>
            </div>}

            <MessageList
                chatId={chat.id}
                currentUserId={currentUserId}
                username={chat.name}
                isPeopleChat={chat.kind === 'people'}
            />

            <MessageInput
                chatId={chat.id}
                currentUserId={currentUserId}
                isGroup={chat.kind === 'group'}
                onMessageSent={onMessageSent}
            />
        </main>
    )
}
