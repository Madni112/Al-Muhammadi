import React, { useEffect, useState, useMemo } from 'react';
import ReactApexChart from 'react-apexcharts';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../Context/supabaseClient';
import { fetchFinancialMetrics, FinancialSummary } from '../../service/financialCalculations';
import Spinner from '../../ui/Spinner';
import {
  MdShoppingCart,
  MdLocalMall,
  MdAddBox,
  MdCompareArrows,
  MdAssessment,
  MdAccountBalanceWallet,
  MdAccountBalance,
  MdTrendingUp,
  MdArrowUpward,
  MdArrowDownward,
  MdReceiptLong,
  MdWarning,
  MdPauseCircleFilled,
  MdCheckCircle,
  MdPerson,
  MdWarehouse,
  MdSearch,
  MdFilterList,
  MdCalendarToday,
  MdLocalFireDepartment,
  MdAttachMoney,
  MdOutlineReceipt,
  MdClose,
  MdInventory,
  MdInfoOutline
} from 'react-icons/md';
import StatCard from '../../ui/StatCard';
import ActionCard from '../../ui/ActionCard';
import { QtyBadge } from '../../utils/QtyBadge';
import { useAuth } from '../../Context/Auth';
import SalesmanDashboard from './SalesmanDashboard';
import WarehouseDashboard from './WarehouseDashboard';

