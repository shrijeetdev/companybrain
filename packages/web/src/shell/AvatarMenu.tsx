import { useQuery } from '@tanstack/react-query';
import { Crosshair, Keyboard, LogOut, Monitor, Moon, Package, Settings, Sparkles, Sun, Trophy, Volume2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { api } from '../api/endpoints';
import { useLogout, useUpdateMe } from '../api/me';
import { qk, useMe } from '../api/queries';
import { Avatar } from '../components/Avatar';
import { MenuList, Popover } from '../components/Overlay';
import { Segmented, Switch } from '../components/ui';
import { useLabels } from '../lib/labels';
import { setModePref, useTheme } from '../lib/theme';
import { ui } from '../lib/ui';

export function AvatarMenu() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const { theme, modePref } = useTheme();
  const updateMe = useUpdateMe();
  const logout = useLogout();
  const L = useLabels();
  const [, navigate] = useLocation();
  const { data: profile } = useQuery({ queryKey: qk.game.profile(me.id), queryFn: () => api.game.profile(), staleTime: 60_000 });
  const close = () => setOpen(false);
  return (
    <>
      <button ref={ref} className="icon-btn" style={{ width: 40, height: 40 }} aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar member={me} size={30} />
      </button>
      <Popover open={open} onClose={close} anchor={ref} placement="bottom-end" width={290} label="Account">
        <div className="row" style={{ padding: '10px 10px 12px', gap: 12 }}>
          <Avatar member={me} size={40} frame={profile?.equipped.frame} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 650 }} className="truncate">{me.name}</div>
            <div className="faint truncate" style={{ fontSize: 12 }}>{profile?.equipped.title ?? me.email}</div>
          </div>
        </div>
        <div className="menu-sep" />
        <div style={{ padding: '8px 10px', display: 'grid', gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="field-label">Style</span>
            <Segmented label="Theme" value={theme} onChange={(v) => void updateMe({ prefs: { theme: v } })}
              options={[{ value: 'tactical', label: 'Tactical', icon: <Crosshair /> }, { value: 'classic', label: 'Classic', icon: <Sparkles /> }]} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="field-label">Mode</span>
            <Segmented label="Color mode" value={modePref} onChange={setModePref}
              options={[{ value: 'system', label: '', icon: <Monitor />, title: 'System' }, { value: 'light', label: '', icon: <Sun />, title: 'Light' }, { value: 'dark', label: '', icon: <Moon />, title: 'Dark' }]} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="field-label row" style={{ gap: 6 }}><Volume2 size={14} /> Sound effects</span>
            <Switch label="Sound effects" checked={me.prefs.sound !== false} onChange={(v) => void updateMe({ prefs: { sound: v } })} />
          </div>
        </div>
        <div className="menu-sep" />
        <MenuList onDone={close} items={[
          { key: 'armory', label: L.armory, icon: <Package />, onSelect: () => navigate('/armory') },
          { key: 'lb', label: L.leaderboard, icon: <Trophy />, onSelect: () => navigate('/leaderboard') },
          { key: 'settings', label: L.settings, icon: <Settings />, onSelect: () => navigate('/settings') },
          { key: 'keys', label: 'Keyboard shortcuts', icon: <Keyboard />, right: '?', onSelect: () => ui.help() },
          'sep',
          { key: 'out', label: 'Sign out', icon: <LogOut />, onSelect: () => void logout() },
        ]} />
      </Popover>
    </>
  );
}
