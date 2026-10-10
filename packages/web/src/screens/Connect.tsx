import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Check, Eye, Lock, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AgentProvider, ApiScope } from '@companybrain/types';
import { errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { qk, useMe, useMembers, useOrg } from '../api/queries';
import { Avatar } from '../components/Avatar';
import { BrandMark, ProviderMark, PROVIDERS } from '../components/icons';
import { Skeleton, Spinner } from '../components/ui';
import { useLabels } from '../lib/labels';
import { cx } from '../lib/util';

function guessProvider(name: string): AgentProvider {
  const n = name.toLowerCase();
  return (PROVIDERS.find((p) => n.includes(p.id) || n.includes(p.name.toLowerCase()))?.id ?? 'custom');
}

/** OAuth consent screen: "Claude wants to connect to your companybrain". */
export function Connect() {
  const L = useLabels();
  const me = useMe();
  const qc = useQueryClient();
  const { data: org } = useOrg();
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(window.location.search)), []);
  const clientId = params.client_id ?? '';
  const { data: client, error } = useQuery({ queryKey: ['oauth-client', clientId], queryFn: () => api.oauth.client(clientId, params.redirect_uri), enabled: !!clientId, retry: false });
  const { data: members } = useMembers();
  const isMgr = ['owner', 'admin', 'manager'].includes(me.role);
  const agents = (members ?? []).filter((m) => m.kind === 'agent' && m.active && (isMgr || m.agent?.supervisorId === me.id));
  const provider = guessProvider(client?.name ?? '');
  const providerInfo = PROVIDERS.find((p) => p.id === provider)!;
  const [scope, setScope] = useState<'read' | 'write'>(params.scope?.includes('write') || !params.scope ? 'write' : 'read');
  const [actAs, setActAs] = useState<string>(me.id);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const host = client?.redirectHost ?? (client?.redirectUri ? new URL(client.redirectUri).host : params.redirect_uri ? safeHost(params.redirect_uri) : '');

  const createAgent = async () => {
    if (!newName.trim()) return;
    try {
      const m = await api.members.create({ kind: 'agent', role: 'agent', name: newName.trim(), agent: { provider, description: `Connected via ${client?.name ?? 'OAuth'}`, supervisorId: me.id } });
      await qc.invalidateQueries({ queryKey: qk.members });
      setActAs(m.id);
      setCreating(false);
    } catch (e) { setErr(errorMessage(e)); }
  };
  const decide = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'deny');
    setErr(null);
    try {
      const scopes: ApiScope[] = scope === 'write' ? ['read', 'write'] : ['read'];
      const { redirectTo } = await api.oauth.approve({ query: params, scopes, actAs, approve });
      window.location.assign(redirectTo);
    } catch (e) { setErr(errorMessage(e)); setBusy(null); }
  };

  return (
    <div className="auth connect">
      <div className="radar" aria-hidden><span className="radar-sweep" /><span className="radar-rings" /></div>
      <motion.div className="auth-card panel connect-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 26 }}>
        <div className="link-art" aria-hidden>
          <BrandMark size={56} />
          <span className="link-dots">{[0, 1, 2, 3, 4].map((i) => <motion.i key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.14 }} />)}</span>
          <span className="agent-avatar" style={{ background: providerInfo.color, width: 56, height: 56 }}><ProviderMark provider={provider} size={28} /></span>
        </div>
        {!clientId || error ? (
          <div className="auth-error" role="alert">{!clientId ? 'This connection link is missing information. Start again from your AI app.' : errorMessage(error)}</div>
        ) : !client ? <Skeleton h={120} /> : (
          <>
            <h1 className="connect-title"><b>{client.name}</b> wants to connect to <b>{org?.name ?? 'your companybrain'}</b></h1>
            <p className="faint" style={{ textAlign: 'center', fontSize: 13 }}>Signed in as {me.email ?? me.name} · it will return you to <span className="mono">{host}</span></p>

            <div className="field-label" style={{ marginTop: 18 }}>Access</div>
            <div className="choice-grid" role="radiogroup" aria-label="Access">
              {([['read', <Eye key="i" />, 'Read only', `See ${L.tasksLower}, ${L.projects.toLowerCase()}, team and briefing`], ['write', <Pencil key="i" />, 'Read & write', `Also create, update, comment and complete ${L.tasksLower}`]] as const).map(([v, icon, title, desc]) => (
                <button key={v} role="radio" aria-checked={scope === v} className={cx('choice', scope === v && 'on')} onClick={() => setScope(v)}>
                  <span className="choice-icon">{icon}</span>
                  <span><b>{title}</b><span className="faint">{desc}</span></span>
                  {scope === v && <Check className="choice-check" />}
                </button>
              ))}
            </div>

            <div className="field-label" style={{ marginTop: 16 }}>Act as</div>
            <div className="actas">
              {[me, ...agents].map((m) => (
                <button key={m.id} role="radio" aria-checked={actAs === m.id} className={cx('choice compact', actAs === m.id && 'on')} onClick={() => setActAs(m.id)}>
                  {m.kind === 'agent' && m.agent ? <span className="agent-avatar" style={{ background: m.color, width: 28, height: 28 }}><ProviderMark provider={m.agent.provider} size={15} /></span> : <Avatar member={m} size={28} />}
                  <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><b className="truncate" style={{ display: 'block' }}>{m.id === me.id ? `Me (${m.name})` : m.name}</b><span className="faint" style={{ fontSize: 12 }}>{m.id === me.id ? 'Actions show up as you' : `${L.agent} — gets its own ${L.tasksLower} and XP`}</span></span>
                  {actAs === m.id && <Check className="choice-check" />}
                </button>
              ))}
              {creating ? (
                <div className="row" style={{ gap: 8 }}>
                  <input className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`${client.name} (Sales)`} onKeyDown={(e) => { if (e.key === 'Enter') void createAgent(); }} aria-label="Agent name" />
                  <button className="btn btn-primary" onClick={() => void createAgent()} disabled={!newName.trim()}>Create</button>
                </div>
              ) : isMgr && (
                <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => { setCreating(true); setNewName(client.name); }}><Plus /> Create new {L.agent}</button>
              )}
            </div>

            {err && <div className="auth-error" role="alert" style={{ marginTop: 12 }}>{err}</div>}
            <div className="row" style={{ gap: 10, marginTop: 20 }}>
              <button className="btn btn-lg" onClick={() => void decide(false)} disabled={!!busy}>{busy === 'deny' && <Spinner />}Deny</button>
              <button className="btn btn-primary btn-lg grow" onClick={() => void decide(true)} disabled={!!busy}>{busy === 'approve' ? <Spinner /> : <ShieldCheck />} Approve & connect</button>
            </div>
            <p className="faint connect-note"><Lock size={12} /> companybrain never shares your password. You can revoke this connection anytime in Settings → AI & API keys.</p>
          </>
        )}
      </motion.div>
    </div>
  );
}

function safeHost(u: string): string {
  try { return new URL(u).host; } catch { return u; }
}
