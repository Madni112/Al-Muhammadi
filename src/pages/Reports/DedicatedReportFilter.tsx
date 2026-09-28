import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../Context/supabaseClient';
import { useAuth } from '../../Context/Auth';
import Spinner from '../../ui/Spinner';
import SearchableMultiSelect from '../../components/SearchableMultiSelect';
import SearchableDropdown from '../../components/SearchableDropdown';
import {
  MdArrowBack,
  MdReceipt,
  MdTrendingUp,
  MdAssessment,
  MdLayers,
  MdPeople,
  MdLocalMall,
  MdBarChart,
  MdCorporateFare,
  MdInventory,
  MdPauseCircleFilled,
  MdStorefront,
  MdAccountBalanceWallet,
  MdAccountBalance,
  MdBalance,
  MdAccessTime,
  MdTune,
  MdCheckCircle,
  MdDateRange,
  MdBookmark,
  MdBookmarkAdd,
  MdDeleteOutline,
  MdClose,
  MdCardGiftcard,
  MdReceiptLong,
  MdCategory,
  MdTimeline,
  MdHistory,
  MdCompareArrows,
  MdPriceCheck,
  MdFormatListBulleted
} from 'react-icons/md';
import { toast } from 'react-hot-toast';

interface ReportConfig {
  id: string;
  title: string;
  categoryName: string;
  subtitle: string;
  badge?: string;
  badgeType?: 'new' | 'audited' | 'accrual';
  createdAt?: string;
  icon: any;
  targetPrintPath: string;
  printType: string;
  tab?: number;
  hideDateFilter?: boolean;
  singleDateFilter?: boolean;
  fields: Array<
    | 'customerCategory'
    | 'invoice'
    | 'customer'
    | 'salesman'
    | 'transport'
    | 'supplier'
    | 'location'
    | 'parentCategory'
    | 'subCategory'
    | 'subSubCategory'
    | 'product'
    | 'brand'
    | 'uom'
    | 'saleType'
    | 'saleMethod'
    | 'taxScenario'
    | 'accountType'
  >;
}


const shouldShowBadge = (config: { badge?: string; badgeType?: string; createdAt?: string }): boolean => {
  if (!config.badge) return false;
  if (config.badgeType === 'new') {
    if (!config.createdAt) return false;
    const createdTime = new Date(config.createdAt).getTime();
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    return (now - createdTime) <= SEVEN_DAYS_MS && (now - createdTime) >= 0;
  }
  return true;
};

