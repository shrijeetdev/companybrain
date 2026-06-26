// The DB port. `core` depends ONLY on these interfaces — never on a concrete database.
// The app ships one embedded adapter: sqlite (a single file, no server to run).

import type { Loop, Task, Lead, DomainEvent, LoopSide, AutonomySettings, Approval, ApprovalStatus } from '@companybrain/types';

export interface LoopRepo {
  list(orgId: string, side?: LoopSide): Promise<Loop[]>;
  get(id: string): Promise<Loop | null>;
  insert(loop: Loop): Promise<Loop>;
  update(id: string, patch: Partial<Loop>): Promise<Loop>;
  /** hard-delete (used to reverse a "created" event) */
  remove(id: string): Promise<void>;
}

export interface TaskRepo {
  list(orgId: string): Promise<Task[]>;
  get(id: string): Promise<Task | null>;
  insert(task: Task): Promise<Task>;
  update(id: string, patch: Partial<Task>): Promise<Task>;
  remove(id: string): Promise<void>;
}

export interface LeadRepo {
  list(orgId: string): Promise<Lead[]>;
  get(id: string): Promise<Lead | null>;
  insert(lead: Lead): Promise<Lead>;
  update(id: string, patch: Partial<Lead>): Promise<Lead>;
  remove(id: string): Promise<void>;
}

/** Append-only audit log — the backbone of "scoped, logged, reversible". */
export interface EventRepo {
  append(event: DomainEvent): Promise<DomainEvent>;
  list(orgId: string, limit?: number): Promise<DomainEvent[]>;
  get(id: string): Promise<DomainEvent | null>;
}

/** Per-org settings (currently just the autonomy config). One row per org. */
export interface SettingsRepo {
  getAutonomy(orgId: string): Promise<AutonomySettings | null>;
  setAutonomy(orgId: string, settings: AutonomySettings): Promise<void>;
}

/** Queue of AI actions awaiting human approval (autonomy = 'ask'). */
export interface ApprovalRepo {
  insert(approval: Approval): Promise<Approval>;
  list(orgId: string, status?: ApprovalStatus): Promise<Approval[]>;
  get(id: string): Promise<Approval | null>;
  update(id: string, patch: Partial<Approval>): Promise<Approval>;
}

export interface Database {
  /** create tables if missing */
  init(): Promise<void>;
  loops: LoopRepo;
  tasks: TaskRepo;
  leads: LeadRepo;
  events: EventRepo;
  settings: SettingsRepo;
  approvals: ApprovalRepo;
  close(): Promise<void>;
}
