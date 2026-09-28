import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { exportToExcel, ExcelColumn } from '../../../utils/excelExport';
import {
  MdPauseCircleFilled,
  MdPrint,
  MdFileDownload,
  MdTrendingUp,
  MdInventory,
  MdPeople,
  MdReceipt,
  MdLocalShipping,
  MdSearch,
  MdFilterAlt,
  MdRefresh,
  MdAttachMoney,
  MdTune,
  MdKeyboardArrowDown,
  MdKeyboardArrowRight,
  MdCheckCircle,
  MdClear,
  MdPerson
} from 'react-icons/md';

type ViewPerspective = 'detailed' | 'salesman' | 'gatepass' | 'invoice' | 'customer';

interface HoldingItemRow {
  id: string;
  dcId: number | string;
  gatepassNo: string;
  invoiceNo: string;
  customerName: string;
  salesman: string;
  productName: string;
  skuCode: string;
  warehouse: string;
  orderQty: number;
  dispatchedQty: number;
  holdQty: number;
  rate: number;
  totalOrderAmount: number;
  date: string;
  status: string;
  uom: string;
}

import { QtyBadge, formatQtyToBoxPc } from '../../../utils/QtyBadge';

const renderQtyBadge = (qty: number, uom: string) => {
  return <QtyBadge qty={qty} uom={uom} />;
};

const getQtyOptionBParts = (qty: number) => {
  const { box, pc } = formatQtyToBoxPc(qty);
  let main = '';
  let unit = '';
  if (box > 0 && pc > 0) {
    main = `${box} Boxes`;
    unit = `+ ${pc} Pc${pc > 1 ? 's' : ''}`;
  } else if (box > 0) {
    main = `${box}`;
    unit = 'Boxes';
  } else if (pc > 0) {
    main = `${pc}`;
    unit = `Pc${pc > 1 ? 's' : ''}`;
  } else {
    main = '0';
    unit = 'Pcs';
  }
  return { main, unit };
};

import SearchableDropdown from '../../../components/SearchableDropdown';

