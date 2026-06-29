#!/usr/bin/env -S npx tsx
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// cli/bin/companybrain.ts
import { spawn } from "node:child_process";
import { platform } from "node:os";

// packages/db/src/index.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

// packages/db/src/sqlite.ts
import Database from "better-sqlite3";
var DDL = `
CREATE TABLE IF NOT EXISTS loops  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, side TEXT, status TEXT, updated_at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, day TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads  (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, stage TEXT, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, type TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings  (org_id TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, status TEXT, at INTEGER, doc TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_loops_org  ON loops(org_id, side);
CREATE INDEX IF NOT EXISTS idx_tasks_org  ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_org  ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id, at);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id, status, at);
`;
var SqliteDatabase = class {
  db;
  loops;
  tasks;
  leads;
  events;
  settings;
  approvals;
  constructor(filePath) {
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    const db = this.db;
    this.loops = {
      async list(orgId, side) {
        const rows = side ? db.prepare("SELECT doc FROM loops WHERE org_id=? AND side=? ORDER BY updated_at DESC").all(orgId, side) : db.prepare("SELECT doc FROM loops WHERE org_id=? ORDER BY updated_at DESC").all(orgId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM loops WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      },
      async insert(loop) {
        db.prepare("INSERT INTO loops (id, org_id, side, status, updated_at, doc) VALUES (?,?,?,?,?,?)").run(loop.id, loop.orgId, loop.side, loop.status, loop.updatedAt, JSON.stringify(loop));
        return loop;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`loop ${id} not found`);
        const next = { ...cur, ...patch, updatedAt: Date.now() };
        db.prepare("UPDATE loops SET side=?, status=?, updated_at=?, doc=? WHERE id=?").run(next.side, next.status, next.updatedAt, JSON.stringify(next), id);
        return next;
      },
      async remove(id) {
        db.prepare("DELETE FROM loops WHERE id=?").run(id);
      }
    };
    this.tasks = {
      async list(orgId) {
        const rows = db.prepare("SELECT doc FROM tasks WHERE org_id=?").all(orgId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM tasks WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      },
      async insert(task) {
        db.prepare("INSERT INTO tasks (id, org_id, day, doc) VALUES (?,?,?,?)").run(task.id, task.orgId, task.day, JSON.stringify(task));
        return task;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`task ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare("UPDATE tasks SET day=?, doc=? WHERE id=?").run(next.day, JSON.stringify(next), id);
        return next;
      },
      async remove(id) {
        db.prepare("DELETE FROM tasks WHERE id=?").run(id);
      }
    };
    this.leads = {
      async list(orgId) {
        const rows = db.prepare("SELECT doc FROM leads WHERE org_id=?").all(orgId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM leads WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      },
      async insert(lead) {
        db.prepare("INSERT INTO leads (id, org_id, stage, doc) VALUES (?,?,?,?)").run(lead.id, lead.orgId, lead.stage, JSON.stringify(lead));
        return lead;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`lead ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare("UPDATE leads SET stage=?, doc=? WHERE id=?").run(next.stage, JSON.stringify(next), id);
        return next;
      },
      async remove(id) {
        db.prepare("DELETE FROM leads WHERE id=?").run(id);
      }
    };
    this.events = {
      async append(event) {
        db.prepare("INSERT INTO events (id, org_id, type, at, doc) VALUES (?,?,?,?,?)").run(event.id, event.orgId, event.type, event.at, JSON.stringify(event));
        return event;
      },
      async list(orgId, limit = 100) {
        const rows = db.prepare("SELECT doc FROM events WHERE org_id=? ORDER BY at DESC LIMIT ?").all(orgId, limit);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM events WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      }
    };
    this.settings = {
      async getAutonomy(orgId) {
        const row = db.prepare("SELECT doc FROM settings WHERE org_id=?").get(orgId);
        return row ? JSON.parse(row.doc) : null;
      },
      async setAutonomy(orgId, settings) {
        db.prepare("INSERT INTO settings (org_id, doc) VALUES (?,?) ON CONFLICT(org_id) DO UPDATE SET doc=excluded.doc").run(orgId, JSON.stringify(settings));
      }
    };
    this.approvals = {
      async insert(approval) {
        db.prepare("INSERT INTO approvals (id, org_id, status, at, doc) VALUES (?,?,?,?,?)").run(approval.id, approval.orgId, approval.status, approval.createdAt, JSON.stringify(approval));
        return approval;
      },
      async list(orgId, status) {
        const rows = status ? db.prepare("SELECT doc FROM approvals WHERE org_id=? AND status=? ORDER BY at DESC").all(orgId, status) : db.prepare("SELECT doc FROM approvals WHERE org_id=? ORDER BY at DESC").all(orgId);
        return rows.map((r) => JSON.parse(r.doc));
      },
      async get(id) {
        const row = db.prepare("SELECT doc FROM approvals WHERE id=?").get(id);
        return row ? JSON.parse(row.doc) : null;
      },
      async update(id, patch) {
        const cur = await this.get(id);
        if (!cur) throw new Error(`approval ${id} not found`);
        const next = { ...cur, ...patch };
        db.prepare("UPDATE approvals SET status=?, doc=? WHERE id=?").run(next.status, JSON.stringify(next), id);
        return next;
      }
    };
  }
  async init() {
    this.db.exec(DDL);
  }
  async close() {
    this.db.close();
  }
};

// packages/db/src/index.ts
function createDatabase(opts = {}) {
  const fromEnv = process.env.COMPANYBRAIN_DB_PATH;
  const dir = join(homedir(), ".companybrain");
  mkdirSync(dir, { recursive: true });
  return new SqliteDatabase(opts.sqlitePath ?? fromEnv ?? join(dir, "companybrain.sqlite"));
}

// packages/queue/src/in-process.ts
var InProcessQueue = class {
  handlers = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Set();
  started = false;
  async init() {
  }
  on(name, handler) {
    this.handlers.set(name, handler);
  }
  async run(name, data) {
    const handler = this.handlers.get(name);
    if (!handler) {
      console.warn(`[queue] no handler registered for "${name}" \u2014 dropping job`);
      return;
    }
    try {
      await handler(data);
    } catch (err) {
      console.error(`[queue] job "${name}" failed:`, err);
    }
  }
  async enqueue(name, data, opts = {}) {
    const fire = () => void this.run(name, data);
    if (opts.delayMs && opts.delayMs > 0) {
      const t = setTimeout(() => {
        this.timers.delete(t);
        fire();
      }, opts.delayMs);
      this.timers.add(t);
    } else {
      queueMicrotask(fire);
    }
  }
  async schedule(name, data, everyMs) {
    const t = setInterval(() => void this.run(name, data), everyMs);
    this.timers.add(t);
  }
  async start() {
    this.started = true;
  }
  async close() {
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers.clear();
    this.started = false;
  }
};

// packages/queue/src/index.ts
function createQueue() {
  return new InProcessQueue();
}

// packages/auth/src/local.ts
var LOCAL_ORG_ID = "org_local";
var LOCAL_USER_ID = "user_local";
var LocalAuth = class {
  principal;
  constructor(role = "ceo") {
    this.principal = { userId: LOCAL_USER_ID, orgId: LOCAL_ORG_ID, role };
  }
  async init() {
  }
  async authenticate() {
    return this.principal;
  }
  async current() {
    return this.principal;
  }
  /** single local user can do everything */
  can(_principal, _capability) {
    return true;
  }
};

// packages/auth/src/index.ts
function createAuth() {
  return new LocalAuth();
}

// packages/core/src/context.ts
import { randomUUID } from "node:crypto";
var consoleMessenger = {
  async send({ channel, to, text }) {
    console.log(`[messenger:noop] would send via ${channel} \u2192 ${to}: ${text}`);
  }
};
var templateDrafter = {
  async draftReply({ title }) {
    return `Thanks \u2014 we\u2019ve logged \u201C${title}\u201D and someone will get back to you shortly. \u{1F91D}`;
  }
};
var newId = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;
var now = () => Date.now();
async function record(ctx, input) {
  const event = {
    id: newId("evt"),
    orgId: input.orgId,
    type: input.type,
    entityId: input.entityId,
    actorId: input.actorId,
    reversible: input.reversible ?? true,
    undo: input.undo ?? null,
    channel: input.channel,
    at: now()
  };
  return ctx.db.events.append(event);
}

// packages/core/src/autonomy.ts
var DEFAULT_AUTONOMY = {
  draftReplies: "auto",
  chase: "auto",
  sendReminders: "auto",
  createTasks: "off",
  joinMeetings: "off"
};
var ACTION_JOB = {
  draftReplies: "replyLoop",
  chase: "chaseLoop",
  sendReminders: "sendReminder"
};
async function resolveAutonomy(db, orgId) {
  const stored = await db.settings.getAutonomy(orgId);
  return { ...DEFAULT_AUTONOMY, ...stored ?? {} };
}
async function dispatch(ctx, action, loopId, orgId, delayMs = 0) {
  const job = ACTION_JOB[action];
  if (!job || !loopId) return;
  await ctx.queue.enqueue(job, { loopId, orgId }, delayMs > 0 ? { delayMs } : void 0);
}
async function queueForApproval(ctx, action, opts) {
  const approval = {
    id: newId("appr"),
    orgId: opts.orgId,
    action,
    loopId: opts.loopId,
    title: opts.title,
    status: "pending",
    createdAt: now()
  };
  await ctx.db.approvals.insert(approval);
  await record(ctx, { orgId: opts.orgId, type: "approval.created", entityId: approval.id, actorId: "agent_scout" });
  return approval;
}
async function gateAction(ctx, action, opts) {
  const level = (await resolveAutonomy(ctx.db, opts.orgId))[action];
  if (level === "auto") await dispatch(ctx, action, opts.loopId, opts.orgId, opts.delayMs);
  else if (level === "ask") await queueForApproval(ctx, action, opts);
  return level;
}
function makeAutonomy(ctx) {
  return {
    get: (orgId) => resolveAutonomy(ctx.db, orgId),
    async set(orgId, action, level) {
      const next = { ...await resolveAutonomy(ctx.db, orgId), [action]: level };
      await ctx.db.settings.setAutonomy(orgId, next);
      await record(ctx, { orgId, type: "autonomy.changed", entityId: orgId, actorId: "user_local" });
      return next;
    },
    /** Gate an action through the org's autonomy config. */
    gate: (action, opts) => gateAction(ctx, action, opts)
  };
}
function makeApprovals(ctx) {
  return {
    list: (orgId, status = "pending") => ctx.db.approvals.list(orgId, status),
    async approve(id) {
      const a = await ctx.db.approvals.get(id);
      if (!a) throw new Error(`approval ${id} not found`);
      if (a.status === "pending") await dispatch(ctx, a.action, a.loopId, a.orgId);
      const next = await ctx.db.approvals.update(id, { status: "approved" });
      await record(ctx, { orgId: a.orgId, type: "approval.approved", entityId: id, actorId: "user_local" });
      return next;
    },
    async dismiss(id) {
      const a = await ctx.db.approvals.get(id);
      if (!a) throw new Error(`approval ${id} not found`);
      const next = await ctx.db.approvals.update(id, { status: "dismissed" });
      await record(ctx, { orgId: a.orgId, type: "approval.dismissed", entityId: id, actorId: "user_local" });
      return next;
    }
  };
}

// packages/core/src/loops.ts
var CHASE_DELAY_MS = 6e4;
function makeLoops(ctx) {
  return {
    list(orgId, side) {
      return ctx.db.loops.list(orgId, side);
    },
    get(id) {
      return ctx.db.loops.get(id);
    },
    /** Turn anything that needs a human into a tracked loop, and schedule the chase. */
    async capture(input) {
      const loop = {
        id: newId("loop"),
        orgId: input.orgId,
        title: input.title,
        why: input.why,
        side: input.side,
        status: "open",
        channel: input.channel,
        sourceRef: input.sourceRef,
        replyTo: input.replyTo,
        ownerId: input.ownerId,
        dueAt: input.dueAt ?? null,
        createdAt: now(),
        updatedAt: now()
      };
      await ctx.db.loops.insert(loop);
      await record(ctx, {
        orgId: loop.orgId,
        type: "loop.captured",
        entityId: loop.id,
        actorId: input.actorId,
        channel: loop.channel,
        undo: { delete: loop.id }
      });
      if (loop.side === "theirs") {
        await gateAction(ctx, "chase", { orgId: loop.orgId, loopId: loop.id, title: `Chase: ${loop.title}`, delayMs: CHASE_DELAY_MS });
      }
      return loop;
    },
    async close(id, actorId) {
      const prev = await ctx.db.loops.get(id);
      if (!prev) throw new Error(`loop ${id} not found`);
      const loop = await ctx.db.loops.update(id, { status: "closed" });
      await record(ctx, {
        orgId: loop.orgId,
        type: "loop.closed",
        entityId: loop.id,
        actorId,
        undo: { restoreStatus: prev.status }
      });
      return loop;
    },
    async snooze(id, actorId, untilAt) {
      const loop = await ctx.db.loops.update(id, { status: "snoozed", dueAt: untilAt });
      await record(ctx, { orgId: loop.orgId, type: "loop.snoozed", entityId: loop.id, actorId });
      await ctx.queue.enqueue("sendReminder", { loopId: loop.id, orgId: loop.orgId }, { delayMs: Math.max(0, untilAt - now()) });
      return loop;
    }
  };
}

// packages/core/src/tasks.ts
function makeTasks(ctx) {
  return {
    list(orgId) {
      return ctx.db.tasks.list(orgId);
    },
    async create(input) {
      const task = {
        id: newId("task"),
        orgId: input.orgId,
        emoji: input.emoji ?? "\u2705",
        title: input.title,
        list: input.list ?? "Inbox",
        day: input.day ?? "today",
        priority: input.priority ?? null,
        recurring: Boolean(input.recur),
        recur: input.recur ?? null,
        assignees: input.assignees ?? [input.actorId],
        createdBy: input.actorId,
        dueAt: input.dueAt ?? null,
        createdAt: now()
      };
      await ctx.db.tasks.insert(task);
      await record(ctx, { orgId: task.orgId, type: "task.created", entityId: task.id, actorId: input.actorId, undo: { delete: task.id } });
      return task;
    },
    async move(id, day, actorId) {
      const prev = await ctx.db.tasks.get(id);
      if (!prev) throw new Error(`task ${id} not found`);
      const task = await ctx.db.tasks.update(id, { day });
      await record(ctx, { orgId: task.orgId, type: "task.moved", entityId: id, actorId, undo: { restoreDay: prev.day } });
      return task;
    },
    async complete(id, actorId) {
      const task = await ctx.db.tasks.update(id, { day: "today" });
      await record(ctx, { orgId: task.orgId, type: "task.completed", entityId: id, actorId });
      return task;
    }
  };
}

// packages/core/src/leads.ts
var STAGE_ORDER = ["new", "contacted", "meeting", "proposal", "won", "lost"];
function makeLeads(ctx) {
  return {
    list(orgId) {
      return ctx.db.leads.list(orgId);
    },
    async create(input) {
      const lead = {
        id: newId("lead"),
        orgId: input.orgId,
        name: input.name,
        company: input.company ?? "",
        title: input.title ?? "",
        phone: input.phone ?? "",
        email: input.email ?? "",
        stage: "new",
        source: input.source ?? "manual",
        what: input.what ?? "",
        createdBy: input.actorId,
        assignedTo: input.assignedTo ?? [input.actorId],
        createdAt: now()
      };
      await ctx.db.leads.insert(lead);
      await record(ctx, { orgId: lead.orgId, type: "lead.created", entityId: lead.id, actorId: input.actorId, channel: lead.source, undo: { delete: lead.id } });
      return lead;
    },
    async advance(id, actorId) {
      const cur = await ctx.db.leads.get(id);
      if (!cur) throw new Error(`lead ${id} not found`);
      const idx = STAGE_ORDER.indexOf(cur.stage);
      const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.indexOf("won"))];
      const lead = await ctx.db.leads.update(id, { stage: next });
      await record(ctx, { orgId: lead.orgId, type: "lead.advanced", entityId: id, actorId, undo: { restoreStage: cur.stage } });
      return lead;
    },
    /**
     * "Quick-add from a phone number + rough note" → a structured lead.
     * The AI extraction is stubbed here; the server injects the real LLM call server-side.
     */
    async quickAddFromNote(input, extract) {
      const guessed = extract ? await extract(input.note) : { name: input.note.split(/\s+/).slice(0, 2).join(" ") || "New lead", what: input.note };
      return this.create({
        orgId: input.orgId,
        actorId: input.actorId,
        name: guessed.name ?? "New lead",
        company: guessed.company,
        title: guessed.title,
        phone: input.phone,
        email: guessed.email,
        source: "whatsapp",
        what: guessed.what ?? input.note
      });
    }
  };
}

