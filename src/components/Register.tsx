import { useState, type FormEvent } from "react";
import { registerAccount } from "../services/authService.ts";

type RegisterProps = {
    onBackToLogin: () => void;
};

export function Register({ onBackToLogin }: RegisterProps) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        setError("");
        setSuccess("");

        const user = username.trim();

        if (!user) {
            setError("Vui lòng nhập tài khoản.");
            return;
        }

        if (!password.trim()) {
            setError("Vui lòng nhập mật khẩu.");
            return;
        }

        if (password.length < 6) {
            setError("Mật khẩu phải có ít nhất 6 ký tự.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Mật khẩu xác nhận không khớp.");
            return;
        }

        if (loading) return;

        setLoading(true);

        try {
            const response = await registerAccount(user, password);
            setSuccess(typeof response.data === 'string' ? response.data : 'Đăng ký thành công!');
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Đăng ký không thành công.');
            setSuccess('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <form className="login-form" onSubmit={handleSubmit}>
                <h1>LyraChat</h1>

                <p>Tạo tài khoản để bắt đầu trò chuyện</p>

                <label htmlFor="register-username">Tài khoản</label>
                <input id="register-username" type="text" value={username} onChange={(event) =>
                    setUsername(event.target.value)} placeholder="Nhập tên tài khoản" autoComplete="username" required/>

                <label htmlFor="register-password">Mật khẩu</label>
                <input id="register-password" type="password" value={password} onChange={(event) =>
                    setPassword(event.target.value)} placeholder="Nhập mật khẩu" autoComplete="new-password" required/>

                <label htmlFor="confirm-password">Xác nhận mật khẩu</label>
                <input id="confirm-password" type="password" value={confirmPassword} onChange={(event) =>
                    setConfirmPassword(event.target.value)} placeholder="Nhập lại mật khẩu" autoComplete="new-password" required/>

                {error && <p className="login-error">{error}</p>}

                {success && (<p className="register-success">{success}</p>)}

                <button type="submit" disabled={loading}>
                    {loading ? "Đang đăng ký..." : "Đăng ký"}
                </button>

                <small>Đã có tài khoản?{" "}
                    <button type="button" className="register-back-button" onClick={onBackToLogin}>
                        Đăng nhập
                    </button>
                </small>
            </form>
        </div>
    );
}