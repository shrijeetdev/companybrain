// Game tables (all prefixed `game_`, all org-scoped) + versioned migrations.

import type Database from 'better-sqlite3';

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS game_processed (
  org_id TEXT NOT NULL, audit_id TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (org_id, audit_id)
);
CREATE TABLE IF NOT EXISTS game_rewards (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, member_id TEXT NOT NULL, kind TEXT NOT NULL,
  xp INTEGER NOT NULL, coins INTEGER NOT NULL, label TEXT NOT NULL, task_id TEXT,
  completion_id TEXT, cap_day TEXT, level INTEGER, rank_id TEXT, crate_id TEXT, rarity TEXT,
  achievement_id TEXT, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS game_rewards_member ON game_rewards (org_id, member_id, at);
CREATE INDEX IF NOT EXISTS game_rewards_org ON game_rewards (org_id, at);
CREATE INDEX IF NOT EXISTS game_rewards_completion ON game_rewards (completion_id);
CREATE TABLE IF NOT EXISTS game_completions (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, member_id TEXT NOT NULL, task_id TEXT NOT NULL,
  project_id TEXT, day TEXT NOT NULL, at INTEGER NOT NULL, priority TEXT NOT NULL,
  had_due INTEGER NOT NULL, on_time INTEGER NOT NULL, rescued INTEGER NOT NULL, farm INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS game_completions_member ON game_completions (org_id, member_id, at);
CREATE INDEX IF NOT EXISTS game_completions_task ON game_completions (org_id, task_id);
CREATE TABLE IF NOT EXISTS game_intel (
  org_id TEXT NOT NULL, member_id TEXT NOT NULL, task_id TEXT NOT NULL, day TEXT NOT NULL,
  xp INTEGER NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (org_id, task_id)
);
CREATE INDEX IF NOT EXISTS game_intel_member ON game_intel (org_id, member_id, day);
CREATE TABLE IF NOT EXISTS game_subtasks (
  org_id TEXT NOT NULL, task_id TEXT NOT NULL, subtask_id TEXT NOT NULL, member_id TEXT NOT NULL,
  day TEXT NOT NULL, xp INTEGER NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (org_id, task_id, subtask_id)
);
CREATE INDEX IF NOT EXISTS game_subtasks_member ON game_subtasks (org_id, member_id, day);
CREATE TABLE IF NOT EXISTS game_players (
  org_id TEXT NOT NULL, member_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, rank_id TEXT NOT NULL DEFAULT 'recruit',
  max_level INTEGER NOT NULL DEFAULT 1, max_rank INTEGER NOT NULL DEFAULT 0, missions_hw INTEGER NOT NULL DEFAULT 0,
  streak_current INTEGER NOT NULL DEFAULT 0, streak_best INTEGER NOT NULL DEFAULT 0, streak_last_day TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, member_id)
);
CREATE TABLE IF NOT EXISTS game_loadout (
  org_id TEXT NOT NULL, member_id TEXT NOT NULL, title TEXT, frame TEXT, emote TEXT,
  PRIMARY KEY (org_id, member_id)
);
CREATE TABLE IF NOT EXISTS game_counters (
  org_id TEXT NOT NULL, member_id TEXT NOT NULL, key TEXT NOT NULL, value INTEGER NOT NULL,
  PRIMARY KEY (org_id, member_id, key)
);
CREATE TABLE IF NOT EXISTS game_achievements (
  org_id TEXT NOT NULL, member_id TEXT NOT NULL, achievement_id TEXT NOT NULL, unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, member_id, achievement_id)
);
CREATE TABLE IF NOT EXISTS game_crates (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, member_id TEXT NOT NULL, rarity TEXT NOT NULL,
  source TEXT NOT NULL, earned_at INTEGER NOT NULL, opened_at INTEGER, reward_json TEXT,
  reward_coins INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS game_crates_member ON game_crates (org_id, member_id, earned_at);
CREATE TABLE IF NOT EXISTS game_inventory (
  org_id TEXT NOT NULL, member_id TEXT NOT NULL, kind TEXT NOT NULL, item_id TEXT NOT NULL,
  name TEXT NOT NULL, rarity TEXT NOT NULL, acquired_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, member_id, item_id)
);
CREATE TABLE IF NOT EXISTS game_boosts (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, member_id TEXT NOT NULL, multiplier REAL NOT NULL,
  starts_at INTEGER NOT NULL, until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS game_boosts_member ON game_boosts (org_id, member_id, until);
CREATE TABLE IF NOT EXISTS game_challenges (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, member_id TEXT NOT NULL, day TEXT NOT NULL, slot INTEGER NOT NULL,
  pool_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, metric TEXT NOT NULL,
  target INTEGER NOT NULL, progress INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL, completed_at INTEGER,
  UNIQUE (org_id, member_id, day, pool_id)
);
CREATE INDEX IF NOT EXISTS game_challenges_member ON game_challenges (org_id, member_id, day);
CREATE TABLE IF NOT EXISTS game_squad_bonus (
  org_id TEXT NOT NULL, project_id TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (org_id, project_id)
);
CREATE TABLE IF NOT EXISTS game_feed (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, member_id TEXT NOT NULL, text TEXT NOT NULL,
  kind TEXT NOT NULL, xp INTEGER NOT NULL, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS game_feed_org ON game_feed (org_id, at);
`,
  },
];

export function migrate(db: Database.Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS game_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM game_migrations').get() as { v: number | null };
  const current = row.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO game_migrations (version, applied_at) VALUES (?, ?)').run(m.version, Date.now());
    })();
  }
}
