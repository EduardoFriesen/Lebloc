// Marks set by hand from the lists: a sale paid by transfer was invoiced, an expense was actually paid. Null = not yet.
export const migration017 = `
ALTER TABLE sales ADD COLUMN invoiced_at TEXT;
ALTER TABLE expenses ADD COLUMN marked_paid_at TEXT;
`;
