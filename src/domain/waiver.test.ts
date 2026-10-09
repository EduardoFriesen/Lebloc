import { describe, expect, it } from 'vitest';
import { waiverStatus } from './waiver';

describe('waiverStatus', () => {
  it('is missing when the client never signed', () => {
    expect(waiverStatus(null, 12, '2026-10-09')).toEqual({ state: 'missing', signedAt: null, expiresAt: null });
  });

  it('is valid until the day before it expires', () => {
    expect(waiverStatus('2025-10-10', 12, '2026-10-09')).toEqual({ state: 'valid', signedAt: '2025-10-10', expiresAt: '2026-10-10' });
  });

  it('expires on the expiry date', () => {
    expect(waiverStatus('2025-10-09', 12, '2026-10-09')).toEqual({ state: 'expired', signedAt: '2025-10-09', expiresAt: '2026-10-09' });
  });
});
