import { useEffect, useMemo, useState } from "react";
import type { Chat } from "../types/chat";
import { ChatItem } from "./ChatItem";
import { userService } from "../services/userService";

type ChatListProps = {
  chats: Chat[];
  selectedId?: string;
  onSelect: (chat: Chat) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onSearchUser: (username: string) => void;
  searchingUser: boolean;
  onCompose: () => void;
};

type SearchResult = {
  keyword: string;
  username: string | null;
  error: string;
};

export function ChatList({chats, selectedId, onSelect, query, onQueryChange, onSearchUser, searchingUser, onCompose,}: ChatListProps) {
  const [filter, setFilter] = useState<"all" | "people" | "group">("all");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [checkingKeyword, setCheckingKeyword] = useState("");
  const keyword = query.trim();

  // Các cuộc trò chuyện hiện có
  const filteredChats = useMemo(() =>
          chats.filter((chat) =>
              (filter === "all" || (chat.kind ?? "people") === filter) && chat.name.toLowerCase().includes(keyword.toLowerCase())
          ), [chats, keyword, filter]
  );

  // Kiểm tra username có tồn tại trong danh sách chat hay chưa.
  const existingChat = useMemo(() =>
          chats.find(
              (chat) =>
                  chat.name.toLowerCase() === keyword.toLowerCase()
          ), [chats, keyword]
  );

  // Chỉ lấy kết quả tương ứng với từ khóa hiện tại.
  const foundUser = searchResult?.keyword.toLowerCase() === keyword.toLowerCase() ? searchResult.username : null;
  const searchError = searchResult?.keyword.toLowerCase() === keyword.toLowerCase() ? searchResult.error : "";

  // Tìm kiếm tài khoản sau khi người dùng ngừng gõ 500ms.
  useEffect(() => {
    if (!keyword || existingChat) {
      return;
    }

    let cancelled = false;

    const timeout = window.setTimeout(async () => {
      setCheckingKeyword(keyword);

      try {
        const exists = await userService.checkUserExist(keyword);

        if (cancelled) return;

        setSearchResult({
          keyword,
          username: exists ? keyword : null,
          error: exists ? "" : "Không tìm thấy tài khoản.",
        });
      } catch {
        if (!cancelled) {
          setSearchResult({
            keyword,
            username: null,
            error: "Không thể tìm kiếm người dùng.",
          });
        }
      } finally {
        if (!cancelled) {
          setCheckingKeyword("");
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [keyword, existingChat]);

  // Tạo Chat cho tài khoản tìm thấy.
  const foundUserChat: Chat | null = foundUser ? {
        id: foundUser,
        name: foundUser,
        avatar: foundUser.slice(0, 2).toUpperCase(),
        avatarColor: "#459688",
        lastMessage: "Bắt đầu cuộc trò chuyện",
        time: "",
        kind: "people",
      }
      : null;

  // Mở cuộc trò chuyện với tài khoản vừa tìm thấy.
  const handleOpenFoundUser = () => {
    if (!foundUserChat) return;

    onSearchUser(foundUserChat.name);
    setSearchResult(null);
  };

  return (
      <section className="chat-list-panel" aria-label="Danh sách cuộc trò chuyện">
        <header className="chat-list-header">
          <div className="list-title-row">
            <div>
              <h1>Tin nhắn</h1>
            </div>

            <button className="compose-button" aria-label="Tạo tin nhắn mới" onClick={onCompose}>
              <i className="bi bi-chat-square-text"/>
            </button>
          </div>

          <label className="search-box">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4 4" />
            </svg>

            <input
                type="text" value={query}
                onChange={(event) =>
                    onQueryChange(event.target.value)
                }
                placeholder="Tìm kiếm cuộc trò chuyện"
                aria-label="Tìm cuộc trò chuyện hoặc username"
            />

            {query && (
                <button type="button" onClick={() => onQueryChange("")} aria-label="Xóa tìm kiếm">
                  x
                </button>
            )}
          </label>

          <div className="chat-filters" role="group" aria-label="Lọc cuộc trò chuyện">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tất cả</button>
            <button className={filter === "people" ? "active" : ""} onClick={() => setFilter("people")}>Cá nhân</button>
            <button className={filter === "group" ? "active" : ""} onClick={() => setFilter("group")}>Nhóm</button>
          </div>
        </header>

        <div className="chat-items">
          {filteredChats.map((chat) => (
              <ChatItem
                  key={chat.id}
                  chat={chat}
                  selected={chat.id === selectedId}
                  onSelect={onSelect}
              />
          ))}

          {foundUserChat && (
              <div className="search-result">
                <div className="search-result-label">
                  Kết quả tìm kiếm
                </div>

                <ChatItem
                    key={`search-${foundUserChat.id}`}
                    chat={foundUserChat}
                    selected={false}
                    onSelect={handleOpenFoundUser}
                />
              </div>
          )}

          {keyword && !existingChat && !foundUserChat && filteredChats.length === 0 && (
                  <div className="list-empty">
                    <strong>
                      {searchingUser || checkingKeyword === keyword ? "Đang tìm người dùng..." : searchError || "Đang tìm kiếm..."}
                    </strong>
                  </div>
              )}

          {!keyword && filteredChats.length === 0 && (
              <div className="list-empty">
                <strong>Chưa có cuộc trò chuyện</strong>
              </div>
          )}
        </div>
      </section>
  );
}
