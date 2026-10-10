import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, Bell, Bot, CircleCheck, CircleDashed, LogOut, Mail, MessageCircle, QrCode, Smartphone } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage } from '../../api/client';
import { api, type QrStatus } from '../../api/endpoints';
import { qk } from '../../api/queries';
import { Spinner } from '../../components/ui';
import { sfx } from '../../lib/sfx';
import { toast } from '../../lib/toast';
import { cx } from '../../lib/util';

function Card({ icon, title, ok, status, children }: { icon: ReactNode; title: string; ok: boolean; status: string; children?: ReactNode }) {
  return (
    <section className="panel integ-card">
      <div className="row" style={{ gap: 12 }}>
        <span className={cx('integ-icon', ok && 'ok')}>{icon}</span>
        <div className="grow" style={{ minWidth: 0 }}><b>{title}</b><div className="row" style={{ gap: 6, fontSize: 12.5, color: ok ? 'var(--success)' : 'var(--text-3)' }}>{ok ? <CircleCheck size={13} /> : <CircleDashed size={13} />}{status}</div></div>
      </div>
      {children}
    </section>
  );
}

export function IntegrationsSettings() {
  const { data: s } = useQuery({ queryKey: qk.integrations, queryFn: api.integrations.get });
  const test = async (channel: 'whatsapp' | 'email' | 'push') => {
    try { const r = await api.integrations.test(channel); if (r.ok) toast.success('Test sent to you'); else toast.error(r.error ?? 'Couldn’t send the test'); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  if (!s) return <div className="panel panel-pad"><Spinner /></div>;
  return (
    <div className="integ-grid">
      <WhatsAppCard mode={s.whatsapp.mode} connected={s.whatsapp.connected} phone={s.whatsapp.phone} onTest={() => void test('whatsapp')} />
      <Card icon={<Mail />} title="Email" ok={s.email.inbound || s.email.outbound} status={[s.email.inbound && `Inbox: ${s.email.address ?? 'on'}`, s.email.outbound && 'Sending on'].filter(Boolean).join(' · ') || 'Not configured'}>
        <p className="faint" style={{ fontSize: 12.5 }}>Forward or CC tasks to the intake address; replies confirm what was created. Configure IMAP/SMTP in the server environment.</p>
        {s.email.outbound && <button className="btn btn-sm" onClick={() => void test('email')}>Send test email</button>}
      </Card>
      <Card icon={<Bell />} title="Web push" ok={s.push} status={s.push ? 'Ready (VAPID keys present)' : 'Not configured'}>
        <p className="faint" style={{ fontSize: 12.5 }}>Each person enables push on their devices in Settings → Notifications.</p>
        {s.push && <button className="btn btn-sm" onClick={() => void test('push')}>Send test push</button>}
      </Card>
      <Card icon={<Bot />} title="AI language model" ok={!!s.llm.provider} status={s.llm.provider ? `Using ${s.llm.provider}` : 'Off — deterministic parsing'}>
        <p className="faint" style={{ fontSize: 12.5 }}>Optional. Extracts tasks from messy messages and polishes the spoken briefing.</p>
      </Card>
      <Card icon={<AudioLines />} title="Voice (text-to-speech)" ok={!!s.tts.provider} status={s.tts.provider ? `Using ${s.tts.provider}` : 'Browser voices'}>
        <p className="faint" style={{ fontSize: 12.5 }}>Optional natural voice for the daily briefing. Without it, each device’s best built-in voice is used.</p>
      </Card>
    </div>
  );
}

function WhatsAppCard({ mode, connected, phone, onTest }: { mode: 'cloud' | 'qr' | null; connected: boolean; phone: string | null; onTest: () => void }) {
  const qc = useQueryClient();
  const [qr, setQr] = useState<QrStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const pairing = qr?.status === 'pairing';
  useEffect(() => {
    if (!pairing) return;
    const t = window.setInterval(async () => {
      try {
        const st = await api.integrations.qrStatus();
        setQr(st);
        if (st.status === 'connected') { sfx.levelUp(); toast.success('WhatsApp connected'); void qc.invalidateQueries({ queryKey: qk.integrations }); }
      } catch { /* keep polling */ }
    }, 2000);
    return () => window.clearInterval(t);
  }, [pairing, qc]);
  const start = async () => {
    setBusy(true);
    try { const r = await api.integrations.qrStart(); setQr({ status: r.status, qr: r.qr }); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const logout = async () => {
    if (!window.confirm('Disconnect WhatsApp?')) return;
    try { await api.integrations.qrLogout(); setQr(null); void qc.invalidateQueries({ queryKey: qk.integrations }); } catch (e) { toast.error(errorMessage(e)); }
  };
  const isConnected = connected || qr?.status === 'connected';
  return (
    <Card icon={<MessageCircle />} title="WhatsApp" ok={isConnected} status={isConnected ? `Connected${phone || qr?.phone ? ` · ${phone ?? qr?.phone}` : ''}` : mode === 'cloud' ? 'Cloud API — waiting for webhook' : 'Not connected'}>
      <p className="faint" style={{ fontSize: 12.5 }}>Team members message the bot to create tasks; unknown senders land in the Inbox.</p>
      <AnimatePresence mode="wait">
        {pairing && qr?.qr ? (
          <motion.div key="qr" className="qr-box" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div className="qr-frame"><img src={qr.qr} alt="WhatsApp pairing QR code" width={200} height={200} /><span className="qr-scan" aria-hidden /></div>
            <ol className="qr-steps">
              <li><Smartphone size={14} /> Open WhatsApp on the bot’s phone</li>
              <li>Settings → <b>Linked devices</b> → <b>Link a device</b></li>
              <li>Point the camera at this code</li>
            </ol>
            <div className="row faint" style={{ gap: 8, fontSize: 12.5 }}><Spinner size={13} /> Waiting for scan…</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {isConnected ? (
          <>
            <button className="btn btn-sm" onClick={onTest}>Send test message</button>
            {mode !== 'cloud' && <button className="btn btn-sm btn-ghost" onClick={() => void logout()}><LogOut /> Disconnect</button>}
          </>
        ) : mode !== 'cloud' && !pairing && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void start()}>{busy ? <Spinner /> : <QrCode />} Pair with QR code</button>
        )}
      </div>
    </Card>
  );
}
