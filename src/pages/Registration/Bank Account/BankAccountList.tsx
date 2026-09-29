import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import TableActions from '../../../ui/TableActions';
import { MdAccountBalance } from 'react-icons/md';

const BankAccountList = () => {
  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage] = useState(10);
  const navigate = useNavigate();

  useEffect(() => { fetchBanks(); }, []);

  const fetchBanks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('banks')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;
      const normalized = (data || []).map((b: any) => ({
        ...b,
        accountTitle: b.accountTitle || b.accounttitle || b.account_title || '',
        accountNumber: b.accountNumber || b.accountnumber || b.account_no || '',
        bankName: b.bankName || b.bankname || '',
        branchName: b.branchName || b.branchname || '',
        branchCode: b.branchCode || b.branchcode || '',
        branchNumber: b.branchNumber || b.branchnumber || '',
        contactPerson: b.contactPerson || b.contactperson || '',
        phoneNumber: b.phoneNumber || b.phonenumber || '',
        openingBalance: b.openingBalance || b.openingbalance || 0,
        openingBalanceDate: b.openingBalanceDate || b.openingbalancedate || '',
        address: b.address || ''
      }));
      setBanks(normalized);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to permanently delete this bank account ledger?')) {
      try {
        const { error } = await supabase.from('banks').delete().eq('id', id);
        if (error) throw error;
        toast.success('Account record removed successfully');
        fetchBanks();
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800/80 dark:bg-[#111827]">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h4 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2 tracking-tight">
            <MdAccountBalance className="text-emerald-600 dark:text-emerald-400 text-2xl" /> Bank Accounts Directory
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Manage enterprise bank accounts, branches & IBAN ledgers</p>
        </div>
        <button 
          onClick={() => navigate('/Registration/Bank-Account/AddBank')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-sm cursor-pointer"
        >
          + Add Bank Account
        </button>
      </div>

      <div className="max-w-full overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
        <table className="w-full table-auto text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
              <th className="py-3.5 px-4 font-bold">Account Title</th>
              <th className="py-3.5 px-4 font-bold">Account Number</th>
              <th className="py-3.5 px-4 font-bold">Branch Name</th>
              <th className="py-3.5 px-4 font-bold">Branch Code</th>
              <th className="py-3.5 px-4 font-bold text-center w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-10"><Spinner /></td></tr>
            ) : banks.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-slate-400 italic">No bank records found. Click "+ Add Bank Account" to begin.</td></tr>
            ) : (
              banks.slice((currentPage - 1) * entriesPerPage, currentPage * entriesPerPage).map((b) => (
                <tr key={b.id} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{b.accountTitle}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300 font-semibold">{b.accountNumber}</td>
                  <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">{b.branchName || 'N/A'}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">{b.branchCode || 'N/A'}</td>
                  <td className="py-3.5 px-4 text-center">
                    <TableActions
                      onEdit={() => navigate('/Registration/Bank-Account/AddBank', { state: { bank: b } })}
                      onDelete={() => handleDelete(b.id)}
                      editTitle="Edit Account"
                      deleteTitle="Delete Account"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <div>
          Showing {banks.length > 0 ? (currentPage - 1) * entriesPerPage + 1 : 0} to {Math.min(currentPage * entriesPerPage, banks.length)} of {banks.length} entries
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
            Page {currentPage} of {Math.ceil(banks.length / entriesPerPage) || 1}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(Math.ceil(banks.length / entriesPerPage), p + 1))}
            disabled={currentPage === Math.ceil(banks.length / entriesPerPage) || banks.length === 0}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold disabled:opacity-40 cursor-pointer text-xs"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default BankAccountList;
