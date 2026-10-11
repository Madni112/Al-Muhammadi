import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { MdSearch, MdAdd, MdWarning, MdClose, MdInfoOutline } from 'react-icons/md';
import TableActions from '../../../ui/TableActions';
import SearchableDropdown from '../../../components/SearchableDropdown';
import { getDetailedBreakdown } from '../../../utils/stockCalculator';
import { useAuth } from '../../../Context/Auth';
import { logActivity } from '../../../service/auditLogger';

const ProductList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStockBreakdown, setSelectedStockBreakdown] = useState<any | null>(null);
  const [selectedQuickViewProduct, setSelectedQuickViewProduct] = useState<any | null>(null);
  const [selectedModalWarehouse, setSelectedModalWarehouse] = useState<string>('ALL');
  const [masterLocations, setMasterLocations] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Server-side pagination mode (uses stock_balances when it exists)
  const [serverMode, setServerMode] = useState(false);
  const [serverBalances, setServerBalances] = useState<any[] | null>(null);
  const [serverTotalEntries, setServerTotalEntries] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce the search box: only reload after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    const initListMode = async () => {
      try {
        const probe = await supabase
          .from('stock_balances')
          .select('product_name, warehouse_name, quantity')
          .limit(1);

        if (!probe.error && probe.data && probe.data.length > 0) {
          const { data: rows } = await supabase
            .from('stock_balances')
            .select('product_name, warehouse_name, quantity');
          if (rows && rows.length > 0) {
            const { data: locMaster } = await supabase.from('inventory_locations').select('name');
            if (locMaster) setMasterLocations(locMaster.map((l: any) => String(l.name).trim()));
            setServerBalances(rows);
            setServerMode(true);
            return;
          }
        }
      } catch {
        /* stock_balances missing → legacy mode */
      }
      setServerMode(false);
      fetchInventoryProducts();
    };
    initListMode();
  }, []);

  // Reload the current page whenever anything that affects the query changes
  useEffect(() => {
    if (serverMode) {
      loadServerPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, currentPage, pageSize, debouncedSearch, sortConfig]);


  const fetchInventoryProducts = async () => {
    try {
      setLoading(true);

      // Query products
      let query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: baseProducts, error } = await query;

      if (error) throw error;

      if (baseProducts && baseProducts.length > 0) {
        const { data: openStocks } = await supabase.from('opening_stocks').select('*');
        const { data: purchases } = await supabase.from('supplier_purchases').select('id, purchase_no, items, payment_term, metadata, target_warehouse');
        const { data: sales } = await supabase.from('sales_invoices').select('items, sale_status, receipt_status, dispatch_warehouse');
        const { data: sReturns } = await supabase.from('sales_returns').select('*');
        const { data: pReturns } = await supabase.from('purchase_returns').select('*');
        const { data: deliveryChallans } = await supabase.from('delivery_challans').select('*').order('created_at', { ascending: false });
        const [ { data: rData }, { data: iData } ] = await Promise.all([
          supabase.from('grn_receipts').select('*'),
          supabase.from('grn_items').select('*')
        ]);
        const itemsByGrn: Record<string, any[]> = {};
        (iData || []).forEach((it: any) => {
          const gId = String(it.grn_id || '');
          if (!itemsByGrn[gId]) itemsByGrn[gId] = [];
          itemsByGrn[gId].push(it);
        });
        const grnReceipts = (rData || []).map((g: any) => ({
          ...g,
          grn_items: itemsByGrn[String(g.id)] || []
        }));
        const { data: stockTransfers } = await supabase.from('stock_transfers').select('items, from_location, to_location, status');
        const { data: locationsMaster } = await supabase.from('inventory_locations').select('name');

        if (locationsMaster) {
          setMasterLocations(locationsMaster.map(l => String(l.name).trim()));
        }

        const unifiedProductPayload = baseProducts.map(product => {
          const name = String(product.product_name || '').trim().toLowerCase();

          const whBreakdowns: Record<string, any> = {};
          const getWh = (whName: string) => {
            const key = String(whName || 'Global / Unassigned').trim();
            if (!whBreakdowns[key]) {
              whBreakdowns[key] = { opening: 0, purchased: 0, sold: 0, salesReturned: 0, purchaseReturned: 0, hold: 0, rejected: 0 };
            }
            return whBreakdowns[key];
          };

          // 1. Live stock from warehouse_inventory
          let liveStock = 0;
          (openStocks || []).forEach((os: any) => {
            const osName = String(os.product_name || os.item_name || os.itemName || os.item_details || os.itemDetails || '').trim().toLowerCase();
            if (osName === name || osName.includes(name) || name.includes(osName)) {
              const qty = Number(os.quantity || os.qty || 0);
              liveStock += qty;
              getWh(os.warehouse_name || os.location || 'Global / Unassigned').opening += qty;
            }
          });

          // 2. Purchased stock calculation
          let totalPurchased = 0;
          (purchases || []).forEach((p: any) => {
            const termClean = String(p.payment_term || '').trim().toLowerCase();
            // Safely parse metadata
            const metadata = typeof p.metadata === 'string' ? JSON.parse(p.metadata || '{}') : (p.metadata || {});
            // Skip purchases that have a linked GRN to prevent double-counting
            const hasGrn = metadata?.grn_id ||
              (Array.isArray(metadata?.grn_ids) && metadata.grn_ids.length > 0) ||
              (grnReceipts || []).some((g: any) =>
                (p.purchase_no && g.grn_no?.includes(p.purchase_no)) ||
                (p.id && g.metadata?.linkedPurchaseId === p.id)
              );

            if (termClean !== 'cancel' && termClean !== 'deleted' && termClean !== 'draft' && !hasGrn) {
              const itemsArray = Array.isArray(p.items) ? p.items : JSON.parse(p.items || '[]');
              itemsArray.forEach((item: any) => {
                const pName = String(item.product_name || item.itemName || item.item_name || '').trim().toLowerCase();
                if (pName === name || pName.includes(name)) {
                  const qty = Number(item.qty || item.quantity || 0);
                  totalPurchased += qty;
                  const resolvedWh = item.warehouse || item.location || p.target_warehouse || p.receiving_warehouse || p.warehouse || 'Global / Unassigned';
                  getWh(resolvedWh).purchased += qty;
                }
              });
            }
          });

          // 2.5 GRN stock calculation
          let totalRejected = 0;
          let totalPurchaseHold = 0;
          (grnReceipts || []).forEach((grn: any) => {
            if (['Pending Inward', 'Confirm', 'Partially Received', 'Billed', 'Rejected'].includes(grn.status)) {
              (grn.grn_items || []).forEach((item: any) => {
                const pName = String(item.product_name || '').trim().toLowerCase();
                if (pName === name || pName.includes(name)) {
                  const isUnverified = (item.accepted_qty == null) || (item.accepted_qty === 0 && item.rejected_qty === 0 && Number(item.qty) > 0 && ['Pending Inward', 'Partially Received'].includes(grn.status));
                  const accepted = isUnverified ? 0 : Number(item.accepted_qty ?? item.qty ?? 0);
                  const rejected = Number(item.rejected_qty ?? 0);
                  const holdQty = Number(item.hold_qty ?? 0) + (isUnverified ? Number(item.qty) : 0);

                  // Show accepted + rejected in totalPurchased (once confirmed/received)
                  const fullQty = accepted + rejected;

                  totalPurchased += fullQty;
                  totalRejected += rejected;
                  totalPurchaseHold += holdQty;

                  const warehouse = item.warehouse_name || grn.target_warehouse || grn.warehouse || 'Global / Unassigned';
                  getWh(warehouse).purchased += fullQty;
                  getWh(warehouse).rejected += rejected;
                  getWh(warehouse).purchaseHold = (getWh(warehouse).purchaseHold || 0) + holdQty;
                }
              });
            }
          });

          // 3. Sold stock calculation
          let totalSold = 0;
          (sales || []).forEach((s: any) => {
            const statusClean = String(s.sale_status || '').trim().toLowerCase();
            if (statusClean !== 'cancel' && statusClean !== 'deleted') {
              const itemsArray = Array.isArray(s.items) ? s.items : JSON.parse(s.items || '[]');
              itemsArray.forEach((item: any) => {
                const sName = String(item.product_name || item.itemName || item.item_name || '').trim().toLowerCase();
                if (sName === name || sName.includes(name)) {
                  const qty = Number(item.qty || item.quantity || 0);
                  totalSold += qty;
                  getWh(item.warehouse || item.location || s.dispatch_warehouse || s.warehouse || 'Global / Unassigned').sold += qty;
                }
              });
            }
          });

          // 4. Sales returns calculation (Stock coming back into warehouse)
          let totalSalesReturned = 0;
          (sReturns || []).forEach((sr: any) => {
            if (String(sr.status || '').trim().toLowerCase() !== 'cancel') {
              const itemsArray = Array.isArray(sr.items) ? sr.items : JSON.parse(sr.items || '[]');
              itemsArray.forEach((item: any) => {
                const srName = String(item.product_name || item.itemName || item.item_name || '').trim().toLowerCase();
                if (srName === name || srName.includes(name)) {
                  const qty = Number(item.qty || item.quantity || 0);
                  totalSalesReturned += qty;
                  getWh(item.warehouse || item.location || sr.receiving_warehouse || sr.warehouse || 'Global / Unassigned').salesReturned += qty;
                }
              });
            }
          });

          // 5. Purchase returns calculation (Stock returned back to vendor)
          let totalPurchaseReturned = 0;
          (pReturns || []).forEach((pr: any) => {
            const statusClean = String(pr.status || '').trim().toLowerCase();
            if (statusClean !== 'cancel' && statusClean !== 'deleted') {
              const itemsArray = Array.isArray(pr.items) ? pr.items : JSON.parse(pr.items || '[]');
              itemsArray.forEach((item: any) => {
                const prName = String(item.product_name || item.itemName || item.item_name || '').trim().toLowerCase();
                if (prName === name || prName.includes(name)) {
                  const qty = Number(item.qty || item.quantity || 0);
                  totalPurchaseReturned += qty;
                  getWh(item.warehouse || item.location || pr.dispatch_warehouse || pr.warehouse || 'Global / Unassigned').purchaseReturned += qty;
                }
              });
            }
          });

          // 7. Stock Transfers
          // Every recorded transfer is a real movement (the app never saves drafts)
          (stockTransfers || []).forEach((st: any) => {
            const itemsArray = Array.isArray(st.items) ? st.items : (typeof st.items === 'string' ? JSON.parse(st.items || '[]') : []);
            itemsArray.forEach((item: any) => {
              const stName = String(item.product_name || item.itemName || '').trim().toLowerCase();
              if (stName === name) {
                const qty = Number(item.qty || item.quantity || item.transfer_qty || 0);
                const srcWh = String(st.from_location || item.from_location || 'Global / Unassigned').trim();
                const destWh = String(st.to_location || item.to_location || 'Global / Unassigned').trim();
                
                getWh(srcWh).transferredOut = (getWh(srcWh).transferredOut || 0) + qty;
                getWh(destWh).transferredIn = (getWh(destWh).transferredIn || 0) + qty;
              }
            });
          });

          // 6. Committed Stock (Hold Units from Delivery Challans)
          let totalHold = 0;
          (deliveryChallans || []).forEach((dc: any) => {
            const statusClean = String(dc.status || '').trim().toLowerCase();
            if (statusClean !== 'cancel' && statusClean !== 'deleted') {
              const itemsArray = Array.isArray(dc.items) ? dc.items : (typeof dc.items === 'string' ? JSON.parse(dc.items || '[]') : []);
              itemsArray.forEach((item: any) => {
                const dcName = String(item.product_name || item.itemName || item.pDescription || '').trim().toLowerCase();
                if (dcName === name || dcName.includes(name)) {
                  const orderQty = Number(item.orderQty ?? item.qty ?? 0);
                  const dispatchedQty = Number(item.dispatchedQty ?? (statusClean === 'approved' || statusClean === 'dispatched' || statusClean === 'fully dispatched' ? orderQty : 0));
                  let holdQty = 0;
                  if (statusClean === 'pending approval' || statusClean === 'pending') {
                    holdQty = orderQty;
                  } else {
                    holdQty = Number(item.holdQty !== undefined ? item.holdQty : Math.max(0, orderQty - dispatchedQty));
                  }
                  totalHold += holdQty;
                  getWh(item.warehouse || item.location || dc.dispatch_warehouse || dc.warehouse || 'Global / Unassigned').hold += holdQty;
                }
              });
            }
          });

          // The mathematically accurate formula matching reports
          // Rejected items are excluded from physical/available stock
          const trueRemainingStock = (liveStock + totalPurchased + totalSalesReturned) - totalSold - totalPurchaseReturned - totalRejected;

          const onHandStock = trueRemainingStock + totalHold;

          // Process the warehouseBreakdowns object to calculate onHand and available for each
          const finalWhBreakdowns: Record<string, any> = {};
          Object.keys(whBreakdowns).forEach(key => {
            const w = whBreakdowns[key];
            const transferredIn = w.transferredIn || 0;
            const transferredOut = w.transferredOut || 0;
            const wAvailable = (w.opening + w.purchased + w.salesReturned + transferredIn) - w.sold - w.purchaseReturned - (w.rejected || 0) - transferredOut;
            const wOnHand = wAvailable + w.hold;
            finalWhBreakdowns[key] = {
              ...w,
              opening: w.opening, // This is the actual opening_stocks table value
              transferredIn,
              transferredOut,
              available: wAvailable,
              onHand: wOnHand,
              rejected: w.rejected || 0,
              purchaseHold: w.purchaseHold || 0
            };
          });

          return {
            ...product,
            current_stock: trueRemainingStock,
            breakdown: {
              opening: liveStock,
              purchased: totalPurchased,
              purchaseHold: totalPurchaseHold,
              sold: totalSold,
              salesReturned: totalSalesReturned,
              purchaseReturned: totalPurchaseReturned,
              hold: totalHold,
              rejected: totalRejected,
              onHand: onHandStock,
              available: trueRemainingStock
            },
            warehouseBreakdowns: finalWhBreakdowns
          };
        });

        setProducts(unifiedProductPayload);
      } else {
        setProducts([]);
      }
    } catch (err: any) {
      toast.error('Data Fetching Failure: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Server-side pagination (only the current page is loaded) ----
  const PRODUCT_PAGE_COLS = 'id, product_name, item_sr_no, category, sub_category, sub_sub_category, bin, uom, retail_price, purchase_price, mrp, min_stock_alert, product_description, item_type, pieces_per_box, pcs_per_box, pieces_per_packing, scenario_name, service_charges';

  const stockForProduct = (productName: string) => {
    const n = String(productName || '').trim().toLowerCase();
    const rows = (serverBalances || []).filter((r) => String(r.product_name || '').trim().toLowerCase() === n);
    const byWh: Record<string, any> = {};
    let total = 0;
    rows.forEach((r) => {
      const qty = Number(r.quantity) || 0;
      total += qty;
      const wh = String(r.warehouse_name || 'Global / Unassigned').trim();
      byWh[wh] = { opening: 0, purchased: 0, sold: 0, salesReturned: 0, purchaseReturned: 0, hold: 0, rejected: 0, transferredIn: 0, transferredOut: 0, available: qty, onHand: qty };
    });
    return { total, byWh };
  };

  const applyFilters = (q: any, term: string) => {
    const t = term.trim();
    if (!t) return q;
    const esc = t.replace(/[%_\\]/g, (m) => `\\${m}`);
    return q.or(`product_name.ilike.%${esc}%,item_sr_no.ilike.%${esc}%,category.ilike.%${esc}%,product_description.ilike.%${esc}%`);
  };

  const loadServerPage = async () => {
    if (!serverMode) return;
    try {
      setLoading(true);
      const term = debouncedSearch || '';
      const sortKey = sortConfig?.key || 'created_at';
      // No explicit sort = newest products first (created_at desc)
      const asc = sortConfig ? sortConfig.direction !== 'desc' : false;

      // Count filtered rows first (same filters, no page)
      let countQ = supabase.from('products').select('id', { count: 'exact', head: true });
      countQ = applyFilters(countQ, term);
      const { count } = await countQ;

      const total = count ?? 0;
      setServerTotalEntries(total);

      if (total === 0) {
        setProducts([]);
        return;
      }

      const stockSort = sortKey === 'current_stock';

      if (stockSort) {
        // Sorting by stock: fetch all matching ids, sort by balances, then take the page
        let allQ = supabase.from('products').select('id, product_name');
        allQ = applyFilters(allQ, term);
        const { data: allRows } = await allQ;

        const enriched = (allRows || []).map((p: any) => ({ p, stock: stockForProduct(p.product_name).total }));
        enriched.sort((a, b) =>
          asc ? a.stock - b.stock : b.stock - a.stock
        );

        const pageIds = enriched.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((x) => x.p.id);
        if (pageIds.length === 0) {
          setProducts([]);
          return;
        }

        let detQ = supabase.from('products').select(PRODUCT_PAGE_COLS);
        detQ = applyFilters(detQ, term);
        const { data: details } = await detQ;
        const byId: Record<string, any> = {};
        (details || []).forEach((d: any) => { byId[d.id] = d; });

        const sortedPage = enriched
          .filter((x) => pageIds.includes(x.p.id))
          .sort((a, b) => (asc ? a.stock - b.stock : b.stock - a.stock))
          .map((x) => byId[x.p.id])
          .filter(Boolean);

        setProducts(sortedPage.map((row: any) => {
          const { total: stock, byWh } = stockForProduct(row.product_name);
          return {
            ...row,
            current_stock: stock,
            breakdown: { opening: 0, purchased: 0, sold: 0, salesReturned: 0, purchaseReturned: 0, hold: 0, rejected: 0, onHand: stock, available: stock },
            warehouseBreakdowns: byWh,
          };
        }));
        return;
      }

      // Normal: one DB call returns this page's rows
      let q = supabase.from('products').select(PRODUCT_PAGE_COLS);
      q = applyFilters(q, term);
      q = q.order(sortKey, { ascending: asc });
      q = q.range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      const { data, error } = await q;
      if (error) throw error;

      setProducts((data || []).map((row: any) => {
        const { total: stock, byWh } = stockForProduct(row.product_name);
        return {
          ...row,
          current_stock: stock,
          breakdown: { opening: 0, purchased: 0, sold: 0, salesReturned: 0, purchaseReturned: 0, hold: 0, rejected: 0, onHand: stock, available: stock },
          warehouseBreakdowns: byWh,
        };
      }));
    } catch (err: any) {
      toast.error('Data Fetching Failure: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Open the breakdown modal; in server mode fetch the real details on demand
  const handleOpenBreakdown = async (product: any) => {
    setSelectedModalWarehouse('ALL');
    if (!serverMode) {
      setSelectedStockBreakdown(product);
      return;
    }
    setSelectedStockBreakdown({ ...product, _loading: true });
    try {
      const detail = await getDetailedBreakdown(product.product_name);
      setSelectedStockBreakdown({
        ...product,
        breakdown: detail.breakdown,
        warehouseBreakdowns: detail.warehouseBreakdowns,
        _loading: false,
      });
    } catch (err: any) {
      toast.error('Breakdown load failed: ' + err.message);
      setSelectedStockBreakdown({ ...product, _loading: false });
    }
  };

  const handleDeleteProduct = async (id: string | number) => {
    if (!window.confirm('Are you certain you want to delete this product catalog entry?')) return;
    try {
      const targetProd = products.find((p) => String(p.id) === String(id));
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;

      logActivity({
        action: 'DELETE',
        tableName: 'products',
        details: {
          product_name: targetProd?.product_name || id,
          item_code: targetProd?.item_sr_no,
          category: targetProd?.category,
          event: 'Deleted Product Master'
        },
        performedBy: user?.name || user?.email || 'User'
      });

      toast.success('Product removed from database catalog successfully.');
      if (serverMode) {
        const remainingOnPage = products.length - 1;
        if (remainingOnPage === 0 && currentPage > 1) {
          setCurrentPage((p) => p - 1);
        } else {
          loadServerPage();
        }
      } else {
        fetchInventoryProducts();
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // In server mode the filtering/sorting/paging already happened in the DB —
  // `products` is exactly the current page. Otherwise keep the legacy behavior.
  let filteredProducts = serverMode
    ? products
    : products.filter(p => {
        return p.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.item_sr_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.product_description?.toLowerCase().includes(searchTerm.toLowerCase());
      });

  if (!serverMode && sortConfig !== null) {
    filteredProducts.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle numeric values
      if (['purchase_price', 'retail_price', 'mrp', 'current_stock'].includes(sortConfig.key)) {
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
      } else {
        // String handling
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  } const totalEntries = serverMode ? serverTotalEntries : filteredProducts.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedProducts = serverMode ? filteredProducts : filteredProducts.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, pageSize, sortConfig]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const goodsItems = paginatedProducts.filter(p => (p.item_type || 'goods') === 'goods');
  const serviceItems = paginatedProducts.filter(p => p.item_type === 'service');

  const renderProductRow = (product: any, serialNumber: number) => {
    const currentStock = Number(product.current_stock || 0);
    const minAlert = Number(product.min_stock_alert ?? product.min_stock ?? 0);
    const isZeroStock = currentStock <= 0;
    const isLowStock = minAlert > 0 && currentStock <= minAlert && !isZeroStock;

    let badgeClass = 'bg-green-500/15 text-green-600 dark:bg-green-950/40 dark:text-green-400 border border-green-500/30';
    if (isZeroStock) {
      badgeClass = 'bg-red-600/20 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-600/40 font-black';
    } else if (isLowStock) {
      badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold';
    }

    return (
      <tr
        key={product.id}
        className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 duration-150 text-xs"
      >
        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono">{serialNumber}</td>
        <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">{product.item_sr_no || '-'}</td>
        <td
          className="py-3.5 px-4 font-bold text-primary dark:text-blue-400 cursor-pointer hover:underline"
          onClick={() => setSelectedQuickViewProduct(product)}
        >
          {product.product_name}
        </td>
        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 font-medium">{product.category || '-'}</td>
        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">{product.sub_category || '-'}</td>
        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-500 text-[11px]">{product.sub_sub_category || '-'}</td>
        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">{product.bin || '-'}</td>
        <td className="py-3.5 px-4 text-center">
          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
            {product.uom}
          </span>
        </td>
        <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
          {Number(product.retail_price || product.mrp || 0).toFixed(2)}
        </td>
        <td className="py-3.5 px-4 text-center">
          <span className={`font-black text-xs px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${badgeClass}`}>
            {currentStock.toLocaleString()} {product.uom || 'PCS'}
            {isLowStock && <MdWarning size={14} className="text-amber-600 dark:text-amber-400 inline shrink-0" />}
          </span>
          <button onClick={() => handleOpenBreakdown(product)} className="text-[9px] font-sans text-green-600 dark:text-green-400 hover:underline cursor-pointer block mx-auto mt-0.5">View Breakdown</button>
        </td>
        <td className="py-3.5 px-4 text-center">
          <TableActions
            onEdit={() => navigate('/Administration/Products/Add', { state: { product } })}
            onDelete={() => handleDeleteProduct(product.id)}
            editTitle="Edit Product"
            deleteTitle="Delete Product"
          />
        </td>
      </tr>
    );
  };

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-slate-800 dark:text-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            Product Stock Inventory
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Master item catalog, stock availability & pricing ledger</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/Administration/Products/Add')}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 px-4 text-xs font-bold text-white hover:bg-emerald-700 transition duration-150 shadow-sm hover:shadow-md cursor-pointer"
          >
            <span>+ Add Product</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800/80 dark:bg-[#111827] p-5 sm:p-6">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-5 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Catalog Inventory Overview
          </span>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono">
            {(serverMode ? totalEntries : products.length)} Products Registered
          </span>
        </div>


        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-5">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-200 py-1.5 px-2.5 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 outline-none focus:border-emerald-600 text-xs font-bold text-slate-800 dark:text-white transition"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size} className="dark:bg-slate-800">
                  {size}
                </option>
              ))}
            </select>
            <span>entries</span>
          </div>
          <div className="flex items-center gap-2 text-xs w-full sm:w-auto text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Search:</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search product, category, code, brand..."
              className="w-full sm:w-72 rounded-xl border border-slate-200 py-2 px-3.5 bg-slate-50/50 dark:bg-slate-800/60 dark:border-slate-700 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 text-xs text-slate-800 dark:text-white transition"
            />
          </div>
        </div>

        <div className="max-w-full overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                <th className="py-3.5 px-4 w-16 whitespace-nowrap">S#</th>
                <th className="py-3.5 px-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('item_sr_no')}>Code <span className={sortConfig?.key === 'item_sr_no' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'item_sr_no' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('product_name')}>Description <span className={sortConfig?.key === 'product_name' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'product_name' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('category')}>Category <span className={sortConfig?.key === 'category' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'category' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('sub_category')}>Sub Cat <span className={sortConfig?.key === 'sub_category' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'sub_category' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('sub_sub_category')}>Parent Cat <span className={sortConfig?.key === 'sub_sub_category' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'sub_sub_category' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('bin')}>Brand <span className={sortConfig?.key === 'bin' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'bin' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 w-24 text-center cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('uom')}>UOM <span className={sortConfig?.key === 'uom' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'uom' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 text-right cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('retail_price')}>Sale Price <span className={sortConfig?.key === 'retail_price' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'retail_price' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 text-center w-36 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('current_stock')}>Available Stock <span className={sortConfig?.key === 'current_stock' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'current_stock' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 w-24 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-sm">
                    <Spinner />
                  </td>
                </tr>
              ) : paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-xs text-slate-400 italic">
                    No product items registered.
                  </td>
                </tr>
              ) : (
                <>
                  {goodsItems.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={11} className="py-2 px-4 bg-emerald-50 dark:bg-emerald-950/30 border-y border-emerald-200/60 dark:border-emerald-900/60">
                          <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            📦 Goods Items <span className="font-normal opacity-60">({goodsItems.length})</span>
                          </span>
                        </td>
                      </tr>
                      {goodsItems.map((product, idx) => renderProductRow(product, startIndex + idx + 1))}
                    </>
                  )}
                  {serviceItems.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={11} className="py-2 px-4 bg-indigo-50 dark:bg-indigo-950/30 border-y border-indigo-200/60 dark:border-indigo-900/60">
                          <span className="text-[11px] font-extrabold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                            🛠️ Service Items <span className="font-normal opacity-60">({serviceItems.length})</span>
                          </span>
                        </td>
                      </tr>
                      {serviceItems.map((product, idx) => renderProductRow(product, startIndex + goodsItems.length + idx + 1))}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{startIndex + 1}</span> to{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{endIndex}</span> of{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{totalEntries}</span> entries
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold disabled:opacity-40 cursor-pointer text-xs"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 font-bold text-teal-600 text-xs">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold disabled:opacity-40 cursor-pointer text-xs"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Stock Breakdown Modal */}
      {selectedStockBreakdown && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-boxdark rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] border border-slate-200 dark:border-strokedark overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-strokedark bg-slate-50 dark:bg-meta-4/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg">
                  <MdInfoOutline size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800 dark:text-white text-sm leading-tight">
                    Stock Breakdown
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate" title={selectedStockBreakdown.product_name}>
                    {selectedStockBreakdown.product_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStockBreakdown(null)}
                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
              >
                <MdClose size={20} />
              </button>
            </div>

            {/* Warehouse Switcher */}
            <div className="px-5 pt-4">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Select Location:</label>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {(() => {
                  const hasUnassigned = Object.keys(selectedStockBreakdown.warehouseBreakdowns || {}).includes('Global / Unassigned');
                  const tabs = ['ALL', ...masterLocations.filter(m => m), ...(hasUnassigned ? ['Global / Unassigned'] : [])];

                  // Ensure we don't have duplicate tabs if masterLocations already had it
                  const uniqueTabs = Array.from(new Set(tabs));

                  return uniqueTabs.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSelectedModalWarehouse(tab)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition ${selectedModalWarehouse === tab ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'bg-white dark:bg-boxdark border-slate-200 dark:border-strokedark text-slate-500 dark:text-slate-400 hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-600'}`}
                    >
                      {tab === 'Global / Unassigned' ? 'Unassigned / Unknown' : tab}
                    </button>
                  ));
                })()}
              </div>
            </div>

            {(() => {
              if (selectedStockBreakdown._loading) {
                return <div className="p-10 flex justify-center"><Spinner /></div>;
              }
              const isTile = Boolean(
                (String(selectedStockBreakdown.category || '').toLowerCase().includes('tile') ||
                  String(selectedStockBreakdown.scenario_name || '').toLowerCase().includes('tile')) &&
                (Number(selectedStockBreakdown.pieces_per_box || selectedStockBreakdown.pcs_per_box || 0) > 1 || String(selectedStockBreakdown.scenario_name || '').toLowerCase().includes('tile'))
              );
              const rawPcs = Number(selectedStockBreakdown.pieces_per_box || selectedStockBreakdown.pcs_per_box || 0);
              const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);

              const formatVal = (val: number) => {
                if (isTile && pcsPerBox > 1) {
                  const totalPieces = Math.round(val * pcsPerBox);
                  const b = Math.floor(totalPieces / pcsPerBox);
                  const p = totalPieces % pcsPerBox;
                  return (
                    <div className="text-right flex flex-col items-end">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{b} Boxes</span>
                      {p > 0 && <span className="text-[9px] font-bold text-slate-400">+{p} Pcs</span>}
                    </div>
                  );
                }
                return <span className="font-bold text-slate-700 dark:text-slate-200">{val.toLocaleString()} {selectedStockBreakdown.uom || 'PCS'}</span>;
              };

              const bData = selectedModalWarehouse === 'ALL'
                ? selectedStockBreakdown.breakdown || {}
                : selectedStockBreakdown.warehouseBreakdowns?.[selectedModalWarehouse] || { opening: 0, purchased: 0, sold: 0, salesReturned: 0, purchaseReturned: 0, hold: 0, available: 0, onHand: 0 };

              return (
                <>
                  <div className="p-5 flex flex-col gap-3 font-sans overflow-y-auto flex-1 min-h-0">
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-strokedark/50">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Opening Stock</span>
                      {formatVal(bData.opening || 0)}
                    </div>
                    
                    {selectedModalWarehouse !== 'ALL' && (
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-strokedark/50">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-slate-400">Transfer Received: <span className="text-emerald-500">+{bData.transferredIn || 0}</span></span>
                          <span className="text-[10px] font-bold text-slate-400">Transfer Sent: <span className="text-rose-400">-{bData.transferredOut || 0}</span></span>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-strokedark/50">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Purchases</span>
                        <span className="text-[9px] font-bold text-rose-500 mt-0.5 tracking-wide">
                          (Returned: {bData.purchaseReturned || 0})
                        </span>
                      </div>
                      {formatVal(bData.purchased || 0)}
                    </div>
                    {/* Purchase / QC hold (from GRN) */}
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-strokedark/50 bg-yellow-50/50 dark:bg-yellow-900/10 px-3 -mx-3 rounded-lg mb-1">
                      <span className="text-[9px] font-bold text-yellow-800 dark:text-yellow-600 mt-0.5 tracking-wide">Hold (QC / Purchase)</span>
                      <div className="text-yellow-700 dark:text-yellow-500">{formatVal(bData.purchaseHold || 0)}</div>
                    </div>

                    {/* Rejected (QC Failed) */}
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-strokedark/50 bg-rose-50/50 dark:bg-rose-900/10 px-3 -mx-3 rounded-lg mb-1">
                      <span className="text-[9px] font-bold text-rose-700 dark:text-yellow-600 mt-0.5 tracking-wide">Rejected (QC Failed)</span>
                      <div className="text-rose-700 dark:text-rose-500">{formatVal(bData.rejected || 0)}</div>
                    </div>

                    {/* Total Sales */}
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-strokedark/50">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Sales</span>
                        <span className="text-[9px] font-bold text-rose-500 mt-0.5 tracking-wide">
                          (Returned: {bData.salesReturned || 0})
                        </span>
                      </div>
                      {formatVal(bData.sold || 0)}
                    </div>

                    {/* Sales / delivery hold */}
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-strokedark/50 bg-yellow-50/50 dark:bg-yellow-900/10 px-3 -mx-3 rounded-lg mb-1">
                      <span className="text-[9px] font-bold text-yellow-800 dark:text-yellow-600 mt-0.5 tracking-wide">Hold (Committed Sales)</span>
                      <div className="text-yellow-700 dark:text-yellow-500">{formatVal(bData.hold || 0)}</div>
                    </div>

                  </div>

                  {/* Sticky Footer for Available Stock & Close Button */}
                  <div className="p-4 bg-slate-50 dark:bg-meta-4/30 border-t border-slate-100 dark:border-strokedark flex flex-col gap-4 shrink-0">
                    <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-900/20 px-4 py-3 rounded-xl border border-blue-100 dark:border-blue-800/50 shadow-sm">
                      <span className="text-sm font-black tracking-tight text-blue-800 dark:text-blue-400">Available Stock <span className="text-[10px] font-bold opacity-70">(To Sell)</span></span>
                      <div className="text-blue-700 dark:text-blue-400">{formatVal(bData.available || 0)}</div>
                    </div>
                    
                    <div className="flex justify-end">
                      <button
                        onClick={() => setSelectedStockBreakdown(null)}
                        className="px-6 py-2 bg-white dark:bg-boxdark border border-slate-200 dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition shadow-sm w-full sm:w-auto"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Quick View Modal */}
      {selectedQuickViewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-boxdark rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 dark:border-strokedark flex flex-col max-h-[90vh]">
            <div className="p-5 flex justify-between items-center bg-slate-50 dark:bg-meta-4/30 border-b border-slate-100 dark:border-strokedark">
              <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                <MdInfoOutline className="text-primary text-xl" />
                Product Details
              </h3>
              <button
                onClick={() => setSelectedQuickViewProduct(null)}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-meta-4 rounded-full transition-colors text-slate-500"
              >
                <MdClose size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <div className="mb-4">
                <h4 className="text-xl font-black text-slate-900 dark:text-white leading-tight">{selectedQuickViewProduct.product_name}</h4>
                <div className="flex gap-2 mt-2 font-mono text-[10px] uppercase font-bold text-slate-500">
                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">SKU: {selectedQuickViewProduct.item_sr_no || 'N/A'}</span>
                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">Category: {selectedQuickViewProduct.category || 'General'}</span>
                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">UOM: {selectedQuickViewProduct.uom || 'PCS'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cost Price</div>
                  <div className="text-lg font-black text-slate-700 dark:text-slate-200 font-mono">Rs. {Number(selectedQuickViewProduct.purchase_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sale Price (MRP)</div>
                  <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">Rs. {Number(selectedQuickViewProduct.retail_price || selectedQuickViewProduct.mrp || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50">
                  <span className="text-xs font-semibold text-slate-500">Brand Allocation</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{selectedQuickViewProduct.bin || 'Unassigned'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50">
                  <span className="text-xs font-semibold text-slate-500">Dimensions</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{selectedQuickViewProduct.dimensions || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50">
                  <span className="text-xs font-semibold text-slate-500">Weight</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{selectedQuickViewProduct.weight || 'N/A'}</span>
                </div>
                <div className="py-2">
                  <span className="text-xs font-semibold text-slate-500 block mb-1">Description</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg whitespace-pre-wrap">
                    {selectedQuickViewProduct.product_description || selectedQuickViewProduct.product_name || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-meta-4/30 border-t border-slate-100 dark:border-strokedark flex justify-between items-center">
              <button
                onClick={() => {
                  setSelectedQuickViewProduct(null);
                  navigate('/Administration/Products/Add', { state: { product: selectedQuickViewProduct } });
                }}
                className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition"
              >
                Edit Product
              </button>
              <button
                onClick={() => setSelectedQuickViewProduct(null)}
                className="px-4 py-2 bg-white dark:bg-boxdark border border-slate-200 dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductList;
