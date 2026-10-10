import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, Globe, Lock, Mail, User } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import { api, type AuthState } from '../api/endpoints';
import { qk } from '../api/queries';
import { BrandMark } from '../components/icons';
import { Spinner } from '../components/ui';
import { useLabels } from '../lib/labels';
import { useTheme } from '../lib/theme';
import { browserTimezone, TIMEZONES } from '../lib/time';
import { cx } from '../lib/util';

function AuthFrame({ children, kicker }: { children: ReactNode; kicker: string }) {
  const { tactical } = useTheme();
  const L = useLabels();
  return (
    <div className="auth">
      {tactical && <div className="radar" aria-hidden><span className="radar-sweep" /><span className="radar-rings" /></div>}
      {!tactical && <div className="auth-blobs" aria-hidden><i /><i /><i /></div>}
      <motion.div className="auth-card panel" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
        <div className="auth-brand">
          <BrandMark size={48} />
          <div>
            <div className="brand" style={{ fontSize: 22 }}><span>company<b>brain</b></span></div>
            <div className="faint" style={{ fontSize: 13 }}>{L.brandTag}</div>
          </div>
        </div>
        <div className="eyebrow auth-kicker">{kicker}</div>
        {children}
      </motion.div>
      <div className="auth-foot faint">Humans and AI agents, one team. Nothing forgotten.</div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className="field auth-field">
      <span>{label}</span>
      <span className="auth-input">{icon}{children}</span>
    </label>
  );
}

function useSignedIn() {
  const qc = useQueryClient();
  return async () => {
    try { sessionStorage.setItem('cb.justLoggedIn', '1'); } catch { /* ignore */ }
    const state = await api.auth.state();
    qc.setQueryData<AuthState>(qk.auth, state);
  };
}

export function Login() {
  const { tactical } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = useSignedIn();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.login(email.trim(), password);
      await signedIn();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <AuthFrame kicker={tactical ? 'Secure uplink · Identify yourself' : 'Welcome back'}>
      <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
        <Field label="Email" icon={<Mail />}>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
        </Field>
        <Field label="Password" icon={<Lock />}>
          <input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          <button type="button" className="icon-btn icon-btn-sm" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff /> : <Eye />}</button>
        </Field>
        <AnimatePresence>
          {error && <motion.div className="auth-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>{error}</motion.div>}
        </AnimatePresence>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <Spinner /> : null}{tactical ? 'Deploy' : 'Sign in'} {!busy && <ArrowRight />}
        </button>
      </form>
    </AuthFrame>
  );
}

export function Setup() {
  const { tactical } = useTheme();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ orgName: '', timezone: browserTimezone(), name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = useSignedIn();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (step === 0) { setStep(1); return; }
    setBusy(true);
    setError(null);
    try {
      await api.auth.setup({ ...form, orgName: form.orgName.trim(), name: form.name.trim(), email: form.email.trim() });
      await signedIn();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <AuthFrame kicker={tactical ? `Establish base · Step ${step + 1} of 2` : `Set up · Step ${step + 1} of 2`}>
      <div className="steps" aria-hidden>{[0, 1].map((i) => <span key={i} className={cx(i <= step && 'on')} />)}</div>
      <form onSubmit={submit} className="stack" style={{ gap: 14, overflow: 'hidden' }}>
        <AnimatePresence mode="wait" initial={false}>
          {step === 0 ? (
            <motion.div key="s0" className="stack" style={{ gap: 14 }} initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: 0.22 }}>
              <h2 className="auth-h">Name your company</h2>
              <Field label="Company name" icon={<Building2 />}>
                <input required value={form.orgName} onChange={set('orgName')} placeholder="Vexocore" autoFocus />
              </Field>
              <Field label="Timezone" icon={<Globe />}>
                <select value={form.timezone} onChange={set('timezone')} aria-label="Timezone">
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </Field>
              <p className="faint" style={{ fontSize: 12.5 }}>We detected your timezone automatically. Reminders and “end of day” use it.</p>
            </motion.div>
          ) : (
            <motion.div key="s1" className="stack" style={{ gap: 14 }} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 30, opacity: 0 }} transition={{ duration: 0.22 }}>
              <h2 className="auth-h">Create your owner account</h2>
              <Field label="Your name" icon={<User />}><input required value={form.name} onChange={set('name')} placeholder="Shrijeet Mehta" autoFocus autoComplete="name" /></Field>
              <Field label="Email" icon={<Mail />}><input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" autoComplete="email" /></Field>
              <Field label="Password" icon={<Lock />}><input type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="At least 8 characters" autoComplete="new-password" /></Field>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <div className="row">
          {step === 1 && <button type="button" className="btn btn-lg" onClick={() => setStep(0)}><ArrowLeft /> Back</button>}
          <button className="btn btn-primary btn-lg grow" disabled={busy || (step === 0 && !form.orgName.trim())}>
            {busy && <Spinner />}{step === 0 ? 'Continue' : tactical ? 'Establish HQ' : 'Create account'} {!busy && <ArrowRight />}
          </button>
        </div>
      </form>
    </AuthFrame>
  );
}

export function Splash() {
  return (
    <div className="splash" aria-busy="true" aria-label="Loading">
      <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.4, repeat: Infinity }}><BrandMark size={56} /></motion.div>
    </div>
  );
}
