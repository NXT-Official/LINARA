/** Case-insensitive "contains", for ListFilter's search box. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || name.toLowerCase().includes(q);
}
