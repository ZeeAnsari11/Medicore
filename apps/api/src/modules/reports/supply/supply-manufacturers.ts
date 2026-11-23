/**
 * The sale items to list on a sheet: with a manufacturer pick only the products of those manufacturers
 * (`allowed` undefined = every manufacturer, nothing is dropped).
 */
export function limitToManufacturers<T extends { productId: unknown }>(items: T[], manufacturerOf: Map<string, string | undefined>, allowed?: Set<string>): T[] {
  if (!allowed) return items;
  return items.filter((i) => {
    const m = manufacturerOf.get(String(i.productId));
    return !!m && allowed.has(m);
  });
}
