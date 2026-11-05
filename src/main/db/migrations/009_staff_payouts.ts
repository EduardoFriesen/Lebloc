// Settling an employee pays every unpaid shift of a range; the shift points at its payout.
// Voiding the payout clears that link, so its shifts are owed again; its amount stays as the receipt.
export const migration009 = `
CREATE TABLE staff_payouts (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  paid_at TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_staff_payouts_employee ON staff_payouts(employee_id);

ALTER TABLE work_shifts ADD COLUMN payout_id INTEGER REFERENCES staff_payouts(id);
CREATE INDEX idx_work_shifts_payout ON work_shifts(payout_id);
`;
