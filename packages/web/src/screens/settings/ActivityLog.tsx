import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Undo2 } from 'lucide-react';
import type { AuditEvent } from '@companybrain/types';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { qk, useMemberMap } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { Empty, SkeletonRows } from '../../components/ui';
import { sfx } from '../../lib/sfx';
import { ago, fmtDate, fmtTime } from '../../lib/time';
import { toast } from '../../lib/toast';

export function ActivityLog() {
  const qc = useQueryClient();
  const members = useMemberMap();
  const { data, isLoading } = useQuery({ queryKey: qk.audit, queryFn: () => api.audit.list({ limit: 100 }) });
  const undo = async (e: AuditEvent) => {
    try {
      const r = await api.audit.undo(e.id);
      qc.setQueryData<AuditEvent[]>(qk.audit, (old) => old?.map((x) => (x.id === r.id ? r : x)));
      sfx.undo();
      toast.success('Undone');
      void qc.invalidateQueries({ queryKey: qk.tasksAll });
      void qc.invalidateQueries({ queryKey: qk.briefing });
      void qc.invalidateQueries({ queryKey: qk.members });
    } catch (err) { toast.error(errorMessage(err)); }
  };
  return (
    <section className="panel">
      <div className="panel-head"><h2>Activity log</h2><span className="spacer" /><span className="faint" style={{ fontSize: 12 }}>Every change, by humans and agents. Undo what went wrong.</span></div>
      {isLoading && <SkeletonRows />}
      {data?.length === 0 && <Empty art="📜" title="No activity yet" />}
      {data?.map((e, i) => {
        const actor = members.get(e.actorId);
        return (
          <motion.div key={e.id} className="list-row" initial={{ opacity: 0 }} animate={{ opacity: e.undoneAt ? 0.55 : 1 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
            <Avatar member={actor} size={28} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, textDecoration: e.undoneAt ? 'line-through' : undefined }}>{e.summary}</div>
              <div className="faint" style={{ fontSize: 12 }}><span className="mono">{e.type}</span> · <span title={`${fmtDate(e.at)} ${fmtTime(e.at)}`}>{ago(e.at)}</span>{e.undoneAt ? ` · undone ${ago(e.undoneAt)}` : ''}</div>
            </div>
            {e.undoable && !e.undoneAt && <button className="btn btn-sm" onClick={() => void undo(e)}><Undo2 /> Undo</button>}
          </motion.div>
        );
      })}
    </section>
  );
}
