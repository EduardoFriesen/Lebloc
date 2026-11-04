// A delivery is what came in; the supplier is paid apart, in one or more payments, and what is owed is the total minus
// them. Each delivery so far was paid in full the day it was loaded, so it gets that payment and no number changes.
export const migration018 = `
CREATE TABLE kiosk_purchase_payments (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES kiosk_purchases(id),
  paid_at TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_kiosk_purchase_payments_purchase ON kiosk_purchase_payments(purchase_id);
CREATE INDEX idx_kiosk_purchase_payments_paid_at ON kiosk_purchase_payments(paid_at);

INSERT INTO kiosk_purchase_payments (purchase_id, paid_at, amount_cents, method, recorded_at, voided_at)
  SELECT p.id, p.paid_at, SUM(i.cost_cents), p.method, p.recorded_at, p.voided_at
  FROM kiosk_purchases p JOIN kiosk_purchase_items i ON i.purchase_id = p.id
  GROUP BY p.id HAVING SUM(i.cost_cents) > 0
  ORDER BY p.id;

ALTER TABLE kiosk_purchases RENAME COLUMN paid_at TO received_at;
ALTER TABLE kiosk_purchases DROP COLUMN method;
`;
