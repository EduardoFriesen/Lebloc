// A sale can become another plan (a trial that turns into a pack): the row takes the new plan and this keeps what it
// was before, one row per extension. The teacher never changes, so it is not kept; the total is local + surcharge.
export const migration014 = `
CREATE TABLE sale_extensions (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  extended_at TEXT NOT NULL,
  from_plan_id INTEGER NOT NULL REFERENCES plans(id),
  from_plan_name TEXT NOT NULL,
  from_free_passes INTEGER NOT NULL,
  from_teacher_passes INTEGER NOT NULL,
  from_local_price_cents INTEGER NOT NULL,
  from_teacher_surcharge_cents INTEGER NOT NULL,
  from_split_rule TEXT NOT NULL,
  from_expires_at TEXT NOT NULL
);
CREATE INDEX sale_extensions_sale ON sale_extensions (sale_id);
`;
