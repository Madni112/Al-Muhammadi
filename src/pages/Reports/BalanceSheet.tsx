import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchFinancialMetrics, FinancialSummary } from '../../service/financialCalculations';
import Spinner from '../../ui/Spinner';
import {
  MdAccountBalance,
  MdAccountBalanceWallet,
  MdMonetizationOn,
  MdInventory,
  MdTrendingUp,
  MdPrint,
  MdFileDownload,
  MdChevronRight,
  MdExpandMore,
  MdArrowForward,
  MdCheckCircle,
  MdWarning,
  MdPeople,
  MdStorefront,
  MdPieChart,
  MdShoppingBag,
  MdShowChart,
  MdCompareArrows
} from 'react-icons/md';
import { useAuth } from '../../Context/Auth';
import { exportToExcel, ExcelColumn } from '../../utils/excelExport';
import { toast } from 'react-hot-toast';

const defaultMetrics: FinancialSummary = {
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

const BalanceSheet: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { businessName, tenantId } = useAuth();
  const [metrics, setMetrics] = useState<FinancialSummary>(defaultMetrics);
  const [loading, setLoading] = useState(true);

  // Determine active perspective from route / location state
  const printTypeFromState = location.state?.type || location.state?.printType;
  const activePerspective: 'balance_sheet' | 'summary' =
    printTypeFromState === 'summary' || location.state?.reportId === 'executive-summary-report'
      ? 'summary'
      : 'balance_sheet';

  const initialAsOfDate =
    location.state?.criteria?.asOfDate ||
    location.state?.filters?.asOfDate ||
    location.state?.asOfDate ||
    location.state?.date ||
    new Date().toISOString().split('T')[0];
  const [asOfDate, setAsOfDate] = useState(initialAsOfDate);

  // Accordion Expand States for Balance Sheet
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    cash: true,
    bank: true,
    receivables: false,
    inventory: false,
    payables: false,
    equity: false
  });

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchFinancialMetrics();
      if (res) setMetrics(res);
    } catch (err: any) {
      console.error('BalanceSheet loadData failure:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = activePerspective === 'summary'
      ? `Executive_Summary_${asOfDate}`
      : `Balance_Sheet_${asOfDate}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const [exporting, setExporting] = useState(false);

  // ── Excel Export Handler (Dynamic for both Perspectives) ──
  const handleExportExcel = async () => {
    try {
      setExporting(true);

      if (activePerspective === 'summary') {
        const columns: ExcelColumn[] = [
          { header: 'Commercial Metric / Dimension', key: 'metric', width: 34 },
          { header: 'Period / Account Group', key: 'category', width: 24 },
          { header: 'Primary Value (Rs. / Pcs)', key: 'value', width: 26, type: 'currency' },
          { header: 'Comparative Benchmark', key: 'benchmark', width: 28 },
          { header: 'Operational Status', key: 'status', width: 20 }
        ];

        const netLiquidFunds = (metrics.cashBalance || 0) + (metrics.totalBankBalance || 0);
        const netWorkingCapital = (metrics.totalReceivables || 0) - (metrics.totalPayables || 0);

        const exportData: any[] = [
          // ── Section 1: Executive KPI Summary ──
          { isSectionHeader: true, sectionTitle: '1. HIGH-LEVEL COMMERCIAL EXECUTIVE KPIS' },
          { metric: 'Total Commercial Assets', category: 'Balance Sheet GAAP', value: metrics.totalAssets || 0, benchmark: 'Total Enterprise Asset Pool', status: 'Audited Active' },
          { metric: 'Total External Liabilities', category: 'Balance Sheet GAAP', value: metrics.totalLiabilities || 0, benchmark: 'Total Supplier Payables', status: 'Payable Due' },
          { metric: 'Net Owner Equity (Capital)', category: 'Balance Sheet GAAP', value: metrics.totalEquity || 0, benchmark: 'Assets minus Liabilities', status: 'Net Worth' },
          { metric: 'Immediate Liquid Funds (Cash + Bank)', category: 'Liquidity Pool', value: netLiquidFunds, benchmark: `Cash: Rs. ${Number(metrics.cashBalance || 0).toLocaleString()} | Bank: Rs. ${Number(metrics.totalBankBalance || 0).toLocaleString()}`, status: 'Liquid Available' },
          { metric: 'Merchandise Inventory Stock Assets', category: 'Warehouse Holdings', value: metrics.inventoryAssetValue || 0, benchmark: 'Current Stock Valuation', status: 'On-Hand' },
          { metric: "Today's Gross Sales Revenue", category: 'Sales Cycle', value: metrics.todaysSales || 0, benchmark: 'Daily Billing Run', status: 'Real-time' },
          { metric: 'This Month Total Sales (MTD)', category: 'Sales Cycle', value: metrics.thisMonthSales || 0, benchmark: 'Monthly Revenue', status: 'MTD Realized' },
          { metric: 'This Month Procurement Purchases (MTD)', category: 'Procurement Cycle', value: metrics.thisMonthPurchases || 0, benchmark: 'Monthly Vendor Invoices', status: 'MTD Inflow' },
          { metric: 'Accounts Receivable (Client Debt)', category: 'Credit Exposure', value: metrics.totalReceivables || 0, benchmark: 'Outstanding Invoices', status: 'Pending Recovery' },
          { metric: 'Accounts Payable (Vendor Debt)', category: 'Credit Exposure', value: metrics.totalPayables || 0, benchmark: 'Outstanding Supplier Invoices', status: 'Pending Payment' },
          { metric: 'Net Working Capital Exposure', category: 'Working Capital', value: netWorkingCapital, benchmark: 'Receivables minus Payables', status: netWorkingCapital >= 0 ? 'Surplus Positive' : 'Deficit Watch' },

          // ── Section 2: Bank Accounts Portfolio ──
          { isSectionHeader: true, sectionTitle: '2. CORPORATE BANK ACCOUNTS AUDIT LEDGER' },
          ...(metrics.bankAccounts || []).map((b) => ({
            metric: `🏦 ${b.bankName} (${b.accountTitle})`,
            category: b.accountNumber ? `A/C #${b.accountNumber}` : 'General Account',
            value: b.netBalance || 0,
            benchmark: `Inflow: Rs. ${Number(b.totalInflow || 0).toLocaleString()} | Outflow: Rs. ${Number(b.totalOutflow || 0).toLocaleString()}`,
            status: 'Active'
          })),

          // ── Section 3: Monthly Sales vs Purchases Performance ──
          { isSectionHeader: true, sectionTitle: '3. 6-MONTH COMMERCIAL REVENUE & PROCUREMENT TRAJECTORY' },
          ...(metrics.monthlySalesTrend || []).map((tr) => ({
            metric: `Month: ${tr.month}`,
            category: 'Sales vs Purchases',
            value: tr.sales || 0,
            benchmark: `Purchases Outlay: Rs. ${Number(tr.purchases || 0).toLocaleString()}`,
            status: (tr.sales - tr.purchases >= 0) ? 'Profitable Net +' : 'Negative Inflow'
          }))
        ];

        await exportToExcel({
          fileName: `Commercial_Executive_Summary_${asOfDate}.xlsx`,
          sheetName: 'Executive Summary',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: `Commercial Executive Performance Statement (As of ${asOfDate})`,
          filterSummary: {
            'As Of Date': asOfDate,
            'Perspective': 'Commercial Executive Summary & Corporate Trajectory',
            'Statement Type': 'Executive Briefing Memo'
          },
          columns,
          data: exportData,
          summaryRow: false,
          theme: 'emerald'
        });

        toast.success('Executive Summary exported to Excel successfully!');
      } else {
        // Standard Balance Sheet Excel
        const columns: ExcelColumn[] = [
          { header: 'Account Classification Code', key: 'code', width: 24 },
          { header: 'Account Description / Group', key: 'title', width: 38 },
          { header: 'Category Type', key: 'category', width: 18 },
          { header: 'Debit Balance (Rs.)', key: 'debit', width: 22, type: 'currency' },
          { header: 'Credit Balance (Rs.)', key: 'credit', width: 22, type: 'currency' }
        ];

        const exportData = [
          { code: '1010', title: 'Cash Box & Liquid App Drawer', category: 'ASSET', debit: metrics.cashBalance || 0, credit: 0 },
          { code: '1020', title: 'Corporate Bank Ledger Accounts', category: 'ASSET', debit: metrics.totalBankBalance || 0, credit: 0 },
          { code: '1030', title: 'Accounts Receivable (Customers Debt)', category: 'ASSET', debit: metrics.totalReceivables || 0, credit: 0 },
          { code: '1040', title: 'Merchandise Inventory Stock Assets', category: 'ASSET', debit: metrics.inventoryAssetValue || 0, credit: 0 },
          { code: 'TOTAL ASSETS', title: 'TOTAL COMMERCIAL ASSETS', category: 'ASSETS TOTAL', debit: metrics.totalAssets || 0, credit: 0 },
          { code: '2010', title: 'Accounts Payable (Supplier Unpaid Bills)', category: 'LIABILITY', debit: 0, credit: metrics.totalPayables || 0 },
          { code: 'TOTAL LIAB', title: 'TOTAL LIABILITIES', category: 'LIABILITIES TOTAL', debit: 0, credit: metrics.totalLiabilities || 0 },
          { code: '3010', title: 'Owner Equity & Retained Earnings', category: 'EQUITY', debit: 0, credit: metrics.totalEquity || 0 },
          { code: 'TOTAL LIAB+EQ', title: 'TOTAL LIABILITIES & EQUITY', category: 'BALANCE TOTAL', debit: 0, credit: (metrics.totalLiabilities || 0) + (metrics.totalEquity || 0) }
        ];

        await exportToExcel({
          fileName: `Corporate_Balance_Sheet_${asOfDate}.xlsx`,
          sheetName: 'Balance Sheet',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: `Corporate GAAP Balance Sheet Statement (As of ${asOfDate})`,
          filterSummary: { 'As Of Date': asOfDate, 'Accounting Standard': 'GAAP (Assets = Liabilities + Equity)' },
          columns,
          data: exportData,
          summaryRow: false,
          theme: 'emerald'
        });

        toast.success('Balance Sheet exported to Excel successfully!');
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const totalLiabEq = (metrics.totalLiabilities || 0) + (metrics.totalEquity || 0);
  const isBalanced = Math.abs((metrics.totalAssets || 0) - totalLiabEq) < 1;

  // Percentage calculations for visual solvency meter
  const assetsVal = metrics.totalAssets || 1;
  const liabPct = Math.min(100, Math.round(((metrics.totalLiabilities || 0) / assetsVal) * 100));
  const equityPct = Math.max(0, 100 - liabPct);

  const netLiquidFunds = (metrics.cashBalance || 0) + (metrics.totalBankBalance || 0);
  const netReceivablePayableSpread = (metrics.totalReceivables || 0) - (metrics.totalPayables || 0);

  if (loading && !metrics.totalAssets && !metrics.totalLiabilities) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 text-slate-800 dark:text-slate-100 text-xs antialiased font-sans pb-12 print:p-0">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body * { visibility: hidden !important; }
          .balance-sheet-print-container, .balance-sheet-print-container * { visibility: visible !important; }
          .balance-sheet-print-container {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            z-index: 999999 !important;
            background: white !important;
            color: black !important;
            padding: 16px !important;
          }
          aside, header, nav, button, input, .print-hidden-element {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}} />

      {/* ── TOP HEADER WITH PERSPECTIVE TABS & ACTIONS ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-emerald-900 to-emerald-800 dark:from-emerald-950 dark:to-emerald-900 p-6 rounded-2xl shadow-lg relative overflow-hidden print-hidden-element">
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-emerald-600/20 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute left-1/4 -bottom-10 w-48 h-48 bg-emerald-400/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-white/10 text-emerald-100 font-bold backdrop-blur-sm border border-white/10 shadow-sm">
              {activePerspective === 'summary' ? <MdTrendingUp size={24} /> : <MdAccountBalance size={24} />}
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {activePerspective === 'summary' ? 'Commercial Executive Summary' : 'Corporate Balance Sheet & Financial Statement'}
            </h1>
          </div>
          <p className="text-[13px] text-emerald-100/70 mt-2 max-w-xl leading-relaxed">
            {activePerspective === 'summary'
              ? 'High-level financial KPIs, sales vs purchase revenue trajectories, liquid cash flows, and working capital audit.'
              : 'Real-time GAAP Statement (Assets = Liabilities + Equity) calculated from general ledger records.'}
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-end gap-3 w-full md:w-auto ml-auto">
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2.5">
            <span className="text-[11px] font-bold text-emerald-200">As Of Date:</span>
            <input
              type="date"
              max={new Date().toISOString().split('T')[0]}
              value={asOfDate}
              onChange={(e) => {
                const today = new Date().toISOString().split('T')[0];
                if (e.target.value > today) {
                  setAsOfDate(today);
                  return;
                }
                setAsOfDate(e.target.value);
              }}
              className="bg-transparent font-bold text-xs text-white outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            disabled={exporting}
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl font-black text-xs transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-2"
          >
            <MdFileDownload size={18} className="text-emerald-600" />
            <span>{exporting ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2.5 bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl font-black text-xs transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer flex items-center gap-2 border border-slate-800"
          >
            <MdPrint size={18} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      <div className="balance-sheet-print-container flex flex-col gap-6">
        
        {/* Printable Header for physical paper prints */}
        <div className="hidden print:block text-center mb-4 border-b-2 border-black pb-3">
          <h1 className="text-2xl font-black text-black uppercase tracking-wider font-serif">{businessName || 'ZOAIB ALI & COMPANY'}</h1>
          <h2 className="text-sm font-extrabold text-gray-800 uppercase tracking-widest font-mono">
            {activePerspective === 'summary'
              ? 'COMMERCIAL EXECUTIVE SUMMARY & FINANCIAL TRAJECTORY STATEMENT'
              : 'CORPORATE GAAP BALANCE SHEET FINANCIAL STATEMENT'}
          </h2>
          <div className="flex justify-between items-center text-[10px] text-gray-600 font-mono mt-2 pt-1 border-t border-gray-300">
            <span>Audit Perspective: <b>{activePerspective.toUpperCase().replace('_', ' ')}</b></span>
            <span>Accounting Standard: <b>GAAP (Assets = Liabilities + Equity)</b></span>
            <span>Cutoff As Of Date: <b>{asOfDate}</b></span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* 🌟 PERSPECTIVE 1: COMMERCIAL EXECUTIVE SUMMARY VIEW            */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activePerspective === 'summary' && (
          <div className="space-y-6">

            {/* 📊 6 Executive KPI Briefing Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* Card 1: Liquid Funds */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 shadow-xs relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Liquid Cash &amp; Bank Pool</span>
                    <h3 className="text-lg font-black font-mono text-emerald-950 dark:text-emerald-100 mt-1">
                      Rs. {Number(netLiquidFunds).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <span className="p-2 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-xl">
                    <MdAccountBalanceWallet size={20} />
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-emerald-500/20 flex justify-between text-[11px] font-mono text-emerald-900 dark:text-emerald-200">
                  <span>Cash Drawer: <b>Rs. {Number(metrics.cashBalance || 0).toLocaleString()}</b></span>
                  <span>Banks: <b>Rs. {Number(metrics.totalBankBalance || 0).toLocaleString()}</b></span>
                </div>
              </div>

              {/* Card 2: Sales Performance */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent p-4 shadow-xs relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">Month-to-Date Sales (MTD)</span>
                    <h3 className="text-lg font-black font-mono text-blue-950 dark:text-blue-100 mt-1">
                      Rs. {Number(metrics.thisMonthSales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <span className="p-2 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-xl">
                    <MdTrendingUp size={20} />
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-blue-500/20 flex justify-between text-[11px] font-mono text-blue-900 dark:text-blue-200">
                  <span>Today's Billing: <b>Rs. {Number(metrics.todaysSales || 0).toLocaleString()}</b></span>
                  <span className="text-emerald-600 font-bold">Active Stream</span>
                </div>
              </div>

              {/* Card 3: Procurement Outlay */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent p-4 shadow-xs relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-300">Month Procurement Purchases</span>
                    <h3 className="text-lg font-black font-mono text-indigo-950 dark:text-indigo-100 mt-1">
                      Rs. {Number(metrics.thisMonthPurchases || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <span className="p-2 bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-xl">
                    <MdShoppingBag size={20} />
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-indigo-500/20 flex justify-between text-[11px] font-mono text-indigo-900 dark:text-indigo-200">
                  <span>Procurement Outflow</span>
                  <span className="font-bold text-indigo-700">Vendor Bills</span>
                </div>
              </div>

              {/* Card 4: Inventory Asset Valuation */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent p-4 shadow-xs relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 dark:text-purple-300">Merchandise Inventory Valuation</span>
                    <h3 className="text-lg font-black font-mono text-purple-950 dark:text-purple-100 mt-1">
                      Rs. {Number(metrics.inventoryAssetValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <span className="p-2 bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded-xl">
                    <MdInventory size={20} />
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-purple-500/20 flex justify-between text-[11px] font-mono text-purple-900 dark:text-purple-200">
                  <span>Opening: Rs. {Number(metrics.monthOpeningStockValue || 0).toLocaleString()}</span>
                  <span>Net Move: {metrics.thisMonthStockMovement >= 0 ? '+' : ''}{Number(metrics.thisMonthStockMovement || 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Card 5: Credit Spread (Receivables vs Payables) */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-4 shadow-xs relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">Net Working Capital Spread</span>
                    <h3 className="text-lg font-black font-mono text-amber-950 dark:text-amber-100 mt-1">
                      Rs. {Number(netReceivablePayableSpread).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <span className="p-2 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl">
                    <MdCompareArrows size={20} />
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-amber-500/20 flex justify-between text-[11px] font-mono text-amber-900 dark:text-amber-200">
                  <span>Rec: <b>Rs. {Number(metrics.totalReceivables || 0).toLocaleString()}</b></span>
                  <span>Pay: <b>Rs. {Number(metrics.totalPayables || 0).toLocaleString()}</b></span>
                </div>
              </div>

              {/* Card 6: Total Commercial Net Worth (Equity) */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent p-4 shadow-xs relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300">Total Net Owner Equity</span>
                    <h3 className="text-lg font-black font-mono text-teal-950 dark:text-teal-100 mt-1">
                      Rs. {Number(metrics.totalEquity || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <span className="p-2 bg-teal-500/20 text-teal-700 dark:text-teal-300 rounded-xl">
                    <MdPieChart size={20} />
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-teal-500/20 flex justify-between text-[11px] font-mono text-teal-900 dark:text-teal-200">
                  <span>Solvency: <b>{equityPct}% Equity</b></span>
                  <span>Liab: <b>{liabPct}%</b></span>
                </div>
              </div>

            </div>

            {/* 📈 6-Month Commercial Trajectory Table & Trends */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <MdShowChart className="text-emerald-600" size={20} />
                  6-Month Revenue &amp; Procurement Trajectory
                </h3>
                <span className="text-[11px] font-bold text-gray-500 font-mono">Monthly Trend Comparative</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                  <thead>
                    <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                      <th className="p-2 border border-black text-center w-12">S#</th>
                      <th className="p-2 border border-black">Month</th>
                      <th className="p-2 border border-black text-right">Sales Revenue (Rs.)</th>
                      <th className="p-2 border border-black text-right">Procurement Purchases (Rs.)</th>
                      <th className="p-2 border border-black text-right">Net Operating Margin (Rs.)</th>
                      <th className="p-2 border border-black text-center">Performance Indicator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics.monthlySalesTrend || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-6 italic text-gray-400 border border-black">
                          No monthly history recorded yet.
                        </td>
                      </tr>
                    ) : (
                      (metrics.monthlySalesTrend || []).map((tr, idx) => {
                        const netMargin = tr.sales - tr.purchases;
                        const isPositive = netMargin >= 0;
                        return (
                          <tr key={idx} className="border-b border-black font-mono text-xs hover:bg-slate-50 transition-colors">
                            <td className="p-2 border border-black text-center font-bold text-gray-600">{idx + 1}</td>
                            <td className="p-2 border border-black font-bold font-sans text-gray-900">{tr.month}</td>
                            <td className="p-2 border border-black text-right font-bold text-blue-900">
                              Rs. {Number(tr.sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2 border border-black text-right font-bold text-indigo-900">
                              Rs. {Number(tr.purchases || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className={`p-2 border border-black text-right font-black ${isPositive ? 'text-emerald-700 bg-emerald-50/40' : 'text-rose-700 bg-rose-50/40'}`}>
                              Rs. {Number(netMargin).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2 border border-black text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${isPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {isPositive ? 'Surplus Positive ▲' : 'Deficit Outflow ▼'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 border-t-2 border-black font-black text-black text-xs font-mono">
                      <td colSpan={2} className="p-2.5 border border-black text-right uppercase font-sans">
                        Trailing 6-Month Aggregate:
                      </td>
                      <td className="p-2.5 border border-black text-right text-blue-900">
                        Rs. {(metrics.monthlySalesTrend || []).reduce((s, r) => s + Number(r.sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 border border-black text-right text-indigo-900">
                        Rs. {(metrics.monthlySalesTrend || []).reduce((s, r) => s + Number(r.purchases || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 border border-black text-right text-emerald-950 bg-emerald-100 font-bold">
                        Rs. {(metrics.monthlySalesTrend || []).reduce((s, r) => s + (Number(r.sales || 0) - Number(r.purchases || 0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 border border-black text-center font-sans text-[10px] text-gray-700">Cumulative Summary</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 🏦 Bank Accounts Portfolio Ledger Table */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <MdAccountBalance className="text-teal-600" size={20} />
                  Corporate Bank Accounts &amp; Liquidity Distribution
                </h3>
                <span className="text-[11px] font-bold text-gray-500 font-mono">
                  {(metrics.bankAccounts || []).length} Active Bank Ledgers
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                  <thead>
                    <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                      <th className="p-2 border border-black text-center w-12">S#</th>
                      <th className="p-2 border border-black">Bank Name</th>
                      <th className="p-2 border border-black">Account Title &amp; Details</th>
                      <th className="p-2 border border-black text-right">Total Deposits Inflow (Rs.)</th>
                      <th className="p-2 border border-black text-right">Total Withdrawals Outflow (Rs.)</th>
                      <th className="p-2 border border-black text-right bg-teal-50">Net Active Balance (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!metrics.bankAccounts || metrics.bankAccounts.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="text-center py-6 italic text-gray-400 border border-black">
                          No corporate bank accounts logged.
                        </td>
                      </tr>
                    ) : (
                      metrics.bankAccounts.map((b, idx) => (
                        <tr key={b.id || idx} className="border-b border-black font-mono text-xs hover:bg-slate-50 transition-colors">
                          <td className="p-2 border border-black text-center font-bold text-gray-600">{idx + 1}</td>
                          <td className="p-2 border border-black font-bold font-sans text-gray-900">🏦 {b.bankName}</td>
                          <td className="p-2 border border-black font-mono text-gray-700">
                            {b.accountTitle} {b.accountNumber ? `(A/C: ${b.accountNumber})` : ''}
                          </td>
                          <td className="p-2 border border-black text-right text-emerald-700">
                            Rs. {Number(b.totalInflow || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 border border-black text-right text-rose-700">
                            Rs. {Number(b.totalOutflow || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 border border-black text-right font-black text-teal-900 bg-teal-50/50">
                            Rs. {Number(b.netBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 border-t-2 border-black font-black text-black text-xs font-mono">
                      <td colSpan={3} className="p-2.5 border border-black text-right uppercase font-sans">
                        Total Corporate Bank Holdings:
                      </td>
                      <td className="p-2.5 border border-black text-right text-emerald-800">
                        Rs. {(metrics.bankAccounts || []).reduce((s, b) => s + Number(b.totalInflow || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 border border-black text-right text-rose-800">
                        Rs. {(metrics.bankAccounts || []).reduce((s, b) => s + Number(b.totalOutflow || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 border border-black text-right text-teal-950 bg-teal-100 font-black">
                        Rs. {Number(metrics.totalBankBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* ⚖️ PERSPECTIVE 2: BALANCE SHEET STATEMENT GAAP VIEW             */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activePerspective === 'balance_sheet' && (
          <div className="space-y-6">

            {/* ── AUDIT STATUS BANNER WITH CAPITAL SOLVENCY GAUGE ── */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-[#111827] dark:to-slate-900 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3.5 rounded-2xl shadow-sm ${isBalanced ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'}`}>
                    {isBalanced ? <MdCheckCircle size={32} /> : <MdWarning size={32} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                        GAAP Audit Status:
                      </h3>
                      <span className={`px-2.5 py-1 rounded-full font-black text-[10px] tracking-wide uppercase ${isBalanced ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60' : 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60'}`}>
                        {isBalanced ? 'Balanced Statement ✅' : 'Unbalanced Discrepancy ⚠️'}
                      </span>
                    </div>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 font-mono bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-md inline-block">
                      Assets (Rs. {Number(metrics.totalAssets || 0).toLocaleString()}) = Liabilities (Rs. {Number(metrics.totalLiabilities || 0).toLocaleString()}) + Equity (Rs. {Number(metrics.totalEquity || 0).toLocaleString()})
                    </p>
                  </div>
                </div>

                {/* 3 Executive KPI Chips */}
                <div className="flex flex-wrap items-center gap-3 font-mono">
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/50 p-3.5 rounded-xl min-w-[140px] text-right shadow-sm">
                    <span className="text-emerald-700 dark:text-emerald-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Total Assets</span>
                    <b className="text-emerald-700 dark:text-emerald-300 text-[15px] font-black">
                      Rs. {Number(metrics.totalAssets || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </b>
                  </div>

                  <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/50 p-3.5 rounded-xl min-w-[140px] text-right shadow-sm">
                    <span className="text-rose-700 dark:text-rose-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Total Liabilities</span>
                    <b className="text-rose-700 dark:text-rose-300 text-[15px] font-black">
                      Rs. {Number(metrics.totalLiabilities || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </b>
                  </div>

                  <div className="bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-900/50 p-3.5 rounded-xl min-w-[140px] text-right shadow-sm">
                    <span className="text-purple-700 dark:text-purple-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Net Owner Equity</span>
                    <b className="text-purple-700 dark:text-purple-300 text-[15px] font-black">
                      Rs. {Number(metrics.totalEquity || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </b>
                  </div>
                </div>
              </div>

              {/* Visual Capital Ratio Progress Bar */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
                <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block"></span>
                    Owner Equity ({equityPct}%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                    External Liabilities ({liabPct}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                  <div style={{ width: `${equityPct}%` }} className="bg-purple-600 h-full transition-all duration-500" title={`Equity: ${equityPct}%`}></div>
                  <div style={{ width: `${liabPct}%` }} className="bg-rose-500 h-full transition-all duration-500" title={`Liabilities: ${liabPct}%`}></div>
                </div>
              </div>
            </div>

            {/* ── TWO-COLUMN GAAP BALANCE SHEET INTERACTIVE GRID ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ═════════ LEFT COLUMN: ASSETS ═════════ */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <MdMonetizationOn className="text-emerald-600" size={20} />
                    Current &amp; Fixed Assets
                  </h3>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Assets</span>
                    <span className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">
                      Rs. {Number(metrics.totalAssets || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 font-sans">
                  
                  {/* 1. CASH IN HAND ACCORDION */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleSection('cash')}
                      className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {expandedSections.cash ? <MdExpandMore size={20} /> : <MdChevronRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 font-bold flex items-center justify-center">
                          <MdAccountBalanceWallet size={18} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs">Cash in Hand (Counter Liquidity)</h4>
                          <span className="text-[10px] text-slate-400">App Cash Register Ledger Balance</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                        Rs. {Number(metrics.cashBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {expandedSections.cash && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-100 dark:border-slate-800 text-xs flex justify-between items-center">
                        <span className="text-slate-500 text-[11px]">Primary Physical Cash Box Drawer</span>
                        <button
                          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/view/daybook-activity-report`)}
                          className="text-emerald-600 hover:underline font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <span>View Cash Daybook & Ledger</span>
                          <MdArrowForward size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 2. CORPORATE BANK ACCOUNTS ACCORDION */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleSection('bank')}
                      className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {expandedSections.bank ? <MdExpandMore size={20} /> : <MdChevronRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-teal-600/10 text-teal-600 font-bold flex items-center justify-center">
                          <MdAccountBalance size={18} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs">Corporate Bank Accounts</h4>
                          <span className="text-[10px] text-slate-400">{metrics.bankAccounts?.length || 0} Bank Accounts Logged</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-xs">
                        Rs. {Number(metrics.totalBankBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {expandedSections.bank && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-100 dark:border-slate-800 space-y-2">
                        {(!metrics.bankAccounts || metrics.bankAccounts.length === 0) ? (
                          <div className="text-slate-400 italic text-[11px] text-center py-2">No bank accounts logged.</div>
                        ) : (
                          metrics.bankAccounts.map((b) => (
                            <div key={b.id} className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-none text-xs">
                              <div>
                                <span className="font-bold text-slate-800 dark:text-slate-200 block">🏦 {b.bankName}</span>
                                <span className="text-[10px] text-slate-400">{b.accountTitle} {b.accountNumber ? `(${b.accountNumber})` : ''}</span>
                              </div>
                              <span className="font-mono font-bold text-emerald-600">
                                Rs. {Number(b.netBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. ACCOUNTS RECEIVABLE ACCORDION */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleSection('receivables')}
                      className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {expandedSections.receivables ? <MdExpandMore size={20} /> : <MdChevronRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 font-bold flex items-center justify-center">
                          <MdPeople size={18} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs">Accounts Receivable</h4>
                          <span className="text-[10px] text-slate-400">Client Debt Outstanding</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">
                        Rs. {Number(metrics.totalReceivables || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {expandedSections.receivables && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                        <span className="text-slate-500 text-[11px]">Uncollected customer sales invoices</span>
                        <button
                          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/view/customer-aging-report`)}
                          className="text-blue-600 hover:underline font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <span>Open Receivables Aging</span>
                          <MdArrowForward size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 4. MERCHANDISE INVENTORY ASSETS ACCORDION */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleSection('inventory')}
                      className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {expandedSections.inventory ? <MdExpandMore size={20} /> : <MdChevronRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-purple-600/10 text-purple-600 font-bold flex items-center justify-center">
                          <MdInventory size={18} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs">Merchandise Inventory Valuation</h4>
                          <span className="text-[10px] text-slate-400">Warehouse Stock Cost Valuation</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400 text-xs">
                        Rs. {Number(metrics.inventoryAssetValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {expandedSections.inventory && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                        <span className="text-slate-500 text-[11px]">Current warehouse inventory holdings</span>
                        <button
                          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/view/stock-balances`)}
                          className="text-purple-600 hover:underline font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <span>Open Stock Valuation</span>
                          <MdArrowForward size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                </div>

                {/* TOTAL ASSETS FOOTER */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center font-mono font-black text-sm">
                  <span className="uppercase text-slate-900 dark:text-white tracking-wider">TOTAL ASSETS</span>
                  <span className="text-emerald-600 dark:text-emerald-400 text-base">
                    Rs. {Number(metrics.totalAssets || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* ═════════ RIGHT COLUMN: LIABILITIES & EQUITY ═════════ */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <MdAccountBalance className="text-rose-600" size={20} />
                    Liabilities &amp; Owner Equity
                  </h3>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Liabilities &amp; Equity</span>
                    <span className="text-sm font-mono font-black text-rose-600 dark:text-rose-400">
                      Rs. {Number(totalLiabEq).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 font-sans">
                  
                  {/* SECTION HEADER: CURRENT LIABILITIES */}
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 pt-1">
                    Current Liabilities (Supplier Credit &amp; Debts)
                  </div>

                  {/* 1. ACCOUNTS PAYABLE ACCORDION */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleSection('payables')}
                      className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {expandedSections.payables ? <MdExpandMore size={20} /> : <MdChevronRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-rose-600/10 text-rose-600 font-bold flex items-center justify-center">
                          <MdStorefront size={18} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs">Accounts Payable (Vendor Debt)</h4>
                          <span className="text-[10px] text-slate-400">Supplier Unpaid Credit Invoices</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-xs">
                        Rs. {Number(metrics.totalPayables || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {expandedSections.payables && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                        <span className="text-slate-500 text-[11px]">Outstanding procurement payables</span>
                        <button
                          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/view/vendor-outstanding-report`)}
                          className="text-rose-600 hover:underline font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <span>View Vendor Outstanding</span>
                          <MdArrowForward size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* TOTAL LIABILITIES SUB-ROW */}
                  <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-xl flex justify-between items-center">
                    <span className="font-bold text-rose-800 dark:text-rose-300 text-xs uppercase">Total Current Liabilities</span>
                    <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-xs">
                      Rs. {Number(metrics.totalLiabilities || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* SECTION HEADER: OWNER EQUITY */}
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 pt-3">
                    Owner's Equity &amp; Retained Earnings
                  </div>

                  {/* 2. OWNER EQUITY ACCORDION */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleSection('equity')}
                      className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {expandedSections.equity ? <MdExpandMore size={20} /> : <MdChevronRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-purple-600/10 text-purple-600 font-bold flex items-center justify-center">
                          <MdPieChart size={18} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs">Net Capital &amp; Retained Earnings</h4>
                          <span className="text-[10px] text-slate-400">Accumulated Retained Operating Income</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400 text-xs">
                        Rs. {Number(metrics.totalEquity || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {expandedSections.equity && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                        <span className="text-slate-500 text-[11px]">Net Worth = Assets - Liabilities</span>
                        <button
                          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/view/trial-balance-statement`)}
                          className="text-purple-600 hover:underline font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <span>View Trial Balance & Capital</span>
                          <MdArrowForward size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                </div>

                {/* TOTAL LIABILITIES & EQUITY FOOTER */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center font-mono font-black text-sm">
                  <span className="uppercase text-slate-900 dark:text-white tracking-wider">TOTAL LIABILITIES &amp; EQUITY</span>
                  <span className="text-emerald-600 dark:text-emerald-400 text-base">
                    Rs. {Number(totalLiabEq).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ✍️ Formal Multi-Level Executive Verification & Signature Block */}
        <div className="mt-12 grid grid-cols-3 gap-10 text-center text-[10px] font-sans font-black uppercase tracking-wider text-slate-800 break-inside-avoid">
          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-16 min-h-[64px]"></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">PREPARED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Chief Financial Auditor &amp; Controller</div>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-16 min-h-[64px]"></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">VERIFIED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Corporate Operations &amp; Ledger Head</div>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-16 min-h-[64px]"></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">AUTHORIZED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Managing Executive Director &amp; Official Seal</div>
            </div>
          </div>
        </div>

        {/* 🏢 Software & Corporate Provider Footer */}
        <div className="mt-6 pt-3 border-t border-gray-300 flex justify-between items-center text-[10px] text-gray-600 font-sans print:border-gray-400 break-inside-avoid">
          <div className="flex items-center gap-2 font-bold">
            <span className="text-black font-black uppercase">{businessName || 'ZOAIB ALI & COMPANY'}</span>
          </div>
          <div className="text-[9.5px] text-gray-600 font-mono font-medium text-right">
            Software Solution &amp; Cloud Infrastructure by <b className="text-black font-bold">NHT ENTERPRISES (Noor Horizon Technologies)</b>
            <span className="text-gray-400 mx-1.5">•</span>
            <span>Contact: <b className="text-black font-bold">03128039911</b></span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default BalanceSheet;
