import type { Db } from './connection';
import { migration001 } from './migrations/001_initial';

export const MIGRATIONS: readonly string[] = [migration001];

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
