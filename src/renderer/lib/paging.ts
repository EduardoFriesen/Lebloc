export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Zero-based page, pulled back to the last one when the list shrinks (e.g. someone leaves the preload). */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(page, pageCount(total, pageSize) - 1);
}