// packages/core/src/agents.ts
var AGENT_ROSTER = [
  { id: "agent_scout", name: "Scout", emoji: "\u{1F52D}", role: "Watches channels, captures loops", autonomy: "auto", done: 142, pending: 3 },
  { id: "agent_atlas", name: "Atlas", emoji: "\u{1F5FA}\uFE0F", role: "Plans projects, breaks down tasks", autonomy: "ask", done: 38, pending: 1 },
  { id: "agent_ledger", name: "Ledger", emoji: "\u{1F4D2}", role: "Chases leads, drafts follow-ups", autonomy: "ask", done: 64, pending: 5 }
];
function makeAgents() {
  return {
    roster() {
      return AGENT_ROSTER;
    }
  };
}

// packages/core/src/undo.ts
async function undoEvent(ctx, eventId) {
  const ev = await ctx.db.events.get(eventId);
  if (!ev) throw notReversible(`event ${eventId} not found`);
  if (!ev.reversible || !ev.undo) throw notReversible(`event ${eventId} is not reversible`);
  const u = ev.undo;
  if (u.delete) {
    const id = u.delete;
    if (id.startsWith("loop_")) await ctx.db.loops.remove(id);
    else if (id.startsWith("task_")) await ctx.db.tasks.remove(id);
    else if (id.startsWith("lead_")) await ctx.db.leads.remove(id);
    else throw notReversible(`don't know how to delete ${id}`);
  } else if (u.restoreStatus) {
    await ctx.db.loops.update(ev.entityId, { status: u.restoreStatus });
  } else if (u.restoreDay) {
    await ctx.db.tasks.update(ev.entityId, { day: u.restoreDay });
  } else if (u.restoreStage) {
    await ctx.db.leads.update(ev.entityId, { stage: u.restoreStage });
  } else {
    throw notReversible(`event ${eventId} has no known undo action`);
  }
  await record(ctx, { orgId: ev.orgId, type: "event.undone", entityId: eventId, actorId: "user_local", reversible: false });
  return { undone: eventId, type: ev.type };
}
function notReversible(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// packages/core/src/workers.ts
function registerWorkers(ctx) {
  ctx.queue.on("replyLoop", async ({ loopId, orgId }) => {
    const loop = await ctx.db.loops.get(loopId);
    if (!loop || loop.status === "closed") return;
    if (!loop.replyTo) {
      console.warn(`[worker] replyLoop ${loopId}: no replyTo address \u2014 skipping send`);
      return;
    }
    const text = await ctx.drafter.draftReply({ title: loop.title, why: loop.why, channel: loop.channel });
    await ctx.messenger.send({ channel: loop.channel, to: loop.replyTo, text });
    await record(ctx, { orgId, type: "reply.sent", entityId: loopId, actorId: "agent_scout", channel: loop.channel });
    console.log(`[worker] replied to ${loop.replyTo} for loop ${loopId}`);
  });
  ctx.queue.on("chaseLoop", async ({ loopId, orgId }) => {
    const loop = await ctx.db.loops.get(loopId);
    if (!loop || loop.status === "closed") return;
    if (loop.replyTo) {
      await ctx.messenger.send({ channel: loop.channel, to: loop.replyTo, text: `Just following up on: ${loop.title} \u{1F642}` });
    }
    await record(ctx, { orgId, type: "reminder.sent", entityId: loopId, actorId: "agent_scout", channel: loop.channel });
    console.log(`[worker] chased loop ${loopId}: "${loop.title}"`);
  });
  ctx.queue.on("sendReminder", async ({ loopId, orgId }) => {
    const loop = await ctx.db.loops.get(loopId);
    if (!loop || loop.status === "closed") return;
    await record(ctx, { orgId, type: "reminder.sent", entityId: loopId, actorId: "agent_scout" });
    console.log(`[worker] reminder fired for loop ${loopId}`);
  });
  ctx.queue.on("sendBriefing", async ({ orgId }) => {
    const open = await ctx.db.loops.list(orgId);
    const yours = open.filter((l) => l.side === "yours" && l.status !== "closed").length;
    console.log(`[worker] briefing for ${orgId}: ${yours} loop(s) in your court`);
    await record(ctx, { orgId, type: "briefing.delivered", entityId: orgId, actorId: "agent_scout" });
  });
  ctx.queue.on("autoSweep", async ({ orgId }) => {
    const open = await ctx.db.loops.list(orgId);
    console.log(`[worker] nightly sweep for ${orgId}: ${open.length} loop(s) reviewed`);
  });
}

// packages/core/src/seed.ts
async function seedIfEmpty(core) {
  const existing = await core.loops.list(LOCAL_ORG_ID);
  if (existing.length > 0) return;
  const org = LOCAL_ORG_ID;
  const me = LOCAL_USER_ID;
  await core.loops.capture({ orgId: org, actorId: me, title: "Reply to Priya re: contract", why: "She asked 2 days ago", side: "yours", channel: "email" });
  await core.loops.capture({ orgId: org, actorId: me, title: "Waiting on design files from Sam", why: "Promised Monday", side: "theirs", channel: "slack" });
  await core.loops.capture({ orgId: org, actorId: me, title: "Confirm Thursday demo time", why: "WhatsApp from lead", side: "yours", channel: "whatsapp" });
  await core.tasks.create({ orgId: org, actorId: me, emoji: "\u{1F4DD}", title: "Draft Q3 plan", day: "today", priority: "high" });
  await core.tasks.create({ orgId: org, actorId: me, emoji: "\u{1F4DE}", title: "Call supplier", day: "tomorrow", priority: "med" });
  await core.leads.create({ orgId: org, actorId: me, name: "Aisha Khan", company: "Northwind", title: "Head of Ops", phone: "+971500000000", what: "Interested in team plan" });
}

// packages/core/src/index.ts
function createCoreFromPorts(ports) {
  const ctx = {
    db: ports.db,
    queue: ports.queue,
    auth: ports.auth,
    messenger: ports.messenger ?? consoleMessenger,
    drafter: ports.drafter ?? templateDrafter
  };
  return {
    ctx,
    loops: makeLoops(ctx),
    tasks: makeTasks(ctx),
    leads: makeLeads(ctx),
    agents: makeAgents(),
    autonomy: makeAutonomy(ctx),
    approvals: makeApprovals(ctx),
    events: {
      list: (orgId, limit) => ctx.db.events.list(orgId, limit),
      undo: (eventId) => undoEvent(ctx, eventId)
    }
  };
}
async function bootstrap(opts = {}) {
  const db = createDatabase(opts.db);
  const queue = createQueue();
  const auth = createAuth();
  await db.init();
  await queue.init();
  await auth.init();
  const core = createCoreFromPorts({ db, queue, auth, messenger: opts.messenger, drafter: opts.drafter });
  registerWorkers(core.ctx);
  return {
    core,
    db,
    queue,
    auth,
    async startWorkers() {
      await queue.start();
    },
    async shutdown() {
      await queue.close();
      await db.close();
    }
  };
}

// packages/server/src/server.ts
import Fastify from "fastify";

// packages/integrations/src/pipeline.ts
function needsHuman(msg) {
  const t = msg.text.trim().toLowerCase();
  if (!t) return false;
  if (["ok", "\u{1F44D}", "thanks", "thank you", "noted"].includes(t)) return false;
  return true;
}
async function ingest(core, msg) {
  if (!needsHuman(msg)) return null;
  const loop = await core.loops.capture({
    orgId: msg.orgId,
    actorId: "agent_scout",
    title: summarize(msg.text),
    why: `${msg.channel} from ${msg.from}`,
    side: "yours",
    channel: msg.channel,
    sourceRef: msg.ref,
    // remember who to reply to on this channel (the sender's phone for WhatsApp)
    replyTo: msg.from,
    ownerId: msg.ownerId
  });
  await core.autonomy.gate("draftReplies", { orgId: msg.orgId, loopId: loop.id, title: `Auto-reply: ${loop.title}` });
  return loop.id;
}
function summarize(text) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, 6).join(" ") + (words.length > 6 ? "\u2026" : "");
}

