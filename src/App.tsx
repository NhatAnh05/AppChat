import { useEffect, useState } from 'react';
import { Info, RefreshCw, X } from 'lucide-react';
import { useServerChats } from './hooks/useServerChats';
import { disconnectLoginSession, type LoginSession } from './services/loginService';
import { sendChatEvent } from './services/chatSocket';
import AuthPage from './pages/AuthPage';
import Rail from './components/Rail';
import Sidebar, { type Filter } from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import DetailsPanel from './components/DetailsPanel';
import Avatar from './components/Avatar';
import type { Section } from './components/Rail';

type Modal = 'new' | 'create' | 'join' | 'settings' | 'call' | null;
function LoggedIn({ session, onExit }: {session:LoginSession;onExit:()=>void}) {
  const api = useServerChats(session.username);
  const [section,setSection] = useState<Section>('chats');
  const [filter,setFilter] = useState<Filter>('all');
  const [search,setSearch] = useState('');
  const [selected,setSelected] = useState('');
  const [details,setDetails] = useState(false);
  const [mobileChat,setMobileChat] = useState(false);
  const [modal,setModal] = useState<Modal>(null);
  const [input,setInput] = useState('');
  const [notice,setNotice] = useState('');
  const chat=api.conversations.find(item=>item.id===selected);
  useEffect(()=>{ if(selected)api.loadHistory(selected); },[selected]); // Lấy trang đầu khi chọn hội thoại
  const choose=(id:string)=>{setSelected(id);setMobileChat(true);setDetails(false);};
  const open=(type:Modal)=>{setModal(type);setInput('');setNotice('');};
  const create=()=>{
    const name=input.trim();if(!name)return;
    if(modal==='new') {if (name===session.username) {setNotice('Không thể tự nhắn tin cho mình.');return;} choose(api.startPerson(name));}
    else if(modal==='create'){api.createRoom(name);api.refresh();setNotice('Đã gửi yêu cầu tạo phòng. Đang cập nhật danh sách từ máy chủ.');return;}
    else if(modal==='join'){api.joinRoom(name);api.refresh();setNotice('Đã gửi yêu cầu tham gia phòng.');return;}
    setModal(null);
  };
  const logout=()=>{
    try{sendChatEvent('LOGOUT');}catch{/* kết nối đã đóng */}
    disconnectLoginSession();onExit();
  };
  return <div className={`app-shell ${mobileChat?'is-mobile-chat':''} ${details?'details-open':''}`}>
    <Rail active={section} onChange={next=>{setSection(next);setMobileChat(false);setDetails(false);if(next==='chats')setFilter('all');}} onSettings={()=>open('settings')} onGroups={()=>{setSection('chats');setFilter('groups');open('create');}} onCalls={()=>open('call')} accountName={session.username}/>
    <Sidebar conversations={api.conversations} section={section} filter={filter} search={search} onFilter={setFilter} onSearch={setSearch} selected={selected} onSelect={choose} onNewChat={()=>open('new')} onShowChat={()=>setMobileChat(true)} onUpdateChat={()=>{setNotice('API chưa hỗ trợ ghim hoặc lưu trữ trên máy chủ.');}} onRemoveChat={()=>{setNotice('API chưa hỗ trợ xóa hội thoại trên máy chủ.');}} />
    <ChatPanel key={selected} chat={chat} messages={api.messages[selected]??[]} onSend={value=>api.sendMessage(selected,value)} onEdit={()=>window.alert('Máy chủ chưa cung cấp API sửa tin nhắn.')} onDelete={()=>window.alert('Máy chủ chưa cung cấp API xóa tin nhắn.')} onBack={()=>setMobileChat(false)} onDetails={()=>setDetails(value=>!value)} onOpenCallPreview={()=>open('call')} onManageGroup={()=>open('join')}/>
    {details && chat && <DetailsPanel chat={chat} onClose={()=>setDetails(false)} onManageGroup={()=>open('join')}/>}
    {(api.error || notice || api.busy) && <div className="api-status" role="status">{api.error || notice || (api.busy?'Đang tải tin nhắn từ máy chủ…':'')} <button type="button" onClick={()=>{api.clearError();setNotice('');}}>×</button></div>}
    <div className="api-toolbar"><button type="button" onClick={api.refresh}><RefreshCw size={15}/> Làm mới hội thoại</button>{chat?.group && <button type="button" onClick={()=>{if(window.confirm(`Rời phòng ${chat.name}?`)){api.outRoom(chat.id);setSelected('');}}}>Rời phòng</button>}{chat && <button type="button" onClick={()=>api.loadHistory(chat.id,2)}>Tải trang tin cũ (trang 2)</button>}<button type="button" onClick={()=>open('join')}>Tham gia phòng</button></div>
    {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><div className="modal" role="dialog" aria-modal="true" aria-label="Thao tác LyraChat">
      <div className="modal-heading"><div><span className="eyebrow">LYRACHAT / WEBSOCKET</span><h2>{modal==='new'?'Tin nhắn mới':modal==='create'?'Tạo phòng chat':modal==='join'?'Tham gia phòng':modal==='settings'?'Tài khoản': 'Cuộc gọi'}</h2></div><button type="button" className="icon-button" onClick={()=>setModal(null)} aria-label="Đóng"><X size={20}/></button></div>
      {(modal==='new'||modal==='create'||modal==='join') && <form onSubmit={e=>{e.preventDefault();create();}} className="group-form"><label className="group-name-field">{modal==='new'?'Tên username người nhận': 'Tên phòng chat'}<input autoFocus required maxLength={80} value={input} onChange={e=>setInput(e.target.value)} placeholder={modal==='new'?'Nhập username đã đăng ký':'Nhập tên phòng theo API'}/></label><p className="modal-hint"><Info size={16}/>{modal==='new'?'Nhập username thật trên server, không dùng tên liên hệ trong dữ liệu mẫu.':modal==='create'?'Người tạo phòng là chủ phòng theo quy định API.':'Bạn phải tham gia phòng trước khi gửi tin trong nhóm.'}</p>{notice && <p role="status">{notice}</p>}<div className="group-form-footer"><button type="button" className="group-cancel" onClick={()=>setModal(null)}>Hủy</button><button type="submit" className="group-submit">{modal==='new'?'Mở hội thoại':modal==='create'?'Tạo phòng':'Tham gia'}</button></div></form>}
      {modal==='settings' && <><div className="settings-profile"><Avatar initial={session.username[0]?.toUpperCase()??'U'} color="#3e9e88" size={52}/><span><strong>{session.username}</strong><small>Đăng nhập thành công qua WebSocket</small></span></div><p className="modal-hint">API hiện chưa cung cấp cập nhật hồ sơ, email, mật khẩu hoặc liên kết Google. Các dữ liệu này không được giả lập thành thao tác server.</p><button className="settings-action logout" type="button" onClick={logout}>Đăng xuất (API LOGOUT)</button></>}
      {modal==='call' && <p className="modal-hint">Máy chủ được cung cấp chưa có API gọi thoại/video hoặc WebRTC. Chức năng này chưa khả dụng.</p>}
    </div></div>}
  </div>;
}
export default function App(){
  const [session,setSession]=useState<LoginSession|null>(null);
  const [notice,setNotice]=useState('');
  if(!session)return <AuthPage notice={notice} onDisconnected={()=>{setSession(null);setNotice('Không thể khôi phục phiên WebSocket. Vui lòng đăng nhập lại.');}} onLogin={value=>{setSession(value);setNotice('');window.history.replaceState(null,'','/');}}/>;
  return <LoggedIn session={session} onExit={()=>{setSession(null);setNotice('Bạn đã đăng xuất.');window.history.replaceState(null,'','/login');}}/>;
}
