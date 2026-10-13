import type { AuditEntry } from '../../shared/types';
import type { Context } from '../context';
import { listAudit } from '../repos/audit';

export function listAuditLog(ctx: Context): AuditEntry[] {
  return listAudit(ctx.db);
}
