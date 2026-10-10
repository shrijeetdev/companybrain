import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CornerDownLeft, Crosshair, Folder, Moon, Plus, Search, Sparkles, Sun, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { api } from '../api/endpoints';
import { qk } from '../api/queries';
import { useUpdateMe } from '../api/me';
import { Avatar } from '../components/Avatar';
import { StatusIcon } from '../components/icons';
import { Modal } from '../components/Overlay';
import { Kbd } from '../components/ui';
import { useLabels } from '../lib/labels';
import { toggleMode, useTheme } from '../lib/theme';
import { ui, useUi } from '../lib/ui';
import { useDebounced } from '../lib/util';
import { GAME_NAV, NAV, SETTINGS_NAV } from './nav';

interface Item { id: string; group: string; label: ReactNode; text: string; icon: ReactNode; right?: ReactNode; run: () => void }

export function CommandPalette() {
  const { palette } = useUi();
  return (
    <Modal open={palette} onClose={() => ui.palette(false)} className="palette" label="Command palette">
      {palette && <PaletteBody />}
    </Modal>
  );
}

function PaletteBody() {
  const L = useLabels();
  const { tactical, mode } = useTheme();
  const updateMe = useUpdateMe();
  const [, navigate] = useLocation();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q.trim(), 120);
  const { data: results } = useQuery({ queryKey: qk.search(dq), queryFn: ({ signal }) => api.search(dq, signal), enabled: dq.length > 0, staleTime: 10_000 });
  const close = () => ui.palette(false);
  const go = (href: string) => () => { close(); navigate(href); };

  const items = useMemo<Item[]>(() => {
    const ql = q.trim().toLowerCase();
    const actions: Item[] = [
      { id: 'new', group: 'Actions', label: L.newTask, text: `new task create add deploy mission ${L.newTask}`, icon: <Plus />, right: <Kbd>N</Kbd>, run: () => { close(); ui.quickAdd(); } },
      ...[...NAV, ...GAME_NAV, SETTINGS_NAV].map((n) => ({ id: `go-${n.key}`, group: 'Go to', label: <>Go to {n.label(L)}</>, text: `go ${n.label(L)} ${n.key}`, icon: n.icon(tactical), right: n.hotkey ? <><Kbd>G</Kbd><Kbd>{n.hotkey}</Kbd></> : undefined, run: go(n.href) })),
      { id: 'theme', group: 'Actions', label: tactical ? 'Switch to Classic style' : 'Switch to Tactical style', text: 'theme style tactical classic game', icon: tactical ? <Sparkles /> : <Crosshair />, run: () => { close(); void updateMe({ prefs: { theme: tactical ? 'classic' : 'tactical' } }); } },
      { id: 'mode', group: 'Actions', label: mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', text: 'dark light mode appearance', icon: mode === 'dark' ? <Sun /> : <Moon />, run: () => { close(); toggleMode(); } },
      { id: 'connect', group: 'Actions', label: 'Connect Claude / ChatGPT', text: 'connect ai claude chatgpt mcp cursor api key', icon: <Sparkles />, run: go('/settings/ai') },
    ];
    const filtered = ql ? actions.filter((a) => a.text.toLowerCase().includes(ql)) : actions.filter((a) => a.group === 'Actions' || a.id.startsWith('go-')).slice(0, 12);
    const found: Item[] = [];
    if (results && dq) {
      for (const t of results.tasks) found.push({ id: t.id, group: L.tasks, label: t.title, text: t.title, icon: <StatusIcon status={t.status} />, right: <ArrowRight size={14} />, run: () => { close(); ui.openTask(t.id); } });
      for (const p of results.projects) found.push({ id: p.id, group: L.projects, label: <><span style={{ marginRight: 6 }}>{p.emoji}</span>{p.name}</>, text: p.name, icon: <Folder />, run: go(`/projects/${p.id}`) });
      for (const m of results.members) found.push({ id: m.id, group: m.kind === 'agent' ? L.agents : L.team, label: m.name, text: m.name, icon: <Avatar member={m} size={20} />, run: go(`/team/${m.id}`) });
    }
    if (ql && !found.length && !filtered.length) {
      return [{ id: 'create', group: 'Actions', label: <>{L.newTask}: “{q.trim()}”</>, text: q, icon: <Plus />, run: () => { close(); ui.quickAdd(); } }];
    }
    return [...found, ...filtered];
  }, [q, dq, results, L, tactical, mode, updateMe]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';
  return (
    <>
      <div className="palette-input">
        <Search />
        <input autoFocus data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${L.tasksLower}, ${L.projects.toLowerCase()}, people… or type a command`} aria-label="Search"
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[active] ? `pi-${items[active]!.id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
          }} />
        <Kbd>esc</Kbd>
      </div>
      <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
        {items.map((it, i) => {
          const head = it.group !== lastGroup ? <div className="palette-group eyebrow">{it.group}</div> : null;
          lastGroup = it.group;
          return (
            <div key={it.id}>
              {head}
              <button id={`pi-${it.id}`} data-idx={i} role="option" aria-selected={i === active} className="palette-item" data-active={i === active} onMouseMove={() => setActive(i)} onClick={it.run}>
                {it.icon}<span className="grow truncate">{it.label}</span>{it.right && <span className="right">{it.right}</span>}
              </button>
            </div>
          );
        })}
        {dq && results && !results.tasks.length && !results.projects.length && !results.members.length && (
          <div className="faint" style={{ padding: '10px 12px', fontSize: 13 }}><User size={13} style={{ display: 'inline', verticalAlign: -2 }} /> No matches for “{dq}”.</div>
        )}
      </div>
      <div className="palette-foot">
        <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span><Kbd><CornerDownLeft size={11} /></Kbd> open</span>
        <span><Kbd>?</Kbd> all shortcuts</span>
      </div>
    </>
  );
}
