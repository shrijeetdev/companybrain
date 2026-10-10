import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { errorMessage, onUnauthorized } from './api/client';
import { useLiveStream } from './api/live';
import { makeQueryClient, qk, useAuth, useMe } from './api/queries';
import { SkeletonRows, Toaster } from './components/ui';
import { FxLayer } from './features/game/FxLayer';
import { TaskDrawerHost } from './features/tasks/TaskDrawer';
import { setSoundPref, sfx } from './lib/sfx';
import { setTheme } from './lib/theme';
import { setTimezone } from './lib/time';
import { toast } from './lib/toast';
import { ui } from './lib/ui';
import { Login, Setup, Splash } from './screens/Auth';
import { Inbox } from './screens/Inbox';
import { Projects } from './screens/Projects';
import { Tasks } from './screens/Tasks';
import { Team } from './screens/Team';
import { Today } from './screens/Today';
import { CommandPalette } from './shell/CommandPalette';
import { HelpModal, MoreSheet, QuickAddModal, useGlobalHotkeys } from './shell/Global';
import { Shell } from './shell/Shell';

const Armory = lazy(() => import('./screens/Armory').then((m) => ({ default: m.Armory })));
const Calendar = lazy(() => import('./screens/Calendar').then((m) => ({ default: m.Calendar })));
const Connect = lazy(() => import('./screens/Connect').then((m) => ({ default: m.Connect })));
const Leaderboard = lazy(() => import('./screens/Leaderboard').then((m) => ({ default: m.Leaderboard })));
const Pipeline = lazy(() => import('./screens/Pipeline').then((m) => ({ default: m.Pipeline })));
const Reports = lazy(() => import('./screens/Reports').then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));

const queryClient = makeQueryClient((e) => {
  sfx.error();
  toast.error(errorMessage(e));
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <AuthGate />
        <Toaster />
      </MotionConfig>
    </QueryClientProvider>
  );
}

function AuthGate() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useAuth();
  useEffect(() => onUnauthorized(() => void qc.invalidateQueries({ queryKey: qk.auth })), [qc]);
  if (isLoading) return <Splash />;
  if (error || !data) {
    return (
      <div className="splash">
        <div className="empty">
          <div className="empty-art">📡</div>
          <h3>Can’t reach companybrain</h3>
          <p>{errorMessage(error)}</p>
          <button className="btn" onClick={() => void refetch()}>Retry</button>
        </div>
      </div>
    );
  }
  if (data.needsSetup) return <Setup />;
  if (!data.authenticated || !data.member) return <Login />;
  return <AuthedApp key={data.member.id} />;
}

function AuthedApp() {
  const me = useMe();
  const [ready, setReady] = useState(false);
  // Member preferences drive timezone, theme and sound before first paint of the app.
  useEffect(() => {
    setTimezone(me.timezone);
    setTheme(me.prefs.theme === 'classic' ? 'classic' : 'tactical');
    setSoundPref(me.prefs.sound !== false);
    setReady(true);
  }, [me.timezone, me.prefs.theme, me.prefs.sound]);
  useLiveStream(me.id);
  useGlobalHotkeys();
  // PWA shortcut "New task" → /tasks?new=1
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') ui.quickAdd();
  }, []);
  if (!ready) return <Splash />;
  return (
    <>
      <Routes />
      <TaskDrawerHost />
      <CommandPalette />
      <QuickAddModal />
      <HelpModal />
      <MoreSheet />
      <FxLayer />
    </>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  return (
    <motion.div key={loc.split('/')[1] ?? ''} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

function TaskRoute({ id }: { id: string }) {
  useEffect(() => { ui.openTask(id); }, [id]);
  return <Redirect to={`/tasks?task=${encodeURIComponent(id)}`} replace />;
}

function Routes() {
  const [loc] = useLocation();
  if (loc === '/connect') return <Suspense fallback={<Splash />}><Connect /></Suspense>;
  return (
    <Shell wide={loc.startsWith('/tasks') && new URLSearchParams(window.location.search).get('view') === 'board'}>
      <AnimatePresence mode="wait" initial={false}>
        <Page key={loc.split('/')[1] ?? ''}>
          <Suspense fallback={<div className="panel"><SkeletonRows n={6} /></div>}>
          <Switch>
            <Route path="/" component={Today} />
            <Route path="/tasks/:id">{(p) => <TaskRoute id={p.id} />}</Route>
            <Route path="/tasks" component={Tasks} />
            <Route path="/projects">{() => <Projects />}</Route>
            <Route path="/projects/:id">{(p) => <Projects id={p.id} />}</Route>
            <Route path="/team">{() => <Team />}</Route>
            <Route path="/team/:id">{(p) => <Team id={p.id} />}</Route>
            <Route path="/inbox">{() => <Inbox />}</Route>
            <Route path="/calendar">{() => <Calendar />}</Route>
            <Route path="/pipeline">{() => <Pipeline />}</Route>
            <Route path="/reports">{() => <Reports />}</Route>
            <Route path="/armory">{() => <Armory />}</Route>
            <Route path="/leaderboard">{() => <Leaderboard />}</Route>
            <Route path="/settings">{() => <Settings />}</Route>
            <Route path="/settings/:section">{(p) => <Settings section={p.section} />}</Route>
            <Route>
              <div className="empty"><div className="empty-art">🧭</div><h3>Page not found</h3><a className="btn" href="/">Back to safety</a></div>
            </Route>
          </Switch>
          </Suspense>
        </Page>
      </AnimatePresence>
    </Shell>
  );
}
