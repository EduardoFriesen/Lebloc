export function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((current, i) => (i === index ? item : current));
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
