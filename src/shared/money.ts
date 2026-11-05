const CURRENCY = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const INPUT_NUMBER = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONEY_PATTERN = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;

export function formatMoney(cents: number): string {
  return CURRENCY.format(cents / 100);
}

export function formatMoneyInput(cents: number): string {
  return INPUT_NUMBER.format(cents / 100);
}

export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(/\$/g, '').replace(/\s/g, '');
  if (!MONEY_PATTERN.test(cleaned)) return null;
  const [integerPart = '0', decimalPart = ''] = cleaned.replace(/\./g, '').split(',');
  return Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'));
}
