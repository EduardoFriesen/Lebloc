// DNI and free notes on the client (the spreadsheet's "Observación"), and an audit action for importing it.
// SQLite can't alter a CHECK: the audit log is copied into a new table and its append-only triggers come back.
// DROP TABLE doesn't fire row triggers, so dropping the old log is allowed.
export const migration008 = `
ALTER TABLE clients ADD COLUMN dni TEXT;
ALTER TABLE clients ADD COLUMN notes TEXT;

CREATE TABLE audit_log_new (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('client_anonymized', 'backup_exported', 'backup_restored', 'data_imported')),
  subject_id INTEGER,
  detail TEXT
);
INSERT INTO audit_log_new (id, at, action, subject_id, detail) SELECT id, at, action, subject_id, detail FROM audit_log;
DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`;
