/**
 * Location classification helper for Shop (Sale Point) vs Warehouse (Storage Point).
 */
export const isShopLocation = (name?: string): boolean => {
  const n = String(name || '').trim().toUpperCase();
  if (!n) return false;
  return (
    n.includes('SHOWROOM') ||
    n.includes('SHOP') ||
    n.includes('SALE') ||
    n.includes('RETAIL') ||
    n.includes('TILAK') ||
    n === 'SHOP'
  );
};

export const isWarehouseLocation = (name?: string): boolean => {
  return !isShopLocation(name);
};
