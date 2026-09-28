import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../Context/supabaseClient';
import { useAuth } from '../../Context/Auth';
import Spinner from '../../ui/Spinner';
import GlassCard from '../../ui/GlassCard';
import StatCard from '../../ui/StatCard';
import ActionCard from '../../ui/ActionCard';
import {
  MdShoppingCart,
  MdReceiptLong,
  MdLocalShipping,
  MdCheckCircle,
  MdHourglassEmpty,
  MdAddShoppingCart,
  MdPeople,
  MdInventory2,
  MdSearch,
  MdRefresh,
  MdStorefront,
  MdWarehouse,
  MdPerson,
  MdArrowForward,
  MdPointOfSale
} from 'react-icons/md';

interface SalesInvoiceItem {
  id: number;
  invoice_no: string;
  customer_name: string;
  sale_date: string;
  dispatch_warehouse: string;
  salesman: string;
  total_amount: string | number;
  sale_status: string;
  dc_no: string | null;
  created_at: string;
}

interface StockItem {
  product_name: string;
  a39_qty: number;
  shop_qty: number;
  total_qty: number;
}

const SalesmanDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userName, role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<SalesInvoiceItem[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [searchInvoice, setSearchInvoice] = useState('');
  const [searchStock, setSearchStock] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Dispatched'>('All');
  const [salesmanList, setSalesmanList] = useState<string[]>([]);
  const [selectedSalesman, setSelectedSalesman] = useState<string>('ALL');

  const isAdminOrSuper = useMemo(() => {
    const r = (role || '').toLowerCase();
    return r.includes('admin') || r.includes('owner') || r.includes('developer');
  }, [role]);

  // Load Salesman Dashboard Data
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Sales Invoices
      const { data: invoiceData, error: invError } = await supabase
        .from('sales_invoices')
        .select('*')
        .order('id', { ascending: false })
        .limit(200);

      if (invError) throw invError;
      const invList: SalesInvoiceItem[] = invoiceData || [];
      setInvoices(invList);

      // Extract unique salesmen for filter
      const uniqueSalesmen = Array.from(
        new Set(invList.map((i) => (i.salesman || '').trim()).filter(Boolean))
      );
      setSalesmanList(uniqueSalesmen);

      // If logged in user is a salesman, set their default filter
      if (!isAdminOrSuper && userName) {
        setSelectedSalesman(userName);
      }

      // 2. Fetch Live Stock Balances
      const { data: stockData, error: stockErr } = await supabase
        .from('stock_balances')
        .select('product_name, warehouse_name, quantity');

      if (!stockErr && stockData) {
        const productMap: Record<string, { a39: number; shop: number }> = {};
        stockData.forEach((row: any) => {
          const pName = (row.product_name || '').trim();
          if (!pName) return;
          if (!productMap[pName]) productMap[pName] = { a39: 0, shop: 0 };
          const qty = parseFloat(row.quantity) || 0;
          const wh = (row.warehouse_name || '').toUpperCase();
          if (wh.includes('39')) {
            productMap[pName].a39 += qty;
          } else if (wh.includes('SHOP')) {
            productMap[pName].shop += qty;
          }
        });

        const compiledStock: StockItem[] = Object.entries(productMap).map(([pName, counts]) => ({
          product_name: pName,
          a39_qty: counts.a39,
          shop_qty: counts.shop,
          total_qty: counts.a39 + counts.shop
        }));
        setStockItems(compiledStock);
      }
    } catch (err) {
      console.error('Failed to load salesman dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Filter invoices for current user or selected salesman
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Salesman filter
      if (selectedSalesman !== 'ALL') {
        const invSalesman = (inv.salesman || '').toLowerCase();
        if (!invSalesman.includes(selectedSalesman.toLowerCase())) {
          return false;
        }
      }

      // Status filter (Dispatched vs Pending DC)
      const isDispatched = Boolean(inv.dc_no);
      if (statusFilter === 'Dispatched' && !isDispatched) return false;
      if (statusFilter === 'Pending' && isDispatched) return false;

      // Text search
      if (searchInvoice.trim()) {
        const q = searchInvoice.toLowerCase();
        const matchNo = (inv.invoice_no || '').toLowerCase().includes(q);
        const matchCust = (inv.customer_name || '').toLowerCase().includes(q);
        const matchWh = (inv.dispatch_warehouse || '').toLowerCase().includes(q);
        if (!matchNo && !matchCust && !matchWh) return false;
      }

      return true;
    });
  }, [invoices, selectedSalesman, statusFilter, searchInvoice]);

  // Metrics calculations
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // Relevant pool for metrics
    const pool = invoices.filter((inv) => {
      if (selectedSalesman !== 'ALL') {
        return (inv.salesman || '').toLowerCase().includes(selectedSalesman.toLowerCase());
      }
      return true;
    });

    let todaySales = 0;
    let todayCount = 0;
    let monthSales = 0;
    let monthCount = 0;
    let pendingDispatchCount = 0;
    let dispatchedCount = 0;

    pool.forEach((inv) => {
      const amt = parseFloat(String(inv.total_amount || 0)) || 0;
      const invDate = inv.sale_date || inv.created_at?.split('T')[0] || '';

      if (invDate === todayStr) {
        todaySales += amt;
        todayCount++;
      }

      if (invDate) {
        const d = new Date(invDate);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          monthSales += amt;
          monthCount++;
        }
      }

      if (inv.dc_no) {
        dispatchedCount++;
      } else {
        pendingDispatchCount++;
      }
    });

    return {
      todaySales,
      todayCount,
      monthSales,
      monthCount,
      pendingDispatchCount,
      dispatchedCount,
      totalOrders: pool.length
    };
  }, [invoices, selectedSalesman]);

  // Filter stock quick-lookup
  const filteredStock = useMemo(() => {
    if (!searchStock.trim()) return stockItems.slice(0, 8);
    const q = searchStock.toLowerCase();
    return stockItems
      .filter((s) => s.product_name.toLowerCase().includes(q))
      .slice(0, 15);
  }, [stockItems, searchStock]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const displayName = userName || (selectedSalesman !== 'ALL' ? selectedSalesman : 'Sales Partner');

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Banner */}
      <GlassCard className="p-6 relative overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-800 text-white rounded-3xl shadow-xl">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 relative">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md text-sky-100 border border-white/20">
                <MdPointOfSale className="mr-1 text-sm text-yellow-300" />
                Sales Terminal & Performance Dashboard
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                Live Synced
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white drop-shadow-xs">
              Welcome back, {displayName}!
            </h1>
            <p className="text-sky-100 text-sm mt-1 max-w-xl">
              Track your daily sales performance, monitor warehouse dispatches, and check instant stock availability across A-39 and Shop.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Salesman Filter for Admins */}
            {isAdminOrSuper && (
              <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 backdrop-blur-md">
                <MdPerson className="text-sky-200 mr-2 text-base" />
                <select
                  value={selectedSalesman}
                  onChange={(e) => setSelectedSalesman(e.target.value)}
                  className="bg-transparent text-white text-xs font-medium focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="text-slate-800">All Salesmen</option>
                  {salesmanList.map((s) => (
                    <option key={s} value={s} className="text-slate-800">
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={loadDashboardData}
              title="Refresh Data"
              className="p-2.5 bg-white/15 hover:bg-white/25 rounded-xl border border-white/20 transition-all text-white backdrop-blur-md shadow-sm"
            >
              <MdRefresh className="text-lg" />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* 2. Key Performance Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Sales"
          value={`Rs. ${metrics.todaySales.toLocaleString(undefined, { minimumFractionDigits: 0 })}`}
          Icon={MdShoppingCart}
          bgColor="bg-gradient-to-br from-red-500 to-rose-600"
        />
        <StatCard
          title="This Month Sales"
          value={`Rs. ${metrics.monthSales.toLocaleString(undefined, { minimumFractionDigits: 0 })}`}
          Icon={MdReceiptLong}
          bgColor="bg-gradient-to-br from-rose-600 to-red-800"
        />
        <StatCard
          title="Pending Warehouse Dispatch"
          value={metrics.pendingDispatchCount}
          Icon={MdHourglassEmpty}
          bgColor="bg-gradient-to-br from-red-600 to-rose-700"
        />
        <StatCard
          title="Dispatched Invoices"
          value={metrics.dispatchedCount}
          Icon={MdLocalShipping}
          bgColor="bg-gradient-to-br from-red-800 to-slate-900"
        />
      </div>

      {/* 3. Salesman Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ActionCard
          title="New Sales Invoice"
          subtitle="Generate instant customer invoice"
          Icon={MdAddShoppingCart}
          bgGradient="bg-gradient-to-br from-red-600 to-rose-700"
          onClick={() => navigate('/Sales/Invoice/Add')}
        />
        <ActionCard
          title="Invoice Receipts"
          subtitle="Record customer payments"
          Icon={MdReceiptLong}
          bgGradient="bg-gradient-to-br from-rose-600 to-red-800"
          onClick={() => navigate('/Sales/InvoiceReceipt/List')}
        />
        <ActionCard
          title="Customers Directory"
          subtitle="Look up customer accounts & balances"
          Icon={MdPeople}
          bgGradient="bg-gradient-to-br from-red-700 to-rose-900"
          onClick={() => navigate('/Sales/Customers/List')}
        />
        <ActionCard
          title="Live Stock Report"
          subtitle="Check item quantities & locations"
          Icon={MdInventory2}
          bgGradient="bg-gradient-to-br from-slate-700 to-slate-900"
          onClick={() => navigate('/Reports/Stock-Report')}
        />
      </div>

      {/* 4. Main Body: Invoices Table & Live Stock Quick Checker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Recent Invoices & Dispatch Status */}
        <div className="lg:col-span-2 space-y-4">
          <GlassCard className="p-5 rounded-2xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MdReceiptLong className="text-red-600 text-xl" />
                  Recent Sales Invoices
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {filteredInvoices.length} invoices found • Track dispatch status
                </p>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-semibold">
                {(['All', 'Pending', 'Dispatched'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      statusFilter === tab
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <MdSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
              <input
                type="text"
                value={searchInvoice}
                onChange={(e) => setSearchInvoice(e.target.value)}
                placeholder="Search invoice number, customer, or warehouse..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-slate-200 placeholder-slate-400"
              />
            </div>

            {/* Invoices List Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Warehouse</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-center">Dispatch Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No sales invoices matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.slice(0, 10).map((inv) => {
                      const isDispatched = Boolean(inv.dc_no);
                      const amt = parseFloat(String(inv.total_amount || 0)) || 0;
                      return (
                        <tr
                          key={inv.id}
                          className="hover:bg-blue-50/50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">
                            {inv.invoice_no || `INV-${inv.id}`}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-slate-500">
                            {inv.sale_date || inv.created_at?.split('T')[0] || '-'}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                            {inv.customer_name || 'Walk-in'}
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {inv.dispatch_warehouse || 'Any'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-white">
                            Rs. {amt.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {isDispatched ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                <MdCheckCircle className="text-xs" />
                                Dispatched ({inv.dc_no})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                <MdHourglassEmpty className="text-xs" />
                                Pending Dispatch
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => navigate('/Sales/Invoice/List')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 group"
              >
                View Full Invoice Ledger
                <MdArrowForward className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </GlassCard>
        </div>

        {/* Right 1 Col: Quick Live Stock Lookup Widget */}
        <div className="space-y-4">
          <GlassCard className="p-5 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MdInventory2 className="text-emerald-600 text-lg" />
                  Live Stock Checker
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Instant inventory at A-39 & Shop
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                2 Locations
              </span>
            </div>

            {/* Quick search */}
            <div className="relative mb-3">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base" />
              <input
                type="text"
                value={searchStock}
                onChange={(e) => setSearchStock(e.target.value)}
                placeholder="Search product name..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-200 placeholder-slate-400"
              />
            </div>

            {/* Mini Stock Cards List */}
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {filteredStock.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No products found.
                </div>
              ) : (
                filteredStock.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 transition-all"
                  >
                    <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 capitalize truncate mb-2">
                      {item.product_name}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {/* A-39 Storage */}
                      <div className="flex items-center justify-between p-1.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900/40">
                        <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                          <MdWarehouse className="text-xs" /> A-39
                        </span>
                        <span className="font-extrabold text-blue-900 dark:text-blue-200 text-xs">
                          {item.a39_qty.toLocaleString()}
                        </span>
                      </div>

                      {/* SHOP Sale Point */}
                      <div className="flex items-center justify-between p-1.5 bg-teal-50/60 dark:bg-teal-950/30 rounded-lg border border-teal-100 dark:border-teal-900/40">
                        <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1">
                          <MdStorefront className="text-xs" /> SHOP
                        </span>
                        <span className="font-extrabold text-teal-900 dark:text-teal-200 text-xs">
                          {item.shop_qty.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-center">
              <button
                onClick={() => navigate('/Reports/Stock-Report')}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1"
              >
                Open Full Stock Report →
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default SalesmanDashboard;
