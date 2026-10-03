import { supabase } from '../Context/supabaseClient';

export interface BankBalanceItem {
  id: string | number;
  bankName: string;
  accountTitle: string;
  accountNumber?: string;
  openingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  netBalance: number;
}

export interface TopStockProduct {
  id: string | number;
  name: string;
  qty: number;
  unitPrice: number;
  totalValuation: number;
}

export interface FinancialSummary {
  baseOpeningStockValue: number;
  totalPurchasesStockVal: number;
  totalSalesStockVal: number;
  totalSalesReturnsStockVal: number;
  totalPurchaseReturnsStockVal: number;
  totalStockUnits: number;
  topStockProducts: TopStockProduct[];
  cashBalance: number;
  totalCashInflow: number;
  totalCashOutflow: number;
  thisMonthCashInflow: number;
  thisMonthCashOutflow: number;
  totalBankBalance: number;
  thisMonthBankInflow: number;
  thisMonthBankOutflow: number;
  bankAccounts: BankBalanceItem[];
  todaysSales: number;
  thisMonthSales: number;
  thisMonthPurchases: number;
  totalReceivables: number;
  thisMonthReceivables: number;
  totalPayables: number;
  thisMonthPayables: number;
  inventoryAssetValue: number;
  monthOpeningStockValue: number;
  thisMonthStockInflowVal: number;
  thisMonthStockOutflowVal: number;
  thisMonthStockMovement: number;
  totalAssets: number;
  thisMonthAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  monthlySalesTrend: { month: string; sales: number; purchases: number }[];
  cashFlowTrend: { month: string; inflow: number; outflow: number }[];
}

