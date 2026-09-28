import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import TableActions from '../../../ui/TableActions';
import { useAuth } from '../../../Context/Auth';
import { useModal } from '../../../Context/Modal';
import { MdStore, MdPerson, MdEvent } from 'react-icons/md';
import PurchaseStockModal from './PurchaseStockModal';

const PurchaseList = () => {
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const { showModal, hideModal } = useModal();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseAllocationsMap, setPurchaseAllocationsMap] = useState<Record<string, { totalPaid: number; due: number }>>({});
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchProcurementLogs = async () => {
    try {
      setLoading(true);
      const { data: purData, error: purError } = await supabase
        .from('supplier_purchases')
        .select('*')
        .order('created_at', { ascending: false });

      if (purError) throw purError;

      const { data: vouchersData } = await supabase
        .from('financial_vouchers')
        .select('*')
        .or('voucher_type.eq.Cash Payment Voucher,voucher_type.eq.Bank Payment Voucher,voucher_type.eq.Cash & Bank Payment Voucher');

      const { data: pReturnsData } = await supabase
        .from('purchase_returns')
        .select('*');

      // Group purchases by vendor
      const purchasesByVendor: Record<string, any[]> = {};
      (purData || []).forEach(p => {
        const vKey = (p.supplier_name || p.vendor_name || 'General Vendor').trim().toLowerCase();
        if (!purchasesByVendor[vKey]) purchasesByVendor[vKey] = [];
        purchasesByVendor[vKey].push(p);
      });

      const allocMap: Record<string, { totalPaid: number; due: number }> = {};

      // For each vendor, allocate vouchers + returns (specific + general unallocated FIFO)
      Object.keys(purchasesByVendor).forEach(vKey => {
        const vendorPurs = [...purchasesByVendor[vKey]].sort((a, b) => {
          const timeA = new Date(a.purchase_date || a.created_at || 0).getTime();
          const timeB = new Date(b.purchase_date || b.created_at || 0).getTime();
          if (timeA !== timeB) return timeA - timeB;

          const createdA = new Date(a.created_at || 0).getTime();
          const createdB = new Date(b.created_at || 0).getTime();
          if (createdA !== createdB) return createdA - createdB;

          return (Number(a.id) || 0) - (Number(b.id) || 0);
        });

        const vendorVouchers = (vouchersData || []).filter(v => {
          const vName = (v.customer_name || v.customerName || v.vendor_name || v.vendorName || '').trim().toLowerCase();
          return vName === vKey || vName.includes(vKey) || vKey.includes(vName);
        });

        const vendorReturns = (pReturnsData || []).filter(r => {
          const rName = (r.vendor_name || r.vendorName || r.supplier_name || '').trim().toLowerCase();
          return (rName === vKey || rName.includes(vKey) || vKey.includes(rName)) && String(r.status || '').toLowerCase() !== 'cancel';
        });

        const poAlloc: Record<string, { gross: number; upfront: number; specificVouchers: number; specificReturns: number; generalAllocated: number; totalPaid: number; due: number }> = {};
        let unallocatedGeneral = 0;

        vendorPurs.forEach(p => {
          const key = p.purchase_no || String(p.id);
          const rawId = String(p.id);
          const gross = Number(p.total_amount) || 0;
          const upfront = Number(p.cash_amount_paid || 0) + Number(p.bank_amount_paid || 0);

          const initObj = { gross, upfront, specificVouchers: 0, specificReturns: 0, generalAllocated: 0, totalPaid: upfront, due: Math.max(0, gross - upfront) };
          poAlloc[key] = initObj;
          poAlloc[rawId] = initObj;
        });

        // 1. Allocate Vouchers
        vendorVouchers.forEach(v => {
          const vAmt = Number(v.total_amount) || 0;
          const vPoRef = v.original_invoice_no || v.metadata?.linkedPurchaseNo || '';
          if (vPoRef) {
            const cleanId = String(vPoRef).replace(/\D/g, '');
            const matched = vendorPurs.find(p => p.purchase_no === vPoRef || String(p.id) === cleanId);
            if (matched && poAlloc[matched.purchase_no || String(matched.id)]) {
              poAlloc[matched.purchase_no || String(matched.id)].specificVouchers += vAmt;
            } else {
              unallocatedGeneral += vAmt;
            }
          } else {
            unallocatedGeneral += vAmt;
          }
        });

        // 2. Allocate Returns (Debit Notes) item-by-item
        vendorReturns.forEach(r => {
          const matchedInvoices = r.metadata?.matchedInvoices;
          if (Array.isArray(matchedInvoices) && matchedInvoices.length > 0) {
            matchedInvoices.forEach((mi: any) => {
              const poTarget = mi.purchase_no;
              const val = Number(mi.deducted_value || (Number(mi.deducted_qty || 0) * Number(mi.invoice_rate || mi.entered_rate || 0)) || 0);
              const cleanId = String(poTarget).replace(/\D/g, '');
              const matched = vendorPurs.find(p => p.purchase_no === poTarget || String(p.id) === cleanId);
              if (matched && poAlloc[matched.purchase_no || String(matched.id)]) {
                poAlloc[matched.purchase_no || String(matched.id)].specificReturns += val;
              } else {
                unallocatedGeneral += val;
              }
            });
          } else {
            const rAmt = Number(r.total_amount) || 0;
            const rPoRef = r.purchase_no || r.original_invoice_no || r.metadata?.linkedPurchaseNo || '';
            if (rPoRef) {
              const cleanId = String(rPoRef).replace(/\D/g, '');
              const matched = vendorPurs.find(p => p.purchase_no === rPoRef || String(p.id) === cleanId);
              if (matched && poAlloc[matched.purchase_no || String(matched.id)]) {
                poAlloc[matched.purchase_no || String(matched.id)].specificReturns += rAmt;
              } else {
                unallocatedGeneral += rAmt;
              }
            } else {
              unallocatedGeneral += rAmt;
            }
          }
        });

        // 3. FIFO Distribute Unallocated General Vouchers & Returns across oldest open POs
        let genRemaining = unallocatedGeneral;
        vendorPurs.forEach(p => {
          const key = p.purchase_no || String(p.id);
          const alloc = poAlloc[key];
          if (alloc) {
            const dueBeforeGen = Math.max(0, alloc.gross - alloc.upfront - alloc.specificVouchers - alloc.specificReturns);
            if (dueBeforeGen > 0 && genRemaining > 0) {
              const toDist = Math.min(dueBeforeGen, genRemaining);
              alloc.generalAllocated += toDist;
              genRemaining -= toDist;
            }
            alloc.totalPaid = alloc.upfront + alloc.specificVouchers + alloc.specificReturns + alloc.generalAllocated;
            alloc.due = Math.max(0, alloc.gross - alloc.totalPaid);

            allocMap[key] = { totalPaid: alloc.totalPaid, due: alloc.due, returned: alloc.specificReturns, generalAllocated: alloc.generalAllocated, specificVouchers: alloc.specificVouchers };
            allocMap[String(p.id)] = { totalPaid: alloc.totalPaid, due: alloc.due, returned: alloc.specificReturns, generalAllocated: alloc.generalAllocated, specificVouchers: alloc.specificVouchers };
            if (p.purchase_no) {
              allocMap[p.purchase_no] = { totalPaid: alloc.totalPaid, due: alloc.due, returned: alloc.specificReturns, generalAllocated: alloc.generalAllocated, specificVouchers: alloc.specificVouchers };
            }
          }
        });
      });

      setPurchaseAllocationsMap(allocMap);
      setPurchases(purData || []);
    } catch (err: any) {
      toast.error('Data Fetching Failure: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcurementLogs();
  }, []);

  const handleDeletePurchaseRecord = async (id: string | number) => {
    if (!window.confirm('Are you certain you want to permanently erase this consignment registry? Shelf stock allocations will reverse!')) return;

    try {
      const { data: targetRecord } = await supabase.from('supplier_purchases').select('items, target_warehouse, metadata').eq('id', id).single();
      
      // PRE-DELETION STOCK VALIDATION
      // Rule: Allow deletion ONLY if current breakdown EXACTLY matches the purchase bill.
      // Uses dynamic stock calculation (same as ProductList) instead of static warehouse_inventory table.
      if (targetRecord?.items) {
        let grnItems: any[] = [];
        if (targetRecord.metadata?.grn_id) {
          const { data: gi } = await supabase.from('grn_items').select('*').eq('grn_id', targetRecord.metadata.grn_id);
          grnItems = gi || [];
        }

        // Helper: format qty with UOM label
        const fmtQty = (qty: number, uom: string): string => {
          let u = (uom || 'unit').toUpperCase();
          if (qty !== 1) {
            if (u === 'BOX') u = 'BOXES';
            else if (u === 'EACH') u = 'UNITS';
            else if (!u.endsWith('S')) u += 'S';
          }
          return `${qty} ${u}`;
        };

        // Helper: dynamically calculate available stock for a product (product-level, not warehouse-specific)
        // Returns { available, uom } based on ALL transactions for that product name
        const getDynamicStock = async (productName: string): Promise<{ available: number; uom: string }> => {
          const pNameLower = productName.trim().toLowerCase();

          // Fetch product UOM
          const { data: prodData } = await supabase.from('products').select('uom').ilike('product_name', productName).maybeSingle();
          const uom = prodData?.uom || 'unit';

          // 1. Opening stock (product-level)
          const { data: openStocks } = await supabase.from('opening_stocks').select('*');
          let opening = 0;
          (openStocks || []).forEach((os: any) => {
            const osName = String(os.product_name || os.item_name || '').trim().toLowerCase();
            if (osName === pNameLower || osName.includes(pNameLower)) {
              opening += Number(os.quantity || os.qty || 0);
            }
          });

          // 2. All GRN accepted qty INCLUDING this purchase's GRN
          const { data: allGrnItems } = await supabase.from('grn_items').select('*, grn_receipts(status)');
          let totalPurchased = 0;
          (allGrnItems || []).forEach((gi: any) => {
            const grnStatus = gi.grn_receipts?.status || '';
            if (!['Confirm', 'Partially Received', 'Billed'].includes(grnStatus)) return;
            const giName = String(gi.product_name || '').trim().toLowerCase();
            if (giName === pNameLower || giName.includes(pNameLower)) {
              totalPurchased += Number(gi.accepted_qty ?? gi.qty ?? 0);
            }
          });

          // 3. Total sales (product-level, not warehouse-specific)
          const { data: sales } = await supabase.from('sales_invoices').select('items, sale_status');
          let totalSold = 0;
          (sales || []).forEach((s: any) => {
            if (['cancel', 'deleted'].includes(String(s.sale_status || '').toLowerCase())) return;
            const itemsArr = Array.isArray(s.items) ? s.items : [];
            itemsArr.forEach((si: any) => {
              const siName = String(si.product_name || si.itemName || '').trim().toLowerCase();
              if (siName === pNameLower || siName.includes(pNameLower)) {
                totalSold += Number(si.qty || si.quantity || 0);
              }
            });
          });

          // 4. Sales returns
          const { data: sReturns } = await supabase.from('sales_returns').select('items, status');
          let totalSalesReturned = 0;
          (sReturns || []).forEach((sr: any) => {
            if (String(sr.status || '').toLowerCase() === 'cancel') return;
            const itemsArr = Array.isArray(sr.items) ? sr.items : [];
            itemsArr.forEach((si: any) => {
              const siName = String(si.product_name || si.itemName || '').trim().toLowerCase();
              if (siName === pNameLower || siName.includes(pNameLower)) {
                totalSalesReturned += Number(si.qty || si.quantity || 0);
              }
            });
          });

          // 5. Purchase returns
          const { data: pReturns } = await supabase.from('purchase_returns').select('items, status');
          let totalPurchaseReturned = 0;
          (pReturns || []).forEach((pr: any) => {
            if (['cancel', 'deleted'].includes(String(pr.status || '').toLowerCase())) return;
            const itemsArr = Array.isArray(pr.items) ? pr.items : [];
            itemsArr.forEach((pi: any) => {
              const piName = String(pi.product_name || pi.itemName || '').trim().toLowerCase();
              if (piName === pNameLower || piName.includes(pNameLower)) {
                totalPurchaseReturned += Number(pi.qty || pi.quantity || 0);
              }
            });
          });

          const available = (opening + totalPurchased + totalSalesReturned) - totalSold - totalPurchaseReturned;
          return { available, uom };
        };

        for (const item of targetRecord.items) {
          const pName = item.itemName || item.product_name;
          if (!pName) continue;

          if (targetRecord.metadata?.grn_id) {
            const gItem = grnItems.find(g =>
              String(g.product_name || '').toLowerCase() === String(pName).toLowerCase()
            );

            if (gItem) {
              const acceptedQty = Number(gItem.accepted_qty ?? 0);

              // Block deletion if any items have already been approved in inward
              if (acceptedQty > 0) {
                toast.error(
                  `Cannot Delete Purchase\n\nProduct: "${pName}" has ${acceptedQty} units already approved in Inward Challan.\n\nPlease raise a Purchase Return instead.`,
                  { duration: 7000 }
                );
                return;
              }

              const grnRejected = Number(gItem.rejected_qty ?? 0);
              const billQty     = Number(item.qty || item.quantity || 0);
              const expectedRej = billQty - acceptedQty;

              // Check 1: Dynamically calculate current available stock and verify >= accepted_qty
              if (acceptedQty > 0) {
                const stockData = await getDynamicStock(pName);
                const currentAvailable = stockData.available;
                const formattedStock = fmtQty(currentAvailable, stockData.uom);
                const formattedReq = fmtQty(acceptedQty, stockData.uom);

                if (currentAvailable < acceptedQty) {
                  toast.error(
                    `Cannot Delete Purchase\n\nDeletion blocked because some units have already been sold or transferred.`,
                    { duration: 6000 }
                  );
                  return;
                }
              }

              // Check 2: GRN rejected qty mismatch — only relevant if GRN was actually verified (acceptedQty > 0)
              if (acceptedQty > 0 && expectedRej > 0 && grnRejected !== expectedRej) {
                toast.error(
                  `Cannot Delete Purchase\n\nProduct: "${pName}"\nExpected QC Rejection: ${expectedRej}\nActual GRN Rejection: ${grnRejected}\n\nThe current physical breakdown doesn't match the original purchase bill.`,
                  { duration: 6000 }
                );
                return;
              }
            }
          } else {
            // Non-GRN: dynamically check full qty
            const qtyToReverse  = Number(item.qty || item.quantity || 0);
            if (qtyToReverse > 0) {
              const stockData = await getDynamicStock(pName);
              const currentAvailable = stockData.available;
              const formattedStock = fmtQty(currentAvailable, stockData.uom);
              const formattedReq = fmtQty(qtyToReverse, stockData.uom);

              if (currentAvailable < qtyToReverse) {
                toast.error(
                  `Cannot Delete Purchase\n\nDeletion blocked because some units have already been sold or transferred.`,
                  { duration: 6000 }
                );
                return;
              }
            }
          }
        }
      }
      
      // Only reverse stock if this purchase was NOT linked to a GRN.
      // If it is linked to a GRN, the GRN is the source of physical stock, so deleting the bill shouldn't touch stock.
      if (!targetRecord?.metadata?.grn_id) {
        if (targetRecord?.items) {
          for (const item of targetRecord.items) {
            const qty = Number(item.qty || item.quantity || 0);
            const pName = item.itemName || item.product_name;

            if (pName) {
              // 1. Decrease Master Product Stock (-)
              const { data: prod } = await supabase.from('products').select('current_stock').ilike('product_name', pName).maybeSingle();
              if (prod) {
                const newStock = Math.max(0, (Number(prod.current_stock) || 0) - qty);
                await supabase.from('products').update({ current_stock: newStock }).ilike('product_name', pName);
              }

              // warehouse_inventory retired — formula-based stock is source of truth
            }
          }
        }
      } else {
        // If it was linked to an auto-generated GRN, completely delete the GRN and its items
        // This automatically reverses stock (since stock is calculated dynamically) and removes it from inward queues.
        await supabase.from('grn_items').delete().eq('grn_id', targetRecord.metadata.grn_id);
        await supabase.from('grn_receipts').delete().eq('id', targetRecord.metadata.grn_id);
      }

      const { error } = await supabase.from('supplier_purchases').delete().eq('id', id);
      if (error) throw error;

      toast.success('Procurement consignment record dropped and stock levels reversed safely!');
      fetchProcurementLogs();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredPurchases = purchases.filter(p =>
    (p.purchase_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.target_warehouse || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalEntries = filteredPurchases.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedPurchases = filteredPurchases.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);
  // ── Smart Money Formatter (Hides .00 for whole numbers, shows decimals if fractional) ──
  const formatMoney = (val: number | string | undefined | null): string => {
    const num = Number(val) || 0;
    if (Number.isInteger(num)) {
      return num.toLocaleString('en-US');
    }
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-black dark:text-bodydark text-xs">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black dark:text-white">Wholesale Purchase Log Registry</h2>
          <p className="text-xs text-gray-400">Manage inward vendor supply consignments and trace batch arrivals</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/Purchase/Purchases/Add')}
          className="flex items-center justify-center rounded bg-primary py-2 px-4 text-sm font-medium text-white hover:bg-opacity-90 transition shadow-sm cursor-pointer"
        >
          + Log New Supply
        </button>
      </div>

      <div className="rounded-sm border border-stroke bg-white px-5 pt-6 pb-2.5 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5 xl:pb-1">
        
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded border border-stroke bg-transparent py-1 px-2 outline-none dark:border-strokedark text-xs"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span className="text-xs text-gray-500">entries</span>
          </div>

          <div className="w-full sm:w-auto">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by order # or vendor name..."
              className="w-full sm:w-64 rounded border border-stroke bg-transparent py-1.5 px-3 text-xs outline-none focus:border-primary dark:border-strokedark"
            />
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-2 text-left dark:bg-meta-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                <th className="py-4 px-4 font-semibold w-16 whitespace-nowrap">S#</th>
                <th className="py-4 px-4 font-semibold whitespace-nowrap">Purchase No</th>
                <th className="py-4 px-4 font-semibold whitespace-nowrap">Vendor Profile</th>
                <th className="py-4 px-4 font-semibold whitespace-nowrap">Stock Receiving Location</th>
                <th className="py-4 px-4 font-semibold text-center whitespace-nowrap">Entry Date</th>
                <th className="py-4 px-4 font-semibold text-center whitespace-nowrap">Payment Term</th>
                <th className="py-4 px-4 font-semibold text-right pr-4 whitespace-nowrap">Total Bill</th>
                <th className="py-4 px-4 font-semibold text-right pr-6 whitespace-nowrap">Payment / Due Status</th>
                <th className="py-4 px-4 font-semibold w-24 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-sm"><Spinner /></td></tr>
              ) : paginatedPurchases.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-sm text-gray-500 dark:text-gray-400 italic">No supply restock logs recorded yet.</td></tr>
              ) : (
                paginatedPurchases.map((pur, idx) => {
                  const serialNumber = startIndex + idx + 1;
                  const totalAmt = Number(pur.total_amount) || 0;
                  const key = pur.purchase_no || String(pur.id);
                  const alloc = purchaseAllocationsMap[key] || purchaseAllocationsMap[String(pur.id)];
                  const upfrontPaid = Number(pur.cash_amount_paid || 0) + Number(pur.bank_amount_paid || 0);
                  const paidAmt = alloc ? alloc.totalPaid : (Number(pur.amount_paid) || upfrontPaid);
                  const dueAmt = alloc ? alloc.due : Math.max(0, totalAmt - paidAmt);
                  const term = pur.payment_term || 'On Credit';
                  const vendorName = pur.supplier_name || 'General Vendor';

                  return (
                    <tr key={pur.id} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/10 duration-150 font-semibold text-black dark:text-white text-xs">
                      <td className="py-3.5 px-4 text-gray-400 whitespace-nowrap">{serialNumber}</td>
                      <td className="py-3.5 px-4 font-mono font-black text-primary whitespace-nowrap">{pur.purchase_no}</td>
                      <td className="py-3.5 px-4 flex items-center gap-1.5 whitespace-nowrap"><MdPerson className="text-gray-400 shrink-0" size={16} />{vendorName}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          {(() => {
                            const itemsArr = Array.isArray(pur.items) ? pur.items : [];
                            const warehouses = [...new Set(
                              itemsArr
                                .map((it: any) => it.warehouse || pur.target_warehouse)
                                .filter(Boolean)
                            )] as string[];
                            const locations = warehouses.length > 0 ? warehouses : [pur.target_warehouse].filter(Boolean);
                            return locations.map((wh: string) => (
                              <button
                                key={wh}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showModal(
                                    <PurchaseStockModal
                                      purchase={pur}
                                      initialTab={wh}
                                      onClose={() => hideModal()}
                                    />,
                                    `Stock Receiving Details - PUR-${pur.purchase_no || pur.id}`,
                                    undefined,
                                    "max-w-5xl"
                                  );
                                }}
                                className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 hover:border-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide inline-flex items-center gap-1 whitespace-nowrap w-fit transition cursor-pointer shadow-xs active:scale-95"
                                title={`Click to view stock breakdown for ${wh}`}
                              >
                                <MdStore size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                                <span>{wh}</span>
                              </button>
                            ));
                          })()}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center text-gray-500 whitespace-nowrap"><span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap"><MdEvent size={13} className="shrink-0" />{pur.purchase_date}</span></td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${term === 'On Credit' ? 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300' : term === 'By Cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-teal-50 text-teal-700 border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300'}`}>
                          {term}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900 dark:text-white pr-4 whitespace-nowrap">
                        Rs. {formatMoney(totalAmt)}
                      </td>
                      <td className="py-3.5 px-4 text-right pr-6 font-mono text-xs min-w-[140px]">
                        {dueAmt <= 0 ? (
                          <div className="space-y-0.5 flex flex-col items-end">
                            {(alloc?.returned || 0) > 0 && (
                              <span className="inline-block px-2 py-0.5 mb-1 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-[9px] font-black uppercase whitespace-nowrap">
                                {(alloc?.returned || 0) >= totalAmt ? 'Returned' : 'Partially Returned'}
                              </span>
                            )}
                            <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black uppercase text-center max-w-[120px] leading-tight">
                              {alloc && (alloc.generalAllocated > 0 || alloc.specificVouchers > 0) ? 'Full Payment Adjusted from Old Ledger Amount' : 'Fully Paid'}
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-0.5 flex flex-col items-end">
                            {(alloc?.returned || 0) > 0 && (
                              <span className="inline-block px-2 py-0.5 mb-1 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-[9px] font-black uppercase whitespace-nowrap">
                                Partially Returned
                              </span>
                            )}
                            {paidAmt > 0 && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold whitespace-nowrap">
                                {alloc && (alloc.generalAllocated > 0 || alloc.specificVouchers > 0) ? 'Ledger Adjusted' : 'Paid'}: Rs. {formatMoney(paidAmt)}
                              </span>
                            )}
                            <span className="inline-block px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-[10px] font-black uppercase whitespace-nowrap mt-1">
                              Pending Payment
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <TableActions
                          onPrint={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchases/Print/${pur.id}`)}
                          onEdit={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchases/Add`, { state: { purchaseRecord: pur } })}
                          onDelete={() => handleDeletePurchaseRecord(pur.id)}
                          printTitle="Print Goods Receiving Note"
                          editTitle="Edit Purchase"
                          deleteTitle="Delete Purchase"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 pt-4 border-t border-stroke dark:border-strokedark">
          <div className="text-sm text-gray-500 dark:text-gray-400">Showing {startIndex + 1} to {endIndex} of {totalEntries} entries</div>
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
    </div>
  );
};

export default PurchaseList;
