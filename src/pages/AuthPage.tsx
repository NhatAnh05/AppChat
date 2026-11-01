import { useState, type FormEvent } from 'react';
import { MessageCircle, LockKeyhole, ArrowRight } from 'lucide-react';
import type { DemoAccount } from '../types/account';
import { readDemo, saveDemo } from '../services/demoStorage';

type Props = { onLogin: (account: DemoAccount) => void };
export default function AuthPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const key = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(key)) { setError('Vui lòng nhập email hợp lệ.'); return; }
    if (password.length < 6) { setError('Mật khẩu demo phải có ít nhất 6 ký tự.'); return; }
    const accounts = readDemo<Record<string, DemoAccount>>('accounts', {});
    if (mode === 'register') {
      if (!name.trim()) { setError('Vui lòng nhập tên hiển thị.'); return; }
      if (accounts[key]) { setError('Email này đã được tạo trong bản demo.'); return; }
      const account = { name: name.trim(), email: key, bio: 'Xin chào! Tôi dùng AppChat.' };
      // KHÔNG lưu mật khẩu; chỉ giả lập luồng UI. Bất kỳ mật khẩu >=6 ký tự đều có thể đăng nhập demo.
      saveDemo('accounts', { ...accounts, [key]: account }); onLogin(account);
    } else {
      const account = accounts[key];
      if (!account) { setError('Chưa có tài khoản demo. Hãy chọn Đăng ký.'); return; }
      onLogin(account);
    }
  }
  return <div className="auth-page"><div className="auth-card">
    <div className="auth-logo"><MessageCircle size={25}/></div>
    <span className="auth-eyebrow">APPCHAT · FRONTEND DEMO</span>
    <h1>{mode === 'login' ? 'Chào mừng quay lại' : 'Tạo tài khoản AppChat'}</h1>
    <p>Giao diện thử nghiệm giai đoạn 1. Tài khoản và tin nhắn chỉ nằm trên trình duyệt này.</p>
    <form onSubmit={submit} className="auth-form">
      {mode === 'register' && <label>Tên hiển thị<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nguyễn Văn A" maxLength={60}/></label>}
      <label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@example.com"/></label>
      <label>Mật khẩu demo<input required type="password" minLength={6} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Ít nhất 6 ký tự"/></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" type="submit">{mode === 'login' ? 'Vào AppChat' : 'Tạo tài khoản demo'} <ArrowRight size={17}/></button>
    </form>
    <button className="auth-switch" type="button" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');}}>{mode==='login'?'Chưa có tài khoản? Đăng ký':'Đã có tài khoản? Đăng nhập'}</button>
    <div className="auth-notice"><LockKeyhole size={15}/> Không dùng mật khẩu thật: đây chưa phải hệ thống xác thực.</div>
  </div></div>;
}
