// Forgiven debt: it stops being owed but is not a payment, so it never counts as income or as the teacher's.
export const migration015 = `
CREATE TABLE debt_cancellations (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  cancelled_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX debt_cancellations_sale ON debt_cancellations (sale_id);
`;
