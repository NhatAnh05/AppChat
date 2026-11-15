import { useState, type FormEvent } from "react";
import { userService } from "../services/userService";

type SearchResult = {
    username: string;
    online: boolean;
};

type UserSearchProps = {
    onOpenChat: (username: string) => void;
    currentUser?: string;
};

export function UserSearch({onOpenChat, currentUser,}: UserSearchProps) {
    const [username, setUsername] = useState("");
    const [result, setResult] = useState<SearchResult | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const user = username.trim();

        setError("");
        setResult(null);
        setNotFound(false);

        if (!user) {
            setError("Vui lòng nhập username cần tìm.");
            return;
        }

        if (currentUser && user.toLowerCase() === currentUser.toLowerCase()) {
            setError("Bạn không thể tìm chính tài khoản của mình.");
            return;
        }

        if (loading) return;

        setLoading(true);

        try {
            const exists = await userService.checkUserExist(user);

            if (!exists) {
                setNotFound(true);
                return;
            }

            const online = await userService.checkUserOnline(user);

            setResult({
                username: user,
                online,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Không thể tìm kiếm người dùng.",);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="user-search">
            <h3>Tìm người dùng</h3>

            <form onSubmit={handleSearch}>
                <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Nhập username..."
                    disabled={loading}
                />

                <button type="submit" disabled={loading}>
                    {loading ? "Đang tìm..." : "Tìm kiếm"}
                </button>
            </form>

            {error && (<p className="search-error">{error}</p>)}

            {notFound && (
                <p className="search-empty">
                    Không tìm thấy tài khoản "{username.trim()}".
                </p>
            )}

            {result && (
                <div className="search-result">
                    <div className="search-user-info">
                        <strong>{result.username}</strong>

                        <span>
                            {result.online ? "Đang online" : "Ngoại tuyến"}
                        </span>
                    </div>

                    <button type="button" onClick={() => onOpenChat(result.username)}>
                        Nhắn tin
                    </button>
                </div>
            )}
        </div>
    );
}
