import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { Check, Copy, KeyRound, MousePointerClick, Plus, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AgentProvider, ApiKey, ApiScope } from '@companybrain/types';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { qk, useMe, useMemberMap, useMembers } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { BrandMark, ProviderMark, PROVIDERS } from '../../components/icons';
import { Modal } from '../../components/Overlay';
import { Empty, Segmented, Spinner } from '../../components/ui';
import { useLabels } from '../../lib/labels';
import { sfx } from '../../lib/sfx';
import { ago } from '../../lib/time';
import { toast } from '../../lib/toast';
import { copyText, cx } from '../../lib/util';

export function CopyField({ value, label, secret }: { value: string; label: string; secret?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (await copyText(value)) { setDone(true); sfx.tick(); window.setTimeout(() => setDone(false), 1600); } else toast.error('Couldn’t copy — select and copy manually');
  };
  return (
    <div className={cx('copy-field', secret && 'secret')}>
      <code className="truncate" aria-label={label}>{value}</code>
      <button className="btn btn-primary" onClick={() => void copy()} aria-label={`Copy ${label}`}>
        <AnimatePresence mode="wait" initial={false}>
          <m.span key={done ? 'y' : 'n'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {done ? <><Check /> Copied</> : <><Copy /> Copy</>}
          </m.span>
        </AnimatePresence>
      </button>
    </div>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="field-label">{title}</div>
      <pre className="code-block">{code}<button className="icon-btn icon-btn-sm" aria-label={`Copy ${title}`} onClick={() => void copyText(code).then((ok) => { if (ok) { setDone(true); window.setTimeout(() => setDone(false), 1500); } })}>{done ? <Check /> : <Copy />}</button></pre>
    </div>
  );
}

/** Hand-drawn mini UI illustrations for the 3 connect steps (original art, generic chrome). */
function StepArt({ step, app }: { step: 1 | 2 | 3; app: 'claude' | 'chatgpt' }) {
  const c = app === 'claude' ? '#d97757' : '#10a37f';
  return (
    <svg viewBox="0 0 220 120" className="step-art" aria-hidden>
      <rect x="1" y="1" width="218" height="118" rx="10" fill="var(--surface-solid)" stroke="var(--border-strong)" />
      <circle cx="14" cy="12" r="3" fill="#ff5f57" /><circle cx="24" cy="12" r="3" fill="#febc2e" /><circle cx="34" cy="12" r="3" fill="#28c840" />
      {step === 1 && (
        <>
          <rect x="10" y="24" width="60" height="88" rx="6" fill="var(--surface-sunken)" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x="16" y={32 + i * 18} width="48" height="10" rx="3" fill={i === 2 ? c : 'var(--border-strong)'} opacity={i === 2 ? 0.9 : 1} />)}
          <text x="78" y="40" fontSize="10" fontWeight="700" fill="var(--text)">Settings</text>
          <rect x="78" y="50" width="130" height="22" rx="5" fill="none" stroke={c} strokeWidth="1.5" />
          <text x="86" y="65" fontSize="9.5" fill="var(--text)">Connectors</text>
          <rect x="78" y="80" width="100" height="8" rx="3" fill="var(--border-strong)" /><rect x="78" y="94" width="70" height="8" rx="3" fill="var(--border-strong)" />
          <path d="M174 70 l10 10 -4 1 3 6 -3 1 -3-6 -3 3z" fill="var(--text)" />
        </>
      )}
      {step === 2 && (
        <>
          <text x="14" y="38" fontSize="10" fontWeight="700" fill="var(--text)">Add custom connector</text>
          <rect x="14" y="48" width="192" height="20" rx="5" fill="var(--surface-sunken)" stroke="var(--border-strong)" />
          <text x="20" y="62" fontSize="9" fill="var(--text-2)" fontFamily="monospace">https://…/mcp</text>
          <rect x="150" y="52" width="50" height="12" rx="3" fill="var(--accent)" opacity="0.25" />
          <text x="157" y="61" fontSize="8" fill="var(--text)">⌘V</text>
          <rect x="140" y="84" width="66" height="22" rx="6" fill={c} />
          <text x="156" y="99" fontSize="9.5" fontWeight="700" fill="#fff">Add</text>
        </>
      )}
      {step === 3 && (
        <>
          <rect x="44" y="24" width="132" height="88" rx="8" fill="var(--surface-sunken)" stroke="var(--border-strong)" />
          <text x="60" y="44" fontSize="14">🧠</text>
          <path d="M82 39h12" stroke="var(--text-3)" strokeDasharray="2 2" />
          <circle cx="104" cy="39" r="7" fill={c} />
          <rect x="58" y="56" width="104" height="7" rx="3" fill="var(--border-strong)" />
          <rect x="58" y="68" width="80" height="7" rx="3" fill="var(--border-strong)" />
          <rect x="58" y="84" width="104" height="18" rx="5" fill="var(--accent)" />
          <text x="86" y="96" fontSize="9" fontWeight="700" fill="var(--accent-contrast)">Approve</text>
        </>
      )}
    </svg>
  );
}

