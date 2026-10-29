// The kiosk stock is an expense when the supplier is paid, not sale by sale. Each product keeps its unit cost (set by
// the last delivery or by hand) instead of a pack. Sales from before today keep counting their cost in the balance,
// so past months don't change; from today on only deliveries count.
export const migration013 = `
ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0);
UPDATE products SET unit_cost_cents = CAST(ROUND(pack_cost_cents * 1.0 / pack_size) AS INTEGER);
ALTER TABLE products DROP COLUMN pack_size;
ALTER TABLE products DROP COLUMN pack_cost_cents;

CREATE TABLE kiosk_purchases (
  id INTEGER PRIMARY KEY,
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_kiosk_purchases_paid_at ON kiosk_purchases(paid_at);

CREATE TABLE kiosk_purchase_items (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES kiosk_purchases(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0)
);
CREATE INDEX idx_kiosk_purchase_items_purchase ON kiosk_purchase_items(purchase_id);

INSERT INTO settings (key, value) VALUES ('kiosk_purchases_from', date('now', 'localtime'));
`;
