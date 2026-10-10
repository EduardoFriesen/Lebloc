import { beforeEach, describe, expect, it } from 'vitest';
import { adultClient, createTestContext, type TestContext } from '../test-context';
import { getClientAccount } from './account';
import { archiveClient, createClient, listClients } from './clients';
import { updateSettings } from './settings';
import { listWaiverAlerts, signWaiver, voidWaiver } from './waivers';

describe('signed waivers', () => {
  let ctx: TestContext;
  let anaId: number;

  beforeEach(() => {
    ctx = createTestContext();
    anaId = createClient(ctx, adultClient).id;
  });

  it('records a signature and reports the waiver as valid until it expires', () => {
    const signature = signWaiver(ctx, { clientId: anaId, signedAt: '2026-10-01' });
    expect(signature).toMatchObject({ clientId: anaId, signedAt: '2026-10-01', voidedAt: null });

    const account = getClientAccount(ctx, anaId);
    expect(account.waivers).toEqual([signature]);
    expect(account.waiver).toEqual({ state: 'valid', signedAt: '2026-10-01', expiresAt: '2027-10-01' });
  });

  it('uses the configured validity in months', () => {
    updateSettings(ctx, { lowPassesThreshold: 2, waiverValidityMonths: 1 });
    signWaiver(ctx, { clientId: anaId, signedAt: '2026-08-05' });
    expect(getClientAccount(ctx, anaId).waiver).toMatchObject({ state: 'expired', expiresAt: '2026-09-05' });
  });

  it('rejects future dates and archived clients', () => {
    expect(() => signWaiver(ctx, { clientId: anaId, signedAt: '2026-10-06' })).toThrow(expect.objectContaining({ code: 'WAIVER_DATE_IN_FUTURE' }));
    archiveClient(ctx, anaId);
    expect(() => signWaiver(ctx, { clientId: anaId, signedAt: '2026-10-05' })).toThrow(expect.objectContaining({ code: 'CLIENT_ARCHIVED' }));
  });

  it('ignores voided signatures and cannot void twice', () => {
    signWaiver(ctx, { clientId: anaId, signedAt: '2025-01-10' });
    const latest = signWaiver(ctx, { clientId: anaId, signedAt: '2026-10-01' });
    expect(voidWaiver(ctx, latest.id).voidedAt).not.toBeNull();
    expect(getClientAccount(ctx, anaId).waiver).toMatchObject({ state: 'expired', signedAt: '2025-01-10' });
    expect(() => voidWaiver(ctx, latest.id)).toThrow(expect.objectContaining({ code: 'ALREADY_VOIDED' }));
  });

  it('shows the waiver state in the counter search', () => {
    expect(listClients(ctx, { search: 'Ana', includeArchived: false, onlyDebtors: false, onlyWithPasses: false, onlyPendingWaiver: false })[0]?.waiver.state).toBe('missing');
    signWaiver(ctx, { clientId: anaId, signedAt: '2026-10-05' });
    expect(listClients(ctx, { search: 'Ana', includeArchived: false, onlyDebtors: false, onlyWithPasses: false, onlyPendingWaiver: false })[0]?.waiver.state).toBe('valid');
  });

  it('alerts on active clients whose waiver is missing or expired', () => {
    const brunoId = createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' }).id;
    const caroId = createClient(ctx, { ...adultClient, firstName: 'Caro', lastName: 'Vía' }).id;
    signWaiver(ctx, { clientId: brunoId, signedAt: '2025-01-01' });
    signWaiver(ctx, { clientId: caroId, signedAt: '2026-10-01' });
    const archivedId = createClient(ctx, { ...adultClient, firstName: 'Dani', lastName: 'Zeta' }).id;
    archiveClient(ctx, archivedId);

    expect(listWaiverAlerts(ctx)).toEqual([
      { clientId: anaId, clientName: 'Ana Roca', state: 'missing', expiresAt: null },
      { clientId: brunoId, clientName: 'Bruno Sierra', state: 'expired', expiresAt: '2026-01-01' },
    ]);
  });
});
