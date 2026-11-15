import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store/store";
import type { ContactEntry } from "../types/contact";

type DirectoryTab = "friends" | "groups";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");
}

function DirectoryRows({ entries, isGroup }: { entries: ContactEntry[]; isGroup: boolean }) {
  let previousLetter = "";

  if (entries.length === 0) {
    return <div className="directory-empty">Không tìm thấy {isGroup ? "nhóm" : "bạn bè"} phù hợp.</div>;
  }

  return <div className="directory-rows">
    {entries.map((entry) => {
      const letter = normalize(entry.name.charAt(0)).charAt(0).toLocaleUpperCase("vi");
      const showLetter = letter !== previousLetter;
      previousLetter = letter;

      return <div key={entry.id}>
        {showLetter && <h3 className="directory-letter">{letter}</h3>}
        <article className="directory-entry">
          <span className={`directory-avatar ${isGroup ? "is-group" : ""}`} style={{ backgroundColor: entry.color }}>
            {entry.initials}
            {entry.online && <i className="online-dot" />}
          </span>
          <span className="directory-entry-copy">
            <strong>{entry.name}</strong>
            <span>{entry.detail}</span>
          </span>
          {entry.online && <span className="directory-online-label">Đang hoạt động</span>}
        </article>
      </div>;
    })}
  </div>;
}

export function ContactDirectory() {
  const friends = useSelector((state: RootState) => state.contacts.friends);
  const groups = useSelector((state: RootState) => state.contacts.groups);
  const [activeTab, setActiveTab] = useState<DirectoryTab>("friends");
  const [query, setQuery] = useState("");
  const [ascending, setAscending] = useState(true);
  const entries = activeTab === "friends" ? friends : groups;
  const filteredEntries = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    return entries
      .filter((entry) => normalize(entry.name).includes(normalizedQuery))
      .sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" }) * (ascending ? 1 : -1));
  }, [activeTab, ascending, query, entries]);

  const isFriends = activeTab === "friends";
  const title = isFriends ? "Danh sách bạn bè" : "Danh sách nhóm";

  return <>
    <section className="contact-nav-panel" aria-label="Chọn loại danh bạ">
      <header className="contact-nav-header">
        <h1>Danh bạ</h1>
      </header>
      <div className="contact-nav-options">
        <button className={`contact-nav-option ${isFriends ? "is-active" : ""}`} aria-pressed={isFriends} onClick={() => setActiveTab("friends")}>
          <span className="contact-option-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20M16 5a3.5 3.5 0 0 1 0 6.8M18 14a5 5 0 0 1 3.5 4.8V20"/></svg></span>
          <span className="contact-option-copy"><strong>Bạn bè</strong><small>Danh sách bạn bè</small></span>
          <span className="contact-option-count">{friends.length}</span>
        </button>
        <button className={`contact-nav-option ${!isFriends ? "is-active" : ""}`} aria-pressed={!isFriends} onClick={() => setActiveTab("groups")}>
          <span className="contact-option-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20M16 15a5 5 0 0 1 5 5"/></svg></span>
          <span className="contact-option-copy"><strong>Nhóm</strong><small>Danh sách nhóm</small></span>
          <span className="contact-option-count">{groups.length}</span>
        </button>
      </div>
    </section>

    <section className="directory-panel" aria-label={title}>
      <header className="directory-header">
        <div className="directory-title-row">
          <div>
            <h2>{title}</h2>
          </div>
          <span className="directory-total">{entries.length} {isFriends ? "bạn bè" : "nhóm"}</span>
        </div>
        <label className="directory-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isFriends ? "Tìm kiếm bạn bè" : "Tìm kiếm nhóm"} aria-label={isFriends ? "Tìm kiếm bạn bè" : "Tìm kiếm nhóm"} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm">×</button>}
        </label>
        <div className="directory-toolbar">
          <span>{filteredEntries.length === entries.length ? `Tất cả ${isFriends ? "bạn bè" : "nhóm"}` : `Hiển thị ${filteredEntries.length}/${entries.length}`}</span>
          <button className="directory-sort" onClick={() => setAscending((value) => !value)} aria-label={`Sắp xếp ${ascending ? "Z đến A" : "A đến Z"}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14m0 0-4-4m4 4 4-4M16 5h5l-5 7h5m-5 7h5"/></svg>
            {ascending ? "A → Z" : "Z → A"}
          </button>
        </div>
      </header>
      <DirectoryRows entries={filteredEntries} isGroup={!isFriends} />
    </section>
  </>;
}
