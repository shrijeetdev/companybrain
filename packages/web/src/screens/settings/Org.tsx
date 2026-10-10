import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { OrgSettings } from '@companybrain/types';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { qk, useOrg } from '../../api/queries';
import { SettingRow, Spinner, Switch } from '../../components/ui';
import { offsetText } from '../../features/tasks/QuickAdd';
import { useLabels } from '../../lib/labels';
import { timezoneOptions } from '../../lib/time';
import { toast } from '../../lib/toast';
import { cx } from '../../lib/util';

const hourLabel = (h: number) => new Date(Date.UTC(2020, 0, 1, h)).toLocaleTimeString(undefined, { hour: 'numeric', timeZone: 'UTC' });
const OFFSETS = [10080, 2880, 1440, 180, 60, 30, 15, 0];

export function OrgSettingsPanel() {
  const L = useLabels();
  const qc = useQueryClient();
  const { data: org } = useOrg();
  const [f, setF] = useState<OrgSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (org) setF(org); }, [org]);
  if (!f || !org) return <div className="panel panel-pad"><Spinner /></div>;
  const dirty = JSON.stringify(f) !== JSON.stringify(org);
  const save = async () => {
    setBusy(true);
    try {
      const { id: _i, createdAt: _c, updatedAt: _u, ...patch } = f;
      const o = await api.org.update(patch);
      qc.setQueryData(qk.org, o);
      toast.success('Organization updated');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <section className="panel panel-pad">
      <SettingRow title="Company name"><input className="input" style={{ width: 240 }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Company name" /></SettingRow>
      <SettingRow title="Timezone" desc="Default for new people, digests and “end of day”.">
        <select className="select" style={{ width: 240 }} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} aria-label="Timezone">{timezoneOptions(f.timezone).map((t) => <option key={t} value={t}>{t}</option>)}</select>
      </SettingRow>
      <SettingRow title="Workday" desc="All-day tasks are due at the end of the workday.">
        <select className="select" style={{ width: 110 }} value={f.workdayStart} onChange={(e) => setF({ ...f, workdayStart: Number(e.target.value) })} aria-label="Workday start">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
        <span className="faint">to</span>
        <select className="select" style={{ width: 110 }} value={f.workdayEnd} onChange={(e) => setF({ ...f, workdayEnd: Number(e.target.value) })} aria-label="Workday end">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
      </SettingRow>
      <SettingRow title="Default reminders" desc={`Applied to every ${L.taskLower} with a deadline unless it overrides them.`}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', maxWidth: 360, justifyContent: 'flex-end' }}>
          {OFFSETS.map((o) => {
            const on = f.defaultReminderOffsets.includes(o);
            return <button key={o} className={cx('chip chip-btn', on && 'active')} aria-pressed={on} onClick={() => setF({ ...f, defaultReminderOffsets: on ? f.defaultReminderOffsets.filter((x) => x !== o) : [...f.defaultReminderOffsets, o].sort((a, b) => b - a) })}>{offsetText(o)}</button>;
          })}
        </div>
      </SettingRow>
      <SettingRow title="Escalate overdue work" desc="Tell the creator / supervisor when something stays overdue.">
        <select className="select" style={{ width: 180 }} value={f.escalateAfterMin ?? ''} onChange={(e) => setF({ ...f, escalateAfterMin: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Escalate after">
          <option value="">Never</option><option value={240}>After 4 hours</option><option value={1440}>After 1 day</option><option value={2880}>After 2 days</option><option value={10080}>After 1 week</option>
        </select>
      </SettingRow>
      <SettingRow title={`${L.agent} stale after`} desc="Flag an agent’s task when it goes quiet this long.">
        <select className="select" style={{ width: 180 }} value={f.agentStaleAfterMin} onChange={(e) => setF({ ...f, agentStaleAfterMin: Number(e.target.value) })} aria-label="Agent stale threshold">
          {[60, 120, 240, 480, 1440].map((m) => <option key={m} value={m}>{m < 1440 ? `${m / 60} hours` : '1 day'}</option>)}
        </select>
      </SettingRow>
      <SettingRow title="Auto-reply to unknown senders" desc="Acknowledge WhatsApp/email from people outside the team.">
        <Switch label="Auto-reply" checked={f.intakeAutoAck} onChange={(v) => setF({ ...f, intakeAutoAck: v })} />
      </SettingRow>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14, gap: 8 }}>
        {dirty && <button className="btn" onClick={() => setF(org)}>Discard</button>}
        <button className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>{busy && <Spinner />}Save</button>
      </div>
    </section>
  );
}
