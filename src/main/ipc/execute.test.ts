import { describe, expect, it, vi } from 'vitest';
import { ERROR_MESSAGES } from '../../domain/errors';
import { createTestContext, freePlan } from '../test-context';
import { execute, type Handlers } from './execute';
import { createHandlers, type BackupOps } from './handlers';
import { isTrustedSender } from './register';

const backup: BackupOps = {
  exportBackup: async () => ({ status: 'cancelled' }),
  restoreBackup: async () => ({ status: 'cancelled' }),
};

describe('execute', () => {
  const handlers = createHandlers(createTestContext(), backup);

  it('wraps successful results', async () => {
    const result = await execute('plans:create', freePlan, handlers, vi.fn());
    expect(result).toMatchObject({ success: true, data: { name: 'Pack 8 libres', freePasses: 8 } });
  });

  it('applies schema defaults before calling the handler', async () => {
    const result = await execute('clients:list', {}, handlers, vi.fn());
    expect(result).toEqual({ success: true, data: [] });
  });

  it('returns VALIDATION_ERROR with field details for invalid input', async () => {
    const result = await execute('plans:create', { ...freePlan, name: '' }, handlers, vi.fn());
    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    if (!result.success) {
      expect(result.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'name' })]));
    }
  });

  it('maps domain errors to their code and Spanish message', async () => {
    const result = await execute('payments:void', { id: 999 }, handlers, vi.fn());
    expect(result).toEqual({ success: false, error: { code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND } });
  });

  it('hides unexpected errors from the renderer and logs them', async () => {
    const logError = vi.fn();
    const failing: Handlers = {
      ...handlers,
      'plans:list': () => {
        throw new Error('SQLITE_CORRUPT: secret internal detail');
      },
    };
    const result = await execute('plans:list', {}, failing, logError);
    expect(result).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe('isTrustedSender', () => {
  it('trusts only the bundled renderer or the dev server', () => {
    expect(isTrustedSender('file:///opt/lebloc/out/renderer/index.html', undefined)).toBe(true);
    expect(isTrustedSender('https://evil.example', undefined)).toBe(false);
    expect(isTrustedSender('http://localhost:5173/#/clientes', 'http://localhost:5173')).toBe(true);
    expect(isTrustedSender('file:///tmp/x.html', 'http://localhost:5173')).toBe(false);
    expect(isTrustedSender(undefined, undefined)).toBe(false);
  });
});
