import React, { useEffect, useState } from 'react'; 
import { useNavigate } from 'react-router-dom'; 
import { supabase } from '../../../Context/supabaseClient'; 
import { toast } from 'react-hot-toast'; 
import Spinner from '../../../ui/Spinner'; 
import TableActions from '../../../ui/TableActions';
import { useAuth } from '../../../Context/Auth';
import { MdAccountBalanceWallet, MdAdd, MdEdit, MdClose, MdCheckCircle } from 'react-icons/md';

const CustomerHistory = () => { 
  const { tenantId } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]); 
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); 
  const navigate = useNavigate(); 

  // Modal State
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [accountCodeInput, setAccountCodeInput] = useState('');
  const [openingBalanceInput, setOpeningBalanceInput] = useState('');
  const [balanceNatureInput, setBalanceNatureInput] = useState<'Debit' | 'Credit'>('Debit');
  const [savingAccount, setSavingAccount] = useState(false);

  // Datatable search and pagination trackers
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { 
    fetchCustomersAndCOA(); 
  }, []); 

  const fetchCustomersAndCOA = async () => { 
    setLoading(true); 
    try { 
      const [custRes, coaRes] = await Promise.all([
        supabase.from('customers').select('*').order('customerName', { ascending: true }),
        supabase.from('chart_of_accounts').select('*')
      ]);
      
      if (custRes.error) throw custRes.error; 
      setCustomers(custRes.data || []); 
      if (coaRes.data) setCoaAccounts(coaRes.data);
    } catch (err: any) { 
      toast.error(err.message); 
    } finally { 
      setLoading(false); 
    } 
  }; 

  const getCustomerCOA = (cust: any) => {
    const cName = (cust.customerName || '').trim().toLowerCase();
    // Match by customer_code / account_code or exact account_title
    return coaAccounts.find(a => 
      (cust.account_code && String(a.account_code).trim() === String(cust.account_code).trim()) ||
      (a.control_code === 'Customers' && (a.account_title || '').trim().toLowerCase() === cName) ||
      ((a.account_title || '').trim().toLowerCase() === cName)
    );
  };

  const getNextSuggestedCode = () => {
    const custAccounts = coaAccounts.filter(a => a.control_code === 'Customers' || String(a.account_code).startsWith('1020-'));
    let maxNum = 0;
    custAccounts.forEach(a => {
      const match = String(a.account_code || '').match(/1020-(\d+)/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `1020-${String(maxNum + 1).padStart(3, '0')}`;
  };

  const handleOpenAccountModal = (cust: any) => {
    setSelectedCustomer(cust);
    const existingCOA = getCustomerCOA(cust);
    if (existingCOA) {
      setAccountCodeInput(existingCOA.account_code || '');
      setOpeningBalanceInput(existingCOA.opening_balance !== undefined && existingCOA.opening_balance !== null ? String(existingCOA.opening_balance) : '');
      setBalanceNatureInput(existingCOA.balance_nature || 'Debit');
    } else {
      setAccountCodeInput(getNextSuggestedCode());
      setOpeningBalanceInput('');
      setBalanceNatureInput('Debit');
    }
    setShowAccountModal(true);
  };

  const handleSaveAccountCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const cleanCode = accountCodeInput.trim();
    if (!cleanCode) {
      toast.error('Account Code is mandatory');
      return;
    }

    try {
      setSavingAccount(true);
      const existingCOA = getCustomerCOA(selectedCustomer);

      // Check for code uniqueness across other accounts
      const duplicateCode = coaAccounts.find(a => 
        String(a.account_code).trim().toLowerCase() === cleanCode.toLowerCase() && 
        (!existingCOA || a.id !== existingCOA.id)
      );
      if (duplicateCode) {
        toast.error(`Account code "${cleanCode}" is already used by "${duplicateCode.account_title}". Please enter a unique code.`);
        setSavingAccount(false);
        return;
      }

      const customerName = (selectedCustomer.customerName || '').trim();
      const coaPayload: any = {
        category_code: '1. ASSETS',
        sub_category_code: 'Current Assets',
        control_code: 'Customers',
        account_code: cleanCode,
        account_title: customerName,
        notes: `Customer ledger account for ${customerName}${openingBalanceInput ? ` (Opening Balance: ${openingBalanceInput} ${balanceNatureInput})` : ''}`
      };

      if (existingCOA?.id) {
        const { error } = await supabase
          .from('chart_of_accounts')
          .update(coaPayload)
          .eq('id', existingCOA.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('chart_of_accounts')
          .insert([coaPayload]);
        if (error) throw error;
      }

      // Record Opening Balance in financial_vouchers if opening balance > 0
      if (openingBalanceInput && Number(openingBalanceInput) > 0) {
        const bal = Number(openingBalanceInput);
        try {
          await supabase.from('financial_vouchers').insert([{
            voucher_no: `OB-${cleanCode}`,
            voucher_type: 'JV',
            voucher_date: new Date().toISOString().split('T')[0],
            account_code: cleanCode,
            account_title: customerName,
            debit: balanceNatureInput === 'Debit' ? bal : 0,
            credit: balanceNatureInput === 'Credit' ? bal : 0,
            narration: `Opening Balance for Customer ${customerName}`
          }]);
        } catch (_) {
          // Non-blocking if financial_vouchers has different required constraints
        }
      }

      // Try updating customer record with account_code and currentBalance
      try {
        const custUpdates: any = { account_code: cleanCode };
        if (openingBalanceInput) {
          const bal = Number(openingBalanceInput);
          custUpdates.currentBalance = balanceNatureInput === 'Debit' ? bal : -bal;
        }
        await supabase
          .from('customers')
          .update(custUpdates)
          .eq('id', selectedCustomer.id);
      } catch (_) {
        try {
          await supabase
            .from('customers')
            .update({ account_code: cleanCode })
            .eq('id', selectedCustomer.id);
        } catch (_) {}
      }

      toast.success(`Chart of Account for "${selectedCustomer.customerName}" assigned successfully!`);
      setShowAccountModal(false);
      await fetchCustomersAndCOA();
    } catch (err: any) {
      toast.error('Failed to save account: ' + err.message);
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDelete = async (id: string) => { 
    if (window.confirm('Are you sure you want to delete this customer? This cannot be undone.')) { 
      try { 
        const { error } = await supabase.from('customers').delete().eq('id', id); 
        if (error) throw error; 
        toast.success('Customer deleted successfully'); 
        fetchCustomersAndCOA(); 
      } catch (err: any) { 
        toast.error(err.message); 
      } 
    } 
  }; 

  // Live filter query filter condition evaluation
  const filteredCustomers = customers.filter(c => 
    c.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.customer_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.customerCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.ntnNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.primaryPhone?.includes(searchTerm) ||
    c.account_code?.includes(searchTerm)
  );

  // Pagination calculation vectors
  const totalEntries = filteredCustomers.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  return ( 
    <div className="rounded-sm border border-stroke bg-white px-5 pt-6 pb-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5"> 
      
      {/* Dynamic Header Layout */}
      <div className="flex justify-between items-center mb-6"> 
        <div>
          <h4 className="text-xl font-semibold text-black dark:text-white">Customer Database</h4> 
          <p className="text-xs text-gray-500 mt-0.5">Manage customer directory and assign Chart of Account ledger codes</p>
        </div>
        <button 
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Customers/customer-details`)} 
          className="bg-primary text-white py-2 px-4 rounded text-sm font-medium hover:bg-opacity-90 transition cursor-pointer shadow-sm" 
        > 
          + Add New Customer
        </button> 
      </div> 

      {/* Datatable Filter Control Header Line */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-stroke py-1 px-2 bg-transparent dark:border-strokedark outline-none focus:border-primary text-sm font-medium text-black dark:text-white"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size} className="dark:bg-boxdark">{size}</option>
            ))}
          </select>
          <span>entries</span>
        </div>

        <div className="flex items-center gap-2 text-sm w-full sm:w-auto text-gray-500 dark:text-gray-400">
          <span>Search:</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, code, phone, NTN..."
            className="w-full sm:w-64 rounded border border-stroke py-1.5 px-3 bg-transparent dark:border-strokedark outline-none focus:border-primary text-sm text-black dark:text-white"
          />
        </div>
      </div>

      {/* Core Table Canvas Frame */}
      <div className="max-w-full overflow-x-auto"> 
        <table className="w-full table-auto border-collapse"> 
          <thead> 
            <tr className="bg-gray-2 text-left dark:bg-meta-4"> 
              <th className="py-4 px-4 font-medium text-black dark:text-white text-sm w-16">S#</th>
              <th className="min-w-[180px] py-4 px-4 font-medium text-black dark:text-white text-sm">Name</th> 
              <th className="min-w-[140px] py-4 px-4 font-medium text-black dark:text-white text-sm">NTN / CNIC</th> 
              <th className="min-w-[110px] py-4 px-4 font-medium text-black dark:text-white text-sm">Phone</th> 
              <th className="min-w-[100px] py-4 px-4 font-medium text-black dark:text-white text-sm">Province</th> 
              <th className="min-w-[160px] py-4 px-4 font-medium text-black dark:text-white text-sm">Accounts</th> 
              <th className="py-4 px-4 font-medium text-black dark:text-white text-sm text-center w-28">Actions</th> 
            </tr> 
          </thead> 
          <tbody> 
            {loading ? ( 
              <tr><td colSpan={7} className="text-center py-12"><Spinner /></td></tr> 
            ) : paginatedCustomers.length === 0 ? ( 
              <tr><td colSpan={7} className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">No matching customer entries found.</td></tr> 
            ) : ( 
              paginatedCustomers.map((c, idx) => {
                const serialNumber = startIndex + idx + 1;
                const coa = getCustomerCOA(c);
                const custCode = c.customer_code || c.customerCode;

                return ( 
                  <tr key={c.id} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/10 duration-150"> 
                    <td className="py-3.5 px-4 text-sm text-black dark:text-white">{serialNumber}</td>
                    <td className="py-3.5 px-4 text-sm"> 
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {custCode && (
                          <span className="font-mono font-bold text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded">
                            {custCode}
                          </span>
                        )}
                        <span className="font-medium text-black dark:text-white">{c.customerName}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{c.company || 'Private Customer'}</p> 
                    </td> 
                    <td className="py-3.5 px-4 text-sm"> 
                      <p className="text-black dark:text-white font-mono text-xs">NTN: {c.ntnNo || 'N/A'}</p> 
                      {c.stRegNo && <p className="text-[11px] text-primary font-mono font-semibold">STRN: {c.stRegNo}</p>}
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">CNIC: {c.cnicNo || 'N/A'}</p> 
                    </td> 
                    <td className="py-3.5 px-4 text-sm text-black dark:text-white"><p>{c.primaryPhone || 'N/A'}</p></td> 
                    <td className="py-3.5 px-4 text-sm text-black dark:text-white"><p>{c.province || 'N/A'}</p></td> 
                    <td className="py-3.5 px-4 text-sm">
                      {coa ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-black text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 rounded shadow-2xs">
                            {coa.account_code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenAccountModal(c)}
                            className="text-[11px] text-primary hover:underline font-bold cursor-pointer inline-flex items-center gap-0.5"
                            title="Edit Account Code"
                          >
                            <MdEdit size={12} /> Edit
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenAccountModal(c)}
                          className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-bold transition duration-150 shadow-xs cursor-pointer"
                        >
                          <MdAdd size={14} /> Link Account
                        </button>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center"> 
                      <TableActions
                        onEdit={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Customers/customer-details`, { state: { customer: c } })}
                        onDelete={() => handleDelete(c.id)}
                        editTitle="Edit Customer"
                        deleteTitle="Delete Customer"
                      />
                    </td> 
                  </tr> 
                );
              }) 
            )} 
          </tbody> 
        </table> 
      </div> 

      {/* CALCULATED DATA COORDS SUMMARY METRIC FOOTER STRIP */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-stroke dark:border-strokedark">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing {startIndex + 1} to {endIndex} of {totalEntries} entries
          {searchTerm && ` (filtered from ${customers.length} total customers)`}
        </div>

        {/* Dynamic Page Controls Buttons Array Map */}
        {totalPages > 1 && (
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
        )}
      </div>

      {/* ── ASSIGN / EDIT ACCOUNT CODE MODAL ── */}
      {showAccountModal && selectedCustomer && (
        <div className="fixed inset-0 z-99999 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-lg border border-stroke bg-white p-6 shadow-2xl dark:border-strokedark dark:bg-boxdark">
            <div className="flex items-center justify-between border-b border-stroke pb-3 mb-4 dark:border-strokedark">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                  <MdAccountBalanceWallet size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-black dark:text-white text-sm">Assign Chart of Account Code</h4>
                  <p className="text-xs text-gray-500">Maps customer directly into Accounts Receivable asset ledger</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAccountModal(false)} 
                className="text-gray-400 hover:text-black dark:hover:text-white cursor-pointer p-1 rounded"
              >
                <MdClose size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveAccountCode} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Customer Name:</label>
                <input
                  type="text"
                  value={selectedCustomer.customerName || ''}
                  disabled
                  className="w-full rounded border border-stroke dark:border-strokedark px-3 h-9 bg-gray-100 dark:bg-meta-4/30 font-bold text-black dark:text-white text-xs cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-gray-400">Category:</span>
                  <span className="font-bold text-black dark:text-white text-xs">1. ASSETS</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-gray-400">Sub-Category:</span>
                  <span className="font-bold text-black dark:text-white text-xs">Current Assets</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] uppercase font-bold text-gray-400">Control Group:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">Customers (Trade Debtors)</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-black dark:text-white mb-1">
                  Assign Account Code: *
                </label>
                <input
                  type="text"
                  value={accountCodeInput}
                  onChange={(e) => setAccountCodeInput(e.target.value)}
                  placeholder="e.g. 1020-001"
                  required
                  className="w-full rounded border border-stroke dark:border-strokedark px-3 h-10 bg-transparent font-mono font-bold text-sm text-black dark:text-white outline-none focus:border-primary"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Auto-suggested prefix <code className="font-mono text-emerald-600">1020-xxx</code>. You can also customize this code.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Opening Balance:</label>
                  <input
                    type="number"
                    step="any"
                    value={openingBalanceInput}
                    onChange={(e) => setOpeningBalanceInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-stroke dark:border-strokedark px-3 h-9 bg-transparent font-mono font-bold text-xs text-black dark:text-white outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Balance Nature:</label>
                  <select
                    value={balanceNatureInput}
                    onChange={(e) => setBalanceNatureInput(e.target.value as 'Debit' | 'Credit')}
                    className="w-full rounded border border-stroke dark:border-strokedark px-3 h-9 bg-transparent font-bold text-xs text-black dark:text-white outline-none focus:border-primary dark:bg-boxdark"
                  >
                    <option value="Debit">Debit (Dr - Normal)</option>
                    <option value="Credit">Credit (Cr - Advance)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stroke dark:border-strokedark mt-4">
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="rounded px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="rounded bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingAccount ? <Spinner size="w-3.5 h-3.5" color="border-white" /> : <MdCheckCircle size={15} />}
                  <span>Save & Sync to COA</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div> 
  ); 
}; 

export default CustomerHistory;
