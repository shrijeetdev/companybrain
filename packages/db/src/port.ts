// The DB port. `core` depends ONLY on these interfaces — never on a concrete database.
// The app ships one embedded adapter: sqlite (a single file, no server to run).

import type { Loop, Task, Lead, DomainEvent, LoopSide, AutonomySettings, Approval, ApprovalStatus, AiRun } from '@companybrain/types';

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

export interface TimeEntry {
  id: string;
  orgId: string;
  taskId: string;
  userId: string;
  startedAt: number;
  endedAt?: number;
  duration?: number;
  note?: string;
}

export interface TimeEntryRepo {
  insert(entry: TimeEntry): Promise<TimeEntry>;
  get(id: string): Promise<TimeEntry | null>;
  listByTask(taskId: string): Promise<TimeEntry[]>;
  listByUser(userId: string, orgId: string): Promise<TimeEntry[]>;
  update(id: string, patch: Partial<TimeEntry>): Promise<TimeEntry>;
  delete(id: string): Promise<void>;
}

export interface CustomField {
  id: string;
  orgId: string;
  entityType: 'loop' | 'task' | 'lead';
  entityId: string;
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'boolean';
  fieldValue: string;
  createdAt: number;
}

export interface CustomFieldRepo {
  insert(field: CustomField): Promise<CustomField>;
  get(id: string): Promise<CustomField | null>;
  listByEntity(entityType: string, entityId: string): Promise<CustomField[]>;
  listByOrg(orgId: string, entityType?: string): Promise<CustomField[]>;
  update(id: string, patch: Partial<CustomField>): Promise<CustomField>;
  delete(id: string): Promise<void>;
  deleteByEntity(entityType: string, entityId: string): Promise<void>;
}

export interface ConnectionRecord {
  id: string;
  orgId: string;
  channel: 'whatsapp_cloud' | 'whatsapp_baileys' | 'gmail' | 'slack' | 'telegram' | 'github' | 'calendar' | 'wordpress';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  credentials: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface ConnectionRepo {
  list(orgId: string): Promise<ConnectionRecord[]>;
  get(orgId: string, channel: string): Promise<ConnectionRecord | null>;
  upsert(orgId: string, channel: string, patch: Partial<ConnectionRecord>): Promise<ConnectionRecord>;
  delete(orgId: string, channel: string): Promise<void>;
}

export interface ApiKeyRow {
  id: string;
  orgId: string;
  name: string;
  prefix: string;
  /** sha256 hex of the raw key. The raw key is never stored. */
  keyHash: string;
  scopes: string[];
  /** owner user id (the agent account). Optional for backwards-compat keys. */
  actorId?: string;
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
}

export interface ApiKeyRepo {
  insert(row: ApiKeyRow): Promise<void>;
  findByHash(keyHash: string): Promise<ApiKeyRow | null>;
  touch(id: string, at: number): Promise<void>;
  listByOrg(orgId: string): Promise<ApiKeyRow[]>;
  delete(id: string): Promise<void>;
}

export interface AiRunRepo {
  insert(run: AiRun): Promise<AiRun>;
  get(id: string): Promise<AiRun | null>;
  listByTask(taskId: string): Promise<AiRun[]>;
  listByOrg(orgId: string, limit?: number): Promise<AiRun[]>;
  update(id: string, patch: Partial<AiRun>): Promise<AiRun>;
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
  timeEntries: TimeEntryRepo;
  customFields: CustomFieldRepo;
  connections: ConnectionRepo;
  apiKeys: ApiKeyRepo;
  aiRuns: AiRunRepo;
  /** Path of the file backing this database, when it is file-backed (SQLite). */
  filePath?(): string | null;
  close(): Promise<void>;
}