export const fetchFinancialMetrics = async (): Promise<FinancialSummary> => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const startOfCurrentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;

    const isThisMonth = (dateStr?: string | null) => {
      if (!dateStr) return false;
      const clean = String(dateStr).split('T')[0];
      if (clean >= startOfCurrentMonthStr) return true;
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    };

    // 1. Fetch data from Supabase tables & RPC in parallel with full fault tolerance
    const [
      salesInvoicesRes,
      supplierPurchasesRes,
      salesReturnsRes,
      salesReturnReceiptsRes,
      purchaseReturnsRes,
      purchaseReturnReceiptsRes,
      vouchersRes,
      banksRes,
      productsRes,
      customerReceiptsRes,
      openStocksRes,
      dynamicStockRes
    ] = await Promise.allSettled([
      supabase.from('sales_invoices').select('*'),
      supabase.from('supplier_purchases').select('*'),
      supabase.from('sales_returns').select('*'),
      supabase.from('sales_return_receipts').select('*'),
      supabase.from('purchase_returns').select('*'),
      supabase.from('purchase_return_receipts').select('*'),
      supabase.from('financial_vouchers').select('*'),
      supabase.from('banks').select('*'),
      supabase.from('products').select('*'),
      supabase.from('customer_recoveries').select('*'),
      supabase.from('opening_stocks').select('*'),
      supabase.rpc('calculate_dynamic_stock_by_location', { p_location: 'All', p_start_date: startOfCurrentMonthStr, p_end_date: null })
    ]);

    const invoicesList = (salesInvoicesRes.status === 'fulfilled' && Array.isArray(salesInvoicesRes.value.data)) ? salesInvoicesRes.value.data : [];
    const purchasesList = (supplierPurchasesRes.status === 'fulfilled' && Array.isArray(supplierPurchasesRes.value.data)) ? supplierPurchasesRes.value.data : [];
    const salesReturnsList = (salesReturnsRes.status === 'fulfilled' && Array.isArray(salesReturnsRes.value.data)) ? salesReturnsRes.value.data : [];
    const salesReturnRecList = (salesReturnReceiptsRes.status === 'fulfilled' && Array.isArray(salesReturnReceiptsRes.value.data)) ? salesReturnReceiptsRes.value.data : [];
    const purchaseReturnsList = (purchaseReturnsRes.status === 'fulfilled' && Array.isArray(purchaseReturnsRes.value.data)) ? purchaseReturnsRes.value.data : [];
    const purchaseReturnRecList = (purchaseReturnReceiptsRes.status === 'fulfilled' && Array.isArray(purchaseReturnReceiptsRes.value.data)) ? purchaseReturnReceiptsRes.value.data : [];
    const vouchersList = (vouchersRes.status === 'fulfilled' && Array.isArray(vouchersRes.value.data)) ? vouchersRes.value.data : [];
    const banksList = (banksRes.status === 'fulfilled' && Array.isArray(banksRes.value.data)) ? banksRes.value.data : [];

    const productsList = (productsRes.status === 'fulfilled' && Array.isArray(productsRes.value.data)) ? productsRes.value.data : [];
    const customerRecList = (customerReceiptsRes.status === 'fulfilled' && Array.isArray(customerReceiptsRes.value.data)) ? customerReceiptsRes.value.data : [];
    const openStocksList = (openStocksRes.status === 'fulfilled' && Array.isArray(openStocksRes.value.data)) ? openStocksRes.value.data : [];
    const dynamicStockList = (dynamicStockRes.status === 'fulfilled' && Array.isArray(dynamicStockRes.value.data)) ? dynamicStockRes.value.data : [];

    // --- 2. Calculate Today's & Monthly Net Sales & Purchases ---
    let todaysSales = 0;
    let thisMonthSales = 0;

    invoicesList.forEach((inv: any) => {
      const invAmt = Number(inv.total_amount || 0);
      const invDateStr = String(inv.created_at || inv.invoice_date || '').split('T')[0];

      if (invDateStr === todayStr) {
        todaysSales += invAmt;
      }

      if (invDateStr) {
        const d = new Date(invDateStr);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          thisMonthSales += invAmt;
        }
      }
    });

    // Deduct Sales Returns from Net Sales Metrics
    salesReturnsList.forEach((ret: any) => {
      const retAmt = Number(ret.total_amount || ret.total_net_amount || 0);
      const retDateStr = String(ret.created_at || ret.return_date || '').split('T')[0];

      if (retDateStr === todayStr) {
        todaysSales -= retAmt;
      }

      if (retDateStr) {
        const d = new Date(retDateStr);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          thisMonthSales -= retAmt;
        }
      }
    });

    todaysSales = Math.max(0, todaysSales);
    thisMonthSales = Math.max(0, thisMonthSales);

    let thisMonthPurchases = 0;
    purchasesList.forEach((pur: any) => {
      const purAmt = Number(pur.total_amount || 0);
      const purDateStr = String(pur.created_at || pur.purchase_date || '').split('T')[0];
      if (purDateStr) {
        const d = new Date(purDateStr);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          thisMonthPurchases += purAmt;
        }
      }
    });

    // Deduct Purchase Returns from Net Monthly Purchases
    purchaseReturnsList.forEach((pret: any) => {
      const pretAmt = Number(pret.total_amount || pret.total_net_amount || 0);
      const pretDateStr = String(pret.created_at || pret.return_date || '').split('T')[0];
      if (pretDateStr) {
        const d = new Date(pretDateStr);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          thisMonthPurchases -= pretAmt;
        }
      }
    });
    thisMonthPurchases = Math.max(0, thisMonthPurchases);

    // --- 3. Calculate Cash Balance (App Cash Drawer Liquidity) ---
    let cashInflow = 0;
    let cashOutflow = 0;
    let thisMonthCashInflow = 0;
    let thisMonthCashOutflow = 0;

    // 1. Upfront Cash Received on Sales Invoices
    const paidInvoicesMap = new Map<string, { total: number; cashPaid: number; isThisMonth: boolean }>();
    invoicesList.forEach((inv: any) => {
      const paid = Number(inv.cash_amount_paid || inv.amount_paid || 0);
      const tot = Number(inv.total_amount || 0);
      const invId = String(inv.id).trim().toLowerCase();
      const invDate = inv.created_at || inv.invoice_date;
      const invInThisMonth = isThisMonth(invDate);

      paidInvoicesMap.set(invId, { total: tot, cashPaid: paid, isThisMonth: invInThisMonth });
      paidInvoicesMap.set(`inv-${invId}`, { total: tot, cashPaid: paid, isThisMonth: invInThisMonth });

      if (inv.settlement_mode === 'Cash' || inv.payment_mode === 'Cash') {
        const receivedAmt = paid || tot;
        cashInflow += receivedAmt;
        if (invInThisMonth) thisMonthCashInflow += receivedAmt;
      } else if (paid > 0) {
        cashInflow += paid;
        if (invInThisMonth) thisMonthCashInflow += paid;
      }
    });

    // 2. Financial Vouchers (Subsequent Customer Receipts / General Cash Inflows)
    vouchersList.forEach((v: any) => {
      const amt = Number(v.total_amount || v.amount || 0);
      const mode = String(v.mode_of_payment || v.payment_mode || v.voucher_type || '');
      const isReceipt = String(v.voucher_type || '').toLowerCase().includes('receipt');
      const isPayment = String(v.voucher_type || '').toLowerCase().includes('payment');
      const vDate = v.created_at || v.voucher_date || v.date;
      const vInThisMonth = isThisMonth(vDate);

      if (!mode.toLowerCase().includes('bank')) {
        if (isReceipt) {
          const cleanRef = String(v.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
          const targetInv = cleanRef ? paidInvoicesMap.get(cleanRef) : null;
          // If voucher is linked to an invoice that was ALREADY 100% paid upfront in cash, do not double-add
          if (targetInv && targetInv.cashPaid >= targetInv.total) {
            return;
          }
          cashInflow += amt;
          if (vInThisMonth) thisMonthCashInflow += amt;
        }
        if (isPayment) {
          cashOutflow += amt;
          if (vInThisMonth) thisMonthCashOutflow += amt;
        }
      }
    });

    // 3. Customer Cash Recoveries (Unlinked)
    customerRecList.forEach((rec: any) => {
      if (rec.deposit_mode === 'Cash' || rec.payment_mode === 'Cash' || !rec.deposit_mode) {
        const invRef = String(rec.invoice_id || rec.invoice_no || '').replace('INV-', '').trim().toLowerCase();
        const targetInv = invRef ? paidInvoicesMap.get(invRef) : null;
        if (targetInv && targetInv.cashPaid >= targetInv.total) {
          return;
        }
        const recAmt = Number(rec.net_collected_amount || rec.amount_paid || rec.amount || 0);
        cashInflow += recAmt;
        if (isThisMonth(rec.created_at || rec.recovery_date || rec.date)) {
          thisMonthCashInflow += recAmt;
        }
      }
    });

    // Cash Purchases Outflow
    purchasesList.forEach((pur: any) => {
      const paid = Number(pur.amount_paid_now || pur.paid_amount || 0);
      const purDate = pur.created_at || pur.purchase_date;
      const purInThisMonth = isThisMonth(purDate);

      if (pur.payment_mode === 'Cash' || pur.settlement_mode === 'Cash') {
        const outAmt = paid || Number(pur.total_amount || 0);
        cashOutflow += outAmt;
        if (purInThisMonth) thisMonthCashOutflow += outAmt;
      } else if (paid > 0 && pur.payment_mode !== 'Bank') {
        cashOutflow += paid;
        if (purInThisMonth) thisMonthCashOutflow += paid;
      }
    });

    // Sales Return Receipts Cash Outflow
    salesReturnRecList.forEach((srec: any) => {
      if (srec.settlement_mode === 'Cash') {
        const sAmt = Number(srec.amount_paid || 0);
        cashOutflow += sAmt;
        if (isThisMonth(srec.created_at || srec.receipt_date || srec.date)) {
          thisMonthCashOutflow += sAmt;
        }
      }
    });

    // Purchase Return Receipts Cash Inflow
    purchaseReturnRecList.forEach((prec: any) => {
      if (prec.settlement_mode === 'Cash') {
        const pAmt = Number(prec.amount_received || prec.amount_paid || 0);
        cashInflow += pAmt;
        if (isThisMonth(prec.created_at || prec.receipt_date || prec.date)) {
          thisMonthCashInflow += pAmt;
        }
      }
    });

    const netCashBalance = Math.max(0, cashInflow - cashOutflow);

    // --- 4. Calculate Bank Balances per Corporate Bank Ledger ---
    const bankLedgerMap: Record<string, BankBalanceItem> = {};
    let thisMonthBankInflow = 0;
    let thisMonthBankOutflow = 0;

    banksList.forEach((b: any) => {
      const key = String(b.accountTitle || b.bankName || b.id).trim();
      bankLedgerMap[key] = {
        id: b.id,
        bankName: b.bankName || 'Bank',
        accountTitle: b.accountTitle || key,
        accountNumber: b.accountNumber || '',
        openingBalance: Number(b.openingBalance || 0),
        totalInflow: 0,
        totalOutflow: 0,
        netBalance: Number(b.openingBalance || 0)
      };
    });

    // Bank Invoices
    invoicesList.forEach((inv: any) => {
      if (inv.settlement_mode === 'Bank' && inv.selectedBankTitle) {
        const title = String(inv.selectedBankTitle).trim();
        const amt = Number(inv.cash_amount_paid || inv.total_amount || 0);
        if (!bankLedgerMap[title]) {
          bankLedgerMap[title] = { id: title, bankName: 'Bank', accountTitle: title, openingBalance: 0, totalInflow: 0, totalOutflow: 0, netBalance: 0 };
        }
        bankLedgerMap[title].totalInflow += amt;
        if (isThisMonth(inv.created_at || inv.invoice_date)) {
          thisMonthBankInflow += amt;
        }
      }
    });

    // Bank Supplier Purchases
    purchasesList.forEach((pur: any) => {
      if ((pur.payment_mode === 'Bank' || pur.settlement_mode === 'Bank') && pur.selected_bank_title) {
        const title = String(pur.selected_bank_title).trim();
        const amt = Number(pur.amount_paid_now || pur.total_amount || 0);
        if (!bankLedgerMap[title]) {
          bankLedgerMap[title] = { id: title, bankName: 'Bank', accountTitle: title, openingBalance: 0, totalInflow: 0, totalOutflow: 0, netBalance: 0 };
        }
        bankLedgerMap[title].totalOutflow += amt;
        if (isThisMonth(pur.created_at || pur.purchase_date)) {
          thisMonthBankOutflow += amt;
        }
      }
    });

    // Bank Vouchers
    vouchersList.forEach((v: any) => {
      const bankTitle = String(v.bank_account || v.bank_title || '').trim();
      const amt = Number(v.total_amount || 0);
      const isReceipt = String(v.voucher_type || '').toLowerCase().includes('receipt');
      const isPayment = String(v.voucher_type || '').toLowerCase().includes('payment');
      const vInThisMonth = isThisMonth(v.created_at || v.voucher_date || v.date);

      if (bankTitle) {
        if (!bankLedgerMap[bankTitle]) {
          bankLedgerMap[bankTitle] = { id: bankTitle, bankName: 'Bank', accountTitle: bankTitle, openingBalance: 0, totalInflow: 0, totalOutflow: 0, netBalance: 0 };
        }
        if (isReceipt) {
          bankLedgerMap[bankTitle].totalInflow += amt;
          if (vInThisMonth) thisMonthBankInflow += amt;
        }
        if (isPayment) {
          bankLedgerMap[bankTitle].totalOutflow += amt;
          if (vInThisMonth) thisMonthBankOutflow += amt;
        }
      }
    });

    // Bank Sales Return Receipts Outflow
    salesReturnRecList.forEach((srec: any) => {
      if (srec.settlement_mode === 'Bank' && srec.bank_account_title) {
        const title = String(srec.bank_account_title).trim();
        const amt = Number(srec.amount_paid || 0);
        if (!bankLedgerMap[title]) {
          bankLedgerMap[title] = { id: title, bankName: 'Bank', accountTitle: title, openingBalance: 0, totalInflow: 0, totalOutflow: 0, netBalance: 0 };
        }
        bankLedgerMap[title].totalOutflow += amt;
        if (isThisMonth(srec.created_at || srec.receipt_date || srec.date)) {
          thisMonthBankOutflow += amt;
        }
      }
    });

    const bankAccountsList = Object.values(bankLedgerMap).map(b => {
      b.netBalance = b.openingBalance + b.totalInflow - b.totalOutflow;
      return b;
    });

    const totalBankBalance = bankAccountsList.reduce((acc, b) => acc + b.netBalance, 0);

    // --- 5. True Net Receivables, Payables, Inventory Asset Value ---
    let totalReceivables = 0;
    let thisMonthReceivables = 0;

    invoicesList.forEach((inv: any) => {
      const invIdStr = String(inv.id).trim().toLowerCase();
      const tot = Number(inv.total_amount || 0);
      const initialPaid = Number(inv.cash_amount_paid || inv.amount_paid || 0);
      const invInThisMonth = isThisMonth(inv.created_at || inv.invoice_date);

      // Sum returns for this specific invoice
      const matchedReturns = salesReturnsList.filter((r: any) => {
        const cleanRef = String(r.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
        return cleanRef === invIdStr;
      });
      const returnsSum = matchedReturns.reduce((sum: number, r: any) => sum + Number(r.total_amount || r.total_net_amount || 0), 0);

      // Sum vouchers for this specific invoice
      const matchedVouchers = vouchersList.filter((v: any) => {
        const cleanRef = String(v.original_invoice_no || '').replace('INV-', '').trim().toLowerCase();
        const isReceipt = String(v.voucher_type || '').toLowerCase().includes('receipt');
        return isReceipt && cleanRef === invIdStr;
      });
      const vouchersSum = matchedVouchers.reduce((sum: number, v: any) => sum + Number(v.total_amount || 0), 0);

      const netDue = Math.max(0, tot - initialPaid - vouchersSum - returnsSum);
      totalReceivables += netDue;
      if (invInThisMonth) {
        thisMonthReceivables += netDue;
      }
    });

    let totalPayables = 0;
    let thisMonthPayables = 0;

    purchasesList.forEach((pur: any) => {
      const purIdStr = String(pur.id).trim().toLowerCase();
      const tot = Number(pur.total_amount || 0);
      const initialPaid = Number(pur.amount_paid_now || pur.paid_amount || 0);
      const purInThisMonth = isThisMonth(pur.created_at || pur.purchase_date);

      // Sum purchase returns for this specific purchase
      const matchedPReturns = purchaseReturnsList.filter((pr: any) => {
        const cleanRef = String(pr.purchase_no || pr.original_purchase_no || '').replace('PUR-', '').trim().toLowerCase();
        return cleanRef === purIdStr;
      });
      const pReturnsSum = matchedPReturns.reduce((sum: number, pr: any) => sum + Number(pr.total_amount || 0), 0);

      const netPayableDue = Math.max(0, tot - initialPaid - pReturnsSum);
      totalPayables += netPayableDue;
      if (purInThisMonth) {
        thisMonthPayables += netPayableDue;
      }
    });

    // Precise Real-Time Inventory Asset Valuation (Matched 100% with Stock Balances & Valuation Registry)
    let inventoryAssetValue = 0;
    let monthOpeningStockValue = 0;
    let thisMonthStockInflowVal = 0;
    let thisMonthStockOutflowVal = 0;
    let thisMonthStockMovement = 0;

    let baseOpeningStockValue = 0;
    let totalPurchasesStockVal = 0;
    let totalSalesStockVal = 0;
    let totalSalesReturnsStockVal = 0;
    let totalPurchaseReturnsStockVal = 0;
    let totalStockUnits = 0;
    const productValuationList: TopStockProduct[] = [];

    const priceMap: Record<string, number> = {};
    productsList.forEach((p: any) => {
      const nameKey = String(p.product_name || p.name || '').trim().toLowerCase();
      priceMap[nameKey] = Number(p.retail_price || p.sale_price || 0);
    });

    // Compute comprehensive stock valuation across all products
    (productsList || []).forEach((p: any) => {
      const pName = String(p.product_name || p.name || '').trim().toLowerCase();
      const unitPrice = priceMap[pName] || Number(p.retail_price || p.sale_price || 0);

      // 1. Initial Opening Stock from opening_stocks table
      const prodOs = (openStocksList || []).filter((o: any) => String(o.product_name || o.item_name || o.itemName || '').trim().toLowerCase() === pName);
      const osQty = prodOs.reduce((acc: number, o: any) => acc + Number(o.quantity || o.qty || 0), 0);

      // 2. Purchases Prior vs This Month
      let priorPurchases = 0;
      let thisMonthPurchases = 0;
      (purchasesList || []).forEach((pur: any) => {
        const pDate = String(pur.created_at || pur.purchase_date || '').split('T')[0];
        const items = Array.isArray(pur.items) ? pur.items : (typeof pur.items === 'string' ? JSON.parse(pur.items || '[]') : []);
        items.forEach((it: any) => {
          const itName = String(it.product_name || it.itemName || it.itemDetails || '').trim().toLowerCase();
          if (itName === pName) {
            const q = Number(it.quantity || it.qty || 0);
            if (pDate && pDate < startOfCurrentMonthStr) {
              priorPurchases += q;
            } else {
              thisMonthPurchases += q;
            }
          }
        });
      });

      // 3. Sales Prior vs This Month
      let priorSales = 0;
      let thisMonthSales = 0;
      (invoicesList || []).forEach((inv: any) => {
        const iDate = String(inv.created_at || inv.sale_date || inv.invoice_date || '').split('T')[0];
        const items = Array.isArray(inv.items) ? inv.items : (typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : []);
        items.forEach((it: any) => {
          const itName = String(it.product_name || it.itemName || it.pDescription || '').trim().toLowerCase();
          if (itName === pName) {
            const q = Number(it.qty || it.quantity || 0);
            if (iDate && iDate < startOfCurrentMonthStr) {
              priorSales += q;
            } else {
              thisMonthSales += q;
            }
          }
        });
      });

      // 4. Sales Returns Prior vs This Month
      let priorSalesReturns = 0;
      let thisMonthSalesReturns = 0;
      (salesReturnsList || []).forEach((sr: any) => {
        const rDate = String(sr.created_at || sr.return_date || '').split('T')[0];
        const items = Array.isArray(sr.items) ? sr.items : (typeof sr.items === 'string' ? JSON.parse(sr.items || '[]') : []);
        items.forEach((it: any) => {
          const itName = String(it.product_name || it.item_name || it.itemName || '').trim().toLowerCase();
          if (itName === pName) {
            const q = Number(it.quantity || it.qty || 0);
            if (rDate && rDate < startOfCurrentMonthStr) {
              priorSalesReturns += q;
            } else {
              thisMonthSalesReturns += q;
            }
          }
        });
      });

      // 5. Purchase Returns Prior vs This Month
      let priorPurchaseReturns = 0;
      let thisMonthPurchaseReturns = 0;
      (purchaseReturnsList || []).forEach((pr: any) => {
        const prDate = String(pr.created_at || pr.return_date || '').split('T')[0];
        const items = Array.isArray(pr.items) ? pr.items : (typeof pr.items === 'string' ? JSON.parse(pr.items || '[]') : []);
        items.forEach((it: any) => {
          const itName = String(it.product_name || it.item_name || it.itemName || '').trim().toLowerCase();
          if (itName === pName) {
            const q = Number(it.quantity || it.qty || 0);
            if (prDate && prDate < startOfCurrentMonthStr) {
              priorPurchaseReturns += q;
            } else {
              thisMonthPurchaseReturns += q;
            }
          }
        });
      });

      // Formula: Opening Stock at month start = Initial OS + Prior In - Prior Out
      const monthOpeningQty = osQty + priorPurchases - priorSales + priorSalesReturns - priorPurchaseReturns;
      const netThisMonthIn = thisMonthPurchases + thisMonthSalesReturns;
      const netThisMonthOut = thisMonthSales + thisMonthPurchaseReturns;
      const currentPhysicalQty = monthOpeningQty + netThisMonthIn - netThisMonthOut;

      // Monthly Accumulations
      monthOpeningStockValue += (monthOpeningQty * unitPrice);
      thisMonthStockInflowVal += (netThisMonthIn * unitPrice);
      thisMonthStockOutflowVal += (netThisMonthOut * unitPrice);
      inventoryAssetValue += (currentPhysicalQty * unitPrice);

      // All-Time / Lifecycle Accumulations
      baseOpeningStockValue += (osQty * unitPrice);
      totalPurchasesStockVal += ((priorPurchases + thisMonthPurchases) * unitPrice);
      totalSalesStockVal += ((priorSales + thisMonthSales) * unitPrice);
      totalSalesReturnsStockVal += ((priorSalesReturns + thisMonthSalesReturns) * unitPrice);
      totalPurchaseReturnsStockVal += ((priorPurchaseReturns + thisMonthPurchaseReturns) * unitPrice);
      totalStockUnits += currentPhysicalQty;

      if (currentPhysicalQty > 0) {
        productValuationList.push({
          id: p.id || pName,
          name: p.product_name || pName,
          qty: currentPhysicalQty,
          unitPrice,
          totalValuation: currentPhysicalQty * unitPrice
        });
      }
    });

    thisMonthStockMovement = thisMonthStockInflowVal - thisMonthStockOutflowVal;
    const topStockProducts = productValuationList.sort((a, b) => b.totalValuation - a.totalValuation).slice(0, 4);

    // --- 6. Balance Sheet Equation Totals ---
    const totalAssets = netCashBalance + totalBankBalance + totalReceivables + inventoryAssetValue;
    const thisMonthAssets = thisMonthStockMovement;
    const totalLiabilities = totalPayables;
    const totalEquity = totalAssets - totalLiabilities;

    // --- 7. Monthly Trends (Last 6 Months) ---
    const monthsName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlySalesTrendMap: Record<string, { sales: number; purchases: number }> = {};
    const cashFlowTrendMap: Record<string, { inflow: number; outflow: number }> = {};

    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const key = `${monthsName[d.getMonth()]} ${d.getFullYear()}`;
      monthlySalesTrendMap[key] = { sales: 0, purchases: 0 };
      cashFlowTrendMap[key] = { inflow: 0, outflow: 0 };
    }

    invoicesList.forEach((inv: any) => {
      const d = new Date(inv.created_at || inv.invoice_date);
      if (!isNaN(d.getTime())) {
        const key = `${monthsName[d.getMonth()]} ${d.getFullYear()}`;
        if (monthlySalesTrendMap[key]) {
          monthlySalesTrendMap[key].sales += Number(inv.total_amount || 0);
        }
        if (cashFlowTrendMap[key]) {
          cashFlowTrendMap[key].inflow += Number(inv.cash_amount_paid || inv.total_amount || 0);
        }
      }
    });

    // Deduct Sales Returns from Monthly Trend
    salesReturnsList.forEach((ret: any) => {
      const d = new Date(ret.created_at || ret.return_date);
      if (!isNaN(d.getTime())) {
        const key = `${monthsName[d.getMonth()]} ${d.getFullYear()}`;
        if (monthlySalesTrendMap[key]) {
          monthlySalesTrendMap[key].sales = Math.max(0, monthlySalesTrendMap[key].sales - Number(ret.total_amount || ret.total_net_amount || 0));
        }
      }
    });

    purchasesList.forEach((pur: any) => {
      const d = new Date(pur.created_at || pur.purchase_date);
      if (!isNaN(d.getTime())) {
        const key = `${monthsName[d.getMonth()]} ${d.getFullYear()}`;
        if (monthlySalesTrendMap[key]) {
          monthlySalesTrendMap[key].purchases += Number(pur.total_amount || 0);
        }
        if (cashFlowTrendMap[key]) {
          cashFlowTrendMap[key].outflow += Number(pur.amount_paid_now || pur.total_amount || 0);
        }
      }
    });

    // Deduct Purchase Returns from Monthly Trend
    purchaseReturnsList.forEach((pret: any) => {
      const d = new Date(pret.created_at || pret.return_date);
      if (!isNaN(d.getTime())) {
        const key = `${monthsName[d.getMonth()]} ${d.getFullYear()}`;
        if (monthlySalesTrendMap[key]) {
          monthlySalesTrendMap[key].purchases = Math.max(0, monthlySalesTrendMap[key].purchases - Number(pret.total_amount || pret.total_net_amount || 0));
        }
      }
    });

    const monthlySalesTrend = Object.keys(monthlySalesTrendMap).map(k => ({
      month: k,
      sales: monthlySalesTrendMap[k].sales,
      purchases: monthlySalesTrendMap[k].purchases
    }));

    const cashFlowTrend = Object.keys(cashFlowTrendMap).map(k => ({
      month: k,
      inflow: cashFlowTrendMap[k].inflow,
      outflow: cashFlowTrendMap[k].outflow
    }));

    return {
      cashBalance: netCashBalance,
      totalCashInflow: cashInflow,
      totalCashOutflow: cashOutflow,
      thisMonthCashInflow,
      thisMonthCashOutflow,
      totalBankBalance,
      thisMonthBankInflow,
      thisMonthBankOutflow,
      bankAccounts: bankAccountsList,
      todaysSales,
      thisMonthSales,
      thisMonthPurchases,
      totalReceivables,
      thisMonthReceivables,
      totalPayables,
      thisMonthPayables,
      inventoryAssetValue,
      monthOpeningStockValue,
      thisMonthStockInflowVal,
      thisMonthStockOutflowVal,
      thisMonthStockMovement,
      baseOpeningStockValue,
      totalPurchasesStockVal,
      totalSalesStockVal,
      totalSalesReturnsStockVal,
      totalPurchaseReturnsStockVal,
      totalStockUnits,
      topStockProducts,
      totalAssets,
      thisMonthAssets,
      totalLiabilities,
      totalEquity,
      monthlySalesTrend,
      cashFlowTrend
    };
  } catch (err) {
    console.error('Error calculating financial metrics:', err);
    return {
      cashBalance: 0,
      totalCashInflow: 0,
      totalCashOutflow: 0,
      thisMonthCashInflow: 0,
      thisMonthCashOutflow: 0,
      totalBankBalance: 0,
      thisMonthBankInflow: 0,
      thisMonthBankOutflow: 0,
      bankAccounts: [],
      todaysSales: 0,
      thisMonthSales: 0,
      thisMonthPurchases: 0,
      totalReceivables: 0,
      thisMonthReceivables: 0,
      totalPayables: 0,
      thisMonthPayables: 0,
      inventoryAssetValue: 0,
      monthOpeningStockValue: 0,
      thisMonthStockInflowVal: 0,
      thisMonthStockOutflowVal: 0,
      thisMonthStockMovement: 0,
      totalAssets: 0,
      thisMonthAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
      monthlySalesTrend: [],
      cashFlowTrend: []
    };
  }
};