const REPORT_REGISTRY: Record<string, ReportConfig> = {
  'category-wise-sales': {
    id: 'category-wise-sales',
    title: 'Category-Wise Sales & Volume Report',
    categoryName: 'Sales & Distribution',
    subtitle: 'Header-wise category sales audit, product lines, net volumes, return credits, and revenue share.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-20',
    icon: MdCategory,
    targetPrintPath: '/Reports/Sales-Report/Print',
    printType: 'category-sales',
    fields: ['parentCategory', 'subCategory', 'subSubCategory', 'product', 'customer', 'salesman', 'location']
  },
  'product-sales-history': {
    id: 'product-sales-history',
    title: 'Product Sales History Report',
    categoryName: 'Sales & Distribution',
    subtitle: 'Historical sales performance of products, market trends, units sold, returns, rates, and net revenue.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-19',
    icon: MdInventory,
    targetPrintPath: '/Reports/Sales-Report/Print',
    printType: 'product-sales-history',
    fields: ['product', 'customer', 'salesman', 'parentCategory', 'subCategory', 'brand', 'location']
  },
  'sale-inv-detail': {
    id: 'sale-inv-detail',
    title: 'Sales Invoice Detail Report',
    categoryName: 'Sales & Distribution',
    subtitle: 'Line-level itemization including product items, quantities, UOM, and unit prices.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-17',
    icon: MdReceipt,
    targetPrintPath: '/Reports/Sales-Report/Print',
    printType: 'invoice',
    fields: ['invoice', 'customer', 'location', 'parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product']
  },
  'commercial-sale-ledger': {
    id: 'commercial-sale-ledger',
    title: 'Commercial Sales Audit Ledger',
    categoryName: 'Sales & Distribution',
    subtitle: 'Master commercial sales register linked with salesman, carrier fleet & customer accounts.',
    badge: 'AUDITED',
    badgeType: 'audited',
    icon: MdTrendingUp,
    targetPrintPath: '/Reports/Sales-Report/Print',
    printType: 'sale',
    fields: ['customer', 'salesman', 'transport', 'location', 'saleType', 'saleMethod']
  },
  'sales-query-center': {
    id: 'sales-query-center',
    title: 'Sales Filter & Parameter Builder',
    categoryName: 'Sales & Distribution',
    subtitle: 'Custom multi-criteria query builder by customer, salesman, date window & categories.',
    icon: MdAssessment,
    targetPrintPath: '/Reports/Sales-Report/Print',
    printType: 'sales-query',
    fields: ['customer', 'salesman', 'transport', 'parentCategory', 'subCategory', 'subSubCategory', 'product', 'brand', 'location', 'saleType', 'saleMethod']
  },
  'sales-return-ledger': {
    id: 'sales-return-ledger',
    title: 'Sales Return & Credit Ledger',
    categoryName: 'Sales & Distribution',
    subtitle: 'Chronological sales returns audit, credit adjustments, and restocked product logs.',
    icon: MdLayers,
    targetPrintPath: '/Reports/Sales-Report/Print',
    printType: 'return',
    fields: ['customer', 'salesman', 'transport', 'location', 'parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product']
  },
  'customer-sales-breakdown': {
    id: 'customer-sales-breakdown',
    title: 'Customer Sales & Volume Analysis',
    categoryName: 'Sales & Distribution',
    subtitle: 'Customer order cycles, top purchasing accounts, and credit settlement statuses.',
    icon: MdPeople,
    targetPrintPath: '/Reports/Sales-Report/Print',
    printType: 'customer-sales',
    fields: ['customer', 'salesman', 'location', 'saleType']
  },
  'customer-loyalty-ledger': {
    id: 'customer-loyalty-ledger',
    title: 'Customer Financial Statement & Invoice Ledger',
    categoryName: 'Sales & Distribution',
    subtitle: 'Audited chronological statement tracking sales invoices, payments received & running net dues per customer in PKR.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-17',
    icon: MdReceiptLong,
    targetPrintPath: '/Reports/Sales-Report/Print',
    printType: 'loyalty',
    fields: ['customer', 'salesman']
  },

  // ── PURCHASES & PAYABLES ──
  'purchase-ledger': {
    id: 'purchase-ledger',
    title: 'Purchase Invoice Register',
    categoryName: 'Purchases & Payables',
    subtitle: 'Direct procurement entries and supplier bill liabilities categorized chronologically.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-17',
    icon: MdLocalMall,
    targetPrintPath: '/Reports/Purchase-Report/Print',
    printType: 'purchase',
    fields: ['supplier', 'location']
  },
  'category-purchases': {
    id: 'category-purchases',
    title: 'Category-Wise Purchases & Volume Report',
    categoryName: 'Purchases & Payables',
    subtitle: 'Header-wise category procurement spend, inward volume, return debits, and expenditure share.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-22',
    icon: MdCategory,
    targetPrintPath: '/Reports/Purchase-Report/Print',
    printType: 'category-purchases',
    fields: ['parentCategory', 'subCategory', 'subSubCategory', 'product', 'brand', 'supplier']
  },
  'product-purchase-history': {
    id: 'product-purchase-history',
    title: 'Product Purchase History & Price Trend Report',
    categoryName: 'Purchases & Payables',
    subtitle: 'Historical inward procurement trends, purchase cost variations over time, batch quantities, and supplier pricing logs.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-22',
    icon: MdInventory,
    targetPrintPath: '/Reports/Purchase-Report/Print',
    printType: 'product-purchase-history',
    fields: ['parentCategory', 'subCategory', 'subSubCategory', 'product', 'brand', 'supplier', 'location']
  },
  'purchase-invoice-detail': {
    id: 'purchase-invoice-detail',
    title: 'Purchase Invoice Itemized Detail Report',
    categoryName: 'Purchases & Payables',
    subtitle: 'Line-by-line itemized purchase bill audit including product SKUs, inward quantities, UOM, and unit costs.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-22',
    icon: MdReceiptLong,
    targetPrintPath: '/Reports/Purchase-Report/Print',
    printType: 'purchase-invoice-detail',
    fields: ['invoice', 'supplier', 'location', 'parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product']
  },
  'purchase-query-center': {
    id: 'purchase-query-center',
    title: 'Purchase Parameter Builder',
    categoryName: 'Purchases & Payables',
    subtitle: 'Filter vendor inward purchases across date brackets, warehouse destinations and payment terms.',
    icon: MdBarChart,
    targetPrintPath: '/Reports/Purchase-Report/Print',
    printType: 'purchase-query',
    fields: ['supplier', 'location', 'parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product']
  },
  'vendor-return-ledger': {
    id: 'vendor-return-ledger',
    title: 'Purchase Returns & Debit Ledger',
    categoryName: 'Purchases & Payables',
    subtitle: 'Outgoing debit adjustments for damaged or returned supplier merchandise.',
    icon: MdCorporateFare,
    targetPrintPath: '/Reports/Purchase-Report/Print',
    printType: 'return',
    fields: ['supplier', 'location', 'parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product']
  },

  // ── INVENTORY & STOCK ──
  'stock-activity-ledger': {
    id: 'stock-activity-ledger',
    title: 'Stock Activity & Movement Ledger',
    categoryName: 'Inventory & Warehouses',
    subtitle: 'Chronological inventory trail auditing opening balances, inward procurement receipts, sales issues, net movements, and closing stock.',
    badge: 'AUDITED',
    badgeType: 'audited',
    icon: MdTimeline,
    targetPrintPath: '/Reports/Stock-Report/Print',
    printType: 'stock',
    tab: 1,
    fields: ['location', 'parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product']
  },
  'current-stock-balance': {
    id: 'current-stock-balance',
    title: 'Stock Balances & Valuation Registry',
    categoryName: 'Inventory & Warehouses',
    subtitle: 'Real-time SKU quantities on hand, warehouse allocations, and unit asset valuations.',
    badge: 'AUDITED',
    badgeType: 'audited',
    icon: MdInventory,
    targetPrintPath: '/Reports/Stock-Report/Print',
    printType: 'stock',
    tab: 2,
    hideDateFilter: true,
    fields: ['location', 'parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product']
  },
  'as-of-date-stock-status': {
    id: 'as-of-date-stock-status',
    title: 'As-Of-Date Stock Status Report',
    categoryName: 'Inventory & Warehouses',
    subtitle: 'Historical inventory snapshot and asset quantities evaluated as of any past cutoff date.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-22',
    icon: MdHistory,
    targetPrintPath: '/Reports/Stock-Report/Print',
    printType: 'stock',
    tab: 3,
    singleDateFilter: true,
    fields: ['location', 'parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product']
  },
  'inter-warehouse-transfers': {
    id: 'inter-warehouse-transfers',
    title: 'Inter-Warehouse Transfer Statement',
    categoryName: 'Inventory & Warehouses',
    subtitle: 'Internal stock movements and transfer audits between Shop Counter, Main Warehouse, and Godowns.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-22',
    icon: MdCompareArrows,
    targetPrintPath: '/Reports/Stock-Report/Print',
    printType: 'stock',
    tab: 4,
    fields: ['location', 'parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product', 'salesman']
  },
  'category-wise-stock': {
    id: 'category-wise-stock',
    title: 'Category-Wise Stock Valuation Ledger',
    categoryName: 'Inventory & Warehouses',
    subtitle: 'Structured 3-tier category valuation (Parent Category, Sub-Category, Category) and value tier filters.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-22',
    icon: MdCategory,
    targetPrintPath: '/Reports/Stock-Report/Print',
    printType: 'stock',
    tab: 7,
    hideDateFilter: true,
    fields: ['parentCategory', 'subCategory', 'subSubCategory', 'brand', 'product']
  },
  'warehouse-location-report': {
    id: 'warehouse-location-report',
    title: 'Warehouse Bin & Location Stock Breakdown',
    categoryName: 'Inventory & Warehouses',
    subtitle: 'Product distribution audit broken down across Shop Counter vs Main Warehouse vs Godowns.',
    badge: 'AUDITED',
    badgeType: 'audited',
    icon: MdStorefront,
    targetPrintPath: '/Reports/Stock-Report/Print',
    printType: 'stock',
    tab: 8,
    singleDateFilter: true,
    fields: ['location', 'brand', 'product']
  },
  'holding-stock-report': {
    id: 'holding-stock-report',
    title: 'Holding Stock & Gatepass Queue',
    categoryName: 'Inventory & Warehouses',
    subtitle: 'Reserved quantities allocated on approved delivery challans pending physical dispatch.',
    badge: 'AUDITED',
    badgeType: 'audited',
    icon: MdPauseCircleFilled,
    targetPrintPath: '/Reports/Holding-Report/Print',
    printType: 'holding',
    fields: ['location', 'customer']
  },

  // ── ACCOUNTS & FINANCIALS ──
  'customer-balance-detail': {
    id: 'customer-balance-detail',
    title: 'Customer Balance Detail Report',
    categoryName: 'Accounts & Financials',
    subtitle: 'Comprehensive breakdown of customer opening balances, period billing debits, recovery credits, and net closing balances filtered by customer category.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-18',
    icon: MdAccountBalanceWallet,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'account',
    tab: 13,
    fields: ['customerCategory', 'customer']
  },
  'vendor-balance-detail': {
    id: 'vendor-balance-detail',
    title: 'Vendor Balance Detail & Account Ledger',
    categoryName: 'Accounts & Financials',
    subtitle: 'Comprehensive breakdown of vendor opening balances, period procurement liabilities, supplier payments, and net payables.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-18',
    icon: MdAccountBalanceWallet,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'account',
    tab: 3,
    fields: ['supplier']
  },
  'customer-ledger': {
    id: 'customer-ledger',
    title: 'Customer Account Ledger (General Ledger)',
    categoryName: 'Accounts & Financials',
    subtitle: 'Detailed chronological debit/credit ledger per customer account with running balance and sales invoices.',
    badge: 'ACCRUAL',
    badgeType: 'accrual',
    icon: MdAccountBalanceWallet,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'account',
    tab: 1,
    fields: ['customer']
  },
  'customer-vendor-ledger': {
    id: 'customer-vendor-ledger',
    title: 'Customer Account Ledger (General Ledger)',
    categoryName: 'Accounts & Financials',
    subtitle: 'Detailed chronological debit/credit ledger per customer account with running balance and sales invoices.',
    badge: 'ACCRUAL',
    badgeType: 'accrual',
    icon: MdAccountBalanceWallet,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'account',
    tab: 1,
    fields: ['customer']
  },
  'daybook-activity-report': {
    id: 'daybook-activity-report',
    title: 'Daily Cash & Bank Daybook',
    categoryName: 'Accounts & Financials',
    subtitle: 'Chronological daybook of daily cash inflows, customer receipts, vendor payments, and cash-drawer balances.',
    badge: 'NEW',
    badgeType: 'new',
    createdAt: '2026-09-19',
    icon: MdReceiptLong,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'account',
    tab: 9,
    singleDateFilter: true,
    fields: ['location']
  },
  'customer-aging-report': {
    id: 'customer-aging-report',
    title: 'Customer Receivables Aging Analysis',
    categoryName: 'Accounts & Financials',
    subtitle: 'Categorized customer debt aging brackets across 0-30, 31-60, 61-90, and 90+ days overdue balances.',
    badge: 'AUDITED',
    badgeType: 'audited',
    icon: MdAccessTime,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'account',
    tab: 12,
    hideDateFilter: true,
    fields: ['customerCategory', 'customer']
  },
  'voucher-audit-register': {
    id: 'voucher-audit-register',
    title: 'Financial Voucher Audit Register',
    categoryName: 'Accounts & Financials',
    subtitle: 'Master chronological register of CPV, CRV, BPV, BRV, and Journal Vouchers (JV) with debit/credit balance trace.',
    icon: MdReceipt,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'account',
    tab: 8,
    fields: ['voucherType']
  },
  'trial-balance-statement': {
    id: 'trial-balance-statement',
    title: 'Trial Balance Audit Statement',
    categoryName: 'Accounts & Financials',
    subtitle: 'Authoritative Chart of Accounts trial balance verifying that total ledger debits equal total ledger credits.',
    badge: 'AUDITED',
    badgeType: 'audited',
    icon: MdBalance,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'account',
    tab: 11,
    hideDateFilter: true,
    fields: []
  },
  'vendor-outstanding-report': {
    id: 'vendor-outstanding-report',
    title: 'Vendor Outstanding Payables Schedule',
    categoryName: 'Accounts & Financials',
    subtitle: 'Unsettled supplier procurement bills and payment dues sorted by vendor account and invoice date.',
    icon: MdCorporateFare,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'account',
    tab: 6,
    fields: ['supplier']
  },
  'expense-ledger': {
    id: 'expense-ledger',
    title: 'Operational Expense Statement',
    categoryName: 'Accounts & Financials',
    subtitle: 'Operating expenditures aggregated across rent, utilities, fuel, and logistics fleets.',
    icon: MdAccountBalance,
    targetPrintPath: '/Reports/Account-Report/Print',
    printType: 'expense',
    tab: 4,
    fields: ['parentCategory', 'location']
  },

  // ── BUSINESS OVERVIEW ──
  'balance-sheet-stat': {
    id: 'balance-sheet-stat',
    title: 'Balance Sheet Financial Statement',
    categoryName: 'Business Overview',
    subtitle: 'Authoritative audit sheet of total assets, liabilities, and owners equity balances.',
    badge: 'AUDITED',
    badgeType: 'audited',
    icon: MdBalance,
    targetPrintPath: '/Reports/Balance-Sheet',
    printType: 'balance_sheet',
    fields: ['location']
  },
  'executive-summary-report': {
    id: 'executive-summary-report',
    title: 'Commercial Executive Summary',
    categoryName: 'Business Overview',
    subtitle: 'High-level financial KPIs, sales vs purchase revenue trajectories, and liquid cash flows.',
    icon: MdTrendingUp,
    targetPrintPath: '/Reports/Balance-Sheet',
    printType: 'summary',
    fields: ['location']
  }
};

