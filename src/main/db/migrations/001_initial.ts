export const migration001 = `
CREATE TABLE clients (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT,
  address TEXT,
  phone TEXT,
  emergency_name TEXT,
  emergency_phone TEXT,
  emergency_relation TEXT,
  enrolled_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  anonymized_at TEXT
);

CREATE TABLE guardians (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dni TEXT,
  phone TEXT,
  relation TEXT
);
CREATE INDEX idx_guardians_client ON guardians(client_id);

CREATE TABLE teachers (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  socials TEXT NOT NULL DEFAULT '[]',
  class_rate_cents INTEGER NOT NULL CHECK (class_rate_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE teacher_schedules (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  CHECK (start_time < end_time)
);
CREATE INDEX idx_teacher_schedules_teacher ON teacher_schedules(teacher_id);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  free_passes INTEGER NOT NULL CHECK (free_passes >= 0),
  teacher_passes INTEGER NOT NULL CHECK (teacher_passes >= 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  CHECK (free_passes + teacher_passes > 0)
);

CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  sold_at TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  free_passes INTEGER NOT NULL CHECK (free_passes >= 0),
  teacher_passes INTEGER NOT NULL CHECK (teacher_passes >= 0),
  local_price_cents INTEGER NOT NULL CHECK (local_price_cents >= 0),
  teacher_id INTEGER REFERENCES teachers(id),
  teacher_rate_cents INTEGER NOT NULL CHECK (teacher_rate_cents >= 0),
  teacher_surcharge_cents INTEGER NOT NULL CHECK (teacher_surcharge_cents >= 0),
  total_cents INTEGER NOT NULL,
  split_rule TEXT NOT NULL CHECK (split_rule IN ('proportional', 'teacher_first', 'local_first')),
  voided_at TEXT,
  CHECK (total_cents = local_price_cents + teacher_surcharge_cents),
  CHECK ((teacher_passes = 0) = (teacher_id IS NULL))
);
CREATE INDEX idx_sales_client ON sales(client_id);
CREATE INDEX idx_sales_teacher ON sales(teacher_id);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  paid_at TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  local_cents INTEGER NOT NULL CHECK (local_cents >= 0),
  teacher_cents INTEGER NOT NULL CHECK (teacher_cents >= 0),
  voided_at TEXT,
  CHECK (local_cents + teacher_cents = amount_cents)
);
CREATE INDEX idx_payments_sale ON payments(sale_id);

CREATE TABLE consumptions (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  kind TEXT NOT NULL CHECK (kind IN ('free', 'teacher')),
  consumed_at TEXT NOT NULL,
  note TEXT,
  voided_at TEXT
);
CREATE INDEX idx_consumptions_sale ON consumptions(sale_id);

CREATE TABLE teacher_payouts (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  paid_at TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  note TEXT,
  voided_at TEXT
);
CREATE INDEX idx_teacher_payouts_teacher ON teacher_payouts(teacher_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('low_passes_threshold', '2');
`;
