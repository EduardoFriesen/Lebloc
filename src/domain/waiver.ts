export type WaiverState = 'missing' | 'valid';

export interface WaiverStatus {
  state: WaiverState;
  signedAt: string | null;
}

/** The waiver never expires: once handed in, the client has it. */
export function waiverStatus(lastSignedAt: string | null): WaiverStatus {
  return { state: lastSignedAt === null ? 'missing' : 'valid', signedAt: lastSignedAt };
}
