import type { CSSProperties } from 'react';
import { UsersRound } from 'lucide-react';
import type { Presence } from '../data/previewContent';

type Props = { initial: string; color: string; size?: number; group?: boolean; presence?: Presence; className?: string };
export default function Avatar({ initial, color, size = 44, group, presence, className = '' }: Props) {
  return (
    <span className={`avatar ${className}`} style={{ '--avatar-size': `${size}px`, '--avatar-color': color } as CSSProperties} aria-hidden="true">
      {group ? <UsersRound size={Math.round(size * .44)} strokeWidth={1.85} /> : initial}
      {presence === 'online' && <span className="presence-dot" />}
    </span>
  );
}
