import {
  BarChart3, CalendarDays, Crosshair, FileBarChart, FolderKanban, House, Inbox, Kanban, ListChecks, Map, Package, Radar,
  Satellite, Settings, Shield, Target, Trophy, Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Labels } from '../lib/labels';

export interface NavItem { key: string; href: string; label: (L: Labels) => string; icon: (tactical: boolean) => ReactNode; game?: boolean; managerOnly?: boolean; hotkey?: string }

export const NAV: NavItem[] = [
  { key: 'today', href: '/', label: (L) => L.today, icon: (t) => (t ? <Radar /> : <House />), hotkey: 'H' },
  { key: 'tasks', href: '/tasks', label: (L) => L.tasks, icon: (t) => (t ? <Crosshair /> : <ListChecks />), hotkey: 'T' },
  { key: 'projects', href: '/projects', label: (L) => L.projects, icon: (t) => (t ? <Map /> : <FolderKanban />), hotkey: 'P' },
  { key: 'team', href: '/team', label: (L) => L.team, icon: (t) => (t ? <Shield /> : <Users />), hotkey: 'M' },
  { key: 'inbox', href: '/inbox', label: (L) => L.inbox, icon: (t) => (t ? <Satellite /> : <Inbox />), hotkey: 'I' },
  { key: 'calendar', href: '/calendar', label: (L) => L.calendar, icon: () => <CalendarDays />, hotkey: 'C' },
  { key: 'pipeline', href: '/pipeline', label: (L) => L.pipeline, icon: (t) => (t ? <Target /> : <Kanban />), hotkey: 'L' },
  { key: 'reports', href: '/reports', label: (L) => L.reports, icon: (t) => (t ? <FileBarChart /> : <BarChart3 />), hotkey: 'R' },
];
export const GAME_NAV: NavItem[] = [
  { key: 'armory', href: '/armory', label: (L) => L.armory, icon: () => <Package />, game: true, hotkey: 'A' },
  { key: 'leaderboard', href: '/leaderboard', label: (L) => L.leaderboard, icon: () => <Trophy />, game: true, hotkey: 'B' },
];
export const SETTINGS_NAV: NavItem = { key: 'settings', href: '/settings', label: (L) => L.settings, icon: () => <Settings />, hotkey: 'S' };

export function isActive(href: string, loc: string): boolean {
  if (href === '/') return loc === '/';
  return loc === href || loc.startsWith(href + '/');
}