const AdminRoleSwitcher: React.FC<{
  activeView: 'executive' | 'salesman' | 'warehouse';
  onChangeView: (v: 'executive' | 'salesman' | 'warehouse') => void;
}> = ({ activeView, onChangeView }) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 px-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
        Role Dashboard Preview:
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => onChangeView('executive')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeView === 'executive'
              ? 'bg-[#181D27] dark:bg-slate-900 text-white shadow-sm scale-102 border border-slate-700/50'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
            }`}
        >
          👑 Executive Overview
        </button>
        <button
          onClick={() => onChangeView('salesman')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeView === 'salesman'
              ? 'bg-[#181D27] dark:bg-slate-900 text-white shadow-sm scale-102 border border-slate-700/50'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
            }`}
        >
          🛒 Salesman View
        </button>
        <button
          onClick={() => onChangeView('warehouse')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${activeView === 'warehouse'
              ? 'bg-[#181D27] dark:bg-slate-900 text-white shadow-sm scale-102 border border-slate-700/50'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
            }`}
        >
          📦 Warehouse
        </button>
      </div>
    </div>
  );
};

// Types for Dashboard Operational Intelligence
interface ReceivableInvoice {
  id: string | number;
  invoiceNo: string;
  customerName: string;
  salesman: string;
  invoiceDate: string;
  totalAmount: number;
  paidAmount: number;
  outstandingBalance: number;
  daysPending: number;
}

interface TrendingProduct {
  id: string | number;
  name: string;
  category: string;
  sku: string;
  totalRevenue: number;
  unitsSold: number;
  transactionCount: number;
  percentageOfTotal: number;
}

interface LowStockAlert {
  id: string | number;
  name: string;
  category: string;
  warehouse: string;
  currentStock: number;
  minLimit: number;
  deficit: number;
  unit: string;
}

interface HoldingItemData {
  id: string;
  dcId: number | string;
  gatepassNo: string;
  invoiceNo: string;
  customerName: string;
  salesman: string;
  warehouseGuy: string;
  productName: string;
  orderQty: number;
  dispatchedQty: number;
  holdQty: number;
  rate: number;
  heldAmount: number;
  date: string;
}

interface CashTransaction {
  id: string | number;
  date: string;
  type: 'Inflow' | 'Outflow';
  source: string;
  party: string;
  amount: number;
  description: string;
}

interface DashboardProps {
  initialView?: 'executive' | 'salesman' | 'warehouse';
}

const Dashboard: React.FC<DashboardProps> = ({ initialView = 'executive' }) => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [adminView, setAdminView] = useState<'executive' | 'salesman' | 'warehouse'>(initialView);

  const userRoleLower = (role || '').toLowerCase();
  let allowedModules: string[] = [];
  try {
    const cached = localStorage.getItem('zac_user_modules');
    if (cached) allowedModules = JSON.parse(cached).map((s: string) => String(s).toLowerCase().trim());
  } catch (_) { }

  const isAdmin = userRoleLower.includes('admin') || userRoleLower.includes('owner') || userRoleLower.includes('super admin');
  const isSalesman = !isAdmin && (userRoleLower.includes('salesman') || allowedModules.includes('/dashboard/salesman') || allowedModules.includes('salesman-dashboard'));
  const isWarehouse = !isAdmin && !isSalesman && (userRoleLower.includes('warehouse') || allowedModules.includes('/dashboard/warehouse') || allowedModules.includes('warehouse-dashboard'));

  const [metrics, setMetrics] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Operational Data States
  const [receivablesList, setReceivablesList] = useState<ReceivableInvoice[]>([]);
  const [trendingProducts, setTrendingProducts] = useState<TrendingProduct[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<LowStockAlert[]>([]);
  const [holdingItems, setHoldingItems] = useState<HoldingItemData[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);

  // Interactive Tab Controllers
  const [chartViewTab, setChartViewTab] = useState<'daily' | 'monthly'>('monthly');
  const [holdingTab, setHoldingTab] = useState<'warehouse' | 'invoice'>('warehouse');
  const [selectedWarehouseGuy, setSelectedWarehouseGuy] = useState<string>('All');
  const [selectedHoldingInvoice, setSelectedHoldingInvoice] = useState<string>('All');
  const [liquidityTab, setLiquidityTab] = useState<'bank' | 'cash'>('bank');
  const [stockModalView, setStockModalView] = useState<'allTime' | 'thisMonth'>('allTime');
  const [activeBreakdownModal, setActiveBreakdownModal] = useState<'cash' | 'bank' | 'receivables' | 'stock' | null>(null);

  // Customer Sales Graph Data
  const [customerSalesDaily, setCustomerSalesDaily] = useState<{ dates: string[]; sales: number[] }>({ dates: [], sales: [] });
  const [customerSalesMonthly, setCustomerSalesMonthly] = useState<{ months: string[]; sales: number[] }>({ months: [], sales: [] });

  useEffect(() => {
    if (!isSalesman && !isWarehouse) {
      loadCompleteDashboard();
    }
  }, [isSalesman, isWarehouse]);

  const loadCompleteDashboard = async () => {
    try {
      setLoading(true);

      // Fetch financial metrics & database tables in parallel
      const [
        metricsData,
        invoicesRes,
        productsRes,
        openStocksRes,
        purchasesRes,
        salesReturnsRes,
        purchaseReturnsRes,
        vouchersRes,
        dcsRes,
        custRecoveriesRes
      ] = await Promise.all([
        fetchFinancialMetrics(),
        supabase.from('sales_invoices').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('*'),
        supabase.from('opening_stocks').select('*'),
        supabase.from('supplier_purchases').select('*'),
        supabase.from('sales_returns').select('*'),
        supabase.from('purchase_returns').select('*'),
        supabase.from('financial_vouchers').select('*').order('created_at', { ascending: false }),
        supabase.from('delivery_challans').select('*').order('created_at', { ascending: false }),
        supabase.from('customer_recoveries').select('*')
      ]);

      setMetrics(metricsData);

      const invoices = invoicesRes.data || [];
      const products = productsRes.data || [];
      const openStocks = openStocksRes.data || [];
      const purchases = purchasesRes.data || [];
      const salesReturns = salesReturnsRes.data || [];
      const purchaseReturns = purchaseReturnsRes.data || [];
      const vouchers = vouchersRes.data || [];
      const dcs = dcsRes.data || [];
      const recoveries = custRecoveriesRes.data || [];

      // ==========================================
      // 1. CUSTOMER RECEIVABLES WITH AGING PENDING
      // ==========================================
      // Map recoveries per invoice
      const invoiceRecoveriesMap: Record<string, number> = {};
      recoveries.forEach((rec: any) => {
        const invId = String(rec.invoice_id || rec.invoiceId || rec.invoice_no || '').trim();
        if (invId) {
          const amt = Number(rec.net_collected_amount || rec.amount_paid || rec.amount || 0);
          invoiceRecoveriesMap[invId] = (invoiceRecoveriesMap[invId] || 0) + amt;
        }
      });

      // Map sales returns per invoice
      const invoiceReturnsMap: Record<string, number> = {};
      salesReturns.forEach((ret: any) => {
        const invNo = String(ret.invoice_no || ret.invoice_id || '').trim();
        if (invNo) {
          const retAmt = Number(ret.total_amount || ret.total_net_amount || 0);
          invoiceReturnsMap[invNo] = (invoiceReturnsMap[invNo] || 0) + retAmt;
        }
      });

      const today = new Date();
      const extractedReceivables: ReceivableInvoice[] = [];

      invoices.forEach((inv: any) => {
        const total = Number(inv.total_amount || 0);
        const initialPaid = Number(inv.cash_amount_paid || inv.paid_amount || 0);
        const invKey = String(inv.id).trim();
        const invNoKey = String(inv.invoice_no || '').trim();

        const extraRecoveries = (invoiceRecoveriesMap[invKey] || 0) + (invNoKey ? (invoiceRecoveriesMap[invNoKey] || 0) : 0);
        const retDeductions = (invoiceReturnsMap[invKey] || 0) + (invNoKey ? (invoiceReturnsMap[invNoKey] || 0) : 0);

        const outstanding = Math.max(0, total - initialPaid - extraRecoveries - retDeductions);

        if (outstanding > 0.5) {
          const rawDate = inv.sale_date || inv.invoice_date || inv.created_at || '';
          const invDate = rawDate ? new Date(rawDate) : today;
          const diffTime = Math.max(0, today.getTime() - invDate.getTime());
          const daysPending = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          extractedReceivables.push({
            id: inv.id,
            invoiceNo: inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`,
            customerName: inv.customer_name || 'Walk-in Customer',
            salesman: inv.salesman || 'Direct Sales',
            invoiceDate: rawDate ? rawDate.split('T')[0] : 'Today',
            totalAmount: total,
            paidAmount: initialPaid + extraRecoveries,
            outstandingBalance: outstanding,
            daysPending
          });
        }
      });

      // Keep last 10 sale transactions with pending receivables
      setReceivablesList(extractedReceivables.slice(0, 10));

      // ==========================================
      // 2. TRENDING PRODUCTS (REVENUE & VELOCITY)
      // ==========================================
      const productSalesMap: Record<string, { name: string; category: string; sku: string; revenue: number; units: number; count: number }> = {};
      let totalSalesGross = 0;

      invoices.forEach((inv: any) => {
        let items: any[] = [];
        if (Array.isArray(inv.items)) {
          items = inv.items;
        } else if (typeof inv.items === 'string') {
          try {
            items = JSON.parse(inv.items);
          } catch (_) {
            items = [];
          }
        }

        items.forEach((item: any) => {
          const pName = String(item.product_name || item.itemName || item.pDescription || item.name || 'Standard Product').trim();
          const qty = Number(item.qty || item.quantity || item.orderQty || 1);
          const rate = Number(item.rate || item.rp || item.price || 0);
          const lineTotal = Number(item.amount || item.total || (qty * rate));

          if (!productSalesMap[pName]) {
            productSalesMap[pName] = {
              name: pName,
              category: item.category || 'General Catalog',
              sku: item.sku || item.skuCode || 'SKU-GEN',
              revenue: 0,
              units: 0,
              count: 0
            };
          }

          productSalesMap[pName].revenue += lineTotal;
          productSalesMap[pName].units += qty;
          productSalesMap[pName].count += 1;
          totalSalesGross += lineTotal;
        });
      });

      const rankedProducts: TrendingProduct[] = Object.keys(productSalesMap)
        .map((key, idx) => {
          const p = productSalesMap[key];
          const pct = totalSalesGross > 0 ? (p.revenue / totalSalesGross) * 100 : 0;
          return {
            id: idx + 1,
            name: p.name,
            category: p.category,
            sku: p.sku,
            totalRevenue: p.revenue,
            unitsSold: p.units,
            transactionCount: p.count,
            percentageOfTotal: Math.min(100, Math.max(1, pct))
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 8);

      setTrendingProducts(rankedProducts);

      // ==========================================
      // 3. LOW STOCK / MINIMUM LIMIT ALERTS
      // ==========================================
      const stockAlerts: LowStockAlert[] = [];

      products.forEach((prod: any) => {
        const prodName = String(prod.product_name || '').trim().toLowerCase();
        const minLimit = Number(prod.min_stock || prod.reorder_level || prod.minimum_limit || 10);

        // Opening Stock
        const totalOpening = openStocks
          .filter((os: any) => {
            const osName = String(os.product_name || os.item_name || os.itemName || '').trim().toLowerCase();
            return osName === prodName || (prodName && osName.includes(prodName));
          })
          .reduce((sum: number, os: any) => sum + Number(os.quantity || os.qty || 0), 0);

        // Purchases
        let totalPurchased = 0;
        purchases.forEach((p: any) => {
          const pItems = Array.isArray(p.items) ? p.items : (typeof p.items === 'string' ? JSON.parse(p.items || '[]') : []);
          pItems.forEach((pi: any) => {
            const piName = String(pi.product_name || pi.itemName || pi.itemDetails || '').trim().toLowerCase();
            if (piName === prodName || (prodName && piName.includes(prodName))) {
              totalPurchased += Number(pi.quantity || pi.qty || 0);
            }
          });
        });

        // Sales
        let totalSold = 0;
        invoices.forEach((inv: any) => {
          const invItems = Array.isArray(inv.items) ? inv.items : (typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : []);
          invItems.forEach((ii: any) => {
            const iiName = String(ii.product_name || ii.itemName || ii.pDescription || '').trim().toLowerCase();
            if (iiName === prodName || (prodName && iiName.includes(prodName))) {
              totalSold += Number(ii.qty || ii.quantity || 0);
            }
          });
        });

        // Sales Returns (+stock)
        let totalReturned = 0;
        salesReturns.forEach((sr: any) => {
          const srItems = Array.isArray(sr.items) ? sr.items : (typeof sr.items === 'string' ? JSON.parse(sr.items || '[]') : []);
          srItems.forEach((sri: any) => {
            const sriName = String(sri.product_name || sri.item_name || sri.itemName || '').trim().toLowerCase();
            if (sriName === prodName || (prodName && sriName.includes(prodName))) {
              totalReturned += Number(sri.quantity || sri.qty || 0);
            }
          });
        });

        const currentStock = Math.max(0, totalOpening + totalPurchased - totalSold + totalReturned);

        // Alert condition: currentStock is at or below minimum threshold
        if (currentStock <= minLimit) {
          stockAlerts.push({
            id: prod.id,
            name: prod.product_name || 'Item',
            category: prod.category || 'Standard Catalog',
            warehouse: prod.warehouse || prod.location || 'Main Warehouse',
            currentStock,
            minLimit,
            deficit: Math.max(0, minLimit - currentStock),
            unit: prod.unit || 'Units'
          });
        }
      });

      // Sort by greatest deficit first and show up to 10
      stockAlerts.sort((a, b) => b.deficit - a.deficit);
      setLowStockProducts(stockAlerts.slice(0, 10));

      // ==========================================
      // 4. HOLDING ITEMS (WAREHOUSE & INVOICE WISE)
      // ==========================================
      const extractedHolding: HoldingItemData[] = [];

      dcs.forEach((dc: any) => {
        let items: any[] = [];
        if (Array.isArray(dc.items)) {
          items = dc.items;
        } else if (typeof dc.items === 'string') {
          try {
            items = JSON.parse(dc.items);
          } catch (_) {
            items = [];
          }
        }

        const gatepassNo = dc.challan_no || `DC-${String(dc.id).padStart(4, '0')}`;
        const invoiceNo = dc.invoice_no || `INV-${String(dc.invoice_id || dc.id).padStart(4, '0')}`;
        const customerName = dc.customer_name || 'Direct Buyer';
        const salesman = dc.salesman || 'Direct Staff';
        const warehouseGuy = dc.warehouse_guy || dc.warehouse_incharge || dc.dispatch_warehouse || dc.created_by || 'Main Warehouse Storekeeper';
        const docDate = dc.challan_date || dc.dc_date || String(dc.created_at || '').split('T')[0];

        items.forEach((item: any, idx: number) => {
          const orderQty = Number(item.orderQty ?? item.qty ?? item.quantity ?? 0);
          const dispatchedQty = Number(item.dispatchedQty ?? (dc.status === 'Approved' || dc.status === 'Dispatched' ? orderQty : 0));
          const holdQty = Number(item.holdQty !== undefined ? item.holdQty : Math.max(0, orderQty - dispatchedQty));
          const rate = Number(item.rate || item.rp || 0);

          if (holdQty > 0) {
            extractedHolding.push({
              id: `${dc.id}-${idx}`,
              dcId: dc.id,
              gatepassNo,
              invoiceNo,
              customerName,
              salesman,
              warehouseGuy,
              productName: item.pDescription || item.itemName || item.product_name || 'Inventory Item',
              orderQty,
              dispatchedQty,
              holdQty,
              rate,
              heldAmount: holdQty * rate,
              date: docDate
            });
          }
        });
      });

      setHoldingItems(extractedHolding);

      // ==========================================
      // 5. CUSTOMER SALES GRAPH (DAILY & MONTHLY)
      // ==========================================
      // Daily: Last 14 days aggregation
      const dailyMap: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dailyMap[key] = 0;
      }

      invoices.forEach((inv: any) => {
        const rawDate = String(inv.sale_date || inv.invoice_date || inv.created_at || '').split('T')[0];
        if (dailyMap.hasOwnProperty(rawDate)) {
          dailyMap[rawDate] += Number(inv.total_amount || 0);
        }
      });

      setCustomerSalesDaily({
        dates: Object.keys(dailyMap).map(d => {
          const dt = new Date(d);
          return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }),
        sales: Object.values(dailyMap)
      });

      // Monthly: Current Year 12 Months aggregation
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlySalesMap: Record<number, number> = {};
      monthNames.forEach((_, idx) => { monthlySalesMap[idx] = 0; });
      const currentYear = new Date().getFullYear();

      invoices.forEach((inv: any) => {
        const rawDate = inv.sale_date || inv.invoice_date || inv.created_at || '';
        if (rawDate) {
          const d = new Date(rawDate);
          if (d.getFullYear() === currentYear) {
            monthlySalesMap[d.getMonth()] += Number(inv.total_amount || 0);
          }
        }
      });

      setCustomerSalesMonthly({
        months: monthNames,
        sales: monthNames.map((_, idx) => monthlySalesMap[idx])
      });

      // ==========================================
      // 6. CASH DRAWER TRANSACTIONS LEDGER
      // ==========================================
      const cashTxns: CashTransaction[] = [];

      // Vouchers Cash In/Out
      vouchers.forEach((v: any) => {
        const mode = String(v.mode_of_payment || v.voucher_type || '').toLowerCase();
        if (!mode.includes('bank')) {
          const isReceipt = String(v.voucher_type || '').toLowerCase().includes('receipt');
          cashTxns.push({
            id: `v-${v.id}`,
            date: v.voucher_date || String(v.created_at || '').split('T')[0],
            type: isReceipt ? 'Inflow' : 'Outflow',
            source: v.voucher_type || 'Cash Voucher',
            party: v.party_name || v.account_title || 'General Account',
            amount: Number(v.total_amount || v.amount || 0),
            description: v.narration || v.remarks || 'Cash settlement'
          });
        }
      });

      // Cash Invoices
      invoices.slice(0, 15).forEach((inv: any) => {
        const cashPaid = Number(inv.cash_amount_paid || (inv.settlement_mode === 'Cash' ? inv.total_amount : 0) || 0);
        if (cashPaid > 0) {
          cashTxns.push({
            id: `inv-${inv.id}`,
            date: inv.sale_date || String(inv.created_at || '').split('T')[0],
            type: 'Inflow',
            source: `Sale Bill ${inv.invoice_no || inv.id}`,
            party: inv.customer_name || 'Counter Customer',
            amount: cashPaid,
            description: 'Direct Cash Counter Collection'
          });
        }
      });

      setCashTransactions(cashTxns.slice(0, 15));

    } catch (err: any) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Distinct Filter Lists for Holding Items
  const warehouseGuysList = useMemo(() => {
    const set = new Set<string>();
    holdingItems.forEach(h => {
      if (h.warehouseGuy) set.add(h.warehouseGuy);
    });
    return ['All', ...Array.from(set).sort()];
  }, [holdingItems]);

  const holdingInvoicesList = useMemo(() => {
    const set = new Set<string>();
    holdingItems.forEach(h => {
      if (h.invoiceNo) set.add(h.invoiceNo);
    });
    return ['All', ...Array.from(set).sort()];
  }, [holdingItems]);

  // Filtered Holding Items
  const filteredHoldingItems = useMemo(() => {
    return holdingItems.filter(item => {
      if (holdingTab === 'warehouse') {
        if (selectedWarehouseGuy !== 'All' && item.warehouseGuy !== selectedWarehouseGuy) return false;
      } else {
        if (selectedHoldingInvoice !== 'All' && item.invoiceNo !== selectedHoldingInvoice) return false;
      }
      return true;
    });
  }, [holdingItems, holdingTab, selectedWarehouseGuy, selectedHoldingInvoice]);

  // 1. Direct auto-render for role: Salesman
  if (isSalesman) {
    return <SalesmanDashboard />;
  }

  // 2. Direct auto-render for role: Warehouse Manager (A-39 or SHOP)
  if (isWarehouse) {
    return <WarehouseDashboard />;
  }

  // 3. Super Admin Previews
  if (adminView === 'salesman') {
    return (
      <div className="mx-auto max-w-7xl flex flex-col gap-6 text-slate-800 dark:text-slate-100 text-xs pb-12">
        <AdminRoleSwitcher activeView={adminView} onChangeView={setAdminView} />
        <SalesmanDashboard />
      </div>
    );
  }

  if (adminView === 'warehouse') {
    return (
      <div className="mx-auto max-w-7xl flex flex-col gap-6 text-slate-800 dark:text-slate-100 text-xs pb-12">
        <AdminRoleSwitcher activeView={adminView} onChangeView={setAdminView} />
        <WarehouseDashboard />
      </div>
    );
  }

  if (loading || !metrics) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // --- ApexCharts Configurations ---
  const hasMonthlyTrend = Boolean(metrics.monthlySalesTrend && metrics.monthlySalesTrend.length > 0);
  const monthlyCategories = hasMonthlyTrend ? metrics.monthlySalesTrend.map((m) => m.month) : ['Jan', 'Feb', 'Mar'];
  const grossSalesData = hasMonthlyTrend ? metrics.monthlySalesTrend.map((m) => m.sales) : [0, 0, 0];
  const procurementData = hasMonthlyTrend ? metrics.monthlySalesTrend.map((m) => m.purchases) : [0, 0, 0];

  // 1. Sales vs Purchases Trend Chart
  const salesVsPurchasesOptions: any = {
    chart: { type: 'area', height: 300, toolbar: { show: false }, zoom: { enabled: false } },
    colors: ['#059669', '#D97706'],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    xaxis: {
      categories: monthlyCategories,
      labels: { style: { colors: '#64748B', fontSize: '11px' } }
    },
    yaxis: {
      labels: {
        formatter: (val: number) => `Rs. ${(val / 1000).toFixed(0)}k`,
        style: { colors: '#64748B', fontSize: '11px' }
      }
    },
    tooltip: { y: { formatter: (val: number) => `Rs. ${val.toLocaleString()}` } },
    legend: { position: 'top', horizontalAlign: 'right' }
  };

  const salesVsPurchasesSeries = [
    { name: 'Gross Sales', data: grossSalesData },
    { name: 'Procurement Purchases', data: procurementData }
  ];

  // 2. Customer Sales Volume Graph (Monthly & Daily View Switcher)
  const customerGraphCategories = chartViewTab === 'daily' ? customerSalesDaily.dates : customerSalesMonthly.months;
  const customerGraphData = chartViewTab === 'daily' ? customerSalesDaily.sales : customerSalesMonthly.sales;

  const customerSalesChartOptions: any = {
    chart: { type: 'bar', height: 300, toolbar: { show: false } },
    colors: ['#DC2626'],
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: chartViewTab === 'daily' ? '45%' : '35%',
        distributed: false
      }
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: customerGraphCategories,
      labels: { style: { colors: '#64748B', fontSize: '10px' } }
    },
    yaxis: {
      labels: {
        formatter: (val: number) => `Rs. ${(val / 1000).toFixed(0)}k`,
        style: { colors: '#64748B', fontSize: '11px' }
      }
    },
    tooltip: {
      y: { formatter: (val: number) => `Rs. ${Number(val || 0).toLocaleString()}` }
    }
  };

  const customerSalesChartSeries = [
    { name: chartViewTab === 'daily' ? 'Daily Customer Sales' : 'Monthly Customer Sales', data: customerGraphData }
  ];

  const totalBankBalance = metrics.bankAccounts ? metrics.bankAccounts.reduce((acc, b) => acc + Math.max(0, b.netBalance), 0) : 0;

  const bankDonutOptions: any = {
    chart: { type: 'donut' },
    colors: totalBankBalance > 0 ? ['#DC2626', '#E11D48', '#BE123C', '#991B1B', '#475569'] : ['#CBD5E1'],
    labels: totalBankBalance > 0 ? metrics.bankAccounts.map((b) => b.accountTitle) : ['Zero Balance'],
    legend: { position: 'bottom' },
    tooltip: { y: { formatter: (val: number) => `Rs. ${totalBankBalance > 0 ? val.toLocaleString() : '0.00'}` } }
  };

  const bankDonutSeries = totalBankBalance > 0
    ? metrics.bankAccounts.map((b) => Math.max(0, b.netBalance))
    : [1];

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 text-slate-800 dark:text-slate-100 text-xs pb-12">
      {/* Role Dashboard Switcher for Admins */}
      <AdminRoleSwitcher activeView={adminView} onChangeView={setAdminView} />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Executive Management Dashboard</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Real-time fiscal monitoring, procurement velocity & operational intelligence</p>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-3.5 py-2 rounded-xl font-bold text-slate-600 dark:text-slate-300 shadow-sm flex items-center gap-1.5">
            <MdCalendarToday className="text-red-600 dark:text-red-400" />
            <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* --- TOP ACTION TILES GRID --- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4 sm:gap-5">
        <ActionCard
          title="SALES"
          subtitle="Customer Bill"
          Icon={MdShoppingCart}
          variant="blackToWhite"
          onClick={() => navigate('/sales/invoice/list')}
        />
        <ActionCard
          title="PURCHASES"
          subtitle="Buy New Product"
          Icon={MdLocalMall}
          variant="whiteToBlack"
          onClick={() => navigate('/Purchase/Purchases/list')}
        />
        <ActionCard
          title="PRODUCTS"
          subtitle="Items List"
          Icon={MdAddBox}
          variant="blackToWhite"
          onClick={() => navigate('/Administration/Products/list')}
        />
        <ActionCard
          title="SALE RETURN"
          subtitle="Customer Return"
          Icon={MdCompareArrows}
          variant="whiteToBlack"
          onClick={() => navigate('/Sales/Sales-Return/List')}
        />
        <ActionCard
          title="STOCK REPORT"
          subtitle="Inventory Audit"
          Icon={MdAssessment}
          variant="blackToWhite"
          onClick={() => navigate('/Reports/Stock-Report')}
        />
        <ActionCard
          title="TODAY'S SALE"
          subtitle={`Rs. ${metrics.todaysSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          Icon={MdTrendingUp}
          variant="red"
          onClick={() => { }}
        />
        <ActionCard
          title="THIS MONTH SALES"
          subtitle={`Rs. ${metrics.thisMonthSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          Icon={MdArrowUpward}
          variant="blackToWhite"
          onClick={() => { }}
        />
        <ActionCard
          title="THIS MONTH PURCHASES"
          subtitle={`Rs. ${metrics.thisMonthPurchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          Icon={MdArrowDownward}
          variant="whiteToBlack"
          onClick={() => { }}
        />
      </div>

      {/* --- FINANCIAL KPI STAT CARDS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard
          title="Cash"
          value={metrics.cashBalance}
          Icon={MdAccountBalanceWallet}
          bgColor="bg-[#181D27] dark:bg-slate-800"
          thisMonthValue={metrics.thisMonthCashInflow}
          thisMonthLabel="This Month"
          onClick={() => setActiveBreakdownModal('cash')}
        />
        <StatCard
          title="Bank Balance"
          value={metrics.totalBankBalance}
          Icon={MdAccountBalance}
          bgColor="bg-[#1E293B] dark:bg-slate-700"
          thisMonthValue={metrics.thisMonthBankInflow}
          thisMonthLabel="This Month"
          onClick={() => setActiveBreakdownModal('bank')}
        />
        <StatCard
          title="Receivables"
          value={metrics.totalReceivables}
          Icon={MdReceiptLong}
          bgColor="bg-[#D97706]"
          thisMonthValue={metrics.thisMonthReceivables}
          thisMonthLabel="This Month"
          onClick={() => setActiveBreakdownModal('receivables')}
        />
        <StatCard
          title="Assets"
          value={metrics.inventoryAssetValue}
          Icon={MdAssessment}
          bgColor="bg-[#DC2626]"
          thisMonthValue={metrics.inventoryAssetValue}
          thisMonthLabel="This Month"
          onClick={() => setActiveBreakdownModal('stock')}
        />
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: CUSTOMER RECEIVABLES (AGING) & TRENDING PRODUCTS               */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* WIDGET 1: CUSTOMER RECEIVABLES AGING LEDGER (7 COLS) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#111827] shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">
                    <MdOutlineReceipt size={16} />
                  </span>
                  Customer Receivables
                </h3>
                <p className="text-[11px] text-slate-400">Last 10 outstanding sales invoices with real-time aging status</p>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-bold font-mono">
                {receivablesList.length} Invoices Due
              </span>
            </div>

            {/* Table Container with Exactly 5 Visible Rows Height + Scrollbar */}
            <div className="max-w-full overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800/80 max-h-[295px] overflow-y-auto pr-1">
              <table className="w-full table-auto border-collapse font-sans text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
                  <tr className="text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700 text-left text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Inv No.</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Salesman</th>
                    <th className="py-2.5 px-3">Date & Aging</th>
                    <th className="py-2.5 px-3 text-right">Outstanding (Rs.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {receivablesList.length > 0 ? (
                    receivablesList.map((rec) => {
                      // Aging color scheme
                      let badgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50';
                      if (rec.daysPending > 30) {
                        badgeClass = 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50';
                      } else if (rec.daysPending > 7) {
                        badgeClass = 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50';
                      }

                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 duration-150">
                          <td className="py-2.5 px-3 font-mono font-bold text-red-700 dark:text-red-400">
                            {rec.invoiceNo}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100 max-w-[140px] truncate" title={rec.customerName}>
                            {rec.customerName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 max-w-[100px] truncate" title={rec.salesman}>
                            <span className="inline-flex items-center gap-1">
                              <MdPerson size={13} className="text-slate-400" />
                              {rec.salesman}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-[10px] text-slate-400">{rec.invoiceDate}</span>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-tight ${badgeClass}`}>
                                {rec.daysPending === 0 ? 'Today' : `${rec.daysPending} Days Old`}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-rose-600 dark:text-rose-400">
                            Rs. {rec.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400 italic">
                        No outstanding customer invoices found. All receivables cleared! 🎉
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pt-2 flex justify-between items-center text-[11px] text-slate-400">
            <span>Scroll table to see full last 10 entries</span>
            <button
              onClick={() => navigate('/Reports/Account-Report', { state: { activeTab: 12 } })}
              className="text-red-600 dark:text-red-400 font-bold hover:underline"
            >
              Open Receivables Ledger →
            </button>
          </div>
        </div>

        {/* WIDGET 2: TRENDING PRODUCTS LEADERBOARD (5 COLS) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#111827] shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1 rounded-md bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400">
                    <MdWarning size={16} />
                  </span>
                  Low Stock Limit Alerts
                </h3>
                <p className="text-[11px] text-slate-400">Products at or below minimum threshold</p>
              </div>
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold font-mono ${lowStockProducts.length > 0
                ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                }`}>
                {lowStockProducts.length > 0 ? `${lowStockProducts.length} Items Critical` : 'Stock Healthy 🛡️'}
              </span>
            </div>

            {/* List with Up to 10 Low Stock Items */}
            <div className="space-y-2 max-h-[295px] overflow-y-auto pr-1">
              {lowStockProducts.length > 0 ? (
                lowStockProducts.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl border border-rose-100 dark:border-rose-950/40 bg-rose-50/40 dark:bg-rose-950/20 flex justify-between items-center gap-2 hover:bg-rose-50/70 duration-150"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 dark:text-white text-xs truncate" title={p.name}>
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span className="text-rose-600 font-bold">Avail: {p.currentStock} {p.unit}</span>
                        <span>•</span>
                        <span>Min Req: {p.minLimit} {p.unit}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono font-bold text-[10px]">
                        -{p.deficit} {p.unit}
                      </span>
                      <button
                        onClick={() => navigate('/Purchase/Purchases/Add')}
                        className="px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold hover:border-emerald-500 hover:text-emerald-600 transition"
                        title="Create Purchase Order"
                      >
                        + Reorder
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-emerald-600 dark:text-emerald-400 flex flex-col items-center justify-center gap-2">
                  <MdCheckCircle size={32} />
                  <span className="font-bold text-xs">All Products are above Minimum Stock Limits</span>
                  <span className="text-[11px] text-slate-400">Inventory levels are currently optimal.</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 text-right">
            <button
              onClick={() => navigate('/Reports/Stock-Report')}
              className="text-red-600 dark:text-red-400 font-bold hover:underline text-[11px]"
            >
              Open Inventory Audit Matrix →
            </button>
          </div>
        </div>

      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* WIDGET 3: INTERACTIVE HOLDING INVENTORY (7 COLS) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#111827] shadow-sm p-5 flex flex-col justify-between">
          <div>
            {/* Header with Dual Tabs and Dropdown Filters */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1 rounded-md bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
                    <MdPauseCircleFilled size={16} />
                  </span>
                  Holding Inventory Center
                </h3>
                <p className="text-[11px] text-slate-400">Committed orders held at warehouse pending customer pickup</p>
              </div>

              {/* Mode Tabs & Selector */}
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-bold">
                  <button
                    onClick={() => setHoldingTab('warehouse')}
                    className={`px-2.5 py-1 rounded-md transition ${holdingTab === 'warehouse'
                      ? 'bg-white dark:bg-slate-700 text-red-700 dark:text-red-400 shadow-sm'
                      : 'text-slate-500'
                      }`}
                  >
                    Warehouse In-Charge
                  </button>
                  <button
                    onClick={() => setHoldingTab('invoice')}
                    className={`px-2.5 py-1 rounded-md transition ${holdingTab === 'invoice'
                      ? 'bg-white dark:bg-slate-700 text-red-700 dark:text-red-400 shadow-sm'
                      : 'text-slate-500'
                      }`}
                  >
                    Invoice-Wise
                  </button>
                </div>

                {/* Dropdown Selector based on Active Tab */}
                {holdingTab === 'warehouse' ? (
                  <select
                    value={selectedWarehouseGuy}
                    onChange={(e) => setSelectedWarehouseGuy(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none max-w-[150px] truncate"
                  >
                    {warehouseGuysList.map(guy => (
                      <option key={guy} value={guy}>{guy === 'All' ? 'All Warehouse Staff' : guy}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedHoldingInvoice}
                    onChange={(e) => setSelectedHoldingInvoice(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none max-w-[150px] truncate"
                  >
                    {holdingInvoicesList.map(inv => (
                      <option key={inv} value={inv}>{inv === 'All' ? 'All Invoices' : inv}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Holding Items Table */}
            <div className="max-w-full overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800/80 max-h-[295px] overflow-y-auto pr-1">
              <table className="w-full table-auto border-collapse font-sans text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
                  <tr className="text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700 text-left text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Item / SKU</th>
                    <th className="py-2.5 px-3">{holdingTab === 'warehouse' ? 'Gatepass (DC)' : 'Invoice #'}</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3 text-center">Held Qty</th>
                    <th className="py-2.5 px-3 text-right">Held Value (Rs.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredHoldingItems.length > 0 ? (
                    filteredHoldingItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 duration-150">
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white max-w-[150px] truncate" title={item.productName}>
                          {item.productName}
                          <div className="text-[10px] text-slate-400 font-normal font-mono">
                            {holdingTab === 'warehouse' ? `Staff: ${item.warehouseGuy}` : `Salesman: ${item.salesman}`}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-red-700 dark:text-red-400 text-[11px]">
                          {holdingTab === 'warehouse' ? item.gatepassNo : item.invoiceNo}
                          <div className="text-[10px] text-slate-400 font-normal">{item.date}</div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300 max-w-[120px] truncate" title={item.customerName}>
                          {item.customerName}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <QtyBadge qty={item.holdQty} />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 dark:text-white">
                          Rs. {item.heldAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400 italic">
                        No active holding items matching your selected criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-2 flex justify-between items-center text-[11px] text-slate-400">
            <span>Showing {filteredHoldingItems.length} active committed holding items</span>
            <button
              onClick={() => navigate('/Reports/Holding-Report')}
              className="text-red-600 dark:text-red-400 font-bold hover:underline"
            >
              Open Full Holding Report →
            </button>
          </div>
        </div>

        {/* WIDGET 4: LOW STOCK & MINIMUM LIMIT ALERTS (5 COLS) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#111827] shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1 rounded-md bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
                    <MdLocalFireDepartment size={16} />
                  </span>
                  Top Trending Products
                </h3>
                <p className="text-[11px] text-slate-400">Ranked by revenue velocity & order frequency</p>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold">
                Top Demand 🔥
              </span>
            </div>

            {/* List with 5 visible rows + scroll */}
            <div className="space-y-2.5 max-h-[295px] overflow-y-auto pr-1">
              {trendingProducts.length > 0 ? (
                trendingProducts.map((p, idx) => (
                  <div
                    key={p.name}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/60 duration-150 flex items-center gap-3"
                  >
                    <div className="w-7 h-7 rounded-lg bg-red-600/10 text-red-600 font-black text-xs flex items-center justify-center shrink-0">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="font-bold text-slate-900 dark:text-white truncate text-xs" title={p.name}>
                          {p.name}
                        </span>
                        <span className="font-mono font-bold text-red-700 dark:text-red-400 text-xs shrink-0 ml-2">
                          Rs. {(p.totalRevenue / 1000).toFixed(1)}k
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                        <span>{p.category}</span>
                        <span>{p.unitsSold.toLocaleString()} units sold ({p.transactionCount} bills)</span>
                      </div>
                      {/* Mini visual velocity bar */}
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-500 to-rose-600 rounded-full"
                          style={{ width: `${Math.max(8, p.percentageOfTotal)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 italic">
                  No sales invoice items recorded yet.
                </div>
              )}
            </div>
          </div>
          <div className="pt-2 text-right">
            <button
              onClick={() => navigate('/Reports/Sales-Report')}
              className="text-red-600 dark:text-red-400 font-bold hover:underline text-[11px]"
            >
              View Full Product Sales Analytics →
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: CHARTS (SALES VS PURCHASES & CUSTOMER SALES WITH DAILY/MONTHLY)*/}
      {/* ========================================================================= */}

      {/* ========================================================================= */}
      {/* SECTION 3: HOLDING INVENTORY DUAL-TAB & LOW STOCK LIMIT ALERTS            */}
      {/* ========================================================================= */}

      {/* ========================================================================= */}
      {/* SECTION 4: LIQUIDITY CENTER (BANK ACCOUNTS & CASH DRAWER DUAL TABS)       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bank Allocation Donut Chart (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#111827] shadow-sm p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 flex items-center gap-2">
              <MdAccountBalance className="text-red-600" />
              Bank Balance
            </h3>
            <ReactApexChart options={bankDonutOptions} series={bankDonutSeries} type="donut" height={260} />
          </div>
          <div className="text-[11px] text-slate-400 text-center pt-2">
            Net Liquid Reserves: <span className="font-bold text-slate-900 dark:text-white font-mono">Rs. {(metrics.totalBankBalance + metrics.cashBalance).toLocaleString()}</span>
          </div>
        </div>

        {/* Liquid Ledgers (Bank Accounts & Cash Drawer Tabs) (8 cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#111827] shadow-sm p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                  Cash & Bank Ledgers
                </h3>
                <p className="text-[11px] text-slate-400">Reconciled corporate bank accounts & cash drawer transactions</p>
              </div>

              {/* Dual Tab: Bank Accounts vs Cash Drawer */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl font-bold text-xs">
                <button
                  onClick={() => setLiquidityTab('bank')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${liquidityTab === 'bank'
                    ? 'bg-white dark:bg-slate-700 text-red-700 dark:text-red-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                    }`}
                >
                  <MdAccountBalance size={14} />
                  <span>Bank Accounts ({metrics.bankAccounts?.length || 0})</span>
                </button>
                <button
                  onClick={() => setLiquidityTab('cash')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${liquidityTab === 'cash'
                    ? 'bg-white dark:bg-slate-700 text-red-700 dark:text-red-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                    }`}
                >
                  <MdAccountBalanceWallet size={14} />
                  <span>Cash Drawer</span>
                </button>
              </div>
            </div>

            {/* TAB 1: BANK ACCOUNTS LEDGER TABLE */}
            {liquidityTab === 'bank' && (
              <div className="max-w-full overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800 max-h-[260px] overflow-y-auto">
                <table className="w-full table-auto border-collapse font-mono text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                    <tr className="text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800 text-left text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Bank Title</th>
                      <th className="py-2.5 px-3">Account Number</th>
                      <th className="py-2.5 px-3 text-right">Debit (+In)</th>
                      <th className="py-2.5 px-3 text-right">Credit (-Out)</th>
                      <th className="py-2.5 px-3 text-right font-black">Net Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {metrics.bankAccounts && metrics.bankAccounts.length > 0 ? (
                      metrics.bankAccounts.map((b) => (
                        <tr
                          key={b.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 duration-150"
                        >
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white font-sans flex items-center gap-2">
                            <span className="p-1 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                              <MdAccountBalance size={14} />
                            </span>
                            {b.bankName} - {b.accountTitle}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{b.accountNumber || '-'}</td>
                          <td className="py-2.5 px-3 text-right text-emerald-600 font-semibold">
                            {b.totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-500 font-semibold">
                            {b.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white">
                            Rs. {b.netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                          No corporate bank accounts registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 2: CASH DRAWER SETTLEMENT TABLE */}
            {liquidityTab === 'cash' && (
              <div className="max-w-full overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800 max-h-[260px] overflow-y-auto">
                <table className="w-full table-auto border-collapse font-mono text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                    <tr className="text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800 text-left text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Source / Voucher</th>
                      <th className="py-2.5 px-3">Party / Particulars</th>
                      <th className="py-2.5 px-3 text-center">Type</th>
                      <th className="py-2.5 px-3 text-right">Amount (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {cashTransactions.length > 0 ? (
                      cashTransactions.map((c) => (
                        <tr
                          key={c.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 duration-150"
                        >
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{c.date}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white font-sans">
                            {(() => {
                              const s = String(c.source || '');
                              if (s.toLowerCase().includes('sale bill')) {
                                const parts = s.split(/(sale bill)/i);
                                return parts.map((part, i) =>
                                  part.toLowerCase() === 'sale bill'
                                    ? <span key={i} className="text-rose-500 font-black">{part}</span>
                                    : <span key={i}>{part}</span>
                                );
                              } else if (s.toLowerCase().includes('purchase bill')) {
                                const parts = s.split(/(purchase bill)/i);
                                return parts.map((part, i) =>
                                  part.toLowerCase() === 'purchase bill'
                                    ? <span key={i} className="text-emerald-600 font-black">{part}</span>
                                    : <span key={i}>{part}</span>
                                );
                              }
                              return s;
                            })()}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-sans max-w-[140px] truncate" title={c.party}>
                            {c.party}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.type === 'Inflow'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                              }`}>
                              {c.type === 'Inflow' ? '+ Received' : '- Paid'}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-black ${c.type === 'Inflow' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                            Rs. {c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                          No recent cash drawer movements found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="pt-3 flex justify-between items-center text-xs">
            <span className="text-[11px] text-slate-400">
              {liquidityTab === 'bank' ? 'Real-time verified bank reconciliation' : `Current Cash In Hand: Rs. ${metrics.cashBalance.toLocaleString()}`}
            </span>
            <button
              onClick={() => navigate('/Reports/Account-Report')}
              className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline text-xs flex items-center gap-1"
            >
              <span>View Full General Ledger</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 1: SALES VS PROCUREMENT */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#111827] shadow-sm p-5 sm:p-6">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                Sales vs Purchases
              </h3>
              <p className="text-[11px] text-slate-400">Monthly comparative velocity & margins</p>
            </div>
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold font-mono">Live Sync</span>
          </div>
          <ReactApexChart options={salesVsPurchasesOptions} series={salesVsPurchasesSeries} type="area" height={300} />
        </div>

        {/* CHART 2: CUSTOMER SALES VOLUME GRAPH (TABS: DAILY / MONTHLY) */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#111827] shadow-sm p-5 sm:p-6">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                Customer Sales Trend
              </h3>
              <p className="text-[11px] text-slate-400">Interactive timeframe aggregation</p>
            </div>
            {/* Tab Switcher: Daily vs Monthly */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl font-bold text-xs">
              <button
                onClick={() => setChartViewTab('daily')}
                className={`px-3 py-1 rounded-lg transition-all ${chartViewTab === 'daily'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                  }`}
              >
                📅 Daily (Last 14d)
              </button>
              <button
                onClick={() => setChartViewTab('monthly')}
                className={`px-3 py-1 rounded-lg transition-all ${chartViewTab === 'monthly'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                  }`}
              >
                📆 Monthly
              </button>
            </div>
          </div>
          <ReactApexChart options={customerSalesChartOptions} series={customerSalesChartSeries} type="bar" height={300} />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ASSET & FINANCIAL METRIC BREAKDOWN POPUP MODAL                            */}
      {/* ========================================================================= */}
      {activeBreakdownModal && metrics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Top Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  {activeBreakdownModal === 'stock' && <MdAssessment size={22} />}
                  {activeBreakdownModal === 'cash' && <MdAccountBalanceWallet size={22} />}
                  {activeBreakdownModal === 'bank' && <MdAccountBalance size={22} />}
                  {activeBreakdownModal === 'receivables' && <MdReceiptLong size={22} />}
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight">
                    {activeBreakdownModal === 'stock' && 'Stock Assets & Valuation Ledger'}
                    {activeBreakdownModal === 'cash' && 'Cash Liquidity & Inflow Ledger'}
                    {activeBreakdownModal === 'bank' && 'Corporate Bank Accounts'}
                    {activeBreakdownModal === 'receivables' && 'Customer Receivables & Aging'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeBreakdownModal === 'stock' && 'Real-time warehouse physical stock audit'}
                    {activeBreakdownModal === 'cash' && 'Cash drawer inflows, outflows & balances'}
                    {activeBreakdownModal === 'bank' && 'Verified multi-bank treasury accounts'}
                    {activeBreakdownModal === 'receivables' && 'Outstanding customer debt & collection status'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveBreakdownModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors"
              >
                <MdClose size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              
              {/* === 1. STOCK MODAL === */}
              {activeBreakdownModal === 'stock' && (
                <div className="space-y-4">
                  {/* Big Hero Card */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white shadow-md relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-200">Current Physical Stock Valuation</span>
                        <div className="text-3xl font-black mt-1 font-mono tracking-tight text-white">
                          Rs. {metrics.inventoryAssetValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 block">Total Inventory</span>
                        <span className="font-mono font-black text-lg text-white">
                          {(metrics.totalStockUnits || 0).toLocaleString()} Units
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                        ✓ 100% Synced with Live Stock Registry
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                        Evaluated at Selling Price
                      </span>
                    </div>
                  </div>

                  {/* 2 Tabs Switcher */}
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setStockModalView('allTime')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        stockModalView === 'allTime'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>📦 All-Time Inventory Audit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStockModalView('thisMonth')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        stockModalView === 'thisMonth'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>🗓️ This Month ({new Date().toLocaleString('default', { month: 'short' })}) Movement</span>
                    </button>
                  </div>

                  {/* TAB 1: ALL-TIME AUDIT TRAIL */}
                  {stockModalView === 'allTime' && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-4 space-y-2.5 font-mono text-xs">
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 font-sans">
                        <span className="text-slate-600 dark:text-slate-300 font-medium">1. Initial Opening Stock (Registered):</span>
                        <span className="font-bold text-slate-900 dark:text-white font-mono">
                          Rs. {(metrics.baseOpeningStockValue || metrics.monthOpeningStockValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 font-sans">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <span>➕</span> Total Supplier Purchases (Inflow):
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          +Rs. {(metrics.totalPurchasesStockVal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 font-sans">
                        <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                          <span>➖</span> Total Sales Invoices (Outflow):
                        </span>
                        <span className="font-bold text-rose-600 dark:text-rose-400 font-mono">
                          -Rs. {(metrics.totalSalesStockVal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {Number(metrics.totalSalesReturnsStockVal || 0) > 0 && (
                        <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 font-sans">
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <span>🔄</span> Total Sales Returns (Restored):
                          </span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            +Rs. {(metrics.totalSalesReturnsStockVal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 font-sans font-bold text-sm bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40">
                        <span className="text-slate-900 dark:text-white">Current Physical Stock:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono text-base font-black">
                          Rs. {metrics.inventoryAssetValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: THIS MONTH'S MOVEMENT */}
                  {stockModalView === 'thisMonth' && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-4 space-y-2.5 font-mono text-xs">
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 font-sans">
                        <span className="text-slate-600 dark:text-slate-300 font-medium">1. Month Opening Stock ({new Date().toLocaleString('default', { month: 'short' })} 1st):</span>
                        <span className="font-bold text-slate-900 dark:text-white font-mono">
                          Rs. {metrics.monthOpeningStockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 font-sans">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <span>➕</span> Month Purchases (Inflow):
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          +Rs. {metrics.thisMonthStockInflowVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 font-sans">
                        <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                          <span>➖</span> Month Sales (Dispatches):
                        </span>
                        <span className="font-bold text-rose-600 dark:text-rose-400 font-mono">
                          -Rs. {metrics.thisMonthStockOutflowVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 font-sans bg-slate-100/70 dark:bg-slate-700/30 px-2 rounded-lg">
                        <span className="text-slate-700 dark:text-slate-200 font-bold">Month-to-Date Net Movement:</span>
                        <span className={`font-black font-mono ${metrics.thisMonthStockMovement < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {metrics.thisMonthStockMovement < 0 ? '-' : '+'}Rs. {Math.abs(metrics.thisMonthStockMovement).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-2 font-sans font-bold text-sm bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40">
                        <span className="text-slate-900 dark:text-white">Current Physical Stock:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono text-base font-black">
                          Rs. {metrics.inventoryAssetValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Top Inventory Valuation Assets List */}
                  {metrics.topStockProducts && metrics.topStockProducts.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700/60 rounded-2xl p-3 bg-white dark:bg-slate-800/40 space-y-2">
                      <div className="flex justify-between items-center pb-1 border-b border-slate-100 dark:border-slate-700">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Top Stock Assets (By Value)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveBreakdownModal(null);
                            navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/Stock Report`);
                          }}
                          className="text-[11px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
                        >
                          Full Report →
                        </button>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {metrics.topStockProducts.map((p: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-700/30">
                            <div className="flex items-center gap-2 truncate pr-2">
                              <span className="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-600 text-[10px] font-bold flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{p.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono shrink-0">({p.qty} pcs @ Rs. {p.unitPrice})</span>
                            </div>
                            <span className="font-mono font-black text-slate-900 dark:text-white shrink-0">
                              Rs. {p.totalValuation.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* === 2. CASH MODAL === */}
              {activeBreakdownModal === 'cash' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-md">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100">Net Cash in Hand</span>
                    <div className="text-3xl font-black mt-1 font-mono tracking-tight">
                      Rs. {metrics.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-4 space-y-3 font-sans text-xs">
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-600 dark:text-slate-300">Total Cash Inflows (All-Time):</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        Rs. {metrics.totalCashInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-600 dark:text-slate-300">Total Cash Outflows (All-Time):</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400 font-mono">
                        Rs. {metrics.totalCashOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-600 dark:text-slate-300">This Month Cash Collected:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        Rs. {metrics.thisMonthCashInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 font-bold text-sm">
                      <span className="text-slate-900 dark:text-white">Net Cash Balance:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono text-base font-black">
                        Rs. {metrics.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* === 3. BANK MODAL === */}
              {activeBreakdownModal === 'bank' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-md">
                    <span className="text-xs font-semibold uppercase tracking-wider text-teal-100">Total Bank Balance</span>
                    <div className="text-3xl font-black mt-1 font-mono tracking-tight">
                      Rs. {metrics.totalBankBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-4 space-y-3 font-sans text-xs">
                    {metrics.bankAccounts.length === 0 ? (
                      <p className="text-center text-slate-400 py-3">No active corporate bank accounts recorded.</p>
                    ) : (
                      metrics.bankAccounts.map((b, idx) => (
                        <div key={idx} className="flex justify-between items-center py-1.5 border-b border-slate-200/60 dark:border-slate-700/60 last:border-0">
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">{b.accountTitle || b.bankName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{b.accountNumber || 'Primary Account'}</span>
                          </div>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            Rs. {Number(b.netBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* === 4. RECEIVABLES MODAL === */}
              {activeBreakdownModal === 'receivables' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-md">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-100">Total Customer Receivables</span>
                    <div className="text-3xl font-black mt-1 font-mono tracking-tight">
                      Rs. {metrics.totalReceivables.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <span className="inline-block mt-2 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                      {receivablesList.length} Active Pending Invoices
                    </span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-4 space-y-2 font-sans text-xs max-h-56 overflow-y-auto">
                    {receivablesList.slice(0, 5).map((rec, idx) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-200/60 dark:border-slate-700/60 last:border-0">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">{rec.customerName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Inv: {rec.invoiceNo} • {rec.daysPending} days old</span>
                        </div>
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                          Rs. {rec.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-end">
              <button
                onClick={() => setActiveBreakdownModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default Dashboard;
