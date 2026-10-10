import { Bell, Bot, Building2, CalendarDays, History, Plug, User, Users } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'wouter';
import { SkeletonRows } from '../components/ui';
import { useMe } from '../api/queries';
import { useLabels } from '../lib/labels';
import { cx } from '../lib/util';

const ActivityLog = lazy(() => import('./settings/ActivityLog').then((m) => ({ default: m.ActivityLog })));
const AiSettings = lazy(() => import('./settings/AiSettings').then((m) => ({ default: m.AiSettings })));
const CalendarFeeds = lazy(() => import('./settings/CalendarFeeds').then((m) => ({ default: m.CalendarFeeds })));
const IntegrationsSettings = lazy(() => import('./settings/Integrations').then((m) => ({ default: m.IntegrationsSettings })));
const NotificationSettings = lazy(() => import('./settings/Notifications').then((m) => ({ default: m.NotificationSettings })));
const OrgSettingsPanel = lazy(() => import('./settings/Org').then((m) => ({ default: m.OrgSettingsPanel })));
const Profile = lazy(() => import('./settings/Profile').then((m) => ({ default: m.Profile })));
const TeamRoles = lazy(() => import('./settings/TeamRoles').then((m) => ({ default: m.TeamRoles })));

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: <User />, admin: false },
  { id: 'notifications', label: 'Notifications & voice', icon: <Bell />, admin: false },
  { id: 'calendar', label: 'Calendar feeds', icon: <CalendarDays />, admin: false },
  { id: 'ai', label: 'AI & API keys', icon: <Bot />, admin: false },
  { id: 'team', label: 'Team & roles', icon: <Users />, admin: true },
  { id: 'integrations', label: 'Integrations', icon: <Plug />, admin: true },
  { id: 'org', label: 'Organization', icon: <Building2 />, admin: true },
  { id: 'activity', label: 'Activity log', icon: <History />, admin: false },
] as const;

export function Settings({ section = 'profile' }: { section?: string }) {
  const me = useMe();
  const L = useLabels();
  const isAdmin = me.role === 'owner' || me.role === 'admin';
  const visible = SECTIONS.filter((s) => !s.admin || isAdmin || (s.id === 'team' && me.role === 'manager'));
  const cur = visible.find((s) => s.id === section) ?? visible[0]!;
  return (
    <>
      <div className="page-head"><div><h1>{L.settings}</h1><div className="sub">{cur.label}</div></div></div>
      <div className="settings">
        <nav className="settings-nav" aria-label="Settings sections">
          {visible.map((s) => (
            <Link key={s.id} href={`/settings/${s.id}`} className={cx('settings-link', s.id === cur.id && 'on')} aria-current={s.id === cur.id ? 'page' : undefined}>
              {s.icon}<span>{s.id === 'ai' ? `${L.agents} & API keys` : s.label}</span>
            </Link>
          ))}
        </nav>
        <div className="settings-body" key={cur.id}>
          <Suspense fallback={<div className="panel panel-pad"><SkeletonRows n={5} /></div>}>
          {cur.id === 'profile' && <Profile />}
          {cur.id === 'notifications' && <NotificationSettings />}
          {cur.id === 'calendar' && <CalendarFeeds />}
          {cur.id === 'ai' && <AiSettings />}
          {cur.id === 'team' && <TeamRoles />}
          {cur.id === 'integrations' && <IntegrationsSettings />}
          {cur.id === 'org' && <OrgSettingsPanel />}
          {cur.id === 'activity' && <ActivityLog />}
          </Suspense>
        </div>
      </div>
    </>
  );
}
