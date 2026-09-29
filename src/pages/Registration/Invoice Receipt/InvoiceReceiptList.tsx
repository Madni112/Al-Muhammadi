import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import TableActions from '../../../ui/TableActions';
import { useAuth } from '../../../Context/Auth';
import { recalculateInvoiceSettlementStatus } from '../../../service/financialCalculations';
import { logActivity } from '../../../service/auditLogger';

function InvoiceReceiptList() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchInvoiceReceiptHistories();
  }, []);

  const fetchInvoiceReceiptHistories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('financial_vouchers')
        .select('*')
        .or('voucher_type.eq.Cash Receipt Voucher,voucher_type.eq.Bank Receipt Voucher,voucher_type.eq.Cash & Bank Receipt Voucher')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const salesReceiptsOnly = (data || []).filter((r: any) => {
        const source = r.metadata?.moduleSource || '';
        if (source === 'purchase_return_receipt' || source === 'purchase_receipt' || source === 'sales_return_receipt') {
          return false;
        }
        return !!r.customer_name || !!r.customerName || !r.party_name;
      });
      setReceipts(salesReceiptsOnly);
    } catch (err: any) {
      toast.error('Failed to load receipts data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReceipt = async (id: number | string) => {
    if (!window.confirm('Are you certain you want to remove this invoice receipt record from the general ledger entries?')) return;

    try {
      setLoading(true);
      // 1. Fetch voucher details before deleting to resolve linked invoice
      const { data: voucherToDelete } = await supabase
        .from('financial_vouchers')
        .select('original_invoice_no')
        .eq('id', id)
        .maybeSingle();

      const { error } = await supabase
        .from('financial_vouchers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      logActivity({
        action: 'DELETE',
        tableName: 'invoice_receipts',
        details: {
          id,
          receipt_number: voucherToDelete?.voucher_no || `#${id}`,
          customer_name: voucherToDelete?.customer_name,
          linked_invoice: voucherToDelete?.original_invoice_no,
          event: `Deleted customer payment receipt #${id}`
        }
      });

      // 2. Synchronously recalculate parent sales invoice receipt_status
      if (voucherToDelete?.original_invoice_no) {
        await recalculateInvoiceSettlementStatus(voucherToDelete.original_invoice_no);
      }

      toast.success('Invoice receipt record wiped cleanly.');
      fetchInvoiceReceiptHistories();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredReceipts = receipts.filter((r) =>
    r.voucher_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.original_invoice_no?.toString().includes(searchTerm)
  );

  const totalEntries = filteredReceipts.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedReceipts = filteredReceipts.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-xs text-textColor">
      <div className="flex flex-col sm:flex-row justify-between items-center pb-4 border-b border-stroke dark:border-strokedark gap-4">
        <h2 className="text-xl font-bold text-black dark:text-white flex items-center gap-2">
          Invoice Receipts Directory Logs
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/Add`)}
            className="flex items-center justify-center rounded-lg bg-primary py-2.5 px-5 text-xs font-bold text-white hover:bg-opacity-90 transition duration-150 shadow-sm cursor-pointer gap-2"
          >
            + Create Receipt Voucher
          </button>
        </div>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Show</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded border border-stroke py-1 px-2 bg-transparent dark:border-strokedark outline-none text-xs font-semibold text-black dark:text-white" >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size} className="dark:bg-boxdark">{size}</option>
              ))}
            </select>
            <span>entries</span>
          </div>

          <div className="flex items-center gap-2 text-xs w-full sm:w-auto text-gray-500 dark:text-gray-400">
            <span>Search:</span>
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by receipt no, customer..." className="w-full sm:w-64 rounded border border-stroke py-1.5 px-3 bg-transparent dark:border-strokedark outline-none text-xs text-black dark:text-white" />
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-2 text-left dark:bg-meta-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                <th className="py-4 px-4 font-semibold w-16">S#</th>
                <th className="py-4 px-4 font-semibold w-32">Receipt Slip No</th>
                <th className="py-4 px-4 font-semibold w-28">Linked Invoice</th>
                <th className="py-4 px-4 font-semibold w-40">Settlement Method</th>
                <th className="py-4 px-4 font-semibold">Client Name</th>
                <th className="py-4 px-4 font-semibold text-right w-36">Amount Collected</th>
                <th className="py-4 px-4 font-semibold text-center w-32">Received Date</th>
                <th className="py-4 px-4 font-semibold text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12"><Spinner /></td></tr>
              ) : paginatedReceipts.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400 select-none">No client invoice payment receipts documented in active logs.</td></tr>
              ) : (
                paginatedReceipts.map((r, idx) => {
                  const serialNumber = startIndex + idx + 1;
                  return (
                    <tr key={r.id} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/10 duration-150">
                      <td className="py-3.5 px-4 font-medium text-black dark:text-white">{serialNumber}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-primary tracking-wide">{r.voucher_no}</td>
                      <td className="py-3.5 px-4 font-mono font-bold">
                        {r.original_invoice_no ? (
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[10px]">
                            {r.original_invoice_no}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-sans">General Ledger</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          r.voucher_type === 'Cash Receipt Voucher' 
                            ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200/60 dark:border-red-800/60' 
                            : r.voucher_type === 'Bank Receipt Voucher'
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60'
                            : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60'
                        }`}>
                          {r.voucher_type === 'Cash Receipt Voucher' ? 'Cash Counter' : (r.voucher_type === 'Bank Receipt Voucher' ? 'Bank Wire' : 'Split Payment')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-black dark:text-white whitespace-nowrap">{r.customer_name}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-success font-mono">Rs. {formatMoney(r.total_amount)}</td>
                      <td className="py-3.5 px-4 text-center text-gray-500 font-medium whitespace-nowrap">{r.voucher_date}</td>
                      <td className="py-3.5 px-4 text-center">
                        <TableActions
                          onPrint={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/Print/${r.id}`)}
                          onEdit={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/Add`, { state: { receipt: r } })}
                          onDelete={() => handleDeleteReceipt(r.id)}
                          printTitle="Print Receipt Voucher"
                          editTitle="Modify Receipt"
                          deleteTitle="Delete Receipt"
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
            <span className="px-3 py-1.5 font-bold text-rose-600 text-xs">
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

export default InvoiceReceiptList;
