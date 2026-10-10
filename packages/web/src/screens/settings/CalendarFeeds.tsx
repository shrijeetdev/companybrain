import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { qk } from '../../api/queries';
import { Empty, Spinner } from '../../components/ui';
import { ago } from '../../lib/time';
import { toast } from '../../lib/toast';

export function CalendarFeeds() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: qk.feeds, queryFn: api.feeds.list });
  const [f, setF] = useState({ name: 'Google Calendar', url: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: qk.feeds }); void qc.invalidateQueries({ queryKey: qk.meetingsAll }); void qc.invalidateQueries({ queryKey: qk.briefing }); };
  const add = async () => {
    setBusy('add');
    try { await api.feeds.add(f.name.trim() || 'Calendar', f.url.trim()); setF({ name: 'Google Calendar', url: '' }); toast.success('Calendar connected — syncing now'); refresh(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const sync = async (id: string) => { setBusy(id); try { await api.feeds.sync(id); toast.success('Synced'); refresh(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } };
  const remove = async (id: string) => { try { await api.feeds.remove(id); refresh(); } catch (e) { toast.error(errorMessage(e)); } };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="panel">
        <div className="panel-head"><h2>Your calendar feeds</h2></div>
        {data?.length === 0 && <Empty art="🗓️" title="No calendars connected">Add your private ICS link and meetings show up on Today and in the briefing.</Empty>}
        {data?.map((c) => (
          <div key={c.id} className="list-row">
            <CalendarDays size={18} style={{ color: 'var(--accent-2)' }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{c.name}</b>
              <div className="faint truncate mono" style={{ fontSize: 12 }}>{c.urlMasked}</div>
              <div style={{ fontSize: 12, color: c.lastError ? 'var(--danger)' : 'var(--text-3)' }}>{c.lastError ?? (c.lastSyncAt ? `Synced ${ago(c.lastSyncAt)} · every 15 min` : 'Not synced yet')}</div>
            </div>
            <button className="btn btn-sm" onClick={() => void sync(c.id)} disabled={busy === c.id}>{busy === c.id ? <Spinner /> : <RefreshCw />} Sync</button>
            <button className="icon-btn icon-btn-sm" aria-label={`Remove ${c.name}`} onClick={() => void remove(c.id)}><Trash2 /></button>
          </div>
        ))}
      </section>
      <section className="panel panel-pad stack">
        <h3 className="settings-h">Add a calendar</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="fn">Name</label><input id="fn" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label htmlFor="fu">Private ICS address</label><input id="fu" className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics" /></div>
        </div>
        <details className="howto">
          <summary>Where do I find this link?</summary>
          <ul>
            <li><b>Google Calendar</b>: Settings → your calendar → Integrate calendar → “Secret address in iCal format”.</li>
            <li><b>Outlook</b>: Settings → Calendar → Shared calendars → Publish a calendar → ICS link.</li>
            <li><b>Apple iCloud</b>: Calendar app → share calendar → Public Calendar → copy link (replace webcal:// with https://).</li>
          </ul>
          <p className="faint">The link is stored encrypted and never shown in full again.</p>
        </details>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={!f.url.trim() || busy === 'add'} onClick={() => void add()}>{busy === 'add' ? <Spinner /> : <Plus />} Connect calendar</button></div>
      </section>
    </div>
  );
}
