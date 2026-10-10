import type { AgentProvider, Channel, Priority, TaskStatus } from '@companybrain/types';
import { Bot, Calendar, Code, Download, Mail, MessageCircle, Mic, Pencil, Plug, Repeat, Zap } from 'lucide-react';

/** Original, logo-ish marks for agent providers (not the vendors' trademarks). */
export function ProviderMark({ provider, size = 16 }: { provider: AgentProvider; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (provider) {
    case 'claude':
      return (
        <svg {...common} strokeWidth={2.4}>
          {[0, 45, 90, 135].map((a) => <line key={a} x1="12" y1="3.5" x2="12" y2="20.5" transform={`rotate(${a} 12 12)`} />)}
        </svg>
      );
    case 'chatgpt':
      return (
        <svg {...common}>
          {[0, 60, 120].map((a) => <ellipse key={a} cx="12" cy="12" rx="8.5" ry="4" transform={`rotate(${a} 12 12)`} />)}
        </svg>
      );
    case 'cursor':
      return (
        <svg {...common}>
          <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" />
          <path d="M12 12 20 7.4M12 12v9.2M12 12 4 7.4" />
        </svg>
      );
    case 'gemini':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M12 2c.6 5.3 4.7 9.4 10 10-5.3.6-9.4 4.7-10 10-.6-5.3-4.7-9.4-10-10 5.3-.6 9.4-4.7 10-10z" />
        </svg>
      );
    case 'copilot':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="10" rx="5" />
          <circle cx="9" cy="13" r="1.4" fill="currentColor" />
          <circle cx="15" cy="13" r="1.4" fill="currentColor" />
          <path d="M8 8V6.5a4 4 0 0 1 8 0V8" />
        </svg>
      );
    case 'n8n':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="2.4" />
          <circle cx="13" cy="7" r="2.4" />
          <circle cx="13" cy="17" r="2.4" />
          <circle cx="20" cy="12" r="1.8" />
          <path d="M7.2 11 11 8M7.2 13l3.8 3M15.3 7.6 18.4 11" />
        </svg>
      );
    default:
      return <Bot width={size} height={size} aria-hidden />;
  }
}

export const PROVIDERS: { id: AgentProvider; name: string; color: string }[] = [
  { id: 'claude', name: 'Claude', color: '#d97757' },
  { id: 'chatgpt', name: 'ChatGPT', color: '#10a37f' },
  { id: 'cursor', name: 'Cursor', color: '#1f2937' },
  { id: 'gemini', name: 'Gemini', color: '#4f7cff' },
  { id: 'copilot', name: 'Copilot', color: '#6e40c9' },
  { id: 'n8n', name: 'n8n', color: '#ea4b71' },
  { id: 'custom', name: 'Custom', color: '#64748b' },
];

export function ChannelIcon({ channel, size = 14 }: { channel: Channel | 'whatsapp' | 'email'; size?: number }) {
  const p = { width: size, height: size, 'aria-hidden': true } as const;
  switch (channel) {
    case 'whatsapp': return <MessageCircle {...p} />;
    case 'email': return <Mail {...p} />;
    case 'mcp': return <Plug {...p} />;
    case 'api': return <Code {...p} />;
    case 'voice': return <Mic {...p} />;
    case 'quick_add': return <Zap {...p} />;
    case 'calendar': return <Calendar {...p} />;
    case 'recurring': return <Repeat {...p} />;
    case 'import': return <Download {...p} />;
    default: return <Pencil {...p} />;
  }
}
export function channelName(c: Channel): string {
  return ({ manual: 'Manual', quick_add: 'Quick add', voice: 'Voice', whatsapp: 'WhatsApp', email: 'Email', mcp: 'MCP', api: 'API', calendar: 'Calendar', recurring: 'Recurring', import: 'Import' } as const)[c];
}

/** Linear-style signal bars. */
export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  if (priority === 'urgent') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-label="Urgent" role="img">
        <rect x="1" y="1" width="14" height="14" rx="3.5" fill="var(--danger)" />
        <rect x="7.1" y="3.8" width="1.8" height="5.4" rx="0.9" fill="#fff" />
        <circle cx="8" cy="11.6" r="1.05" fill="#fff" />
      </svg>
    );
  }
  const level = priority === 'high' ? 3 : priority === 'medium' ? 2 : priority === 'low' ? 1 : 0;
  const color = priority === 'high' ? 'var(--warning)' : 'var(--text-2)';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={`${priority} priority`} role="img">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 4.5} y={11 - i * 3.5} width="3" height={3 + i * 3.5} rx="1"
          fill={i < level ? color : 'var(--border-strong)'} opacity={level === 0 ? 0.6 : 1} />
      ))}
    </svg>
  );
}

export function StatusIcon({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const c = `var(--c-${status === 'in_progress' ? 'progress' : status === 'cancelled' ? 'todo' : status})`;
  const r = 6;
  const circ = 2 * Math.PI * r;
  const frac = status === 'todo' ? 0 : status === 'in_progress' ? 0.5 : status === 'review' ? 0.75 : status === 'blocked' ? 1 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" stroke={c} strokeWidth="1.8" strokeDasharray={status === 'todo' ? '2.2 2' : undefined} />
      {status === 'done' ? (
        <>
          <circle cx="8" cy="8" r={r} fill={c} />
          <path d="M5.3 8.2 7.2 10l3.5-3.8" fill="none" stroke="var(--surface-solid)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : status === 'blocked' ? (
        <path d="M5 11 11 5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      ) : frac > 0 ? (
        <circle cx="8" cy="8" r={r / 2} fill="none" stroke={c} strokeWidth={r} strokeDasharray={`${(circ / 2) * frac} ${circ}`} transform="rotate(-90 8 8)" />
      ) : null}
    </svg>
  );
}

/** The 🧠 brand mark on a gradient tile. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, fontSize: size * 0.58 }} aria-hidden>🧠</span>
  );
}
