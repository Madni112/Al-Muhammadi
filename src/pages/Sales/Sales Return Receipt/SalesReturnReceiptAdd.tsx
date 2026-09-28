import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { 
  MdPerson, 
  MdReceipt, 
  MdEvent, 
  MdAccountBalance, 
  MdArrowBack, 
  MdInfoOutline,
  MdOutlinePayment,
  MdSearch, 
  MdClear,
  MdKeyboardArrowDown
} from 'react-icons/md';
import { FiPrinter } from 'react-icons/fi';

const SalesReturnReceiptAdd: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId } = useAuth();

  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);

  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [returnOptions, setReturnOptions] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

  // Customer Autocomplete State
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedCustomerObj, setSelectedCustomerObj] = useState<any>(null);

  // Return Note Autocomplete State
  const [returnSearchQuery, setReturnSearchQuery] = useState('');
  const [isReturnDropdownOpen, setIsReturnDropdownOpen] = useState(false);
  const [highlightedReturnIndex, setHighlightedReturnIndex] = useState(0);
  const [selectedReturnNo, setSelectedReturnNo] = useState<string>('');
  const [selectedReturnObj, setSelectedReturnObj] = useState<any>(null);

  const [generatedReceiptNo, setGeneratedReceiptNo] = useState('');

  // Balances
  const [customerTotalOutstandingReceivable, setCustomerTotalOutstandingReceivable] = useState<number>(0);
  const [returnGrossBill, setReturnGrossBill] = useState<number>(0);
  const [returnCreditAdjusted, setReturnCreditAdjusted] = useState<number>(0);
  const [returnPaidUpfront, setReturnPaidUpfront] = useState<number>(0);
  const [returnPastReceiptsPaid, setReturnPastReceiptsPaid] = useState<number>(0);
  const [effectiveDueForThisReceipt, setEffectiveDueForThisReceipt] = useState<number>(0);
  const [returnAllocationsMap, setReturnAllocationsMap] = useState<Record<string, { gross: number; upfront: number; creditAdjusted: number; pastReceipts: number; due: number }>>({});

  const [shouldPrintAfterSave, setShouldPrintAfterSave] = useState(false);

  const customerContainerRef = useRef<HTMLDivElement>(null);
  const returnContainerRef = useRef<HTMLDivElement>(null);

  const editData = location.state?.receiptRecord || location.state?.item || location.state?.record;
  const isEditMode = !!editData;

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

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerContainerRef.current && !customerContainerRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
      if (returnContainerRef.current && !returnContainerRef.current.contains(e.target as Node)) {
        setIsReturnDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setMetadataLoading(true);

        // 1. Fetch Customers, Invoices, and Returns in parallel
        const [cRes, invRes, rRes, bankRes, coaRes] = await Promise.all([
          supabase.from('customers').select('*'),
          supabase.from('sales_invoices').select('id, customer_name'),
          supabase.from('sales_returns').select('*').order('id', { ascending: false }),
          supabase.from('banks').select('id, bankName, accountTitle, accountNumber'),
          supabase.from('chart_of_accounts').select('account_code, account_title, control_code, category_code')
        ]);

        const cData = cRes.data || [];
        const invData = invRes.data || [];
        const rData = rRes.data || [];
        const bankData = bankRes.data || [];
        const coaData = coaRes.data || [];

        const customerMap = new Map<string, any>();

        (cData || []).forEach((c: any) => {
          const name = (c.customername || c.customerName || c.customer_name || c.name || '').trim();
          if (name) {
            customerMap.set(name.toLowerCase(), {
              id: c.id,
              customer_name: name,
              customer_code: c.customer_code || c.customerCode || '',
              contact_name: c.company || c.contact_name || '',
              phone: c.phone || c.primaryPhone || c.cell_no || '',
              city: c.city || '',
              address: c.address || ''
            });
          }
        });

        (invData || []).forEach((inv: any) => {
          const name = (inv.customer_name || '').trim();
          if (name && !customerMap.has(name.toLowerCase())) {
            customerMap.set(name.toLowerCase(), {
              id: `inv-${inv.id}`,
              customer_name: name,
              contact_name: '',
              phone: '',
              city: '',
              address: ''
            });
          }
        });

        (rData || []).forEach((r: any) => {
          const name = (r.customer_name || '').trim();
          if (name && !customerMap.has(name.toLowerCase())) {
            customerMap.set(name.toLowerCase(), {
              id: `rtn-${r.id}`,
              customer_name: name,
              contact_name: '',
              phone: '',
              city: '',
              address: ''
            });
          }
        });

        const normalizedCustomers = Array.from(customerMap.values()).sort((a, b) => a.customer_name.localeCompare(b.customer_name));
        setCustomerOptions(normalizedCustomers);

        if (bankData) setBankAccounts(bankData);
        if (coaData) setCoaAccounts(coaData);
        if (rData) setReturnOptions(rData);

        // If in Edit Mode, restore state
        if (isEditMode && editData) {
          const cName = editData.customer_name || '';
          setSelectedCustomer(cName);
          setCustomerSearchQuery(cName);
          const matchedCust = normalizedCustomers.find(c => c.customer_name.toLowerCase() === cName.toLowerCase());
          if (matchedCust) setSelectedCustomerObj(matchedCust);

          const rRef = editData.return_no || editData.invoice_no || editData.original_invoice_no || '';
          if (rRef) {
            setSelectedReturnNo(rRef);
            setReturnSearchQuery(rRef);
            const matchedReturn = rData?.find(r => r.return_no === rRef || r.invoice_no === rRef || String(r.id) === String(editData.sales_return_id));
            if (matchedReturn) setSelectedReturnObj(matchedReturn);
          } else {
            setSelectedReturnNo('');
            setReturnSearchQuery('-- General Customer Balance Payout (All Return Notes) --');
            setSelectedReturnObj(null);
          }

          calculateCustomerBalances(cName, rRef, rData || [], editData.id);
        } else {
          setGeneratedReceiptNo(`SRR-${Math.floor(100000 + Math.random() * 900000)}`);
        }
      } catch (err: any) {
        console.error(err.message);
        toast.error('Failed to load sales return metadata: ' + err.message);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchMetadata();
  }, [isEditMode, editData]);

  // ── Calculate Live Balances for Customer & Selected Sales Return ─────────────
  const calculateCustomerBalances = async (
    customerName: string, 
    returnNumber: string, 
    allReturns: any[], 
    currentEditReceiptId: number | null = null
  ) => {
    if (!customerName) {
      setCustomerTotalOutstandingReceivable(0);
      setReturnGrossBill(0);
      setReturnCreditAdjusted(0);
      setReturnPaidUpfront(0);
      setReturnPastReceiptsPaid(0);
      setEffectiveDueForThisReceipt(0);
      setReturnAllocationsMap({});
      return;
    }

    try {
      // 1. Fetch customer's sales invoices to determine available open receivable capacity (what customer owes us)
      const { data: customerInvoices } = await supabase
        .from('sales_invoices')
        .select('total_amount, cash_amount_paid, bank_amount')
        .ilike('customer_name', customerName);

      const { data: customerReceiptVouchers } = await supabase
        .from('financial_vouchers')
        .select('total_amount')
        .ilike('customer_name', customerName)
        .or('voucher_type.eq.Cash Receipt Voucher,voucher_type.eq.Bank Receipt Voucher,voucher_type.eq.Cash & Bank Receipt Voucher');

      let totalInvoicesGross = 0;
      let totalInvoicesUpfrontPaid = 0;
      (customerInvoices || []).forEach((inv: any) => {
        totalInvoicesGross += Number(inv.total_amount) || 0;
        totalInvoicesUpfrontPaid += (Number(inv.cash_amount_paid || 0) + Number(inv.bank_amount || 0));
      });

      let totalReceiptsCollected = 0;
      (customerReceiptVouchers || []).forEach((v: any) => {
        totalReceiptsCollected += Number(v.total_amount) || 0;
      });

      // Total open receivable capacity across all invoices before returns (what customer owes us)
      const openReceivableDebt = Math.max(0, totalInvoicesGross - totalInvoicesUpfrontPaid - totalReceiptsCollected);

      // 2. Fetch customer's sales returns sorted chronologically
      const custReturns = allReturns.filter(r => 
        (r.customer_name || '').toLowerCase() === customerName.toLowerCase()
      );

      const sortedCustReturns = [...custReturns].sort((a, b) => {
        const timeA = new Date(a.return_date || a.created_at || 0).getTime();
        const timeB = new Date(b.return_date || b.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;

        const createdA = new Date(a.created_at || 0).getTime();
        const createdB = new Date(b.created_at || 0).getTime();
        if (createdA !== createdB) return createdA - createdB;

        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

      // 3. Fetch past refund payout receipts for this customer
      const { data: pastPayoutReceipts } = await supabase
        .from('sales_return_receipts')
        .select('id, amount_paid, sales_return_id, invoice_no, return_no, metadata')
        .ilike('customer_name', customerName);

      let totalReturnsGross = 0;
      let totalReturnsUpfrontDisbursed = 0;
      let totalReturnsCreditAdjusted = 0;

      const allocations: Record<string, { gross: number; upfront: number; creditAdjusted: number; specificReceipts: number; generalAllocated: number; pastReceipts: number; due: number }> = {};
      let totalPayoutsDisbursed = 0;
      let unallocatedGeneralPayouts = 0;

      // Track remaining open receivable capacity available to absorb customer returns
      let remainingReceivablePool = openReceivableDebt;

      // Initialize all returns chronologically
      sortedCustReturns.forEach(r => {
        const key = r.return_no || r.invoice_no || `SRTN-${r.id}`;
        const gross = Number(r.total_amount || r.total_net_amount) || 0;
        const upfront = Number(r.payout_amount_paid || r.amount_paid) || 0;
        const returnNetAfterUpfront = Math.max(0, gross - upfront);

        const isCreditReturn = r.settlement_mode === 'On Credit' || 
                               r.payment_term === 'On Credit' || 
                               r.metadata?.settlementMode === 'On Credit' ||
                               !r.payout_amount_paid;

        let creditAdjusted = 0;
        if (isCreditReturn) {
          // Can only absorb up to the open invoice debt owed by the customer!
          creditAdjusted = Math.min(returnNetAfterUpfront, remainingReceivablePool);
          remainingReceivablePool -= creditAdjusted;
        }

        totalReturnsGross += gross;
        totalReturnsUpfrontDisbursed += upfront;
        totalReturnsCreditAdjusted += creditAdjusted;

        allocations[key] = {
          gross,
          upfront,
          creditAdjusted,
          specificReceipts: 0,
          generalAllocated: 0,
          pastReceipts: 0,
          due: Math.max(0, gross - upfront - creditAdjusted)
        };
      });

      // Assign Return-specific payout receipts and accumulate general payouts
      (pastPayoutReceipts || []).forEach((rec: any) => {
        if (currentEditReceiptId && rec.id === currentEditReceiptId) return;
        const rAmt = Number(rec.amount_paid) || 0;
        totalPayoutsDisbursed += rAmt;

        const rRef = rec.return_no || rec.invoice_no || (rec.sales_return_id ? `SRTN-${rec.sales_return_id}` : '');
        if (rRef && allocations[rRef]) {
          allocations[rRef].specificReceipts += rAmt;
        } else {
          unallocatedGeneralPayouts += rAmt;
        }
      });

      // Allocate general unallocated payouts across open return notes (FIFO order)
      let generalRemaining = unallocatedGeneralPayouts;
      sortedCustReturns.forEach(r => {
        const key = r.return_no || r.invoice_no || `SRTN-${r.id}`;
        const alloc = allocations[key];
        if (alloc) {
          const dueBeforeGeneral = Math.max(0, alloc.gross - alloc.upfront - alloc.creditAdjusted - alloc.specificReceipts);
          if (dueBeforeGeneral > 0 && generalRemaining > 0) {
            const toDistribute = Math.min(dueBeforeGeneral, generalRemaining);
            alloc.generalAllocated += toDistribute;
            generalRemaining -= toDistribute;
          }
          alloc.pastReceipts = alloc.specificReceipts + alloc.generalAllocated;
          alloc.due = Math.max(0, alloc.gross - alloc.upfront - alloc.creditAdjusted - alloc.pastReceipts);
        }
      });

      setReturnAllocationsMap(allocations);

      const netCustomerRefundPayable = Math.max(0, totalReturnsGross - totalReturnsUpfrontDisbursed - totalReturnsCreditAdjusted - totalPayoutsDisbursed);
      setCustomerTotalOutstandingReceivable(netCustomerRefundPayable);

      // If a specific Return Note is selected
      if (returnNumber && allocations[returnNumber]) {
        const currentAlloc = allocations[returnNumber];
        setReturnGrossBill(currentAlloc.gross);
        setReturnCreditAdjusted(currentAlloc.creditAdjusted);
        setReturnPaidUpfront(currentAlloc.upfront);
        setReturnPastReceiptsPaid(currentAlloc.pastReceipts);
        setEffectiveDueForThisReceipt(currentAlloc.due);
      } else {
        // No specific return note selected -> recovery against overall customer return balance
        setReturnGrossBill(totalReturnsGross);
        setReturnCreditAdjusted(totalReturnsCreditAdjusted);
        setReturnPaidUpfront(totalReturnsUpfrontDisbursed);
        setReturnPastReceiptsPaid(totalPayoutsDisbursed);
        setEffectiveDueForThisReceipt(netCustomerRefundPayable);
      }
    } catch (err: any) {
      console.error('Customer return balance calculation error:', err);
    }
  };

  // Customer selection handler
  const handleSelectCustomer = (cust: any) => {
    const cName = cust.customer_name || cust.name;
    setSelectedCustomer(cName);
    setCustomerSearchQuery(cName);
    setSelectedCustomerObj(cust);
    setIsCustomerDropdownOpen(false);

    setSelectedReturnNo('');
    setReturnSearchQuery('-- General Customer Balance Payout (All Return Notes) --');
    setSelectedReturnObj(null);

    calculateCustomerBalances(cName, '', returnOptions, editData?.id || null);
  };

  // Return selection handler
  const handleSelectReturn = (returnNo: string) => {
    setSelectedReturnNo(returnNo);
    setReturnSearchQuery(returnNo || '-- General Customer Balance Payout (All Return Notes) --');
    setIsReturnDropdownOpen(false);

    if (returnNo) {
      const rtnObj = returnOptions.find(r => (r.return_no === returnNo || r.invoice_no === returnNo || String(r.id) === String(returnNo)));
      setSelectedReturnObj(rtnObj || null);
    } else {
      setSelectedReturnObj(null);
    }

    calculateCustomerBalances(selectedCustomer, returnNo, returnOptions, editData?.id || null);
  };

  // Filtered lists for autocomplete
  const filteredCustomers = customerOptions.filter(c =>
    (c.customer_name || c.name || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.customer_code || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.contact_name || c.contact_person || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.cell_no || c.phone_no || c.phone || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.city || '').toLowerCase().includes(customerSearchQuery.toLowerCase())
  );

  const customerReturnsList = returnOptions.filter(r => 
    selectedCustomer && (r.customer_name || '').toLowerCase() === selectedCustomer.toLowerCase()
  );

  const filteredReturns = customerReturnsList.filter(r => {
    if (!returnSearchQuery || returnSearchQuery.startsWith('-- General')) return true;
    return (
      (r.return_no || '').toLowerCase().includes(returnSearchQuery.toLowerCase()) ||
      (r.invoice_no || '').toLowerCase().includes(returnSearchQuery.toLowerCase()) ||
      (r.return_date || '').toLowerCase().includes(returnSearchQuery.toLowerCase()) ||
      (r.warehouse || r.source_warehouse || '').toLowerCase().includes(returnSearchQuery.toLowerCase())
    );
  });

  const validationSchema = Yup.object().shape({
    paymentMethod: Yup.string().required('Disbursement method is required'),
    paymentDate: Yup.string().required('Date is required'),
    amount: Yup.number().when('paymentMethod', {
      is: (val: string) => val === 'By Cash' || val === 'By Bank',
      then: () => Yup.number().typeError('Amount must be numeric').min(1, 'Amount must be greater than 0').required('Amount is required'),
      otherwise: () => Yup.number().nullable()
    }),
    cashAmount: Yup.number().when('paymentMethod', {
      is: 'Split',
      then: () => Yup.number().typeError('Cash must be numeric').min(0, 'Cannot be negative'),
      otherwise: () => Yup.number().nullable()
    }),
    bankAmount: Yup.number().when('paymentMethod', {
      is: 'Split',
      then: () => Yup.number().typeError('Bank must be numeric').min(0, 'Cannot be negative'),
      otherwise: () => Yup.number().nullable()
    }),
    selectedBankId: Yup.string().when('paymentMethod', {
      is: (val: string) => val === 'By Bank' || val === 'Split',
      then: () => Yup.string().required('Please select the disbursing bank account'),
      otherwise: () => Yup.string().nullable()
    })
  });

  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
    ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

  if (metadataLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl text-xs text-slate-800 dark:text-slate-200 antialiased font-sans">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MdOutlinePayment className="text-emerald-600" size={24} />
            {isEditMode ? 'Edit Sales Return Cash-Back Settlement Voucher' : 'Log Sales Return Refund Payout Voucher'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Disburse customer cash/bank refund payouts on sales returns with automated FIFO receivable ledger balancing
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/sales/sales-return-receipt/list`)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs"
        >
          <MdArrowBack size={16} /> Back to Return Payouts
        </button>
      </div>

      <Formik
        initialValues={isEditMode && editData ? {
          receiptNo: editData.receipt_no || `SRR-${String(editData.id).padStart(4, '0')}`,
          paymentMethod: (editData.settlement_mode === 'Bank' || editData.payment_mode === 'Bank' || editData.payment_method === 'By Bank') ? 'By Bank' : (editData.payment_method === 'Split' || (editData.metadata?.cashAmount && editData.metadata?.bankAmount) ? 'Split' : 'By Cash'),
          selectedBankId: editData.metadata?.selectedBankId || editData.bank_account_title || '',
          paymentDate: editData.payment_date || editData.processing_date || new Date().toISOString().split('T')[0],
          amount: editData.amount_paid || '',
          cashAmount: editData.metadata?.cashAmount || '',
          bankAmount: editData.metadata?.bankAmount || '',
          notes: editData.remarks || editData.notes || ''
        } : {
          receiptNo: generatedReceiptNo,
          paymentMethod: 'By Cash',
          selectedBankId: '',
          paymentDate: new Date().toISOString().split('T')[0],
          amount: '',
          cashAmount: '',
          bankAmount: '',
          notes: ''
        }}
        enableReinitialize={true}
        validationSchema={validationSchema}
        onSubmit={async (values) => {
          if (!selectedCustomer) {
            toast.error('Validation Error: Please select a customer first!');
            return;
          }

          let finalAmount = 0;
          let cashPortion = 0;
          let bankPortion = 0;

          if (values.paymentMethod === 'By Cash') {
            cashPortion = Number(values.amount) || 0;
            finalAmount = cashPortion;
          } else if (values.paymentMethod === 'By Bank') {
            bankPortion = Number(values.amount) || 0;
            finalAmount = bankPortion;
            if (!values.selectedBankId) {
              toast.error('Please select the disbursing bank account.');
              return;
            }
          } else if (values.paymentMethod === 'Split') {
            cashPortion = Number(values.cashAmount) || 0;
            bankPortion = Number(values.bankAmount) || 0;
            finalAmount = cashPortion + bankPortion;
            if (!values.selectedBankId && bankPortion > 0) {
              toast.error('Please select the disbursing bank account for the bank transfer portion.');
              return;
            }
          }

          if (finalAmount <= 0) {
            toast.error('Please enter a valid refund payout amount greater than 0.');
            return;
          }

          if (effectiveDueForThisReceipt > 0 && finalAmount > effectiveDueForThisReceipt + 1) {
            const confirmOver = window.confirm(`Disbursed refund amount (Rs. ${formatMoney(finalAmount)}) exceeds the pending customer refund balance (Rs. ${formatMoney(effectiveDueForThisReceipt)}). Proceed anyway?`);
            if (!confirmOver) return;
          }

          try {
            setLoading(true);

            // 1. Resolve Chart of Accounts
            const cashCoa = coaAccounts.find((c: any) =>
              String(c.control_code || '').toLowerCase().includes('cash') ||
              String(c.account_title || '').toLowerCase().includes('cash')
            );

            const selectedBankObj = bankAccounts.find((b: any) => String(b.id) === String(values.selectedBankId) || String(b.bankName) === String(values.selectedBankId));
            const bankCoa = coaAccounts.find((c: any) =>
              (selectedBankObj && (
                String(c.linked_bank_id) === String(selectedBankObj.id) ||
                String(c.account_code) === String(selectedBankObj.accountNumber) ||
                String(c.account_title || '').toLowerCase().includes(String(selectedBankObj.bankName || '').toLowerCase())
              )) ||
              String(c.control_code || '').toLowerCase().includes('bank')
            );

            const recCoa = coaAccounts.find((c: any) =>
              String(c.control_code || '').toLowerCase().includes('debtor') ||
              String(c.control_code || '').toLowerCase().includes('receivable') ||
              String(c.account_title || '').toLowerCase().includes('receivable') ||
              String(c.account_title || '').toLowerCase().includes('debtor')
            );

            const customerAccountCode = recCoa ? String(recCoa.account_code) : '1020';
            const cashAccountCode = cashCoa ? String(cashCoa.account_code) : '1010';
            const bankAccountCode = bankCoa ? String(bankCoa.account_code) : (selectedBankObj?.accountNumber || '1015');

            // 2. Prepare sales_return_receipts record
            const targetReturnId = selectedReturnObj?.id || (selectedReturnNo ? returnOptions.find(r => r.return_no === selectedReturnNo || r.invoice_no === selectedReturnNo)?.id : null);

            const receiptPayload = {
              receipt_no: values.receiptNo,
              sales_return_id: targetReturnId || null,
              invoice_no: selectedReturnNo || selectedReturnObj?.invoice_no || null,
              return_no: selectedReturnNo || selectedReturnObj?.return_no || null,
              customer_name: selectedCustomer,
              payment_date: values.paymentDate,
              payment_mode: values.paymentMethod === 'By Bank' ? 'Bank' : (values.paymentMethod === 'Split' ? 'Split' : 'Cash'),
              settlement_mode: values.paymentMethod === 'By Bank' ? 'Bank' : (values.paymentMethod === 'Split' ? 'Split' : 'Cash'),
              payment_method: values.paymentMethod,
              bank_name: selectedBankObj?.bankName || null,
              amount_paid: finalAmount,
              notes: values.notes.trim() || null,
              remarks: values.notes.trim() || null,
              metadata: {
                selectedBankId: (values.paymentMethod === 'By Bank' || values.paymentMethod === 'Split') ? values.selectedBankId : null,
                selectedBankTitle: selectedBankObj ? `${selectedBankObj.bankName} - ${selectedBankObj.accountTitle || selectedBankObj.accountNumber}` : null,
                linkedReturnNo: selectedReturnNo || null,
                cashAmount: cashPortion,
                bankAmount: bankPortion,
                paymentMethod: values.paymentMethod,
                returnGross: returnGrossBill,
                previousCollected: returnPaidUpfront + returnPastReceiptsPaid,
                remainingDueAfterReceipt: Math.max(0, effectiveDueForThisReceipt - finalAmount)
              }
            };

            let savedReceiptId = editData?.id;

            if (isEditMode) {
              const { error: updateErr } = await supabase
                .from('sales_return_receipts')
                .update(receiptPayload)
                .eq('id', editData.id);
              if (updateErr) throw updateErr;
            } else {
              const { data: insertedRec, error: insertErr } = await supabase
                .from('sales_return_receipts')
                .insert([receiptPayload])
                .select('id')
                .single();
              if (insertErr) throw insertErr;
              savedReceiptId = insertedRec?.id;
            }

            // 3. Balanced Journal Entries in financial_vouchers
            let balancedJournalItems: any[] = [];
            let voucherTypeRecord = 'Cash Payment Voucher';

            if (values.paymentMethod === 'By Cash') {
              voucherTypeRecord = 'Cash Payment Voucher';
              balancedJournalItems = [
                { accountCode: customerAccountCode, description: `Sales return refund paid to ${selectedCustomer} via ${values.receiptNo}`, debit: finalAmount, credit: 0 },
                { accountCode: cashAccountCode, description: `Cash payout from drawer via ${values.receiptNo}`, debit: 0, credit: finalAmount }
              ];
            } else if (values.paymentMethod === 'By Bank') {
              voucherTypeRecord = 'Bank Payment Voucher';
              balancedJournalItems = [
                { accountCode: customerAccountCode, description: `Sales return bank refund paid to ${selectedCustomer} via ${values.receiptNo}`, debit: finalAmount, credit: 0 },
                { accountCode: bankAccountCode, description: `Bank payout via ${values.receiptNo}`, debit: 0, credit: finalAmount }
              ];
            } else {
              voucherTypeRecord = 'Cash & Bank Payment Voucher';
              balancedJournalItems = [
                { accountCode: customerAccountCode, description: `Sales return refund paid to ${selectedCustomer} via ${values.receiptNo}`, debit: finalAmount, credit: 0 },
                ...(cashPortion > 0 ? [{ accountCode: cashAccountCode, description: `Cash payout via ${values.receiptNo}`, debit: 0, credit: cashPortion }] : []),
                ...(bankPortion > 0 ? [{ accountCode: bankAccountCode, description: `Bank payout via ${values.receiptNo}`, debit: 0, credit: bankPortion }] : [])
              ];
            }

            const methodStr = values.paymentMethod === 'Split'
              ? ` | Split (Cash: Rs. ${formatMoney(cashPortion)} + Bank: Rs. ${formatMoney(bankPortion)} via ${selectedBankObj?.bankName || values.selectedBankId})`
              : (values.paymentMethod === 'By Bank' ? ` | Source Bank: ${selectedBankObj?.bankName || values.selectedBankId}` : ' | Mode: Cash Drawer');

            const rtnInfoStr = selectedReturnNo ? ` | Linked Return: ${selectedReturnNo}` : ' | General Return Balance Payout';
            const compositeNarration = `Customer Sales Return Refund Disbursed: ${selectedCustomer}${rtnInfoStr}${methodStr} | Remarks: ${values.notes.trim()}`.trim();

            const voucherPayload = {
              voucher_no: values.receiptNo,
              voucher_type: voucherTypeRecord,
              voucher_date: values.paymentDate,
              customerName: selectedCustomer,
              customer_name: selectedCustomer,
              original_invoice_no: selectedReturnNo || null,
              narration: compositeNarration,
              notes: compositeNarration,
              total_amount: finalAmount,
              items: balancedJournalItems,
              metadata: {
                selectedBankId: (values.paymentMethod === 'By Bank' || values.paymentMethod === 'Split') ? values.selectedBankId : null,
                selectedBankTitle: selectedBankObj ? `${selectedBankObj.bankName} - ${selectedBankObj.accountTitle}` : null,
                linkedReturnNo: selectedReturnNo || null,
                cashAmount: cashPortion,
                bankAmount: bankPortion,
                paymentTerm: values.paymentMethod,
                moduleSource: 'sales_return_receipt'
              }
            };

            const { data: existingVoucher } = await supabase
              .from('financial_vouchers')
              .select('id')
              .eq('voucher_no', values.receiptNo)
              .maybeSingle();

            if (existingVoucher) {
              await supabase.from('financial_vouchers').update(voucherPayload).eq('id', existingVoucher.id);
            } else {
              await supabase.from('financial_vouchers').insert([voucherPayload]);
            }

            // 4. Update specific sales_returns record if linked
            if (targetReturnId) {
              const { data: allReceiptsForReturn } = await supabase
                .from('sales_return_receipts')
                .select('id, amount_paid')
                .eq('sales_return_id', targetReturnId);

              const totalReceiptsSum = (allReceiptsForReturn || []).reduce((acc: number, r: any) => acc + (Number(r.amount_paid) || 0), 0);
              const targetReturn = returnOptions.find(r => r.id === targetReturnId);
              const upfrontPaid = Number(targetReturn?.payout_amount_paid || targetReturn?.amount_paid || 0);
              const newTotalPaid = upfrontPaid + totalReceiptsSum;
              const returnGross = Number(targetReturn?.total_amount || targetReturn?.total_net_amount || 0);

              await supabase
                .from('sales_returns')
                .update({
                  payout_amount_paid: newTotalPaid,
                  status: newTotalPaid >= returnGross - 1 ? 'Refunded' : 'Partial Refund'
                })
                .eq('id', targetReturnId);
            }

            toast.success(isEditMode ? 'Sales return payout voucher updated!' : 'Customer sales return refund disbursed successfully!');

            if (shouldPrintAfterSave && savedReceiptId) {
              navigate(`${tenantId ? `/${tenantId}` : ''}/sales/sales-return-receipt/print/${savedReceiptId}`);
            } else {
              navigate(`${tenantId ? `/${tenantId}` : ''}/sales/sales-return-receipt/list`);
            }
          } catch (err: any) {
            toast.error('Error processing sales return receipt: ' + err.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {({ handleChange, handleBlur, setFieldValue, values, errors, touched, handleSubmit }) => {
          const currentTotalAmt = values.paymentMethod === 'Split'
            ? (Number(values.cashAmount || 0) + Number(values.bankAmount || 0))
            : (Number(values.amount) || 0);

          const projectedRemaining = Math.max(0, effectiveDueForThisReceipt - currentTotalAmt);

          return (
            <Form className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* ── LEFT COLUMN: FORM INPUTS (7 COLS) ── */}
              <div className="lg:col-span-7 bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs space-y-5">
                
                {/* Row 1: Receipt # & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                      Receipt Voucher #:
                    </label>
                    <input
                      type="text"
                      name="receiptNo"
                      onChange={handleChange}
                      onBlur={handleBlur}
                      value={values.receiptNo}
                      placeholder="Auto-generated"
                      readOnly
                      className={`w-full p-2.5 bg-gray-50 dark:bg-slate-800 rounded-xl font-mono font-black text-emerald-700 dark:text-emerald-400 border text-xs outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 cursor-not-allowed ${
                        touched.receiptNo && errors.receiptNo ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-700'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                      Payout Date: *
                    </label>
                    <input
                      type="date"
                      name="paymentDate"
                      onChange={handleChange}
                      value={values.paymentDate}
                      className={`w-full border rounded-xl p-2.5 bg-slate-50/50 dark:bg-slate-800 font-bold outline-none text-slate-900 dark:text-white text-xs ${
                        touched.paymentDate && errors.paymentDate ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600'
                      }`}
                    />
                  </div>
                </div>

                {/* Row 2: Target Customer (Searchable Autocomplete Input) */}
                <div className="relative" ref={customerContainerRef}>
                  <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1 flex items-center gap-1.5">
                    <MdPerson size={15} className="text-emerald-600" /> Target Customer Account: *
                  </label>
                  
                  <div className="relative">
                    <input
                      type="text"
                      disabled={isEditMode}
                      value={customerSearchQuery}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedCustomerIndex(prev => Math.min(prev + 1, filteredCustomers.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedCustomerIndex(prev => Math.max(prev - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          if (filteredCustomers[highlightedCustomerIndex]) {
                            handleSelectCustomer(filteredCustomers[highlightedCustomerIndex]);
                          }
                        } else if (e.key === 'Escape') {
                          setIsCustomerDropdownOpen(false);
                        }
                      }}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setIsCustomerDropdownOpen(true);
                        setHighlightedCustomerIndex(0);
                        if (!e.target.value) {
                          setSelectedCustomer('');
                          setSelectedCustomerObj(null);
                          calculateCustomerBalances('', '', returnOptions, editData?.id || null);
                        }
                      }}
                      placeholder="Type to search customer name, contact or phone..."
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 pr-10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
                    />

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {selectedCustomer && !isEditMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomer('');
                            setCustomerSearchQuery('');
                            setSelectedCustomerObj(null);
                            setSelectedReturnNo('');
                            setReturnSearchQuery('');
                            calculateCustomerBalances('', '', returnOptions, editData?.id || null);
                          }}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <MdClear size={16} />
                        </button>
                      )}
                      <MdSearch className="text-slate-400" size={18} />
                    </div>
                  </div>

                  {/* Customer Autocomplete Dropdown */}
                  {isCustomerDropdownOpen && !isEditMode && (
                    <div className="absolute left-0 top-full mt-1.5 z-[9999] w-full max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((cust, cIdx) => (
                          <div
                            key={cust.id}
                            onMouseEnter={() => setHighlightedCustomerIndex(cIdx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectCustomer(cust);
                            }}
                            className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${
                              highlightedCustomerIndex === cIdx || selectedCustomer === (cust.customer_name || cust.name)
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-bold">{cust.customer_name || cust.name}</span>
                              {(cust.contact_name || cust.contact_person || cust.cell_no || cust.phone) && (
                                <span className="text-[10px] text-slate-400">
                                  {cust.contact_name || cust.contact_person} {cust.cell_no || cust.phone ? `• ${cust.cell_no || cust.phone}` : ''}
                                </span>
                              )}
                            </div>
                            {cust.city && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-medium">
                                {cust.city}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-400 italic">
                          No matching customer accounts found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Row 3: Settle Specific Sales Return Note (Searchable Autocomplete Input) */}
                {selectedCustomer && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 relative" ref={returnContainerRef}>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MdReceipt size={15} className="text-emerald-600" /> Settle Specific Return Note (Optional):
                      </span>
                      {selectedReturnNo && (
                        <button
                          type="button"
                          onClick={() => handleSelectReturn('')}
                          className="text-[10px] text-emerald-600 hover:underline font-bold"
                        >
                          Clear Selection (Settle General Balance)
                        </button>
                      )}
                    </label>

                    <div className="relative">
                      <input
                        type="text"
                        value={returnSearchQuery}
                        onFocus={() => setIsReturnDropdownOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlightedReturnIndex(prev => Math.min(prev + 1, filteredReturns.length));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedReturnIndex(prev => Math.max(prev - 1, 0));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (highlightedReturnIndex === 0) {
                              handleSelectReturn('');
                            } else if (filteredReturns[highlightedReturnIndex - 1]) {
                              const r = filteredReturns[highlightedReturnIndex - 1];
                              handleSelectReturn(r.return_no || r.invoice_no || `SRTN-${r.id}`);
                            }
                          } else if (e.key === 'Escape') {
                            setIsReturnDropdownOpen(false);
                          }
                        }}
                        onChange={(e) => {
                          setReturnSearchQuery(e.target.value);
                          setIsReturnDropdownOpen(true);
                          setHighlightedReturnIndex(0);
                        }}
                        placeholder="Search Return # (e.g. SRTN-1, INV-0002), date, or warehouse..."
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 pr-10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600"
                      />

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {selectedReturnNo && (
                          <button
                            type="button"
                            onClick={() => handleSelectReturn('')}
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <MdClear size={16} />
                          </button>
                        )}
                        <MdKeyboardArrowDown className="text-slate-400" size={18} />
                      </div>
                    </div>

                    {/* Return Autocomplete Dropdown */}
                    {isReturnDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1.5 z-[9999] w-full max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                        {/* Option 1: General Customer Balance Recovery */}
                        <div
                          onMouseEnter={() => setHighlightedReturnIndex(0)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectReturn('');
                          }}
                          className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${
                            highlightedReturnIndex === 0 || !selectedReturnNo
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-xs">-- General Customer Balance Payout (All Return Notes) --</span>
                            <span className="text-[10px] text-slate-400">Automated FIFO allocation against customer credit balances</span>
                          </div>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            General
                          </span>
                        </div>

                        {/* Return List */}
                        {filteredReturns.map((rtn, rIdx) => {
                          const key = rtn.return_no || rtn.invoice_no || `SRTN-${rtn.id}`;
                          const alloc = returnAllocationsMap[key];
                          const bill = alloc ? alloc.gross : (Number(rtn.total_amount || rtn.total_net_amount) || 0);
                          const due = alloc ? alloc.due : Math.max(0, bill - (Number(rtn.payout_amount_paid || rtn.amount_paid) || 0));

                          return (
                            <div
                              key={rtn.id}
                              onMouseEnter={() => setHighlightedReturnIndex(rIdx + 1)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectReturn(key);
                              }}
                              className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${
                                highlightedReturnIndex === (rIdx + 1) || selectedReturnNo === key
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono font-black text-xs text-emerald-700 dark:text-emerald-400">{key}</span>
                                <span className="text-[10px] text-slate-400">
                                  {rtn.return_date || 'N/A'} • {rtn.warehouse || rtn.source_warehouse || 'Main Warehouse'}
                                </span>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-slate-500 text-[10px] block">Credit: Rs. {formatMoney(bill)}</span>
                                <span className="text-emerald-700 dark:text-emerald-400 font-black text-xs">
                                  Refund Due: Rs. {formatMoney(due)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Select a specific customer return note to clear its remaining cash-back balance, or leave on General Balance to disburse refund payouts across open customer return credits.
                    </p>
                  </div>
                )}

                {/* Row 4: Disbursement Gateway with Split Payment */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                        Disbursement Gateway: *
                      </label>
                      <select
                        name="paymentMethod"
                        onChange={(e) => {
                          const val = e.target.value;
                          setFieldValue('paymentMethod', val);
                          if (val === 'Split') {
                            setFieldValue('cashAmount', '');
                            setFieldValue('bankAmount', '');
                          }
                        }}
                        value={values.paymentMethod}
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600 cursor-pointer"
                      >
                        <option value="By Cash">💵 Cash Drawer / Vault</option>
                        <option value="By Bank">🏦 Bank Wire / Online Transfer</option>
                        <option value="Split">💳 Split Payment (Cash + Bank)</option>
                      </select>
                    </div>

                    {(values.paymentMethod === 'By Bank' || values.paymentMethod === 'Split') && (
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                          Disbursing Bank Account: *
                        </label>
                        <select
                          name="selectedBankId"
                          onChange={handleChange}
                          value={values.selectedBankId}
                          className={`w-full border rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs cursor-pointer ${
                            touched.selectedBankId && errors.selectedBankId ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600'
                          }`}
                        >
                          <option value="">-- Choose Disbursing Bank --</option>
                          {bankAccounts.map(b => (
                            <option key={b.id} value={b.bankName}>
                              {b.bankName} - {b.accountTitle} ({b.accountNumber || '-'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Row 5: Amount Inputs (Single or Split) */}
                  {values.paymentMethod === 'Split' ? (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-emerald-700 dark:text-emerald-400 font-black uppercase text-[11px]">
                          Split Refund Breakdown (Cash + Bank): *
                        </label>
                        {effectiveDueForThisReceipt > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const half = Math.floor(effectiveDueForThisReceipt / 2);
                              setFieldValue('cashAmount', half);
                              setFieldValue('bankAmount', effectiveDueForThisReceipt - half);
                            }}
                            className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                          >
                            ⚡ Split Full Due (50/50)
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">
                            Cash Portion (PKR):
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">Rs.</span>
                            <input
                              type="number"
                              name="cashAmount"
                              placeholder="0"
                              onKeyDown={blockInvalidChar}
                              onChange={handleChange}
                              value={values.cashAmount}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-3 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white text-xs outline-none focus:border-emerald-600"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">
                            Bank Portion (PKR):
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">Rs.</span>
                            <input
                              type="number"
                              name="bankAmount"
                              placeholder="0"
                              onKeyDown={blockInvalidChar}
                              onChange={handleChange}
                              value={values.bankAmount}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-3 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white text-xs outline-none focus:border-emerald-600"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                        <span className="font-bold text-slate-600 dark:text-slate-400">Total Disbursed in this Voucher:</span>
                        <strong className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                          Rs. {formatMoney(Number(values.cashAmount || 0) + Number(values.bankAmount || 0))}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-emerald-700 dark:text-emerald-400 font-black uppercase text-[11px]">
                          Refund Payout Amount (PKR): *
                        </label>
                        {effectiveDueForThisReceipt > 0 && (
                          <button
                            type="button"
                            onClick={() => setFieldValue('amount', effectiveDueForThisReceipt)}
                            className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            ⚡ Pay Full Due (Rs. {formatMoney(effectiveDueForThisReceipt)})
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">
                          Rs.
                        </span>
                        <input
                          type="number"
                          name="amount"
                          placeholder="0"
                          onKeyDown={blockInvalidChar}
                          onChange={handleChange}
                          value={values.amount}
                          className={`w-full border rounded-xl py-3 pl-10 pr-4 bg-white dark:bg-slate-800 font-mono font-black text-slate-950 dark:text-white text-base outline-none ${
                            touched.amount && errors.amount ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                          }`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Row 6: Remarks */}
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                    Transaction Remarks / Payout Notes:
                  </label>
                  <textarea
                    name="notes"
                    rows={2}
                    onChange={handleChange}
                    value={values.notes}
                    placeholder="Enter cheque #, online transaction reference, or customer refund clearing notes..."
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 outline-none text-slate-900 dark:text-white text-xs focus:border-emerald-600"
                  />
                </div>

                {/* Submit / Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/sales/sales-return-receipt/list`)}
                    className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition text-xs cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShouldPrintAfterSave(true);
                      handleSubmit();
                    }}
                    disabled={loading || !selectedCustomer}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-6 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <FiPrinter size={15} />
                    <span>Save & Print Voucher</span>
                  </button>

                  <button
                    type="submit"
                    onClick={() => setShouldPrintAfterSave(false)}
                    disabled={loading || !selectedCustomer}
                    className="rounded-xl bg-primary hover:bg-opacity-90 py-3 px-8 font-black text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Voucher' : 'Post & Disburse Refund'}</span>}
                  </button>
                </div>

              </div>

              {/* ── RIGHT COLUMN: LIVE FINANCIAL BREAKDOWN (5 COLS) ── */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* 1. Customer Profile Card */}
                <div className="bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <MdPerson className="text-emerald-600" size={16} /> Customer Profile
                  </div>

                  {selectedCustomer ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Customer:</span>
                        <strong className="text-slate-950 dark:text-white font-bold text-sm">{selectedCustomer}</strong>
                      </div>
                      {selectedCustomerObj?.contact_name && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Contact:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-medium">{selectedCustomerObj.contact_name}</span>
                        </div>
                      )}
                      {(selectedCustomerObj?.cell_no || selectedCustomerObj?.phone_no || selectedCustomerObj?.phone) && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Phone:</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{selectedCustomerObj.cell_no || selectedCustomerObj.phone_no || selectedCustomerObj.phone}</span>
                        </div>
                      )}
                      {selectedCustomerObj?.address && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Address:</span>
                          <span className="text-slate-700 dark:text-slate-300 text-right max-w-[60%]">{selectedCustomerObj.address}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400">
                      <MdInfoOutline className="mx-auto mb-1 text-slate-300" size={24} />
                      <p className="text-xs">Type or search a customer on the left to inspect return history</p>
                    </div>
                  )}
                </div>

                {/* 2. Interactive Settlement & Balance Card */}
                {selectedCustomer && (
                  <div className="bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        <MdAccountBalance className="text-emerald-600" size={16} /> Settlement Breakdown
                      </div>
                      {selectedReturnNo ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                          {selectedReturnNo}
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          General Ledger
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5 font-mono text-xs">
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span className="font-sans">Gross Return Total:</span>
                        <strong className="text-slate-900 dark:text-white font-black text-sm">
                          Rs. {formatMoney(returnGrossBill)}
                        </strong>
                      </div>

                      {returnCreditAdjusted > 0 && (
                        <div className="flex justify-between items-center text-purple-700 dark:text-purple-400 font-semibold">
                          <span className="font-sans">Adjusted on Credit (Invoices):</span>
                          <span>- Rs. {formatMoney(returnCreditAdjusted)}</span>
                        </div>
                      )}

                      {returnPaidUpfront > 0 && (
                        <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                          <span className="font-sans">Refund Disbursed Upfront:</span>
                          <span>- Rs. {formatMoney(returnPaidUpfront)}</span>
                        </div>
                      )}

                      {returnPastReceiptsPaid > 0 && (
                        <div className="flex justify-between items-center text-teal-700 dark:text-teal-400">
                          <span className="font-sans">Past Voucher Payouts:</span>
                          <span>- Rs. {formatMoney(returnPastReceiptsPaid)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2.5 border-t border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 font-black">
                        <span className="font-sans">Current Payable Refund Balance:</span>
                        <strong className="text-base">Rs. {formatMoney(effectiveDueForThisReceipt)}</strong>
                      </div>

                      {/* Live Calculation */}
                      <div className="pt-3 border-t-2 border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex justify-between items-center text-slate-500 font-sans text-[11px]">
                          <span>Disbursing in this Voucher:</span>
                          <strong className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                            - Rs. {formatMoney(currentTotalAmt)}
                          </strong>
                        </div>

                        <div className={`p-3 rounded-xl border flex justify-between items-center ${
                          projectedRemaining <= 0
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 text-emerald-900 dark:text-emerald-300'
                            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 text-amber-900 dark:text-amber-300'
                        }`}>
                          <div className="font-sans">
                            <span className="block text-[10px] font-black uppercase tracking-wider">
                              Balance After Payment:
                            </span>
                            <span className="text-[11px] font-medium">
                              {projectedRemaining <= 0 ? 'Fully Refunded & Settled' : 'Remaining Refund Balance'}
                            </span>
                          </div>
                          <strong className="font-mono font-black text-sm">
                            Rs. {formatMoney(projectedRemaining)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

            </Form>
          );
        }}
      </Formik>

    </div>
  );
};

export default SalesReturnReceiptAdd;