/**
 * Automatically recalculates and synchronizes the receipt_status of an invoice
 * by comparing total bill amount with upfront payments, vouchers, and debit notes.
 */
export const recalculateInvoiceSettlementStatus = async (invoiceId: string | number) => {
  try {
    const rawVal = String(invoiceId || '').trim();
    if (!rawVal) return;

    const cleanInvId = rawVal.replace(/\D/g, '');
    let invQuery = supabase
      .from('sales_invoices')
      .select('id, invoice_no, total_amount, cash_amount_paid, bank_amount');

    if (cleanInvId && !isNaN(Number(cleanInvId))) {
      invQuery = invQuery.or(`id.eq.${Number(cleanInvId)},invoice_no.ilike.${rawVal}`);
    } else {
      invQuery = invQuery.ilike('invoice_no', rawVal);
    }

    const { data: inv } = await invQuery.maybeSingle();
    if (!inv) return;

    const actualInvNo = inv.invoice_no || `INV-${inv.id}`;

    // 1. Fetch all subsequent receipt vouchers for this invoice
    const { data: remVouchers } = await supabase
      .from('financial_vouchers')
      .select('total_amount')
      .or('voucher_type.eq.Cash Receipt Voucher,voucher_type.eq.Bank Receipt Voucher,voucher_type.eq.Cash & Bank Receipt Voucher')
      .or(`original_invoice_no.eq.${inv.id},original_invoice_no.eq.INV-${inv.id},original_invoice_no.eq.${actualInvNo}`);

    const subsequentVoucherPaid = (remVouchers || []).reduce(
      (sum: number, v: any) => sum + (Number(v.total_amount) || 0),
      0
    );

    // 2. Fetch sales returns / debit notes against this invoice
    const { data: returns } = await supabase
      .from('sales_returns')
      .select('total_amount')
      .or(`original_invoice_no.eq.${inv.id},original_invoice_no.eq.INV-${inv.id},original_invoice_no.eq.${actualInvNo}`);

    const totalReturned = (returns || []).reduce(
      (sum: number, r: any) => sum + (Number(r.total_amount) || 0),
      0
    );

    // 3. Upfront payments made at the time of sale
    const initialBankPaid = Number(inv.bank_amount || 0);
    const initialCashPaid = Number(inv.cash_amount_paid || 0);

    const totalPaidSoFar = initialCashPaid + initialBankPaid + subsequentVoucherPaid + totalReturned;
    const netTotal = Number(inv.total_amount || 0);
    const netOutstanding = netTotal - totalPaidSoFar;

    let targetStatus = 'Unpaid';
    if (netOutstanding <= 1) {
      targetStatus = 'Paid';
    } else if (totalPaidSoFar > 0) {
      targetStatus = 'Partial';
    }

    await supabase
      .from('sales_invoices')
      .update({ receipt_status: targetStatus })
      .eq('id', inv.id);

    return targetStatus;
  } catch (err) {
    console.error('Failed to recalculate invoice settlement status:', err);
  }
};

