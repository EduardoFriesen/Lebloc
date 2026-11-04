import { describe, expect, it } from 'vitest';
import { waiverStatus } from './waiver';

describe('waiverStatus', () => {
  it('is missing when the client never handed it in', () => {
    expect(waiverStatus(null)).toEqual({ state: 'missing', signedAt: null });
  });

  it('stays valid forever once handed in', () => {
    expect(waiverStatus('2015-10-10')).toEqual({ state: 'valid', signedAt: '2015-10-10' });
  });
});
