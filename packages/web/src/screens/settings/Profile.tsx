import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useUpdateMe } from '../../api/me';
import { useMe } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { timezoneOptions } from '../../lib/time';
import { toast } from '../../lib/toast';
import { cx } from '../../lib/util';

const COLORS = ['#3b6ff6', '#7c5cff', '#e0559a', '#ef4444', '#f59e0b', '#16a34a', '#0ea5a4', '#06b6d4', '#64748b', '#1f2937'];

export function Profile() {
  const me = useMe();
  const updateMe = useUpdateMe();
  const [f, setF] = useState({ name: me.name, title: me.title ?? '', phone: me.phone ?? '', timezone: me.timezone });
  const [pw, setPw] = useState({ current: '', next: '' });
  const dirty = f.name !== me.name || f.title !== (me.title ?? '') || f.phone !== (me.phone ?? '') || f.timezone !== me.timezone;
  const save = async () => {
    const m = await updateMe({ name: f.name.trim(), title: f.title.trim() || null, phone: f.phone.trim() || null, timezone: f.timezone });
    if (m) toast.success('Profile saved');
  };
  const changePw = async () => {
    try { await api.me.password(pw.current, pw.next); setPw({ current: '', next: '' }); toast.success('Password changed — other sessions were signed out'); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="panel panel-pad stack">
        <div className="row" style={{ gap: 16 }}>
          <Avatar member={{ ...me, name: f.name || me.name }} size={64} />
          <div>
            <div className="field-label">Avatar color</div>
            <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {COLORS.map((c) => <button key={c} className={cx('swatch', me.color === c && 'on')} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={me.color === c} onClick={() => void updateMe({ color: c })} />)}
            </div>
          </div>
        </div>
        <div className="form-grid">
          <div className="field"><label htmlFor="pn">Name</label><input id="pn" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="pt">Title</label><input id="pt" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Founder & CEO" /></div>
          <div className="field"><label htmlFor="pp">WhatsApp number</label><input id="pp" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91 98200 11001" inputMode="tel" /><span className="field-hint">Messages from this number become your tasks.</span></div>
          <div className="field"><label htmlFor="ptz">Timezone</label><select id="ptz" className="select" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{timezoneOptions(f.timezone).map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
          <div className="field"><label>Email</label><input className="input" value={me.email ?? ''} disabled /><span className="field-hint">Ask an admin to change your login email.</span></div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={!dirty || !f.name.trim()} onClick={() => void save()}>Save changes</button></div>
      </section>
      <section className="panel panel-pad stack">
        <h3 style={{ fontSize: 15 }}>Password</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="pc">Current password</label><input id="pc" type="password" className="input" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
          <div className="field"><label htmlFor="pnw">New password</label><input id="pnw" type="password" className="input" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /><span className="field-hint">At least 8 characters.</span></div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" disabled={!pw.current || pw.next.length < 8} onClick={() => void changePw()}>Change password</button></div>
      </section>
    </div>
  );
}
