export function unitCostCents(packCostCents: number, packSize: number): number {
  return Math.round(packCostCents / packSize);
}

/** Markup over cost, computed from the pack values so it rounds only once. */
export function suggestedPriceCents(packCostCents: number, packSize: number, markupPercent: number): number {
  return Math.round((packCostCents * (100 + markupPercent)) / (packSize * 100));
}

export function ticketTotalCents(items: readonly { quantity: number; unitPriceCents: number }[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
}

/** What the local keeps: price minus the unit cost snapshot, for every unit sold. */
export function ticketProfitCents(items: readonly { quantity: number; unitPriceCents: number; unitCostCents: number }[]): number {
  return items.reduce((total, item) => total + item.quantity * (item.unitPriceCents - item.unitCostCents), 0);
}
