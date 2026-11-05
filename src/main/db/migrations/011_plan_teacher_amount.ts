// The teacher's part is now set per plan, not per class on the teacher. Plans that already had teacher passes
// start at 0 and can't be sold until the amount is set in Planes. Past sales keep their surcharge.
export const migration011 = `
ALTER TABLE plans ADD COLUMN teacher_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (teacher_amount_cents >= 0);
ALTER TABLE teachers DROP COLUMN class_rate_cents;
ALTER TABLE sales DROP COLUMN teacher_rate_cents;
`;