const DedicatedReportFilter: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { tenantId } = useAuth();

  const activeConfig = REPORT_REGISTRY[reportId || 'sale-inv-detail'] || REPORT_REGISTRY['sale-inv-detail'];
  const IconComponent = activeConfig.icon || MdAssessment;

  const [loading, setLoading] = useState(true);

  // Lookups data
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [salesmen, setSalesmen] = useState<any[]>([]);
  const [transports, setTransports] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [bins, setBins] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [availableInvoices, setAvailableInvoices] = useState<any[]>([]);

  // Criteria State
  const todayStr = new Date().toISOString().split('T')[0];
  const firstOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const [criteria, setCriteria] = useState<any>({
    customer: [],
    supplier: [],
    salesman: [],
    transport: [],
    parentCategory: [],
    subCategory: [],
    subSubCategory: [],
    uom: [],
    bin: [],
    product: [],
    location: [],
    saleType: 'All',
    saleMethod: 'All',
    invoiceNo: 'All',
    taxScenario: 'All',
    accountType: 'All',
    voucherType: [],
    sortBy: activeConfig.categoryName === 'Inventory & Warehouses'
      ? 'name_asc'
      : (activeConfig.categoryName === 'Accounts & Financials' || activeConfig.printType === 'loyalty')
        ? 'amount_desc'
        : (activeConfig.singleDateFilter ? 'date_asc' : 'date_desc'),
    dateFrom: activeConfig.singleDateFilter ? todayStr : firstOfMonthStr,
    dateTo: todayStr,
    showZeroSales: false,
    showZeroValues: false,
    showOnlyTransacted: false
  });

  // Saved Filter Presets
  const presetStorageKey = `erp_report_presets_${activeConfig.id}`;
  const [savedPresets, setSavedPresets] = useState<{ id: string; name: string; criteria: any }[]>(() => {
    try {
      const stored = localStorage.getItem(presetStorageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const handleApplyPreset = (preset: { id: string; name: string; criteria: any }) => {
    setCriteria({ ...preset.criteria });
    setActivePresetId(preset.id);
    toast.success(`Loaded preset "${preset.name}"`);
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      toast.error('Please enter a preset name');
      return;
    }
    const newPreset = {
      id: String(Date.now()),
      name: newPresetName.trim(),
      criteria: { ...criteria }
    };
    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    localStorage.setItem(presetStorageKey, JSON.stringify(updated));
    setActivePresetId(newPreset.id);
    setNewPresetName('');
    setShowSavePresetModal(false);
    toast.success(`Preset "${newPreset.name}" saved successfully!`);
  };

  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updated);
    localStorage.setItem(presetStorageKey, JSON.stringify(updated));
    if (activePresetId === id) setActivePresetId(null);
    toast.success('Preset removed');
  };

  useEffect(() => {
    const fetchLookups = async () => {
      try {
        setLoading(true);
        const [
          custRes,
          suppRes,
          smRes,
          transRes,
          catRes,
          binRes,
          prodRes,
          locRes,
          invRes,
          uomRes
        ] = await Promise.allSettled([
          supabase.from('customers').select('id, customerName, registrationType, customer_code, customerCode'),
          supabase.from('vendors').select('id, vendor_name, name'),
          supabase.from('salesmen').select('id, name'),
          supabase.from('logistics_transportation').select('id, name'),
          supabase.from('inventory_categories').select('id, name, parent_id'),
          supabase.from('inventory_surface_finishes').select('id, name'),
          supabase.from('products').select('id, product_name'),
          supabase.from('inventory_locations').select('id, name'),
          supabase.from('sales_invoices').select('id, total_amount, customer_name, invoice_no').order('id', { ascending: false }),
          supabase.from('inventory_uom').select('id, short_code, full_name').eq('tenant_id', tenantId || 'bashir').eq('is_active', true)
        ]);

        if (custRes.status === 'fulfilled' && custRes.value.data) setCustomers(custRes.value.data);
        if (suppRes.status === 'fulfilled' && suppRes.value.data) setSuppliers(suppRes.value.data);
        if (smRes.status === 'fulfilled' && smRes.value.data) setSalesmen(smRes.value.data);
        if (transRes.status === 'fulfilled' && transRes.value.data) setTransports(transRes.value.data);
        if (catRes.status === 'fulfilled' && catRes.value.data) setCategories(catRes.value.data);
        if (binRes.status === 'fulfilled' && binRes.value.data) setBins(binRes.value.data);
        if (prodRes.status === 'fulfilled' && prodRes.value.data) setProducts(prodRes.value.data);
        if (locRes.status === 'fulfilled' && locRes.value.data) setLocations(locRes.value.data);
        if (invRes.status === 'fulfilled' && invRes.value.data) setAvailableInvoices(invRes.value.data);
        if (uomRes.status === 'fulfilled' && uomRes.value.data) {
          setUoms(uomRes.value.data.map((u: any) => ({ id: u.id, name: `${u.short_code} = ${u.full_name}` })));
        }
      } catch (err: any) {
        toast.error('Lookup load failed: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchLookups();
  }, [tenantId]);

  const handleInputChange = (field: string, value: any) => {
    setCriteria((prev: any) => ({ ...prev, [field]: value }));
  };

  const customerOptions = useMemo(() => customers.map((c) => {
    const code = c.customer_code || c.customerCode;
    return code ? `[${code}] ${c.customerName}` : c.customerName;
  }).filter(Boolean), [customers]);
  const customerCategoryOptions = useMemo(() => {
    const fromCust = customers.map((c: any) => c.registrationType).filter(Boolean);
    const standard = ['Retail / General', 'Contractor / Builder', 'Wholesaler / Dealer', 'Registered Corporate'];
    return Array.from(new Set([...standard, ...fromCust]));
  }, [customers]);
  const supplierOptions = useMemo(() => suppliers.map((s) => s.vendor_name || s.name).filter(Boolean), [suppliers]);
  const salesmanOptions = useMemo(() => salesmen.map((s) => s.name).filter(Boolean), [salesmen]);
  const transportOptions = useMemo(() => transports.map((t) => t.name).filter(Boolean), [transports]);
  const parentCategories = useMemo(() => categories.filter((c) => c.parent_id === null), [categories]);
  const parentCategoryOptions = useMemo(() => parentCategories.map((c) => c.name).filter(Boolean), [parentCategories]);

  // Selected parent category IDs based on current parentCategory filter
  const selectedParentNames = useMemo(() => {
    const raw = criteria.parentCategory;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((x: any) => String(x).trim().toLowerCase()).filter((x: string) => x && x !== 'all');
  }, [criteria.parentCategory]);

  const activeParentCategories = useMemo(() => {
    if (selectedParentNames.length === 0) return parentCategories;
    return parentCategories.filter((p) => selectedParentNames.includes(String(p.name).trim().toLowerCase()));
  }, [parentCategories, selectedParentNames]);

  const activeParentIdSet = useMemo(() => {
    return new Set(activeParentCategories.map((p) => p.id));
  }, [activeParentCategories]);

  // Sub-categories matching the selected parent category / categories (or all level-2 sub-categories if none selected)
  const subCategories = useMemo(() => {
    return categories.filter((c) => c.parent_id && activeParentIdSet.has(c.parent_id));
  }, [categories, activeParentIdSet]);

  const subCategoryOptions = useMemo(() => {
    return Array.from(new Set(subCategories.map((c) => c.name).filter(Boolean)));
  }, [subCategories]);

  // Selected sub-category IDs based on current subCategory filter
  const selectedSubCategoryNames = useMemo(() => {
    const raw = criteria.subCategory;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((x: any) => String(x).trim().toLowerCase()).filter((x: string) => x && x !== 'all');
  }, [criteria.subCategory]);

  const activeSubCategories = useMemo(() => {
    if (selectedSubCategoryNames.length === 0) return subCategories;
    return subCategories.filter((s) => selectedSubCategoryNames.includes(String(s.name).trim().toLowerCase()));
  }, [subCategories, selectedSubCategoryNames]);

  const activeSubIdSet = useMemo(() => {
    return new Set(activeSubCategories.map((s) => s.id));
  }, [activeSubCategories]);

  // Leaf / Sub-sub-categories matching the selected sub-categories (or all leaf categories under active sub-categories)
  const subSubCategories = useMemo(() => {
    return categories.filter((c) => c.parent_id && activeSubIdSet.has(c.parent_id));
  }, [categories, activeSubIdSet]);

  const subSubCategoryOptions = useMemo(() => {
    return Array.from(new Set(subSubCategories.map((c) => c.name).filter(Boolean)));
  }, [subSubCategories]);

  // Auto-prune subCategory selections that are no longer valid when parentCategory changes
  useEffect(() => {
    if (Array.isArray(criteria.subCategory) && criteria.subCategory.length > 0 && selectedParentNames.length > 0) {
      const validSubs = new Set(subCategoryOptions.map((s) => String(s).toLowerCase()));
      const pruned = criteria.subCategory.filter((s: string) => validSubs.has(String(s).toLowerCase()));
      if (pruned.length !== criteria.subCategory.length) {
        setCriteria((prev: any) => ({ ...prev, subCategory: pruned }));
      }
    }
  }, [subCategoryOptions, selectedParentNames.length]);

  // Auto-prune subSubCategory selections that are no longer valid when subCategory/parentCategory changes
  useEffect(() => {
    if (Array.isArray(criteria.subSubCategory) && criteria.subSubCategory.length > 0 && (selectedSubCategoryNames.length > 0 || selectedParentNames.length > 0)) {
      const validLeafs = new Set(subSubCategoryOptions.map((s) => String(s).toLowerCase()));
      const pruned = criteria.subSubCategory.filter((s: string) => validLeafs.has(String(s).toLowerCase()));
      if (pruned.length !== criteria.subSubCategory.length) {
        setCriteria((prev: any) => ({ ...prev, subSubCategory: pruned }));
      }
    }
  }, [subSubCategoryOptions, selectedSubCategoryNames.length, selectedParentNames.length]);

  const uomOptions = useMemo(() => uoms.map((u) => u.name).filter(Boolean), [uoms]);
  const binOptions = useMemo(() => bins.map((b) => b.name).filter(Boolean), [bins]);
  const productOptions = useMemo(() => products.map((p) => p.product_name).filter(Boolean), [products]);
  const locationOptions = useMemo(() => locations.map((l) => l.name).filter(Boolean), [locations]);
  const invoiceOptions = useMemo(
    () => availableInvoices.map((i) => i.invoice_no || `INV-${String(i.id).padStart(4, '0')}`),
    [availableInvoices]
  );
  const voucherTypeOptions = useMemo(() => [
    'Cash Payment Voucher (CPV)',
    'Cash Receipt Voucher (CRV)',
    'Bank Payment Voucher (BPV)',
    'Bank Receipt Voucher (BRV)',
    'Journal Voucher (JV)',
    'Expense Voucher (EXP)'
  ], []);

  const handleGenerate = () => {
    const dest = `${tenantId ? `/${tenantId}` : ''}${activeConfig.targetPrintPath}`;
    let effectiveDateFrom = criteria.dateFrom;
    let effectiveDateTo = criteria.dateTo;
    
    if (activeConfig.singleDateFilter) {
      const selectedDay = criteria.dateTo || criteria.dateFrom || todayStr;
      effectiveDateFrom = selectedDay;
      effectiveDateTo = selectedDay;
    }

    const filterPayload = {
      ...criteria,
      asOfDate: criteria.asOfDate || (activeConfig.singleDateFilter ? (criteria.dateTo || criteria.dateFrom || todayStr) : (criteria.dateTo || todayStr)),
      dateFrom: effectiveDateFrom,
      dateTo: effectiveDateTo,
      vendor: criteria.supplier,
      brand: criteria.bin,
      parentCategory: criteria.parentCategory,
      subCategory: criteria.subCategory,
      subSubCategory: criteria.subSubCategory,
      category: criteria.parentCategory
    };
    navigate(dest, {
      state: {
        type: activeConfig.printType,
        tab: activeConfig.tab || 1,
        criteria: filterPayload,
        filters: filterPayload
      }
    });
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const f = activeConfig.fields;

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-6 text-slate-800 dark:text-slate-100 text-xs antialiased font-sans pb-16 pt-2">
      {/* ── BREADCRUMB & TOP NAV ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] font-mono text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2 uppercase tracking-wider">
          <button
            type="button"
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/Reports-Dashboard`)}
            className="flex items-center gap-1.5 font-bold hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer transition"
          >
            <MdArrowBack size={14} />
            <span>Reports Hub</span>
          </button>
          <span>&gt;</span>
          <span>{activeConfig.categoryName}</span>
          <span>&gt;</span>
          <span className="text-emerald-700 dark:text-emerald-400 font-bold truncate max-w-[220px]">
            {activeConfig.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 font-semibold text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Direct Parameter Filter</span>
          </span>
        </div>
      </div>

      {/* ── DEDICATED HEADER CARD ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 shadow-inner shrink-0">
            <IconComponent size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                {activeConfig.title}
              </h1>
              {shouldShowBadge(activeConfig) && (
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider border ${
                    activeConfig.badgeType === 'new'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : activeConfig.badgeType === 'audited'
                      ? 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                  }`}
                >
                  {activeConfig.badge}
                </span>
              )}
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
              {activeConfig.subtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/Reports-Dashboard`)}
          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs cursor-pointer transition self-start sm:self-auto shrink-0"
        >
          Change Report
        </button>
      </div>

      {/* ── SAVED FILTER PRESETS TOOLBAR ── */}
      <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-bold text-xs mr-1">
            <MdBookmark size={16} className="text-emerald-600" />
            <span>Saved Presets:</span>
          </div>

          {savedPresets.length === 0 ? (
            <span className="text-[11px] text-slate-400 italic">No saved presets yet for this report.</span>
          ) : (
            savedPresets.map((preset) => (
              <div
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  activePresetId === preset.id
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                }`}
              >
                <span>{preset.name}</span>
                <button
                  type="button"
                  onClick={(e) => handleDeletePreset(preset.id, e)}
                  className={`opacity-60 group-hover:opacity-100 hover:text-rose-500 transition p-0.5 rounded ${
                    activePresetId === preset.id ? 'hover:bg-emerald-700' : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="Delete Preset"
                >
                  <MdClose size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowSavePresetModal(true)}
          className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-bold text-xs bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <MdBookmarkAdd size={15} />
          <span>Save Current Filter Preset</span>
        </button>
      </div>

      {/* Save Preset Modal */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <MdBookmarkAdd size={18} className="text-emerald-600" />
                <span>Save Filter Preset</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSavePresetModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <MdClose size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Name this filter combination for 1-click loading whenever you open this report.
            </p>
            <input
              type="text"
              placeholder="e.g. Lahore Cash Sales - Q3"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500 transition"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSavePresetModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePreset}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-sm"
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CRITERIA INPUTS FORM CARD ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-extrabold uppercase tracking-wide text-xs">
            <MdTune size={16} />
            <span>Target Parameters & Query Constraints</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Leave blank to include all records</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Invoice Profile Field */}
          {f.includes('invoice') && (
            <div className="md:col-span-2">
              <SearchableDropdown
                label="Select Target Invoice (Optional):"
                placeholder="All Invoices"
                options={invoiceOptions}
                value={criteria.invoiceNo === 'All' ? 'All' : criteria.invoiceNo}
                onChange={(val) => handleInputChange('invoiceNo', val)}
              />
            </div>
          )}

          {/* Customer Category Field */}
          {f.includes('customerCategory') && (
            <div>
              <SearchableMultiSelect
                label="Customer Category:"
                placeholder="All Categories"
                options={customerCategoryOptions}
                value={criteria.customerCategory}
                onChange={(val) => handleInputChange('customerCategory', val)}
              />
            </div>
          )}

          {/* Customer Field */}
          {f.includes('customer') && (
            <div>
              <SearchableMultiSelect
                label="Customer:"
                placeholder="All Customers"
                options={customerOptions}
                value={criteria.customer}
                onChange={(val) => handleInputChange('customer', val)}
              />
            </div>
          )}

          {/* Supplier Field */}
          {f.includes('supplier') && (
            <div>
              <SearchableMultiSelect
                label="Supplier:"
                placeholder="All Suppliers"
                options={supplierOptions}
                value={criteria.supplier}
                onChange={(val) => handleInputChange('supplier', val)}
              />
            </div>
          )}

          {/* Salesman Field */}
          {f.includes('salesman') && (
            <div>
              <SearchableMultiSelect
                label="Salesman:"
                placeholder="All Salesmen"
                options={salesmanOptions}
                value={criteria.salesman}
                onChange={(val) => handleInputChange('salesman', val)}
              />
            </div>
          )}

          {/* Transport / Carrier Fleet Field */}
          {f.includes('transport') && (
            <div>
              <SearchableMultiSelect
                label="Transport / Carrier:"
                placeholder="All Transports"
                options={transportOptions}
                value={criteria.transport}
                onChange={(val) => handleInputChange('transport', val)}
              />
            </div>
          )}

          {/* Location / Warehouse Field */}
          {f.includes('location') && (
            <div>
              <SearchableMultiSelect
                label={activeConfig.categoryName.includes('Purchase') ? 'Receiving Warehouse:' : 'Warehouse / Location:'}
                placeholder="All Facilities"
                options={locationOptions}
                value={criteria.location}
                onChange={(val) => handleInputChange('location', val)}
              />
            </div>
          )}

          {/* Parent Category Field */}
          {f.includes('parentCategory') && (
            <div>
              <SearchableMultiSelect
                label="Parent Category:"
                placeholder="All Categories"
                options={parentCategoryOptions}
                value={criteria.parentCategory}
                onChange={(val) => handleInputChange('parentCategory', val)}
              />
            </div>
          )}

          {/* Sub-Category Field */}
          {f.includes('subCategory') && (
            <div>
              <SearchableMultiSelect
                label="Sub-Category:"
                placeholder="All Sub-Categories"
                options={subCategoryOptions}
                value={criteria.subCategory}
                onChange={(val) => handleInputChange('subCategory', val)}
              />
            </div>
          )}

          {/* Leaf / Sub-Sub Category Field */}
          {f.includes('subSubCategory') && (
            <div>
              <SearchableMultiSelect
                label="Leaf Category:"
                placeholder="All Leaf Categories"
                options={subSubCategoryOptions}
                value={criteria.subSubCategory}
                onChange={(val) => handleInputChange('subSubCategory', val)}
              />
            </div>
          )}

          {/* Product Assets Field */}
          {f.includes('product') && (
            <div>
              <SearchableMultiSelect
                label="Product:"
                placeholder="All Products"
                options={productOptions}
                value={criteria.product}
                onChange={(val) => handleInputChange('product', val)}
              />
            </div>
          )}

          {/* Finishing Brand Field */}
          {f.includes('brand') && (
            <div>
              <SearchableMultiSelect
                label="Brand:"
                placeholder="All Brands"
                options={binOptions}
                value={criteria.bin}
                onChange={(val) => handleInputChange('bin', val)}
              />
            </div>
          )}

          {/* UOM Field */}
          {f.includes('uom') && (
            <div>
              <SearchableMultiSelect
                label="UOM:"
                placeholder="All Units"
                options={uomOptions}
                value={criteria.uom}
                onChange={(val) => handleInputChange('uom', val)}
              />
            </div>
          )}

          {/* Sale Type / Payment Term Field */}
          {f.includes('saleType') && (
            <div>
              <label className="block text-slate-500 font-bold mb-1">Payment Term:</label>
              <select
                value={criteria.saleType}
                onChange={(e) => handleInputChange('saleType', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="All">All Payment Terms</option>
                <option value="Cash">Cash Settlement Only</option>
                <option value="Credit">On Credit / Pay Later</option>
              </select>
            </div>
          )}

          {/* Sale Method Field */}
          {f.includes('saleMethod') && (
            <div>
              <label className="block text-slate-500 font-bold mb-1">Sale Method:</label>
              <select
                value={criteria.saleMethod}
                onChange={(e) => handleInputChange('saleMethod', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="All">All Sale Methods</option>
                <option value="Direct">Direct Sale Counter</option>
                <option value="Challan">Via Delivery Challan</option>
              </select>
            </div>
          )}

          {/* Tax Scenario Field */}
          {f.includes('taxScenario') && (
            <div>
              <label className="block text-slate-500 font-bold mb-1">Tax Regime:</label>
              <select
                value={criteria.taxScenario}
                onChange={(e) => handleInputChange('taxScenario', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="All">All Tax Scenarios</option>
                <option value="Registered Buyer (18% Sales Tax)">Registered Buyer (18% Sales Tax)</option>
                <option value="Unregistered Buyer (18% + 4% Further Tax)">Unregistered Buyer (18% + 4% Further Tax)</option>
                <option value="Standard Retail Sale (No Tax)">Standard Retail Sale (No Tax)</option>
              </select>
            </div>
          )}

          {/* Voucher Type Field */}
          {f.includes('voucherType') && (
            <div>
              <SearchableMultiSelect
                label="Voucher Classification:"
                placeholder="All Voucher Classifications"
                options={voucherTypeOptions}
                value={Array.isArray(criteria.voucherType) ? criteria.voucherType : (criteria.voucherType && criteria.voucherType !== 'All' ? [criteria.voucherType] : [])}
                onChange={(val) => handleInputChange('voucherType', val)}
              />
            </div>
          )}

          {/* Sorting Selector & Optional Date Inputs */}
          <div className={`md:col-span-2 border-t border-slate-100 dark:border-slate-800 pt-4 grid grid-cols-1 ${activeConfig.hideDateFilter || activeConfig.singleDateFilter ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Sort By:
              </label>
              <select
                value={criteria.sortBy}
                onChange={(e) => handleInputChange('sortBy', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {activeConfig.categoryName === 'Inventory & Warehouses' ? (
                  <>
                    <option value="name_asc">Product Name (A to Z)</option>
                    <option value="name_desc">Product Name (Z to A)</option>
                    <option value="qty_desc">Stock Quantity (Highest First)</option>
                    <option value="qty_asc">Stock Quantity (Lowest First)</option>
                    <option value="amount_desc">Valuation Amount (Highest First)</option>
                    <option value="amount_asc">Valuation Amount (Lowest First)</option>
                  </>
                ) : (activeConfig.categoryName === 'Accounts & Financials' || activeConfig.printType === 'loyalty' || activeConfig.hideDateFilter) ? (
                  <>
                    <option value="amount_desc">Total Outstanding (Highest First)</option>
                    <option value="amount_asc">Total Outstanding (Lowest First)</option>
                    <option value="name_asc">Customer / Account Name (A to Z)</option>
                    <option value="name_desc">Customer / Account Name (Z to A)</option>
                  </>
                ) : activeConfig.singleDateFilter ? (
                  <>
                    <option value="date_asc">Entry Order / Time (Chronological)</option>
                    <option value="amount_desc">Transaction Value (Highest First)</option>
                    <option value="amount_asc">Transaction Value (Lowest First)</option>
                    <option value="invoice_asc">Invoice No (Ascending A-Z)</option>
                  </>
                ) : (
                  <>
                    <option value="date_desc">Date (Newest First)</option>
                    <option value="date_asc">Date (Oldest First)</option>
                    <option value="amount_desc">Gross Value (Highest First)</option>
                    <option value="amount_asc">Gross Value (Lowest First)</option>
                    <option value="invoice_asc">Invoice No (Ascending A-Z)</option>
                  </>
                )}
              </select>
            </div>

            {/* Single Date Picker Mode (e.g. As Of Date or Daily Daybook) */}
            {activeConfig.singleDateFilter && (
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  {activeConfig.categoryName === 'Inventory & Warehouses'
                    ? 'As Of / Cutoff Date:'
                    : activeConfig.id === 'daybook-activity-report'
                      ? 'Daybook Audit Date:'
                      : 'As Of Date:'}
                </label>
                <input
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={criteria.dateTo || criteria.dateFrom || new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    handleInputChange('dateFrom', e.target.value);
                    handleInputChange('dateTo', e.target.value);
                  }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-slate-50 dark:bg-slate-800 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            )}

            {/* Range Date Picker Mode */}
            {!activeConfig.hideDateFilter && !activeConfig.singleDateFilter && (
              <>
                {/* Date From */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    From Date:
                  </label>
                  <input
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={criteria.dateFrom}
                    onChange={(e) => handleInputChange('dateFrom', e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-slate-50 dark:bg-slate-800 text-xs font-semibold outline-none"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    To Date:
                  </label>
                  <input
                    type="date"
                    min={criteria.dateFrom}
                    value={criteria.dateTo}
                    onChange={(e) => handleInputChange('dateTo', e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-slate-50 dark:bg-slate-800 text-xs font-semibold outline-none"
                  />
                </div>
              </>
            )}
          </div>

          {/* Quick Date Presets for Single Date Mode */}
          {activeConfig.singleDateFilter && (
            <div className="md:col-span-2 flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Quick Daybook Select:</span>
              <button
                type="button"
                onClick={() => {
                  const t = new Date().toISOString().split('T')[0];
                  handleInputChange('dateFrom', t);
                  handleInputChange('dateTo', t);
                }}
                className="py-1 px-2.5 bg-slate-100 hover:bg-emerald-600 hover:text-white dark:bg-slate-800 rounded-lg text-[10px] font-bold transition cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  const ys = y.toISOString().split('T')[0];
                  handleInputChange('dateFrom', ys);
                  handleInputChange('dateTo', ys);
                }}
                className="py-1 px-2.5 bg-slate-100 hover:bg-emerald-600 hover:text-white dark:bg-slate-800 rounded-lg text-[10px] font-bold transition cursor-pointer"
              >
                Yesterday
              </button>
            </div>
          )}

          {/* Quick Date Presets for Range Mode */}
          {!activeConfig.hideDateFilter && !activeConfig.singleDateFilter && (
            <div className="md:col-span-2 flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Quick Date Window:</span>
              <button
                type="button"
                onClick={() => {
                  const t = new Date().toISOString().split('T')[0];
                  handleInputChange('dateFrom', t);
                  handleInputChange('dateTo', t);
                }}
                className="py-1 px-2.5 bg-slate-100 hover:bg-emerald-600 hover:text-white dark:bg-slate-800 rounded-lg text-[10px] font-bold transition cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  const ys = y.toISOString().split('T')[0];
                  handleInputChange('dateFrom', ys);
                  handleInputChange('dateTo', ys);
                }}
                className="py-1 px-2.5 bg-slate-100 hover:bg-emerald-600 hover:text-white dark:bg-slate-800 rounded-lg text-[10px] font-bold transition cursor-pointer"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const day = d.getDay();
                  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                  const s = new Date(d.setDate(diff)).toISOString().split('T')[0];
                  handleInputChange('dateFrom', s);
                  handleInputChange('dateTo', new Date().toISOString().split('T')[0]);
                }}
                className="py-1 px-2.5 bg-slate-100 hover:bg-emerald-600 hover:text-white dark:bg-slate-800 rounded-lg text-[10px] font-bold transition cursor-pointer"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const s = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
                  handleInputChange('dateFrom', s);
                  handleInputChange('dateTo', new Date().toISOString().split('T')[0]);
                }}
                className="py-1 px-2.5 bg-slate-100 hover:bg-emerald-600 hover:text-white dark:bg-slate-800 rounded-lg text-[10px] font-bold transition cursor-pointer"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const s = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split('T')[0];
                  const e = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0];
                  handleInputChange('dateFrom', s);
                  handleInputChange('dateTo', e);
                }}
                className="py-1 px-2.5 bg-slate-100 hover:bg-emerald-600 hover:text-white dark:bg-slate-800 rounded-lg text-[10px] font-bold transition cursor-pointer"
              >
                Last Month
              </button>
            </div>
          )}

          {/* Custom report flags */}
          {(reportId === 'category-wise-sales' || reportId === 'product-sales-history' || reportId === 'trial-balance-statement' || reportId === 'stock-activity-ledger') && (
            <div className="md:col-span-2 flex flex-col gap-3 pt-3 pb-1 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Report Presentation Mode:</span>
                <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => handleInputChange('viewMode', 'summary')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                      (criteria.viewMode || 'summary') === 'summary'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    📊 Summary View {reportId === 'stock-activity-ledger' ? '(Unified Ledger Matrix)' : reportId === 'category-wise-sales' ? '(Category Breakdown)' : reportId === 'trial-balance-statement' ? '(Main Ledger Heads)' : '(1 Row / Product)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInputChange('viewMode', 'detailed')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                      criteria.viewMode === 'detailed'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    📑 Detailed View {reportId === 'stock-activity-ledger' ? '(Ranked Stock-In & Stock-Out)' : reportId === 'trial-balance-statement' ? '(Sub-Ledger Breakdown)' : '(Invoice Breakdown)'}
                  </button>
                </div>
              </div>
              {reportId !== 'trial-balance-statement' && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={Boolean(criteria.showZeroSales)} 
                    onChange={(e) => handleInputChange('showZeroSales', e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-stroke focus:ring-0 cursor-pointer accent-emerald-600"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {reportId === 'category-wise-sales'
                      ? 'Show Categories With Zero Sales (Display Full Category Tree)'
                      : reportId === 'stock-activity-ledger'
                      ? 'Show Products With Zero Movement / Stock (Display Full Inventory Catalog)'
                      : 'Show Products With Zero Sales (Display Full Inventory Catalog)'}
                  </span>
                </label>
              )}
            </div>
          )}

          {(reportId === 'customer-ledger' || reportId === 'customer-vendor-ledger' || reportId === 'customer-balance-detail' || reportId === 'vendor-balance-detail' || reportId === 'trial-balance-statement' || f.includes('customerCategory') || (reportId === 'vendor-balance-detail' || (f.includes('supplier') && activeConfig.printType === 'account'))) && (
            <div className="md:col-span-2 flex flex-wrap items-center gap-6 pt-3 pb-1 border-t border-slate-100 dark:border-slate-800/80">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={Boolean(criteria.showZeroValues)} 
                  onChange={(e) => handleInputChange('showZeroValues', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-stroke focus:ring-0 cursor-pointer accent-emerald-600"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {reportId === 'trial-balance-statement'
                    ? 'Show Zero Values (Include Zero Debit / Credit Balance Heads)'
                    : reportId === 'vendor-outstanding-report'
                    ? 'Show Zero Values (Include Fully Paid Bills)'
                    : reportId === 'vendor-balance-detail'
                    ? 'Show Zero Values (Settled / Inactive Vendors)'
                    : 'Show Zero Values (Settled Accounts)'}
                </span>
              </label>
              {reportId !== 'trial-balance-statement' && reportId !== 'vendor-outstanding-report' && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={Boolean(criteria.showOnlyTransacted)} 
                    onChange={(e) => handleInputChange('showOnlyTransacted', e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-stroke focus:ring-0 cursor-pointer accent-emerald-600"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {reportId === 'vendor-balance-detail' || f.includes('supplier')
                      ? 'Show Only Vendors With Transactions'
                      : 'Show Only Customers With Transactions'}
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* ── ACTION BUTTON FOOTER ── */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/Reports-Dashboard`)}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold text-xs cursor-pointer"
          >
            <MdArrowBack size={15} />
            <span>Cancel & Back</span>
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white py-3 px-10 rounded-xl font-black text-xs shadow-md hover:shadow-lg transition cursor-pointer tracking-wide"
          >
            <MdCheckCircle size={18} />
            <span>Generate {activeConfig.title}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DedicatedReportFilter;
