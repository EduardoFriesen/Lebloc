import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

describe('better-sqlite3 under the Electron runtime', () => {
  it('opens an in-memory database', () => {
    const db = new Database(':memory:');
    expect(db.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 });
    db.close();
  });
});
