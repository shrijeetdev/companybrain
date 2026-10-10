// The drawer shell is always mounted; the (heavy) task detail is loaded on first open.
import { lazy, Suspense, useEffect } from 'react';
import { Drawer } from '../../components/Overlay';
import { SkeletonRows } from '../../components/ui';
import { ui, useUi } from '../../lib/ui';

const TaskDetail = lazy(() => import('./TaskDrawer').then((m) => ({ default: m.TaskDetail })));

export function TaskDrawerHost() {
  const { taskId } = useUi();
  // Open from ?task= on first load.
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get('task');
    if (id) ui.openTask(id);
  }, []);
  return (
    <Drawer open={!!taskId} onClose={() => ui.openTask(null)} label="Task details">
      {taskId && (
        <Suspense fallback={<div style={{ padding: 24 }}><SkeletonRows n={6} /></div>}>
          <TaskDetail id={taskId} />
        </Suspense>
      )}
    </Drawer>
  );
}
