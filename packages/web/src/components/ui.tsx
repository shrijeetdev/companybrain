import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { dismissToast, useToasts } from '../lib/toast';
import { cx } from '../lib/util';

// ─── Segmented control ──────────────────────────────────────────────────────

export function Segmented<T extends string>({ value, onChange, options, label, size }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[];
  label: string;
  size?: 'sm';
}) {
  const id = useId();
  return (
    <div className="segmented" role="tablist" aria-label={label} style={size === 'sm' ? { transform: 'scale(0.94)', transformOrigin: 'left center' } : undefined}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={on} title={o.title} onClick={() => onChange(o.value)}>
            {on && <m.span layoutId={`seg-${id}`} className="seg-thumb" transition={{ type: 'spring', stiffness: 600, damping: 40 }} />}
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Switch ─────────────────────────────────────────────────────────────────

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function SettingRow({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="grow">
        <div className="setting-title">{title}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

// ─── Number ticker ──────────────────────────────────────────────────────────

/** ~cubic-bezier(0.22, 1, 0.36, 1) — fast start, soft landing. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/** Tween a number with requestAnimationFrame (no animation library needed for counters/rings). */
function useTween(target: number, durationS: number, onFrame: (v: number) => void, from = 0): void {
  const reduce = useReducedMotion();
  const cur = useRef(reduce ? target : from);
  const frame = useRef(onFrame);
  frame.current = onFrame;
  useEffect(() => {
    const start = cur.current;
    if (reduce || durationS <= 0 || start === target) {
      cur.current = target;
      frame.current(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / (durationS * 1000));
      cur.current = start + (target - start) * easeOut(k);
      frame.current(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationS, reduce]);
}

export function Ticker({ value, format = (n) => Math.round(n).toLocaleString(), className, duration = 0.9 }: { value: number; format?: (n: number) => string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const fmt = useRef(format);
  fmt.current = format;
  useTween(value, duration, (v) => { if (ref.current) ref.current.textContent = fmt.current(v); });
  return <span ref={ref} className={cx('num', className)}>{format(reduce ? value : 0)}</span>;
}

// ─── Progress ring (optionally segmented) ───────────────────────────────────

export function Ring({ pct, size = 64, stroke = 6, color = 'var(--accent)', track, segments, children, glow }: {
  pct: number; size?: number; stroke?: number; color?: string; track?: string; segments?: number; children?: ReactNode; glow?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct)) / 100;
  const reduce = useReducedMotion();
  const gap = segments ? Math.min(6, c / segments / 3) : 0;
  const dash = segments ? `${c / segments - gap} ${gap}` : undefined;
  const arc = useRef<SVGCircleElement>(null);
  useTween(p, 1.1, (v) => arc.current?.setAttribute('stroke-dashoffset', String(c * (1 - v))));
  const initialOffset = c * (1 - (reduce ? p : 0));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track ?? (segments ? 'var(--border)' : 'var(--surface-sunken)')} strokeWidth={stroke} strokeDasharray={dash} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        {segments ? (
          <>
            <mask id={`m${size}${segments}`}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={stroke + 2} strokeDasharray={dash} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            </mask>
            <circle ref={arc} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={initialOffset} style={{ filter: glow ? `drop-shadow(0 0 6px ${color})` : undefined }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} mask={`url(#m${size}${segments})`} />
          </>
        ) : (
          <circle ref={arc} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={initialOffset}
            style={{ filter: glow ? `drop-shadow(0 0 6px ${color})` : undefined }} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      {children && <div className="ring-center">{children}</div>}
    </div>
  );
}

/** Horizontal bar that animates its fill. */
export function Bar({ pct, color, height, className }: { pct: number; color?: string; height?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cx('bar', className)} style={height ? { height } : undefined} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <m.i initial={{ scaleX: reduce ? pct / 100 : 0 }} animate={{ scaleX: Math.max(0, Math.min(1, pct / 100)) }} transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={color ? { background: color } : undefined} />
    </div>
  );
}

// ─── Skeletons & empty states ───────────────────────────────────────────────

export function Skeleton({ w = '100%', h = 14, r, style }: { w?: number | string; h?: number; r?: number; style?: React.CSSProperties }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}
export function SkeletonRows({ n = 5 }: { n?: number }) {
  return (
    <div style={{ display: 'grid', gap: 14, padding: '14px 20px' }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="row" style={{ gap: 12 }}>
          <Skeleton w={20} h={20} r={10} />
          <Skeleton w={`${55 + ((i * 17) % 35)}%`} h={13} />
          <span className="grow" />
          <Skeleton w={64} h={13} />
        </div>
      ))}
    </div>
  );
}

export function Empty({ art, title, children, action }: { art: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <m.div className="empty" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <m.div className="empty-art" initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.05 }}>{art}</m.div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </m.div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Empty art="📡" title="Couldn’t load this" action={onRetry && <button className="btn btn-sm" onClick={onRetry}>Try again</button>}>
      {(error as Error)?.message ?? 'Something went wrong.'}
    </Empty>
  );
}

// ─── Toasts ─────────────────────────────────────────────────────────────────

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <m.div
            key={t.id}
            layout
            className={cx('toast', `tone-${t.tone}`)}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96, transition: { duration: 0.16 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            {t.icon ?? (t.tone === 'error' ? <CircleAlert /> : t.tone === 'success' ? <CircleCheck /> : <Info style={{ color: 'var(--info)' }} />)}
            <div className="toast-msg">{t.message}</div>
            {t.action && (
              <button className="btn btn-sm" onClick={() => { t.action!.onClick(); dismissToast(t.id); }}>{t.action.label}</button>
            )}
            <button className="icon-btn icon-btn-sm" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><X /></button>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
