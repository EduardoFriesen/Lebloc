// The client's last update date is no longer kept: from the waiver, only the day it was handed in matters.
export const migration016 = `
ALTER TABLE clients DROP COLUMN updated_at;
`;