// packages/integrations/src/whatsapp/cloud-api.ts
var cloud_api_exports = {};
__export(cloud_api_exports, {
  parseInbound: () => parseInbound,
  sendText: () => sendText,
  verifyWebhook: () => verifyWebhook,
  whatsappConfigFromEnv: () => whatsappConfigFromEnv
});
var GRAPH = "https://graph.facebook.com/v21.0";
function whatsappConfigFromEnv(env = process.env) {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  const verifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!phoneNumberId || !accessToken || !verifyToken) return null;
  return { phoneNumberId, accessToken, verifyToken };
}
function verifyWebhook(cfg, query) {
  if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === cfg.verifyToken) {
    return query["hub.challenge"] ?? "";
  }
  return null;
}
function parseInbound(orgId, body) {
  const out = [];
  const entries = body?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      for (const m of value?.messages ?? []) {
        const text = m?.text?.body ?? m?.button?.text ?? "";
        out.push({ orgId, channel: "whatsapp", from: m?.from ?? "unknown", text, ref: m?.id });
      }
    }
  }
  return out;
}
async function sendText(cfg, to, body) {
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } })
  });
  if (!res.ok) {
    throw new Error(`WhatsApp sendText failed: ${res.status} ${await res.text()}`);
  }
}

// packages/integrations/src/messenger.ts
function createMessenger(cfg) {
  return {
    async send(msg) {
      switch (msg.channel) {
        case "whatsapp":
          if (!cfg.whatsapp) {
            console.log(`[messenger] WhatsApp send-credentials not set \u2192 would reply to ${msg.to}: ${msg.text}`);
            return;
          }
          await sendText(cfg.whatsapp, msg.to, msg.text);
          return;
        // email / slack / telegram fan in here as they're added.
        default:
          console.log(`[messenger] no sender wired for channel "${msg.channel}" \u2192 ${msg.to}: ${msg.text}`);
      }
    }
  };
}

