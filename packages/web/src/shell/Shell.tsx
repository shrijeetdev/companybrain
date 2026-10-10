import { m } from 'motion/react';
import { Ellipsis, PanelLeftClose, PanelLeft, Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useInbox, useProjects } from '../api/queries';
import { useLiveStatus } from '../api/live';
import { BrandMark } from '../components/icons';
import { Kbd } from '../components/ui';
import { HudCompact } from '../features/game/Hud';
import { useLabels } from '../lib/labels';
import { useTheme } from '../lib/theme';
import { ui, useUi } from '../lib/ui';
import { cx, useIsMobile } from '../lib/util';
import { AvatarMenu } from './AvatarMenu';
import { NotificationsButton } from './Notifications';
import { GAME_NAV, isActive, NAV, SETTINGS_NAV, type NavItem } from './nav';

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <span className="brand">
      <BrandMark size={30} />
      {!compact && <span>company<b>brain</b></span>}
    </span>
  );
}

function NavLink({ item, badge }: { item: NavItem; badge?: number }) {
  const [loc] = useLocation();
  const L = useLabels();
  const { tactical } = useTheme();
  const active = isActive(item.href, loc);
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} title={item.label(L)}>
      {active && <m.span layoutId="nav-active" className="nav-active" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
      {item.icon(tactical)}
      <span className="nav-text">{item.label(L)}</span>
      {!!badge && <span className="badge">{badge}</span>}
      {!!badge && <span className="nav-dot" />}
    </Link>
  );
}

function Sidebar() {
  const { collapsed } = useUi();
  const L = useLabels();
  const [loc] = useLocation();
  const { data: inbox } = useInbox('new');
  const { data: projects } = useProjects();
  const live = useLiveStatus();
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-inner panel no-ticks">
        <div className="brand-row">
          <Link href="/" aria-label="companybrain home"><Brand compact={collapsed} /></Link>
          <button className="icon-btn icon-btn-sm" onClick={ui.toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title="Toggle sidebar  [">
            {collapsed ? <PanelLeft /> : <PanelLeftClose />}
          </button>
        </div>
        <div className="sidebar-scroll">
          <nav className="nav">
            {NAV.map((n) => <NavLink key={n.key} item={n} badge={n.key === 'inbox' ? inbox?.length : undefined} />)}
          </nav>
          <div className="nav-sep" />
          <nav className="nav" aria-label="Game">
            {GAME_NAV.map((n) => <NavLink key={n.key} item={n} />)}
          </nav>
          {!!projects?.length && (
            <>
              <div className="nav-label eyebrow">{L.projects}</div>
              <nav className="nav" aria-label={L.projects}>
                {projects.filter((p) => p.status === 'active').slice(0, 8).map((p) => {
                  const href = `/projects/${p.id}`;
                  return (
                    <Link key={p.id} href={href} className="nav-project" aria-current={loc === href ? 'page' : undefined} title={p.name}>
                      {loc === href && <m.span layoutId="nav-active" className="nav-active" />}
                      <span className="nav-emoji" aria-hidden>{p.emoji}</span>
                      <span className="nav-text truncate">{p.name}</span>
                      {p.counts.overdue > 0 && <span className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{p.counts.overdue}</span>}
                    </Link>
                  );
                })}
              </nav>
            </>
          )}
        </div>
        <div className="sidebar-foot">
          <nav className="nav"><NavLink item={SETTINGS_NAV} /></nav>
          <div className="live-pill" title={live === 'live' ? 'Live updates connected' : 'Reconnecting…'}>
            <span className={cx('live-dot', live === 'offline' && 'off', live === 'connecting' && 'connecting')} />
            <span>{live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting…' : 'Offline — retrying'}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const mobile = useIsMobile();
  const [loc] = useLocation();
  const L = useLabels();
  const item = [...NAV, ...GAME_NAV, SETTINGS_NAV].find((n) => isActive(n.href, loc));
  const title = item?.label(L);
  return (
    <header className="topbar">
      <div className="topbar-inner panel no-ticks">
        {mobile ? (
          <>
            <Link href="/" aria-label="Home"><BrandMark size={30} /></Link>
            <span className="sr-only">{title}</span>
            <span className="spacer" />
            <button className="icon-btn" aria-label="Search" onClick={() => ui.palette()}><Search /></button>
          </>
        ) : (
          <>
            <button className="search-btn" onClick={() => ui.palette()} aria-label="Search and commands">
              <Search />
              <span>Search or jump to…</span>
              <Kbd>⌘K</Kbd>
            </button>
            <span className="spacer" />
          </>
        )}
        <HudCompact />
        <NotificationsButton />
        <AvatarMenu />
      </div>
    </header>
  );
}

function TabBar() {
  const [loc] = useLocation();
  const L = useLabels();
  const { tactical } = useTheme();
  const { data: inbox } = useInbox('new');
  const tabs = [NAV[0]!, NAV[1]!, null, NAV[4]!];
  return (
    <>
      <nav className="tabbar panel no-ticks" aria-label="Tabs">
        {tabs.map((n, i) => {
          if (!n) return <span key={i} className="tab-spacer" aria-hidden />;
          const active = isActive(n.href, loc);
          return (
            <Link key={n.key} href={n.href} aria-current={active ? 'page' : undefined}>
              {active && <m.span layoutId="tab-active" className="tab-active" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              {n.icon(tactical)}
              <span>{n.label(L)}</span>
              {n.key === 'inbox' && !!inbox?.length && <span className="badge">{inbox.length}</span>}
            </Link>
          );
        })}
        <button onClick={() => ui.more()} aria-label="More">
          <Ellipsis />
          <span>More</span>
        </button>
      </nav>
      <m.button className="fab" aria-label={L.newTask} onClick={() => ui.quickAdd()} whileTap={{ scale: 0.9 }}>
        <Plus strokeWidth={2.5} style={tactical ? { transform: 'rotate(0deg)' } : undefined} />
      </m.button>
    </>
  );
}

export function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { collapsed } = useUi();
  return (
    <div className={cx('app', collapsed && 'collapsed')}>
      <Sidebar />
      <div className="main">
        <TopBar />
        <main id="main" className={cx('content', wide && 'wide')}>{children}</main>
      </div>
      <TabBar />
    </div>
  );
}