export function AiSettings() {
  const L = useLabels();
  const me = useMe();
  const { data: integ } = useQuery({ queryKey: qk.integrations, queryFn: api.integrations.get });
  const [app, setApp] = useState<'claude' | 'chatgpt'>('claude');
  const mcpUrl = integ?.mcpUrl ?? `${window.location.origin}/mcp`;
  const steps = app === 'claude'
    ? [['Open Claude', 'Settings → Connectors (on claude.ai or the desktop app).'], ['Add custom connector', 'Paste the URL above and click Add.'], ['Approve', `Click Connect — approve access here as yourself or an ${L.agent}.`]]
    : [['Open ChatGPT', 'Settings → Connectors → Advanced → enable Developer mode.'], ['Create connector', 'Name it companybrain, paste the URL, auth: OAuth.'], ['Approve', 'Sign in here and approve. Use it in any chat from the + menu.']];
  const isMgr = ['owner', 'admin', 'manager'].includes(me.role);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="panel connect-hero">
        <div className="ch-top">
          <div className="ch-logos" aria-hidden>
            <BrandMark size={44} />
            <span className="link-dots">{[0, 1, 2].map((i) => <m.i key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }} />)}</span>
            <span className="agent-avatar" style={{ background: app === 'claude' ? '#d97757' : '#10a37f', width: 44, height: 44 }}><ProviderMark provider={app} size={22} /></span>
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ color: 'var(--accent-ink)' }}>{L.connect}</div>
            <h2 className="ch-title display">Connect {app === 'claude' ? 'Claude' : 'ChatGPT'} in 30 seconds</h2>
            <p className="muted" style={{ fontSize: 13.5 }}>One URL. It signs in with OAuth — no keys to paste, revocable anytime.</p>
          </div>
          <Segmented label="App" value={app} onChange={setApp} options={[{ value: 'claude', label: 'Claude' }, { value: 'chatgpt', label: 'ChatGPT' }]} />
        </div>
        <CopyField value={mcpUrl} label="MCP connector URL" />
        <ol className="steps3">
          {steps.map(([t, d], i) => (
            <m.li key={`${app}${i}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <StepArt step={(i + 1) as 1 | 2 | 3} app={app} />
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span className="step-num num-display">{i + 1}</span>
                <div><b>{t}</b><div className="faint" style={{ fontSize: 12.5 }}>{d}</div></div>
              </div>
            </m.li>
          ))}
        </ol>
      </section>
      {isMgr && <AgentsPanel />}
      <KeysPanel mcpUrl={mcpUrl} />
    </div>
  );
}

function AgentsPanel() {
  const L = useLabels();
  const qc = useQueryClient();
  const me = useMe();
  const { data: members } = useMembers();
  const agents = (members ?? []).filter((m) => m.kind === 'agent');
  const [f, setF] = useState<{ name: string; provider: AgentProvider; description: string } | null>(null);
  const create = async () => {
    if (!f?.name.trim()) return;
    try {
      await api.members.create({ kind: 'agent', role: 'agent', name: f.name.trim(), agent: { provider: f.provider, description: f.description, supervisorId: me.id } });
      void qc.invalidateQueries({ queryKey: qk.members });
      toast.success(`${f.name} joined the ${L.team.toLowerCase()}`);
      setF(null);
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <section className="panel">
      <div className="panel-head"><h2>{L.agents}</h2><span className="spacer" /><button className="btn btn-sm" onClick={() => setF({ name: '', provider: 'claude', description: '' })}><Plus /> New {L.agent}</button></div>
      {agents.map((a) => (
        <div key={a.id} className="list-row">
          <span className="agent-avatar" style={{ background: a.color, width: 34, height: 34 }}>{a.agent && <ProviderMark provider={a.agent.provider} size={17} />}</span>
          <div className="grow" style={{ minWidth: 0 }}><b>{a.name}</b><div className="faint truncate" style={{ fontSize: 12.5 }}>{a.agent?.description}</div></div>
          <span className="faint" style={{ fontSize: 12 }}>{a.agent?.lastSeenAt ? `seen ${ago(a.agent.lastSeenAt)}` : 'never connected'}</span>
        </div>
      ))}
      <Modal open={!!f} onClose={() => setF(null)} title={`New ${L.agent}`} width={480}>
        {f && (
          <>
            <div className="modal-body">
              <div className="provider-grid">
                {PROVIDERS.map((p) => (
                  <button key={p.id} className={cx('provider-btn', f.provider === p.id && 'on')} aria-pressed={f.provider === p.id} onClick={() => setF({ ...f, provider: p.id, name: f.name || p.name })}>
                    <span className="agent-avatar" style={{ background: p.color, width: 34, height: 34 }}><ProviderMark provider={p.id} size={17} /></span>{p.name}
                  </button>
                ))}
              </div>
              <div className="field"><label htmlFor="an">Name</label><input id="an" className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Claude (Research)" /></div>
              <div className="field"><label htmlFor="ad">What does it do?</label><input id="ad" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Drafts blog posts and research briefs" /></div>
            </div>
            <div className="modal-foot"><button className="btn" onClick={() => setF(null)}>Cancel</button><button className="btn btn-primary" disabled={!f.name.trim()} onClick={() => void create()}>Add to {L.team.toLowerCase()}</button></div>
          </>
        )}
      </Modal>
    </section>
  );
}

function KeysPanel({ mcpUrl }: { mcpUrl: string }) {
  const qc = useQueryClient();
  const me = useMe();
  const L = useLabels();
  const members = useMemberMap();
  const { data: all } = useMembers();
  const { data: keys } = useQuery({ queryKey: qk.keys(), queryFn: () => api.keys.list() });
  const isMgr = ['owner', 'admin', 'manager'].includes(me.role);
  const owners = useMemo(() => (all ?? []).filter((m) => m.id === me.id || (isMgr && m.kind === 'agent')), [all, me.id, isMgr]);
  const [mint, setMint] = useState<{ memberId: string; name: string; scopes: ApiScope[] } | null>(null);
  const [raw, setRaw] = useState<{ key: ApiKey; raw: string } | null>(null);
  const [lastRaw, setLastRaw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!mint) return;
    setBusy(true);
    try { const r = await api.keys.create({ ...mint, name: mint.name.trim() || 'API key' }); setRaw(r); setLastRaw(r.raw); setMint(null); void qc.invalidateQueries({ queryKey: ['keys'] }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const revoke = async (k: ApiKey) => {
    if (!window.confirm(`Revoke “${k.name}”? Anything using it stops working immediately.`)) return;
    try { await api.keys.revoke(k.id); void qc.invalidateQueries({ queryKey: ['keys'] }); toast('Key revoked'); } catch (e) { toast.error(errorMessage(e)); }
  };
  const key = lastRaw ?? '<YOUR_KEY>';
  const origin = window.location.origin;
  const active = (keys ?? []).filter((k) => !k.revokedAt);
  return (
    <section className="panel">
      <div className="panel-head"><KeyRound size={16} /><h2>API keys — Cursor, VS Code, Claude Code, n8n</h2><span className="spacer" /><button className="btn btn-sm btn-primary" onClick={() => setMint({ memberId: owners.find((o) => o.kind === 'agent')?.id ?? me.id, name: '', scopes: ['read', 'write'] })}><Plus /> New key</button></div>
      {active.length === 0 && <Empty art="🔑" title="No keys yet">Keys let agents and tools act as a team member over MCP or REST.</Empty>}
      {active.map((k) => {
        const m = members.get(k.memberId);
        return (
          <div key={k.id} className="list-row">
            <Avatar member={m} size={28} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{k.name}</b> <span className="faint">· {m?.name}</span>
              <div className="faint" style={{ fontSize: 12 }}><span className="mono">{k.prefix}…</span> · {k.scopes.join(' + ')} · {k.lastUsedAt ? `used ${ago(k.lastUsedAt)}` : 'never used'}{k.expiresAt ? ` · expires ${ago(k.expiresAt)}` : ''}</div>
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => void revoke(k)}><Trash2 /> Revoke</button>
          </div>
        );
      })}
      <div className="panel-pad stack" style={{ borderTop: '1px solid var(--border)', gap: 14 }}>
        <Snippet title="Claude Code" code={`claude mcp add --transport http companybrain ${mcpUrl} \\\n  --header "Authorization: Bearer ${key}"`} />
        <Snippet title="Cursor / VS Code (mcp.json)" code={JSON.stringify({ mcpServers: { companybrain: { url: mcpUrl, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)} />
        <Snippet title="Claude Desktop (stdio)" code={JSON.stringify({ mcpServers: { companybrain: { command: 'companybrain', args: ['mcp'], env: { COMPANYBRAIN_MCP_KEY: key } } } }, null, 2)} />
        <Snippet title="URL-only connectors (treat as a secret)" code={`${origin}/mcp/k/${key}`} />
        <Snippet title="REST / n8n / Zapier" code={`curl -H "Authorization: Bearer ${key}" ${origin}/api/tasks?assigneeId=me\n# OpenAPI: ${origin}/api/openapi.json`} />
      </div>

      <Modal open={!!mint} onClose={() => setMint(null)} title="New API key" width={480}>
        {mint && (
          <>
            <div className="modal-body">
              <div className="field"><label htmlFor="km">Acts as</label>
                <select id="km" className="select" value={mint.memberId} onChange={(e) => setMint({ ...mint, memberId: e.target.value })}>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.id === me.id ? `Me (${o.name})` : `${o.name} — ${L.agent}`}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="kn">Name</label><input id="kn" className="input" autoFocus value={mint.name} onChange={(e) => setMint({ ...mint, name: e.target.value })} placeholder="Cursor on my laptop" /></div>
              <div className="field"><span className="field-label">Access</span>
                <Segmented label="Scopes" value={mint.scopes.includes('write') ? 'rw' : 'r'} onChange={(v) => setMint({ ...mint, scopes: v === 'rw' ? ['read', 'write'] : ['read'] })} options={[{ value: 'r', label: 'Read only' }, { value: 'rw', label: 'Read & write' }]} />
              </div>
            </div>
            <div className="modal-foot"><button className="btn" onClick={() => setMint(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => void create()}>{busy && <Spinner />}Create key</button></div>
          </>
        )}
      </Modal>
      <Modal open={!!raw} onClose={() => setRaw(null)} title="Your new key" icon={<ShieldCheck style={{ color: 'var(--success)' }} />} width={540}>
        {raw && (
          <>
            <div className="modal-body">
              <div className="row" style={{ gap: 8, color: 'var(--warning)', fontWeight: 600, fontSize: 13 }}><TriangleAlert size={16} /> Copy it now — it won’t be shown again.</div>
              <CopyField value={raw.raw} label="API key" secret />
              <div className="faint" style={{ fontSize: 12.5 }}><MousePointerClick size={13} style={{ display: 'inline', verticalAlign: -2 }} /> The snippets below the keys list now include this key.</div>
            </div>
            <div className="modal-foot"><button className="btn btn-primary" onClick={() => setRaw(null)}>I’ve saved it</button></div>
          </>
        )}
      </Modal>
    </section>
  );
}
