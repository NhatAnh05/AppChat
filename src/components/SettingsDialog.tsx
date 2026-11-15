type Theme = "light" | "dark";

type SettingsDialogProps = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLogout: () => void;
  onClose: () => void;
};

export function SettingsDialog({ theme, onThemeChange, onLogout, onClose }: SettingsDialogProps) {
  return <div className="settings-popover">
    <section className="settings-dialog" role="dialog" aria-label="T&#249;y ch&#7885;n giao di&#7879;n v&#224; &#273;&#259;ng xu&#7845;t">
      <header className="settings-dialog-header">
        <button className="settings-close" onClick={onClose} aria-label="&#272;&#243;ng c&#224;i &#273;&#7863;t">&#215;</button>
      </header>
      <div className="settings-section">
        <h3>Giao di&#7879;n</h3>
        <div className="theme-options">
          <button className={`theme-option ${theme === "light" ? "is-selected" : ""}`} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>
            <span className="theme-preview light-preview"><i /><i /><i /></span>
            <span>S&#225;ng</span>
            <span className="theme-radio" />
          </button>
          <button className={`theme-option ${theme === "dark" ? "is-selected" : ""}`} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>
            <span className="theme-preview dark-preview"><i /><i /><i /></span>
            <span>T&#7889;i</span>
            <span className="theme-radio" />
          </button>
        </div>
      </div>
      <div className="settings-dialog-footer">
        <button className="settings-logout" onClick={onLogout}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m9-8h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7" /></svg>
          &#272;&#259;ng xu&#7845;t
        </button>
      </div>
    </section>
  </div>;
}
