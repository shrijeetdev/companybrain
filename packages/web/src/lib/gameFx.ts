// Celebration queue for the game layer. Producers: task completion (local, instant) and
// `game.reward` live events (server-authoritative XP). Consumer: <FxLayer/>.
import type { Rank, Rarity, RewardEvent } from '@companybrain/types';
import { sfx } from './sfx';
import { dayKey } from './time';
import { createStore, storage, useStore } from './util';

export interface Floater {
  id: string;
  xp: number;
  coins: number;
  text: string;
  tone: 'xp' | 'bonus' | 'crate' | 'medal' | 'challenge' | 'revoked' | 'intel';
  rarity?: Rarity;
}
export interface Burst { id: number; x: number; y: number; big?: boolean }
export type Overlay =
  | { kind: 'levelUp'; level: number; rank: Rank | null; promoted: boolean }
  | { kind: 'sector'; missions: number; xp: number; accuracy: number; durationMs: number };

interface FxState { floaters: Floater[]; bursts: Burst[]; flash: number; deploy: number; overlay: Overlay | null; queue: Overlay[] }

export const fxStore = createStore<FxState>({ floaters: [], bursts: [], flash: 0, deploy: 0, overlay: null, queue: [] });
export const useFx = () => useStore(fxStore);

let burstSeq = 1;
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Instant local feedback when the user completes a mission (before the server answers). */
export function missionHit(x: number, y: number): void {
  sfx.hit();
  if (reducedMotion()) return;
  const id = burstSeq++;
  fxStore.set((s) => ({ ...s, bursts: [...s.bursts, { id, x, y }], flash: s.flash + 1 }));
  window.setTimeout(() => fxStore.set((s) => ({ ...s, bursts: s.bursts.filter((b) => b.id !== id) })), 1100);
}

/** A mission was deployed (created). */
export function missionDeployed(): void {
  sfx.deploy();
  fxStore.set((s) => ({ ...s, deploy: s.deploy + 1 }));
}

// Rewards arrive in quick bursts (complete + on-time + priority…). Stagger them so each pops.
let lastFloaterAt = 0;
function pushFloater(f: Floater): void {
  const now = Date.now();
  const delay = Math.max(0, lastFloaterAt + 380 - now);
  lastFloaterAt = now + delay;
  window.setTimeout(() => {
    fxStore.set((s) => ({ ...s, floaters: [...s.floaters.slice(-4), f] }));
    if (f.tone === 'bonus' || f.tone === 'challenge') sfx.bonus();
    else if (f.tone === 'crate' || f.tone === 'medal') sfx.coin();
    window.setTimeout(() => fxStore.set((s) => ({ ...s, floaters: s.floaters.filter((x) => x.id !== f.id) })), f.tone === 'crate' || f.tone === 'medal' ? 3200 : 2000);
  }, delay);
}

export function showOverlay(o: Overlay): void {
  fxStore.set((s) => (s.overlay ? { ...s, queue: [...s.queue, o] } : { ...s, overlay: o }));
}
export function dismissOverlay(): void {
  fxStore.set((s) => ({ ...s, overlay: s.queue[0] ?? null, queue: s.queue.slice(1) }));
}

const xpKey = () => `cb.xp.${dayKey(Date.now())}`;
export function xpEarnedToday(): number { return Number(storage.get(xpKey()) ?? 0); }

const seen = new Set<string>();
export function onReward(r: RewardEvent): void {
  if (seen.has(r.id)) return;
  seen.add(r.id);
  if (r.xp > 0) storage.set(xpKey(), String(xpEarnedToday() + r.xp));
  const short = r.label.replace(/^[^:]*:\s*/, '');
  switch (r.kind) {
    case 'mission_complete':
      pushFloater({ id: r.id, xp: r.xp, coins: r.coins, text: short, tone: 'xp' });
      break;
    case 'intel':
      pushFloater({ id: r.id, xp: r.xp, coins: r.coins, text: 'Mission deployed', tone: 'intel' });
      break;
    case 'on_time_bonus':
    case 'rescue_bonus':
    case 'priority_bonus':
    case 'streak_bonus':
    case 'squad_bonus':
    case 'subtask':
      pushFloater({ id: r.id, xp: r.xp, coins: r.coins, text: r.label, tone: 'bonus' });
      break;
    case 'challenge':
      pushFloater({ id: r.id, xp: r.xp, coins: r.coins, text: r.label, tone: 'challenge' });
      break;
    case 'achievement':
      pushFloater({ id: r.id, xp: r.xp, coins: r.coins, text: r.label, tone: 'medal' });
      break;
    case 'crate_earned':
      pushFloater({ id: r.id, xp: 0, coins: 0, text: r.label, tone: 'crate', rarity: r.rarity });
      break;
    case 'revoked':
      pushFloater({ id: r.id, xp: r.xp, coins: r.coins, text: 'Mission reopened', tone: 'revoked' });
      break;
    case 'level_up':
      window.setTimeout(() => {
        sfx.levelUp();
        showOverlay({ kind: 'levelUp', level: r.level ?? 0, rank: r.rank ?? null, promoted: !!r.rank && r.rank.minLevel === r.level });
      }, Math.max(0, lastFloaterAt - Date.now()) + 500);
      break;
  }
}

const sectorKey = () => `cb.sector.${dayKey(Date.now())}`;
/** Fire the end-of-round screen at most once per day. */
export function maybeSectorCleared(stats: { missions: number; accuracy: number; durationMs: number }): void {
  if (storage.get(sectorKey())) return;
  storage.set(sectorKey(), '1');
  window.setTimeout(() => {
    sfx.sectorCleared();
    showOverlay({ kind: 'sector', missions: stats.missions, xp: xpEarnedToday(), accuracy: stats.accuracy, durationMs: stats.durationMs });
  }, Math.max(0, lastFloaterAt - Date.now()) + 900);
}