const HoldingReport: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId, businessName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const initialPerspective = (location.state?.activePerspective || location.state?.perspective || location.state?.tab || 'detailed') as ViewPerspective;
  const [activePerspective, setActivePerspective] = useState<ViewPerspective>(initialPerspective);

  // Raw fetched data
  const [holdingRows, setHoldingRows] = useState<HoldingItemRow[]>([]);
  const [salesmenList, setSalesmenList] = useState<string[]>([]);
  const [customersList, setCustomersList] = useState<string[]>([]);
  const [gatepassesList, setGatepassesList] = useState<string[]>([]);
  const [invoicesList, setInvoicesList] = useState<string[]>([]);

  // Search & Filter Criteria
  const [searchQuery, setSearchQuery] = useState(location.state?.searchQuery || '');
  const [selectedSalesman, setSelectedSalesman] = useState(location.state?.selectedSalesman || location.state?.salesman || 'All');
  const [selectedCustomer, setSelectedCustomer] = useState(location.state?.selectedCustomer || location.state?.customer || 'All');
  const [selectedGatepass, setSelectedGatepass] = useState(location.state?.selectedGatepass || location.state?.gatepass || 'All');
  const [selectedInvoice, setSelectedInvoice] = useState(location.state?.selectedInvoice || location.state?.invoice || 'All');
  const [holdingStatusFilter, setHoldingStatusFilter] = useState<'holding_only' | 'all' | 'zero_holding'>('holding_only');
  const [minAmount, setMinAmount] = useState<number | string>('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'qty_desc'>('amount_desc');

  // Collapsible Advanced Filters Drawer State
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Accordion Expand State for Grouped Tabs
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Record<string, boolean>>({});

  // Date Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const toggleGroupExpand = (key: string) => {
    setExpandedGroupKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Quick Date Preset Handler
  const setQuickDateRange = (preset: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'all_time') => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'today') {
      const todayStr = formatDate(today);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = formatDate(y);
      setDateFrom(yStr);
      setDateTo(yStr);
    } else if (preset === 'this_week') {
      const startOfWeek = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      setDateFrom(formatDate(startOfWeek));
      setDateTo(formatDate(today));
    } else if (preset === 'this_month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(formatDate(startOfMonth));
      setDateTo(formatDate(today));
    } else if (preset === 'last_month') {
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      setDateFrom(formatDate(startOfLastMonth));
      setDateTo(formatDate(endOfLastMonth));
    } else if (preset === 'all_time') {
      setDateFrom('');
      setDateTo('');
    }
  };

  const loadHoldingData = async () => {
    try {
      setLoading(true);

      const [dcRes, invRes, smRes, custRes] = await Promise.all([
        supabase.from('delivery_challans').select('*').order('created_at', { ascending: false }),
        supabase.from('sales_invoices').select('*'),
        supabase.from('salesmen').select('id, name'),
        supabase.from('customers').select('id, customerName, customer_code, customerCode')
      ]);

      if (dcRes.error) throw dcRes.error;

      const dcs = dcRes.data || [];
      const invoices = invRes.data || [];
      const salesmen = (smRes.data || []).map((s: any) => s.name).filter(Boolean);
      const customers = (custRes.data || []).map((c: any) => {
        const code = c.customer_code || c.customerCode;
        return code ? `[${code}] ${c.customerName}` : c.customerName;
      }).filter(Boolean);

      // Create lookup map for invoices
      const invMap: Record<string, any> = {};
      invoices.forEach(inv => {
        const key1 = String(inv.id).trim().toLowerCase();
        const key2 = `inv-${key1}`;
        invMap[key1] = inv;
        invMap[key2] = inv;
      });

      const extractedRows: HoldingItemRow[] = [];
      const uniqueGPs = new Set<string>();
      const uniqueInvs = new Set<string>();
      const uniqueSMs = new Set<string>(salesmen);
      const uniqueCusts = new Set<string>(customers);

      dcs.forEach(dc => {
        const rawInvCode = String(dc.invoice_no || '').trim().replace(/^inv-/i, '').toLowerCase();
        const linkedInv = invMap[rawInvCode] || invMap[String(dc.invoice_no || '').trim().toLowerCase()];

        const gatepassCode = dc.challan_no || `DC-${String(dc.id).padStart(4, '0')}`;
        const invoiceCode = dc.invoice_no || (linkedInv?.id ? `INV-${String(linkedInv.id).padStart(4, '0')}` : 'Direct');
        const custName = dc.customer_name || linkedInv?.customer_name || 'Counter Buyer';
        const smName = linkedInv?.salesman || dc.salesman || 'Direct';
        const docDate = dc.challan_date || dc.dc_date || linkedInv?.sale_date || String(dc.created_at || '').split('T')[0];

        if (gatepassCode) uniqueGPs.add(gatepassCode);
        if (invoiceCode && invoiceCode !== 'Direct') uniqueInvs.add(invoiceCode);
        if (custName) uniqueCusts.add(custName);
        if (smName) uniqueSMs.add(smName);

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

        items.forEach((item, idx) => {
          const orderQty = Number(item.orderQty ?? item.qty ?? 0);
          const dispatchedQty = Number(item.dispatchedQty ?? (dc.status === 'Approved' || dc.status === 'Dispatched' ? orderQty : 0));
          const holdQty = Number(item.holdQty !== undefined ? item.holdQty : Math.max(0, orderQty - dispatchedQty));
          const rate = Number(item.rate || item.rp || 0);
          const totalOrderAmt = orderQty * rate;
          const heldAmt = holdQty * rate;

          extractedRows.push({
            id: `${dc.id}-${idx}`,
            dcId: dc.id,
            gatepassNo: gatepassCode,
            invoiceNo: invoiceCode,
            customerName: custName,
            salesman: smName,
            productName: item.pDescription || item.itemName || item.product_name || 'Item',
            skuCode: item.skuCode || item.sku || '',
            warehouse: item.location || dc.dispatch_warehouse || 'Main Warehouse',
            orderQty,
            dispatchedQty,
            holdQty,
            rate,
            totalOrderAmount: totalOrderAmt,
            heldAmount: heldAmt,
            date: docDate,
            status: dc.status || (holdQty > 0 ? 'Holding' : 'Completed'),
            uom: item.uom || item.unit || ''
          });
        });
      });

      setHoldingRows(extractedRows);
      setGatepassesList(Array.from(uniqueGPs).sort());
      setInvoicesList(Array.from(uniqueInvs).sort());
      setSalesmenList(Array.from(uniqueSMs).sort());
      setCustomersList(Array.from(uniqueCusts).sort());
    } catch (err: any) {
      console.error('Error fetching holding data:', err);
      toast.error('Failed to load holding items: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHoldingData();
  }, []);

  // Active Advanced Filters Count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedGatepass !== 'All') count++;
    if (selectedInvoice !== 'All') count++;
    if (holdingStatusFilter !== 'holding_only') count++;
    if (minAmount !== '') count++;
    if (dateFrom || dateTo) count++;
    if (sortBy !== 'amount_desc') count++;
    return count;
  }, [selectedGatepass, selectedInvoice, holdingStatusFilter, minAmount, dateFrom, dateTo, sortBy]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedSalesman('All');
    setSelectedCustomer('All');
    setSelectedGatepass('All');
    setSelectedInvoice('All');
    setHoldingStatusFilter('holding_only');
    setMinAmount('');
    setSortBy('amount_desc');
    setDateFrom('');
    setDateTo('');
  };

  // Filtered Rows
  const filteredHoldingRows = useMemo(() => {
    return holdingRows.filter(row => {
      // 1. Holding status
      if (holdingStatusFilter === 'holding_only' && row.holdQty <= 0) return false;
      if (holdingStatusFilter === 'zero_holding' && row.holdQty > 0) return false;

      // 2. Salesman
      if (selectedSalesman !== 'All' && row.salesman.toLowerCase() !== selectedSalesman.toLowerCase()) return false;

      // 3. Customer
      if (selectedCustomer !== 'All') {
        const cleanCust = selectedCustomer.replace(/^\[.*?\]\s*/, '').trim().toLowerCase();
        if (row.customerName.toLowerCase() !== cleanCust && row.customerName.toLowerCase() !== selectedCustomer.toLowerCase()) return false;
      }

      // 4. Gatepass
      if (selectedGatepass !== 'All' && row.gatepassNo.toLowerCase() !== selectedGatepass.toLowerCase()) return false;

      // 5. Invoice
      if (selectedInvoice !== 'All' && row.invoiceNo.toLowerCase() !== selectedInvoice.toLowerCase()) return false;

      // 6. Date Range
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;

      // 7. Min Amount
      if (minAmount !== '' && Number(minAmount) > 0) {
        if (row.heldAmount < Number(minAmount)) return false;
      }

      // 8. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const match =
          row.productName.toLowerCase().includes(query) ||
          row.skuCode.toLowerCase().includes(query) ||
          row.customerName.toLowerCase().includes(query) ||
          row.salesman.toLowerCase().includes(query) ||
          row.gatepassNo.toLowerCase().includes(query) ||
          row.invoiceNo.toLowerCase().includes(query) ||
          row.warehouse.toLowerCase().includes(query);
        if (!match) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'amount_desc') return b.heldAmount - a.heldAmount;
      if (sortBy === 'amount_asc') return a.heldAmount - b.heldAmount;
      if (sortBy === 'qty_desc') return b.holdQty - a.holdQty;
      if (sortBy === 'date_desc') return b.date.localeCompare(a.date);
      if (sortBy === 'date_asc') return a.date.localeCompare(b.date);
      return 0;
    });
  }, [
    holdingRows,
    holdingStatusFilter,
    selectedSalesman,
    selectedCustomer,
    selectedGatepass,
    selectedInvoice,
    dateFrom,
    dateTo,
    minAmount,
    searchQuery,
    sortBy
  ]);

  // Aggregations for KPI Cards
  const kpis = useMemo(() => {
    let totalHeldQty = 0;
    let totalHeldValue = 0;
    let totalOrderQty = 0;
    let totalOrderValue = 0;
    const affectedGPs = new Set<string>();
    const affectedInvs = new Set<string>();
    const affectedCusts = new Set<string>();
    const affectedSMs = new Set<string>();

    filteredHoldingRows.forEach(row => {
      totalHeldQty += row.holdQty;
      totalHeldValue += row.heldAmount;
      totalOrderQty += row.orderQty;
      totalOrderValue += row.totalOrderAmount;
      if (row.gatepassNo) affectedGPs.add(row.gatepassNo);
      if (row.invoiceNo && row.invoiceNo !== 'Direct') affectedInvs.add(row.invoiceNo);
      if (row.customerName) affectedCusts.add(row.customerName);
      if (row.salesman) affectedSMs.add(row.salesman);
    });

    return {
      totalItems: filteredHoldingRows.length,
      totalHeldQty,
      totalHeldValue,
      totalOrderQty,
      totalOrderValue,
      uniqueGatepasses: affectedGPs.size,
      uniqueInvoices: affectedInvs.size,
      uniqueCustomers: affectedCusts.size,
      uniqueSalesmen: affectedSMs.size
    };
  }, [filteredHoldingRows]);

  // Grouped Summaries for alternative tabs
  const salesmanSummary = useMemo(() => {
    const map: Record<string, { salesman: string; itemsCount: number; totalHeldQty: number; totalHeldValue: number; custSet: Set<string>; invSet: Set<string>; items: HoldingItemRow[] }> = {};
    filteredHoldingRows.forEach(row => {
      const smKey = row.salesman || 'Unassigned';
      if (!map[smKey]) {
        map[smKey] = {
          salesman: smKey,
          itemsCount: 0,
          totalHeldQty: 0,
          totalHeldValue: 0,
          custSet: new Set(),
          invSet: new Set(),
          items: []
        };
      }
      map[smKey].itemsCount += 1;
      map[smKey].totalHeldQty += Number(row.holdQty || 0);
      map[smKey].totalHeldValue += Number(row.heldAmount || 0);
      if (row.customerName) map[smKey].custSet.add(row.customerName);
      if (row.invoiceNo) map[smKey].invSet.add(row.invoiceNo);
      map[smKey].items.push(row);
    });

    return Object.values(map).map(s => ({
      salesman: s.salesman,
      itemsCount: s.itemsCount,
      totalHeldQty: s.totalHeldQty,
      totalHeldValue: s.totalHeldValue,
      custCount: s.custSet.size,
      invCount: s.invSet.size,
      items: s.items
    })).sort((a, b) => b.totalHeldValue - a.totalHeldValue);
  }, [filteredHoldingRows]);

  const customerSummary = useMemo(() => {
    const map: Record<string, { customer: string; itemsCount: number; totalHeldQty: number; totalHeldValue: number; gpSet: Set<string>; invSet: Set<string>; items: HoldingItemRow[] }> = {};
    filteredHoldingRows.forEach(row => {
      const cKey = row.customerName || 'Counter Buyer';
      if (!map[cKey]) {
        map[cKey] = {
          customer: cKey,
          itemsCount: 0,
          totalHeldQty: 0,
          totalHeldValue: 0,
          gpSet: new Set(),
          invSet: new Set(),
          items: []
        };
      }
      map[cKey].itemsCount += 1;
      map[cKey].totalHeldQty += Number(row.holdQty || 0);
      map[cKey].totalHeldValue += Number(row.heldAmount || 0);
      if (row.gatepassNo) map[cKey].gpSet.add(row.gatepassNo);
      if (row.invoiceNo) map[cKey].invSet.add(row.invoiceNo);
      map[cKey].items.push(row);
    });

    return Object.values(map).map(c => ({
      customer: c.customer,
      itemsCount: c.itemsCount,
      totalHeldQty: c.totalHeldQty,
      totalHeldValue: c.totalHeldValue,
      gpCount: c.gpSet.size,
      invCount: c.invSet.size,
      items: c.items
    })).sort((a, b) => b.totalHeldValue - a.totalHeldValue);
  }, [filteredHoldingRows]);

  const gatepassSummary = useMemo(() => {
    const map: Record<string, { gatepassNo: string; customer: string; salesman: string; date: string; itemsCount: number; totalOrderQty: number; totalDispatchedQty: number; totalHeldQty: number; totalHeldValue: number; status: string; items: HoldingItemRow[] }> = {};
    filteredHoldingRows.forEach(row => {
      const gpKey = row.gatepassNo || 'Direct';
      if (!map[gpKey]) {
        map[gpKey] = {
          gatepassNo: gpKey,
          customer: row.customerName,
          salesman: row.salesman,
          date: row.date,
          itemsCount: 0,
          totalOrderQty: 0,
          totalDispatchedQty: 0,
          totalHeldQty: 0,
          totalHeldValue: 0,
          status: row.status,
          items: []
        };
      }
      map[gpKey].itemsCount += 1;
      map[gpKey].totalOrderQty += Number(row.orderQty || 0);
      map[gpKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
      map[gpKey].totalHeldQty += Number(row.holdQty || 0);
      map[gpKey].totalHeldValue += Number(row.heldAmount || 0);
      map[gpKey].items.push(row);
    });
    return Object.values(map).sort((a, b) => b.totalHeldValue - a.totalHeldValue);
  }, [filteredHoldingRows]);

  const invoiceSummary = useMemo(() => {
    const map: Record<string, { invoiceNo: string; customer: string; salesman: string; date: string; itemsCount: number; totalHeldQty: number; totalHeldValue: number; totalOrderAmount: number; items: HoldingItemRow[] }> = {};
    filteredHoldingRows.forEach(row => {
      const invKey = row.invoiceNo || 'Direct';
      if (!map[invKey]) {
        map[invKey] = {
          invoiceNo: invKey,
          customer: row.customerName,
          salesman: row.salesman,
          date: row.date,
          itemsCount: 0,
          totalHeldQty: 0,
          totalHeldValue: 0,
          totalOrderAmount: 0,
          items: []
        };
      }
      map[invKey].itemsCount += 1;
      map[invKey].totalHeldQty += Number(row.holdQty || 0);
      map[invKey].totalHeldValue += Number(row.heldAmount || 0);
      map[invKey].totalOrderAmount += Number(row.totalOrderAmount || 0);
      map[invKey].items.push(row);
    });
    return Object.values(map).sort((a, b) => b.totalHeldValue - a.totalHeldValue);
  }, [filteredHoldingRows]);

  // Export to Excel Handler
  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const filterMeta = {
        'Perspective': activePerspective.toUpperCase(),
        'Salesman': selectedSalesman,
        'Customer': selectedCustomer,
        'Gatepass': selectedGatepass,
        'Invoice': selectedInvoice,
        'Date Window': dateFrom || dateTo ? `${dateFrom || 'Start'} to ${dateTo || 'End'}` : 'All Time',
        'Holding Filter': holdingStatusFilter === 'holding_only' ? 'Holding Items Only' : holdingStatusFilter === 'zero_holding' ? 'Dispatched / Zero Hold' : 'All Rows'
      };

      if (activePerspective === 'detailed') {
        const columns: ExcelColumn[] = [
          { header: 'S#', key: 'idx', width: 8, alignment: 'center' },
          { header: 'Gatepass / DC #', key: 'gatepassNo', width: 16 },
          { header: 'Invoice #', key: 'invoiceNo', width: 15 },
          { header: 'Date', key: 'date', width: 14, type: 'date' },
          { header: 'Customer Name', key: 'customerName', width: 26 },
          { header: 'Salesman', key: 'salesman', width: 20 },
          { header: 'Product Description', key: 'productName', width: 32 },
          { header: 'Code', key: 'skuCode', width: 14 },
          { header: 'Warehouse', key: 'warehouse', width: 18 },
          { header: 'Order Qty', key: 'orderQty', width: 12, type: 'number' },
          { header: 'Dispatched Qty', key: 'dispatchedQty', width: 14, type: 'number' },
          { header: 'Held Qty', key: 'holdQty', width: 12, type: 'number' },
          { header: 'Unit Rate (Rs.)', key: 'rate', width: 16, type: 'currency' },
          { header: 'Held Value (Rs.)', key: 'heldAmount', width: 18, type: 'currency' },
          { header: 'Status', key: 'status', width: 14, alignment: 'center' }
        ];

        const exportData = filteredHoldingRows.map((r, i) => ({
          idx: i + 1,
          ...r
        }));

        await exportToExcel({
          fileName: `Holding_Items_Detailed_Report_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Holding Items Audit',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: 'Holding Items & Pending Dispatch Audit Statement',
          filterSummary: filterMeta,
          columns,
          data: exportData,
          theme: 'emerald'
        });
      } else if (activePerspective === 'salesman') {
        const columns: ExcelColumn[] = [
          { header: 'S#', key: 'idx', width: 8, alignment: 'center' },
          { header: 'Salesman Name', key: 'salesman', width: 28 },
          { header: 'Clients Count', key: 'custCount', width: 16, type: 'number' },
          { header: 'Invoices Count', key: 'invCount', width: 16, type: 'number' },
          { header: 'Held Items Count', key: 'itemsCount', width: 18, type: 'number' },
          { header: 'Total Held Quantity', key: 'totalHeldQty', width: 20, type: 'number' },
          { header: 'Total Holding Valuation (Rs.)', key: 'totalHeldValue', width: 26, type: 'currency' }
        ];

        const exportData = salesmanSummary.map((s, i) => ({
          idx: i + 1,
          salesman: s.salesman,
          custCount: s.custCount,
          invCount: s.invCount,
          itemsCount: s.itemsCount,
          totalHeldQty: s.totalHeldQty,
          totalHeldValue: s.totalHeldValue
        }));

        await exportToExcel({
          fileName: `Holding_Items_Salesman_Wise_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Salesman Holding',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: 'Salesman-Wise Holding Inventory Portfolio Statement',
          filterSummary: filterMeta,
          columns,
          data: exportData,
          theme: 'emerald'
        });
      } else if (activePerspective === 'customer') {
        const columns: ExcelColumn[] = [
          { header: 'S#', key: 'idx', width: 8, alignment: 'center' },
          { header: 'Customer / Client Title', key: 'customer', width: 32 },
          { header: 'Gatepasses Involved', key: 'gpCount', width: 18, type: 'number' },
          { header: 'Invoices Count', key: 'invCount', width: 16, type: 'number' },
          { header: 'Held Items Count', key: 'itemsCount', width: 18, type: 'number' },
          { header: 'Total Held Quantity', key: 'totalHeldQty', width: 20, type: 'number' },
          { header: 'Total Holding Value (Rs.)', key: 'totalHeldValue', width: 26, type: 'currency' }
        ];

        const exportData = customerSummary.map((c, i) => ({
          idx: i + 1,
          customer: c.customer,
          gpCount: c.gpCount,
          invCount: c.invCount,
          itemsCount: c.itemsCount,
          totalHeldQty: c.totalHeldQty,
          totalHeldValue: c.totalHeldValue
        }));

        await exportToExcel({
          fileName: `Holding_Items_Customer_Wise_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Customer Holding',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: 'Customer-Wise Holding Stock Allocation Report',
          filterSummary: filterMeta,
          columns,
          data: exportData,
          theme: 'emerald'
        });
      } else if (activePerspective === 'gatepass') {
        const columns: ExcelColumn[] = [
          { header: 'S#', key: 'idx', width: 8, alignment: 'center' },
          { header: 'Gatepass / DC #', key: 'gatepassNo', width: 18 },
          { header: 'Date', key: 'date', width: 14, type: 'date' },
          { header: 'Customer Name', key: 'customer', width: 26 },
          { header: 'Salesman', key: 'salesman', width: 20 },
          { header: 'Total Order Qty', key: 'totalOrderQty', width: 16, type: 'number' },
          { header: 'Dispatched Qty', key: 'totalDispatchedQty', width: 16, type: 'number' },
          { header: 'Held Qty', key: 'totalHeldQty', width: 14, type: 'number' },
          { header: 'Held Value (Rs.)', key: 'totalHeldValue', width: 20, type: 'currency' },
          { header: 'Status', key: 'status', width: 15, alignment: 'center' }
        ];

        const exportData = gatepassSummary.map((g, i) => ({
          idx: i + 1,
          ...g
        }));

        await exportToExcel({
          fileName: `Holding_Items_Gatepass_Wise_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Gatepass Holding',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: 'Gatepass / Delivery Challan Holding Stock Audit',
          filterSummary: filterMeta,
          columns,
          data: exportData,
          theme: 'emerald'
        });
      } else if (activePerspective === 'invoice') {
        const columns: ExcelColumn[] = [
          { header: 'S#', key: 'idx', width: 8, alignment: 'center' },
          { header: 'Invoice #', key: 'invoiceNo', width: 18 },
          { header: 'Date', key: 'date', width: 14, type: 'date' },
          { header: 'Customer Name', key: 'customer', width: 26 },
          { header: 'Salesman', key: 'salesman', width: 20 },
          { header: 'Held Items Count', key: 'itemsCount', width: 16, type: 'number' },
          { header: 'Total Held Quantity', key: 'totalHeldQty', width: 18, type: 'number' },
          { header: 'Held Valuation (Rs.)', key: 'totalHeldValue', width: 22, type: 'currency' }
        ];

        const exportData = invoiceSummary.map((inv, i) => ({
          idx: i + 1,
          ...inv
        }));

        await exportToExcel({
          fileName: `Holding_Items_Invoice_Wise_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Invoice Holding',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: 'Invoice-Wise Holding Inventory Statement',
          filterSummary: filterMeta,
          columns,
          data: exportData,
          theme: 'emerald'
        });
      }

      toast.success('Excel workbook exported successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Print Handler
  const handlePrint = () => {
    navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/Holding-Report/Print`, {
      state: {
        perspective: activePerspective,
        filters: {
          salesman: selectedSalesman,
          customer: selectedCustomer,
          gatepass: selectedGatepass,
          invoice: selectedInvoice,
          holdingStatus: holdingStatusFilter,
          dateFrom,
          dateTo,
          minAmount,
          sortBy
        },
        rows: activePerspective === 'detailed'
          ? filteredHoldingRows
          : activePerspective === 'salesman'
          ? salesmanSummary
          : activePerspective === 'customer'
          ? customerSummary
          : activePerspective === 'gatepass'
          ? gatepassSummary
          : invoiceSummary,
        kpis
      }
    });
  };

  // Paginated Data
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredHoldingRows.slice(startIndex, startIndex + pageSize);
  }, [filteredHoldingRows, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredHoldingRows.length / pageSize) || 1;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const kpiQtyParts = getQtyOptionBParts(kpis.totalHeldQty);

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 text-slate-800 dark:text-slate-100 text-xs antialiased font-sans pb-12">
      
      {/* ── TOP HEADER WITH FLOATING ACTION BUTTONS ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-emerald-900 to-emerald-800 dark:from-emerald-950 dark:to-emerald-900 p-6 rounded-2xl shadow-lg relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-emerald-600/20 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute left-1/4 -bottom-10 w-48 h-48 bg-emerald-400/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-white/10 text-emerald-100 font-bold backdrop-blur-sm border border-white/10 shadow-sm">
              <MdPauseCircleFilled size={24} />
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Holding Inventory & Commitment Center
            </h1>
          </div>
          <p className="text-[13px] text-emerald-100/70 mt-2 max-w-xl leading-relaxed">
            Real-time committed stock held at warehouses across Salesmen, Customers, Gatepasses & Invoices.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={loadHoldingData}
            title="Refresh dataset"
            className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all shadow-sm hover:shadow-md cursor-pointer flex items-center gap-1.5 backdrop-blur-sm border border-white/10"
          >
            <MdRefresh size={20} />
          </button>

          <button
            type="button"
            disabled={exporting || filteredHoldingRows.length === 0}
            onClick={handleExportExcel}
            className="px-5 py-3 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl font-black text-[13px] transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-2"
          >
            <MdFileDownload size={20} className="text-emerald-600" />
            <span>{exporting ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={filteredHoldingRows.length === 0}
            className="px-5 py-3 bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl font-black text-[13px] transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-2 border border-slate-800"
          >
            <MdPrint size={20} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* ── TOP 4 EXECUTIVE KPI SUMMARY CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-[#111827] dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
          <div>
            <span className="text-slate-400 font-bold block uppercase text-[10px] tracking-wider mb-1">Total Held Quantity</span>
            <div className="flex items-baseline gap-1.5 mt-0.5 block">
              <b className="text-slate-800 dark:text-slate-100 text-2xl font-black font-mono tracking-tight">
                {kpiQtyParts.main}
              </b>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 font-sans tracking-tight">
                {kpiQtyParts.unit}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="flex items-center text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded-md">Across</span>
              <span className="text-[11px] text-slate-400">{kpis.totalItems} distinct items</span>
            </div>
          </div>
          <div className="p-3.5 bg-amber-50 dark:bg-amber-500/10 rounded-2xl text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform shadow-sm">
            <MdInventory size={28} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-[#111827] dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
          <div>
            <span className="text-slate-400 font-bold block uppercase text-[10px] tracking-wider mb-1">Financial Holding Value</span>
            <b className="text-slate-800 dark:text-slate-100 text-2xl font-black font-mono tracking-tight block mt-0.5">
              Rs. {Number(kpis.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </b>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-md">Committed</span>
              <span className="text-[11px] text-slate-400">inventory cost</span>
            </div>
          </div>
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform shadow-sm">
            <MdAttachMoney size={28} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-[#111827] dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
          <div>
            <span className="text-slate-400 font-bold block uppercase text-[10px] tracking-wider mb-1">Affected DCs / Invoices</span>
            <b className="text-slate-800 dark:text-slate-100 text-2xl font-black font-mono tracking-tight block mt-0.5">
              {kpis.uniqueGatepasses} GPs / {kpis.uniqueInvoices} Invs
            </b>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="flex items-center text-[10px] font-bold text-teal-600 bg-teal-50 dark:bg-teal-500/10 px-1.5 py-0.5 rounded-md">Pending</span>
              <span className="text-[11px] text-slate-400">dispatch orders</span>
            </div>
          </div>
          <div className="p-3.5 bg-teal-50 dark:bg-teal-500/10 rounded-2xl text-teal-600 dark:text-teal-400 group-hover:scale-110 transition-transform shadow-sm">
            <MdLocalShipping size={28} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-[#111827] dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
          <div>
            <span className="text-slate-400 font-bold block uppercase text-[10px] tracking-wider mb-1">Sales Officers & Clients</span>
            <b className="text-slate-800 dark:text-slate-100 text-2xl font-black font-mono tracking-tight block mt-0.5">
              {kpis.uniqueSalesmen} Reps / {kpis.uniqueCustomers} Cust
            </b>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="flex items-center text-[10px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-500/10 px-1.5 py-0.5 rounded-md">Assigned</span>
              <span className="text-[11px] text-slate-400">holding portfolios</span>
            </div>
          </div>
          <div className="p-3.5 bg-purple-50 dark:bg-purple-500/10 rounded-2xl text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform shadow-sm">
            <MdPeople size={28} />
          </div>
        </div>
      </div>

      {/* ── 5 PERSPECTIVE TAB HEADERS ── */}
      <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-800 gap-1 bg-white dark:bg-[#111827] p-1.5 rounded-2xl shadow-sm font-bold text-xs">
        <button
          type="button"
          onClick={() => { setActivePerspective('detailed'); setCurrentPage(1); }}
          className={`py-2.5 px-4 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
            activePerspective === 'detailed'
              ? 'bg-emerald-600 text-white font-bold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MdInventory size={16} />
          <span>Itemized Detailed View ({filteredHoldingRows.length})</span>
        </button>

        <button
          type="button"
          onClick={() => { setActivePerspective('salesman'); setCurrentPage(1); }}
          className={`py-2.5 px-4 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
            activePerspective === 'salesman'
              ? 'bg-emerald-600 text-white font-bold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MdPeople size={16} />
          <span>Salesman-Wise Holding ({salesmanSummary.length})</span>
        </button>

        <button
          type="button"
          onClick={() => { setActivePerspective('customer'); setCurrentPage(1); }}
          className={`py-2.5 px-4 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
            activePerspective === 'customer'
              ? 'bg-emerald-600 text-white font-bold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MdPeople size={16} />
          <span>Customer-Wise Allocation ({customerSummary.length})</span>
        </button>

        <button
          type="button"
          onClick={() => { setActivePerspective('gatepass'); setCurrentPage(1); }}
          className={`py-2.5 px-4 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
            activePerspective === 'gatepass'
              ? 'bg-emerald-600 text-white font-bold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MdLocalShipping size={16} />
          <span>Gatepass / Challan-Wise ({gatepassSummary.length})</span>
        </button>

        <button
          type="button"
          onClick={() => { setActivePerspective('invoice'); setCurrentPage(1); }}
          className={`py-2.5 px-4 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
            activePerspective === 'invoice'
              ? 'bg-emerald-600 text-white font-bold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MdReceipt size={16} />
          <span>Invoice-Wise Valuation ({invoiceSummary.length})</span>
        </button>
      </div>

      {/* ── SMART COMPACT FILTER SYSTEM WITH SEARCHABLE TYPE-AHEAD DROPDOWNS ── */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-4 space-y-3">
        {/* ROW 1: PROMINENT SEARCH + PRIMARY SEARCHABLE DROPDOWNS + ADVANCED TOGGLE */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Main Search Input */}
          <div className="relative flex-1 w-full">
            <MdSearch size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product item, SKU, customer name, salesman, GP #, or Invoice #..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 font-medium text-xs outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <MdClear size={16} />
              </button>
            )}
          </div>

          {/* Searchable Salesman Filter */}
          <SearchableDropdown
            className="w-full sm:w-48"
            placeholder="Salesman"
            options={salesmenList}
            value={selectedSalesman}
            onChange={setSelectedSalesman}
          />

          {/* Searchable Customer Filter */}
          <SearchableDropdown
            className="w-full sm:w-48"
            placeholder="Customer"
            options={customersList}
            value={selectedCustomer}
            onChange={setSelectedCustomer}
          />

          {/* Advanced Filters Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`px-4 py-2.5 rounded-xl border font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              showAdvancedFilters || activeFilterCount > 0
                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            <MdTune size={16} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-mono text-[10px] flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Reset Filters Link */}
          {(activeFilterCount > 0 || searchQuery) && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-rose-500 hover:underline font-bold text-xs cursor-pointer shrink-0"
            >
              Reset
            </button>
          )}
        </div>

        {/* EXPANDABLE ADVANCED FILTERS DRAWER */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/60 dark:bg-slate-800/30 p-3.5 rounded-xl">
            {/* Searchable Gatepass Filter */}
            <SearchableDropdown
              label="Gatepass / DC #:"
              placeholder="Gatepass"
              options={gatepassesList}
              value={selectedGatepass}
              onChange={setSelectedGatepass}
            />

            {/* Searchable Invoice Filter */}
            <SearchableDropdown
              label="Invoice No. Wise:"
              placeholder="Invoice"
              options={invoicesList}
              value={selectedInvoice}
              onChange={setSelectedInvoice}
            />

            {/* Holding Status Filter */}
            <div>
              <label className="block font-bold text-slate-500 dark:text-slate-400 text-[11px] mb-1">Holding Status Filter:</label>
              <select
                value={holdingStatusFilter}
                onChange={(e: any) => setHoldingStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 font-bold text-xs text-amber-600 dark:text-amber-400 outline-none"
              >
                <option value="holding_only">Holding Only (Hold Qty &gt; 0)</option>
                <option value="all">All Rows (Including Dispatched)</option>
                <option value="zero_holding">Fully Dispatched (Zero Hold)</option>
              </select>
            </div>

            {/* Min Held Amount */}
            <div>
              <label className="block font-bold text-slate-500 dark:text-slate-400 text-[11px] mb-1">Min Held Amount (Rs.):</label>
              <input
                type="number"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 font-mono text-xs text-slate-700 dark:text-slate-200 outline-none"
              />
            </div>

            {/* Date From */}
            <div>
              <label className="block font-bold text-slate-500 dark:text-slate-400 text-[11px] mb-1">Date Bracket From:</label>
              <input
                type="date"
                max={new Date().toISOString().split('T')[0]}
                value={dateFrom}
                onChange={(e) => {
                  const today = new Date().toISOString().split('T')[0];
                  if (e.target.value > today) setDateFrom(today);
                  else setDateFrom(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 font-mono text-xs text-slate-700 dark:text-slate-200 outline-none"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block font-bold text-slate-500 dark:text-slate-400 text-[11px] mb-1">Date Bracket To:</label>
              <input
                type="date"
                max={new Date().toISOString().split('T')[0]}
                value={dateTo}
                onChange={(e) => {
                  const today = new Date().toISOString().split('T')[0];
                  if (e.target.value > today) setDateTo(today);
                  else setDateTo(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 font-mono text-xs text-slate-700 dark:text-slate-200 outline-none"
              />
            </div>

            {/* Sort By */}
            <div>
              <label className="block font-bold text-slate-500 dark:text-slate-400 text-[11px] mb-1">Sort By Metric:</label>
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 font-medium text-xs text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="amount_desc">Highest Holding Value (Rs.)</option>
                <option value="amount_asc">Lowest Holding Value (Rs.)</option>
                <option value="qty_desc">Highest Held Quantity</option>
                <option value="date_desc">Latest Date First</option>
                <option value="date_asc">Oldest Date First</option>
              </select>
            </div>

            {/* Quick Date Presets */}
            <div className="flex flex-col justify-end">
              <label className="block font-bold text-slate-500 dark:text-slate-400 text-[11px] mb-1">Quick Date Presets:</label>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setQuickDateRange('today')} className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-600 hover:border-emerald-500">Today</button>
                <button type="button" onClick={() => setQuickDateRange('yesterday')} className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-600 hover:border-emerald-500">Yesterday</button>
                <button type="button" onClick={() => setQuickDateRange('this_week')} className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-600 hover:border-emerald-500">This Week</button>
                <button type="button" onClick={() => setQuickDateRange('this_month')} className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-600 hover:border-emerald-500">This Month</button>
                <button type="button" onClick={() => setQuickDateRange('all_time')} className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-600 hover:border-emerald-500">All Time</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN AUDIT DATATABLE / GROUPED VIEWS CONTAINER ── */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-5 space-y-4">
        
        {/* Results summary bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-200">
            Showing <strong className="text-emerald-600 font-mono">{filteredHoldingRows.length}</strong> holding records matching search criteria
          </span>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-bold text-xs outline-none"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* 1. DETAILED ITMES VIEW */}
        {activePerspective === 'detailed' && (
          <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full table-auto border-collapse font-sans text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700 text-left text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3.5 text-center w-12">S#</th>
                  <th className="py-3 px-3.5">Gatepass / DC</th>
                  <th className="py-3 px-3.5">Invoice #</th>
                  <th className="py-3 px-3.5">Date</th>
                  <th className="py-3 px-3.5">Customer Name</th>
                  <th className="py-3 px-3.5">Salesman</th>
                  <th className="py-3 px-3.5">Product Description</th>
                  <th className="py-3 px-3.5">Warehouse</th>
                  <th className="py-3 px-3.5 text-center">Order Qty</th>
                  <th className="py-3 px-3.5 text-center">Dispatched</th>
                  <th className="py-3 px-3.5 text-center bg-amber-50/70 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400">Held Qty</th>
                  <th className="py-3 px-3.5 text-right">Rate</th>
                  <th className="py-3 px-3.5 text-right font-black bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400">Held Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedRows.length > 0 ? (
                  paginatedRows.map((row, idx) => {
                    const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3.5 text-center text-slate-400 font-mono">{globalIdx}</td>
                        <td className="py-3 px-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">{row.gatepassNo}</td>
                        <td className="py-3 px-3.5 font-mono font-bold text-slate-700 dark:text-slate-300">{row.invoiceNo}</td>
                        <td className="py-3 px-3.5 text-slate-500 font-mono text-[11px]">{row.date}</td>
                        <td className="py-3 px-3.5 font-bold text-slate-900 dark:text-white max-w-[150px] truncate" title={row.customerName}>
                          {row.customerName}
                        </td>
                        <td className="py-3 px-3.5 text-slate-600 dark:text-slate-300">{row.salesman}</td>
                        <td className="py-3 px-3.5 font-medium text-slate-800 dark:text-slate-100 max-w-[180px] truncate" title={row.productName}>
                          {row.productName}
                          {row.skuCode && <div className="text-[10px] font-mono text-slate-400">{row.skuCode}</div>}
                        </td>
                        <td className="py-3 px-3.5 text-slate-500">{row.warehouse}</td>
                        <td className="py-3 px-3.5 text-center font-mono font-semibold">{renderQtyBadge(row.orderQty, row.uom)}</td>
                        <td className="py-3 px-3.5 text-center font-mono text-slate-400">{renderQtyBadge(row.dispatchedQty, row.uom)}</td>
                        <td className="py-3 px-3.5 text-center font-mono font-black bg-amber-50/50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400">
                          {renderQtyBadge(row.holdQty, row.uom)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-slate-500">
                          Rs. {Number(row.rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20">
                          Rs. {Number(row.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-400 italic">
                      No holding records match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. SALESMAN-WISE ACCORDION SUMMARY VIEW */}
        {activePerspective === 'salesman' && (
          <div className="space-y-3">
            {salesmanSummary.length > 0 ? (
              salesmanSummary.map((s) => {
                const groupKey = `sm-${s.salesman}`;
                const isExpanded = Boolean(expandedGroupKeys[groupKey]);
                const sQtyParts = getQtyOptionBParts(s.totalHeldQty);
                return (
                  <div key={s.salesman} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleGroupExpand(groupKey)}
                      className="p-4 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 flex flex-wrap items-center justify-between gap-4 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {isExpanded ? <MdKeyboardArrowDown size={20} /> : <MdKeyboardArrowRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-600/10 text-emerald-600 font-bold flex items-center justify-center">
                          <MdPerson size={18} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm">{s.salesman}</h4>
                          <span className="text-[11px] text-slate-400">
                            {s.custCount} Customers • {s.invCount} Invoices • {s.itemsCount} Held Line Items
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block font-bold">Total Held Qty</span>
                          <div className="flex items-baseline gap-1 justify-end">
                            <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">{sQtyParts.main}</span>
                            <span className="text-[10px] font-sans font-bold text-amber-600/70 dark:text-amber-400/70">{sQtyParts.unit}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block font-bold">Total Holding Value</span>
                          <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                            Rs. {Number(s.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
                        <table className="w-full table-auto border-collapse font-sans text-xs">
                          <thead>
                            <tr className="text-slate-400 font-bold text-left text-[10px] uppercase border-b border-slate-100 dark:border-slate-800">
                              <th className="py-2 px-3">Gatepass</th>
                              <th className="py-2 px-3">Invoice #</th>
                              <th className="py-2 px-3">Customer</th>
                              <th className="py-2 px-3">Product</th>
                              <th className="py-2 px-3 text-center">Held Qty</th>
                              <th className="py-2 px-3 text-right">Held Value (Rs.)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {s.items.map(item => (
                              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <td className="py-2 px-3 font-mono font-bold text-emerald-600">{item.gatepassNo}</td>
                                <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">{item.invoiceNo}</td>
                                <td className="py-2 px-3 font-bold text-slate-800 dark:text-white">{item.customerName}</td>
                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{item.productName}</td>
                                <td className="py-2 px-3 text-center font-mono font-bold text-amber-600">{renderQtyBadge(item.holdQty, item.uom)}</td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                                  Rs. {Number(item.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-400 italic">No salesman holding items found.</div>
            )}
          </div>
        )}

        {/* 3. CUSTOMER-WISE ACCORDION SUMMARY VIEW */}
        {activePerspective === 'customer' && (
          <div className="space-y-3">
            {customerSummary.length > 0 ? (
              customerSummary.map((c) => {
                const groupKey = `cust-${c.customer}`;
                const isExpanded = Boolean(expandedGroupKeys[groupKey]);
                const cQtyParts = getQtyOptionBParts(c.totalHeldQty);
                return (
                  <div key={c.customer} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleGroupExpand(groupKey)}
                      className="p-4 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 flex flex-wrap items-center justify-between gap-4 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {isExpanded ? <MdKeyboardArrowDown size={20} /> : <MdKeyboardArrowRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-teal-600/10 text-teal-600 font-bold flex items-center justify-center">
                          <MdPeople size={18} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm">{c.customer}</h4>
                          <span className="text-[11px] text-slate-400">
                            {c.gpCount} Gatepasses • {c.invCount} Invoices • {c.itemsCount} Held Line Items
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block font-bold">Total Held Qty</span>
                          <div className="flex items-baseline gap-1 justify-end">
                            <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">{cQtyParts.main}</span>
                            <span className="text-[10px] font-sans font-bold text-amber-600/70 dark:text-amber-400/70">{cQtyParts.unit}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block font-bold">Total Holding Value</span>
                          <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                            Rs. {Number(c.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
                        <table className="w-full table-auto border-collapse font-sans text-xs">
                          <thead>
                            <tr className="text-slate-400 font-bold text-left text-[10px] uppercase border-b border-slate-100 dark:border-slate-800">
                              <th className="py-2 px-3">Gatepass</th>
                              <th className="py-2 px-3">Invoice #</th>
                              <th className="py-2 px-3">Salesman</th>
                              <th className="py-2 px-3">Product Description</th>
                              <th className="py-2 px-3 text-center">Held Qty</th>
                              <th className="py-2 px-3 text-right">Held Value (Rs.)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {c.items.map(item => (
                              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <td className="py-2 px-3 font-mono font-bold text-emerald-600">{item.gatepassNo}</td>
                                <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">{item.invoiceNo}</td>
                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{item.salesman}</td>
                                <td className="py-2 px-3 font-bold text-slate-800 dark:text-white">{item.productName}</td>
                                <td className="py-2 px-3 text-center font-mono font-bold text-amber-600">{renderQtyBadge(item.holdQty, item.uom)}</td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                                  Rs. {Number(item.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-400 italic">No customer holding items found.</div>
            )}
          </div>
        )}

        {/* 4. GATEPASS-WISE ACCORDION SUMMARY VIEW */}
        {activePerspective === 'gatepass' && (
          <div className="space-y-3">
            {gatepassSummary.length > 0 ? (
              gatepassSummary.map((g) => {
                const groupKey = `gp-${g.gatepassNo}`;
                const isExpanded = Boolean(expandedGroupKeys[groupKey]);
                const gQtyParts = getQtyOptionBParts(g.totalHeldQty);
                return (
                  <div key={g.gatepassNo} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleGroupExpand(groupKey)}
                      className="p-4 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 flex flex-wrap items-center justify-between gap-4 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {isExpanded ? <MdKeyboardArrowDown size={20} /> : <MdKeyboardArrowRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 font-bold flex items-center justify-center">
                          <MdLocalShipping size={18} />
                        </div>
                        <div>
                          <h4 className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">{g.gatepassNo}</h4>
                          <span className="text-[11px] text-slate-400">
                            Customer: <strong className="text-slate-700 dark:text-slate-200">{g.customer}</strong> • Salesman: {g.salesman} • Date: {g.date}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block font-bold">Held Qty</span>
                          <div className="flex items-baseline gap-1 justify-end">
                            <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">{gQtyParts.main}</span>
                            <span className="text-[10px] font-sans font-bold text-amber-600/70 dark:text-amber-400/70">{gQtyParts.unit}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block font-bold">Held Value</span>
                          <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                            Rs. {Number(g.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
                        <table className="w-full table-auto border-collapse font-sans text-xs">
                          <thead>
                            <tr className="text-slate-400 font-bold text-left text-[10px] uppercase border-b border-slate-100 dark:border-slate-800">
                              <th className="py-2 px-3">Product Description</th>
                              <th className="py-2 px-3">Warehouse</th>
                              <th className="py-2 px-3 text-center">Order Qty</th>
                              <th className="py-2 px-3 text-center">Dispatched Qty</th>
                              <th className="py-2 px-3 text-center">Held Qty</th>
                              <th className="py-2 px-3 text-right">Held Value (Rs.)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {g.items.map(item => (
                              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <td className="py-2 px-3 font-bold text-slate-800 dark:text-white">{item.productName}</td>
                                <td className="py-2 px-3 text-slate-500">{item.warehouse}</td>
                                <td className="py-2 px-3 text-center font-mono">{renderQtyBadge(item.orderQty, item.uom)}</td>
                                <td className="py-2 px-3 text-center font-mono text-slate-400">{renderQtyBadge(item.dispatchedQty, item.uom)}</td>
                                <td className="py-2 px-3 text-center font-mono font-bold text-amber-600">{renderQtyBadge(item.holdQty, item.uom)}</td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                                  Rs. {Number(item.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-400 italic">No gatepass holding records found.</div>
            )}
          </div>
        )}

        {/* 5. INVOICE-WISE ACCORDION SUMMARY VIEW */}
        {activePerspective === 'invoice' && (
          <div className="space-y-3">
            {invoiceSummary.length > 0 ? (
              invoiceSummary.map((inv) => {
                const groupKey = `inv-${inv.invoiceNo}`;
                const isExpanded = Boolean(expandedGroupKeys[groupKey]);
                const invQtyParts = getQtyOptionBParts(inv.totalHeldQty);
                return (
                  <div key={inv.invoiceNo} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div
                      onClick={() => toggleGroupExpand(groupKey)}
                      className="p-4 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 flex flex-wrap items-center justify-between gap-4 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          {isExpanded ? <MdKeyboardArrowDown size={20} /> : <MdKeyboardArrowRight size={20} />}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-purple-600/10 text-purple-600 font-bold flex items-center justify-center">
                          <MdReceipt size={18} />
                        </div>
                        <div>
                          <h4 className="font-mono font-bold text-slate-900 dark:text-white text-sm">{inv.invoiceNo}</h4>
                          <span className="text-[11px] text-slate-400">
                            Customer: <strong className="text-slate-700 dark:text-slate-200">{inv.customer}</strong> • Salesman: {inv.salesman} • Date: {inv.date}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block font-bold">Held Qty</span>
                          <div className="flex items-baseline gap-1 justify-end">
                            <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">{invQtyParts.main}</span>
                            <span className="text-[10px] font-sans font-bold text-amber-600/70 dark:text-amber-400/70">{invQtyParts.unit}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block font-bold">Held Valuation</span>
                          <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                            Rs. {Number(inv.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-3 bg-white dark:bg-[#111827] border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
                        <table className="w-full table-auto border-collapse font-sans text-xs">
                          <thead>
                            <tr className="text-slate-400 font-bold text-left text-[10px] uppercase border-b border-slate-100 dark:border-slate-800">
                              <th className="py-2 px-3">Product Description</th>
                              <th className="py-2 px-3">Warehouse</th>
                              <th className="py-2 px-3 text-center">Order Qty</th>
                              <th className="py-2 px-3 text-center">Dispatched Qty</th>
                              <th className="py-2 px-3 text-center">Held Qty</th>
                              <th className="py-2 px-3 text-right">Held Value (Rs.)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {inv.items.map(item => (
                              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <td className="py-2 px-3 font-bold text-slate-800 dark:text-white">{item.productName}</td>
                                <td className="py-2 px-3 text-slate-500">{item.warehouse}</td>
                                <td className="py-2 px-3 text-center font-mono">{renderQtyBadge(item.orderQty, item.uom)}</td>
                                <td className="py-2 px-3 text-center font-mono text-slate-400">{renderQtyBadge(item.dispatchedQty, item.uom)}</td>
                                <td className="py-2 px-3 text-center font-mono font-bold text-amber-600">{renderQtyBadge(item.holdQty, item.uom)}</td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                                  Rs. {Number(item.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-400 italic">No invoice holding records found.</div>
            )}
          </div>
        )}

        {/* PAGINATION FOOTER */}
        {activePerspective === 'detailed' && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-400">
              Page <strong className="text-slate-800 dark:text-slate-100">{currentPage}</strong> of <strong>{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1.5 font-bold">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Next
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default HoldingReport;
