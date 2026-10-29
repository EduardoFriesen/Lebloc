export function unitCostCents(costCents: number, quantity: number): number {
  return Math.round(costCents / quantity);
}

/** Markup over the unit cost. */
export function suggestedPriceCents(unitCostCents: number, markupPercent: number): number {
  return Math.round((unitCostCents * (100 + markupPercent)) / 100);
}

export function ticketTotalCents(items: readonly { quantity: number; unitPriceCents: number }[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
}

/** What the local keeps: price minus the unit cost snapshot, for every unit sold. */
export function ticketProfitCents(items: readonly { quantity: number; unitPriceCents: number; unitCostCents: number }[]): number {
  return items.reduce((total, item) => total + item.quantity * (item.unitPriceCents - item.unitCostCents), 0);
}

export function purchaseTotalCents(items: readonly { costCents: number }[]): number {
  return items.reduce((total, item) => total + item.costCents, 0);
}
