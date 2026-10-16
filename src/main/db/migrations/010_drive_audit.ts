// Connecting Google Drive sends a full copy of the data out on every backup, so it is traced like an export.
// Same rebuild as 008: SQLite can't alter a CHECK, and the append-only triggers come back on the new table.
export const migration010 = `
CREATE TABLE audit_log_new (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('client_anonymized', 'backup_exported', 'backup_restored', 'data_imported', 'drive_connected', 'drive_disconnected')),
  subject_id INTEGER,
  detail TEXT
);
INSERT INTO audit_log_new (id, at, action, subject_id, detail) SELECT id, at, action, subject_id, detail FROM audit_log;
DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`;
