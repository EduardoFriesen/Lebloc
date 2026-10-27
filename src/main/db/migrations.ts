import type { Db } from './connection';
import { migration001 } from './migrations/001_initial';
import { migration002 } from './migrations/002_waivers';
import { migration003 } from './migrations/003_kiosk';
import { migration004 } from './migrations/004_counter_sales';
import { migration005 } from './migrations/005_payment_time';
import { migration006 } from './migrations/006_expenses_staff';
import { migration007 } from './migrations/007_audit_log';
import { migration008 } from './migrations/008_client_dni_import';
import { migration009 } from './migrations/009_staff_payouts';
import { migration010 } from './migrations/010_drive_audit';
import { migration011 } from './migrations/011_plan_teacher_amount';

export const MIGRATIONS: readonly string[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
];

export function migrate(db: Db): void {
  const current = Number(db.pragma('user_version', { simple: true }));
  if (current > MIGRATIONS.length) {
    throw new Error(`Database version ${current} is newer than this app supports (${MIGRATIONS.length})`);
  }
  MIGRATIONS.slice(current).forEach((sql, offset) => {
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${current + offset + 1}`);
    })();
  });
}
