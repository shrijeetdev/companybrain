import type { Rank } from '@companybrain/types';

/** Rank insignia drawn from the server's hint (chevrons / bars / stars / crown). Original art. */
export function Insignia({ rank, size = 28, glow }: { rank: Pick<Rank, 'insignia' | 'name'>; size?: number; glow?: boolean }) {
  const { kind, count, color } = rank.insignia;
  const n = Math.max(1, Math.min(kind === 'chevron' ? 4 : 3, count));
  const gid = `ins-${kind}-${color.replace(/[^a-z0-9]/gi, '')}`;
  const style = glow ? { filter: `drop-shadow(0 0 ${size / 6}px ${color})` } : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={rank.name} style={style}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="1" />
          <stop offset="1" stopColor={color} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      {/* backing plate */}
      <path d="M16 1.5 29 8v16L16 30.5 3 24V8z" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1.2" />
      {kind === 'chevron' && Array.from({ length: n }, (_, i) => {
        const gap = 4.6;
        const y = (32 - (9.1 + (n - 1) * gap)) / 2 + i * gap;
        return <path key={i} d={`M8 ${y + 5.5} 16 ${y} 24 ${y + 5.5} 24 ${y + 9.1} 16 ${y + 3.6} 8 ${y + 9.1}z`} fill={`url(#${gid})`} />;
      })}
      {kind === 'bar' && Array.from({ length: n }, (_, i) => {
        const w = 5;
        const total = n * w + (n - 1) * 3;
        const x = 16 - total / 2 + i * (w + 3);
        return <rect key={i} x={x} y="8" width={w} height="16" rx="1" fill={`url(#${gid})`} />;
      })}
      {kind === 'star' && Array.from({ length: n }, (_, i) => {
        const cx = n === 1 ? 16 : n === 2 ? 11 + i * 10 : 8 + i * 8;
        const r = n === 1 ? 8 : n === 2 ? 5.6 : 4.4;
        return <path key={i} d={starPath(cx, 16, r)} fill={`url(#${gid})`} />;
      })}
      {kind === 'crown' && <path d="M7 22h18l1.5-11-5.5 4.5L16 8l-5 7.5L5.5 11z" fill={`url(#${gid})`} stroke={color} strokeWidth="0.6" />}
    </svg>
  );
}

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}z`;
}
