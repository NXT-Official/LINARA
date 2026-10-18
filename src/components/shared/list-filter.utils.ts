/** Search and filter chips only earn their space once a list is longer than a glance. */
export const FILTER_FROM = 9;

/** Case-insensitive "contains", for ListFilter's search box. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || name.toLowerCase().includes(q);
}
