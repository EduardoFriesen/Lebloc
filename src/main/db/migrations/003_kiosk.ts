export const migration003 = `
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  pack_size INTEGER NOT NULL CHECK (pack_size > 0),
  pack_cost_cents INTEGER NOT NULL CHECK (pack_cost_cents >= 0),
  markup_percent INTEGER NOT NULL CHECK (markup_percent BETWEEN 0 AND 1000),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE UNIQUE INDEX idx_products_name ON products(name COLLATE NOCASE);

CREATE TABLE kiosk_sales (
  id INTEGER PRIMARY KEY,
  sold_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  voided_at TEXT
);
CREATE INDEX idx_kiosk_sales_sold_at ON kiosk_sales(sold_at);

CREATE TABLE kiosk_sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES kiosk_sales(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0)
);
CREATE INDEX idx_kiosk_sale_items_sale ON kiosk_sale_items(sale_id);
CREATE INDEX idx_kiosk_sale_items_product ON kiosk_sale_items(product_id);
`;
