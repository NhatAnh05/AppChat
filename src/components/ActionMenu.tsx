import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

export type ActionMenuItem = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
};

type Props = {
  items: ActionMenuItem[];
  label: string;
  triggerClassName?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
};

/**
 * Menu dạng popover: render qua portal để không bị cắt trong danh sách có thanh cuộn.
 * Đóng khi click ngoài, Escape, cuộn hoặc đổi kích thước cửa sổ.
 */
export default function ActionMenu({ items, label, triggerClassName = '', menuClassName = '', align = 'right' }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const width = 244;

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const estimatedHeight = items.length * 43 + 18;
      const top = rect.bottom + 8 + estimatedHeight > window.innerHeight
        ? Math.max(8, rect.top - estimatedHeight - 8)
        : rect.bottom + 8;
      const rawLeft = align === 'right' ? rect.right - width : rect.left;
      const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8));
      setPosition({ left, top });
    }
    setOpen(value => !value);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={`action-menu-trigger ${triggerClassName} ${open ? 'is-open' : ''}`}
      aria-label={label}
      title={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={event => { event.stopPropagation(); toggle(); }}
    ><MoreHorizontal size={19}/></button>
    {open && createPortal(<div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={label}
      className={`action-menu-popover ${menuClassName}`}
      style={{ left: position.left, top: position.top }}
      onClick={event => event.stopPropagation()}
    >
      {items.map((item, index) => <button
        key={`${item.label}-${index}`}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        className={`action-menu-option ${item.danger ? 'is-danger' : ''} ${item.dividerBefore ? 'with-divider' : ''}`}
        onClick={() => { setOpen(false); item.onSelect(); }}
      ><span className="action-menu-option-icon">{item.icon}</span><span>{item.label}</span></button>)}
    </div>, document.body)}
  </>;
}
