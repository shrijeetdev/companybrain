import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Member, Priority, ProjectSummary, TaskStatus } from '@companybrain/types';
import { Avatar } from '../../components/Avatar';
import { PriorityIcon, StatusIcon } from '../../components/icons';
import { MenuList } from '../../components/Overlay';
import { PRIORITIES, priorityLabel, STATUS_ORDER, statusLabel, useLabels } from '../../lib/labels';
import { useTheme } from '../../lib/theme';

export function MemberPicker({ members, selected, onToggle, single }: { members: Member[]; selected: string[]; onToggle: (id: string) => void; single?: boolean }) {
  const L = useLabels();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const filtered = useMemo(() => members.filter((m) => m.active && m.name.toLowerCase().includes(q.toLowerCase())), [members, q]);
  const humans = filtered.filter((m) => m.kind === 'human');
  const agents = filtered.filter((m) => m.kind === 'agent');
  const flat = [...humans, ...agents];
  const row = (m: Member) => {
    const i = flat.indexOf(m);
    const on = selected.includes(m.id);
    return (
      <button key={m.id} className="menu-item" role="menuitemcheckbox" aria-checked={on} data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => onToggle(m.id)}>
        <Avatar member={m} size={22} />
        <span className="grow truncate">{m.name}</span>
        {m.kind === 'agent' && <span className="faint" style={{ fontSize: 11 }}>{m.agent?.provider}</span>}
        {on && <Check style={{ color: 'var(--accent-ink)' }} />}
      </button>
    );
  };
  return (
    <div style={{ width: 260 }}>
      <div className="row" style={{ padding: '4px 6px 8px', gap: 8 }}>
        <Search size={15} className="faint" />
        <input className="grow" style={{ border: 0, background: 'transparent', outline: 'none', height: 30 }} placeholder={single ? 'Choose…' : 'Assign to…'} value={q} autoFocus data-autofocus
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && flat[active]) { e.preventDefault(); onToggle(flat[active]!.id); }
          }} />
      </div>
      {humans.length > 0 && <div className="menu-label eyebrow">{L.humans}</div>}
      {humans.map(row)}
      {agents.length > 0 && <div className="menu-label eyebrow">{L.agents}</div>}
      {agents.map(row)}
      {flat.length === 0 && <div className="faint" style={{ padding: 10, fontSize: 13 }}>No one matches “{q}”.</div>}
    </div>
  );
}

export function StatusMenu({ value, onChange, onDone }: { value: TaskStatus; onChange: (s: TaskStatus) => void; onDone: () => void }) {
  const { tactical } = useTheme();
  return <MenuList onDone={onDone} items={STATUS_ORDER.map((s) => ({ key: s, label: statusLabel(s, tactical), icon: <StatusIcon status={s} />, checked: s === value, onSelect: () => onChange(s) }))} />;
}

export function PriorityMenu({ value, onChange, onDone }: { value: Priority; onChange: (p: Priority) => void; onDone: () => void }) {
  return <MenuList onDone={onDone} items={PRIORITIES.map((p) => ({ key: p, label: priorityLabel(p), icon: <PriorityIcon priority={p} />, checked: p === value, onSelect: () => onChange(p) }))} />;
}

export function ProjectMenu({ projects, value, onChange, onDone }: { projects: ProjectSummary[]; value: string | null; onChange: (id: string | null) => void; onDone: () => void }) {
  const L = useLabels();
  return (
    <MenuList onDone={onDone} items={[
      { key: 'none', label: `No ${L.project.toLowerCase()}`, icon: <span style={{ width: 16 }} />, checked: value === null, onSelect: () => onChange(null) },
      ...projects.filter((p) => p.status !== 'archived').map((p) => ({ key: p.id, label: p.name, icon: <span style={{ width: 16, textAlign: 'center' }}>{p.emoji}</span>, checked: p.id === value, onSelect: () => onChange(p.id) })),
    ]} />
  );
}
