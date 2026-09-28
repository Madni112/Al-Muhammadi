import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../Context/supabaseClient';
import Spinner from '../../../ui/Spinner';
import { MdReceipt, MdArrowBack } from 'react-icons/md';
import { useAuth } from '../../../Context/Auth';

const AddMultiInvoiceReceipt = () => {
    const { tenantId } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();


    const editData = location.state?.receiptRecord;
    const isEditMode = !!editData;

    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(false);
    const [fetchingInvoices, setFetchingInvoices] = useState(false);
    const [customers, setCustomers] = useState<any[]>([]);
    const [banks, setBanks] = useState<any[]>([]);
    const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

    const [isCustDropdownOpen, setIsCustDropdownOpen] = useState(false);
    const [highlightedCustIdx, setHighlightedCustIdx] = useState(0);

    const [formInitValues, setFormInitValues] = useState({
        receiptNo: `CR-${Date.now().toString().slice(-6)}`,
        receiptDate: new Date().toISOString().split('T')[0],
        customerName: '',
        paymentMethod: 'Cash',
        selectedBankId: '',
        totalAmountCollected: 0,
        cashAmount: 0,
        bankAmount: 0,
        notes: '',
        allocations: [] as any[]
    });

    useEffect(() => {
        const fetchCoreMetadata = async () => {
            try {
                setInitialLoading(true);
                const { data: custData } = await supabase.from('customers').select('id, customerName, primaryPhone');
                const { data: bankData } = await supabase.from('banks').select('id, bankName, accountTitle');
                const { data: coaData } = await supabase.from('chart_of_accounts').select('account_code, account_title, control_code, category_code');
                if (custData) setCustomers(custData);
                if (bankData) setBanks(bankData);
                if (coaData) setCoaAccounts(coaData);
            } catch (err: any) {
                toast.error('Failed to load metadata lookup layers: ' + err.message);
            } finally {
                setInitialLoading(false);
            }
        };
        fetchCoreMetadata();

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.customer-search-container')) {
                setIsCustDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCustomerChange = async (chosenCustomer: string, setFieldValue: any) => {
        setFieldValue('customerName', chosenCustomer);
        if (!chosenCustomer) {
            setFieldValue('allocations', []);
            return;
        }

        try {
            setFetchingInvoices(true);
            const trimmedCustomer = chosenCustomer.trim();

            const { data: openInvoices, error } = await supabase
                .from('sales_invoices')
                .select('id, invoice_no, customer_name, total_amount, cash_amount_paid, bank_amount, receipt_status, created_at')
                .ilike('customer_name', `%${trimmedCustomer}%`)
                .not('receipt_status', 'ilike', '%RETURNED%')
                .not('receipt_status', 'ilike', '%PAID%')
                .order('id', { ascending: true });

            if (error) throw error;

            if (!openInvoices || openInvoices.length === 0) {
                toast.error('No outstanding credit or partial balances found for this customer profile!');
                setFieldValue('allocations', []);
                return;
            }

            const activeAllocationsPromise = openInvoices.map(async (inv) => {
                const initialDownpayments = (Number(inv.cash_amount_paid) || 0) + (Number(inv.bank_amount) || 0);
                const actualInvNo = inv.invoice_no || `INV-${inv.id}`;

                const { data: historicalReceipts } = await supabase
                    .from('financial_vouchers')
                    .select('total_amount')
                    .or(`original_invoice_no.eq.${inv.id},original_invoice_no.eq.INV-${inv.id},original_invoice_no.eq.${actualInvNo}`)
                    .or('voucher_type.eq.Cash Receipt Voucher,voucher_type.eq.Bank Receipt Voucher,voucher_type.eq.Cash & Bank Receipt Voucher');

                const { data: returnRecords } = await supabase
                    .from('sales_returns')
                    .select('total_amount')
                    .or(`original_invoice_no.eq.${inv.id},original_invoice_no.eq.INV-${inv.id},original_invoice_no.eq.${actualInvNo}`);

                const historicalCleared = historicalReceipts ? historicalReceipts.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0) : 0;
                const totalReturnedVal = returnRecords ? returnRecords.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0) : 0;

                const totalNetInvoiceValue = Number(inv.total_amount) || 0;
                const outstandingRemainingDebt = Math.max(0, totalNetInvoiceValue - initialDownpayments - historicalCleared - totalReturnedVal);

                return {
                    invoiceId: inv.id,
                    invoiceNo: inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`,
                    totalBill: totalNetInvoiceValue,
                    remainingBalance: outstandingRemainingDebt,
                    amountToAllocate: 0
                };
            });

            const functionalAllocationsArray = await Promise.all(activeAllocationsPromise);
            const validAllocations = functionalAllocationsArray
                .filter(a => a.remainingBalance > 0.01)
                .sort((a, b) => Number(a.invoiceId) - Number(b.invoiceId));

            if (validAllocations.length === 0) {
                toast.error('All credit invoices for this profile have already been fully cleared.');
            }
            setFieldValue('allocations', validAllocations);
        } catch (err: any) {
            toast.error('Failed to analyze aging debt: ' + err.message);
        } finally {
            setFetchingInvoices(false);
        }
    };
    const handleAutoKnockoffDistribution = (totalCollectedStr: string, allocations: any[], setFieldValue: any) => {
        const totalCollected = Math.max(0, Number(totalCollectedStr) || 0);
        setFieldValue('totalAmountCollected', totalCollected);

        if (allocations.length === 0) return;

        let availablePoolFunds = totalCollected;
        const recalculatedAllocations = allocations.map((bill) => {
            const debtValue = Number(bill.remainingBalance) || 0;
            if (availablePoolFunds >= debtValue) {
                availablePoolFunds -= debtValue;
                return { ...bill, amountToAllocate: Number(debtValue.toFixed(2)) };
            } else if (availablePoolFunds > 0) {
                const partialDeduction = availablePoolFunds;
                availablePoolFunds = 0;
                return { ...bill, amountToAllocate: Number(partialDeduction.toFixed(2)) };
            } else {
                return { ...bill, amountToAllocate: 0 };
            }
        });

        setFieldValue('allocations', recalculatedAllocations);
    };

    const validationSchema = Yup.object().shape({
        customerName: Yup.string().required('Please choose a target wholesale customer profile!'),
        receiptDate: Yup.string().required('Voucher entry execution date field is mandatory!'),
        paymentMethod: Yup.string().oneOf(['Cash', 'Bank Transfer', 'Split']).required('Required Field'),
        selectedBankId: Yup.string().when('paymentMethod', {
            is: (val: string) => val === 'Bank Transfer' || val === 'Split',
            then: (schema) => schema.required('Please select corporate bank ledger profile'),
            otherwise: (schema) => schema.notRequired()
        }),
        totalAmountCollected: Yup.number()
            .typeError('Collected payment value must be numeric')
            .min(1, 'Lump-sum collected payments must be greater than 0 PKR!')
            .required('Required'),
        allocations: Yup.array().of(
            Yup.object().shape({
                amountToAllocate: Yup.number()
                    .typeError('Allocation must be a number')
                    .min(0, 'Cannot allocate a negative value')
            })
        ).min(1, 'No outstanding bills are active to absorb this ledger collection.')
    });

    const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
        ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

    if (initialLoading) {
        return <div className="flex h-48 items-center justify-center"><Spinner /></div>;
    }
    return (
        <div className="mx-auto max-w-full text-black dark:text-bodydark">
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="flex items-center justify-between border-b border-stroke py-4 px-6.5 dark:border-strokedark">
                    <h3 className="font-medium text-black dark:text-white flex items-center gap-2 text-base">
                        <MdReceipt className="text-primary text-xl" /> Create Multi-Invoice Settlement Voucher
                    </h3>
                    <button type="button" onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/List`)} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline cursor-pointer">
                        <MdArrowBack /> Back to Logs
                    </button>
                </div>


                <Formik
                    initialValues={formInitValues}
                    validationSchema={validationSchema}
                    enableReinitialize={true}
                    onSubmit={async (values) => {
                        const sumOfAllocatedRows = values.allocations.reduce((acc: number, curr: any) => acc + (Number(curr.amountToAllocate) || 0), 0);

                        if (Math.abs(sumOfAllocatedRows - Number(values.totalAmountCollected)) > 1) {
                            toast.error(`Accounting Error: Sum of distribution rows (Rs. ${sumOfAllocatedRows.toLocaleString()}) must match Lump-Sum Collection (Rs. ${Number(values.totalAmountCollected).toLocaleString()}) exactly!`);
                            return;
                        }

                        if (values.paymentMethod === 'Split') {
                            const splitSum = (Number(values.cashAmount) || 0) + (Number(values.bankAmount) || 0);
                            if (Math.abs(splitSum - Number(values.totalAmountCollected)) > 1) {
                                toast.error(`Split Error: Cash (Rs. ${Number(values.cashAmount || 0).toLocaleString()}) + Bank (Rs. ${Number(values.bankAmount || 0).toLocaleString()}) must equal Total Collected (Rs. ${Number(values.totalAmountCollected).toLocaleString()})`);
                                return;
                            }
                        }

                        try {
                            setLoading(true);
                            // Dynamically resolve COA account codes from live Supabase records
                            const cashCoa = coaAccounts.find((c: any) =>
                                String(c.control_code || '').toLowerCase().includes('cash') ||
                                String(c.account_title || '').toLowerCase().includes('cash')
                            );

                            const selectedBankObj = banks.find((b: any) => String(b.id) === String(values.selectedBankId));
                            const bankCoa = coaAccounts.find((c: any) =>
                                (selectedBankObj && (
                                    String(c.account_title || '').toLowerCase().includes(String(selectedBankObj.bankName || '').toLowerCase()) ||
                                    String(c.account_title || '').toLowerCase().includes(String(selectedBankObj.accountTitle || '').toLowerCase())
                                )) ||
                                String(c.control_code || '').toLowerCase().includes('bank')
                            );

                            const recCoa = coaAccounts.find((c: any) =>
                                String(c.control_code || '').toLowerCase().includes('debtor') ||
                                String(c.control_code || '').toLowerCase().includes('receivable') ||
                                String(c.account_title || '').toLowerCase().includes('receivable')
                            );

                            const cashAccountCode = cashCoa ? String(cashCoa.account_code) : '1010';
                            const bankAccountCode = bankCoa ? String(bankCoa.account_code) : '6789';
                            const customerAccountCode = recCoa ? String(recCoa.account_code) : (cashCoa ? String(cashCoa.account_code) : '1010');

                            const activeRowsToClear = values.allocations.filter((a: any) => Number(a.amountToAllocate) > 0);
                            const totalCollected = Number(values.totalAmountCollected) || 1;
                            const cashRatio = values.paymentMethod === 'Split' ? (Number(values.cashAmount || 0) / totalCollected) : (values.paymentMethod === 'Cash' ? 1 : 0);
                            const bankRatio = values.paymentMethod === 'Split' ? (Number(values.bankAmount || 0) / totalCollected) : (values.paymentMethod === 'Bank Transfer' ? 1 : 0);

                            for (const row of activeRowsToClear) {
                                const rowAmount = Number(row.amountToAllocate);
                                const rowCash = Number((rowAmount * cashRatio).toFixed(2));
                                const rowBank = Number((rowAmount - rowCash).toFixed(2));

                                const balancedJournalItems = [];
                                if (rowCash > 0) {
                                    balancedJournalItems.push({ accountCode: cashAccountCode, description: `Cash allocation Vch-${values.receiptNo} against INV-${row.invoiceId}`, debit: rowCash, credit: 0 });
                                }
                                if (rowBank > 0) {
                                    balancedJournalItems.push({ accountCode: bankAccountCode, description: `Bank allocation Vch-${values.receiptNo} against INV-${row.invoiceId}`, debit: rowBank, credit: 0 });
                                }
                                balancedJournalItems.push({ accountCode: customerAccountCode, description: `Debt clearance Vch-${values.receiptNo} against INV-${row.invoiceId}`, debit: 0, credit: rowAmount });

                                const voucherType = values.paymentMethod === 'Split' 
                                    ? 'Cash & Bank Receipt Voucher' 
                                    : (values.paymentMethod === 'Cash' ? 'Cash Receipt Voucher' : 'Bank Receipt Voucher');

                                const compositeNarration = `Customer: ${values.customerName} | Bulk Voucher: ${values.receiptNo} | Settling target segment of INV-${row.invoiceId} (${values.paymentMethod}) | Note: ${values.notes.trim()}`.trim();

                                const financialVoucherPayload = {
                                    voucher_no: `${values.receiptNo}/INV-${row.invoiceId}`,
                                    voucher_type: voucherType,
                                    voucher_date: values.receiptDate,
                                    original_invoice_no: String(row.invoiceId),
                                    customerName: values.customerName,
                                    customer_name: values.customerName,
                                    narration: compositeNarration,
                                    notes: compositeNarration,
                                    total_amount: rowAmount,
                                    bank_name: selectedBankObj?.bankName || null,
                                    payment_mode: values.paymentMethod,
                                    items: balancedJournalItems,
                                    metadata: {
                                        bulk_parent_reference: values.receiptNo,
                                        selectedBankId: values.selectedBankId,
                                        bankAccountTitle: selectedBankObj?.accountTitle || null,
                                        paymentMethod: values.paymentMethod,
                                        cashAmount: rowCash,
                                        bankAmount: rowBank
                                    }
                                };

                                const { error: insertError } = await supabase.from('financial_vouchers').insert([financialVoucherPayload]);
                                if (insertError) throw insertError;

                                // ✅ SAFE FRONTEND FALLBACK CALCULATION:
                                // Determines the invoice state directly inside React right after recording the voucher
                                const freshlyLeftOutstandingDebt = row.remainingBalance - rowAmount;
                                let targetStatusBadgeText = 'Partial';

                                if (freshlyLeftOutstandingDebt <= 0.05) {
                                    targetStatusBadgeText = 'Paid';
                                } else if (freshlyLeftOutstandingDebt === row.remainingBalance) {
                                    targetStatusBadgeText = 'Unpaid';
                                }

                                // Safely update the parent sales_invoices record using direct column mutations
                                await supabase
                                    .from('sales_invoices')
                                    .update({ receipt_status: targetStatusBadgeText })
                                    .eq('id', row.invoiceId);
                            }

                            toast.success(`Bulk receipts processed successfully! ${activeRowsToClear.length} invoices updated.`);
                            navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/List`);

                        } catch (err: any) {
                            toast.error('Bulk submission failure event: ' + err.message);
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {({ values, handleChange, setFieldValue, errors, touched }) => (
                        <Form className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 text-xs">
                                <div>
                                    <label className="block font-medium mb-1.5 uppercase text-gray-500 font-bold">Receipt Voucher #:</label>
                                    <p className="text-primary font-black text-sm font-mono p-2 bg-gray-50 dark:bg-meta-4/10 rounded">{values.receiptNo}</p>
                                </div>
                                <div>
                                    <label className="block font-medium mb-1.5 uppercase text-gray-500 font-bold">Clearing Date: *</label>
                                    <input type="date" name="receiptDate" onChange={handleChange} value={values.receiptDate} className="w-full rounded border border-stroke p-2 bg-transparent dark:border-strokedark outline-none focus:border-primary text-xs font-semibold text-black dark:text-white" />
                                </div>
                                <div className="relative customer-search-container">
                                    <label className="block font-medium mb-1.5 uppercase text-gray-500 font-bold">Target Customer Profile: *</label>
                                    {(() => {
                                        const query = (values.customerName || '').toLowerCase().trim();
                                        const filteredCustomers = customers.filter((c: any) => {
                                            if (!query) return true;
                                            const name = (c.customerName || '').toLowerCase();
                                            const phone = (c.primaryPhone || '').toLowerCase();
                                            return name.includes(query) || phone.includes(query);
                                        });

                                        return (
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    autoComplete="off"
                                                    value={values.customerName}
                                                    onFocus={() => {
                                                        setIsCustDropdownOpen(true);
                                                        setHighlightedCustIdx(0);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'ArrowDown') {
                                                            e.preventDefault();
                                                            setHighlightedCustIdx(prev => prev < filteredCustomers.length - 1 ? prev + 1 : 0);
                                                        } else if (e.key === 'ArrowUp') {
                                                            e.preventDefault();
                                                            setHighlightedCustIdx(prev => prev > 0 ? prev - 1 : filteredCustomers.length - 1);
                                                        } else if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            if (filteredCustomers.length > 0) {
                                                                const chosen = filteredCustomers[highlightedCustIdx] || filteredCustomers[0];
                                                                handleCustomerChange(chosen.customerName, setFieldValue);
                                                                setIsCustDropdownOpen(false);
                                                            }
                                                        } else if (e.key === 'Tab' || e.key === 'Escape') {
                                                            setIsCustDropdownOpen(false);
                                                        }
                                                    }}
                                                    onChange={(e) => {
                                                        const typed = e.target.value;
                                                        setFieldValue('customerName', typed);
                                                        setIsCustDropdownOpen(true);
                                                        setHighlightedCustIdx(0);

                                                        // Exact match sync
                                                        const matched = customers.find(c => c.customerName && c.customerName.toLowerCase() === typed.trim().toLowerCase());
                                                        if (matched) {
                                                            handleCustomerChange(matched.customerName, setFieldValue);
                                                        }
                                                    }}
                                                    placeholder="Search debtor customer name..."
                                                    className={`w-full rounded border p-2 bg-transparent outline-none text-xs font-black text-black dark:text-white ${errors.customerName && touched.customerName ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus:border-primary'}`}
                                                />

                                                {/* RICH SEARCHABLE CUSTOMER DROPDOWN */}
                                                {isCustDropdownOpen && (
                                                    <div className="absolute left-0 top-full mt-1.5 z-[99999] w-full min-w-[280px] max-h-[260px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                                                        {filteredCustomers.map((c: any, cIdx: number) => {
                                                            const isHighlighted = cIdx === highlightedCustIdx;
                                                            return (
                                                                <div
                                                                    key={c.id}
                                                                    onMouseEnter={() => setHighlightedCustIdx(cIdx)}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        handleCustomerChange(c.customerName, setFieldValue);
                                                                        setIsCustDropdownOpen(false);
                                                                    }}
                                                                    className={`p-2.5 cursor-pointer transition flex items-center justify-between group ${
                                                                        isHighlighted
                                                                            ? 'bg-red-50 dark:bg-red-950/40 border-l-4 border-red-500'
                                                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                                                                    }`}
                                                                >
                                                                    <div className="flex flex-col gap-0.5 text-left">
                                                                        <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400">
                                                                            {c.customerName}
                                                                        </span>
                                                                        {c.primaryPhone && (
                                                                            <span className="text-[10px] text-slate-400 font-mono">
                                                                                📞 {c.primaryPhone}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        {filteredCustomers.length === 0 && (
                                                            <div className="p-3 text-center text-xs text-slate-400 italic">
                                                                No matching customers found
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    {errors.customerName && touched.customerName && <p className="text-red-500 text-[10px] font-bold mt-1">{String(errors.customerName)}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-xs border border-stroke dark:border-strokedark p-4 rounded-sm bg-slate-50/10">
                                <div>
                                    <label className="block font-medium mb-1.5 uppercase text-gray-500 font-bold">Payment Instrument Mode: *</label>
                                    <select 
                                        name="paymentMethod" 
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setFieldValue('paymentMethod', val);
                                            if (val === 'Cash') {
                                                setFieldValue('selectedBankId', '');
                                                setFieldValue('cashAmount', values.totalAmountCollected);
                                                setFieldValue('bankAmount', 0);
                                            } else if (val === 'Bank Transfer') {
                                                setFieldValue('cashAmount', 0);
                                                setFieldValue('bankAmount', values.totalAmountCollected);
                                            } else if (val === 'Split') {
                                                setFieldValue('cashAmount', values.totalAmountCollected);
                                                setFieldValue('bankAmount', 0);
                                            }
                                        }} 
                                        value={values.paymentMethod} 
                                        className="w-full rounded border border-stroke p-2 bg-transparent dark:border-strokedark outline-none focus:border-primary text-xs font-bold text-black dark:text-white"
                                    >
                                        <option value="Cash" className="dark:bg-boxdark">Cash Only</option>
                                        <option value="Bank Transfer" className="dark:bg-boxdark">Bank Transfer Only</option>
                                        <option value="Split" className="dark:bg-boxdark">Cash & Bank Combined</option>
                                    </select>
                                </div>
                                <div className={values.paymentMethod === 'Cash' ? 'opacity-50' : ''}>
                                    <label className="block font-medium mb-1.5 uppercase text-gray-500 font-bold">
                                        Asset Target Bank Ledger Account: {values.paymentMethod === 'Cash' && <span className="text-gray-400 font-normal">(Disabled for Cash)</span>}
                                    </label>
                                    <select
                                        name="selectedBankId"
                                        onChange={handleChange}
                                        value={values.selectedBankId}
                                        disabled={values.paymentMethod === 'Cash'}
                                        className={`w-full rounded border p-2 bg-transparent dark:border-strokedark outline-none focus:border-primary text-xs text-black dark:text-white font-semibold disabled:bg-gray-100 dark:disabled:bg-meta-4/20 disabled:cursor-not-allowed ${errors.selectedBankId && touched.selectedBankId ? 'border-red-500' : 'border-stroke'}`}
                                    >
                                        <option value="" className="dark:bg-boxdark">-- Choose Bank Account --</option>
                                        {banks.map(b => <option key={b.id} value={b.id} className="dark:bg-boxdark">{b.bankName} - {b.accountTitle}</option>)}
                                    </select>
                                    {errors.selectedBankId && touched.selectedBankId && <p className="text-red-500 text-[10px] mt-0.5">{String(errors.selectedBankId)}</p>}
                                </div>

                                {values.paymentMethod !== 'Split' ? (
                                    <div>
                                        <label className="block font-medium mb-1.5 uppercase text-gray-500 font-bold">
                                            {values.paymentMethod === 'Cash' ? 'Cash Collected (PKR): *' : 'Bank Received (PKR): *'}
                                        </label>
                                        <input
                                            type="number"
                                            name="totalAmountCollected"
                                            onKeyDown={blockInvalidChar}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                handleAutoKnockoffDistribution(val, values.allocations, setFieldValue);
                                                if (values.paymentMethod === 'Cash') {
                                                    setFieldValue('cashAmount', Number(val) || 0);
                                                    setFieldValue('bankAmount', 0);
                                                } else {
                                                    setFieldValue('cashAmount', 0);
                                                    setFieldValue('bankAmount', Number(val) || 0);
                                                }
                                            }}
                                            value={values.totalAmountCollected || ''}
                                            placeholder="Enter total received value"
                                            className={`w-full rounded border p-2 bg-transparent outline-none text-xs font-black text-right ${errors.totalAmountCollected && touched.totalAmountCollected ? 'border-red-500 text-red-500' : 'border-stroke dark:border-strokedark text-success focus:border-primary'}`}
                                            disabled={!values.customerName || fetchingInvoices}
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block font-medium mb-1.5 uppercase text-gray-500 font-bold">Cash Portion: *</label>
                                            <input
                                                type="number"
                                                name="cashAmount"
                                                onKeyDown={blockInvalidChar}
                                                value={values.cashAmount || ''}
                                                onChange={(e) => {
                                                    const cash = Math.max(0, Number(e.target.value) || 0);
                                                    setFieldValue('cashAmount', cash);
                                                    const bank = Number(values.bankAmount || 0);
                                                    const total = cash + bank;
                                                    handleAutoKnockoffDistribution(String(total), values.allocations, setFieldValue);
                                                }}
                                                placeholder="0"
                                                className="w-full rounded border border-stroke dark:border-strokedark p-2 bg-transparent outline-none text-xs font-black text-right text-black dark:text-white focus:border-primary"
                                                disabled={!values.customerName || fetchingInvoices}
                                            />
                                        </div>
                                        <div>
                                            <label className="block font-medium mb-1.5 uppercase text-gray-500 font-bold">Bank Portion: *</label>
                                            <input
                                                type="number"
                                                name="bankAmount"
                                                onKeyDown={blockInvalidChar}
                                                value={values.bankAmount || ''}
                                                onChange={(e) => {
                                                    const bank = Math.max(0, Number(e.target.value) || 0);
                                                    setFieldValue('bankAmount', bank);
                                                    const cash = Number(values.cashAmount || 0);
                                                    const total = cash + bank;
                                                    handleAutoKnockoffDistribution(String(total), values.allocations, setFieldValue);
                                                }}
                                                placeholder="0"
                                                className="w-full rounded border border-stroke dark:border-strokedark p-2 bg-transparent outline-none text-xs font-black text-right text-red-600 dark:text-red-400 focus:border-primary"
                                                disabled={!values.customerName || fetchingInvoices}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="w-full overflow-x-auto border border-stroke dark:border-strokedark rounded-sm mb-6">
                                <table className="w-full border-collapse text-[12px] text-center min-w-[800px] table-fixed">
                                    <thead>
                                        <tr className="bg-gray-100 dark:bg-meta-4 font-bold uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                                            <th className="p-2 w-16">S.#</th>
                                            <th className="p-2">Invoice Ref ID</th>
                                            <th className="p-2 text-right pr-4">Total Original Invoice Grand Bill</th>
                                            <th className="p-2 text-right pr-4 text-danger">Current Remaining Credit Debt Balance</th>
                                            <th className="p-2 w-48 bg-success/10 text-success">PKR Amount to Allocate</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fetchingInvoices ? (
                                            <tr><td colSpan={5} className="p-6"><div className="flex justify-center"><Spinner /></div></td></tr>
                                        ) : values.allocations.length === 0 ? (
                                            <tr><td colSpan={5} className="p-4 text-gray-400 italic text-center font-medium bg-white dark:bg-boxdark">No outstanding credit invoices loaded for this customer.</td></tr>
                                        ) : (
                                            <>
                                                {values.allocations.map((bill: any, index: number) => (
                                                    <tr key={bill.invoiceId} className="border-b border-stroke dark:border-strokedark bg-white dark:bg-boxdark hover:bg-slate-50 dark:hover:bg-meta-4/5">
                                                        <td className="p-2.5 font-bold text-gray-500 bg-gray-50 dark:bg-meta-4/10">{index + 1}</td>
                                                        <td className="p-2.5 font-mono font-bold text-primary">{bill.invoiceNo || `INV-${String(bill.invoiceId).padStart(4, '0')}`}</td>
                                                        <td className="p-2.5 text-right pr-4 font-semibold text-gray-500">Rs. {Number(bill.totalBill).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                        <td className="p-2.5 text-right pr-4 font-black text-danger">Rs. {Number(bill.remainingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                        <td className="p-1 bg-success/5 border-l border-success/20">
                                                            <input
                                                                type="number"
                                                                name={`allocations.${index}.amountToAllocate`}
                                                                onKeyDown={blockInvalidChar}
                                                                onChange={(e) => {
                                                                    const typedVal = Math.max(0, Number(e.target.value) || 0);
                                                                    if (typedVal > bill.remainingBalance) {
                                                                        toast.error(`Cannot allocate more than remaining invoice debt (Rs. ${bill.remainingBalance.toLocaleString()})`);
                                                                        setFieldValue(`allocations.${index}.amountToAllocate`, Number(bill.remainingBalance.toFixed(2)));
                                                                    } else {
                                                                        handleChange(e);
                                                                    }
                                                                }}
                                                                value={bill.amountToAllocate || ''}
                                                                placeholder="0.00"
                                                                className="w-full p-1.5 text-right font-black border border-success/30 bg-white dark:bg-boxdark text-success rounded outline-none"
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                                {/* ✅ HIGH-VISIBILITY CUMULATIVE SUMMARY ROWS CONTAINER */}
                                                <tr className="bg-gray-100/70 dark:bg-meta-4/40 font-bold border-t-2 border-stroke dark:border-strokedark text-black dark:text-white">
                                                    <td colSpan={2} className="p-3 text-left pl-6 uppercase tracking-wider font-extrabold text-gray-600 dark:text-gray-300">
                                                        Total Summary:
                                                    </td>
                                                    <td className="p-3 text-right pr-4 font-black text-gray-700 dark:text-gray-200">
                                                        Rs. {values.allocations.reduce((acc, curr) => acc + (Number(curr.totalBill) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-3 text-right pr-4 font-black text-danger">
                                                        Rs. {values.allocations.reduce((acc, curr) => acc + (Number(curr.remainingBalance) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-3 text-right pr-4 font-black text-success bg-success/10 border-l border-success/30">
                                                        Rs. {values.allocations.reduce((acc, curr) => acc + (Number(curr.amountToAllocate) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                                <div className="w-full md:w-1/2">
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Narration / Voucher Notes:</label>
                                    <textarea name="notes" rows={2} onChange={handleChange} value={values.notes} placeholder="Enter check numbers, clearing reference details..." className="w-full p-2 text-xs border border-stroke dark:border-strokedark rounded-sm bg-transparent outline-none focus:border-primary text-black dark:text-white" />
                                </div>
                                <div className="w-full md:w-1/3 text-xs border border-stroke dark:border-strokedark rounded-sm p-4 bg-gray-50 dark:bg-meta-4/10 space-y-2 text-black dark:text-white">
                                    <div className="flex justify-between border-b pb-1 dark:border-strokedark">
                                        <span className="text-gray-500">Total Selected Invoices:</span>
                                        <b className="font-bold text-black dark:text-white">{values.allocations.length} Bills</b>
                                    </div>
                                    <div className="flex justify-between border-b pb-1 dark:border-strokedark">
                                        <span className="text-gray-500">Distributed Funds:</span>
                                        <b className="text-success font-black text-sm">Rs. {values.allocations.reduce((acc: number, curr: any) => acc + (Number(curr.amountToAllocate) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
                                    </div>
                                    <div className="flex justify-between pt-1">
                                        <span className="text-gray-400">Unallocated Float:</span>
                                        <b className="text-gray-400">Rs. {Math.max(0, (Number(values.totalAmountCollected) || 0) - values.allocations.reduce((acc: number, curr: any) => acc + (Number(curr.amountToAllocate) || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-stroke dark:border-strokedark">
                                <button
                                    type="button"
                                    onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/List`)}
                                    className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || values.allocations.length === 0}
                                    className="rounded-xl bg-red-600 hover:bg-red-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                                >
                                    {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>Save Bulk Receipt</span>}
                                </button>
                            </div>
                        </Form>
                    )}
                </Formik>
            </div>
        </div>
    );
};

export default AddMultiInvoiceReceipt;

