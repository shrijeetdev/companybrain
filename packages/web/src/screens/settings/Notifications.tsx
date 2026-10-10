import { Crosshair, Play, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useUpdateMe } from '../../api/me';
import { useMe } from '../../api/queries';
import { Segmented, SettingRow, Switch } from '../../components/ui';
import { speakSample, useVoices } from '../../features/briefing/voice';
import { useLabels } from '../../lib/labels';
import { disablePush, enablePush, pushState, type PushState } from '../../lib/push';
import { sfx } from '../../lib/sfx';
import { setModePref, useTheme } from '../../lib/theme';
import { toast } from '../../lib/toast';

const hours = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => new Date(Date.UTC(2020, 0, 1, h)).toLocaleTimeString(undefined, { hour: 'numeric', timeZone: 'UTC' });

export function NotificationSettings() {
  const me = useMe();
  const L = useLabels();
  const updateMe = useUpdateMe();
  const { theme, modePref } = useTheme();
  const voices = useVoices().filter((v) => /^en/i.test(v.lang));
  const [push, setPush] = useState<PushState | 'loading'>('loading');
  useEffect(() => { void pushState().then(setPush).catch(() => setPush('unsupported')); }, []);
  const p = me.prefs;
  const set = (patch: Partial<typeof p>) => void updateMe({ prefs: patch });
  const togglePush = async (on: boolean) => {
    try {
      setPush('loading');
      setPush(on ? await enablePush() : await disablePush());
    } catch (e) { toast.error(errorMessage(e)); setPush(await pushState()); }
  };
  const test = async (channel: 'push' | 'whatsapp' | 'email') => {
    try { const r = await api.integrations.test(channel); if (r.ok) toast.success('Test sent — check your device'); else toast.error(r.error ?? 'Couldn’t send the test'); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="panel panel-pad">
        <h3 className="settings-h">Style</h3>
        <SettingRow title="Theme" desc={theme === 'tactical' ? 'Game mode — Missions, Operations, Squad, XP and rewards.' : 'Calm glass design with plain words. Rewards stay subtle.'}>
          <Segmented label="Theme" value={theme} onChange={(v) => set({ theme: v })} options={[{ value: 'tactical', label: 'Tactical', icon: <Crosshair /> }, { value: 'classic', label: 'Classic', icon: <Sparkles /> }]} />
        </SettingRow>
        <SettingRow title="Appearance" desc="Follow your device, or pin light / dark.">
          <Segmented label="Mode" value={modePref} onChange={setModePref} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </SettingRow>
        <SettingRow title="Sound effects" desc="Deploy blips, completion hits, level-up fanfare. Never before you interact.">
          <button className="btn btn-sm btn-ghost" onClick={() => sfx.levelUp()}><Play /> Preview</button>
          <Switch label="Sound effects" checked={p.sound !== false} onChange={(v) => set({ sound: v })} />
        </SettingRow>
      </section>

      <section className="panel panel-pad">
        <h3 className="settings-h">Daily {L.briefing.toLowerCase()}</h3>
        <SettingRow title="Voice" desc="Speak the briefing when you open the app each day (once per day), on demand, or never.">
          <Segmented label="Briefing voice" value={p.briefingVoice} onChange={(v) => set({ briefingVoice: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'button', label: 'Button' }, { value: 'off', label: 'Off' }]} />
        </SettingRow>
        <SettingRow title="Browser voice" desc="Used when the server has no text-to-speech provider.">
          <select className="select" style={{ width: 220 }} value={p.voiceName ?? ''} onChange={(e) => set({ voiceName: e.target.value || null })} aria-label="Voice">
            <option value="">Best available</option>
            {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
          <button className="btn btn-sm" onClick={() => speakSample(theme === 'tactical' ? `Incoming transmission. Good morning, ${me.name.split(' ')[0]}. Three missions due today.` : `Good morning, ${me.name.split(' ')[0]}. You have three tasks today.`, p.voiceName)}><Play /> Test voice</button>
        </SettingRow>
        <SettingRow title="Daily digest" desc="A summary on your channels at this hour (your timezone).">
          <select className="select" style={{ width: 150 }} value={p.digestHour ?? ''} onChange={(e) => set({ digestHour: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Digest hour">
            <option value="">Off</option>{hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </SettingRow>
      </section>

      <section className="panel panel-pad">
        <h3 className="settings-h">Channels</h3>
        <SettingRow title="Push notifications" desc={push === 'unsupported' ? 'Not supported in this browser. Install the app to your home screen on iOS.' : push === 'denied' ? 'Blocked in browser settings — allow notifications for this site.' : 'Reminders and mentions on this device, even when the app is closed.'}>
          {push === 'on' && <button className="btn btn-sm btn-ghost" onClick={() => void test('push')}>Send test</button>}
          <Switch label="Push notifications" checked={push === 'on'} disabled={push === 'loading' || push === 'unsupported' || push === 'denied'} onChange={(v) => void togglePush(v)} />
        </SettingRow>
        <SettingRow title="WhatsApp" desc={me.phone ? `Reminders to ${me.phone}.` : 'Add your number in Profile first.'}>
          {p.notifyWhatsapp && me.phone && <button className="btn btn-sm btn-ghost" onClick={() => void test('whatsapp')}>Send test</button>}
          <Switch label="WhatsApp notifications" checked={p.notifyWhatsapp} disabled={!me.phone} onChange={(v) => set({ notifyWhatsapp: v })} />
        </SettingRow>
        <SettingRow title="Email" desc={`To ${me.email ?? 'your email'}.`}>
          {p.notifyEmail && <button className="btn btn-sm btn-ghost" onClick={() => void test('email')}>Send test</button>}
          <Switch label="Email notifications" checked={p.notifyEmail} onChange={(v) => set({ notifyEmail: v })} />
        </SettingRow>
        <SettingRow title="Quiet hours" desc="Non-urgent notifications wait until quiet hours end.">
          <select className="select" style={{ width: 120 }} aria-label="Quiet from" value={p.quietStart ?? ''} onChange={(e) => set({ quietStart: e.target.value === '' ? null : Number(e.target.value) })}><option value="">Off</option>{hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
          <span className="faint">to</span>
          <select className="select" style={{ width: 120 }} aria-label="Quiet until" value={p.quietEnd ?? ''} disabled={p.quietStart === null} onChange={(e) => set({ quietEnd: e.target.value === '' ? null : Number(e.target.value) })}><option value="">—</option>{hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
        </SettingRow>
      </section>
    </div>
  );
}
