import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { MdPrint, MdArrowBack, MdFileDownload, MdViewList, MdOutlineTableRows } from 'react-icons/md';
import { QtyBadge } from '../../../utils/QtyBadge';
import { useAuth } from '../../../Context/Auth';
import { exportToExcel, ExcelColumn } from '../../../utils/excelExport';
import ReportPagination from '../../../components/ReportPagination';
import { supabase } from '../../../Context/supabaseClient';
import Spinner from '../../../ui/Spinner';

interface HoldingItemRow {
  id: string;
  dcId: number;
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
  heldAmount: number;
  date: string;
  status: string;
  uom: string;
}

const HoldingReportPrint: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { businessName, tenantId } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(25);
  const [isPrinting, setIsPrinting] = useState(false);
  const [loading, setLoading] = useState(false);

  const stateData = location.state || {};
  const initialPerspective = stateData.perspective || 'detailed';
  const rawFilters = stateData.filters || stateData.criteria || {};

  const [activePerspective, setActivePerspective] = useState<string>(initialPerspective);
  const [fetchedRows, setFetchedRows] = useState<HoldingItemRow[]>(stateData.rows || []);

  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'NHT ENTERPRISES (Noor Horizon Technologies)';

    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      document.title = originalTitle;
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  // Self-fetch holding data if not provided in location.state
  useEffect(() => {
    if (stateData.rows && stateData.rows.length > 0) {
      setFetchedRows(stateData.rows);
      return;
    }

    const loadData = async () => {
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

        // Create lookup map for invoices
        const invMap: Record<string, any> = {};
        invoices.forEach(inv => {
          const key1 = String(inv.id).trim().toLowerCase();
          const key2 = `inv-${key1}`;
          invMap[key1] = inv;
          invMap[key2] = inv;
        });

        const extractedRows: HoldingItemRow[] = [];

        dcs.forEach(dc => {
          const rawInvCode = String(dc.invoice_no || '').trim().replace(/^inv-/i, '').toLowerCase();
          const linkedInv = invMap[rawInvCode] || invMap[String(dc.invoice_no || '').trim().toLowerCase()];

          const gatepassCode = dc.challan_no || `DC-${String(dc.id).padStart(4, '0')}`;
          const invoiceCode = dc.invoice_no || (linkedInv?.id ? `INV-${String(linkedInv.id).padStart(4, '0')}` : 'Direct');
          const custName = dc.customer_name || linkedInv?.customer_name || 'Counter Buyer';
          const smName = linkedInv?.salesman || dc.salesman || 'Direct';
          const docDate = dc.challan_date || dc.dc_date || linkedInv?.sale_date || String(dc.created_at || '').split('T')[0];

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

        // Apply filters from criteria
        const filtered = extractedRows.filter(row => {
          // Date Filter
          if (rawFilters.dateFrom && row.date < rawFilters.dateFrom) return false;
          if (rawFilters.dateTo && row.date > rawFilters.dateTo) return false;

          // Customer filter
          if (rawFilters.customer && rawFilters.customer.length > 0) {
            const custArr = Array.isArray(rawFilters.customer) ? rawFilters.customer : [rawFilters.customer];
            if (!custArr.includes('All') && custArr.length > 0) {
              const matches = custArr.some((c: string) => {
                const cleanC = c.replace(/^\[.*?\]\s*/, '').trim().toLowerCase();
                return row.customerName.toLowerCase().includes(cleanC);
              });
              if (!matches) return false;
            }
          }

          // Warehouse / Location filter
          if (rawFilters.location && rawFilters.location.length > 0) {
            const locArr = Array.isArray(rawFilters.location) ? rawFilters.location : [rawFilters.location];
            if (!locArr.includes('All') && locArr.length > 0) {
              const matches = locArr.some((l: string) => row.warehouse.toLowerCase().includes(l.toLowerCase()));
              if (!matches) return false;
            }
          }

          // Salesman filter
          if (rawFilters.salesman && rawFilters.salesman.length > 0) {
            const smArr = Array.isArray(rawFilters.salesman) ? rawFilters.salesman : [rawFilters.salesman];
            if (!smArr.includes('All') && smArr.length > 0) {
              const matches = smArr.some((s: string) => row.salesman.toLowerCase().includes(s.toLowerCase()));
              if (!matches) return false;
            }
          }

          // Holding only by default
          if (row.holdQty <= 0) return false;

          return true;
        });

        setFetchedRows(filtered);
      } catch (err: any) {
        console.error('Error fetching holding data in print view:', err);
        toast.error('Failed to load holding items: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Compute perspectives dynamically
  const { displayRows, kpis } = useMemo(() => {
    const rawList = fetchedRows;

    let totalHeldQty = 0;
    let totalHeldValue = 0;
    let totalOrderQty = 0;
    let totalOrderValue = 0;
    const affectedGPs = new Set<string>();
    const affectedInvs = new Set<string>();
    const affectedCusts = new Set<string>();
    const affectedSMs = new Set<string>();

    rawList.forEach(row => {
      totalHeldQty += Number(row.holdQty || 0);
      totalHeldValue += Number(row.heldAmount || 0);
      totalOrderQty += Number(row.orderQty || 0);
      totalOrderValue += Number(row.totalOrderAmount || 0);
      if (row.gatepassNo) affectedGPs.add(row.gatepassNo);
      if (row.invoiceNo) affectedInvs.add(row.invoiceNo);
      if (row.customerName) affectedCusts.add(row.customerName);
      if (row.salesman) affectedSMs.add(row.salesman);
    });

    const calculatedKpis = {
      totalItems: rawList.length,
      totalHeldQty,
      totalHeldValue,
      totalOrderQty,
      totalOrderValue,
      uniqueGatepasses: affectedGPs.size,
      uniqueInvoices: affectedInvs.size,
      uniqueCustomers: affectedCusts.size,
      uniqueSalesmen: affectedSMs.size
    };

    if (activePerspective === 'salesman') {
      const map: Record<string, any> = {};
      rawList.forEach(row => {
        const smKey = row.salesman || 'Unassigned';
        if (!map[smKey]) {
          map[smKey] = {
            salesman: smKey,
            itemsCount: 0,
            totalHeldQty: 0,
            totalHeldValue: 0,
            totalOrderQty: 0,
            totalDispatchedQty: 0,
            custSet: new Set(),
            invSet: new Set(),
            gpSet: new Set(),
            docMap: {}
          };
        }
        map[smKey].itemsCount += 1;
        map[smKey].totalHeldQty += Number(row.holdQty || 0);
        map[smKey].totalHeldValue += Number(row.heldAmount || 0);
        map[smKey].totalOrderQty += Number(row.orderQty || 0);
        map[smKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
        if (row.customerName) map[smKey].custSet.add(row.customerName);
        if (row.invoiceNo) map[smKey].invSet.add(row.invoiceNo);
        if (row.gatepassNo) map[smKey].gpSet.add(row.gatepassNo);

        const docKey = `${row.gatepassNo || 'GP'}_${row.invoiceNo || 'INV'}_${row.date || ''}_${row.customerName || ''}`;
        if (!map[smKey].docMap[docKey]) {
          map[smKey].docMap[docKey] = {
            id: docKey,
            gatepassNo: row.gatepassNo,
            invoiceNo: row.invoiceNo,
            date: row.date,
            customerName: row.customerName,
            salesman: row.salesman,
            warehouse: row.warehouse,
            totalOrderQty: 0,
            totalDispatchedQty: 0,
            totalHeldQty: 0,
            totalHeldValue: 0,
            items: []
          };
        }
        map[smKey].docMap[docKey].totalOrderQty += Number(row.orderQty || 0);
        map[smKey].docMap[docKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
        map[smKey].docMap[docKey].totalHeldQty += Number(row.holdQty || 0);
        map[smKey].docMap[docKey].totalHeldValue += Number(row.heldAmount || 0);
        map[smKey].docMap[docKey].items.push(row);
      });
      const rows = Object.values(map).map((s: any) => ({
        salesman: s.salesman,
        itemsCount: s.itemsCount,
        totalHeldQty: s.totalHeldQty,
        totalHeldValue: s.totalHeldValue,
        totalOrderQty: s.totalOrderQty,
        totalDispatchedQty: s.totalDispatchedQty,
        customerCount: s.custSet.size,
        invoices: s.invSet.size,
        gatepasses: s.gpSet.size,
        docs: Object.values(s.docMap)
      })).sort((a, b) => b.totalHeldValue - a.totalHeldValue);
      return { displayRows: rows, kpis: calculatedKpis };
    }

    if (activePerspective === 'customer') {
      const map: Record<string, any> = {};
      rawList.forEach(row => {
        const cKey = row.customerName || 'Counter Buyer';
        if (!map[cKey]) {
          map[cKey] = {
            customer: cKey,
            itemsCount: 0,
            totalHeldQty: 0,
            totalHeldValue: 0,
            totalOrderQty: 0,
            totalDispatchedQty: 0,
            gpSet: new Set(),
            invSet: new Set(),
            smSet: new Set(),
            docMap: {}
          };
        }
        map[cKey].itemsCount += 1;
        map[cKey].totalHeldQty += Number(row.holdQty || 0);
        map[cKey].totalHeldValue += Number(row.heldAmount || 0);
        map[cKey].totalOrderQty += Number(row.orderQty || 0);
        map[cKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
        if (row.gatepassNo) map[cKey].gpSet.add(row.gatepassNo);
        if (row.invoiceNo) map[cKey].invSet.add(row.invoiceNo);
        if (row.salesman) map[cKey].smSet.add(row.salesman);

        const docKey = `${row.gatepassNo || 'GP'}_${row.invoiceNo || 'INV'}_${row.date || ''}_${row.salesman || ''}`;
        if (!map[cKey].docMap[docKey]) {
          map[cKey].docMap[docKey] = {
            id: docKey,
            gatepassNo: row.gatepassNo,
            invoiceNo: row.invoiceNo,
            date: row.date,
            customerName: row.customerName,
            salesman: row.salesman,
            warehouse: row.warehouse,
            totalOrderQty: 0,
            totalDispatchedQty: 0,
            totalHeldQty: 0,
            totalHeldValue: 0,
            items: []
          };
        }
        map[cKey].docMap[docKey].totalOrderQty += Number(row.orderQty || 0);
        map[cKey].docMap[docKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
        map[cKey].docMap[docKey].totalHeldQty += Number(row.holdQty || 0);
        map[cKey].docMap[docKey].totalHeldValue += Number(row.heldAmount || 0);
        map[cKey].docMap[docKey].items.push(row);
      });
      const rows = Object.values(map).map((c: any) => ({
        customer: c.customer,
        itemsCount: c.itemsCount,
        totalHeldQty: c.totalHeldQty,
        totalHeldValue: c.totalHeldValue,
        totalOrderQty: c.totalOrderQty,
        totalDispatchedQty: c.totalDispatchedQty,
        gatepasses: c.gpSet.size,
        invoices: c.invSet.size,
        salesmen: c.smSet.size,
        docs: Object.values(c.docMap)
      })).sort((a, b) => b.totalHeldValue - a.totalHeldValue);
      return { displayRows: rows, kpis: calculatedKpis };
    }

    if (activePerspective === 'gatepass') {
      const map: Record<string, any> = {};
      rawList.forEach(row => {
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
            invSet: new Set(),
            docMap: {},
            items: []
          };
        }
        map[gpKey].itemsCount += 1;
        map[gpKey].totalOrderQty += Number(row.orderQty || 0);
        map[gpKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
        map[gpKey].totalHeldQty += Number(row.holdQty || 0);
        map[gpKey].totalHeldValue += Number(row.heldAmount || 0);
        if (row.invoiceNo) map[gpKey].invSet.add(row.invoiceNo);

        const docKey = `${row.invoiceNo || 'INV'}_${row.date || ''}`;
        if (!map[gpKey].docMap[docKey]) {
          map[gpKey].docMap[docKey] = {
            id: docKey,
            invoiceNo: row.invoiceNo,
            date: row.date,
            customerName: row.customerName,
            salesman: row.salesman,
            warehouse: row.warehouse,
            totalOrderQty: 0,
            totalDispatchedQty: 0,
            totalHeldQty: 0,
            totalHeldValue: 0,
            items: []
          };
        }
        map[gpKey].docMap[docKey].totalOrderQty += Number(row.orderQty || 0);
        map[gpKey].docMap[docKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
        map[gpKey].docMap[docKey].totalHeldQty += Number(row.holdQty || 0);
        map[gpKey].docMap[docKey].totalHeldValue += Number(row.heldAmount || 0);
        map[gpKey].docMap[docKey].items.push(row);
        map[gpKey].items.push(row);
      });
      const rows = Object.values(map).map((g: any) => ({
        ...g,
        invoices: g.invSet.size,
        docs: Object.values(g.docMap)
      })).sort((a, b) => b.totalHeldValue - a.totalHeldValue);
      return { displayRows: rows, kpis: calculatedKpis };
    }

    if (activePerspective === 'invoice') {
      const map: Record<string, any> = {};
      rawList.forEach(row => {
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
            totalOrderQty: 0,
            totalDispatchedQty: 0,
            totalOrderAmount: 0,
            gpSet: new Set(),
            docMap: {},
            items: []
          };
        }
        map[invKey].itemsCount += 1;
        map[invKey].totalHeldQty += Number(row.holdQty || 0);
        map[invKey].totalHeldValue += Number(row.heldAmount || 0);
        map[invKey].totalOrderQty += Number(row.orderQty || 0);
        map[invKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
        map[invKey].totalOrderAmount += Number(row.totalOrderAmount || 0);
        if (row.gatepassNo) map[invKey].gpSet.add(row.gatepassNo);

        const docKey = `${row.gatepassNo || 'GP'}_${row.date || ''}`;
        if (!map[invKey].docMap[docKey]) {
          map[invKey].docMap[docKey] = {
            id: docKey,
            gatepassNo: row.gatepassNo,
            date: row.date,
            customerName: row.customerName,
            salesman: row.salesman,
            warehouse: row.warehouse,
            totalOrderQty: 0,
            totalDispatchedQty: 0,
            totalHeldQty: 0,
            totalHeldValue: 0,
            items: []
          };
        }
        map[invKey].docMap[docKey].totalOrderQty += Number(row.orderQty || 0);
        map[invKey].docMap[docKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
        map[invKey].docMap[docKey].totalHeldQty += Number(row.holdQty || 0);
        map[invKey].docMap[docKey].totalHeldValue += Number(row.heldAmount || 0);
        map[invKey].docMap[docKey].items.push(row);
        map[invKey].items.push(row);
      });
      const rows = Object.values(map).map((inv: any) => ({
        ...inv,
        gatepasses: inv.gpSet.size,
        docs: Object.values(inv.docMap)
      })).sort((a, b) => b.totalHeldValue - a.totalHeldValue);
      return { displayRows: rows, kpis: calculatedKpis };
    }

    // Default: Detailed Itemized View (Grouped by Invoice / DC Document with multi-item sub-rows)
    const docMap: Record<string, any> = {};
    rawList.forEach(row => {
      const docKey = `${row.gatepassNo || 'GP'}_${row.invoiceNo || 'INV'}_${row.date || ''}_${row.customerName || ''}`;
      if (!docMap[docKey]) {
        docMap[docKey] = {
          id: docKey,
          gatepassNo: row.gatepassNo,
          invoiceNo: row.invoiceNo,
          date: row.date,
          customerName: row.customerName,
          salesman: row.salesman,
          itemsCount: 0,
          totalOrderQty: 0,
          totalDispatchedQty: 0,
          totalHeldQty: 0,
          totalHeldValue: 0,
          items: []
        };
      }
      docMap[docKey].itemsCount += 1;
      docMap[docKey].totalOrderQty += Number(row.orderQty || 0);
      docMap[docKey].totalDispatchedQty += Number(row.dispatchedQty || 0);
      docMap[docKey].totalHeldQty += Number(row.holdQty || 0);
      docMap[docKey].totalHeldValue += Number(row.heldAmount || 0);
      docMap[docKey].items.push(row);
    });
    const docRows = Object.values(docMap);
    return { displayRows: docRows, kpis: calculatedKpis };
  }, [fetchedRows, activePerspective]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activePerspective]);

  const paginatedRows = useMemo(() => {
    if (isPrinting || pageSize === 'all') return displayRows || [];
    const start = (currentPage - 1) * pageSize;
    return (displayRows || []).slice(start, start + pageSize);
  }, [displayRows, currentPage, pageSize, isPrinting]);

  const startIndex = (currentPage - 1) * (pageSize === 'all' ? 0 : (pageSize as number));

  const perspectiveLabels: Record<string, string> = {
    detailed: 'Detailed Itemized',
    salesman: 'Salesman-Wise',
    customer: 'Customer-Wise',
    gatepass: 'Gatepass-Wise',
    invoice: 'Invoice-Wise'
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const filterMeta = {
        'Perspective': (perspectiveLabels[activePerspective] || activePerspective).toUpperCase(),
        'Date Window': rawFilters.dateFrom || rawFilters.dateTo ? `${rawFilters.dateFrom || 'Start'} to ${rawFilters.dateTo || 'End'}` : 'All Time'
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
          { header: 'Order Qty', key: 'orderQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Dispatched Qty', key: 'dispatchedQty', width: 14, type: 'number', alignment: 'right' },
          { header: 'Held Qty', key: 'holdQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Unit Rate (Rs.)', key: 'rate', width: 16, type: 'currency', alignment: 'right' },
          { header: 'Held Value (Rs.)', key: 'heldAmount', width: 18, type: 'currency', alignment: 'right' }
        ];

        const exportData: any[] = [];
        let globalIdx = 1;

        (displayRows || []).forEach((doc: any) => {
          (doc.items || []).forEach((item: any, itIdx: number) => {
            exportData.push({
              idx: itIdx === 0 ? globalIdx : '',
              gatepassNo: itIdx === 0 ? (doc.gatepassNo || '-') : '',
              invoiceNo: itIdx === 0 ? (doc.invoiceNo || '-') : '',
              date: itIdx === 0 ? (doc.date || '-') : '',
              customerName: itIdx === 0 ? (doc.customerName || '-') : '',
              salesman: itIdx === 0 ? (doc.salesman || '-') : '',
              productName: item.productName || '-',
              skuCode: item.skuCode || '-',
              warehouse: item.warehouse || '-',
              orderQty: Number(item.orderQty || 0),
              dispatchedQty: Number(item.dispatchedQty || 0),
              holdQty: Number(item.holdQty || 0),
              rate: Number(item.rate || 0),
              heldAmount: Number(item.heldAmount || 0)
            });
          });
          globalIdx++;
        });

        await exportToExcel({
          fileName: `Holding_Items_Detailed_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Holding Items',
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
          { header: 'Gatepass / DC #', key: 'gatepassNo', width: 16 },
          { header: 'Invoice #', key: 'invoiceNo', width: 15 },
          { header: 'Date', key: 'date', width: 14, type: 'date' },
          { header: 'Customer Name', key: 'customerName', width: 26 },
          { header: 'Salesman', key: 'salesman', width: 20 },
          { header: 'Product Description', key: 'productName', width: 32 },
          { header: 'Code', key: 'skuCode', width: 14 },
          { header: 'Warehouse', key: 'warehouse', width: 18 },
          { header: 'Order Qty', key: 'orderQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Dispatched Qty', key: 'dispatchedQty', width: 14, type: 'number', alignment: 'right' },
          { header: 'Held Qty', key: 'holdQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Unit Rate (Rs.)', key: 'rate', width: 16, type: 'currency', alignment: 'right' },
          { header: 'Held Value (Rs.)', key: 'heldAmount', width: 18, type: 'currency', alignment: 'right' }
        ];

        const exportData: any[] = [];
        let globalIdx = 1;

        (displayRows || []).forEach((s: any) => {
          // Section header banner for Salesman
          exportData.push({
            isSectionHeader: true,
            sectionTitle: `SALESMAN: ${s.salesman.toUpperCase()} (${s.itemsCount} Items | ${s.customerCount} Clients | ${s.invoices} Invoices | Held: ${Number(s.totalHeldQty || 0).toLocaleString()} Pcs | Rs. ${Number(s.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })})`
          });

          // Itemized rows grouped by document
          (s.docs || []).forEach((doc: any) => {
            (doc.items || []).forEach((item: any, itIdx: number) => {
              exportData.push({
                idx: itIdx === 0 ? globalIdx : '',
                gatepassNo: itIdx === 0 ? (doc.gatepassNo || '-') : '',
                invoiceNo: itIdx === 0 ? (doc.invoiceNo || '-') : '',
                date: itIdx === 0 ? (doc.date || '-') : '',
                customerName: itIdx === 0 ? (doc.customerName || '-') : '',
                salesman: s.salesman,
                productName: item.productName || '-',
                skuCode: item.skuCode || '-',
                warehouse: item.warehouse || '-',
                orderQty: Number(item.orderQty || 0),
                dispatchedQty: Number(item.dispatchedQty || 0),
                holdQty: Number(item.holdQty || 0),
                rate: Number(item.rate || 0),
                heldAmount: Number(item.heldAmount || 0)
              });
            });
            globalIdx++;
          });

          // Salesman Subtotal row
          exportData.push({
            isSubtotal: true,
            productName: `Subtotal for ${s.salesman}:`,
            orderQty: Number(s.totalOrderQty || 0),
            dispatchedQty: Number(s.totalDispatchedQty || 0),
            holdQty: Number(s.totalHeldQty || 0),
            heldAmount: Number(s.totalHeldValue || 0)
          });
        });

        await exportToExcel({
          fileName: `Holding_Salesman_Wise_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Salesman Holding',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: 'Salesman-Wise Holding Inventory & DC/Invoice Audit Statement',
          filterSummary: filterMeta,
          columns,
          data: exportData,
          theme: 'emerald',
          summaryRow: false
        });
      } else if (activePerspective === 'customer') {
        const columns: ExcelColumn[] = [
          { header: 'S#', key: 'idx', width: 8, alignment: 'center' },
          { header: 'Gatepass / DC #', key: 'gatepassNo', width: 16 },
          { header: 'Invoice #', key: 'invoiceNo', width: 15 },
          { header: 'Date', key: 'date', width: 14, type: 'date' },
          { header: 'Salesman', key: 'salesman', width: 20 },
          { header: 'Product Description', key: 'productName', width: 32 },
          { header: 'Code', key: 'skuCode', width: 14 },
          { header: 'Warehouse', key: 'warehouse', width: 18 },
          { header: 'Order Qty', key: 'orderQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Dispatched Qty', key: 'dispatchedQty', width: 14, type: 'number', alignment: 'right' },
          { header: 'Held Qty', key: 'holdQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Unit Rate (Rs.)', key: 'rate', width: 16, type: 'currency', alignment: 'right' },
          { header: 'Held Value (Rs.)', key: 'heldAmount', width: 18, type: 'currency', alignment: 'right' }
        ];

        const exportData: any[] = [];
        let globalIdx = 1;

        (displayRows || []).forEach((c: any) => {
          // Section header banner for Customer
          exportData.push({
            isSectionHeader: true,
            sectionTitle: `CUSTOMER: ${c.customer.toUpperCase()} (${c.itemsCount} Items | ${c.gatepasses || 0} Gatepasses | ${c.invoices || 0} Invoices | Held: ${Number(c.totalHeldQty || 0).toLocaleString()} Pcs | Rs. ${Number(c.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })})`
          });

          // Itemized rows grouped by document
          (c.docs || []).forEach((doc: any) => {
            (doc.items || []).forEach((item: any, itIdx: number) => {
              exportData.push({
                idx: itIdx === 0 ? globalIdx : '',
                gatepassNo: itIdx === 0 ? (doc.gatepassNo || '-') : '',
                invoiceNo: itIdx === 0 ? (doc.invoiceNo || '-') : '',
                date: itIdx === 0 ? (doc.date || '-') : '',
                customerName: c.customer,
                salesman: itIdx === 0 ? (doc.salesman || '-') : '',
                productName: item.productName || '-',
                skuCode: item.skuCode || '-',
                warehouse: item.warehouse || '-',
                orderQty: Number(item.orderQty || 0),
                dispatchedQty: Number(item.dispatchedQty || 0),
                holdQty: Number(item.holdQty || 0),
                rate: Number(item.rate || 0),
                heldAmount: Number(item.heldAmount || 0)
              });
            });
            globalIdx++;
          });

          // Customer Subtotal row
          exportData.push({
            isSubtotal: true,
            productName: `Subtotal for ${c.customer}:`,
            orderQty: Number(c.totalOrderQty || 0),
            dispatchedQty: Number(c.totalDispatchedQty || 0),
            holdQty: Number(c.totalHeldQty || 0),
            heldAmount: Number(c.totalHeldValue || 0)
          });
        });

        await exportToExcel({
          fileName: `Holding_Customer_Wise_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Customer Holding',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: 'Customer-Wise Holding Inventory & DC/Invoice Audit Statement',
          filterSummary: filterMeta,
          columns,
          data: exportData,
          theme: 'emerald',
          summaryRow: false
        });
      } else if (activePerspective === 'gatepass') {
        const columns: ExcelColumn[] = [
          { header: 'S#', key: 'idx', width: 8, alignment: 'center' },
          { header: 'Invoice #', key: 'invoiceNo', width: 16 },
          { header: 'Date', key: 'date', width: 14, type: 'date' },
          { header: 'Customer Name', key: 'customerName', width: 26 },
          { header: 'Salesman', key: 'salesman', width: 20 },
          { header: 'Product Description', key: 'productName', width: 32 },
          { header: 'Code', key: 'skuCode', width: 14 },
          { header: 'Warehouse', key: 'warehouse', width: 18 },
          { header: 'Order Qty', key: 'orderQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Dispatched Qty', key: 'dispatchedQty', width: 14, type: 'number', alignment: 'right' },
          { header: 'Held Qty', key: 'holdQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Unit Rate (Rs.)', key: 'rate', width: 16, type: 'currency', alignment: 'right' },
          { header: 'Held Value (Rs.)', key: 'heldAmount', width: 18, type: 'currency', alignment: 'right' }
        ];

        const exportData: any[] = [];
        let globalIdx = 1;

        (displayRows || []).forEach((g: any) => {
          // Section header banner for Gatepass
          exportData.push({
            isSectionHeader: true,
            sectionTitle: `GATEPASS / DC: ${g.gatepassNo} | Date: ${g.date || '-'} | Customer: ${g.customer || '-'} | Salesman: ${g.salesman || '-'} (${g.itemsCount} Items | Total Order: ${Number(g.totalOrderQty || 0).toLocaleString()} Pcs | Dispatched: ${Number(g.totalDispatchedQty || 0).toLocaleString()} Pcs | Held: ${Number(g.totalHeldQty || 0).toLocaleString()} Pcs | Rs. ${Number(g.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })})`
          });

          // Itemized rows grouped by document / invoice
          (g.docs || []).forEach((doc: any) => {
            (doc.items || []).forEach((item: any, itIdx: number) => {
              exportData.push({
                idx: itIdx === 0 ? globalIdx : '',
                invoiceNo: itIdx === 0 ? (doc.invoiceNo || '-') : '',
                date: itIdx === 0 ? (doc.date || '-') : '',
                customerName: itIdx === 0 ? (doc.customerName || g.customer || '-') : '',
                salesman: itIdx === 0 ? (doc.salesman || g.salesman || '-') : '',
                productName: item.productName || '-',
                skuCode: item.skuCode || '-',
                warehouse: item.warehouse || '-',
                orderQty: Number(item.orderQty || 0),
                dispatchedQty: Number(item.dispatchedQty || 0),
                holdQty: Number(item.holdQty || 0),
                rate: Number(item.rate || 0),
                heldAmount: Number(item.heldAmount || 0)
              });
            });
            globalIdx++;
          });

          // Gatepass Subtotal row
          exportData.push({
            isSubtotal: true,
            productName: `Subtotal for Gatepass ${g.gatepassNo}:`,
            orderQty: Number(g.totalOrderQty || 0),
            dispatchedQty: Number(g.totalDispatchedQty || 0),
            holdQty: Number(g.totalHeldQty || 0),
            heldAmount: Number(g.totalHeldValue || 0)
          });
        });

        await exportToExcel({
          fileName: `Holding_Gatepass_Wise_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Gatepass Holding',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: 'Gatepass-Wise Holding Inventory & DC/Item Audit Statement',
          filterSummary: filterMeta,
          columns,
          data: exportData,
          theme: 'emerald',
          summaryRow: false
        });
      } else if (activePerspective === 'invoice') {
        const columns: ExcelColumn[] = [
          { header: 'S#', key: 'idx', width: 8, alignment: 'center' },
          { header: 'Gatepass / DC #', key: 'gatepassNo', width: 16 },
          { header: 'Date', key: 'date', width: 14, type: 'date' },
          { header: 'Customer Name', key: 'customerName', width: 26 },
          { header: 'Salesman', key: 'salesman', width: 20 },
          { header: 'Product Description', key: 'productName', width: 32 },
          { header: 'Code', key: 'skuCode', width: 14 },
          { header: 'Warehouse', key: 'warehouse', width: 18 },
          { header: 'Order Qty', key: 'orderQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Dispatched Qty', key: 'dispatchedQty', width: 14, type: 'number', alignment: 'right' },
          { header: 'Held Qty', key: 'holdQty', width: 12, type: 'number', alignment: 'right' },
          { header: 'Unit Rate (Rs.)', key: 'rate', width: 16, type: 'currency', alignment: 'right' },
          { header: 'Held Value (Rs.)', key: 'heldAmount', width: 18, type: 'currency', alignment: 'right' }
        ];

        const exportData: any[] = [];
        let globalIdx = 1;

        (displayRows || []).forEach((inv: any) => {
          // Section header banner for Invoice
          exportData.push({
            isSectionHeader: true,
            sectionTitle: `INVOICE: ${inv.invoiceNo} | Date: ${inv.date || '-'} | Customer: ${inv.customer || '-'} | Salesman: ${inv.salesman || '-'} (${inv.itemsCount} Items | Total Order: Rs. ${Number(inv.totalOrderAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} | Held: ${Number(inv.totalHeldQty || 0).toLocaleString()} Pcs | Rs. ${Number(inv.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })})`
          });

          // Itemized rows grouped by document / gatepass
          (inv.docs || []).forEach((doc: any) => {
            (doc.items || []).forEach((item: any, itIdx: number) => {
              exportData.push({
                idx: itIdx === 0 ? globalIdx : '',
                gatepassNo: itIdx === 0 ? (doc.gatepassNo || '-') : '',
                invoiceNo: inv.invoiceNo,
                date: itIdx === 0 ? (doc.date || '-') : '',
                customerName: itIdx === 0 ? (doc.customerName || inv.customer || '-') : '',
                salesman: itIdx === 0 ? (doc.salesman || inv.salesman || '-') : '',
                productName: item.productName || '-',
                skuCode: item.skuCode || '-',
                warehouse: item.warehouse || '-',
                orderQty: Number(item.orderQty || 0),
                dispatchedQty: Number(item.dispatchedQty || 0),
                holdQty: Number(item.holdQty || 0),
                rate: Number(item.rate || 0),
                heldAmount: Number(item.heldAmount || 0)
              });
            });
            globalIdx++;
          });

          // Invoice Subtotal row
          exportData.push({
            isSubtotal: true,
            productName: `Subtotal for Invoice ${inv.invoiceNo}:`,
            orderQty: Number(inv.totalOrderQty || 0),
            dispatchedQty: Number(inv.totalDispatchedQty || 0),
            holdQty: Number(inv.totalHeldQty || 0),
            heldAmount: Number(inv.totalHeldValue || 0)
          });
        });

        await exportToExcel({
          fileName: `Holding_Invoice_Wise_${new Date().toISOString().split('T')[0]}.xlsx`,
          sheetName: 'Invoice Holding',
          companyName: businessName || 'ZOAIB ALI & COMPANY',
          reportTitle: 'Invoice-Wise Holding Inventory & DC/Item Audit Statement',
          filterSummary: filterMeta,
          columns,
          data: exportData,
          theme: 'emerald',
          summaryRow: false
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

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center bg-white min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full bg-white text-black p-6 space-y-6 text-xs min-h-screen print:p-0 print:m-0 print:bg-white print:text-black print:min-h-0 print:h-auto">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page { size: auto; margin: 12mm 10mm 12mm 10mm; }
          body, html { height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; }
          body * { visibility: hidden !important; }
          .print-root-container, .print-root-container * { visibility: visible !important; }
          .print-root-container { position: static !important; width: 100% !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; padding: 0 !important; margin: 0 !important; }
          aside, header, nav, footer, .print-hidden-element, button { display: none !important; visibility: hidden !important; }
          table { page-break-inside: auto !important; }
          tr, td, th { page-break-inside: avoid !important; break-inside: avoid !important; }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
        }
      `}} />

      <div className="print-root-container w-full bg-white p-4 space-y-6 print:p-0 print:space-y-4">
        {/* Screen Controls Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-100 p-3 rounded border print-hidden-element print:hidden">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 font-bold hover:underline cursor-pointer"
          >
            <MdArrowBack size={16} /> Return to Holding Audit Center
          </button>

          {/* Perspective Switcher */}
          <div className="flex items-center bg-white rounded border p-0.5 text-xs font-semibold">
            {[
              { id: 'detailed', label: 'Itemized Detailed' },
              { id: 'salesman', label: 'Salesman-Wise' },
              { id: 'customer', label: 'Customer-Wise' },
              { id: 'invoice', label: 'Invoice-Wise' },
              { id: 'gatepass', label: 'Gatepass-Wise' }
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePerspective(p.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                  activePerspective === p.id
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-gray-600 hover:text-black hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={exporting}
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-4 rounded font-bold cursor-pointer transition shadow-sm disabled:opacity-50"
            >
              <MdFileDownload size={16} /> {exporting ? 'Exporting...' : 'Export to Excel (.xlsx)'}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-primary text-white py-1.5 px-5 rounded font-black cursor-pointer hover:bg-opacity-90 transition shadow-sm"
            >
              <MdPrint size={16} /> Print Voucher Report
            </button>
          </div>
        </div>

        {/* Printable Letterhead */}
        <div className="text-center space-y-1 py-4 border-b border-double border-black">
          <h1 className="text-xl font-black uppercase tracking-widest font-serif">
            {businessName || 'ZOAIB ALI & COMPANY'}
          </h1>
          <p className="text-[10px] font-bold tracking-wider text-gray-600 uppercase">
            COMMERCIAL HOLDING INVENTORY & PENDING DISPATCH AUDIT STATEMENT
          </p>
          <div className="text-[10px] pt-1 font-mono flex justify-between px-2 text-gray-700">
            <span>Audit Perspective: <b className="text-black uppercase underline">{(perspectiveLabels[activePerspective] || activePerspective).toUpperCase()} PERSPECTIVE</b></span>
            <span>Date Window: {rawFilters.dateFrom || 'Start'} up to {rawFilters.dateTo || 'Today'}</span>
          </div>
        </div>

        {/* 📊 KPI Summary Header Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border border-black bg-gray-50 p-2.5 rounded text-center">
            <div className="text-[10px] uppercase font-bold text-gray-600">Holding Line Items</div>
            <div className="text-base font-black font-mono text-black">{kpis.totalItems} Items</div>
          </div>
          <div className="border border-black bg-gray-50 p-2.5 rounded text-center">
            <div className="text-[10px] uppercase font-bold text-gray-600">Pending Held Units</div>
            <div className="text-base font-black font-mono text-amber-900">{kpis.totalHeldQty.toLocaleString()} Units</div>
          </div>
          <div className="border border-black bg-gray-50 p-2.5 rounded text-center">
            <div className="text-[10px] uppercase font-bold text-gray-600">Total Order Volume</div>
            <div className="text-base font-black font-mono text-primary">{kpis.totalOrderQty.toLocaleString()} Units</div>
          </div>
          <div className="border border-black bg-gray-50 p-2.5 rounded text-center">
            <div className="text-[10px] uppercase font-bold text-gray-600">Total Held Valuation</div>
            <div className="text-base font-black font-mono text-emerald-800">Rs. {kpis.totalHeldValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <ReportPagination
          totalCount={(displayRows || []).length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
        />

        {/* 1. Itemized Detailed View (1 Document Row with Sub-Rows per Item) */}
        {activePerspective === 'detailed' && (
          <div className="w-full overflow-x-auto">
            <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
              <thead>
                <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                  <th className="p-1.5 border border-black text-center w-10">S#</th>
                  <th className="p-1.5 border border-black text-center w-24">Date</th>
                  <th className="p-1.5 border border-black">Gatepass #</th>
                  <th className="p-1.5 border border-black">Invoice #</th>
                  <th className="p-1.5 border border-black">Customer Title</th>
                  <th className="p-1.5 border border-black">Salesman</th>
                  <th className="p-1.5 border border-black">Product Description</th>
                  <th className="p-1.5 border border-black text-center w-16">Order</th>
                  <th className="p-1.5 border border-black text-center w-16">Sent</th>
                  <th className="p-1.5 border border-black text-center w-16 bg-amber-50">Held Qty</th>
                  <th className="p-1.5 border border-black text-right w-20">Rate</th>
                  <th className="p-1.5 border border-black text-right pr-2 bg-emerald-50 w-28">Held Value</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-8 font-bold italic border border-black text-gray-400">
                      No holding records found matching parameters.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((doc: any, idx: number) => {
                    const items: any[] = doc.items || [];
                    return (
                      <tr key={doc.id || idx} className="border-b border-black font-mono text-xs hover:bg-slate-50">
                        <td className="p-1.5 border border-black text-center text-gray-500 align-middle font-bold">{startIndex + idx + 1}</td>
                        <td className="p-1.5 border border-black text-center text-gray-700 font-sans text-[10px] align-middle">{doc.date || '-'}</td>
                        <td className="p-1.5 border border-black font-bold font-mono align-middle">{doc.gatepassNo || '-'}</td>
                        <td className="p-1.5 border border-black font-mono font-bold align-middle">{doc.invoiceNo || '-'}</td>
                        <td className="p-1.5 border border-black font-sans font-bold align-middle">{doc.customerName || '-'}</td>
                        <td className="p-1.5 border border-black font-sans text-gray-700 align-middle">{doc.salesman || '-'}</td>
                        
                        {/* 📦 Product Description Sub-Rows */}
                        <td className="p-0 border border-black align-top font-sans">
                          <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                            {items.map((it, itIdx) => (
                              <div key={itIdx} className="p-1.5 flex-1 flex flex-col justify-center min-h-[34px]">
                                <div className="font-bold text-black">{it.productName}</div>
                                {it.skuCode && <div className="text-[9px] text-gray-500 font-mono">{it.skuCode}</div>}
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* 📊 Order Qty Sub-Rows */}
                        <td className="p-0 border border-black align-top">
                          <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                            {items.map((it, itIdx) => (
                              <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center min-h-[34px]">
                                <QtyBadge qty={it.orderQty} />
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* 🚚 Sent / Dispatched Qty Sub-Rows */}
                        <td className="p-0 border border-black align-top">
                          <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                            {items.map((it, itIdx) => (
                              <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center text-emerald-700 min-h-[34px]">
                                <QtyBadge qty={it.dispatchedQty} />
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* ⏳ Held Qty Sub-Rows */}
                        <td className="p-0 border border-black align-top bg-amber-50/40">
                          <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                            {items.map((it, itIdx) => (
                              <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center font-black text-amber-900 min-h-[34px]">
                                <QtyBadge qty={it.holdQty} />
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* 💵 Rate Sub-Rows */}
                        <td className="p-0 border border-black align-top">
                          <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                            {items.map((it, itIdx) => (
                              <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono min-h-[34px]">
                                Rs. {Number(it.rate || 0).toLocaleString()}
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* 💰 Held Value Sub-Rows */}
                        <td className="p-0 border border-black align-top bg-emerald-50/40">
                          <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                            {items.map((it, itIdx) => (
                              <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono font-bold text-emerald-900 pr-2 min-h-[34px]">
                                Rs. {Number(it.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {displayRows.length > 0 && (
                <tfoot>
                  {/* 📄 Page Subtotal Row */}
                  {!isPrinting && pageSize !== 'all' && (
                    <tr className="bg-amber-50/80 border-t border-black font-bold font-mono text-xs text-amber-950">
                      <td colSpan={7} className="p-2 border border-black text-right uppercase font-sans text-amber-900">
                        Page {currentPage} Subtotal ({paginatedRows.length} documents):
                      </td>
                      <td className="p-2 border border-black text-center"><QtyBadge qty={paginatedRows.reduce((s: number, r: any) => s + Number(r.totalOrderQty || 0), 0)} /></td>
                      <td className="p-2 border border-black text-center text-emerald-700"><QtyBadge qty={paginatedRows.reduce((s: number, r: any) => s + Number(r.totalDispatchedQty || 0), 0)} /></td>
                      <td className="p-2 border border-black text-center bg-amber-100 text-amber-900"><QtyBadge qty={paginatedRows.reduce((s: number, r: any) => s + Number(r.totalHeldQty || 0), 0)} /></td>
                      <td className="p-2 border border-black text-right">-</td>
                      <td className="p-2 border border-black text-right pr-2 bg-emerald-50 text-emerald-900 font-bold">
                        Rs. {paginatedRows.reduce((s: number, r: any) => s + Number(r.totalHeldValue || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                  {/* 📊 Overall Grand Totals Row */}
                  <tr className="bg-gray-100 border-t-2 border-black font-black text-black text-xs font-mono">
                    <td colSpan={7} className="p-2 border border-black text-right uppercase font-sans">Grand Total Summary (All {displayRows.length} Documents):</td>
                    <td className="p-2 border border-black text-center"><QtyBadge qty={kpis.totalOrderQty} /></td>
                    <td className="p-2 border border-black text-center text-emerald-700"><QtyBadge qty={kpis.totalOrderQty - kpis.totalHeldQty} /></td>
                    <td className="p-2 border border-black text-center bg-amber-100 text-amber-900"><QtyBadge qty={kpis.totalHeldQty} /></td>
                    <td className="p-2 border border-black text-right">-</td>
                    <td className="p-2 border border-black text-right pr-2 bg-emerald-100 text-emerald-900 font-bold">
                      Rs. {kpis.totalHeldValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* 2. Salesman-Wise View (Grouped with Salesman Header, DCs & Invoices list) */}
        {activePerspective === 'salesman' && (
          <div className="w-full overflow-x-auto">
            {paginatedRows.length === 0 ? (
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left">
                <tbody>
                  <tr>
                    <td colSpan={13} className="text-center py-8 font-bold italic border border-black text-gray-400">
                      No records found.
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                    <th className="p-2 border border-black text-center w-10">S#</th>
                    <th className="p-2 border border-black">Gatepass / DC #</th>
                    <th className="p-2 border border-black">Invoice #</th>
                    <th className="p-2 border border-black text-center">Date</th>
                    <th className="p-2 border border-black">Customer Name</th>
                    <th className="p-2 border border-black">Item Description</th>
                    <th className="p-2 border border-black text-center">Code</th>
                    <th className="p-2 border border-black">Warehouse</th>
                    <th className="p-2 border border-black text-center">Order Qty</th>
                    <th className="p-2 border border-black text-center">Dispatched</th>
                    <th className="p-2 border border-black text-center">Held Qty</th>
                    <th className="p-2 border border-black text-right">Rate</th>
                    <th className="p-2 border border-black text-right pr-2 bg-emerald-50">Held Value</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((s: any, sIdx: number) => {
                    let runningDocIdx = 0;
                    return (
                      <React.Fragment key={sIdx}>
                        {/* 👔 Salesman Section Header Banner */}
                        <tr className="bg-slate-800 text-white font-black text-xs">
                          <td colSpan={13} className="p-2.5 border border-black bg-slate-800 text-white">
                            <div className="flex justify-between items-center px-1">
                              <div className="flex items-center gap-3">
                                <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-wider">
                                  Salesman
                                </span>
                                <span className="text-sm font-bold tracking-wide">{s.salesman}</span>
                              </div>
                              <div className="flex items-center gap-4 text-[11px] font-mono font-normal">
                                <span><b>{s.customerCount || 0}</b> Clients</span>
                                <span>•</span>
                                <span><b>{s.invoices || 0}</b> Invoices</span>
                                <span>•</span>
                                <span><b>{s.itemsCount}</b> Line Items</span>
                                <span>•</span>
                                <span className="text-amber-300 font-bold">Held Qty: {Number(s.totalHeldQty || 0).toLocaleString()} Pcs</span>
                                <span>•</span>
                                <span className="text-emerald-300 font-bold">Valuation: Rs. {Number(s.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* 📋 Consolidated Document Rows with multi-item sub-rows under this Salesman */}
                        {(s.docs || []).map((doc: any, docIdx: number) => {
                          runningDocIdx++;
                          const items = doc.items || [];
                          return (
                            <tr key={doc.id || docIdx} className="border-b border-black font-mono text-xs hover:bg-slate-50 transition-colors">
                              {/* 🔢 S# */}
                              <td className="p-2 border border-black text-center font-bold text-gray-700 align-middle">
                                {runningDocIdx}
                              </td>

                              {/* 🚪 Gatepass / DC # */}
                              <td className="p-2 border border-black font-black font-mono text-slate-950 align-middle">
                                {doc.gatepassNo ? (
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-gray-300">
                                    {doc.gatepassNo}
                                  </span>
                                ) : '-'}
                              </td>

                              {/* 🧾 Invoice # */}
                              <td className="p-2 border border-black font-bold font-mono text-blue-900 align-middle">
                                {doc.invoiceNo || '-'}
                              </td>

                              {/* 📅 Date */}
                              <td className="p-2 border border-black text-center font-sans text-[10px] text-gray-600 align-middle">
                                {doc.date || '-'}
                              </td>

                              {/* 🏢 Customer Name */}
                              <td className="p-2 border border-black font-sans font-bold text-gray-900 align-middle">
                                {doc.customerName || '-'}
                              </td>

                              {/* 📦 Product Description Sub-Rows */}
                              <td className="p-0 border border-black align-top font-sans">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center font-semibold text-gray-950 min-h-[34px]">
                                      {it.productName || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🏷️ Code Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center text-gray-700 font-mono text-[10px] min-h-[34px]">
                                      {it.skuCode || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🏬 Warehouse Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center text-gray-700 font-sans text-[10px] min-h-[34px]">
                                      {it.warehouse || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🔢 Order Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center min-h-[34px]">
                                      <QtyBadge qty={it.orderQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🚚 Dispatched Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center text-emerald-700 font-bold min-h-[34px]">
                                      <QtyBadge qty={it.dispatchedQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🛑 Held Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top bg-amber-50/50">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center font-black text-amber-900 min-h-[34px]">
                                      <QtyBadge qty={it.holdQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 💵 Rate Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono min-h-[34px]">
                                      Rs. {Number(it.rate || 0).toLocaleString()}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 💰 Held Value Sub-Rows */}
                              <td className="p-0 border border-black align-top bg-emerald-50/40">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono font-bold text-emerald-900 pr-2 min-h-[34px]">
                                      Rs. {Number(it.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {/* 🧮 Subtotal Row for this Salesman */}
                        <tr className="bg-amber-100/70 border-b-2 border-black font-bold font-mono text-xs text-amber-950">
                          <td colSpan={8} className="p-2 border border-black text-right uppercase font-sans text-amber-900">
                            Subtotal for {s.salesman} ({s.itemsCount} items):
                          </td>
                          <td className="p-2 border border-black text-center"><QtyBadge qty={s.totalOrderQty} /></td>
                          <td className="p-2 border border-black text-center text-emerald-700"><QtyBadge qty={s.totalDispatchedQty} /></td>
                          <td className="p-2 border border-black text-center bg-amber-200 text-amber-950"><QtyBadge qty={s.totalHeldQty} /></td>
                          <td className="p-2 border border-black text-right">-</td>
                          <td className="p-2 border border-black text-right pr-2 bg-emerald-100 text-emerald-900 font-bold">
                            Rs. {Number(s.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {displayRows.length > 0 && (
                  <tfoot>
                    {/* 📊 Overall Grand Totals Row */}
                    <tr className="bg-gray-100 border-t-2 border-black font-black text-black text-xs font-mono">
                      <td colSpan={8} className="p-2.5 border border-black text-right uppercase font-sans">
                        Grand Total Summary (All {displayRows.length} Salesmen):
                      </td>
                      <td className="p-2.5 border border-black text-center"><QtyBadge qty={kpis.totalOrderQty} /></td>
                      <td className="p-2.5 border border-black text-center text-emerald-700"><QtyBadge qty={kpis.totalOrderQty - kpis.totalHeldQty} /></td>
                      <td className="p-2.5 border border-black text-center bg-amber-200 text-amber-950"><QtyBadge qty={kpis.totalHeldQty} /></td>
                      <td className="p-2.5 border border-black text-right">-</td>
                      <td className="p-2.5 border border-black text-right pr-2 bg-emerald-200 text-emerald-950 font-bold">
                        Rs. {kpis.totalHeldValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}

        {/* 3. Customer-Wise View (Grouped with Customer Header, DCs & Invoices list) */}
        {activePerspective === 'customer' && (
          <div className="w-full overflow-x-auto">
            {paginatedRows.length === 0 ? (
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left">
                <tbody>
                  <tr>
                    <td colSpan={13} className="text-center py-8 font-bold italic border border-black text-gray-400">
                      No records found.
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                    <th className="p-2 border border-black text-center w-10">S#</th>
                    <th className="p-2 border border-black">Gatepass / DC #</th>
                    <th className="p-2 border border-black">Invoice #</th>
                    <th className="p-2 border border-black text-center">Date</th>
                    <th className="p-2 border border-black">Salesman</th>
                    <th className="p-2 border border-black">Item Description</th>
                    <th className="p-2 border border-black text-center">Code</th>
                    <th className="p-2 border border-black">Warehouse</th>
                    <th className="p-2 border border-black text-center">Order Qty</th>
                    <th className="p-2 border border-black text-center">Dispatched</th>
                    <th className="p-2 border border-black text-center">Held Qty</th>
                    <th className="p-2 border border-black text-right">Rate</th>
                    <th className="p-2 border border-black text-right pr-2 bg-emerald-50">Held Value</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((c: any, cIdx: number) => {
                    let runningDocIdx = 0;
                    return (
                      <React.Fragment key={cIdx}>
                        {/* 🏢 Customer Section Header Banner */}
                        <tr className="bg-slate-800 text-white font-black text-xs">
                          <td colSpan={13} className="p-2.5 border border-black bg-slate-800 text-white">
                            <div className="flex justify-between items-center px-1">
                              <div className="flex items-center gap-3">
                                <span className="bg-teal-400 text-slate-950 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-wider">
                                  Customer
                                </span>
                                <span className="text-sm font-bold tracking-wide">{c.customer}</span>
                              </div>
                              <div className="flex items-center gap-4 text-[11px] font-mono font-normal">
                                <span><b>{c.gatepasses || 0}</b> Gatepasses</span>
                                <span>•</span>
                                <span><b>{c.invoices || 0}</b> Invoices</span>
                                <span>•</span>
                                <span><b>{c.itemsCount}</b> Line Items</span>
                                <span>•</span>
                                <span className="text-amber-300 font-bold">Held Qty: {Number(c.totalHeldQty || 0).toLocaleString()} Pcs</span>
                                <span>•</span>
                                <span className="text-emerald-300 font-bold">Valuation: Rs. {Number(c.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* 📋 Consolidated Document Rows with multi-item sub-rows under this Customer */}
                        {(c.docs || []).map((doc: any, docIdx: number) => {
                          runningDocIdx++;
                          const items = doc.items || [];
                          return (
                            <tr key={doc.id || docIdx} className="border-b border-black font-mono text-xs hover:bg-slate-50 transition-colors">
                              {/* 🔢 S# */}
                              <td className="p-2 border border-black text-center font-bold text-gray-700 align-middle">
                                {runningDocIdx}
                              </td>

                              {/* 🚪 Gatepass / DC # */}
                              <td className="p-2 border border-black font-black font-mono text-slate-950 align-middle">
                                {doc.gatepassNo ? (
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-gray-300">
                                    {doc.gatepassNo}
                                  </span>
                                ) : '-'}
                              </td>

                              {/* 🧾 Invoice # */}
                              <td className="p-2 border border-black font-bold font-mono text-blue-900 align-middle">
                                {doc.invoiceNo || '-'}
                              </td>

                              {/* 📅 Date */}
                              <td className="p-2 border border-black text-center font-sans text-[10px] text-gray-600 align-middle">
                                {doc.date || '-'}
                              </td>

                              {/* 👔 Salesman */}
                              <td className="p-2 border border-black font-sans font-bold text-gray-900 align-middle">
                                {doc.salesman || '-'}
                              </td>

                              {/* 📦 Product Description Sub-Rows */}
                              <td className="p-0 border border-black align-top font-sans">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center font-semibold text-gray-950 min-h-[34px]">
                                      {it.productName || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🏷️ Code Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center text-gray-700 font-mono text-[10px] min-h-[34px]">
                                      {it.skuCode || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🏬 Warehouse Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center text-gray-700 font-sans text-[10px] min-h-[34px]">
                                      {it.warehouse || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🔢 Order Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center min-h-[34px]">
                                      <QtyBadge qty={it.orderQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🚚 Dispatched Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center text-emerald-700 font-bold min-h-[34px]">
                                      <QtyBadge qty={it.dispatchedQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🛑 Held Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top bg-amber-50/50">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center font-black text-amber-900 min-h-[34px]">
                                      <QtyBadge qty={it.holdQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 💵 Rate Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono min-h-[34px]">
                                      Rs. {Number(it.rate || 0).toLocaleString()}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 💰 Held Value Sub-Rows */}
                              <td className="p-0 border border-black align-top bg-emerald-50/40">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono font-bold text-emerald-900 pr-2 min-h-[34px]">
                                      Rs. {Number(it.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {/* 🧮 Subtotal Row for this Customer */}
                        <tr className="bg-amber-100/70 border-b-2 border-black font-bold font-mono text-xs text-amber-950">
                          <td colSpan={8} className="p-2 border border-black text-right uppercase font-sans text-amber-900">
                            Subtotal for {c.customer} ({c.itemsCount} items):
                          </td>
                          <td className="p-2 border border-black text-center"><QtyBadge qty={c.totalOrderQty} /></td>
                          <td className="p-2 border border-black text-center text-emerald-700"><QtyBadge qty={c.totalDispatchedQty} /></td>
                          <td className="p-2 border border-black text-center bg-amber-200 text-amber-950"><QtyBadge qty={c.totalHeldQty} /></td>
                          <td className="p-2 border border-black text-right">-</td>
                          <td className="p-2 border border-black text-right pr-2 bg-emerald-100 text-emerald-900 font-bold">
                            Rs. {Number(c.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {displayRows.length > 0 && (
                  <tfoot>
                    {/* 📊 Overall Grand Totals Row */}
                    <tr className="bg-gray-100 border-t-2 border-black font-black text-black text-xs font-mono">
                      <td colSpan={8} className="p-2.5 border border-black text-right uppercase font-sans">
                        Grand Total Summary (All {displayRows.length} Clients):
                      </td>
                      <td className="p-2.5 border border-black text-center"><QtyBadge qty={kpis.totalOrderQty} /></td>
                      <td className="p-2.5 border border-black text-center text-emerald-700"><QtyBadge qty={kpis.totalOrderQty - kpis.totalHeldQty} /></td>
                      <td className="p-2.5 border border-black text-center bg-amber-200 text-amber-950"><QtyBadge qty={kpis.totalHeldQty} /></td>
                      <td className="p-2.5 border border-black text-right">-</td>
                      <td className="p-2.5 border border-black text-right pr-2 bg-emerald-200 text-emerald-950 font-bold">
                        Rs. {kpis.totalHeldValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}

        {/* 4. Gatepass-Wise View (Grouped with Gatepass Header, Invoices & Items list) */}
        {activePerspective === 'gatepass' && (
          <div className="w-full overflow-x-auto">
            {paginatedRows.length === 0 ? (
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left">
                <tbody>
                  <tr>
                    <td colSpan={11} className="text-center py-8 font-bold italic border border-black text-gray-400">
                      No records found.
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                    <th className="p-2 border border-black text-center w-10">S#</th>
                    <th className="p-2 border border-black">Invoice #</th>
                    <th className="p-2 border border-black text-center">Date</th>
                    <th className="p-2 border border-black">Item Description</th>
                    <th className="p-2 border border-black text-center">Code</th>
                    <th className="p-2 border border-black">Warehouse</th>
                    <th className="p-2 border border-black text-center">Order Qty</th>
                    <th className="p-2 border border-black text-center">Dispatched</th>
                    <th className="p-2 border border-black text-center">Held Qty</th>
                    <th className="p-2 border border-black text-right">Rate</th>
                    <th className="p-2 border border-black text-right pr-2 bg-emerald-50">Held Value</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((g: any, gIdx: number) => {
                    let runningDocIdx = 0;
                    return (
                      <React.Fragment key={gIdx}>
                        {/* 🚛 Gatepass Section Header Banner */}
                        <tr className="bg-slate-800 text-white font-black text-xs">
                          <td colSpan={11} className="p-2.5 border border-black bg-slate-800 text-white">
                            <div className="flex justify-between items-center px-1">
                              <div className="flex items-center gap-3">
                                <span className="bg-emerald-400 text-slate-950 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-wider">
                                  Gatepass / DC
                                </span>
                                <span className="text-sm font-bold tracking-wide">{g.gatepassNo}</span>
                                <span className="text-gray-300 font-sans text-[11px] font-normal">({g.date || '-'})</span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] font-mono font-normal">
                                <span>Cust: <b className="text-white font-bold">{g.customer || 'Counter'}</b></span>
                                <span>•</span>
                                <span>SM: <b className="text-white font-bold">{g.salesman || 'Direct'}</b></span>
                                <span>•</span>
                                <span><b>{g.itemsCount}</b> Items</span>
                                <span>•</span>
                                <span className="text-amber-300 font-bold">Held Qty: {Number(g.totalHeldQty || 0).toLocaleString()} Pcs</span>
                                <span>•</span>
                                <span className="text-emerald-300 font-bold">Held Val: Rs. {Number(g.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* 📋 Consolidated Document Rows (Invoices) under this Gatepass */}
                        {(g.docs || []).map((doc: any, docIdx: number) => {
                          runningDocIdx++;
                          const items = doc.items || [];
                          return (
                            <tr key={doc.id || docIdx} className="border-b border-black font-mono text-xs hover:bg-slate-50 transition-colors">
                              {/* 🔢 S# */}
                              <td className="p-2 border border-black text-center font-bold text-gray-700 align-middle">
                                {runningDocIdx}
                              </td>

                              {/* 🧾 Invoice # */}
                              <td className="p-2 border border-black font-black font-mono text-blue-900 align-middle">
                                {doc.invoiceNo ? (
                                  <span className="bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                    {doc.invoiceNo}
                                  </span>
                                ) : '-'}
                              </td>

                              {/* 📅 Date */}
                              <td className="p-2 border border-black text-center font-sans text-[10px] text-gray-600 align-middle">
                                {doc.date || '-'}
                              </td>

                              {/* 📦 Product Description Sub-Rows */}
                              <td className="p-0 border border-black align-top font-sans">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center font-semibold text-gray-950 min-h-[34px]">
                                      {it.productName || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🏷️ Code Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center text-gray-700 font-mono text-[10px] min-h-[34px]">
                                      {it.skuCode || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🏬 Warehouse Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center text-gray-700 font-sans text-[10px] min-h-[34px]">
                                      {it.warehouse || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🔢 Order Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center min-h-[34px]">
                                      <QtyBadge qty={it.orderQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🚚 Dispatched Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center text-emerald-700 font-bold min-h-[34px]">
                                      <QtyBadge qty={it.dispatchedQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🛑 Held Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top bg-amber-50/50">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center font-black text-amber-900 min-h-[34px]">
                                      <QtyBadge qty={it.holdQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 💵 Rate Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono min-h-[34px]">
                                      Rs. {Number(it.rate || 0).toLocaleString()}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 💰 Held Value Sub-Rows */}
                              <td className="p-0 border border-black align-top bg-emerald-50/40">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono font-bold text-emerald-900 pr-2 min-h-[34px]">
                                      Rs. {Number(it.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {/* 🧮 Subtotal Row for this Gatepass */}
                        <tr className="bg-amber-100/70 border-b-2 border-black font-bold font-mono text-xs text-amber-950">
                          <td colSpan={6} className="p-2 border border-black text-right uppercase font-sans text-amber-900">
                            Subtotal for Gatepass {g.gatepassNo} ({g.itemsCount} items):
                          </td>
                          <td className="p-2 border border-black text-center"><QtyBadge qty={g.totalOrderQty} /></td>
                          <td className="p-2 border border-black text-center text-emerald-700"><QtyBadge qty={g.totalDispatchedQty} /></td>
                          <td className="p-2 border border-black text-center bg-amber-200 text-amber-950"><QtyBadge qty={g.totalHeldQty} /></td>
                          <td className="p-2 border border-black text-right">-</td>
                          <td className="p-2 border border-black text-right pr-2 bg-emerald-100 text-emerald-900 font-bold">
                            Rs. {Number(g.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {displayRows.length > 0 && (
                  <tfoot>
                    {/* 📊 Overall Grand Totals Row */}
                    <tr className="bg-gray-100 border-t-2 border-black font-black text-black text-xs font-mono">
                      <td colSpan={6} className="p-2.5 border border-black text-right uppercase font-sans">
                        Grand Total Summary (All {displayRows.length} Gatepasses):
                      </td>
                      <td className="p-2.5 border border-black text-center"><QtyBadge qty={kpis.totalOrderQty} /></td>
                      <td className="p-2.5 border border-black text-center text-emerald-700"><QtyBadge qty={kpis.totalOrderQty - kpis.totalHeldQty} /></td>
                      <td className="p-2.5 border border-black text-center bg-amber-200 text-amber-950"><QtyBadge qty={kpis.totalHeldQty} /></td>
                      <td className="p-2.5 border border-black text-right">-</td>
                      <td className="p-2.5 border border-black text-right pr-2 bg-emerald-200 text-emerald-950 font-bold">
                        Rs. {kpis.totalHeldValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}

        {/* 5. Invoice-Wise View (Grouped with Invoice Header, DCs & Items list) */}
        {activePerspective === 'invoice' && (
          <div className="w-full overflow-x-auto">
            {paginatedRows.length === 0 ? (
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left">
                <tbody>
                  <tr>
                    <td colSpan={11} className="text-center py-8 font-bold italic border border-black text-gray-400">
                      No records found.
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                    <th className="p-2 border border-black text-center w-10">S#</th>
                    <th className="p-2 border border-black">Gatepass / DC #</th>
                    <th className="p-2 border border-black text-center">Date</th>
                    <th className="p-2 border border-black">Item Description</th>
                    <th className="p-2 border border-black text-center">Code</th>
                    <th className="p-2 border border-black">Warehouse</th>
                    <th className="p-2 border border-black text-center">Order Qty</th>
                    <th className="p-2 border border-black text-center">Dispatched</th>
                    <th className="p-2 border border-black text-center">Held Qty</th>
                    <th className="p-2 border border-black text-right">Rate</th>
                    <th className="p-2 border border-black text-right pr-2 bg-emerald-50">Held Value</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((inv: any, invIdx: number) => {
                    let runningDocIdx = 0;
                    return (
                      <React.Fragment key={invIdx}>
                        {/* 🧾 Invoice Section Header Banner */}
                        <tr className="bg-slate-800 text-white font-black text-xs">
                          <td colSpan={11} className="p-2.5 border border-black bg-slate-800 text-white">
                            <div className="flex justify-between items-center px-1">
                              <div className="flex items-center gap-3">
                                <span className="bg-indigo-400 text-slate-950 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-wider">
                                  Invoice
                                </span>
                                <span className="text-sm font-bold tracking-wide">{inv.invoiceNo}</span>
                                <span className="text-gray-300 font-sans text-[11px] font-normal">({inv.date || '-'})</span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] font-mono font-normal">
                                <span>Cust: <b className="text-white font-bold">{inv.customer || 'Counter'}</b></span>
                                <span>•</span>
                                <span>SM: <b className="text-white font-bold">{inv.salesman || 'Direct'}</b></span>
                                <span>•</span>
                                <span><b>{inv.itemsCount}</b> Items</span>
                                <span>•</span>
                                <span className="text-amber-300 font-bold">Held Qty: {Number(inv.totalHeldQty || 0).toLocaleString()} Pcs</span>
                                <span>•</span>
                                <span className="text-emerald-300 font-bold">Held Val: Rs. {Number(inv.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* 📋 Consolidated Document Rows (Gatepasses) under this Invoice */}
                        {(inv.docs || []).map((doc: any, docIdx: number) => {
                          runningDocIdx++;
                          const items = doc.items || [];
                          return (
                            <tr key={doc.id || docIdx} className="border-b border-black font-mono text-xs hover:bg-slate-50 transition-colors">
                              {/* 🔢 S# */}
                              <td className="p-2 border border-black text-center font-bold text-gray-700 align-middle">
                                {runningDocIdx}
                              </td>

                              {/* 🚪 Gatepass / DC # */}
                              <td className="p-2 border border-black font-black font-mono text-slate-950 align-middle">
                                {doc.gatepassNo ? (
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-gray-300">
                                    {doc.gatepassNo}
                                  </span>
                                ) : '-'}
                              </td>

                              {/* 📅 Date */}
                              <td className="p-2 border border-black text-center font-sans text-[10px] text-gray-600 align-middle">
                                {doc.date || '-'}
                              </td>

                              {/* 📦 Product Description Sub-Rows */}
                              <td className="p-0 border border-black align-top font-sans">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center font-semibold text-gray-950 min-h-[34px]">
                                      {it.productName || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🏷️ Code Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center text-gray-700 font-mono text-[10px] min-h-[34px]">
                                      {it.skuCode || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🏬 Warehouse Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center text-gray-700 font-sans text-[10px] min-h-[34px]">
                                      {it.warehouse || '-'}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🔢 Order Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center min-h-[34px]">
                                      <QtyBadge qty={it.orderQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🚚 Dispatched Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center text-emerald-700 font-bold min-h-[34px]">
                                      <QtyBadge qty={it.dispatchedQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 🛑 Held Qty Sub-Rows */}
                              <td className="p-0 border border-black align-top bg-amber-50/50">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-center font-black text-amber-900 min-h-[34px]">
                                      <QtyBadge qty={it.holdQty} />
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 💵 Rate Sub-Rows */}
                              <td className="p-0 border border-black align-top">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono min-h-[34px]">
                                      Rs. {Number(it.rate || 0).toLocaleString()}
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* 💰 Held Value Sub-Rows */}
                              <td className="p-0 border border-black align-top bg-emerald-50/40">
                                <div className="divide-y divide-black h-full flex flex-col justify-stretch">
                                  {items.map((it: any, itIdx: number) => (
                                    <div key={itIdx} className="p-1.5 flex-1 flex items-center justify-end font-mono font-bold text-emerald-900 pr-2 min-h-[34px]">
                                      Rs. {Number(it.heldAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {/* 🧮 Subtotal Row for this Invoice */}
                        <tr className="bg-amber-100/70 border-b-2 border-black font-bold font-mono text-xs text-amber-950">
                          <td colSpan={6} className="p-2 border border-black text-right uppercase font-sans text-amber-900">
                            Subtotal for Invoice {inv.invoiceNo} ({inv.itemsCount} items):
                          </td>
                          <td className="p-2 border border-black text-center"><QtyBadge qty={inv.totalOrderQty} /></td>
                          <td className="p-2 border border-black text-center text-emerald-700"><QtyBadge qty={inv.totalDispatchedQty} /></td>
                          <td className="p-2 border border-black text-center bg-amber-200 text-amber-950"><QtyBadge qty={inv.totalHeldQty} /></td>
                          <td className="p-2 border border-black text-right">-</td>
                          <td className="p-2 border border-black text-right pr-2 bg-emerald-100 text-emerald-900 font-bold">
                            Rs. {Number(inv.totalHeldValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {displayRows.length > 0 && (
                  <tfoot>
                    {/* 📊 Overall Grand Totals Row */}
                    <tr className="bg-gray-100 border-t-2 border-black font-black text-black text-xs font-mono">
                      <td colSpan={6} className="p-2.5 border border-black text-right uppercase font-sans">
                        Grand Total Summary (All {displayRows.length} Invoices):
                      </td>
                      <td className="p-2.5 border border-black text-center"><QtyBadge qty={kpis.totalOrderQty} /></td>
                      <td className="p-2.5 border border-black text-center text-emerald-700"><QtyBadge qty={kpis.totalOrderQty - kpis.totalHeldQty} /></td>
                      <td className="p-2.5 border border-black text-center bg-amber-200 text-amber-950"><QtyBadge qty={kpis.totalHeldQty} /></td>
                      <td className="p-2.5 border border-black text-right">-</td>
                      <td className="p-2.5 border border-black text-right pr-2 bg-emerald-200 text-emerald-950 font-bold">
                        Rs. {kpis.totalHeldValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}

        {/* ✍️ Formal Multi-Level Executive Verification & Signature Block */}
        <div className="mt-16 grid grid-cols-3 gap-10 text-center text-[10px] font-sans font-black uppercase tracking-wider text-slate-800 break-inside-avoid">
          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">PREPARED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Logistics &amp; Gatepass Queue Controller</div>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">VERIFIED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Warehouse Operations &amp; Holding Auditor</div>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">AUTHORIZED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Managing Executive Director &amp; Official Seal</div>
            </div>
          </div>
        </div>

        {/* 🏢 Software & Corporate Provider Footer */}
        <div className="mt-8 pt-3 border-t border-gray-300 flex justify-between items-center text-[10px] text-gray-600 font-sans print:border-gray-400 break-inside-avoid">
          <div className="flex items-center gap-2 font-bold">
            <span className="text-black font-black uppercase">ZOAIB ALI &amp; COMPANY</span>
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

export default HoldingReportPrint;
