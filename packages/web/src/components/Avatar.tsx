import type { Member } from '@companybrain/types';
import { Bot } from 'lucide-react';
import { cx } from '../lib/util';
import { ProviderMark } from './icons';

interface AvatarProps {
  member: Pick<Member, 'name' | 'initials' | 'color' | 'avatarUrl' | 'kind'> & { agent?: Member['agent'] } | null | undefined;
  size?: number;
  className?: string;
  title?: string;
  /** Equipped cosmetic frame id (game layer). */
  frame?: string | null;
}

export function Avatar({ member, size = 28, className, title, frame }: AvatarProps) {
  if (!member) {
    return <span className={cx('avatar avatar-more', className)} style={{ ['--size' as string]: `${size}px` }} aria-hidden>?</span>;
  }
  const isAgent = member.kind === 'agent';
  const provider = member.agent?.provider;
  const el = (
    <span
      className={cx('avatar', isAgent && 'is-agent', className)}
      style={{ ['--size' as string]: `${size}px`, background: isAgent ? agentBg(member.color) : personBg(member.color) }}
      title={title ?? member.name}
      role="img"
      aria-label={member.name + (isAgent ? ' (AI agent)' : '')}
    >
      {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : isAgent && provider && provider !== 'custom' ? <ProviderMark provider={provider} size={Math.round(size * 0.56)} /> : member.initials}
      {isAgent && size >= 22 && (
        <span className="agent-tag" aria-hidden>
          <Bot strokeWidth={2.5} />
        </span>
      )}
    </span>
  );
  if (!frame) return el;
  return <span className="frame-ring" data-frame={frame}>{el}</span>;
}

function personBg(c: string): string {
  return `linear-gradient(135deg, color-mix(in srgb, ${c} 82%, #fff) 0%, ${c} 55%, color-mix(in srgb, ${c} 80%, #000) 100%)`;
}
function agentBg(c: string): string {
  return `linear-gradient(145deg, color-mix(in srgb, ${c} 75%, #fff) 0%, ${c} 60%, color-mix(in srgb, ${c} 70%, #000) 100%)`;
}

export function AvatarStack({ members, size = 24, max = 4 }: { members: (Member | undefined)[]; size?: number; max?: number }) {
  const list = members.filter((m): m is Member => !!m);
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <span className="avatar-stack" aria-label={list.map((m) => m.name).join(', ')}>
      {shown.map((m) => <Avatar key={m.id} member={m} size={size} />)}
      {extra > 0 && <span className="avatar avatar-more" style={{ ['--size' as string]: `${size}px` }}>+{extra}</span>}
    </span>
  );
}
