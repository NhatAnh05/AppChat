import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, LockKeyhole, ArrowRight } from 'lucide-react';
import type { DemoAccount } from '../types/account';
import { readDemo } from '../services/demoStorage';
import { registerAccount } from '../services/authService';

type Mode = 'login' | 'register';
type Props = { onLogin: (account: DemoAccount) => void };

/**
 * LOGIN ở đây vẫn là DEMO local, không phải API LOGIN từ chat_API.xlsx.
 * REGISTER là lệnh WebSocket thật. Không đồng nhất hai loại tài khoản.
 */
export default function AuthPage({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>(() => window.location.pathname === '/register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [demoEmail, setDemoEmail] = useState('');
  const [demoPassword, setDemoPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    const onPopState = () => setMode(window.location.pathname === '/register' ? 'register' : 'login');
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      abortController.current?.abort();
    };
  }, []);

  function changeMode(next: Mode) {
    if (loading) return;
    setMode(next);
    setError('');
    setSuccess('');
    setRegisterPassword('');
    setConfirmPassword('');
    setDemoPassword('');
    window.history.pushState(null, '', next === 'register' ? '/register' : '/login');
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setSuccess('');
    const user = username.trim();
    if (!/^[A-Za-z0-9_]+$/.test(user)) {
      setError('Tên tài khoản chỉ được chứa chữ cái không dấu, số và dấu gạch dưới (_).');
      return;
    }
    if (!registerPassword) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }
    if (registerPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    const controller = new AbortController();
    abortController.current = controller;
    setLoading(true);
    try {
      const response = await registerAccount({ username: user, password: registerPassword }, { signal: controller.signal });
      setSuccess(response.data || 'Creating account successful');
      setRegisterPassword('');
      setConfirmPassword('');
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Không thể đăng ký. Vui lòng thử lại.');
      }
    } finally {
      if (abortController.current === controller) abortController.current = null;
      setLoading(false);
    }
  }

  function submitDemoLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const email = demoEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Nhập email của tài khoản demo đã tạo trước đây.');
      return;
    }
    if (demoPassword.length < 6) {
      setError('Mật khẩu demo cần ít nhất 6 ký tự.');
      return;
    }
    const accounts = readDemo<Record<string, DemoAccount>>('accounts', {});
    const account = accounts[email];
    if (!account) {
      setError('Không tìm thấy tài khoản demo trong trình duyệt này. Bạn có thể dùng “Xem giao diện demo”.');
      return;
    }
    // Chỉ xác thực demo theo dữ liệu cũ trong localStorage: KHÔNG phải API LOGIN.
    onLogin(account);
  }

  function openDemoChat() {
    onLogin({ name: 'Người dùng demo', email: 'preview@appchat.local', bio: 'Bản xem trước giao diện — chưa đăng nhập máy chủ.' });
  }

  return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo"><MessageCircle size={25} /></div>
          <span className="auth-eyebrow">APPCHAT · GIAI ĐOẠN 1</span>
          <h1>{mode === 'register' ? 'Đăng ký tài khoản' : 'Chào mừng quay lại'}</h1>
          <p>{mode === 'register'
              ? 'Đăng ký qua WebSocket API REGISTER của máy chủ được cung cấp.'
              : 'API LOGIN chưa tích hợp. Bạn có thể xem trước giao diện hoặc sử dụng tài khoản demo cũ trong trình duyệt này.'}</p>

          {mode === 'register' ? (
              <form onSubmit={submitRegister} className="auth-form">
                <label>Tên tài khoản (username)
                  <input required autoComplete="username" maxLength={64} pattern="[A-Za-z0-9_]+" title="Chỉ dùng chữ cái không dấu, số và dấu gạch dưới" value={username} disabled={loading} onChange={e => setUsername(e.target.value)} placeholder="Ví dụ: appchat_test_01" />
                </label>
                <label>Mật khẩu
                  <input required type="password" autoComplete="new-password" value={registerPassword} disabled={loading} onChange={e => setRegisterPassword(e.target.value)} placeholder="Nhập mật khẩu để tạo tài khoản" />
                </label>
                <label>Xác nhận mật khẩu
                  <input required type="password" autoComplete="new-password" value={confirmPassword} disabled={loading} onChange={e => setConfirmPassword(e.target.value)} placeholder="Nhập lại mật khẩu" />
                </label>
                {error && <div className="auth-error" role="alert">{error}</div>}
                {success && <div className="auth-success" role="status">{success}<small>Tài khoản đã được máy chủ xác nhận. API LOGIN chưa triển khai nên bạn chưa thể đăng nhập thật bằng tài khoản này.</small></div>}
                <button className="auth-submit" type="submit" disabled={loading}>
                  {loading ? 'Đang gửi yêu cầu...' : 'Đăng ký qua WebSocket'} {!loading && <ArrowRight size={17} />}
                </button>
              </form>
          ) : (
              <>
                <form onSubmit={submitDemoLogin} className="auth-form">
                  <label>Email demo (chỉ có trên trình duyệt này)
                    <input required type="email" autoComplete="username" value={demoEmail} onChange={e => setDemoEmail(e.target.value)} placeholder="email-demo@example.com" />
                  </label>
                  <label>Mật khẩu demo
                    <input required type="password" minLength={6} autoComplete="current-password" value={demoPassword} onChange={e => setDemoPassword(e.target.value)} placeholder="Không dùng mật khẩu thật" />
                  </label>
                  {error && <div className="auth-error" role="alert">{error}</div>}
                  <button className="auth-submit" type="submit">Đăng nhập demo <ArrowRight size={17} /></button>
                </form>
                <button className="auth-preview" type="button" onClick={openDemoChat}>Xem giao diện chat (không đăng nhập máy chủ)</button>
              </>
          )}

          <button className="auth-switch" type="button" disabled={loading} onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Đăng ký tài khoản bằng API REGISTER' : 'Quay lại trang đăng nhập demo'}
          </button>
          <div className="auth-notice"><LockKeyhole size={15} />
            {mode === 'register'
                ? 'Chỉ REGISTER kết nối Backend thật; không lưu mật khẩu vào trình duyệt. Đừng dùng mật khẩu cá nhân để kiểm thử.'
                : 'Đăng nhập demo không xác thực với máy chủ. Hãy chờ bước tích hợp API LOGIN.'}
          </div>
        </div>
      </div>
  );
}
