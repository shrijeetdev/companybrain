import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Lead, LeadStage } from '@companybrain/types';
import { errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { qk, useMemberMap, useMembers } from '../api/queries';
import { Avatar } from '../components/Avatar';
import { ChannelIcon } from '../components/icons';
import { Modal } from '../components/Overlay';
import { Skeleton } from '../components/ui';
import { useLabels } from '../lib/labels';
import { sfx } from '../lib/sfx';
import { ago } from '../lib/time';
import { toast } from '../lib/toast';
import { cx } from '../lib/util';

const STAGES: { id: LeadStage; label: string; color: string }[] = [
  { id: 'new', label: 'New', color: 'var(--text-3)' },
  { id: 'contacted', label: 'Contacted', color: 'var(--info)' },
  { id: 'meeting', label: 'Meeting', color: 'var(--violet)' },
  { id: 'proposal', label: 'Proposal', color: 'var(--warning)' },
  { id: 'won', label: 'Won', color: 'var(--success)' },
  { id: 'lost', label: 'Lost', color: 'var(--danger)' },
];
const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function Pipeline() {
  const L = useLabels();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: qk.leads, queryFn: api.leads.list });
  const members = useMemberMap();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [edit, setEdit] = useState<Lead | 'new' | null>(null);
  const move = async (lead: Lead, stage: LeadStage) => {
    if (lead.stage === stage) return;
    qc.setQueryData<Lead[]>(qk.leads, (old) => old?.map((l) => (l.id === lead.id ? { ...l, stage } : l)));
    if (stage === 'won') { sfx.levelUp(); toast.success(`🎉 ${lead.company || lead.name} won!`); }
    try { await api.leads.update(lead.id, { stage }); } catch (e) { toast.error(errorMessage(e)); void qc.invalidateQueries({ queryKey: qk.leads }); }
  };
  const open = (data ?? []).filter((l) => l.stage !== 'won' && l.stage !== 'lost');
  const pipelineValue = open.reduce((s, l) => s + (l.value ?? 0), 0);
  const won = (data ?? []).filter((l) => l.stage === 'won').reduce((s, l) => s + (l.value ?? 0), 0);
  return (
    <>
      <div className="page-head">
        <div><h1>{L.pipeline}</h1><div className="sub">{open.length} open · {money(pipelineValue)} in play · {money(won)} won</div></div>
        <div className="actions"><button className="btn btn-primary" onClick={() => setEdit('new')}><Plus /> New lead</button></div>
      </div>
      <div className="board">
        {STAGES.map((s) => {
          const leads = (data ?? []).filter((l) => l.stage === s.id);
          const value = leads.reduce((a, l) => a + (l.value ?? 0), 0);
          return (
            <section key={s.id} className={cx('board-col panel', over === s.id && 'drop-target')} aria-label={s.label}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const l = data?.find((x) => x.id === dragId); if (l) void move(l, s.id); }}>
              <div className="board-col-head">
                <span className="dot" style={{ background: s.color }} />
                <span>{s.label}</span><span className="faint num">{leads.length}</span>
                <span className="grow" /><span className="faint num" style={{ fontSize: 12 }}>{value ? money(value) : ''}</span>
              </div>
              <div className="board-col-body">
                {isLoading && <Skeleton h={70} />}
                <AnimatePresence initial={false}>
                  {leads.map((l) => {
                    const owner = l.ownerId ? members.get(l.ownerId) : undefined;
                    const next = STAGES[STAGES.findIndex((x) => x.id === l.stage) + 1];
                    return (
                      <motion.div key={l.id} layout layoutId={`lead-${l.id}`} className="card lead-card" draggable
                        onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)} onClick={() => setEdit(l)}
                        tabIndex={0} role="button" aria-label={`${l.name}, ${l.company}`} onKeyDown={(e) => { if (e.key === 'Enter') setEdit(l); }}
                        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: dragId === l.id ? 0.4 : 1, scale: 1 }} exit={{ opacity: 0 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <b className="grow truncate" style={{ fontSize: 13.5 }}>{l.company || l.name}</b>
                          {l.value !== null && <span className="lead-value num">{money(l.value)}</span>}
                        </div>
                        <div className="card-foot">
                          <span className="truncate">{l.name}</span>
                          {l.source !== 'manual' && <ChannelIcon channel={l.source} size={12} />}
                          <span className="grow" />
                          <span>{ago(l.updatedAt)}</span>
                          {owner && <Avatar member={owner} size={20} />}
                          {next && s.id !== 'won' && (
                            <button className="icon-btn icon-btn-sm" aria-label={`Move to ${next.label}`} title={`Move to ${next.label}`} onClick={(e) => { e.stopPropagation(); void move(l, next.id); }}><ChevronRight /></button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {!isLoading && leads.length === 0 && <div className="board-empty">Drop here</div>}
              </div>
            </section>
          );
        })}
      </div>
      <LeadModal lead={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function LeadModal({ lead, onClose }: { lead: Lead | 'new' | null; onClose: () => void }) {
  return (
    <Modal open={lead !== null} onClose={onClose} title={lead === 'new' ? 'New lead' : lead ? lead.company || lead.name : ''} width={520}>
      {lead !== null && <LeadForm lead={lead === 'new' ? null : lead} onClose={onClose} />}
    </Modal>
  );
}

function LeadForm({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: members } = useMembers();
  const [f, setF] = useState({ name: lead?.name ?? '', company: lead?.company ?? '', email: lead?.email ?? '', phone: lead?.phone ?? '', value: lead?.value?.toString() ?? '', stage: lead?.stage ?? 'new' as LeadStage, ownerId: lead?.ownerId ?? '', notes: lead?.notes ?? '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const body = { ...f, value: f.value ? Number(f.value) : null, ownerId: f.ownerId || null };
    try {
      if (lead) await api.leads.update(lead.id, body); else await api.leads.create({ ...body, name: f.name.trim() });
      void qc.invalidateQueries({ queryKey: qk.leads });
      onClose();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const remove = async () => {
    if (!lead || !window.confirm(`Delete ${lead.name}?`)) return;
    try { await api.leads.remove(lead.id); void qc.invalidateQueries({ queryKey: qk.leads }); onClose(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <>
      <div className="modal-body">
        <div className="two-col" style={{ gap: 10 }}>
          <div className="field"><label htmlFor="ln">Contact name</label><input id="ln" className="input" autoFocus value={f.name} onChange={set('name')} /></div>
          <div className="field"><label htmlFor="lc">Company</label><input id="lc" className="input" value={f.company} onChange={set('company')} /></div>
          <div className="field"><label htmlFor="le">Email</label><input id="le" className="input" type="email" value={f.email} onChange={set('email')} /></div>
          <div className="field"><label htmlFor="lp">Phone</label><input id="lp" className="input" value={f.phone} onChange={set('phone')} /></div>
          <div className="field"><label htmlFor="lv">Deal value</label><input id="lv" className="input" inputMode="numeric" value={f.value} onChange={set('value')} placeholder="25000" /></div>
          <div className="field"><label htmlFor="ls">Stage</label><select id="ls" className="select" value={f.stage} onChange={set('stage')}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div className="field"><label htmlFor="lo">Owner</label><select id="lo" className="select" value={f.ownerId} onChange={set('ownerId')}><option value="">Unassigned</option>{(members ?? []).filter((m) => m.kind === 'human').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="lno">Notes</label><textarea id="lno" className="textarea" rows={3} value={f.notes} onChange={set('notes')} /></div>
      </div>
      <div className="modal-foot">
        {lead && <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={() => void remove()}><Trash2 /> Delete</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!f.name.trim()} onClick={() => void save()}>{lead ? 'Save' : 'Add lead'}</button>
      </div>
    </>
  );
}
