// What Ley 25.326 asks to trace: anonymizing a client and copying all the data out of or into the app.
// The triggers make the log append-only, so nothing in the app can rewrite it.
export const migration007 = `
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('client_anonymized', 'backup_exported', 'backup_restored')),
  subject_id INTEGER,
  detail TEXT
);
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`;
