// When the payment was registered (paid_at is only the date it covers); older rows stay NULL.
export const migration005 = `
ALTER TABLE payments ADD COLUMN recorded_at TEXT;
`;
