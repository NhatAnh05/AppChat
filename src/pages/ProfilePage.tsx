import { useState, type FormEvent } from 'react';
import { ArrowLeft, UserRound } from 'lucide-react';
import type { DemoAccount } from '../types/account';
type Props = { account: DemoAccount; onSave: (a: DemoAccount) => void; onBack: () => void };
export default function ProfilePage({ account, onSave, onBack }: Props) {
  const [name, setName] = useState(account.name); const [bio, setBio] = useState(account.bio);
  function submit(e: FormEvent) { e.preventDefault(); if(name.trim()) onSave({...account,name:name.trim(),bio:bio.trim()}); }
  return <div className="profile-screen"><div className="profile-card"><button className="profile-back" type="button" onClick={onBack}><ArrowLeft size={17}/> Quay lại tin nhắn</button><div className="profile-icon"><UserRound size={29}/></div><h1>Hồ sơ cá nhân</h1><p>Thông tin tài khoản dùng cho bản demo giao diện.</p><form className="auth-form" onSubmit={submit}><label>Tên hiển thị<input value={name} required maxLength={60} onChange={e=>setName(e.target.value)}/></label><label>Email<input value={account.email} readOnly/></label><label>Giới thiệu<textarea rows={4} maxLength={240} value={bio} onChange={e=>setBio(e.target.value)}/></label><button className="auth-submit" type="submit">Lưu thay đổi</button></form></div></div>;
}
