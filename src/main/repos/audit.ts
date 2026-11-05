import type { AuditAction, AuditEntry } from '../../shared/types';
import type { Db } from '../db/connection';

export function insertAudit(db: Db, entry: { at: string; action: AuditAction; subjectId: number | null; detail: string | null }): void {
  db.prepare('INSERT INTO audit_log (at, action, subject_id, detail) VALUES (@at, @action, @subjectId, @detail)').run(entry);
}

/** Newest first; the log grows by a few rows a month, so it is read whole. */
export function listAudit(db: Db): AuditEntry[] {
  return db.prepare<[], AuditEntry>('SELECT id, at, action, subject_id AS subjectId, detail FROM audit_log ORDER BY id DESC').all();
}
