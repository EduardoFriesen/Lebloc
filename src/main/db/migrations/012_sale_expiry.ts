// Passes expire: each sale keeps the last day its passes can be used. Sales from before this update get a month
// from the day it is installed (the last day of next month when it is shorter). SQLite checks a new column's
// CHECK against the existing rows before the UPDATE can fill them, so triggers guard it instead.
export const migration012 = `
ALTER TABLE sales ADD COLUMN expires_at TEXT;
UPDATE sales SET expires_at = min(
  date('now', 'localtime', '+1 month'),
  date('now', 'localtime', 'start of month', '+2 months', '-1 day')
);
CREATE TRIGGER sales_expiry_insert BEFORE INSERT ON sales
  WHEN NEW.expires_at IS NULL OR NEW.expires_at < NEW.sold_at
  BEGIN SELECT RAISE(ABORT, 'sales.expires_at must be on or after sold_at'); END;
CREATE TRIGGER sales_expiry_update BEFORE UPDATE OF expires_at, sold_at ON sales
  WHEN NEW.expires_at IS NULL OR NEW.expires_at < NEW.sold_at
  BEGIN SELECT RAISE(ABORT, 'sales.expires_at must be on or after sold_at'); END;
`;
