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
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>companybrain</title>
<style>
  :root {
    --blue:#3e7bfa; --blue-soft:#7aa6ff; --ink:#1a1d21; --muted:#6b7280; --line:#eceef1;
    --bg:#f6f7f9; --card:#fff; --green:#34c759; --amber:#ff9f0a; --red:#ff3b30; --violet:#7c5cff;
  }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--bg); }
  .wrap { max-width:430px; margin:0 auto; min-height:100vh; padding:18px 16px 150px; }
  header { display:flex; align-items:center; gap:10px; margin-bottom:4px; }
  .logo { width:30px; height:30px; border-radius:9px; background:radial-gradient(circle at 30% 30%,var(--blue),var(--blue-soft)); }
  h1 { font-size:18px; margin:0; letter-spacing:-.2px; font-weight:500; }
  h1 b { font-weight:700; }
  .sub { color:var(--muted); font-size:13px; margin:2px 0 16px; }
  .seg { display:flex; gap:6px; background:#eef0f3; padding:4px; border-radius:12px; margin-bottom:14px; }
  .seg button { flex:1; border:0; background:transparent; padding:8px; border-radius:9px; font-size:13px; color:var(--muted); font-weight:600; cursor:pointer; }
  .seg button.on { background:#fff; color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.06); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px; margin-bottom:10px; display:flex; gap:12px; align-items:flex-start; }
  .check { width:22px; height:22px; border-radius:50%; border:2px solid #d4d8de; flex:0 0 auto; margin-top:1px; cursor:pointer; background:transparent; }
  .check:active { background:var(--blue); border-color:var(--blue); }
  .grow { flex:1; min-width:0; }
  .t { font-weight:600; }
  .w { color:var(--muted); font-size:12.5px; margin-top:2px; }
  .mono { font-family:"JetBrains Mono",ui-monospace,monospace; }
  .row { display:flex; align-items:center; gap:8px; }
  .pill { font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px; background:#eef0f3; color:var(--muted); white-space:nowrap; }
  .pill.blue { background:rgba(62,123,250,.12); color:var(--blue); }
  .pill.green { background:rgba(52,199,89,.14); color:#1f9d44; }
  .pill.amber { background:rgba(255,159,10,.16); color:#b9710a; }
  .pill.violet { background:rgba(124,92,255,.14); color:var(--violet); }
  .empty { color:var(--muted); text-align:center; padding:34px 0; }
  .btn { border:0; border-radius:11px; padding:8px 12px; font-size:13px; font-weight:600; cursor:pointer; }
  .btn.ghost { background:#eef0f3; color:var(--ink); }
  .btn.blue { background:var(--blue); color:#fff; }
  .emoji { font-size:20px; line-height:1; flex:0 0 auto; }
  .lvls { display:flex; gap:0; background:#eef0f3; padding:3px; border-radius:10px; flex:0 0 auto; }
  .lvl { border:0; background:transparent; padding:6px 10px; border-radius:8px; font-size:12px; font-weight:600; color:var(--muted); cursor:pointer; }
  .lvl.on { background:#fff; color:var(--blue); box-shadow:0 1px 2px rgba(0,0,0,.06); }
  .stat { display:flex; gap:14px; margin:2px 0 6px; }
  .stat .n { font-weight:700; } .stat .l { color:var(--muted); font-size:12px; }
  .bar { position:fixed; left:50%; transform:translateX(-50%); bottom:70px; width:398px; max-width:calc(100% - 32px); display:flex; gap:8px; }
  .bar input { flex:1; min-width:0; border:1px solid var(--line); background:#fff; border-radius:13px; padding:13px 14px; font-size:15px; }
  .bar button { border:0; background:var(--blue); color:#fff; font-weight:600; border-radius:13px; padding:0 18px; cursor:pointer; }
  nav { position:fixed; left:50%; transform:translateX(-50%); bottom:0; width:100%; max-width:430px; display:flex; background:rgba(255,255,255,.92); backdrop-filter:blur(12px); border-top:1px solid var(--line); padding:6px 6px max(8px,env(safe-area-inset-bottom)); }
  nav button { flex:1; border:0; background:transparent; padding:6px 0; font-size:11px; font-weight:600; color:var(--muted); cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:3px; }
  nav button.on { color:var(--blue); }
  nav .ic { font-size:18px; line-height:1; }
</style>
</head>
<body>
  <div class="wrap">
    <header><div class="logo"></div><h1>company<b>brain</b></h1></header>
    <div class="sub" id="sub">Never forget a task or a follow-up \u2014 across every channel.</div>
    <div id="seg"></div>
    <div id="list"><div class="empty">Loading\u2026</div></div>
  </div>
  <form class="bar" id="bar"><input id="field" autocomplete="off" /><button type="submit">Add</button></form>
  <nav id="nav"></nav>
<script>
  var tab = 'loops', side = 'yours', taskDay = 'today', leadView = 'all';
  var TABS = [
    { id:'loops',  ic:'\\u{1F501}', label:'Loops' },
    { id:'tasks',  ic:'\\u2705',     label:'Tasks' },
    { id:'leads',  ic:'\\u{1F91D}', label:'Leads' },
    { id:'agents', ic:'\\u{1F916}', label:'Agents' },
    { id:'auto',   ic:'\\u2699\\uFE0F', label:'Auto' },
    { id:'events', ic:'\\u{1F4DC}', label:'Activity' },
  ];
  var SUBS = {
    loops:'Open loops \u2014 who owes the next move.',
    tasks:'Your tasks, grouped by day.',
    leads:'Pipeline \u2014 drag a lead forward.',
    agents:'Your AI workforce and what they handle.',
    auto:'What the AI may do on its own \u2014 and what needs your nod.',
    events:'Everything that happened \u2014 scoped, logged, reversible.'
  };
  var list = document.getElementById('list');
  var nav = document.getElementById('nav');
  var seg = document.getElementById('seg');
  var bar = document.getElementById('bar');
  var field = document.getElementById('field');

  function esc(s){ return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function api(path, opts){ return fetch(path, opts).then(function(r){ return r.json().catch(function(){return null;}); }); }
  function post(path, body, method){ return api(path, { method: method||'POST', headers:{'content-type':'application/json'}, body: body?JSON.stringify(body):undefined }); }

  nav.innerHTML = TABS.map(function(t){
    return '<button data-tab="'+t.id+'"><span class="ic">'+t.ic+'</span>'+t.label+'</button>';
  }).join('');
  nav.querySelectorAll('button').forEach(function(b){ b.onclick = function(){ tab=b.dataset.tab; render(); }; });

  function setSeg(opts, cur, onPick){
    seg.style.display='flex';
    seg.className='seg';
    seg.innerHTML = opts.map(function(o){ return '<button class="'+(o.v===cur?'on':'')+'" data-v="'+o.v+'">'+o.label+'</button>'; }).join('');
    seg.querySelectorAll('button').forEach(function(b){ b.onclick=function(){ onPick(b.dataset.v); }; });
  }

  function render(){
    document.getElementById('sub').textContent = SUBS[tab];
    nav.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.tab===tab); });
    if (tab==='loops') { setSeg([{v:'yours',label:'Your court'},{v:'theirs',label:'Their court'}], side, function(v){ side=v; load(); }); }
    else if (tab==='tasks') { setSeg([{v:'today',label:'Today'},{v:'tomorrow',label:'Tomorrow'},{v:'upcoming',label:'Upcoming'}], taskDay, function(v){ taskDay=v; load(); }); }
    else if (tab==='leads') { setSeg([{v:'all',label:'All'},{v:'open',label:'Open'},{v:'won',label:'Won'}], leadView, function(v){ leadView=v; load(); }); }
    else { seg.style.display='none'; seg.innerHTML=''; }

    var showBar = tab==='loops'||tab==='tasks'||tab==='leads';
    bar.style.display = showBar ? 'flex' : 'none';
    field.placeholder = tab==='loops' ? 'Capture a loop\u2026' : tab==='tasks' ? 'Add a task\u2026' : tab==='leads' ? 'Add lead (name, or paste a note)\u2026' : '';
    load();
  }

  function load(){
    if (tab==='loops') return loadLoops();
    if (tab==='tasks') return loadTasks();
    if (tab==='leads') return loadLeads();
    if (tab==='agents') return loadAgents();
    if (tab==='auto') return loadAuto();
    if (tab==='events') return loadEvents();
  }

  var ACTIONS = [
    { k:'draftReplies', label:'Draft replies', desc:'Acknowledge inbound messages' },
    { k:'chase', label:'Chase loops', desc:'Nudge when the ball is in their court' },
    { k:'sendReminders', label:'Send reminders', desc:'Remind on snoozed loops' },
    { k:'createTasks', label:'Create tasks', desc:'Turn asks into tasks' },
    { k:'joinMeetings', label:'Join meetings', desc:'Attend + take notes' }
  ];
  function loadAuto(){
    Promise.all([ api('/api/autonomy'), api('/api/approvals') ]).then(function(res){
      var settings = res[0]||{}, approvals = res[1]||[];
      var levels = [['off','Off'],['ask','Ask'],['auto','Auto']];
      var rows = ACTIONS.map(function(a){
        var cur = settings[a.k] || 'off';
        var seg = levels.map(function(lv){
          return '<button class="lvl'+(lv[0]===cur?' on':'')+'" data-act="'+a.k+'" data-lvl="'+lv[0]+'">'+lv[1]+'</button>';
        }).join('');
        return '<div class="card"><div class="grow"><div class="t">'+a.label+'</div><div class="w">'+a.desc+'</div></div>'
          + '<div class="lvls">'+seg+'</div></div>';
      }).join('');
      var head = approvals.length
        ? '<div class="w" style="margin:4px 0 8px">'+approvals.length+' awaiting your approval</div>'
          + approvals.map(function(ap){
              return '<div class="card"><div class="grow"><div class="t">'+esc(ap.title)+'</div>'
                + '<div class="w mono">'+esc(ap.action)+'</div></div>'
                + '<button class="btn blue" data-approve="'+ap.id+'">Approve</button>'
                + '<button class="btn ghost" data-dismiss="'+ap.id+'">Dismiss</button></div>';
            }).join('')
          + '<div class="w" style="margin:14px 0 8px">Autonomy</div>'
        : '<div class="w" style="margin:4px 0 8px">Nothing waiting. Autonomy</div>';
      list.innerHTML = head + rows;
      list.querySelectorAll('.lvl').forEach(function(b){ b.onclick=function(){ post('/api/autonomy',{action:b.dataset.act,level:b.dataset.lvl}, 'PUT').then(loadAuto); }; });
      list.querySelectorAll('[data-approve]').forEach(function(b){ b.onclick=function(){ post('/api/approvals/'+b.dataset.approve+'/approve').then(loadAuto); }; });
      list.querySelectorAll('[data-dismiss]').forEach(function(b){ b.onclick=function(){ post('/api/approvals/'+b.dataset.dismiss+'/dismiss').then(loadAuto); }; });
    });
  }

  function loadLoops(){
    api('/api/loops?side='+side).then(function(loops){
      loops = loops||[];
      if(!loops.length){ list.innerHTML = '<div class="empty">Nothing here. You\\'re clear.</div>'; return; }
      list.innerHTML = loops.map(function(l){
        return '<div class="card"><button class="check" data-close="'+l.id+'"></button>'
          + '<div class="grow"><div class="t">'+esc(l.title)+'</div>'
          + '<div class="w mono">'+esc(l.channel)+(l.why?' \\u00b7 '+esc(l.why):'')+'</div></div>'
          + '<button class="btn ghost" data-snooze="'+l.id+'">Snooze</button></div>';
      }).join('');
      wire();
    });
  }

  function loadTasks(){
    api('/api/tasks').then(function(tasks){
      tasks = (tasks||[]).filter(function(t){ return t.day===taskDay; });
      if(!tasks.length){ list.innerHTML = '<div class="empty">No tasks '+taskDay+'.</div>'; return; }
      list.innerHTML = tasks.map(function(t){
        var pr = t.priority==='high'?'<span class="pill amber">high</span>':t.priority==='med'?'<span class="pill blue">med</span>':'';
        return '<div class="card"><button class="check" data-done="'+t.id+'"></button>'
          + '<div class="emoji">'+esc(t.emoji||'\\u2705')+'</div>'
          + '<div class="grow"><div class="t">'+esc(t.title)+'</div>'
          + '<div class="w">'+esc(t.list||'Inbox')+'</div></div>'+pr+'</div>';
      }).join('');
      wire();
    });
  }

  function loadLeads(){
    api('/api/leads').then(function(leads){
      leads = leads||[];
      if (leadView==='open') leads = leads.filter(function(l){ return l.stage!=='won'&&l.stage!=='lost'; });
      if (leadView==='won') leads = leads.filter(function(l){ return l.stage==='won'; });
      if(!leads.length){ list.innerHTML = '<div class="empty">No leads yet.</div>'; return; }
      var cls = { new:'', contacted:'blue', meeting:'violet', proposal:'amber', won:'green', lost:'' };
      list.innerHTML = leads.map(function(l){
        var sub = [l.company, l.title].filter(Boolean).map(esc).join(' \\u00b7 ');
        var adv = (l.stage==='won'||l.stage==='lost') ? '' : '<button class="btn blue" data-advance="'+l.id+'">Advance</button>';
        return '<div class="card"><div class="grow"><div class="row"><span class="t">'+esc(l.name)+'</span>'
          + '<span class="pill '+(cls[l.stage]||'')+'">'+esc(l.stage)+'</span></div>'
          + (sub?'<div class="w">'+sub+'</div>':'')
          + (l.what?'<div class="w">'+esc(l.what)+'</div>':'')+'</div>'+adv+'</div>';
      }).join('');
      wire();
    });
  }

  function loadAgents(){
    api('/api/agents').then(function(agents){
      agents = agents||[];
      list.innerHTML = agents.map(function(a){
        var au = a.autonomy==='auto'?'<span class="pill green">auto</span>':a.autonomy==='ask'?'<span class="pill amber">ask</span>':'<span class="pill">off</span>';
        return '<div class="card"><div class="emoji">'+esc(a.emoji)+'</div>'
          + '<div class="grow"><div class="row"><span class="t">'+esc(a.name)+'</span>'+au+'</div>'
          + '<div class="w">'+esc(a.role)+'</div>'
          + '<div class="stat"><span><span class="n">'+a.done+'</span> <span class="l">done</span></span>'
          + '<span><span class="n">'+a.pending+'</span> <span class="l">pending</span></span></div></div></div>';
      }).join('');
    });
  }

  function loadEvents(){
    api('/api/events').then(function(events){
      events = events||[];
      if(!events.length){ list.innerHTML = '<div class="empty">No activity yet.</div>'; return; }
      list.innerHTML = events.map(function(e){
        var when = new Date(e.at).toLocaleString();
        var canUndo = e.reversible && e.undo;
        return '<div class="card"><div class="grow"><div class="t mono">'+esc(e.type)+'</div>'
          + '<div class="w">'+esc(e.actorId)+(e.channel?' \\u00b7 '+esc(e.channel):'')+' \\u00b7 '+esc(when)+'</div></div>'
          + (canUndo?'<button class="btn ghost" data-undo="'+e.id+'">Undo</button>':e.reversible?'<span class="pill blue">reversible</span>':'')+'</div>';
      }).join('');
      list.querySelectorAll('[data-undo]').forEach(function(b){ b.onclick=function(){ post('/api/events/'+b.dataset.undo+'/undo').then(loadEvents); }; });
    });
  }

  function wire(){
    list.querySelectorAll('[data-close]').forEach(function(b){ b.onclick=function(){ post('/api/loops/'+b.dataset.close+'/close').then(load); }; });
    list.querySelectorAll('[data-snooze]').forEach(function(b){ b.onclick=function(){ post('/api/loops/'+b.dataset.snooze+'/snooze',{hours:24}).then(load); }; });
    list.querySelectorAll('[data-done]').forEach(function(b){ b.onclick=function(){ post('/api/tasks/'+b.dataset.done+'/complete').then(load); }; });
    list.querySelectorAll('[data-advance]').forEach(function(b){ b.onclick=function(){ post('/api/leads/'+b.dataset.advance+'/advance').then(load); }; });
  }

  bar.onsubmit = function(e){
    e.preventDefault();
    var v = field.value.trim(); if(!v) return;
    var done = function(){ field.value=''; load(); };
    if (tab==='loops') post('/api/loops',{ title:v, side:side }).then(done);
    else if (tab==='tasks') post('/api/tasks',{ title:v, day:taskDay }).then(done);
    else if (tab==='leads') {
      // A short value is a name; a longer note goes through quick-add (AI-structured if configured).
      if (v.length > 24 || /[,@]/.test(v)) post('/api/leads/quick-add',{ note:v }).then(done);
      else post('/api/leads',{ name:v }).then(done);
    }
  };

  render();
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
