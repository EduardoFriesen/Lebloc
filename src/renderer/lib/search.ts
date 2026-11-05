import { fold } from '../../shared/text';

/** Case- and accent-insensitive "contains"; an empty query matches everything. */
export function matchesSearch(text: string, query: string): boolean {
  return fold(text).includes(fold(query.trim()));
}
