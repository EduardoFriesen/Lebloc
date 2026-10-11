// Fixed costs of the local and hourly staff, so the monthly balance has its expenses.
// A shift is never edited (voided and entered again), so its cost is a snapshot like sales.total_cents.
export const migration006 = `
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('rent', 'electricity', 'gas', 'water', 'internet', 'taxes', 'maintenance', 'other')),
  description TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  paid_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_expenses_paid_at ON expenses(paid_at);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dni TEXT,
  phone TEXT,
  address TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('staff', 'casual')),
  hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE work_shifts (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  worked_on TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
  note TEXT,
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_work_shifts_employee ON work_shifts(employee_id);
CREATE INDEX idx_work_shifts_worked_on ON work_shifts(worked_on);
`;
