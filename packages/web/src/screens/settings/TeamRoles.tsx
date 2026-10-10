import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, UserMinus, UserPlus, UserCheck } from 'lucide-react';
import { useState } from 'react';
import type { Member, Role } from '@companybrain/types';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { qk, useMe } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { Modal } from '../../components/Overlay';
import { PhoneField, phoneProblem, phoneServerError } from '../../components/PhoneField';
import { useLabels } from '../../lib/labels';
import { TIMEZONES, getTimezone } from '../../lib/time';
import { toast } from '../../lib/toast';
import { cx } from '../../lib/util';

const ROLES: { id: Role; label: string; desc: string }[] = [
  { id: 'owner', label: 'Owner', desc: 'Everything, including billing-level settings' },
  { id: 'admin', label: 'Admin', desc: 'Manage people, roles, integrations, org' },
  { id: 'manager', label: 'Manager', desc: 'Projects, agents & keys, sees the whole team' },
  { id: 'member', label: 'Member', desc: 'Own and shared work' },
  { id: 'guest', label: 'Guest', desc: 'Read-only on their projects' },
];

export function TeamRoles() {
  const L = useLabels();
  const me = useMe();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: qk.membersAll, queryFn: () => api.members.list({ includeInactive: true, kind: 'human' }) });
  const [invite, setInvite] = useState(false);
  const [reset, setReset] = useState<Member | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const isAdmin = me.role === 'owner' || me.role === 'admin';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['members'] }); };
  const patch = async (m: Member, p: Partial<Member>) => {
    try { await api.members.update(m.id, p as never); refresh(); toast.success(`Updated ${m.name.split(' ')[0]}`); } catch (e) { toast.error(errorMessage(e)); }
  };
  const deactivate = async (m: Member) => {
    if (!window.confirm(`Deactivate ${m.name}? They’ll be signed out and their API keys revoked. Their tasks stay.`)) return;
    try { await api.members.remove(m.id); refresh(); toast(`${m.name} deactivated`); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <section className="panel">
      <div className="panel-head"><h2>{L.team} & roles</h2><span className="spacer" />{isAdmin && <button className="btn btn-sm btn-primary" onClick={() => setInvite(true)}><UserPlus /> Add person</button>}</div>
      {(data ?? []).map((m) => (
        <div key={m.id} className={cx('list-row', !m.active && 'inactive')}>
          <Avatar member={m} size={34} />
          <div className="grow" style={{ minWidth: 0 }}>
            <b>{m.name}</b>{m.id === me.id && <span className="faint"> (you)</span>}{!m.active && <span className="chip" style={{ marginLeft: 6 }}>Inactive</span>}
            <div className="faint truncate" style={{ fontSize: 12.5 }}>{m.email}{m.title ? ` · ${m.title}` : ''}{m.phone ? ` · ${m.phone}` : ''}</div>
          </div>
          <select className="select" style={{ width: 130, height: 34 }} aria-label={`Role for ${m.name}`} value={m.role} disabled={!isAdmin || m.id === me.id || (m.role === 'owner' && me.role !== 'owner')}
            onChange={(e) => void patch(m, { role: e.target.value as Role })}>
            {ROLES.filter((r) => r.id !== 'owner' || me.role === 'owner').map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {isAdmin && m.id !== me.id && (
            <>
              <button className="icon-btn icon-btn-sm" title="Edit details" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)}><Pencil /></button>
              <button className="icon-btn icon-btn-sm" title="Reset password" aria-label={`Reset password for ${m.name}`} onClick={() => setReset(m)}><KeyRound /></button>
              {m.active
                ? <button className="icon-btn icon-btn-sm" title="Deactivate" aria-label={`Deactivate ${m.name}`} onClick={() => void deactivate(m)}><UserMinus /></button>
                : <button className="icon-btn icon-btn-sm" title="Reactivate" aria-label={`Reactivate ${m.name}`} onClick={() => void patch(m, { active: true })}><UserCheck /></button>}
            </>
          )}
        </div>
      ))}
      <InviteModal open={invite} onClose={() => setInvite(false)} onDone={refresh} />
      <ResetModal member={reset} onClose={() => setReset(null)} />
      <EditModal member={editing} onClose={() => setEditing(null)} onDone={refresh} />
    </section>
  );
}

function InviteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const me = useMe();
  const [f, setF] = useState({ name: '', email: '', title: '', phone: '', role: 'member' as Role, password: '', timezone: getTimezone() });
  const [busy, setBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const create = async () => {
    setBusy(true);
    setPhoneErr(null);
    try {
      await api.members.create({ kind: 'human', role: f.role, name: f.name.trim(), email: f.email.trim(), title: f.title || null, phone: f.phone.trim() || null, password: f.password, timezone: f.timezone });
      toast.success(`${f.name} added — share their email and temporary password with them`);
      onDone();
      onClose();
      setF({ ...f, name: '', email: '', title: '', phone: '', password: '' });
    } catch (e) {
      const msg = phoneServerError(e);
      if (msg) setPhoneErr(msg); else toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };
  const gen = () => setF({ ...f, password: Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('') });
  return (
    <Modal open={open} onClose={onClose} title="Add a person" width={560}>
      <div className="modal-body">
        <div className="form-grid">
          <div className="field"><label htmlFor="in">Name</label><input id="in" className="input" autoFocus value={f.name} onChange={set('name')} /></div>
          <div className="field"><label htmlFor="ie">Email (login)</label><input id="ie" className="input" type="email" value={f.email} onChange={set('email')} /></div>
          <div className="field"><label htmlFor="it">Title</label><input id="it" className="input" value={f.title} onChange={set('title')} /></div>
          <PhoneField id="ip" value={f.phone} onChange={(phone) => { setF({ ...f, phone }); setPhoneErr(null); }} serverError={phoneErr} />
          <div className="field"><label htmlFor="ir">Role</label><select id="ir" className="select" value={f.role} onChange={set('role')}>{ROLES.filter((r) => r.id !== 'owner' || me.role === 'owner').map((r) => <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>)}</select></div>
          <div className="field"><label htmlFor="itz">Timezone</label><select id="itz" className="select" value={f.timezone} onChange={set('timezone')}>{TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="ipw">Temporary password</label><div className="input-row"><input id="ipw" className="input mono" value={f.password} onChange={set('password')} minLength={8} /><button className="btn" type="button" onClick={gen}>Generate</button></div></div>
        </div>
      </div>
      <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name.trim() || !f.email.includes('@') || f.password.length < 8 || !!phoneProblem(f.phone)} onClick={() => void create()}>Add person</button></div>
    </Modal>
  );
}

function EditModal({ member, onClose, onDone }: { member: Member | null; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={!!member} onClose={onClose} title={member ? `Edit · ${member.name}` : 'Edit'} width={520}>
      {member && <EditForm key={member.id} member={member} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function EditForm({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: member.name, title: member.title ?? '', phone: member.phone ?? '', timezone: member.timezone });
  const [busy, setBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const dirty = f.name !== member.name || f.title !== (member.title ?? '') || f.phone !== (member.phone ?? '') || f.timezone !== member.timezone;
  const save = async () => {
    setBusy(true);
    setPhoneErr(null);
    try {
      await api.members.update(member.id, { name: f.name.trim(), title: f.title.trim() || null, phone: f.phone.trim() || null, timezone: f.timezone });
      toast.success(`Updated ${f.name.trim().split(' ')[0]}`);
      onDone();
      onClose();
    } catch (e) {
      const msg = phoneServerError(e);
      if (msg) setPhoneErr(msg); else toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };
  return (
    <>
      <div className="modal-body">
        <div className="form-grid">
          <div className="field"><label htmlFor="en">Name</label><input id="en" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="et">Title</label><input id="et" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <PhoneField id="ep" value={f.phone} onChange={(phone) => { setF({ ...f, phone }); setPhoneErr(null); }} serverError={phoneErr} />
          <div className="field"><label htmlFor="etz">Timezone</label><select id="etz" className="select" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{[...new Set([f.timezone, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        </div>
      </div>
      <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !dirty || !f.name.trim() || !!phoneProblem(f.phone)} onClick={() => void save()}>Save</button></div>
    </>
  );
}

function ResetModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const save = async () => {
    if (!member) return;
    try { await api.members.setPassword(member.id, pw); toast.success(`Password reset — ${member.name.split(' ')[0]} was signed out everywhere`); setPw(''); onClose(); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Modal open={!!member} onClose={onClose} title={`Reset password${member ? ` · ${member.name}` : ''}`} width={440}>
      <div className="modal-body"><div className="field"><label htmlFor="rp">New password</label><input id="rp" className="input" type="text" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} /></div></div>
      <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pw.length < 8} onClick={() => void save()}>Reset</button></div>
    </Modal>
  );
}
