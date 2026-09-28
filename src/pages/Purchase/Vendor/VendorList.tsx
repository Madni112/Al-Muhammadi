import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import TableActions from '../../../ui/TableActions';
import { MdEdit, MdDelete, MdMoreVert, MdEmail, MdPhone, MdPerson, MdBusiness, MdAccountBalanceWallet, MdAdd, MdClose, MdCheckCircle } from 'react-icons/md';

const VendorList = () => {
    const navigate = useNavigate();
    const [vendors, setVendors] = useState<any[]>([]);
    const [coaAccounts, setCoaAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [selectedVendor, setSelectedVendor] = useState<any>(null);
    const [accountCodeInput, setAccountCodeInput] = useState('');
    const [openingBalanceInput, setOpeningBalanceInput] = useState('');
    const [balanceNatureInput, setBalanceNatureInput] = useState<'Debit' | 'Credit'>('Credit');
    const [savingAccount, setSavingAccount] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [pageSize, setPageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    const fetchRegisteredVendorsAndCOA = async () => {
        try {
            setLoading(true);
            const [vendRes, coaRes] = await Promise.all([
                supabase.from('vendors').select('*').order('id', { ascending: false }),
                supabase.from('chart_of_accounts').select('*')
            ]);

            if (vendRes.error) throw vendRes.error;
            setVendors(vendRes.data || []);
            if (coaRes.data) setCoaAccounts(coaRes.data);
        } catch (err: any) {
            toast.error('Registry Lookup Broken: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRegisteredVendorsAndCOA();
    }, []);

    const getVendorCOA = (vend: any) => {
        const vName = (vend.vendor_name || vend.name || '').trim().toLowerCase();
        return coaAccounts.find(a => 
            (vend.account_code && String(a.account_code).trim() === String(vend.account_code).trim()) ||
            ((a.control_code === 'Vendor' || a.control_code === 'Vendors') && (a.account_title || '').trim().toLowerCase() === vName) ||
            ((a.account_title || '').trim().toLowerCase() === vName)
        );
    };

    const getNextSuggestedCode = () => {
        const vendAccounts = coaAccounts.filter(a => a.control_code === 'Vendor' || a.control_code === 'Vendors' || String(a.account_code).startsWith('2010-'));
        let maxNum = 0;
        vendAccounts.forEach(a => {
            const match = String(a.account_code || '').match(/2010-(\d+)/);
            if (match && match[1]) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        return `2010-${String(maxNum + 1).padStart(3, '0')}`;
    };

    const handleOpenAccountModal = (vend: any) => {
        setSelectedVendor(vend);
        const existingCOA = getVendorCOA(vend);
        if (existingCOA) {
            setAccountCodeInput(existingCOA.account_code || '');
            setOpeningBalanceInput(existingCOA.opening_balance !== undefined && existingCOA.opening_balance !== null ? String(existingCOA.opening_balance) : '');
            setBalanceNatureInput(existingCOA.balance_nature || 'Credit');
        } else {
            setAccountCodeInput(getNextSuggestedCode());
            setOpeningBalanceInput('');
            setBalanceNatureInput('Credit');
        }
        setShowAccountModal(true);
    };

    const handleSaveAccountCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedVendor) return;
        const cleanCode = accountCodeInput.trim();
        if (!cleanCode) {
            toast.error('Account Code is mandatory');
            return;
        }

        try {
            setSavingAccount(true);
            const existingCOA = getVendorCOA(selectedVendor);

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

            const vendorName = (selectedVendor.vendor_name || selectedVendor.name || '').trim();
            const coaPayload: any = {
                category_code: '2. LIABILITIES',
                sub_category_code: 'Current Liabilities',
                control_code: 'Vendor',
                account_code: cleanCode,
                account_title: vendorName,
                notes: `Vendor ledger account for ${vendorName}${openingBalanceInput ? ` (Opening Balance: ${openingBalanceInput} ${balanceNatureInput})` : ''}`
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
                        account_title: vendorName,
                        debit: balanceNatureInput === 'Debit' ? bal : 0,
                        credit: balanceNatureInput === 'Credit' ? bal : 0,
                        narration: `Opening Balance for Vendor ${vendorName}`
                    }]);
                } catch (_) {
                    // Non-blocking
                }
            }

            // Try updating vendor record with account_code and currentBalance
            try {
                const vendUpdates: any = { account_code: cleanCode };
                if (openingBalanceInput) {
                    const bal = Number(openingBalanceInput);
                    vendUpdates.currentBalance = balanceNatureInput === 'Credit' ? bal : -bal;
                }
                await supabase
                    .from('vendors')
                    .update(vendUpdates)
                    .eq('id', selectedVendor.id);
            } catch (_) {
                try {
                    await supabase
                        .from('vendors')
                        .update({ account_code: cleanCode })
                        .eq('id', selectedVendor.id);
                } catch (_) {}
            }

            toast.success(`Chart of Account for "${vendorName}" assigned successfully!`);
            setShowAccountModal(false);
            await fetchRegisteredVendorsAndCOA();
        } catch (err: any) {
            toast.error('Failed to save account: ' + err.message);
        } finally {
            setSavingAccount(false);
        }
    };

    const handleDeleteVendorRecord = async (id: string | number) => {
        if (!window.confirm('Are you absolutely certain you want to delete this vendor account entry?')) return;

        try {
            const { error } = await supabase.from('vendors').delete().eq('id', id);
            if (error) throw error;

            toast.success('Vendor profile dropped from enterprise directory successfully.');
            fetchRegisteredVendorsAndCOA();
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const filteredVendors = vendors.filter(v =>
        (v.vendor_name || v.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.contact_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.cell_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.phone_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.account_code || '').includes(searchTerm)
    );

    const totalEntries = filteredVendors.length;
    const totalPages = Math.ceil(totalEntries / pageSize);
    const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalEntries);
    const paginatedVendors = filteredVendors.slice(startIndex, startIndex + pageSize);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, pageSize]);

    return (
        <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-black dark:text-bodydark text-xs">

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-black dark:text-white">Wholesale Vendor Master Directory</h2>
                    <p className="text-xs text-gray-400">Browse supply business profiles, manage tax coordinates, and map Chart of Account codes</p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/Purchase/Vendor/Add')}
                    className="flex items-center justify-center rounded bg-primary py-2 px-4 text-sm font-medium text-white hover:bg-opacity-90 transition shadow-sm cursor-pointer"
                >
                    + Add New Vendor
                </button>
            </div>

            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6">

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <span>Show</span>
                        <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="rounded border border-stroke py-1 px-2 bg-transparent dark:border-strokedark outline-none text-black dark:text-white font-bold"
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
                            placeholder="Search vendor name, phone, account code..."
                            className="w-full sm:w-64 rounded border border-stroke py-1.5 px-3 bg-transparent dark:border-strokedark outline-none text-black dark:text-white text-xs font-semibold"
                        />
                    </div>
                </div>

                <div className="max-w-full overflow-x-auto">
                    <table className="w-full table-auto border-collapse">
                        <thead>
                            <tr className="bg-gray-2 text-left dark:bg-meta-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                                <th className="py-4 px-4 font-semibold w-16">S#</th>
                                <th className="py-4 px-4 font-semibold min-w-[180px]">Vendor / Business Name</th>
                                <th className="py-4 px-4 font-semibold min-w-[140px]">Contact Person</th>
                                <th className="py-4 px-4 font-semibold min-w-[120px]">Mobile / Phone</th>
                                <th className="py-4 px-4 font-semibold min-w-[120px]">Email</th>
                                <th className="py-4 px-4 font-semibold min-w-[140px]">Address</th>
                                <th className="py-4 px-4 font-semibold min-w-[160px]">Accounts</th>
                                <th className="py-4 px-4 font-semibold w-24 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="text-center py-12 text-sm"><Spinner /></td></tr>
                            ) : paginatedVendors.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-500 dark:text-gray-400 italic">No business merchant vendors registered yet.</td></tr>
                            ) : (
                                paginatedVendors.map((vendor, idx) => {
                                    const serialNumber = startIndex + idx + 1;
                                    const coa = getVendorCOA(vendor);

                                    return (
                                        <tr key={vendor.id} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/10 duration-150 font-semibold text-black dark:text-white text-xs">
                                             <td className="py-3.5 px-4 text-gray-400">{serialNumber}</td>
                                            <td className="py-3.5 px-4 font-bold text-primary dark:text-white">
                                                <div className="flex items-center gap-1.5">
                                                    <MdBusiness className="text-gray-400 shrink-0" size={16} />
                                                    <span>{vendor.vendor_name || vendor.name}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">
                                                <span className="inline-flex items-center gap-1">
                                                    <MdPerson size={14} className="text-gray-400" />
                                                    {vendor.contact_name || '-'}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-gray-600 dark:text-gray-400">
                                                <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                                                    <MdPhone size={14} className="text-gray-400" />
                                                    {vendor.cell_no || vendor.phone_no || vendor.phone || '-'}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-gray-600 dark:text-gray-400">
                                                <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                                                    {vendor.email ? <><MdEmail size={14} className="text-gray-400" />{vendor.email}</> : '-'}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                                                {vendor.address || '-'}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {coa ? (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-mono font-black text-[11px] text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-700 px-2 py-0.5 rounded shadow-2xs">
                                                            {coa.account_code}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenAccountModal(vendor)}
                                                            className="text-[11px] text-primary hover:underline font-bold cursor-pointer inline-flex items-center gap-0.5"
                                                            title="Edit Account Code"
                                                        >
                                                            <MdEdit size={12} /> Edit
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenAccountModal(vendor)}
                                                        className="inline-flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded text-xs font-bold transition duration-150 shadow-xs cursor-pointer"
                                                    >
                                                        <MdAdd size={14} /> Link Account
                                                    </button>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <TableActions
                                                    onEdit={() => navigate('/Purchase/Vendor/Add', { state: { vendor } })}
                                                    onDelete={() => handleDeleteVendorRecord(vendor.id)}
                                                    editTitle="Edit Supplier"
                                                    deleteTitle="Delete Supplier"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Strip */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-stroke dark:border-strokedark">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        Showing {startIndex + 1} to {endIndex} of {totalEntries} entries
                        {searchTerm && ` (filtered from ${vendors.length} total vendors)`}
                    </div>

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
            </div>

            {/* ── ASSIGN / EDIT VENDOR ACCOUNT CODE MODAL ── */}
            {showAccountModal && selectedVendor && (
                <div className="fixed inset-0 z-99999 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
                    <div className="w-full max-w-lg rounded-lg border border-stroke bg-white p-6 shadow-2xl dark:border-strokedark dark:bg-boxdark">
                        <div className="flex items-center justify-between border-b border-stroke pb-3 mb-4 dark:border-strokedark">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600">
                                    <MdAccountBalanceWallet size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-black dark:text-white text-sm">Assign Chart of Account Code</h4>
                                    <p className="text-xs text-gray-500">Maps vendor directly into Accounts Payable liability ledger</p>
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
                                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Vendor / Business Name:</label>
                                <input
                                    type="text"
                                    value={selectedVendor.vendor_name || selectedVendor.name || ''}
                                    disabled
                                    className="w-full rounded border border-stroke dark:border-strokedark px-3 h-9 bg-gray-100 dark:bg-meta-4/30 font-bold text-black dark:text-white text-xs cursor-not-allowed"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded border border-slate-200 dark:border-slate-700">
                                <div>
                                    <span className="block text-[10px] uppercase font-bold text-gray-400">Category:</span>
                                    <span className="font-bold text-black dark:text-white text-xs">2. LIABILITIES</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] uppercase font-bold text-gray-400">Sub-Category:</span>
                                    <span className="font-bold text-black dark:text-white text-xs">Current Liabilities</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="block text-[10px] uppercase font-bold text-gray-400">Control Group:</span>
                                    <span className="font-bold text-purple-700 dark:text-purple-400 text-xs">Vendor (Trade Creditors)</span>
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
                                    placeholder="e.g. 2010-001"
                                    required
                                    className="w-full rounded border border-stroke dark:border-strokedark px-3 h-10 bg-transparent font-mono font-bold text-sm text-black dark:text-white outline-none focus:border-primary"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Auto-suggested prefix <code className="font-mono text-purple-600">2010-xxx</code>. You can also customize this code.
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
                                        <option value="Credit">Credit (Cr - Normal Payable)</option>
                                        <option value="Debit">Debit (Dr - Advance Paid)</option>
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
                                    className="rounded bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
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

export default VendorList;
