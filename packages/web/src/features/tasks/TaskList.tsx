import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { TaskView } from '@companybrain/types';
import { useMemberMap, useProjectMap } from '../../api/queries';
import { useLabels } from '../../lib/labels';
import { ui } from '../../lib/ui';
import { cx } from '../../lib/util';
import { useTaskActions } from './actions';
import { groupTasks } from './grouping';
import { TaskRow } from './TaskRow';

/** Shared completion behaviour: completed rows linger briefly (strike-through) before leaving. */
export function useCompletionToggle() {
  const { complete, reopen } = useTaskActions();
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((t: TaskView, el: HTMLElement) => {
    if (t.status === 'done') { void reopen(t); return; }
    setLingering((s) => new Set(s).add(t.id));
    window.setTimeout(() => setLingering((s) => { const n = new Set(s); n.delete(t.id); return n; }), 1300);
    void complete(t, el);
  }, [complete, reopen]);
  return { toggle, lingering };
}

interface ListProps {
  tasks: TaskView[];
  grouped?: boolean;
  showDone?: boolean;
  showProject?: boolean;
  selection?: ReadonlySet<string>;
  onSelect?: (t: TaskView, e: MouseEvent | KeyboardEvent) => void;
  emptyState?: React.ReactNode;
}

export function TaskList({ tasks, grouped = true, showDone = false, showProject = true, selection, onSelect, emptyState }: ListProps) {
  const L = useLabels();
  const members = useMemberMap();
  const projects = useProjectMap();
  const { toggle, lingering } = useCompletionToggle();
  const visible = useMemo(() => tasks.filter((t) => showDone || t.status !== 'done' || lingering.has(t.id)), [tasks, showDone, lingering]);
  const groups = useMemo(() => (grouped ? groupTasks(visible, L, { keepDoneIds: lingering }) : [{ key: 'all' as const, label: '', tasks: visible }]), [visible, grouped, L, lingering]);
  const selecting = !!selection && selection.size > 0;
  const open = useCallback((t: TaskView) => ui.openTask(t.id), []);

  if (!visible.length && emptyState) return <>{emptyState}</>;
  return (
    <div className="task-groups">
      <AnimatePresence initial={false}>
        {groups.map((g) => (
          <motion.section key={g.key} className="task-group" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-label={g.label || 'Tasks'}>
            {grouped && (
              <div className={cx('task-group-head', 'tone' in g && g.tone === 'danger' && 'tone-danger')}>
                {'tone' in g && g.tone === 'danger' && <span className="g-dot" />}
                <span>{g.label}</span>
                <span className="count num">{g.tasks.length}</span>
              </div>
            )}
            <div className="task-list" role="list">
              <AnimatePresence initial={false}>
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    members={members}
                    project={t.projectId ? projects.get(t.projectId) : undefined}
                    onOpen={open}
                    onToggle={toggle}
                    selected={selection?.has(t.id)}
                    selecting={selecting}
                    onSelect={onSelect}
                    showProject={showProject}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.section>
        ))}
      </AnimatePresence>
    </div>
  );
}