// packages/integrations/src/llm.ts
import Anthropic from "@anthropic-ai/sdk";
var LEAD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    company: { type: "string" },
    title: { type: "string" },
    email: { type: "string" },
    what: { type: "string" }
  },
  required: ["name", "company", "title", "email", "what"]
};
function guess(note) {
  return { name: note.split(/\s+/).slice(0, 2).join(" ") || "New lead", what: note };
}
function createLlm(env = process.env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  return {
    async extractLead(note) {
      try {
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 1024,
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: LEAD_SCHEMA }
          },
          messages: [
            {
              role: "user",
              content: `Extract structured lead fields from this note. Use an empty string for anything not stated.

Note: ${note}`
            }
          ]
        });
        const block = response.content.find((b) => b.type === "text");
        if (!block || block.type !== "text") return guess(note);
        const parsed = JSON.parse(block.text);
        return { ...parsed, what: parsed.what || note };
      } catch {
        return guess(note);
      }
    },
    async draftReply(input) {
      const fallback = `Thanks \u2014 we\u2019ve logged \u201C${input.title}\u201D and someone will get back to you shortly. \u{1F91D}`;
      try {
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 256,
          output_config: { effort: "low" },
          system: "You write the first auto-acknowledgement a business sends back when a message arrives on WhatsApp/SMS/email. One or two warm, professional sentences. Confirm receipt and that a human will follow up. No greeting line, no signature, no placeholders. Plain text only.",
          messages: [
            {
              role: "user",
              content: `Inbound on ${input.channel}. We logged it as: "${input.title}" (${input.why}). Write the acknowledgement reply.`
            }
          ]
        });
        const block = response.content.find((b) => b.type === "text");
        return block && block.type === "text" ? block.text.trim() || fallback : fallback;
      } catch {
        return fallback;
      }
    }
  };
}

// packages/integrations/src/whatsapp/baileys.ts
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
import qrcode from "qrcode-terminal";
import baileysPkg, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";
var makeWASocket = baileysPkg?.default ?? baileysPkg;
var silentLogger = {
  level: "silent",
  child: () => silentLogger,
  trace() {
  },
  debug() {
  },
  info() {
  },
  warn() {
  },
  error() {
  },
  fatal() {
  }
};
var toJid = (to) => to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
var numberFromJid = (jid) => jid.split("@")[0] ?? jid;
function createBaileysChannel(opts) {
  let sock = null;
  const authDir = opts.authDir ?? join2(homedir2(), ".companybrain", "wa");
  const messenger2 = {
    async send(msg) {
      if (msg.channel !== "whatsapp") {
        console.log(`[baileys] no sender wired for channel "${msg.channel}" \u2192 ${msg.to}`);
        return;
      }
      if (!sock) throw new Error("WhatsApp socket not connected yet (scan the QR first)");
      await sock.sendMessage(toJid(msg.to), { text: msg.text });
    }
  };
  async function start(core) {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({ version, auth: state, logger: silentLogger, printQRInTerminal: false, browser: ["companybrain", "Chrome", "1.0"] });
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        console.log("\n[whatsapp] open WhatsApp \u2192 Settings \u2192 Linked devices \u2192 Link a device, then scan:\n");
        qrcode.generate(qr, { small: true });
      }
      if (connection === "open") console.log("[whatsapp] connected \u2713");
      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message ?? "";
        const loggedOut = code === DisconnectReason.loggedOut;
        console.log(`[whatsapp] connection closed (code=${code ?? "?"} ${reason})${loggedOut ? " \u2014 logged out, delete ~/.companybrain/wa to re-pair" : " \u2014 reconnecting in 3s\u2026"}`);
        if (!loggedOut) setTimeout(() => void start(core).catch((e) => console.error("[whatsapp] reconnect failed:", e)), 3e3);
      }
    });
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        if (m.key.fromMe || !m.message) continue;
        const text = m.message.conversation ?? m.message.extendedTextMessage?.text ?? "";
        if (!text) continue;
        const from = numberFromJid(m.key.remoteJid ?? "");
        await ingest(core, { orgId: opts.orgId, channel: "whatsapp", from, text, ref: m.key.id ?? void 0 });
      }
    });
  }
  async function stop() {
    try {
      sock?.end(void 0);
    } catch {
    }
    sock = null;
  }
  return { messenger: messenger2, start, stop };
}

// packages/server/src/web-ui.ts
function renderUi() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>companybrain</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#0a0b0f; --surface:rgba(20,20,26,.62); --surface2:rgba(255,255,255,.04);
  --glass:rgba(20,20,26,.6); --glassThin:rgba(15,17,23,.62);
  --glassBorder:rgba(255,255,255,.1); --glassHi:rgba(255,255,255,.12);
  --text:#eef0f5; --muted:#9a9aa8; --faint:#6b6b78;
  --accent:#8b7bff; --accent2:#a78bff; --accentSoft:rgba(139,123,255,.18); --accentGlow:rgba(139,123,255,.4);
  --blue:#3e7bfa; --blue2:#5b93ff; --blueSoft:rgba(62,123,250,.15);
  --green:#37c08a; --greenSoft:rgba(55,192,138,.15);
  --amber:#e8a13a; --amberSoft:rgba(232,161,58,.15);
  --red:#f0556b; --redSoft:rgba(240,85,107,.14);
  --teal:#16b7ae; --tealSoft:rgba(22,183,174,.14);
  --scroll:rgba(160,160,180,.22);
  --nav-w:220px;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{margin:0;padding:0;height:100%;overflow:hidden;}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Hanken Grotesk',system-ui,sans-serif;font-size:14px;line-height:1.45;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-thumb{background:var(--scroll);border-radius:8px;border:2px solid transparent;background-clip:padding-box;}
::-webkit-scrollbar-track{background:transparent;}
input,button,textarea{font-family:inherit;}
input:focus,textarea:focus{outline:none;}
button{cursor:pointer;}

/* animations */
@keyframes cbFade{from{opacity:0}to{opacity:1}}
@keyframes cbFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes cbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
@keyframes cbSpin{to{transform:rotate(360deg)}}
@keyframes cbBlink{0%,100%{opacity:1}50%{opacity:.15}}
@keyframes cbDrift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(var(--dx,30px),var(--dy,-24px)) scale(1.12)}}
@keyframes cbMesh{0%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}33%{transform:translate(3%,2%) scale(1.22) rotate(4deg)}66%{transform:translate(-2%,3%) scale(1.18) rotate(-3deg)}100%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}}

/* layout */
#app{position:relative;width:100%;height:100vh;display:flex;flex-direction:column;overflow:hidden;}

/* animated blobs bg */
#bg-blobs{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
.blob{position:absolute;border-radius:50%;filter:blur(40px);}
.blob1{top:-12%;left:8%;width:46%;height:60%;background:radial-gradient(circle,rgba(139,123,255,.28),transparent 68%);--dx:40px;--dy:30px;animation:cbDrift 19s ease-in-out infinite;}
.blob2{top:30%;right:-6%;width:42%;height:58%;background:radial-gradient(circle,rgba(91,141,239,.22),transparent 68%);--dx:-32px;--dy:26px;animation:cbDrift 23s ease-in-out infinite;}
.blob3{bottom:-16%;left:34%;width:40%;height:52%;background:radial-gradient(circle,rgba(232,161,58,.14),transparent 68%);--dx:28px;--dy:-22px;animation:cbDrift 27s ease-in-out infinite;}
#mesh{position:absolute;inset:-25%;background:radial-gradient(38% 44% at 24% 28%,rgba(22,207,152,.22),transparent 64%),radial-gradient(40% 42% at 78% 26%,rgba(91,141,239,.18),transparent 66%),radial-gradient(44% 46% at 62% 82%,rgba(124,79,208,.18),transparent 66%);animation:cbMesh 28s ease-in-out infinite;pointer-events:none;}
#grain{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:.04;mix-blend-mode:soft-light;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');background-size:170px 170px;}

/* shell */
#shell{position:relative;z-index:1;display:flex;flex:1;min-height:0;}

/* sidebar */
#sidebar{width:var(--nav-w);flex-shrink:0;display:flex;flex-direction:column;padding:20px 14px;gap:4px;border-right:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
.logo-row{display:flex;align-items:center;gap:9px;padding:2px 8px 18px;}
.logo-text{font-family:'JetBrains Mono',monospace;font-weight:600;font-size:14px;letter-spacing:-.3px;}
.logo-text span{color:var(--accent);}
.logo-sub{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--faint);margin-top:3px;letter-spacing:.4px;}
.nav-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;color:var(--muted);transition:background .15s,color .15s;user-select:none;}
.nav-item:hover{background:rgba(255,255,255,.06);color:var(--text);}
.nav-item.active{background:rgba(139,123,255,.18);color:var(--text);}
.nav-item .ni{width:17px;height:17px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nav-badge{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent);color:#fff;font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;}
.sidebar-bot{margin-top:auto;display:flex;flex-direction:column;gap:8px;}
.agent-status{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:11px;background:var(--surface2);border:1px solid var(--glassBorder);}
.agent-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:cbPulse 2.4s ease-in-out infinite;}
.agent-label{font-size:11px;font-weight:500;line-height:1.2;}
.agent-sublabel{font-size:9px;color:var(--faint);font-family:'JetBrains Mono',monospace;margin-top:2px;}

/* main */
#main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}

/* top bar (mobile) */
#topbar{display:none;align-items:center;gap:10px;padding:11px 16px;flex-shrink:0;border-bottom:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
#topbar .logo-text{font-size:15px;}

