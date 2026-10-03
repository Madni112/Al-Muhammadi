import React, { useEffect, useState } from 'react';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useNavigate } from 'react-router-dom';
import TableActions from '../../../ui/TableActions';
import { useAuth } from '../../../Context/Auth';
import { FiTruck, FiX, FiCheckCircle, FiClock, FiDollarSign, FiActivity, FiShield, FiChevronLeft, FiChevronRight, FiEdit, FiFileText, FiPrinter } from 'react-icons/fi';
import { logActivity } from '../../../service/auditLogger';

const SalesHistory = () => {
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [openActionId, setOpenActionId] = useState<any | null>(null);
  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, right: 0 });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [returnedInvoiceNos, setReturnedInvoiceNos] = useState<string[]>([]);
  const [deliveryChallansMap, setDeliveryChallansMap] = useState<Record<string, any[]>>({});
  const [invoiceBalances, setInvoiceBalances] = useState<Record<string, { received: number; remaining: number }>>({});

  // 🌟 Realtime Delivery Challan & Freight Approval Modal State
  const [selectedDcForModal, setSelectedDcForModal] = useState<any | null>(null);
  const [dcListForModal, setDcListForModal] = useState<any[] | null>(null);
  const [dcListWarehouse, setDcListWarehouse] = useState<string>('ALL');
  const [activeModalTab, setActiveModalTab] = useState<'tracking' | 'payment'>('tracking');
  const [previewInvoiceIndex, setPreviewInvoiceIndex] = useState<number | null>(null);
  const [isApprovingPayment, setIsApprovingPayment] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const openDcModal = (dc: any, defaultTab: 'tracking' | 'payment' = 'tracking') => {
    setSelectedDcForModal(dc);
    setActiveModalTab(defaultTab);
  };

  const handleApproveFreightPayment = async (dcId: number) => {
    setIsApprovingPayment(true);
    try {
      const { error } = await supabase
        .from('delivery_challans')
        .update({
          freight_payment_status: 'Approved'
        })
        .eq('id', dcId);

      if (error) throw error;

      toast.success('Freight charges approved successfully!');
      setSelectedDcForModal((prev: any) => prev ? { ...prev, freight_payment_status: 'Approved' } : null);
      fetchInvoices();
    } catch (err: any) {
      toast.error('Failed to approve payment: ' + err.message);
    } finally {
      setIsApprovingPayment(false);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);

      const { data: invoicesData, error: invError } = await supabase
        .from('sales_invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (invError) throw invError;

      const { data: vouchersData } = await supabase
        .from('financial_vouchers')
        .select('*');

      const { data: returnsData, error: retError } = await supabase
        .from('sales_returns')
        .select('*');

      if (!retError && returnsData) {
        const cleanList = returnsData
          .map((r: any) => String(r.original_invoice_no || '').trim().toLowerCase())
          .filter(Boolean);
        setReturnedInvoiceNos(cleanList);
      }

      const { data: dcRows } = await supabase
        .from('delivery_challans')
        .select('*');

      const dcMap: Record<string, any[]> = {};
      (dcRows || []).forEach((dc: any) => {
        const invKey = String(dc.invoice_no || '').trim().toLowerCase();
        if (invKey) {
          if (!dcMap[invKey]) dcMap[invKey] = [];
          dcMap[invKey].push(dc);
        }
      });
      setDeliveryChallansMap(dcMap);

      // Group invoices by normalized customer name
      const customerInvoicesMap: Record<string, any[]> = {};
      (invoicesData || []).forEach((inv: any) => {
        const cKey = String(inv.customer_name || inv.customerName || 'walk-in').trim().toLowerCase();
        if (!customerInvoicesMap[cKey]) customerInvoicesMap[cKey] = [];
        customerInvoicesMap[cKey].push(inv);
      });

      // Group vouchers by normalized customer name
      const customerVouchersMap: Record<string, any[]> = {};
      (vouchersData || []).forEach((v: any) => {
        const cKey = String(v.customer_name || v.customerName || v.metadata?.customerName || v.metadata?.customer_name || '').trim().toLowerCase();
        if (cKey) {
          if (!customerVouchersMap[cKey]) customerVouchersMap[cKey] = [];
          customerVouchersMap[cKey].push(v);
        }
      });

      // Compute Real-time (Live) Received and Remaining Balances per Invoice (FIFO)
      const balanceMap: Record<string, { received: number; remaining: number }> = {};

      Object.keys(customerInvoicesMap).forEach((cKey) => {
        const custInvs = customerInvoicesMap[cKey] || [];
        // Sort chronologically oldest first for FIFO general clearing
        const sortedInvs = [...custInvs].sort((a, b) => {
          const tA = new Date(a.sale_date || a.invoice_date || a.created_at || 0).getTime();
          const tB = new Date(b.sale_date || b.invoice_date || b.created_at || 0).getTime();
          return tA - tB || (Number(a.id) - Number(b.id));
        });

        const custVouchers = customerVouchersMap[cKey] || [];

        // Allocations structure for each invoice
        const invAlloc: Record<string, { gross: number; upfront: number; specificVouchers: number; generalAllocated: number; specificReturns: number }> = {};

        sortedInvs.forEach((inv) => {
          const invId = String(inv.id);
          const gross = Number(inv.total_amount || 0);
          const upfront = Number(inv.cash_amount_paid || 0) + Number(inv.bank_amount || 0);
          invAlloc[invId] = {
            gross,
            upfront,
            specificVouchers: 0,
            generalAllocated: 0,
            specificReturns: 0
          };
        });

        let unallocatedGeneralVouchers = 0;

        // 1. Assign specific vouchers or accumulate general
        custVouchers.forEach((v) => {
          const vAmt = Number(v.total_amount || 0);
          const vRef = String(v.original_invoice_no || v.metadata?.linkedInvoiceNo || '').trim().toLowerCase();

          if (Array.isArray(v.metadata?.invoices) && v.metadata.invoices.length > 0) {
            v.metadata.invoices.forEach((mi: any) => {
              const miRef = String(mi.invoice_id || mi.invoice_no || '').trim().toLowerCase();
              const matched = sortedInvs.find(i => 
                String(i.id) === miRef ||
                String(i.invoice_no || '').trim().toLowerCase() === miRef ||
                `inv-${String(i.id).padStart(4, '0')}`.toLowerCase() === miRef
              );
              if (matched && invAlloc[String(matched.id)]) {
                invAlloc[String(matched.id)].specificVouchers += Number(mi.amount_paid || mi.received_amount || mi.amountToAllocate || 0);
              }
            });
          } else if (Array.isArray(v.metadata?.allocations) && v.metadata.allocations.length > 0) {
            v.metadata.allocations.forEach((al: any) => {
              const alRef = String(al.invoiceId || al.invoiceNo || '').trim().toLowerCase();
              const matched = sortedInvs.find(i => 
                String(i.id) === alRef ||
                String(i.invoice_no || '').trim().toLowerCase() === alRef ||
                `inv-${String(i.id).padStart(4, '0')}`.toLowerCase() === alRef
              );
              if (matched && invAlloc[String(matched.id)]) {
                invAlloc[String(matched.id)].specificVouchers += Number(al.amountToAllocate || al.amount || 0);
              }
            });
          } else if (vRef && !vRef.includes('general')) {
            const cleanRef = vRef.replace(/\D/g, '');
            const matched = sortedInvs.find(i => 
              String(i.invoice_no || '').trim().toLowerCase() === vRef ||
              String(i.id) === vRef ||
              (cleanRef && String(i.id) === cleanRef) ||
              `inv-${String(i.id).padStart(4, '0')}`.toLowerCase() === vRef
            );
            if (matched && invAlloc[String(matched.id)]) {
              invAlloc[String(matched.id)].specificVouchers += vAmt;
            } else {
              unallocatedGeneralVouchers += vAmt;
            }
          } else {
            unallocatedGeneralVouchers += vAmt;
          }
        });

        // 2. Assign specific returns
        (returnsData || []).forEach((r: any) => {
          const rRef = String(r.original_invoice_no || '').trim().toLowerCase();
          if (rRef) {
            const cleanRef = rRef.replace(/\D/g, '');
            const matched = sortedInvs.find(i => 
              String(i.invoice_no || '').trim().toLowerCase() === rRef ||
              String(i.id) === rRef ||
              (cleanRef && String(i.id) === cleanRef) ||
              `inv-${String(i.id).padStart(4, '0')}`.toLowerCase() === rRef
            );
            if (matched && invAlloc[String(matched.id)]) {
              invAlloc[String(matched.id)].specificReturns += Number(r.total_amount || 0);
            }
          }
        });

        // 3. FIFO distribution of general unallocated vouchers
        let pool = unallocatedGeneralVouchers;
        sortedInvs.forEach((inv) => {
          const invId = String(inv.id);
          const alloc = invAlloc[invId];
          if (alloc && pool > 0) {
            const dueBeforeGen = Math.max(0, alloc.gross - alloc.upfront - alloc.specificReturns - alloc.specificVouchers);
            if (dueBeforeGen > 0) {
              const take = Math.min(dueBeforeGen, pool);
              alloc.generalAllocated += take;
              pool -= take;
            }
          }
        });

        // 4. Save to balanceMap
        sortedInvs.forEach((inv) => {
          const invId = String(inv.id);
          const alloc = invAlloc[invId];
          const totalReceived = alloc.upfront + alloc.specificVouchers + alloc.generalAllocated;
          const remaining = Math.max(0, alloc.gross - totalReceived - alloc.specificReturns);
          balanceMap[invId] = {
            received: totalReceived,
            remaining: remaining
          };
        });
      });

      setInvoiceBalances(balanceMap);

      setInvoices(invoicesData || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvoice = async (id: string | number) => {
    const rawInvoiceIdString = String(id).trim().toLowerCase();

    const isReturned = returnedInvoiceNos.some(retNo => {
      return (
        retNo === rawInvoiceIdString ||
        retNo === `inv-${rawInvoiceIdString}` ||
        retNo === `inv-${rawInvoiceIdString.padStart(4, '0')}` ||
        retNo.includes(rawInvoiceIdString)
      );
    });

    const targetInv = invoices.find(i => i.id === id);
    const isReturnedStatus = isReturned ||
      String(targetInv?.receipt_status).trim().toLowerCase() === 'returned' ||
      String(targetInv?.sale_status).trim().toLowerCase() === 'returned';

    if (isReturnedStatus) {
      toast.error('First delete sale return entry to delete this for same invoice');
      return;
    }

    const invKey = String(targetInv?.invoice_no || `INV-${String(id).padStart(4, '0')}`).trim().toLowerCase();
    const linkedDcs = deliveryChallansMap[invKey] || [];
    const hasDispatchedItems = linkedDcs.some(dc => {
      if (['Dispatched', 'Partially Dispatched', 'Fully Dispatched'].includes(dc.status)) return true;
      if (dc.items) {
        return dc.items.some((item: any) => Number(item.dispatchedQty || 0) > 0);
      }
      return false;
    });

    if (hasDispatchedItems) {
      toast.error('Cannot delete: Goods have already been dispatched. Please process a Sales Return instead.');
      return;
    }

    if (!window.confirm('Are you certain you want to permanently delete this invoice record?')) return;

    try {
      setLoading(true);
      const { data: targetInvoice, error: fetchError } = await supabase
        .from('sales_invoices')
        .select('items, dispatch_warehouse, invoice_no')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      if (targetInvoice && targetInvoice.items) {
        for (const item of targetInvoice.items) {
          const itemQuantityToRestore = Number(item.qty) || 0;
          const { data: currentProduct } = await supabase.from('products').select('current_stock').ilike('product_name', item.itemName).maybeSingle();

          if (currentProduct) {
            const restoredMasterStockCount = (Number(currentProduct.current_stock) || 0) + itemQuantityToRestore;
            await supabase.from('products').update({ current_stock: restoredMasterStockCount }).ilike('product_name', item.itemName);
          }

          const actualRowWarehouse = item.warehouse || targetInvoice.dispatch_warehouse || '';
          // warehouse_inventory retired — formula-based stock is now the source of truth
          void actualRowWarehouse; // kept for reference only
        }
      }

      // Also delete any associated delivery challans
      const invoiceIdentifier = targetInvoice?.invoice_no ? String(targetInvoice.invoice_no).trim() : `INV-${String(id).padStart(4, '0')}`;
      if (invoiceIdentifier) {
        await supabase.from('delivery_challans').delete().eq('invoice_no', invoiceIdentifier);
      }

      const { error: deleteError } = await supabase.from('sales_invoices').delete().eq('id', id);
      if (deleteError) throw deleteError;

      logActivity({
        action: 'DELETE',
        tableName: 'sales_invoices',
        details: {
          id,
          invoice_number: invoiceIdentifier,
          customer_name: targetInvoice?.customer_name,
          total_amount: targetInvoice?.total_amount,
          event: `Deleted sales invoice ${invoiceIdentifier} (${targetInvoice?.customer_name || 'Customer'})`
        }
      });

      toast.success('Invoice deleted cleanly. Stock metrics restored!');
      fetchInvoices();
    } catch (err: any) {
      toast.error('Deletion Interrupted: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = React.useMemo(() => {
    let result = invoices.filter(inv =>
      inv.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.id.toString().includes(searchTerm)
    );

    if (sortConfig !== null) {
      result.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        if (sortConfig.key === 'invoice_no') {
            aVal = a.invoice_no || `INV-${String(a.id).padStart(4, '0')}`;
            bVal = b.invoice_no || `INV-${String(b.id).padStart(4, '0')}`;
        }
        if (sortConfig.key === 'sale_date') {
            aVal = a.sale_date || a.created_at;
            bVal = b.sale_date || b.created_at;
        }

        if (sortConfig.key === 'cash_amount_paid' || sortConfig.key === 'amount_received') {
          aVal = invoiceBalances[String(a.id)]?.received ?? Number(a.cash_amount_paid || 0);
          bVal = invoiceBalances[String(b.id)]?.received ?? Number(b.cash_amount_paid || 0);
        } else if (sortConfig.key === 'remaining') {
          aVal = invoiceBalances[String(a.id)]?.remaining ?? Math.max(0, Number(a.total_amount || 0) - Number(a.cash_amount_paid || 0));
          bVal = invoiceBalances[String(b.id)]?.remaining ?? Math.max(0, Number(b.total_amount || 0) - Number(b.cash_amount_paid || 0));
        } else if (['total_amount', 'bank_amount', 'id'].includes(sortConfig.key)) {
          aVal = Number(aVal) || 0;
          bVal = Number(bVal) || 0;
        } else if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = (bVal || '').toLowerCase();
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [invoices, searchTerm, sortConfig, invoiceBalances]);

  const handlePrevInvoice = () => {
    if (previewInvoiceIndex !== null && previewInvoiceIndex > 0) {
      setPreviewInvoiceIndex(previewInvoiceIndex - 1);
    }
  };

  const handleNextInvoice = () => {
    if (previewInvoiceIndex !== null && previewInvoiceIndex < filteredInvoices.length - 1) {
      setPreviewInvoiceIndex(previewInvoiceIndex + 1);
    }
  };

  useEffect(() => {
    if (previewInvoiceIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevInvoice();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextInvoice();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPreviewInvoiceIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewInvoiceIndex, filteredInvoices.length]);

  const previewInvoice = previewInvoiceIndex !== null ? filteredInvoices[previewInvoiceIndex] : null;

  const totalEntries = filteredInvoices.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedInvoices = filteredInvoices.slice(startIndex, startIndex + pageSize);

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-slate-800 dark:text-slate-100 text-xs">

      {/* ── POPUP: ALL DELIVERY CHALLANS OF AN INVOICE ── */}
      {dcListForModal && (
        <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-boxdark w-full max-w-lg rounded-2xl shadow-2xl border border-stroke dark:border-strokedark overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center bg-slate-900 text-white p-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/20 text-primary flex items-center justify-center text-lg font-bold">
                  <FiTruck />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Delivery Challans</h3>
                  <p className="text-[11px] text-slate-400">{dcListForModal.length} linked to this invoice</p>
                </div>
              </div>
              <button onClick={() => setDcListForModal(null)} className="text-slate-400 hover:text-white text-xl">
                <FiX />
              </button>
            </div>

            {(() => {
              const warehouses = Array.from(
                new Set(dcListForModal.map((dc: any) => String(dc.dispatch_warehouse || 'Global / Unassigned').trim()))
              );
              const activeLoc = dcListWarehouse && warehouses.includes(dcListWarehouse) ? dcListWarehouse : warehouses[0];
              const visibleDCs = dcListForModal.filter(
                (dc: any) => String(dc.dispatch_warehouse || 'Global / Unassigned').trim() === activeLoc
              );

              return (
                <>
                  {/* Location switch (hidden when everything is in one warehouse) */}
                  {warehouses.length > 1 && (
                    <div className="px-4 pt-3 pb-1 border-b border-slate-100 dark:border-strokedark">
                      <div className="flex flex-wrap gap-1 bg-slate-50 dark:bg-slate-800/60 p-1 rounded-xl font-bold text-xs w-fit">
                        {warehouses.map((wh) => {
                          const count = dcListForModal.filter(
                            (dc: any) => String(dc.dispatch_warehouse || 'Global / Unassigned').trim() === wh
                          ).length;
                          return (
                            <button
                              key={wh}
                              type="button"
                              onClick={() => setDcListWarehouse(wh)}
                              className={`py-2 px-3.5 rounded-lg transition cursor-pointer ${
                                activeLoc === wh
                                  ? 'bg-emerald-600 text-white font-bold shadow-sm'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {wh} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="p-4 flex flex-col gap-2 overflow-y-auto flex-1">
                    {visibleDCs.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400 italic">No DCs in this location.</div>
                    ) : visibleDCs.map((dc: any) => {
                      const isPend = dc.status === 'Pending Approval';
                      const isPart = dc.status === 'Partially Dispatched';
                      const isDisp = dc.status === 'Dispatched' || dc.status === 'Fully Dispatched';
                      const hasFreightPending = Number(dc.freight_charges || 0) > 0 && dc.freight_payment_status !== 'Approved';
                      return (
                        <button
                          key={dc.id}
                          type="button"
                          onClick={() => {
                            const dcRef = dc;
                            setDcListForModal(null);
                            openDcModal(dcRef, hasFreightPending ? 'payment' : 'tracking');
                          }}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-500 hover:shadow-sm transition px-3.5 py-2.5 text-left cursor-pointer w-full"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-primary font-black font-mono text-xs truncate">{dc.challan_no || `DC-${dc.id}`}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {dc.dispatch_warehouse || 'N/A'} • {dc.challan_date || 'N/A'} • Qty: {Number(dc.total_quantity || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isPend && <span className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-bold">Pending</span>}
                            {isPart && <span className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-1.5 py-0.5 rounded text-[9px] font-bold">Partial</span>}
                            {isDisp && <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[9px] font-bold">Dispatched</span>}
                            {hasFreightPending && <span className="bg-amber-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold">Pay Req</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            <div className="p-3 bg-slate-50 dark:bg-meta-4/30 border-t border-stroke dark:border-strokedark flex justify-end">
              <button
                onClick={() => setDcListForModal(null)}
                className="px-4 py-2 bg-white dark:bg-boxdark border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-meta-4 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── POPUP MODAL: REALTIME WAREHOUSE ACTIVITY & FREIGHT SETTLEMENT APPROVAL ── */}
      {selectedDcForModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-boxdark w-full max-w-2xl rounded-2xl shadow-2xl border border-stroke dark:border-strokedark overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-center bg-slate-900 text-white p-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center text-xl font-bold">
                  <FiTruck />
                </div>
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    Delivery Challan Hub
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-600 text-white font-black">
                      {selectedDcForModal.challan_no || `DC-${selectedDcForModal.id}`}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Invoice: <span className="text-white font-bold">{selectedDcForModal.invoice_no || 'Direct DC'}</span> • Customer: <span className="text-white font-bold">{selectedDcForModal.customer_name}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedDcForModal(null)} className="text-slate-400 hover:text-white text-xl">
                <FiX />
              </button>
            </div>

            {/* 2 Tabs Switcher */}
            <div className="flex border-b border-stroke dark:border-strokedark bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setActiveModalTab('tracking')}
                className={`flex-1 py-3 px-4 font-bold text-xs flex items-center justify-center gap-2 transition ${
                  activeModalTab === 'tracking'
                    ? 'bg-white dark:bg-boxdark text-primary border-b-2 border-primary shadow-xs'
                    : 'text-gray-500 hover:text-black dark:hover:text-white'
                }`}
              >
                <FiActivity /> 1. Realtime Warehouse Activity
              </button>
              <button
                type="button"
                onClick={() => setActiveModalTab('payment')}
                className={`flex-1 py-3 px-4 font-bold text-xs flex items-center justify-center gap-2 transition ${
                  activeModalTab === 'payment'
                    ? 'bg-white dark:bg-boxdark text-emerald-600 border-b-2 border-emerald-600 shadow-xs'
                    : 'text-gray-500 hover:text-black dark:hover:text-white'
                }`}
              >
                <FiDollarSign /> 2. Freight Charges & Payment Approval
                {Number(selectedDcForModal.freight_charges || 0) > 0 && selectedDcForModal.freight_payment_status !== 'Approved' && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4 text-xs">
              
              {/* TAB 1: REALTIME WAREHOUSE ACTIVITY */}
              {activeModalTab === 'tracking' && (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-meta-4/20 border border-stroke dark:border-strokedark">
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-black">Warehouse Status</span>
                      <strong className="text-sm font-bold text-black dark:text-white">{selectedDcForModal.status || 'Pending Approval'}</strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-black">Warehouse Location</span>
                      <span className="font-bold text-emerald-600">{selectedDcForModal.dispatch_warehouse || 'Main Warehouse'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-black">Vehicle / Truck Plate</span>
                      <span className="font-bold text-black dark:text-white">{selectedDcForModal.vehicle_no || 'Not Assigned'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-black">Driver</span>
                      <span className="font-bold text-black dark:text-white">{selectedDcForModal.driver_name || 'Direct Handover'}</span>
                    </div>
                  </div>

                  {/* Items Live Breakdown */}
                  <div className="border border-stroke dark:border-strokedark rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-meta-4 text-[10px] font-black uppercase text-black dark:text-white border-b border-stroke dark:border-strokedark">
                          <th className="p-2.5">Product Description</th>
                          <th className="p-2.5 text-center">Ordered</th>
                          <th className="p-2.5 text-center text-emerald-600">Dispatched (Truck)</th>
                          <th className="p-2.5 text-center text-amber-600">On Hold (Warehouse)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stroke dark:divide-strokedark font-medium">
                        {(selectedDcForModal.items || []).map((item: any, i: number) => {
                          const ord = Number(item.orderQty ?? item.qty ?? 0);
                          const disp = Number(item.dispatchedQty ?? (selectedDcForModal.status === 'Dispatched' ? item.qty : 0));
                          const hld = Number(item.holdQty ?? (selectedDcForModal.status === 'Pending Approval' ? ord : 0));

                          return (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-2.5 font-bold text-black dark:text-white">{item.pDescription}</td>
                              <td className="p-2.5 text-center font-mono font-bold">{ord}</td>
                              <td className="p-2.5 text-center font-mono font-bold text-emerald-600">
                                {selectedDcForModal.status === 'Pending Approval' ? '0 (Pending)' : disp}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-amber-600">
                                {hld > 0 ? `${hld} Hold` : '0 (Cleared)'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {selectedDcForModal.remarks && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-stroke dark:border-strokedark">
                      <span className="text-[10px] font-bold uppercase text-gray-500 block">Warehouse Gate Remarks:</span>
                      <p className="text-black dark:text-white font-medium mt-0.5">{selectedDcForModal.remarks}</p>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => navigate(`/Delivery-Challan/Print/${selectedDcForModal.id}`)}
                      disabled={selectedDcForModal.status === 'Pending Approval'}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition"
                    >
                      🖨️ Open Gate Pass Document
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: FREIGHT CHARGES & PAYMENT APPROVAL */}
              {activeModalTab === 'payment' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-meta-4/20 border border-stroke dark:border-strokedark space-y-3">
                    <div className="flex justify-between items-center pb-3 border-b border-stroke dark:border-strokedark">
                      <span className="text-gray-500 font-bold uppercase text-[11px]">Transportation Service / Carrier:</span>
                      <strong className="text-black dark:text-white text-sm">
                        {selectedDcForModal.transport_name || selectedDcForModal.transportation || 'Customer\'s Own Transport'}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center pb-3 border-b border-stroke dark:border-strokedark">
                      <span className="text-gray-500 font-bold uppercase text-[11px]">Freight Charges Claimed:</span>
                      <strong className="text-emerald-600 font-mono text-base font-black">
                        Rs. {Number(selectedDcForModal.freight_charges || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-bold uppercase text-[11px]">Payment Authorization Status:</span>
                      {selectedDcForModal.freight_payment_status === 'Approved' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-black text-xs">
                          <FiCheckCircle /> Authorized & Paid
                        </span>
                      ) : Number(selectedDcForModal.freight_charges || 0) === 0 ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                          No Charges (Direct Handover)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-black text-xs animate-pulse">
                          <FiClock /> Verification Pending
                        </span>
                      )}
                    </div>
                  </div>

                  {Number(selectedDcForModal.freight_charges || 0) > 0 && selectedDcForModal.freight_payment_status !== 'Approved' && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-xl flex items-start gap-3">
                      <FiShield className="text-amber-600 text-lg shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-bold text-amber-900 dark:text-amber-200">Payment Authorization Required</h5>
                        <p className="text-amber-800/80 dark:text-amber-300/80 text-[11px] mt-1">
                          The warehouse has entered <strong>Rs. {Number(selectedDcForModal.freight_charges || 0).toLocaleString()}</strong> as the freight charge for this shipment. As Admin / Billing Officer, click below to confirm and authorize this payment.
                        </p>
                        <button
                          type="button"
                          disabled={isApprovingPayment}
                          onClick={() => handleApproveFreightPayment(selectedDcForModal.id)}
                          className="mt-3 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition cursor-pointer"
                        >
                          {isApprovingPayment ? <Spinner /> : <><FiCheckCircle /> Authorize & Approve Freight Payment</>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="flex justify-end p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-stroke dark:border-strokedark">
              <button
                onClick={() => setSelectedDcForModal(null)}
                className="px-5 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 font-bold text-xs transition"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      
      {/* ── QUICK-VIEW INVOICE PREVIEW MODAL WITH ARROW NAVIGATION ── */}
      {previewInvoice && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-6">
          <div className="bg-white dark:bg-boxdark w-full max-w-4xl rounded-2xl shadow-2xl border border-stroke dark:border-strokedark overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            
            {/* Header Bar */}
            <div className="flex justify-between items-center bg-slate-900 text-white px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center text-lg font-bold shrink-0">
                  <FiFileText />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black font-mono tracking-tight text-white">
                      {previewInvoice.invoice_no || `INV-${String(previewInvoice.id).padStart(4, '0')}`}
                    </h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      String(previewInvoice.payment_term || '').toLowerCase() === 'cash' || String(previewInvoice.receipt_status || '').toLowerCase() === 'paid'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    }`}>
                      {previewInvoice.receipt_status || previewInvoice.payment_term || 'Invoice'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>Customer: <strong className="text-white">{previewInvoice.customer_name || 'Walk-in'}</strong></span>
                    <span>•</span>
                    <span>Date: <strong className="text-slate-300">{previewInvoice.sale_date || '-'}</strong></span>
                    {previewInvoice.salesman && (
                      <>
                        <span>•</span>
                        <span>Salesman: <strong className="text-slate-300">{previewInvoice.salesman}</strong></span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Navigation & Close */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                  <button
                    type="button"
                    disabled={previewInvoiceIndex === 0}
                    onClick={handlePrevInvoice}
                    title="Previous Invoice (Left Arrow)"
                    className="p-1.5 rounded-md hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    <FiChevronLeft size={16} />
                  </button>
                  <span className="px-2 font-mono text-[11px] font-bold text-slate-400 select-none">
                    {(previewInvoiceIndex ?? 0) + 1} / {filteredInvoices.length}
                  </span>
                  <button
                    type="button"
                    disabled={previewInvoiceIndex === filteredInvoices.length - 1}
                    onClick={handleNextInvoice}
                    title="Next Invoice (Right Arrow)"
                    className="p-1.5 rounded-md hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    <FiChevronRight size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewInvoiceIndex(null)}
                  className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Close (Esc)"
                >
                  <FiX size={18} />
                </button>
              </div>
            </div>

            {/* Body: Items Table */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Quick Meta Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-50 dark:bg-meta-4/20 p-2.5 rounded-xl border border-stroke dark:border-strokedark">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Gate Pass #</span>
                  <span className="font-mono font-bold text-black dark:text-white truncate block">{previewInvoice.gate_pass_no || '-'}</span>
                </div>
                <div className="bg-slate-50 dark:bg-meta-4/20 p-2.5 rounded-xl border border-stroke dark:border-strokedark">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Sale Scenario</span>
                  <span className="font-bold text-black dark:text-white truncate block">{previewInvoice.scenario_type || 'Standard Sale'}</span>
                </div>
                <div className="bg-slate-50 dark:bg-meta-4/20 p-2.5 rounded-xl border border-stroke dark:border-strokedark">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Transport</span>
                  <span className="font-bold text-black dark:text-white truncate block">{previewInvoice.transport_name || 'Counter Handover'}</span>
                </div>
                <div className="bg-slate-50 dark:bg-meta-4/20 p-2.5 rounded-xl border border-stroke dark:border-strokedark">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Total Quantity</span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                    {(previewInvoice.items || []).reduce((sum: number, it: any) => sum + Number(it.qty || 0), 0)} Units
                  </span>
                </div>
              </div>

              {/* Items List Table */}
              <div className="border border-stroke dark:border-strokedark rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-meta-4 text-[10px] font-black uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                      <th className="p-3 w-8 text-center">S#</th>
                      <th className="p-3 w-32">Code</th>
                      <th className="p-3">Product Description</th>
                      <th className="p-3 w-36 text-center">Qty / Location</th>
                      <th className="p-3 w-24 text-right">Rate</th>
                      <th className="p-3 w-20 text-center">Disc</th>
                      <th className="p-3 w-28 text-right pr-4">Net Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke dark:divide-strokedark font-medium">
                    {(previewInvoice.items || []).map((it: any, idx: number) => {
                      const qtyNum = Number(it.qty || 0);
                      const rateNum = Number(it.rp ?? it.rate ?? 0);
                      const discAmt = Number(it.discountAmt ?? it.disAmt ?? 0);
                      const grossAmt = qtyNum * rateNum;
                      const netAmt = grossAmt - discAmt;
                      const locationName = it.warehouse || it.location || previewInvoice.dispatch_warehouse || 'Main Warehouse';

                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3 text-center text-gray-400 font-sans">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
                            {it.skuCode || it.itemCode || '-'}
                          </td>
                          <td className="p-3">
                            <p className="font-bold text-black dark:text-white">{it.itemName || it.pDescription || it.product_name}</p>
                          </td>
                          <td className="p-3 text-center">
                            <p className="font-black font-mono text-black dark:text-white text-sm">{qtyNum}</p>
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded mt-0.5">
                              📍 {locationName}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                            Rs. {rateNum.toLocaleString()}
                          </td>
                          <td className="p-3 text-center font-mono text-[11px] text-slate-500">
                            {discAmt > 0 ? `-Rs. ${discAmt.toLocaleString()}` : '0%'}
                          </td>
                          <td className="p-3 text-right pr-4 font-mono font-black text-black dark:text-white text-sm">
                            Rs. {netAmt.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Financials & Summary Footer */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-2">
                <div className="text-slate-500 text-[11px] space-y-1">
                  <p className="font-bold text-slate-700 dark:text-slate-300">Keyboard Navigation Shortcuts:</p>
                  <p className="flex items-center gap-1.5 flex-wrap">
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px] font-bold text-black dark:text-white">←</kbd>
                    <span>Prev Invoice</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px] font-bold text-black dark:text-white">→</kbd>
                    <span>Next Invoice</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px] font-bold text-black dark:text-white">ESC</kbd>
                    <span>Close</span>
                  </p>
                </div>

                <div className="w-full sm:w-80 bg-slate-50 dark:bg-meta-4/20 p-3.5 rounded-xl border border-stroke dark:border-strokedark space-y-2 text-xs">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Gross Amount:</span>
                    <span className="font-mono font-bold text-black dark:text-white">
                      Rs. {((previewInvoice.items || []).reduce((acc: number, it: any) => acc + (Number(it.qty || 0) * Number(it.rp ?? it.rate ?? 0)), 0)).toLocaleString()}
                    </span>
                  </div>
                  {Number(previewInvoice.transport_charges || 0) > 0 && (
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Transport Charges:</span>
                      <span className="font-mono font-bold text-black dark:text-white">+ Rs. {Number(previewInvoice.transport_charges).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="border-t border-stroke dark:border-strokedark pt-2 flex justify-between items-center">
                    <span className="font-bold text-black dark:text-white text-sm">Grand Total:</span>
                    <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                      Rs. {Number(previewInvoice.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>Amount Received (Live):</span>
                    <span className="font-mono font-black">
                      Rs. {(invoiceBalances[String(previewInvoice.id)]?.received ?? (Number(previewInvoice.cash_amount_paid || 0) + Number(previewInvoice.bank_amount || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-700 dark:text-slate-300">Remaining Balance (Live):</span>
                    <span className={`font-mono font-black ${(invoiceBalances[String(previewInvoice.id)]?.remaining ?? 0) > 0.01 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      Rs. {(invoiceBalances[String(previewInvoice.id)]?.remaining ?? Math.max(0, Number(previewInvoice.total_amount || 0) - (Number(previewInvoice.cash_amount_paid || 0) + Number(previewInvoice.bank_amount || 0)))).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-stroke dark:border-strokedark">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={previewInvoiceIndex === 0}
                  onClick={handlePrevInvoice}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-xs hover:bg-slate-100 transition disabled:opacity-40 cursor-pointer flex items-center gap-1"
                >
                  <FiChevronLeft /> Prev Invoice
                </button>
                <button
                  type="button"
                  disabled={previewInvoiceIndex === filteredInvoices.length - 1}
                  onClick={handleNextInvoice}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-bold text-xs hover:bg-slate-100 transition disabled:opacity-40 cursor-pointer flex items-center gap-1"
                >
                  Next Invoice <FiChevronRight />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const invId = previewInvoice.id;
                    setPreviewInvoiceIndex(null);
                    navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/Invoice/Add`, { state: { invoice: previewInvoice } });
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <FiEdit /> Edit Invoice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const invId = previewInvoice.id;
                    setPreviewInvoiceIndex(null);
                    navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/Invoice/Print/${invId}`);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <FiPrinter /> Print Invoice
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Sales Invoices History</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Manage customer billing records, print commercial vouchers & process returns</p>
        </div>
        <button
          onClick={() => navigate('/sales/invoice/add')}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 px-4 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm hover:shadow-md cursor-pointer"
        >
          <span>+ Add New Invoice</span>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800/80 dark:bg-[#111827] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-5">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-200 py-1.5 px-2.5 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 outline-none focus:border-emerald-600 text-xs font-bold text-slate-800 dark:text-white transition"
            >
              {[10, 25, 50, 100].map((size) => <option key={size} value={size} className="dark:bg-slate-800">{size}</option>)}
            </select>
            <span>entries</span>
          </div>
          <div className="flex items-center gap-2 text-xs w-full sm:w-auto text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Search:</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search invoices or customers..."
              className="w-full sm:w-72 rounded-xl border border-slate-200 py-2 px-3.5 bg-slate-50/50 dark:bg-slate-800/60 dark:border-slate-700 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 text-xs text-slate-800 dark:text-white transition"
            />
          </div>
        </div>

        <div className="max-w-full overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                <th className="py-3.5 px-4 text-center w-16 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('invoice_no')}>Invoice No <span className={sortConfig?.key === 'invoice_no' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'invoice_no' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 text-center">Gate Pass #</th>
                <th className="py-3.5 px-4 text-center">DC No</th>
                <th className="py-3.5 px-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('sale_date')}>Sale Date <span className={sortConfig?.key === 'sale_date' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'sale_date' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 text-center cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('payment_term')}>Sale Type <span className={sortConfig?.key === 'payment_term' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'payment_term' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('salesman')}>Salesman <span className={sortConfig?.key === 'salesman' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'salesman' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('customer_name')}>Customer <span className={sortConfig?.key === 'customer_name' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'customer_name' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 text-center cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('receipt_status')}>Status <span className={sortConfig?.key === 'receipt_status' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'receipt_status' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 text-right pr-3 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('cash_amount_paid')}>Amount Received <span className={sortConfig?.key === 'cash_amount_paid' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'cash_amount_paid' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 text-right pr-3 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('total_amount')}>Total Net Amount <span className={sortConfig?.key === 'total_amount' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'total_amount' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 text-right pr-3 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('remaining')}>Remaining <span className={sortConfig?.key === 'remaining' ? 'opacity-100' : 'opacity-0'}>{sortConfig?.key === 'remaining' && sortConfig.direction === 'desc' ? '↓' : '↑'}</span></th>
                <th className="py-3.5 px-4 text-center w-14">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="text-center py-14">
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <Spinner size="w-8 h-8" color="border-primary" />
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 animate-pulse">
                        Loading sales invoices...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : paginatedInvoices.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-xs text-slate-400 italic">No invoice records found.</td></tr>
              ) : (
                paginatedInvoices.map((inv) => {
                  const rawInvoiceIdString = String(inv.id).trim().toLowerCase();

                  const isReturned = returnedInvoiceNos.some(retNo => {
                    return (
                      retNo === rawInvoiceIdString ||
                      retNo === `inv-${rawInvoiceIdString}` ||
                      retNo === `inv-${rawInvoiceIdString.padStart(4, '0')}` ||
                      retNo.includes(rawInvoiceIdString)
                    );
                  });

                  const paddedInvoiceIdString = String(inv.id).padStart(4, '0');
                  const invoiceKey = `inv-${paddedInvoiceIdString}`;
                  const customInvKey = String(inv.invoice_no || '').trim().toLowerCase();
                  const linkedDCs = deliveryChallansMap[customInvKey] || deliveryChallansMap[invoiceKey] || deliveryChallansMap[`inv-${inv.id}`] || [];

                  const balanceInfo = invoiceBalances[String(inv.id)] || {
                    received: Number(inv.cash_amount_paid || 0) + Number(inv.bank_amount || 0),
                    remaining: Math.max(0, Number(inv.total_amount || 0) - (Number(inv.cash_amount_paid || 0) + Number(inv.bank_amount || 0)))
                  };
                  const liveReceived = balanceInfo.received;
                  const liveRemaining = balanceInfo.remaining;
                  const isFullyPaid = liveRemaining <= 0.01 || String(inv.receipt_status || '').toLowerCase() === 'paid' || String(inv.payment_term || '').toLowerCase() === 'cash';

                  return (
                    <tr key={inv.id} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 duration-150">
                      <td className="py-3 px-4 text-center font-mono">
                        <button
                          type="button"
                          onClick={() => {
                            const foundIdx = filteredInvoices.findIndex((x: any) => x.id === inv.id);
                            if (foundIdx !== -1) setPreviewInvoiceIndex(foundIdx);
                          }}
                          className="font-bold text-primary dark:text-primary hover:underline cursor-pointer transition"
                          title="Click to preview invoice details"
                        >
                          {inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-bold text-center font-mono whitespace-nowrap">
                        {inv.gate_pass_no || '-'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        {linkedDCs.length > 1 ? (
                          (() => {
                            const pendingCount = linkedDCs.filter((dc: any) => dc.status === 'Pending Approval').length;
                            const payReqCount = linkedDCs.filter((dc: any) => Number(dc.freight_charges || 0) > 0 && dc.freight_payment_status !== 'Approved').length;
                            return (
                              <button
                                type="button"
                                onClick={() => { setDcListWarehouse(''); setDcListForModal(linkedDCs); }}
                                title="Click to view all Delivery Challans of this invoice"
                                className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-500 hover:shadow-xs transition cursor-pointer"
                              >
                                <span className="text-primary font-bold">{linkedDCs.length} DCs</span>
                                {pendingCount > 0 && <span className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 px-1.5 py-0.5 rounded text-[9px]">{pendingCount} Pending</span>}
                                {payReqCount > 0 && <span className="bg-amber-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold">{payReqCount} Pay Req</span>}
                                <span className="text-[9px] opacity-70 underline">view</span>
                              </button>
                            );
                          })()
                        ) : linkedDCs.length === 1 ? (
                          (() => {
                            const dc = linkedDCs[0];
                            const isPend = dc.status === 'Pending Approval';
                            const isPart = dc.status === 'Partially Dispatched';
                            const isDisp = dc.status === 'Dispatched' || dc.status === 'Fully Dispatched';
                            const hasFreightPending = Number(dc.freight_charges || 0) > 0 && dc.freight_payment_status !== 'Approved';
                            return (
                              <button
                                type="button"
                                onClick={() => openDcModal(dc, hasFreightPending ? 'payment' : 'tracking')}
                                title="Click to view Realtime Warehouse Activity & Approve Freight"
                                className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-500 hover:shadow-xs transition cursor-pointer"
                              >
                                <span className="text-primary font-bold">{dc.challan_no || `DC-${dc.id}`}</span>
                                {isPend && <span className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 px-1.5 py-0.5 rounded text-[9px]">Pending</span>}
                                {isPart && <span className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 px-1.5 py-0.5 rounded text-[9px]">Partial</span>}
                                {isDisp && <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[9px]">Dispatched</span>}
                                {hasFreightPending && (
                                  <span className="bg-amber-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold animate-pulse">
                                    Pay Req
                                  </span>
                                )}
                              </button>
                            );
                          })()
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">{inv.sale_date || new Date(inv.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          const term = String(inv.payment_term || '').toLowerCase();
                          const isCashOrBank = term.includes('cash') || term.includes('bank');
                          return (
                            <span className={`inline-flex rounded-full py-0.5 px-2.5 text-[10px] font-bold uppercase tracking-wide border ${isCashOrBank ? 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'}`}>
                              {inv.payment_term || 'On Credit'}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">{inv.salesman || 'General'}</td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">{inv.customer_name}</td>

                      <td className="py-3 px-4 text-center">
                        {isReturned ? (
                          <span className="text-[10px] font-black uppercase tracking-wide bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                            Returned
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${isFullyPaid ? 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30' : liveReceived > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'}`}>
                            {isFullyPaid ? 'Paid' : liveReceived > 0 ? 'Partial' : (inv.receipt_status || 'On Credit')}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-800 dark:text-slate-200 font-mono pr-3">
                        Rs. {liveReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white font-mono pr-3">
                        Rs. {Number(inv.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right font-black font-mono pr-3">
                        <span className={isFullyPaid ? 'text-green-600 dark:text-green-400 font-bold' : liveReceived > 0 ? 'text-amber-500 dark:text-amber-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold'}>
                          Rs. {(isFullyPaid ? 0 : liveRemaining).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <TableActions
                          onPrint={() => navigate(`${tenantId ? `/${tenantId}` : ''}/sales/invoice/print/${inv.id}`)}
                          onReturn={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales-Return/Debit-Notes/Add`, { state: { invoice: inv } })}
                          onEdit={() => navigate('/sales/invoice/add', { state: { invoice: inv } })}
                          onDelete={() => handleDeleteInvoice(inv.id)}
                          printTitle="Print Invoice"
                          returnTitle="Sale Return"
                          editTitle="Edit Invoice"
                          deleteTitle="Delete Invoice"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="text-slate-500 dark:text-slate-400">Showing {startIndex + 1} to {endIndex} of {totalEntries} entries</div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
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
                type="button"
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

export default SalesHistory;
