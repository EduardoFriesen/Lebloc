import { addMonths } from './dates';

export type WaiverState = 'missing' | 'expired' | 'valid';

export interface WaiverStatus {
  state: WaiverState;
  signedAt: string | null;
  expiresAt: string | null;
}

/** The signed waiver is valid for `validityMonths` from its signing date and expires on `expiresAt`. */
export function waiverStatus(lastSignedAt: string | null, validityMonths: number, today: string): WaiverStatus {
  if (lastSignedAt === null) return { state: 'missing', signedAt: null, expiresAt: null };
  const expiresAt = addMonths(lastSignedAt, validityMonths);
  return { state: today < expiresAt ? 'valid' : 'expired', signedAt: lastSignedAt, expiresAt };
}
