// @companybrain/game — "Tactical Ops" gamification engine. See ../RULES.md and docs/v2/WIRING.md.

import type Database from 'better-sqlite3';
import type { AuditEvent, CoreServices, GameService } from '@companybrain/types';
import { Engine, type Logger } from './engine';
import { migrate } from './schema';
import { Service } from './service';
import { cryptoRandom } from './util';

export interface GameOptions {
  /** Same connection as @companybrain/db (Db.sqlite). */
  sqlite: Database.Database;
  /** Read members/tasks/projects; publish via services.live. */
  services: CoreServices;
  clock?: () => number;
  /** Uniform [0,1) source for loot rolls. Default: node:crypto. Tests inject a seeded RNG. */
  random?: () => number;
  log?: Logger;
}

export interface Game {
  service: GameService;
  /** Feed every audit event here (core calls CoreOptions.onAudit). Never throws. */
  onAudit(e: AuditEvent): Promise<void>;
  /** Recompute the cached `game_players` rows of an org from the ledger. Returns members rebuilt. */
  rebuild(orgId: string): number;
}

export function createGame(opts: GameOptions): Game {
  migrate(opts.sqlite);
  const engine = new Engine({
    db: opts.sqlite,
    services: opts.services,
    clock: opts.clock ?? Date.now,
    random: opts.random ?? cryptoRandom,
    log: opts.log ?? console,
  });
  const service = new Service(engine, opts.services);
  return {
    service,
    onAudit: (e) => engine.onAudit(e),
    rebuild: (orgId) => engine.rebuildPlayers(orgId),
  };
}

export {
  ACHIEVEMENTS, BASE_XP, CHALLENGES, COSMETICS, DAILY_MISSION_XP_CAP, LOOT_TABLES, MAX_LEVEL, RANKS,
  levelForXp, rankForLevel, xpForLevel,
} from './rules';
export { seededRandom } from './util';
