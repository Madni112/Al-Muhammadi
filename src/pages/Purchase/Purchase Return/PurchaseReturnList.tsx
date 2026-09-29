import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import TableActions from '../../../ui/TableActions';
import { useAuth } from '../../../Context/Auth';
import { MdStore, MdPerson, MdReceipt, MdEvent, MdAdd } from 'react-icons/md';
import { logActivity } from '../../../service/auditLogger';

const PurchaseReturnList = () => {
  const { tenantId, user } = useAuth();
  const navigate = useNavigate();
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subsequentReceiptsMap, setSubsequentReceiptsMap] = useState<{ [key: string]: number }>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

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

  const fetchReturnLogs = async () => {
    try {
      setLoading(true);
      const { data: rtnData, error: rtnError } = await supabase
        .from('purchase_returns')
        .select('*')
        .order('created_at', { ascending: false });

      if (rtnError) throw rtnError;

      const { data: recData, error: recError } = await supabase
        .from('purchase_return_receipts')
        .select('return_no, amount_received');

      if (recError) throw recError;

      const receiptTotals: { [key: string]: number } = {};
      if (recData) {
        recData.forEach((r: any) => {
          const code = (r.return_no || '').toUpperCase().trim();
          receiptTotals[code] = (receiptTotals[code] || 0) + (Number(r.amount_received) || 0);
        });
      }

      setSubsequentReceiptsMap(receiptTotals);
      setReturns(rtnData || []);
    } catch (err: any) {
      toast.error('Data Fetching Failure: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturnLogs();
  }, []);

  const handleDeleteReturnRecord = async (id: string | number) => {
    if (!window.confirm('Are you certain you want to permanently delete this return record note?')) return;

    try {
      setLoading(true);
      const { data: targetRecord } = await supabase.from('purchase_returns').select('*').eq('id', id).single();
      if (targetRecord?.items) {
        for (const item of targetRecord.items) {
          const qty = Number(item.qty || item.quantity || 0);
          const pName = item.itemName || item.product_name;

          if (pName) {
            // 1. Increase Master Product Stock (+)
            const { data: prod } = await supabase.from('products').select('current_stock').ilike('product_name', pName).maybeSingle();
            if (prod) {
              await supabase.from('products').update({ current_stock: (Number(prod.current_stock) || 0) + qty }).ilike('product_name', pName);
            }

            // warehouse_inventory retired — formula-based stock is source of truth
          }
        }
      }
      const { error } = await supabase.from('purchase_returns').delete().eq('id', id);
      if (error) throw error;

      // Log audit activity
      logActivity({
        action: 'DELETE',
        tableName: 'purchase_returns',
        details: {
          return_no: targetRecord?.return_no || targetRecord?.return_number || id,
          vendor_name: targetRecord?.vendor_name || targetRecord?.supplier_name,
          amount: targetRecord?.total_amount || targetRecord?.total,
          event: 'Deleted Purchase Return'
        },
        performedBy: user?.name || user?.email || 'User'
      });

      toast.success('Return note removed and inventory restored cleanly!');
      fetchReturnLogs();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredReturns = returns.filter(r =>
    (r.return_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.vendor_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.source_warehouse || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalEntries = filteredReturns.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedReturns = filteredReturns.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-black dark:text-bodydark text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black dark:text-white flex items-center gap-2">
            <MdReceipt className="text-primary" size={24} />
            Vendor Purchase Returns Registry (Debit Notes)
          </h2>
          <p className="text-xs text-gray-400">Trace outbound product returns, debit notes, and warehouse shelf offsets</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return/Add`)}
          className="flex items-center gap-1.5 justify-center rounded bg-primary hover:bg-opacity-90 py-2.5 px-4 text-xs font-bold text-white shadow-sm transition cursor-pointer"
        >
          <MdAdd size={16} /> Log New Return Note
        </button>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-stroke py-1 px-2 bg-transparent dark:border-strokedark outline-none text-black dark:text-white font-bold"
            >
              {[10, 25, 50, 100].map((size) => <option key={size} value={size} className="dark:bg-boxdark">{size}</option>)}
            </select>
            <span>entries</span>
          </div>
          <div className="flex items-center gap-2 text-xs w-full sm:w-auto text-gray-500 dark:text-gray-400">
            <span>Search:</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by return #, vendor, warehouse..."
              className="w-full sm:w-64 rounded-lg border border-stroke py-1.5 px-3 bg-transparent dark:border-strokedark outline-none text-black dark:text-white text-xs font-semibold"
            />
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-2 text-left dark:bg-meta-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                <th className="py-4 px-4 font-semibold w-16 text-center whitespace-nowrap">S#</th>
                <th className="py-4 px-4 font-semibold whitespace-nowrap">Debit Note #</th>
                <th className="py-4 px-4 font-semibold whitespace-nowrap">Wholesale Vendor</th>
                <th className="py-4 px-4 font-semibold whitespace-nowrap">Source Warehouse</th>
                <th className="py-4 px-4 text-center font-semibold whitespace-nowrap">Return Date</th>
                <th className="py-4 px-4 text-center font-semibold whitespace-nowrap">Reimbursement Status</th>
                <th className="py-4 px-4 text-right pr-6 font-semibold whitespace-nowrap">Gross Return</th>
                <th className="py-4 px-4 w-24 text-center font-semibold whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-sm"><Spinner /></td></tr>
              ) : paginatedReturns.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-500 dark:text-gray-400 italic">No outbound supply return records found.</td></tr>
              ) : (
                paginatedReturns.map((rtn, idx) => {
                  const serialNumber = startIndex + idx + 1;
                  const totalAmt = Number(rtn.total_amount) || 0;
                  const upfrontPaid = Number(rtn.amount_paid) || 0;
                  const subsequentCollected = subsequentReceiptsMap[(rtn.return_no || '').toUpperCase().trim()] || 0;
                  const aggregatedPaidValue = upfrontPaid + subsequentCollected;

                  let returnStatusText = 'On Credit (Debit Note)';
                  let returnStatusColor = 'bg-primary/10 text-primary border-primary/20';

                  if (aggregatedPaidValue >= totalAmt - 1 && totalAmt > 0) {
                    returnStatusText = 'Full Cash Refund';
                    returnStatusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
                  } else if (aggregatedPaidValue > 0 && aggregatedPaidValue < totalAmt) {
                    returnStatusText = 'Partial Refund';
                    returnStatusColor = 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60';
                  }

                  return (
                    <tr key={rtn.id} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/10 duration-150 font-semibold text-black dark:text-white text-xs">
                      <td className="py-3.5 px-4 text-center text-gray-400 whitespace-nowrap">{serialNumber}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-primary whitespace-nowrap">{rtn.return_no}</td>
                      <td className="py-3.5 px-4 flex items-center gap-1.5 whitespace-nowrap"><MdPerson className="text-gray-400 shrink-0" size={16} />{rtn.vendor_name}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="bg-slate-100 dark:bg-meta-4 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide inline-flex items-center gap-1 whitespace-nowrap">
                          <MdStore size={12} className="text-primary shrink-0" />{rtn.source_warehouse}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center text-gray-500 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap"><MdEvent size={13} className="shrink-0" />{rtn.return_date}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border whitespace-nowrap ${returnStatusColor}`}>
                          {returnStatusText}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-black dark:text-white pr-6 whitespace-nowrap">
                        Rs. {formatMoney(totalAmt)}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <TableActions
                          onPrint={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return/Print/${rtn.id}`)}
                          onEdit={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return/Add`, { state: { returnRecord: rtn } })}
                          onDelete={() => handleDeleteReturnRecord(rtn.id)}
                          printTitle="Print Debit Note"
                          editTitle="Edit Return Note"
                          deleteTitle="Delete Return Note"
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
          <div className="text-xs text-gray-500 dark:text-gray-400">Showing {startIndex + 1} to {endIndex} of {totalEntries} entries</div>
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

export default PurchaseReturnList;
