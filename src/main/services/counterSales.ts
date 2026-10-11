import { DomainError } from '../../domain/errors';
import type { CounterSellInput } from '../../shared/schemas';
import type { CounterPrices, CounterSale } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as repo from '../repos/counterSales';
import { getSetting, setSetting } from '../repos/settings';

const DAY_PASS_KEY = 'day_pass_price_cents';
const SHOE_RENTAL_KEY = 'shoe_rental_price_cents';

function readCents(ctx: Context, key: string): number {
  const stored = Number(getSetting(ctx.db, key));
  return Number.isInteger(stored) && stored > 0 ? stored : 0;
}

export function getCounterPrices(ctx: Context): CounterPrices {
  return { dayPassCents: readCents(ctx, DAY_PASS_KEY), shoeRentalCents: readCents(ctx, SHOE_RENTAL_KEY) };
}

export function updateCounterPrices(ctx: Context, input: CounterPrices): CounterPrices {
  ctx.db.transaction(() => {
    setSetting(ctx.db, DAY_PASS_KEY, String(input.dayPassCents));
    setSetting(ctx.db, SHOE_RENTAL_KEY, String(input.shoeRentalCents));
  })();
  return getCounterPrices(ctx);
}

function getCounterSale(ctx: Context, id: number): CounterSale {
  const sale = repo.findCounterSale(ctx.db, id);
  if (!sale) throw new DomainError('NOT_FOUND');
  return sale;
}

/** The price comes from the stored settings, never from the caller. */
export function sellCounter(ctx: Context, input: CounterSellInput): CounterSale[] {
  const prices = getCounterPrices(ctx);
  return ctx.db.transaction(() =>
    input.kinds.map((kind) => {
      const priceCents = kind === 'day_pass' ? prices.dayPassCents : prices.shoeRentalCents;
      if (priceCents <= 0) throw new DomainError('PRICE_NOT_SET');
      const id = repo.insertCounterSale(ctx.db, { kind, priceCents, method: input.method, soldAt: today(ctx), recordedAt: nowIso(ctx) });
      return getCounterSale(ctx, id);
    }),
  )();
}

export function voidCounterSale(ctx: Context, id: number): CounterSale {
  if (getCounterSale(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.voidCounterSale(ctx.db, id, nowIso(ctx));
  return getCounterSale(ctx, id);
}

export function listCounterSales(ctx: Context, date: string): CounterSale[] {
  return repo.listCounterSalesOn(ctx.db, date);
}
