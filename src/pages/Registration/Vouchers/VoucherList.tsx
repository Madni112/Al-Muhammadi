import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import TableActions from '../../../ui/TableActions';
import { MdReceipt, MdAssignment, MdDelete } from 'react-icons/md';
import { useAuth } from '../../../Context/Auth';
import { recalculateInvoiceSettlementStatus } from '../../../service/financialCalculations';
import { logActivity } from '../../../service/auditLogger';

function VoucherList() {
  const { tenantId, user } = useAuth();
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchVoucherLedgerHistory();
  }, []);

  const fetchVoucherLedgerHistory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('financial_vouchers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVouchers(data || []);
    } catch (err: any) {
      toast.error('Failed to load voucher histories: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVoucher = async (id: number | string) => {
    if (!window.confirm('Are you sure you want to delete this voucher? This will permanently remove it from the general ledger records.')) return;

    try {
      setLoading(true);
      // 1. Fetch voucher details to check for linked invoice
      const { data: voucherToDelete } = await supabase
        .from('financial_vouchers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      const { error } = await supabase
        .from('financial_vouchers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Log audit activity
      logActivity({
        action: 'DELETE',
        tableName: 'financial_vouchers',
        details: {
          voucher_no: voucherToDelete?.voucher_no || id,
          voucher_type: voucherToDelete?.voucher_type,
          amount: voucherToDelete?.total_amount,
          event: 'Deleted Financial Voucher'
        },
        performedBy: user?.name || user?.email || 'User'
      });

      // 2. Synchronize invoice settlement status
      if (voucherToDelete?.original_invoice_no) {
        await recalculateInvoiceSettlementStatus(voucherToDelete.original_invoice_no);
      }

      toast.success('Voucher record deleted cleanly.');
      fetchVoucherLedgerHistory();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };


  const filteredVouchers = vouchers.filter((v) =>
    v.voucher_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.voucher_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.narration?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalEntries = filteredVouchers.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedVouchers = filteredVouchers.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-black dark:text-white flex items-center gap-2">
          🧾 General Ledger Financial Vouchers
        </h2>
        <button
          type="button"
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Registration/Vouchers/Add`)}
          className="flex items-center justify-center rounded bg-primary py-2 px-4 text-sm font-medium text-white hover:bg-opacity-90 transition duration-150 shadow-sm cursor-pointer"
        >
          + Add New Voucher
        </button>

      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded border border-stroke py-1 px-2 bg-transparent dark:border-strokedark outline-none text-xs font-semibold text-black dark:text-white"
            >
              {[10, 25, 50, 100].map((size: number) => (
                <option key={size} value={size} className="dark:bg-boxdark">{size}</option>
              ))}
            </select>
            <span>entries</span>
          </div>
          <div className="flex items-center gap-2 text-xs w-full sm:w-auto text-gray-500 dark:text-gray-400">
            <span>Search:</span>
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search voucher no, type..." className="w-full sm:w-64 rounded border border-stroke py-1.5 px-3 bg-transparent dark:border-strokedark outline-none text-xs text-black dark:text-white" />
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-2 text-left dark:bg-meta-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                <th className="py-4 px-4 font-semibold w-16">S#</th>
                <th className="py-4 px-4 font-semibold w-32">Voucher Slip No</th>
                <th className="py-4 px-4 font-semibold w-48">Classification Type</th>
                <th className="py-4 px-4 font-semibold">Description Note / Accounts</th>
                <th className="py-4 px-4 font-semibold text-right w-36">Total Amount</th>
                <th className="py-4 px-4 font-semibold text-center w-32">Voucher Date</th>
                <th className="py-4 px-4 font-semibold text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Spinner /></td></tr>
              ) : paginatedVouchers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No transaction voucher slips documented inside system history logs.</td></tr>
              ) : (
                paginatedVouchers.map((v, idx) => {
                  const serialNumber = startIndex + idx + 1;
                  return (
                    <tr key={v.id} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/10 duration-150">
                      <td className="py-3.5 px-4 font-medium text-black dark:text-white">{serialNumber}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-primary tracking-wide">{v.voucher_no}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]
                          ${v.voucher_type === 'Journal Voucher' ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-600' :
                            v.voucher_type?.includes('Receipt') ? 'bg-success/10 text-success' : 'bg-red-50 dark:bg-red-950/40 text-danger'}`}>
                          <MdAssignment size={11} /> {v.voucher_type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-400 font-medium max-w-xs">
                        <div className="flex flex-col gap-0.5">
                          {v.items && v.items.map((item: any, idx: number) => {
                            const amountStr = item.debit > 0 ? `(Dr: ${item.debit})` : `(Cr: ${item.credit})`;
                            return (
                              <div key={idx} className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                <span className="font-bold text-black dark:text-white">{item.accountCode}</span> {amountStr}
                              </div>
                            );
                          })}
                          {(v.notes || v.narration) && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 border-t border-stroke dark:border-strokedark mt-1 pt-0.5 italic">Note: {v.notes || v.narration}</p>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-black dark:text-white font-mono">{Number(v.total_amount || 0).toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-center text-gray-500 font-medium">{v.voucher_date}</td>
                      <td className="py-3.5 px-4 text-center">
                        <TableActions
                          onEdit={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Registration/Vouchers/Add`, { state: { voucher: v } })}
                          onDelete={() => handleDeleteVoucher(v.id)}
                          editTitle="View or Edit Voucher"
                          deleteTitle="Delete Voucher"
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
}

export default VoucherList;
