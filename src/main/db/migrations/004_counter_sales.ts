export const migration004 = `
CREATE TABLE counter_sales (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('day_pass', 'shoe_rental')),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  sold_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_counter_sales_sold_at ON counter_sales(sold_at);
`;