/* content */
#content{flex:1;overflow-y:auto;min-height:0;padding:24px clamp(14px,4vw,28px) 100px;}
#content>div{max-width:1100px;margin:0 auto;animation:cbFadeUp .3s ease;}

/* section header */
.sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap;}
.sec-title{font-size:22px;font-weight:700;letter-spacing:-.5px;}
.sec-sub{font-size:12.5px;color:var(--muted);margin-top:3px;}

/* glass card */
.gc{background:var(--glass);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);border:1px solid var(--glassBorder);box-shadow:inset 0 1px 0 var(--glassHi),0 4px 16px rgba(0,0,0,.14);border-radius:16px;}

/* loop cards */
.loops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;}
.col-head{display:flex;align-items:center;gap:8px;margin-bottom:13px;padding:0 2px;}
.col-dot{width:9px;height:9px;border-radius:3px;}
.col-label{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;}
.col-count{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);}
.loop-card{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:14px;margin-bottom:10px;animation:cbFadeUp .3s ease both;}
.loop-card .check-btn{width:22px;height:22px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:border-color .15s;}
.loop-card .check-btn:hover{border-color:var(--green);}
.loop-info{flex:1;min-width:0;}
.loop-title{font-size:14px;font-weight:600;line-height:1.35;}
.loop-meta{font-size:12px;color:var(--muted);margin-top:4px;}
.loop-actions{display:flex;align-items:center;gap:12px;margin-top:10px;}
.age-pill{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:7px;white-space:nowrap;}
.age-fresh{background:var(--greenSoft);color:var(--green);}
.age-mid{background:var(--amberSoft);color:var(--amber);}
.age-old{background:var(--redSoft);color:var(--red);}
.link-btn{font-size:12px;font-weight:500;color:var(--muted);background:transparent;border:none;padding:0;}
.link-btn:hover{color:var(--text);}
.link-btn.accent{color:var(--accent);}
.link-btn.teal{color:var(--teal);}

/* quick-add bar */
#qbar{position:fixed;left:var(--nav-w);right:0;bottom:0;padding:12px clamp(14px,4vw,28px);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border-top:1px solid var(--glassBorder);display:flex;gap:10px;z-index:20;}
#qbar input{flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid var(--glassBorder);border-radius:12px;padding:11px 14px;font-size:14px;color:var(--text);}
#qbar input::placeholder{color:var(--faint);}
#qbar button{background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:12px;padding:11px 20px;font-size:13px;font-weight:600;color:#fff;box-shadow:0 4px 14px var(--accentGlow);}

/* segments / tabs */
.seg-bar{display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--glassBorder);width:fit-content;margin-bottom:18px;}
.seg-btn{padding:7px 14px;border-radius:9px;border:none;background:transparent;font-size:13px;font-weight:500;color:var(--muted);}
.seg-btn.on{background:rgba(255,255,255,.1);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.2);}

/* task/lead cards */
.item-card{display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-radius:14px;margin-bottom:9px;}
.item-card .check-btn{width:20px;height:20px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:border-color .15s;}
.item-card .check-btn:hover{border-color:var(--blue);}
.emoji-ic{font-size:18px;line-height:1;flex-shrink:0;margin-top:1px;}
.item-title{font-size:13.5px;font-weight:600;line-height:1.3;}
.item-sub{font-size:12px;color:var(--muted);margin-top:3px;}
.stage-pill{font-size:11px;font-weight:600;padding:3px 10px;border-radius:8px;white-space:nowrap;margin-left:auto;}

/* autonomy */
.auto-card{padding:15px 17px;border-radius:15px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.auto-info{flex:1;min-width:180px;}
.auto-label{font-size:14px;font-weight:600;}
.auto-desc{font-size:12px;color:var(--muted);margin-top:3px;}
.lvls{display:flex;gap:3px;padding:3px;border-radius:10px;background:rgba(0,0,0,.2);border:1px solid var(--glassBorder);}
.lvl{padding:6px 13px;border-radius:7px;border:none;background:transparent;font-size:12px;font-weight:600;color:var(--muted);}
.lvl.on{background:rgba(255,255,255,.12);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.25);}
.approve-card{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:14px;margin-bottom:9px;}
.approve-title{font-size:13px;font-weight:600;}
.approve-action{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--faint);margin-top:3px;}
.approve-btn{padding:7px 14px;border-radius:9px;border:none;font-size:12px;font-weight:600;}
.approve-btn.ok{background:linear-gradient(135deg,var(--green),#3ee3b0);color:#fff;}
.approve-btn.no{background:rgba(240,85,107,.14);color:var(--red);}

/* events */
.event-card{padding:12px 16px;border-radius:13px;margin-bottom:8px;display:flex;align-items:center;gap:12px;}
.event-type{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--accent);}
.event-meta{font-size:11.5px;color:var(--muted);margin-top:2px;}
.undo-btn{margin-left:auto;padding:6px 12px;border-radius:8px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);font-size:12px;font-weight:500;}
.undo-btn:hover{background:rgba(255,255,255,.06);color:var(--text);}
.rev-badge{margin-left:auto;font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:7px;background:var(--blueSoft);color:var(--blue);}

/* leads */
.stage-bar{display:flex;gap:6px;margin-bottom:18px;overflow-x:auto;padding-bottom:4px;}
.stage-chip{padding:7px 14px;border-radius:9px;border:1px solid var(--glassBorder);background:var(--surface2);font-size:12.5px;font-weight:500;color:var(--muted);white-space:nowrap;}
.stage-chip.on{background:rgba(139,123,255,.2);color:var(--accent);border-color:rgba(139,123,255,.3);}
.lead-stage-new{background:rgba(150,150,170,.12);color:var(--muted);}
.lead-stage-contacted{background:var(--blueSoft);color:var(--blue);}
.lead-stage-meeting{background:rgba(124,92,255,.15);color:#9b7bff;}
.lead-stage-proposal{background:var(--amberSoft);color:var(--amber);}
.lead-stage-won{background:var(--greenSoft);color:var(--green);}
.lead-stage-lost{background:rgba(100,100,120,.1);color:var(--faint);}

/* agents tab */
.agent-card{padding:16px 18px;border-radius:15px;margin-bottom:10px;}
.agent-name{font-size:14px;font-weight:700;}
.agent-role{font-size:12px;color:var(--muted);margin-top:2px;}
.auto-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;font-family:'JetBrains Mono',monospace;letter-spacing:.3px;}
.auto-auto{background:var(--greenSoft);color:var(--green);}
.auto-ask{background:var(--amberSoft);color:var(--amber);}
.auto-off{background:rgba(120,120,140,.12);color:var(--faint);}
.agent-stats{display:flex;gap:20px;margin-top:11px;padding-top:10px;border-top:1px solid var(--glassBorder);}
.agent-stat-val{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;}
.agent-stat-lbl{font-size:10.5px;color:var(--muted);margin-top:2px;}

/* mobile bottom nav */
#botnav{display:none;position:fixed;left:0;right:0;bottom:0;background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border-top:1px solid var(--glassBorder);padding:6px 6px max(8px,env(safe-area-inset-bottom));z-index:30;}
#botnav button{flex:1;border:none;background:transparent;padding:6px 0;font-size:10px;font-weight:600;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:3px;}
#botnav button.on{color:var(--accent);}
#botnav .bn-ic{font-size:18px;line-height:1;}

/* empty state */
.empty{color:var(--faint);text-align:center;padding:40px 0;font-size:13px;}
.empty-dashed{padding:30px 18px;text-align:center;border-radius:14px;border:1px dashed rgba(255,255,255,.1);color:var(--faint);font-size:12.5px;margin-top:4px;}

/* action buttons */
.btn-primary{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:11px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:600;box-shadow:0 4px 14px var(--accentGlow);}
.btn-ghost{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:10px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.05);color:var(--muted);font-size:12.5px;font-weight:500;}
.btn-ghost:hover{background:rgba(255,255,255,.08);color:var(--text);}

/* section header action row */
.head-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}

/* sweep / action bar above content */
.action-strip{display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap;}

/* loading spinner */
.spin{width:20px;height:20px;border:2.5px solid rgba(255,255,255,.12);border-top-color:var(--accent);border-radius:50%;animation:cbSpin .8s linear infinite;margin:40px auto;display:block;}

@media (max-width:700px){
  #sidebar{display:none;}
  #topbar{display:flex;}
  #botnav{display:flex;}
  #qbar{left:0;bottom:56px;}
  #content{padding:16px 14px 140px;}
}
</style>
</head>
<body>
<div id="app">
  <!-- animated background -->
  <div id="bg-blobs">
    <div id="mesh"></div>
    <div class="blob blob1"></div>
    <div class="blob blob2"></div>
    <div class="blob blob3"></div>
  </div>
  <div id="grain"></div>

  <div id="shell">
    <!-- DESKTOP SIDEBAR -->
    <nav id="sidebar">
      <div class="logo-row">
        <div>
          <div class="logo-text">company<span>brain</span></div>
          <div class="logo-sub">v1 \xB7 forget-nothing</div>
        </div>
      </div>
      <div id="side-nav"></div>
      <div class="sidebar-bot">
        <div class="agent-status">
          <div class="agent-dot"></div>
          <div>
            <div class="agent-label">Agent online</div>
            <div class="agent-sublabel">watching all channels</div>
          </div>
        </div>
      </div>
    </nav>

    <!-- MAIN AREA -->
    <main id="main">
      <!-- mobile top bar -->
      <div id="topbar">
        <div class="logo-text">company<span style="color:var(--accent)">brain</span></div>
        <div id="mob-seg" style="margin-left:auto;"></div>
      </div>

      <div id="content">
        <div id="view"><div class="spin"></div></div>
      </div>
    </main>
  </div>

  <!-- quick-add bar -->
  <form id="qbar" style="display:none">
    <input id="qfield" autocomplete="off"/>
    <button type="submit">Add</button>
  </form>

  <!-- mobile bottom nav -->
  <div id="botnav"></div>
