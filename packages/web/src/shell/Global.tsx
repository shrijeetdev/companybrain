import { m } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { Modal } from '../components/Overlay';
import { Kbd } from '../components/ui';
import { QuickAdd, type QuickAddHandle } from '../features/tasks/QuickAdd';
import { useLabels } from '../lib/labels';
import { toggleMode, useTheme } from '../lib/theme';
import { ui, uiStore, useUi } from '../lib/ui';
import { isEditableTarget } from '../lib/util';
import { GAME_NAV, NAV, SETTINGS_NAV } from './nav';

/** N new · / or ⌘K search · G then key to navigate · ? help · [ toggle sidebar. */
export function useGlobalHotkeys(): void {
  const [, navigate] = useLocation();
  const pendingG = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.palette(!uiStore.get().palette); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;
      const s = uiStore.get();
      if (s.palette || s.quickAdd.open || s.help || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const k = e.key;
      if (Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const item = [...NAV, ...GAME_NAV, SETTINGS_NAV].find((n) => n.hotkey?.toLowerCase() === k.toLowerCase());
        if (item) { e.preventDefault(); navigate(item.href); }
        return;
      }
      if (k === 'g' || k === 'G') { pendingG.current = Date.now(); return; }
      if (k === 'n' || k === 'N') { e.preventDefault(); ui.quickAdd(); return; }
      if (k === '/') { e.preventDefault(); ui.palette(); return; }
      if (k === '?') { e.preventDefault(); ui.help(); return; }
      if (k === '[') { e.preventDefault(); ui.toggleSidebar(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

export function QuickAddModal() {
  const { quickAdd } = useUi();
  const L = useLabels();
  const ref = useRef<QuickAddHandle>(null);
  return (
    <Modal open={quickAdd.open} onClose={() => ui.quickAdd(false)} title={L.newTask} width={640}>
      <div className="modal-body" style={{ paddingTop: 4 }}>
        <QuickAdd ref={ref} autoFocus defaults={quickAdd.defaults} onCreated={() => ui.quickAdd(false)} />
        <div className="qa-help">
          <span><b className="tk-date token-chip chip">tomorrow 5pm</b> date</span>
          <span><b className="tk-assignee token-chip chip">@priya</b> assignee</span>
          <span><b className="tk-project token-chip chip">#website</b> {L.project.toLowerCase()}</span>
          <span><b className="tk-priority token-chip chip">!high</b> priority</span>
          <span><b className="tk-recurrence token-chip chip">every monday</b> repeat</span>
          <span><b className="tk-reminder token-chip chip">remind me 30m before</b></span>
        </div>
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['N'], 'New task'],
  [['/'], 'Search'],
  [['⌘', 'K'], 'Command palette'],
  [['G', 'H'], 'Go to Today / HQ'],
  [['G', 'T'], 'Go to Tasks'],
  [['G', 'P'], 'Go to Projects'],
  [['G', 'I'], 'Go to Inbox'],
  [['G', 'C'], 'Go to Calendar'],
  [['G', 'M'], 'Go to Team'],
  [['G', 'A'], 'Go to Armory'],
  [['G', 'S'], 'Go to Settings'],
  [['Space'], 'Complete focused task'],
  [['Enter'], 'Open focused task'],
  [['X'], 'Select focused task'],
  [['J', 'K'], 'Move between tasks'],
  [['['], 'Collapse sidebar'],
  [['?'], 'This help'],
];

export function HelpModal() {
  const { help } = useUi();
  return (
    <Modal open={help} onClose={() => ui.help(false)} title="Keyboard shortcuts" width={520}>
      <div className="modal-body">
        <div className="shortcut-grid">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{label}</span>
              <span className="row" style={{ gap: 4 }}>{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function MoreSheet() {
  const { more } = useUi();
  const L = useLabels();
  const { tactical, mode } = useTheme();
  const items = [...NAV.slice(2).filter((n) => n.key !== 'inbox'), ...GAME_NAV, SETTINGS_NAV];
  return (
    <Modal open={more} onClose={() => ui.more(false)} title="More" width={420}>
      <div className="modal-body more-grid">
        {items.map((n, i) => (
          <m.div key={n.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
            <Link href={n.href} className="more-tile" onClick={() => ui.more(false)}>{n.icon(tactical)}<span>{n.label(L)}</span></Link>
          </m.div>
        ))}
        <button className="more-tile" onClick={() => toggleMode()}>{mode === 'dark' ? <Sun /> : <Moon />}<span>{mode === 'dark' ? 'Light' : 'Dark'}</span></button>
      </div>
    </Modal>
  );
}
