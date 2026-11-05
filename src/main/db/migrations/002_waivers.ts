export const migration002 = `
CREATE TABLE waiver_signatures (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  signed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_waiver_signatures_client ON waiver_signatures(client_id);
INSERT INTO settings (key, value) VALUES ('waiver_validity_months', '12');
`;