</div>
<script>
(function(){
  var tab = 'loops', side = 'yours', taskDay = 'today', leadView = 'all';

  var TABS = [
    {id:'loops',  ic:'\\u{1F501}', label:'Loops'},
    {id:'tasks',  ic:'\\u2705',    label:'Tasks'},
    {id:'leads',  ic:'\\u{1F91D}',label:'Leads'},
    {id:'agents', ic:'\\u{1F916}',label:'Agents'},
    {id:'auto',   ic:'\\u2699\\uFE0F',label:'Auto'},
    {id:'events', ic:'\\u{1F4DC}',label:'Activity'},
  ];

  var SVG = {
    loops:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    tasks:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    leads:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    agents:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M8 13h.01M16 13h.01"/></svg>',
    auto:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.1 5A9 9 0 0 1 21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9"/></svg>',
    events:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3M12 2v3"/></svg>',
  };

  var ACTIONS = [
    {k:'draftReplies', label:'Draft replies', desc:'Acknowledge inbound messages automatically'},
    {k:'chase', label:'Chase loops', desc:'Nudge when the ball is in their court'},
    {k:'sendReminders', label:'Send reminders', desc:'Remind on snoozed loops before they slip'},
    {k:'createTasks', label:'Create tasks', desc:'Turn asks in messages into tasks'},
    {k:'joinMeetings', label:'Join meetings', desc:'Attend and take notes autonomously'},
  ];

  var view = document.getElementById('view');
  var qbar = document.getElementById('qbar');
  var qfield = document.getElementById('qfield');

  // \u2500\u2500 helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function esc(s){return (s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function api(path,opts){return fetch(path,opts).then(function(r){return r.json().catch(function(){return null;});});}
  function post(path,body,method){return api(path,{method:method||'POST',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});}
  function ago(ts){
    var d=(Date.now()-ts)/1e3;
    if(d<60) return 'just now';
    if(d<3600) return Math.round(d/60)+'m';
    if(d<86400) return Math.round(d/3600)+'h';
    return Math.round(d/86400)+'d';
  }
  function ageCls(ts){
    var d=(Date.now()-ts)/86400e3;
    if(d<1) return 'age-fresh';
    if(d<3) return 'age-mid';
    return 'age-old';
  }
  function stageCls(s){return 'lead-stage-'+(s||'new');}
  function autoBadge(a){return '<span class="auto-badge auto-'+(a||'off')+'">'+(a||'off').toUpperCase()+'</span>';}

  // \u2500\u2500 nav \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function buildNav(){
    var sn = document.getElementById('side-nav');
    sn.innerHTML = TABS.map(function(t){
      return '<div class="nav-item'+(t.id===tab?' active':'') +'" data-tab="'+t.id+'">'
        +'<span class="ni">'+SVG[t.id]+'</span>'+t.label+'</div>';
    }).join('');
    sn.querySelectorAll('.nav-item').forEach(function(el){
      el.onclick=function(){tab=el.dataset.tab;buildNav();buildBotNav();render();};
    });

    var bn = document.getElementById('botnav');
    bn.style.display='flex';
    bn.innerHTML = TABS.map(function(t){
      return '<button data-tab="'+t.id+'" class="'+(t.id===tab?'on':'') +'"><span class="bn-ic">'+t.ic+'</span>'+t.label+'</button>';
    }).join('');
    bn.querySelectorAll('button').forEach(function(b){
      b.onclick=function(){tab=b.dataset.tab;buildNav();buildBotNav();render();};
    });
  }
  function buildBotNav(){
    document.querySelectorAll('#botnav button').forEach(function(b){b.classList.toggle('on',b.dataset.tab===tab);});
    document.querySelectorAll('#side-nav .nav-item').forEach(function(el){el.classList.toggle('active',el.dataset.tab===tab);});
  }

  // \u2500\u2500 segment bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function segBar(opts,cur,onPick){
    var el = document.createElement('div');
    el.className='seg-bar';
    el.innerHTML=opts.map(function(o){return '<button class="seg-btn'+(o.v===cur?' on':'')+'" data-v="'+o.v+'">'+o.label+'</button>';}).join('');
    el.querySelectorAll('.seg-btn').forEach(function(b){b.onclick=function(){onPick(b.dataset.v);};});
    return el;
  }

  // \u2500\u2500 render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function render(){
    var showBar = tab==='loops'||tab==='tasks'||tab==='leads';
    qbar.style.display = showBar?'flex':'none';
    qfield.placeholder = tab==='loops'?'Capture a loop\u2026':tab==='tasks'?'Add a task for today\u2026':'Add lead (name or paste a note)\u2026';
    view.innerHTML='<div class="spin"></div>';
    if(tab==='loops')  loadLoops();
    else if(tab==='tasks') loadTasks();
    else if(tab==='leads') loadLeads();
    else if(tab==='agents') loadAgents();
    else if(tab==='auto') loadAuto();
    else loadEvents();
  }

  // \u2500\u2500 loops \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadLoops(){
    api('/api/loops').then(function(all){
      all=all||[];
      var yours=all.filter(function(l){return l.side==='yours';});
      var theirs=all.filter(function(l){return l.side==='theirs';});

      var html='<div class="sec-head"><div><div class="sec-title">Open Loops</div>'
        +'<div class="sec-sub">Who owes the next move across every channel.</div></div>'
        +'<div class="head-actions"><button class="btn-ghost" id="sweep-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Sweep now</button></div></div>'
        +'<div class="loops-grid">'
        +loopCol('Your court','waiting on you','#e8a13a',yours)
        +loopCol('Their court','waiting on others','#2bc4bf',theirs)
        +'</div>';
      view.innerHTML=html;

      view.querySelectorAll('[data-close]').forEach(function(b){b.onclick=function(){post('/api/loops/'+b.dataset.close+'/close').then(loadLoops);};});
      view.querySelectorAll('[data-snooze]').forEach(function(b){b.onclick=function(){post('/api/loops/'+b.dataset.snooze+'/snooze',{hours:24}).then(loadLoops);};});
      var sw=document.getElementById('sweep-btn');
      if(sw) sw.onclick=function(){sw.disabled=true;loadLoops();};
    });
  }
  function loopCol(label,hint,dotColor,items){
    var cards = items.length ? items.map(function(l){
      var ageStr = ago(l.updatedAt||l.createdAt||Date.now());
      var cls = ageCls(l.updatedAt||l.createdAt||Date.now());
      var isTheirs = l.side==='theirs';
      return '<div class="loop-card gc">'
        +'<button class="check-btn" data-close="'+l.id+'" title="Mark done"></button>'
        +'<div class="loop-info">'
        +'<div class="loop-title">'+esc(l.title)+'</div>'
        +'<div class="loop-meta">'+esc(l.channel||'manual')+(l.why?' \xB7 '+esc(l.why):'')+'</div>'
        +'<div class="loop-actions">'
        +(isTheirs
          ? '<button class="link-btn teal" data-snooze="'+l.id+'">Nudge them</button>'
          : '<button class="link-btn" data-snooze="'+l.id+'">Snooze</button>')
        +'<span style="flex:1"></span>'
        +'<span class="age-pill '+cls+'">'+ageStr+'</span>'
        +'</div></div></div>';
    }).join('') : '<div class="empty-dashed">'+(label==='Your court'?'Nothing in your court. Clean board.':'No one's keeping you waiting.')+'</div>';

    return '<div>'
      +'<div class="col-head"><span class="col-dot" style="background:'+dotColor+'"></span>'
      +'<span class="col-label">'+label+'</span>'
      +'<span style="font-size:11.5px;color:var(--faint);margin-left:4px;">'+hint+'</span>'
      +'<span class="col-count">'+items.length+'</span></div>'
      +cards+'</div>';
  }

  // \u2500\u2500 tasks \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadTasks(){
    api('/api/tasks').then(function(tasks){
      tasks=tasks||[];
      var filtered=tasks.filter(function(t){return t.day===taskDay;});
      var seg=segBar([{v:'today',label:'Today'},{v:'tomorrow',label:'Tomorrow'},{v:'upcoming',label:'Upcoming'}],taskDay,function(v){taskDay=v;loadTasks();});
      var html='<div class="sec-head"><div><div class="sec-title">Tasks</div>'
        +'<div class="sec-sub">Your tasks \u2014 capture anything, complete what matters.</div></div></div>';
      var el=document.createElement('div');
      el.innerHTML=html;
      el.insertBefore(seg,null);

      var cards = filtered.length ? filtered.map(function(t){
        var pr = t.priority==='high'?'<span class="auto-badge auto-ask" style="margin-left:auto">HIGH</span>'
                :t.priority==='med'?'<span class="auto-badge" style="margin-left:auto;background:var(--blueSoft);color:var(--blue)">MED</span>':'';
        return '<div class="item-card gc">'
          +'<button class="check-btn" data-done="'+t.id+'" title="Complete"></button>'
          +'<div class="emoji-ic">'+esc(t.emoji||'\u2705')+'</div>'
          +'<div class="loop-info"><div class="item-title">'+esc(t.title)+'</div>'
          +'<div class="item-sub">'+esc(t.list||'Inbox')+'</div></div>'
          +pr+'</div>';
      }).join('') : '<div class="empty-dashed">No tasks for '+taskDay+'. Time to plan ahead.</div>';

      el.innerHTML += '<div class="seg-wrapper"></div>'+cards;
      view.innerHTML='';
      var segWrap=document.createElement('div');
      segWrap.appendChild(seg);
      view.appendChild(document.createElement('div')).innerHTML=html;
      view.firstChild.parentNode.insertBefore(segWrap,view.firstChild.nextSibling);
      view.innerHTML='';

      // simpler approach: build directly
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Tasks</div>'
        +'<div class="sec-sub">Your tasks \u2014 capture anything, complete what matters.</div></div></div>';
      var segEl=segBar([{v:'today',label:'Today'},{v:'tomorrow',label:'Tomorrow'},{v:'upcoming',label:'Upcoming'}],taskDay,function(v){taskDay=v;loadTasks();});
      view.appendChild(segEl);
      var cardWrap=document.createElement('div');
      cardWrap.innerHTML = filtered.length ? filtered.map(function(t){
        var pr = t.priority==='high'?'<span class="auto-badge auto-ask" style="margin-left:auto">HIGH</span>'
                :t.priority==='med'?'<span class="auto-badge" style="margin-left:auto;background:var(--blueSoft);color:var(--blue)">MED</span>':'';
        return '<div class="item-card gc">'
          +'<button class="check-btn" data-done="'+t.id+'" title="Complete"></button>'
          +'<div class="emoji-ic">'+esc(t.emoji||'\u2705')+'</div>'
          +'<div class="loop-info"><div class="item-title">'+esc(t.title)+'</div>'
          +'<div class="item-sub">'+esc(t.list||'Inbox')+'</div></div>'
          +pr+'</div>';
      }).join('') : '<div class="empty-dashed">No tasks for '+taskDay+'.</div>';
      view.appendChild(cardWrap);

      view.querySelectorAll('[data-done]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.done+'/complete').then(loadTasks);};});
    });
  }

  // \u2500\u2500 leads \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadLeads(){
    api('/api/leads').then(function(leads){
      leads=leads||[];
      if(leadView==='open') leads=leads.filter(function(l){return l.stage!=='won'&&l.stage!=='lost';});
      if(leadView==='won') leads=leads.filter(function(l){return l.stage==='won';});

      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Leads</div>'
        +'<div class="sec-sub">Pipeline \u2014 advance each contact toward a close.</div></div></div>';

      var seg=segBar([{v:'all',label:'All'},{v:'open',label:'Open'},{v:'won',label:'Won \u2713'}],leadView,function(v){leadView=v;loadLeads();});
      view.appendChild(seg);

      var cardWrap=document.createElement('div');
      cardWrap.innerHTML = leads.length ? leads.map(function(l){
        var sub=[l.company,l.title].filter(Boolean).map(esc).join(' \xB7 ');
        var canAdv=l.stage!=='won'&&l.stage!=='lost';
        return '<div class="item-card gc" style="align-items:center;">'
          +'<div class="loop-info"><div class="item-title">'+esc(l.name)+'</div>'
          +(sub?'<div class="item-sub">'+sub+'</div>':'')
          +(l.what?'<div class="item-sub" style="margin-top:2px">'+esc(l.what)+'</div>':'')
          +'</div>'
          +'<span class="stage-pill '+stageCls(l.stage)+'">'+esc(l.stage)+'</span>'
          +(canAdv?'<button class="btn-ghost" data-advance="'+l.id+'" style="margin-left:8px;padding:7px 12px;">Advance \u2192</button>':'')
          +'</div>';
      }).join('') : '<div class="empty-dashed">No leads yet. Add one below.</div>';
      view.appendChild(cardWrap);
      view.querySelectorAll('[data-advance]').forEach(function(b){b.onclick=function(){post('/api/leads/'+b.dataset.advance+'/advance').then(loadLeads);};});
    });
  }

  // \u2500\u2500 agents \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadAgents(){
    api('/api/agents').then(function(agents){
      agents=agents||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">AI Agents</div>'
        +'<div class="sec-sub">Your autonomous workforce \u2014 specialist agents working alongside the team.</div></div></div>';
      var wrap=document.createElement('div');
      wrap.innerHTML = agents.length ? agents.map(function(a){
        return '<div class="agent-card gc">'
          +'<div style="display:flex;align-items:center;gap:13px;">'
          +'<div style="width:42px;height:42px;flex-shrink:0;border-radius:13px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 16px var(--accentGlow);">'+esc(a.emoji||'\u{1F916}')+'</div>'
          +'<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:8px;">'
          +'<span class="agent-name">'+esc(a.name)+'</span>'
          +autoBadge(a.autonomy)+'</div>'
          +'<div class="agent-role">'+esc(a.role)+'</div></div></div>'
          +'<div class="agent-stats">'
          +'<div><div class="agent-stat-val" style="color:var(--green)">'+a.done+'</div><div class="agent-stat-lbl">done</div></div>'
          +'<div><div class="agent-stat-val" style="color:var(--amber)">'+a.pending+'</div><div class="agent-stat-lbl">pending</div></div>'
          +'</div></div>';
      }).join('') : '<div class="empty-dashed">No agents configured yet.</div>';
      view.appendChild(wrap);
    });
  }

  // \u2500\u2500 autonomy \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadAuto(){
    Promise.all([api('/api/autonomy'),api('/api/approvals')]).then(function(res){
      var settings=res[0]||{}, approvals=(res[1]||[]).filter(function(a){return a.status==='pending';});
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Autonomy</div>'
        +'<div class="sec-sub">What the AI may do on its own \u2014 and what needs your approval first.</div></div></div>';

      if(approvals.length){
        var apWrap=document.createElement('div');
        apWrap.innerHTML='<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:0 0 10px;">PENDING APPROVALS</div>'
          +approvals.map(function(ap){
            return '<div class="approve-card gc">'
              +'<div style="flex:1;min-width:0;"><div class="approve-title">'+esc(ap.title)+'</div>'
              +'<div class="approve-action">'+esc(ap.action)+'</div></div>'
              +'<button class="approve-btn ok" data-approve="'+ap.id+'">Approve</button>'
              +'<button class="approve-btn no" data-dismiss="'+ap.id+'" style="margin-left:6px">Dismiss</button></div>';
          }).join('');
        apWrap.querySelectorAll('[data-approve]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.approve+'/approve').then(loadAuto);};});
        apWrap.querySelectorAll('[data-dismiss]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.dismiss+'/dismiss').then(loadAuto);};});
        view.appendChild(apWrap);
      }

      var autoWrap=document.createElement('div');
      autoWrap.innerHTML='<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:18px 0 10px;">AUTONOMY SETTINGS</div>'
        +ACTIONS.map(function(a){
          var cur=settings[a.k]||'off';
          var lvls=['off','ask','auto'].map(function(lv){
            return '<button class="lvl'+(lv===cur?' on':'')+'" data-act="'+a.k+'" data-lvl="'+lv+'">'+(lv.charAt(0).toUpperCase()+lv.slice(1))+'</button>';
          }).join('');
          return '<div class="auto-card gc"><div class="auto-info"><div class="auto-label">'+a.label+'</div><div class="auto-desc">'+a.desc+'</div></div><div class="lvls">'+lvls+'</div></div>';
        }).join('');
      autoWrap.querySelectorAll('.lvl').forEach(function(b){b.onclick=function(){post('/api/autonomy',{action:b.dataset.act,level:b.dataset.lvl},'PUT').then(loadAuto);};});
      view.appendChild(autoWrap);
    });
  }

  // \u2500\u2500 events \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loadEvents(){
    api('/api/events').then(function(events){
      events=events||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Activity</div>'
        +'<div class="sec-sub">Everything that happened \u2014 scoped, logged, and reversible.</div></div></div>';
      var wrap=document.createElement('div');
      wrap.innerHTML = events.length ? events.map(function(e){
        var canUndo=e.reversible&&e.undo;
        return '<div class="event-card gc">'
          +'<div style="flex:1;min-width:0;"><div class="event-type">'+esc(e.type)+'</div>'
          +'<div class="event-meta">'+esc(e.actorId||'system')+(e.channel?' \xB7 '+esc(e.channel):'')
          +' \xB7 '+new Date(e.at).toLocaleString()+'</div></div>'
          +(canUndo?'<button class="undo-btn" data-undo="'+e.id+'">Undo</button>'
            :e.reversible?'<span class="rev-badge">reversible</span>':'')
          +'</div>';
      }).join('') : '<div class="empty-dashed">No activity yet. Start capturing loops.</div>';
      view.appendChild(wrap);
      view.querySelectorAll('[data-undo]').forEach(function(b){b.onclick=function(){post('/api/events/'+b.dataset.undo+'/undo').then(loadEvents);};});
    });
  }

  // \u2500\u2500 quick-add \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  document.getElementById('qbar').onsubmit=function(e){
    e.preventDefault();
    var v=qfield.value.trim(); if(!v) return;
    qfield.value='';
    if(tab==='loops') post('/api/loops',{title:v,side:side}).then(render);
    else if(tab==='tasks') post('/api/tasks',{title:v,day:taskDay}).then(render);
    else if(tab==='leads'){
      if(v.length>24||/[,@]/.test(v)) post('/api/leads/quick-add',{note:v}).then(render);
      else post('/api/leads',{name:v}).then(render);
    }
  };

  // \u2500\u2500 boot \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  buildNav();
  render();
})();
</script>
</body>
</html>`;
}

// packages/server/src/server.ts
function buildServer(deps) {
  const { core, auth } = deps;
  const app2 = Fastify({ logger: false });
  const llm = createLlm();
  const principalOf = (_req) => auth.current();
  const params = (req) => req.params;
  app2.get("/health", async () => ({ ok: true }));
  app2.get("/api/loops", async (req) => {
    const p = await principalOf(req);
    const side = req.query.side;
    return core.loops.list(p.orgId, side);
  });
  app2.post("/api/loops", async (req) => {
    const p = await principalOf(req);
    const b = req.body;
    if (!b?.title?.trim()) throw badRequest("title is required");
    return core.loops.capture({
      orgId: p.orgId,
      actorId: p.userId,
      title: b.title,
      why: b.why ?? "",
      side: b.side ?? "yours",
      channel: b.channel ?? "manual"
    });
  });
  app2.post("/api/loops/:id/close", async (req) => {
    const p = await principalOf(req);
    return core.loops.close(params(req).id, p.userId);
  });
  app2.post("/api/loops/:id/snooze", async (req) => {
    const p = await principalOf(req);
    const b = req.body ?? {};
    const untilAt = Date.now() + Math.max(1, b.hours ?? 24) * 60 * 60 * 1e3;
    return core.loops.snooze(params(req).id, p.userId, untilAt);
  });
  app2.get("/api/tasks", async (req) => core.tasks.list((await principalOf(req)).orgId));
  app2.post("/api/tasks", async (req) => {
    const p = await principalOf(req);
    const b = req.body;
    if (!b?.title?.trim()) throw badRequest("title is required");
    return core.tasks.create({ orgId: p.orgId, actorId: p.userId, ...b });
  });
  app2.post("/api/tasks/:id/complete", async (req) => core.tasks.complete(params(req).id, (await principalOf(req)).userId));
  app2.post("/api/tasks/:id/move", async (req) => {
    const p = await principalOf(req);
    const b = req.body ?? {};
    return core.tasks.move(params(req).id, b.day ?? "today", p.userId);
  });
  app2.get("/api/leads", async (req) => core.leads.list((await principalOf(req)).orgId));
  app2.post("/api/leads", async (req) => {
    const p = await principalOf(req);
    const b = req.body;
    if (!b?.name?.trim()) throw badRequest("name is required");
    return core.leads.create({ orgId: p.orgId, actorId: p.userId, ...b });
  });
  app2.post("/api/leads/:id/advance", async (req) => core.leads.advance(params(req).id, (await principalOf(req)).userId));
  app2.post("/api/leads/quick-add", async (req) => {
    const p = await principalOf(req);
    const b = req.body;
    if (!b?.note?.trim()) throw badRequest("note is required");
    return core.leads.quickAddFromNote(
      { orgId: p.orgId, actorId: p.userId, phone: b.phone ?? "", note: b.note },
      llm?.extractLead
    );
  });
  app2.get("/api/agents", async () => core.agents.roster());
  app2.get("/api/events", async (req) => core.events.list((await principalOf(req)).orgId, 50));
  app2.post("/api/events/:id/undo", async (req) => {
    await principalOf(req);
    return core.events.undo(params(req).id);
  });
  app2.get("/api/connections", async () => {
    const env = process.env;
    const has = (...keys) => keys.every((k) => !!env[k]);
    return {
      ai: { configured: !!llm, via: llm ? "anthropic" : null },
      whatsapp: {
        inbound: "webhook ready at /webhooks/whatsapp",
        outbound: has("WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN") ? "cloud-api" : env.WHATSAPP_BAILEYS === "on" ? "baileys-qr" : "not configured"
      },
      channels: ["email", "slack", "telegram", "github", "calendar"].map((c) => ({
        channel: c,
        inbound: `webhook ready at /webhooks/${c}`,
        outbound: "not configured"
      }))
    };
  });
  app2.get("/api/autonomy", async (req) => core.autonomy.get((await principalOf(req)).orgId));
  app2.put("/api/autonomy", async (req) => {
    const p = await principalOf(req);
    const b = req.body;
    const actions = ["createTasks", "sendReminders", "draftReplies", "chase", "joinMeetings"];
    const levels = ["off", "ask", "auto"];
    if (!b || !actions.includes(b.action) || !levels.includes(b.level)) {
      throw badRequest("action and level are required (action \u2208 " + actions.join("|") + ", level \u2208 off|ask|auto)");
    }
    return core.autonomy.set(p.orgId, b.action, b.level);
  });
  app2.get("/api/approvals", async (req) => core.approvals.list((await principalOf(req)).orgId, "pending"));
  app2.post("/api/approvals/:id/approve", async (req) => {
    await principalOf(req);
    return core.approvals.approve(params(req).id);
  });
  app2.post("/api/approvals/:id/dismiss", async (req) => {
    await principalOf(req);
    return core.approvals.dismiss(params(req).id);
  });
  const wa2 = cloud_api_exports.whatsappConfigFromEnv();
  app2.get("/webhooks/whatsapp", async (req, reply) => {
    if (!wa2) return reply.code(503).send("whatsapp not configured");
    const challenge = cloud_api_exports.verifyWebhook(wa2, req.query);
    if (challenge === null) return reply.code(403).send("forbidden");
    return reply.type("text/plain").send(challenge);
  });
  app2.post("/webhooks/whatsapp", async (req, reply) => {
    const messages = cloud_api_exports.parseInbound(LOCAL_ORG_ID, req.body);
    for (const m of messages) await ingest(core, m);
    return reply.code(200).send("ok");
  });
  const FANIN_CHANNELS = ["email", "slack", "telegram", "github", "calendar"];
  app2.post("/webhooks/:channel", async (req, reply) => {
    const channel = req.params.channel;
    if (!FANIN_CHANNELS.includes(channel)) {
      return reply.code(404).send("unknown channel");
    }
    const b = req.body;
    if (!b?.text?.trim()) throw badRequest("text is required");
    const loopId = await ingest(core, {
      orgId: LOCAL_ORG_ID,
      channel,
      from: b.from ?? "unknown",
      text: b.text,
      ref: b.ref
    });
    return reply.send({ captured: loopId });
  });
  app2.get("/", async (_req, reply) => reply.type("text/html").send(renderUi()));
  return app2;
}
function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// cli/bin/companybrain.ts
var port = Number(process.env.COMPANYBRAIN_PORT ?? process.env.PORT ?? 4317);
var host = process.env.COMPANYBRAIN_HOST ?? "0.0.0.0";
var baileys = process.env.WHATSAPP_BAILEYS === "on" ? createBaileysChannel({ orgId: "org_local" }) : null;
var wa = cloud_api_exports.whatsappConfigFromEnv();
var messenger = baileys ? baileys.messenger : createMessenger({ whatsapp: wa ?? void 0 });
var drafter = createLlm() ?? void 0;
var boot = await bootstrap({ messenger, drafter });
await seedIfEmpty(boot.core);
await boot.startWorkers();
await boot.queue.schedule("sendBriefing", { orgId: "org_local" }, 6 * 60 * 60 * 1e3);
if (baileys) await baileys.start(boot.core);
var app = buildServer({ core: boot.core, auth: boot.auth });
await app.listen({ port, host });
var shown = host === "0.0.0.0" ? `http://localhost:${port}` : `http://${host}:${port}`;
console.log(`
  company\x1B[1mbrain\x1B[0m  \xB7  running

  \u25B8 ${shown}
  \u25B8 data:  ~/.companybrain/companybrain.sqlite
  \u25B8 single app: SQLite + in-process worker + API + web, no external services

  Ctrl-C to stop.
`);
if (!process.env.COMPANYBRAIN_NO_OPEN) openBrowser(`http://localhost:${port}`);
function openBrowser(target) {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [target], { stdio: "ignore", detached: true, shell: platform() === "win32" }).unref();
  } catch {
  }
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await app.close();
    await boot.shutdown();
    process.exit(0);
  });
}
