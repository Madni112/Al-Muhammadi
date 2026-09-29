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

const AddPurchaseReturnReceipt: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId } = useAuth();

  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);

  const [vendorOptions, setVendorOptions] = useState<any[]>([]);
  const [returnOptions, setReturnOptions] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

  // Vendor Autocomplete State
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [highlightedVendorIndex, setHighlightedVendorIndex] = useState(0);
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [selectedVendorObj, setSelectedVendorObj] = useState<any>(null);

  // Return Note Autocomplete State
  const [returnSearchQuery, setReturnSearchQuery] = useState('');
  const [isReturnDropdownOpen, setIsReturnDropdownOpen] = useState(false);
  const [highlightedReturnIndex, setHighlightedReturnIndex] = useState(0);
  const [selectedReturnNo, setSelectedReturnNo] = useState<string>('');
  const [selectedReturnObj, setSelectedReturnObj] = useState<any>(null);

  const [generatedReceiptNo, setGeneratedReceiptNo] = useState('');

  // Balances
  const [vendorTotalOutstandingReceivable, setVendorTotalOutstandingReceivable] = useState<number>(0);
  const [returnGrossBill, setReturnGrossBill] = useState<number>(0);
  const [returnCreditAdjusted, setReturnCreditAdjusted] = useState<number>(0);
  const [returnPaidUpfront, setReturnPaidUpfront] = useState<number>(0);
  const [returnPastReceiptsPaid, setReturnPastReceiptsPaid] = useState<number>(0);
  const [effectiveDueForThisReceipt, setEffectiveDueForThisReceipt] = useState<number>(0);
  const [returnAllocationsMap, setReturnAllocationsMap] = useState<Record<string, { gross: number; upfront: number; creditAdjusted: number; pastReceipts: number; due: number }>>({});

  const [shouldPrintAfterSave, setShouldPrintAfterSave] = useState(false);

  const vendorContainerRef = useRef<HTMLDivElement>(null);
  const returnContainerRef = useRef<HTMLDivElement>(null);

  const editData = location.state?.receiptRecord;
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
      if (vendorContainerRef.current && !vendorContainerRef.current.contains(e.target as Node)) {
        setIsVendorDropdownOpen(false);
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

        // 1. Fetch Vendors
        const { data: vData } = await supabase.from('vendors').select('*').order('vendor_name', { ascending: true });
        const normalizedVendors = (vData || []).map((v: any) => ({
          ...v,
          vendor_name: v.vendor_name || v.name || 'Unnamed Vendor'
        }));
        setVendorOptions(normalizedVendors);

        // 2. Fetch Banks & COA
        const { data: rawBankData } = await supabase.from('banks').select('*');
        const bankData = (rawBankData || []).map((b: any) => ({
          ...b,
          bankName: b.bankName || b.bankname || '',
          accountTitle: b.accountTitle || b.accounttitle || b.account_title || '',
          accountNumber: b.accountNumber || b.accountnumber || ''
        }));
        const { data: coaData } = await supabase.from('chart_of_accounts').select('account_code, account_title, control_code, category_code');

        if (bankData) setBankAccounts(bankData);
        if (coaData) setCoaAccounts(coaData);

        // 3. Fetch all Purchase Returns
        const { data: rData } = await supabase
          .from('purchase_returns')
          .select('*')
          .order('id', { ascending: false });

        if (rData) setReturnOptions(rData);

        // If in Edit Mode, restore state
        if (isEditMode && editData) {
          const vName = editData.vendor_name || '';
          setSelectedVendor(vName);
          setVendorSearchQuery(vName);
          const matchedVendor = normalizedVendors.find(v => v.vendor_name.toLowerCase() === vName.toLowerCase());
          if (matchedVendor) setSelectedVendorObj(matchedVendor);

          const rRef = editData.return_no || '';
          if (rRef) {
            setSelectedReturnNo(rRef);
            setReturnSearchQuery(rRef);
            const matchedReturn = rData?.find(r => r.return_no === rRef || String(r.id) === String(rRef));
            if (matchedReturn) setSelectedReturnObj(matchedReturn);
          } else {
            setSelectedReturnNo('');
            setReturnSearchQuery('-- General Vendor Balance Recovery (All Return Notes) --');
            setSelectedReturnObj(null);
          }

          calculateVendorBalances(vName, rRef, rData || [], editData.id);
        } else {
          setGeneratedReceiptNo(`PRR-${Math.floor(100000 + Math.random() * 900000)}`);
        }
      } catch (err: any) {
        console.error(err.message);
        toast.error('Failed to load receipt metadata: ' + err.message);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchMetadata();
  }, [isEditMode, editData]);

  // ── Calculate Live Balances for Vendor & Selected Return ─────────────────────
  const calculateVendorBalances = async (
    vendorName: string, 
    returnNumber: string, 
    allReturns: any[], 
    currentEditReceiptId: number | null = null
  ) => {
    if (!vendorName) {
      setVendorTotalOutstandingReceivable(0);
      setReturnGrossBill(0);
      setReturnCreditAdjusted(0);
      setReturnPaidUpfront(0);
      setReturnPastReceiptsPaid(0);
      setEffectiveDueForThisReceipt(0);
      setReturnAllocationsMap({});
      return;
    }

    try {
      // 1. Fetch vendor's purchases to determine available open payable capacity
      const { data: vendorPurchases } = await supabase
        .from('supplier_purchases')
        .select('total_amount, cash_amount_paid, bank_amount_paid, remaining_balance')
        .ilike('supplier_name', vendorName);

      const { data: vendorPaymentVouchers } = await supabase
        .from('financial_vouchers')
        .select('total_amount')
        .ilike('customer_name', vendorName)
        .or('voucher_type.eq.Cash Payment Voucher,voucher_type.eq.Bank Payment Voucher,voucher_type.eq.Cash & Bank Payment Voucher');

      let totalPurchasesGross = 0;
      let totalPurchasesUpfrontPaid = 0;
      (vendorPurchases || []).forEach((p: any) => {
        totalPurchasesGross += Number(p.total_amount) || 0;
        totalPurchasesUpfrontPaid += (Number(p.cash_amount_paid || 0) + Number(p.bank_amount_paid || 0));
      });

      let totalVouchersPaid = 0;
      (vendorPaymentVouchers || []).forEach((v: any) => {
        totalVouchersPaid += Number(v.total_amount) || 0;
      });

      // Total open payable capacity across all purchases before returns
      const openPayableCapacity = Math.max(0, totalPurchasesGross - totalPurchasesUpfrontPaid - totalVouchersPaid);

      // 2. Fetch vendor's returns sorted chronologically (oldest first for FIFO)
      const vendorReturns = allReturns.filter(r => 
        (r.vendor_name || r.supplier_name || '').toLowerCase() === vendorName.toLowerCase()
      );

      const sortedVendorReturns = [...vendorReturns].sort((a, b) => {
        const timeA = new Date(a.return_date || a.created_at || 0).getTime();
        const timeB = new Date(b.return_date || b.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;

        const createdA = new Date(a.created_at || 0).getTime();
        const createdB = new Date(b.created_at || 0).getTime();
        if (createdA !== createdB) return createdA - createdB;

        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

      // 3. Fetch past refund receipts for this vendor
      const { data: pastReceipts } = await supabase
        .from('purchase_return_receipts')
        .select('id, amount_received, return_no, metadata')
        .ilike('vendor_name', vendorName);

      // Gross returns total, credit adjusted to open invoices, and upfront collected
      let totalReturnsGross = 0;
      let totalReturnsUpfrontCollected = 0;
      let totalReturnsCreditAdjusted = 0;

      const allocations: Record<string, { gross: number; upfront: number; creditAdjusted: number; specificReceipts: number; generalAllocated: number; pastReceipts: number; due: number }> = {};
      let totalReceiptsCollected = 0;
      let unallocatedGeneralReceipts = 0;

      // Track remaining open payable capacity available to absorb returns
      let remainingPayablePool = openPayableCapacity;

      // Initialize all returns chronologically
      sortedVendorReturns.forEach(r => {
        const key = r.return_no;
        const gross = Number(r.total_amount) || 0;
        const upfront = Number(r.amount_paid) || 0;
        const returnNetAfterUpfront = Math.max(0, gross - upfront);

        const isCreditReturn = r.payment_term === 'On Credit' || 
                               r.metadata?.paymentTerm === 'On Credit' || 
                               (Array.isArray(r.metadata?.matchedInvoices) && r.metadata.matchedInvoices.length > 0);
        
        let creditAdjusted = 0;
        if (isCreditReturn) {
          // Can only absorb up to the remaining open payable debt on purchases!
          creditAdjusted = Math.min(returnNetAfterUpfront, remainingPayablePool);
          remainingPayablePool -= creditAdjusted;
        }

        totalReturnsGross += gross;
        totalReturnsUpfrontCollected += upfront;
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

      // Assign Return-specific receipts and accumulate general unallocated receipts
      (pastReceipts || []).forEach(rec => {
        if (currentEditReceiptId && rec.id === currentEditReceiptId) return;
        const rAmt = Number(rec.amount_received) || 0;
        totalReceiptsCollected += rAmt;

        const rRef = rec.return_no || rec.metadata?.linkedReturnNo || '';
        if (rRef) {
          const matchedRtn = sortedVendorReturns.find(r => r.return_no === rRef || String(r.id) === String(rRef));
          if (matchedRtn && allocations[matchedRtn.return_no]) {
            allocations[matchedRtn.return_no].specificReceipts += rAmt;
          } else {
            unallocatedGeneralReceipts += rAmt;
          }
        } else {
          unallocatedGeneralReceipts += rAmt;
        }
      });

      // Allocate general unallocated receipts across open return notes (FIFO order)
      let generalRemaining = unallocatedGeneralReceipts;
      sortedVendorReturns.forEach(r => {
        const key = r.return_no;
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

      const netVendorReceivable = Math.max(0, totalReturnsGross - totalReturnsUpfrontCollected - totalReturnsCreditAdjusted - totalReceiptsCollected);
      setVendorTotalOutstandingReceivable(netVendorReceivable);

      // If a specific Return Note is selected
      if (returnNumber && allocations[returnNumber]) {
        const currentAlloc = allocations[returnNumber];
        setReturnGrossBill(currentAlloc.gross);
        setReturnCreditAdjusted(currentAlloc.creditAdjusted);
        setReturnPaidUpfront(currentAlloc.upfront);
        setReturnPastReceiptsPaid(currentAlloc.pastReceipts);
        setEffectiveDueForThisReceipt(currentAlloc.due);
      } else {
        // No specific return note selected -> recovery against overall vendor return credit balance
        setReturnGrossBill(totalReturnsGross);
        setReturnCreditAdjusted(totalReturnsCreditAdjusted);
        setReturnPaidUpfront(totalReturnsUpfrontCollected);
        setReturnPastReceiptsPaid(totalReceiptsCollected);
        setEffectiveDueForThisReceipt(netVendorReceivable);
      }
    } catch (err: any) {
      console.error('Return balance calculation error:', err);
    }
  };

  // Vendor selection handler
  const handleSelectVendor = (vendor: any) => {
    const vName = vendor.vendor_name;
    setSelectedVendor(vName);
    setVendorSearchQuery(vName);
    setSelectedVendorObj(vendor);
    setIsVendorDropdownOpen(false);

    setSelectedReturnNo('');
    setReturnSearchQuery('-- General Vendor Balance Recovery (All Return Notes) --');
    setSelectedReturnObj(null);

    calculateVendorBalances(vName, '', returnOptions, editData?.id || null);
  };

  // Return selection handler
  const handleSelectReturn = (returnNo: string) => {
    setSelectedReturnNo(returnNo);
    setReturnSearchQuery(returnNo || '-- General Vendor Balance Recovery (All Return Notes) --');
    setIsReturnDropdownOpen(false);

    if (returnNo) {
      const rtnObj = returnOptions.find(r => r.return_no === returnNo || String(r.id) === String(returnNo));
      setSelectedReturnObj(rtnObj || null);
    } else {
      setSelectedReturnObj(null);
    }

    calculateVendorBalances(selectedVendor, returnNo, returnOptions, editData?.id || null);
  };

  // Filtered lists for autocomplete
  const filteredVendors = vendorOptions.filter(v =>
    (v.vendor_name || '').toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
    (v.contact_name || v.contact_person || '').toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
    (v.cell_no || v.phone_no || v.phone || '').toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
    (v.city || '').toLowerCase().includes(vendorSearchQuery.toLowerCase())
  );

  const vendorReturnsList = returnOptions.filter(r => 
    selectedVendor && (r.vendor_name || r.supplier_name || '').toLowerCase() === selectedVendor.toLowerCase()
  );

  const filteredReturns = vendorReturnsList.filter(r => {
    if (!returnSearchQuery || returnSearchQuery.startsWith('-- General')) return true;
    return (
      (r.return_no || '').toLowerCase().includes(returnSearchQuery.toLowerCase()) ||
      (r.return_date || '').toLowerCase().includes(returnSearchQuery.toLowerCase()) ||
      (r.source_warehouse || '').toLowerCase().includes(returnSearchQuery.toLowerCase()) ||
      (r.purchase_no || '').toLowerCase().includes(returnSearchQuery.toLowerCase())
    );
  });

  const validationSchema = Yup.object().shape({
    receiptNo: Yup.string().required('Receipt Voucher # is required'),
    paymentMethod: Yup.string().required('Collection method is required'),
    paymentDate: Yup.string().required('Payment date is required'),
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
      then: () => Yup.string().required('Please select the receiving bank account'),
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
            {isEditMode ? 'Edit Vendor Purchase Return Receipt Voucher' : 'Log Vendor Inflow Return Collection'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Collect cash, bank wire, or split refund payments against vendor debit notes with automated FIFO ledger balancing
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return-Receipt/List`)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs"
        >
          <MdArrowBack size={16} /> Back to Return Receipts
        </button>
      </div>

      <Formik
        initialValues={isEditMode && editData ? {
          receiptNo: editData.receipt_no || '',
          paymentMethod: editData.payment_method === 'By Bank' ? 'By Bank' : (editData.payment_method === 'Split' || (editData.metadata?.cashAmount && editData.metadata?.bankAmount) ? 'Split' : 'By Cash'),
          selectedBankId: editData.metadata?.selectedBankId || '',
          paymentDate: editData.payment_date || new Date().toISOString().split('T')[0],
          amount: editData.amount_received || '',
          cashAmount: editData.metadata?.cashAmount || '',
          bankAmount: editData.metadata?.bankAmount || '',
          notes: editData.remarks || ''
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
          if (!selectedVendor) {
            toast.error('Validation Error: Please select a wholesale vendor first!');
            return;
          }

          if (values.receiptNo) {
            let query = supabase.from('purchase_return_receipts').select('id').eq('receipt_no', values.receiptNo);
            if (isEditMode && editData?.id) {
              query = query.neq('id', editData.id);
            }
            const { data: existingRecords, error: checkError } = await query;
            if (checkError) {
              toast.error('Failed to validate Receipt Voucher #.');
              return;
            }
            if (existingRecords && existingRecords.length > 0) {
              toast.error('Receipt Voucher # already exists!');
              return;
            }
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
              toast.error('Please select the receiving bank account.');
              return;
            }
          } else if (values.paymentMethod === 'Split') {
            cashPortion = Number(values.cashAmount) || 0;
            bankPortion = Number(values.bankAmount) || 0;
            finalAmount = cashPortion + bankPortion;
            if (!values.selectedBankId && bankPortion > 0) {
              toast.error('Please select the receiving bank account for the bank transfer portion.');
              return;
            }
          }

          if (finalAmount <= 0) {
            toast.error('Please enter a valid collection amount greater than 0.');
            return;
          }

          if (finalAmount > effectiveDueForThisReceipt + 1) {
            toast.error(`Error: Collected amount (Rs. ${formatMoney(finalAmount)}) exceeds the pending return balance (Rs. ${formatMoney(effectiveDueForThisReceipt)}).`);
            return;
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

            const payCoa = coaAccounts.find((c: any) =>
              String(c.control_code || '').toLowerCase().includes('creditor') ||
              String(c.control_code || '').toLowerCase().includes('payable') ||
              String(c.account_title || '').toLowerCase().includes('payable') ||
              String(c.account_title || '').toLowerCase().includes('creditor')
            );

            const vendorAccountCode = payCoa ? String(payCoa.account_code) : (cashCoa ? String(cashCoa.account_code) : '2010');
            const cashAccountCode = cashCoa ? String(cashCoa.account_code) : '1010';
            const bankAccountCode = bankCoa ? String(bankCoa.account_code) : (selectedBankObj?.accountNumber || '1015');

            // 2. Prepare purchase_return_receipts record
            const receiptPayload = {
              receipt_no: values.receiptNo,
              return_no: selectedReturnNo || null,
              vendor_name: selectedVendor,
              payment_date: values.paymentDate,
              payment_method: values.paymentMethod,
              payment_mode: values.paymentMethod,
              amount_received: finalAmount,
              amount_paid: finalAmount,
              bank_name: selectedBankObj?.bankName || null,
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
                .from('purchase_return_receipts')
                .update(receiptPayload)
                .eq('id', editData.id);
              if (updateErr) throw updateErr;
            } else {
              const { data: insertedRec, error: insertErr } = await supabase
                .from('purchase_return_receipts')
                .insert([receiptPayload])
                .select('id')
                .single();
              if (insertErr) throw insertErr;
              savedReceiptId = insertedRec?.id;
            }

            // 3. Balanced Journal Entries in financial_vouchers
            let balancedJournalItems: any[] = [];
            let voucherTypeRecord = 'Cash Receipt Voucher';

            if (values.paymentMethod === 'By Cash') {
              voucherTypeRecord = 'Cash Receipt Voucher';
              balancedJournalItems = [
                { accountCode: cashAccountCode, description: `Cash refund recovered from ${selectedVendor} via ${values.receiptNo}`, debit: finalAmount, credit: 0 },
                { accountCode: vendorAccountCode, description: `Debit note settlement for ${selectedReturnNo || 'General Returns'}`, debit: 0, credit: finalAmount }
              ];
            } else if (values.paymentMethod === 'By Bank') {
              voucherTypeRecord = 'Bank Receipt Voucher';
              balancedJournalItems = [
                { accountCode: bankAccountCode, description: `Bank wire refund received from ${selectedVendor} via ${values.receiptNo}`, debit: finalAmount, credit: 0 },
                { accountCode: vendorAccountCode, description: `Debit note settlement for ${selectedReturnNo || 'General Returns'}`, debit: 0, credit: finalAmount }
              ];
            } else {
              voucherTypeRecord = 'Cash & Bank Receipt Voucher';
              balancedJournalItems = [
                ...(cashPortion > 0 ? [{ accountCode: cashAccountCode, description: `Cash refund recovered via ${values.receiptNo}`, debit: cashPortion, credit: 0 }] : []),
                ...(bankPortion > 0 ? [{ accountCode: bankAccountCode, description: `Bank wire refund received via ${values.receiptNo}`, debit: bankPortion, credit: 0 }] : []),
                { accountCode: vendorAccountCode, description: `Debit note settlement for ${selectedReturnNo || 'General Returns'}`, debit: 0, credit: finalAmount }
              ];
            }

            const methodStr = values.paymentMethod === 'Split'
              ? ` | Split (Cash: Rs. ${formatMoney(cashPortion)} + Bank: Rs. ${formatMoney(bankPortion)} via ${selectedBankObj?.bankName || values.selectedBankId})`
              : (values.paymentMethod === 'By Bank' ? ` | Receiving Bank: ${selectedBankObj?.bankName || values.selectedBankId}` : ' | Mode: Cash Drawer');

            const rtnInfoStr = selectedReturnNo ? ` | Linked Return Note: ${selectedReturnNo}` : ' | General Return Balance Recovery';
            const compositeNarration = `Vendor Refund Collected: ${selectedVendor}${rtnInfoStr}${methodStr} | Remarks: ${values.notes.trim()}`.trim();

            const voucherPayload = {
              voucher_no: values.receiptNo,
              voucher_type: voucherTypeRecord,
              voucher_date: values.paymentDate,
              customerName: selectedVendor,
              customer_name: selectedVendor,
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
                moduleSource: 'purchase_return_receipt'
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

            // 4. Update specific purchase_returns record if linked
            if (selectedReturnNo) {
              const targetReturn = returnOptions.find(r => r.return_no === selectedReturnNo || String(r.id) === String(selectedReturnNo));
              if (targetReturn) {
                const { data: allReceiptsForReturn } = await supabase
                  .from('purchase_return_receipts')
                  .select('id, amount_received')
                  .eq('return_no', selectedReturnNo);

                const totalReceiptsSum = (allReceiptsForReturn || []).reduce((acc: number, r: any) => acc + (Number(r.amount_received) || 0), 0);
                const upfrontPaid = Number(targetReturn.amount_paid) || 0;
                const newTotalPaid = upfrontPaid + totalReceiptsSum;
                const returnGross = Number(targetReturn.total_amount) || 0;

                await supabase
                  .from('purchase_returns')
                  .update({
                    amount_received: newTotalPaid,
                    status: newTotalPaid >= returnGross - 1 ? 'Refunded' : 'Partial Refund'
                  })
                  .eq('id', targetReturn.id);
              }
            }

            toast.success(isEditMode ? 'Purchase return receipt voucher updated!' : 'Vendor return collection processed successfully!');

            if (shouldPrintAfterSave && savedReceiptId) {
              navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return-Receipt/Print/${savedReceiptId}`);
            } else {
              navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return-Receipt/List`);
            }
          } catch (err: any) {
            toast.error('Error processing return receipt: ' + err.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {({ handleChange, handleBlur, setFieldValue, values, errors, touched, handleSubmit }) => {
          const currentTotalAmt = values.paymentMethod === 'Split'
            ? (Number(values.cashAmount || 0) + Number(values.bankAmount || 0))
            : (Number(values.amount) || 0);

          const projectedRemaining = effectiveDueForThisReceipt - currentTotalAmt;

          return (
            <Form className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* ── LEFT COLUMN: FORM INPUTS (7 COLS) ── */}
              <div className="lg:col-span-7 bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs space-y-5">
                
                {/* Row 1: Receipt # & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block font-bold uppercase text-[11px] mb-1 ${touched.receiptNo && errors.receiptNo ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`}>
                      Receipt Voucher #: *
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
                      Collection Date: *
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

                {/* Row 2: Target Wholesale Vendor (Searchable Autocomplete Input) */}
                <div className="relative" ref={vendorContainerRef}>
                  <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1 flex items-center gap-1.5">
                    <MdPerson size={15} className="text-emerald-600" /> Target Wholesale Vendor: *
                  </label>
                  
                  <div className="relative">
                    <input
                      type="text"
                      disabled={isEditMode}
                      value={vendorSearchQuery}
                      onFocus={() => setIsVendorDropdownOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedVendorIndex(prev => Math.min(prev + 1, filteredVendors.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedVendorIndex(prev => Math.max(prev - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          if (filteredVendors[highlightedVendorIndex]) {
                            handleSelectVendor(filteredVendors[highlightedVendorIndex]);
                          }
                        } else if (e.key === 'Escape') {
                          setIsVendorDropdownOpen(false);
                        }
                      }}
                      onChange={(e) => {
                        setVendorSearchQuery(e.target.value);
                        setIsVendorDropdownOpen(true);
                        setHighlightedVendorIndex(0);
                        if (!e.target.value) {
                          setSelectedVendor('');
                          setSelectedVendorObj(null);
                          calculateVendorBalances('', '', returnOptions, editData?.id || null);
                        }
                      }}
                      placeholder="Type to search wholesale vendor name, contact or phone..."
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 pr-10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
                    />

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {selectedVendor && !isEditMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVendor('');
                            setVendorSearchQuery('');
                            setSelectedVendorObj(null);
                            setSelectedReturnNo('');
                            setReturnSearchQuery('');
                            calculateVendorBalances('', '', returnOptions, editData?.id || null);
                          }}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <MdClear size={16} />
                        </button>
                      )}
                      <MdSearch className="text-slate-400" size={18} />
                    </div>
                  </div>

                  {/* Vendor Autocomplete Dropdown */}
                  {isVendorDropdownOpen && !isEditMode && (
                    <div className="absolute left-0 top-full mt-1.5 z-[9999] w-full max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                      {filteredVendors.length > 0 ? (
                        filteredVendors.map((vendor, vIdx) => (
                          <div
                            key={vendor.id}
                            onMouseEnter={() => setHighlightedVendorIndex(vIdx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectVendor(vendor);
                            }}
                            className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${
                              highlightedVendorIndex === vIdx || selectedVendor === vendor.vendor_name
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-bold">{vendor.vendor_name}</span>
                              {(vendor.contact_name || vendor.contact_person || vendor.cell_no || vendor.phone) && (
                                <span className="text-[10px] text-slate-400">
                                  {vendor.contact_name || vendor.contact_person} {vendor.cell_no || vendor.phone ? `• ${vendor.cell_no || vendor.phone}` : ''}
                                </span>
                              )}
                            </div>
                            {vendor.city && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-medium">
                                {vendor.city}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-400 italic">
                          No matching wholesale vendors found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Row 3: Settle Specific Purchase Return Note (Searchable Autocomplete Input) */}
                {selectedVendor && (
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
                          Clear Selection (Recover General Balance)
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
                              handleSelectReturn(filteredReturns[highlightedReturnIndex - 1].return_no);
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
                        placeholder="Search Return # (e.g. RTN-592942), date, or warehouse..."
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
                        {/* Option 1: General Vendor Balance Recovery */}
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
                            <span className="font-bold text-xs">-- General Vendor Balance Recovery (All Return Notes) --</span>
                            <span className="text-[10px] text-slate-400">Automated FIFO allocation against oldest open return credits</span>
                          </div>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            General
                          </span>
                        </div>

                        {/* Return List */}
                        {filteredReturns.map((rtn, rIdx) => {
                          const alloc = returnAllocationsMap[rtn.return_no];
                          const bill = alloc ? alloc.gross : (Number(rtn.total_amount) || 0);
                          const due = alloc ? alloc.due : Math.max(0, bill - (Number(rtn.amount_paid) || 0));

                          return (
                            <div
                              key={rtn.id}
                              onMouseEnter={() => setHighlightedReturnIndex(rIdx + 1)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectReturn(rtn.return_no);
                              }}
                              className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${
                                highlightedReturnIndex === (rIdx + 1) || selectedReturnNo === rtn.return_no
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono font-black text-xs text-emerald-700 dark:text-emerald-400">{rtn.return_no}</span>
                                <span className="text-[10px] text-slate-400">
                                  {rtn.return_date || 'N/A'} • {rtn.source_warehouse || 'Main Warehouse'}
                                </span>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-slate-500 text-[10px] block">Credit: Rs. {formatMoney(bill)}</span>
                                <span className="text-emerald-700 dark:text-emerald-400 font-black text-xs">
                                  Due: Rs. {formatMoney(due)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Select a specific return debit note to clear its remaining balance, or leave on General Balance to recover refund funds across the vendor's total return balance.
                    </p>
                  </div>
                )}

                {/* Row 4: Collection Gateway with Split Payment */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                        Collection Gateway: *
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
                          Receiving Bank Account: *
                        </label>
                        <select
                          name="selectedBankId"
                          onChange={handleChange}
                          value={values.selectedBankId}
                          className={`w-full border rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs cursor-pointer ${
                            touched.selectedBankId && errors.selectedBankId ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600'
                          }`}
                        >
                          <option value="">-- Choose Receiving Bank --</option>
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
                        <span className="font-bold text-slate-600 dark:text-slate-400">Total Collected in this Voucher:</span>
                        <strong className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                          Rs. {formatMoney(Number(values.cashAmount || 0) + Number(values.bankAmount || 0))}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-emerald-700 dark:text-emerald-400 font-black uppercase text-[11px]">
                          Collected Amount (PKR): *
                        </label>
                        {effectiveDueForThisReceipt > 0 && (
                          <button
                            type="button"
                            onClick={() => setFieldValue('amount', effectiveDueForThisReceipt)}
                            className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            ⚡ Collect Full Due (Rs. {formatMoney(effectiveDueForThisReceipt)})
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
                    Transaction Remarks / Recovery Notes:
                  </label>
                  <textarea
                    name="notes"
                    rows={2}
                    onChange={handleChange}
                    value={values.notes}
                    placeholder="Enter cheque #, online transaction reference, or debit note clearing notes..."
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 outline-none text-slate-900 dark:text-white text-xs focus:border-emerald-600"
                  />
                </div>

                {/* Submit / Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return-Receipt/List`)}
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
                    disabled={loading || !selectedVendor}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-6 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <FiPrinter size={15} />
                    <span>Save & Print Receipt</span>
                  </button>

                  <button
                    type="submit"
                    onClick={() => setShouldPrintAfterSave(false)}
                    disabled={loading || !selectedVendor}
                    className="rounded-xl bg-primary hover:bg-opacity-90 py-3 px-8 font-black text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Voucher' : 'Post & Collect Refund'}</span>}
                  </button>
                </div>

              </div>

              {/* ── RIGHT COLUMN: LIVE FINANCIAL BREAKDOWN (5 COLS) ── */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* 1. Vendor Profile Card */}
                <div className="bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <MdPerson className="text-emerald-600" size={16} /> Wholesale Vendor Profile
                  </div>

                  {selectedVendor ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Vendor:</span>
                        <strong className="text-slate-950 dark:text-white font-bold text-sm">{selectedVendor}</strong>
                      </div>
                      {selectedVendorObj?.contact_name && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Contact:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-medium">{selectedVendorObj.contact_name}</span>
                        </div>
                      )}
                      {(selectedVendorObj?.cell_no || selectedVendorObj?.phone_no) && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Phone:</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{selectedVendorObj.cell_no || selectedVendorObj.phone_no}</span>
                        </div>
                      )}
                      {selectedVendorObj?.address && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Address:</span>
                          <span className="text-slate-700 dark:text-slate-300 text-right max-w-[60%]">{selectedVendorObj.address}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400">
                      <MdInfoOutline className="mx-auto mb-1 text-slate-300" size={24} />
                      <p className="text-xs">Type or search a vendor on the left to inspect return history</p>
                    </div>
                  )}
                </div>

                {/* 2. Interactive Settlement & Balance Card */}
                {selectedVendor && (
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
                          <span className="font-sans">Adjusted on Credit (Payables):</span>
                          <span>- Rs. {formatMoney(returnCreditAdjusted)}</span>
                        </div>
                      )}

                      {returnPaidUpfront > 0 && (
                        <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                          <span className="font-sans">Refund Collected Upfront:</span>
                          <span>- Rs. {formatMoney(returnPaidUpfront)}</span>
                        </div>
                      )}

                      {returnPastReceiptsPaid > 0 && (
                        <div className="flex justify-between items-center text-teal-700 dark:text-teal-400">
                          <span className="font-sans">Past Voucher Collections:</span>
                          <span>- Rs. {formatMoney(returnPastReceiptsPaid)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2.5 border-t border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 font-black">
                        <span className="font-sans">Current Collectable Cash Balance:</span>
                        <strong className="text-base">Rs. {formatMoney(effectiveDueForThisReceipt)}</strong>
                      </div>

                      {/* Live Calculation */}
                      <div className="pt-3 border-t-2 border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex justify-between items-center text-slate-500 font-sans text-[11px]">
                          <span>Collecting in this Voucher:</span>
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
                              Balance After Collection:
                            </span>
                            <span className="text-[11px] font-medium">
                              {projectedRemaining <= 0 ? 'Fully Recovered & Settled' : 'Remaining Collectable Balance'}
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

export default AddPurchaseReturnReceipt;
