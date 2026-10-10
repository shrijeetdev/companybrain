// Filesystem-backed storage for task attachments (images, PDFs, voice memos…).
//
// No database: we write each file under ~/.companybrain/attachments/{orgId}/{taskId}/
// and keep a per-task index.json so listAttachments can return metadata without a
// directory walk or a DB lookup. This keeps the feature self-contained and easy to
// reason about; the parent can later migrate to object storage by swapping these
// functions out behind the same interface.

import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Persisted metadata for one stored attachment. The on-disk index.json holds these. */
export interface AttachmentRecord {
  id: string;
  taskId: string;
  orgId: string;
  filename: string;
  mimeType: string;
  size: number;
  storedPath: string;
  createdAt: number;
}

/** Root directory for every attachment, resolved once. Overridable via COMPANYBRAIN_HOME. */
function attachmentsRoot(): string {
  const base = process.env.COMPANYBRAIN_HOME ?? join(homedir(), '.companybrain');
  return join(base, 'attachments');
}

/** Directory holding all attachments for one task. */
function taskDir(orgId: string, taskId: string): string {
  return join(attachmentsRoot(), orgId, taskId);
}

/** Path to the per-task index file that lists every AttachmentRecord. */
function indexPath(orgId: string, taskId: string): string {
  return join(taskDir(orgId, taskId), 'index.json');
}

/** Read a task's index, returning [] when it doesn't exist yet (no attachments saved). */
function readIndex(orgId: string, taskId: string): AttachmentRecord[] {
  const path = indexPath(orgId, taskId);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AttachmentRecord[]) : [];
  } catch {
    // Corrupt index is non-fatal — treat as empty so the task still works.
    return [];
  }
}

/** Overwrite a task's index with the given records (atomic-enough for our purposes). */
function writeIndex(orgId: string, taskId: string, records: AttachmentRecord[]): void {
  const dir = taskDir(orgId, taskId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(indexPath(orgId, taskId), JSON.stringify(records, null, 2), 'utf8');
}

export interface SaveAttachmentOpts {
  taskId: string;
  filename: string;
  mimeType: string;
  data: Buffer;
  orgId: string;
}

/**
 * Persist an attachment to disk and append it to the task's index.
 *
 * Filenames are namespaced by a fresh id to avoid collisions when two uploads share
 * a name and to make deletion unambiguous. Returns the full record.
 */
export async function saveAttachment(opts: SaveAttachmentOpts): Promise<AttachmentRecord> {
  const { taskId, filename, mimeType, data, orgId } = opts;
  const id = randomUUID();
  const dir = taskDir(orgId, taskId);
  // recursive mkdir is idempotent and creates parents — safe even on concurrent saves.
  mkdirSync(dir, { recursive: true });

  const storedFilename = `${id}-${sanitizeFilename(filename)}`;
  const storedPath = join(dir, storedFilename);
  writeFileSync(storedPath, data);

  const record: AttachmentRecord = {
    id,
    taskId,
    orgId,
    filename,
    mimeType,
    size: data.byteLength,
    storedPath,
    createdAt: Date.now(),
  };

  const records = readIndex(orgId, taskId);
  records.push(record);
  writeIndex(orgId, taskId, records);

  return record;
}

/**
 * Resolve the absolute on-disk path for an attachment id. We don't know the taskId
 * from the id alone, so the caller passes orgId and we search the org's subtree.
 * Returns the storedPath if found, or an empty string if the id isn't recorded.
 */
export function getAttachmentPath(orgId: string, attachmentId: string): string {
  // Walk each task dir under the org and look for the id in its index. A flat scan
  // is fine here — attachment counts stay small per org and this is rarely hot.
  const orgRoot = join(attachmentsRoot(), orgId);
  if (!existsSync(orgRoot)) return '';

  for (const taskId of safeReaddir(orgRoot)) {
    const records = readIndex(orgId, taskId);
    const hit = records.find((r) => r.id === attachmentId);
    if (hit) return hit.storedPath;
  }
  return '';
}

/** List every attachment recorded for a task, straight from its index.json. */
export async function listAttachments(taskId: string): Promise<AttachmentRecord[]> {
  // listAttachments is keyed by taskId alone (matching the route shape), so we need
  // the orgId to read the index. We scan the org roots to find which org owns the
  // task dir; the index then gives us orgId on each record for free.
  const root = attachmentsRoot();
  if (!existsSync(root)) return [];

  for (const orgId of safeReaddir(root)) {
    const dir = taskDir(orgId, taskId);
    if (existsSync(dir)) {
      return readIndex(orgId, taskId);
    }
  }
  return [];
}

/**
 * Remove an attachment (file + index entry). No-op if the id isn't found, so callers
 * can treat repeated deletes as idempotent.
 */
export async function deleteAttachment(orgId: string, attachmentId: string): Promise<void> {
  const orgRoot = join(attachmentsRoot(), orgId);
  if (!existsSync(orgRoot)) return;

  for (const taskId of safeReaddir(orgRoot)) {
    const records = readIndex(orgId, taskId);
    const hit = records.find((r) => r.id === attachmentId);
    if (!hit) continue;

    // Best-effort file removal; a missing file shouldn't fail the index update.
    try {
      if (existsSync(hit.storedPath)) unlinkSync(hit.storedPath);
    } catch {
      // ignore — index is the source of truth for membership
    }

    writeIndex(orgId, taskId, records.filter((r) => r.id !== attachmentId));
    return;
  }
}

/** readdirSync that returns [] instead of throwing on a missing/odd directory. */
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Strip path separators and trim a user-supplied filename to a safe leaf name. */
function sanitizeFilename(name: string): string {
  // Drop any directory components a client might send, and trim length so very long
  // names don't blow past filesystem limits once prefixed with the id.
  const leaf = name.replace(/[/\\]+/g, '_').replace(/^\.+/, '');
  return leaf.slice(0, 180) || 'attachment';
}
