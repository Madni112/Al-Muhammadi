import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import TableActions from '../../../ui/TableActions';
import { useAuth } from '../../../Context/Auth';
import { logActivity } from '../../../service/auditLogger';

const SalesReturnList = () => {
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [returns, setReturns] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [openActionId, setOpenActionId] = useState<any | null>(null);
  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, right: 0 });

  useEffect(() => {
    fetchSalesReturns();
  }, []);

  useEffect(() => {
    const handleOutsideClick = () => setOpenActionId(null);
    const handleScrollResize = () => setOpenActionId(null);
    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('scroll', handleScrollResize, true);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('scroll', handleScrollResize, true);
    };
  }, []);

  const fetchSalesReturns = async () => {
    try {
      setLoading(true);
      const { data: returnsData, error } = await supabase
        .from('sales_returns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReturns(returnsData || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReturn = async (id: string | number) => {
    if (!window.confirm('Are you completely certain you want to delete this sales return debit note record?')) return;

    try {
      const { data: targetReturn, error: fetchError } = await supabase
        .from('sales_returns')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      if (targetReturn) {
        if (targetReturn.items) {
          const itemsArr = Array.isArray(targetReturn.items) ? targetReturn.items : JSON.parse(targetReturn.items || '[]');
          const dispatchLoc = targetReturn.dispatch_warehouse || targetReturn.location || '';

          for (const item of itemsArr) {
            const pName = item.itemName || item.product_name;
            const qty = Number(item.qty || item.returnedQty || item.quantity || 0);

            if (pName) {
              // 1. Decrease Master Product Stock (-)
              const { data: currentProduct } = await supabase
                .from('products')
                .select('current_stock')
                .ilike('product_name', pName)
                .maybeSingle();

              if (currentProduct) {
                const reducedStockCount = Math.max(0, (Number(currentProduct.current_stock) || 0) - qty);
                await supabase
                  .from('products')
                  .update({ current_stock: reducedStockCount })
                  .eq('id', currentProduct.id || '');
              }

              // warehouse_inventory retired — formula-based stock is source of truth
            }
          }
        }
      }

      const { error: deleteError } = await supabase.from('sales_returns').delete().eq('id', id);
      if (deleteError) throw deleteError;

      logActivity({
        action: 'DELETE',
        tableName: 'sales_returns',
        details: {
          id,
          customer_name: targetReturn?.customer_name,
          return_number: targetReturn?.return_no || `#${id}`,
          total_amount: targetReturn?.total_amount,
          event: `Deleted sales return note #${id} (${targetReturn?.customer_name || 'Customer'})`
        }
      });

      toast.success('Sales Return deleted cleanly. Stock quantities reverted!');
      fetchSalesReturns();
    } catch (err: any) {
      toast.error('Deletion Failed: ' + err.message);
    }
  };

  const filteredReturns = returns.filter((item) => {
    const sTerm = searchTerm.toLowerCase();
    const customer = (item.customer_name || '').toLowerCase();
    const origInvoice = String(item.original_invoice_no || '').toLowerCase();
    const returnId = String(item.id || '').toLowerCase();
    return customer.includes(sTerm) || origInvoice.includes(sTerm) || returnId.includes(sTerm);
  });

  const totalEntries = filteredReturns.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedReturns = filteredReturns.slice(startIndex, startIndex + pageSize);

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-slate-800 dark:text-slate-100 text-xs">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Sales Returns & Credit Notes</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Manage customer return debit notes, stock reversals and settlement vouchers</p>
        </div>
        <button
          onClick={() => navigate('/Sales-Return/Debit-Notes/Add')}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 px-4 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm hover:shadow-md cursor-pointer"
        >
          <span>+ Add Return Note</span>
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
              placeholder="Search return #, customer, invoice..."
              className="w-full sm:w-72 rounded-xl border border-slate-200 py-2 px-3.5 bg-slate-50/50 dark:bg-slate-800/60 dark:border-slate-700 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 text-xs text-slate-800 dark:text-white transition"
            />
          </div>
        </div>

        <div className="max-w-full overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                <th className="py-3.5 px-4 w-12 text-center">S#</th>
                <th className="py-3.5 px-4 font-mono">Return Note #</th>
                <th className="py-3.5 px-4 font-mono">Original Invoice</th>
                <th className="py-3.5 px-4 font-mono">Gate Pass #</th>
                <th className="py-3.5 px-4">Return Date</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4 w-36 text-center">Return Status</th>
                <th className="py-3.5 px-4 text-right pr-3 font-mono">Total Net Amount</th>
                <th className="py-3.5 px-4 w-14 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              ) : filteredReturns.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-xs text-slate-400 italic">No return records found.</td></tr>
              ) : (
                paginatedReturns.map((ret, idx) => {
                  const serialNumber = startIndex + idx + 1;
                  const rawInvoiceStr = String(ret.invoice_no || ret.original_invoice_no || '').trim();
                  const cleanNum = rawInvoiceStr.replace(/^inv-?/i, '').trim();
                  const displayInvoiceNo = cleanNum ? `INV-${cleanNum.padStart(4, '0')}` : (rawInvoiceStr || '-');

                  const payout = Number(ret.payout_amount_paid || 0);
                  const total = Number(ret.total_amount || 0);
                  const isFullPaid = ret.return_status === 'Paid' || (payout > 0 && payout >= total - 0.01);
                  const isPartialPaid = !isFullPaid && payout > 0;

                  let statusLabel = 'Credit Settled';
                  let badgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400';

                  if (isFullPaid) {
                    statusLabel = ret.settlement_mode === 'Bank' ? 'Bank Refund' : 'Cash Refund';
                    badgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400';
                  } else if (isPartialPaid) {
                    statusLabel = `Partial Refund (Rs. ${payout.toFixed(2)})`;
                    badgeClass = 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400';
                  }

                  return (
                    <tr key={ret.id} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 duration-150">
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-center font-mono">{serialNumber}</td>
                      <td className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400 font-mono">{`RTN-${String(ret.id).padStart(4, '0')}`}</td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-600 dark:text-slate-400">{displayInvoiceNo}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">{ret.gate_pass_no || '-'}</td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">{ret.return_date ? ret.return_date : new Date(ret.created_at).toLocaleDateString()}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{ret.customer_name}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex rounded-full py-0.5 px-2.5 text-[10px] font-bold uppercase tracking-wide ${badgeClass}`}>
                          {statusLabel}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-black text-rose-600 font-mono pr-3">
                        Rs. {Number(ret.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <TableActions
                          onPrint={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales-Return/Debit-Notes/Print/${ret.id}`)}
                          onEdit={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales-Return/Debit-Notes/Edit/${ret.id}`, { state: { returnData: ret } })}
                          onDelete={() => handleDeleteReturn(ret.id)}
                          printTitle="Print Voucher"
                          editTitle="Edit Return"
                          deleteTitle="Delete Record"
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
          <div className="text-slate-500 dark:text-slate-400">
            Showing {startIndex + 1} to {endIndex} of {totalEntries} entries
          </div>
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

export default SalesReturnList;
