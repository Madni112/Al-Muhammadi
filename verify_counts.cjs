const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ioxsprfchcytqbyriwby.supabase.co', 'sb_publishable_59EOl26obYAzn_Z9pZQ9Bw_T0iKDKZJ');

const allTables = [
  'products', 'inventory_categories', 'inventory_brands', 'inventory_locations',
  'inventory_uom', 'opening_stocks', 'stock_balances', 'warehouse_inventory', 'stock_transfers',
  'sales_invoices', 'delivery_challans', 'sales_returns', 'customers', 'salesmen',
  'supplier_purchases', 'grn_receipts', 'grn_items', 'purchase_returns', 'vendors',
  'financial_vouchers', 'chart_of_accounts', 'banks', 'audit_logs',
  'hr_employees', 'hr_designations', 'notifications'
];

async function verify() {
  const finalCounts = {};
  for (const t of allTables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    finalCounts[t] = count;
  }
  console.log(JSON.stringify(finalCounts, null, 2));
}
verify();
