import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { 
  MdStore, 
  MdPerson, 
  MdReceipt, 
  MdAttachMoney, 
  MdEvent, 
  MdAccountBalance, 
  MdCheckCircle, 
  MdArrowBack, 
  MdInfoOutline,
  MdOutlinePayment,
  MdSearch,
  MdClear,
  MdKeyboardArrowDown
} from 'react-icons/md';

function AddPurchaseReceipt() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId } = useAuth();

  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);

  const [vendorOptions, setVendorOptions] = useState<any[]>([]);
  const [purchaseOptions, setPurchaseOptions] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

  // Vendor Autocomplete State
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [highlightedVendorIndex, setHighlightedVendorIndex] = useState(0);
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [selectedVendorObj, setSelectedVendorObj] = useState<any>(null);

  // PO Autocomplete State
  const [poSearchQuery, setPoSearchQuery] = useState('');
  const [isPoDropdownOpen, setIsPoDropdownOpen] = useState(false);
  const [highlightedPoIndex, setHighlightedPoIndex] = useState(0);
  const [selectedPurchaseNo, setSelectedPurchaseNo] = useState<string>('');
  const [selectedPurchaseObj, setSelectedPurchaseObj] = useState<any>(null);

  const [generatedVoucherNo, setGeneratedVoucherNo] = useState('');

  // Balances
  const [vendorTotalOutstanding, setVendorTotalOutstanding] = useState<number>(0);
  const [poGrossBill, setPoGrossBill] = useState<number>(0);
  const [poPaidUpfront, setPoPaidUpfront] = useState<number>(0);
  const [poPastReceiptsPaid, setPoPastReceiptsPaid] = useState<number>(0);
  const [effectiveDueForThisReceipt, setEffectiveDueForThisReceipt] = useState<number>(0);
  const [poAllocationsMap, setPoAllocationsMap] = useState<Record<string, { gross: number; upfront: number; pastReceipts: number; due: number }>>({});

  const vendorContainerRef = useRef<HTMLDivElement>(null);
  const poContainerRef = useRef<HTMLDivElement>(null);

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
      if (poContainerRef.current && !poContainerRef.current.contains(e.target as Node)) {
        setIsPoDropdownOpen(false);
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

        // 3. Fetch all Supplier Purchases
        const { data: purData } = await supabase
          .from('supplier_purchases')
          .select('*')
          .order('id', { ascending: false });

        if (purData) setPurchaseOptions(purData);

        // If in Edit Mode, restore state
        if (isEditMode && editData) {
          const vName = editData.customer_name || editData.customerName || '';
          setSelectedVendor(vName);
          setVendorSearchQuery(vName);
          const matchedVendor = normalizedVendors.find(v => v.vendor_name.toLowerCase() === vName.toLowerCase());
          if (matchedVendor) setSelectedVendorObj(matchedVendor);

          const poRef = editData.original_invoice_no || editData.metadata?.linkedPurchaseNo || '';
          if (poRef) {
            setSelectedPurchaseNo(poRef);
            setPoSearchQuery(poRef);
            const cleanId = String(poRef).replace(/\D/g, '');
            const matchedPo = purData?.find(p => p.purchase_no === poRef || String(p.id) === cleanId);
            if (matchedPo) setSelectedPurchaseObj(matchedPo);
          } else {
            setSelectedPurchaseNo('');
            setPoSearchQuery('-- General Vendor Balance Clearing (All Orders) --');
            setSelectedPurchaseObj(null);
          }

          calculateVendorBalances(vName, poRef, purData || [], editData.id);
        } else {
          setGeneratedVoucherNo(`PR-${Math.floor(100000 + Math.random() * 900000)}`);
        }
      } catch (err: any) {
        console.error(err.message);
        toast.error('Failed to load payment metadata: ' + err.message);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchMetadata();
  }, [isEditMode, editData]);

  // ── Calculate Live Balances for Vendor & Selected PO ───────────────────────
  const calculateVendorBalances = async (
    vendorName: string, 
    poNumber: string, 
    allPurchases: any[], 
    currentEditVoucherId: number | null = null
  ) => {
    if (!vendorName) {
      setVendorTotalOutstanding(0);
      setPoGrossBill(0);
      setPoPaidUpfront(0);
      setPoPastReceiptsPaid(0);
      setEffectiveDueForThisReceipt(0);
      setPoAllocationsMap({});
      return;
    }

    try {
      // 1. Fetch vendor's purchases sorted chronologically (oldest first for FIFO general clearing)
      const vendorPurchases = allPurchases.filter(p => 
        (p.supplier_name || p.vendor_name || '').toLowerCase() === vendorName.toLowerCase()
      );

      const sortedVendorPurchases = [...vendorPurchases].sort((a, b) => {
        const timeA = new Date(a.purchase_date || a.created_at || 0).getTime();
        const timeB = new Date(b.purchase_date || b.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;

        const createdA = new Date(a.created_at || 0).getTime();
        const createdB = new Date(b.created_at || 0).getTime();
        if (createdA !== createdB) return createdA - createdB;

        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

      // 2. Fetch past payment vouchers for this vendor
      const { data: pastVouchers } = await supabase
        .from('financial_vouchers')
        .select('id, total_amount, original_invoice_no, metadata')
        .eq('customer_name', vendorName)
        .or('voucher_type.eq.Cash Payment Voucher,voucher_type.eq.Bank Payment Voucher,voucher_type.eq.Cash & Bank Payment Voucher');

      // Gross purchases total and initial paid
      let totalPurchasesGross = 0;
      let totalPurchasesUpfrontPaid = 0;

      vendorPurchases.forEach(p => {
        const gross = Number(p.total_amount) || 0;
        const paid = Number(p.cash_amount_paid || 0) + Number(p.bank_amount_paid || 0);
        totalPurchasesGross += gross;
        totalPurchasesUpfrontPaid += paid;
      });

      // Track PO allocations
      const allocations: Record<string, { gross: number; upfront: number; specificVouchers: number; generalAllocated: number; pastReceipts: number; due: number }> = {};
      let totalVouchersPaid = 0;
      let unallocatedGeneralVouchers = 0;

      // Initialize all POs
      sortedVendorPurchases.forEach(p => {
        const key = p.purchase_no;
        const gross = Number(p.total_amount) || 0;
        const upfront = Number(p.cash_amount_paid || 0) + Number(p.bank_amount_paid || 0);
        allocations[key] = {
          gross,
          upfront,
          specificVouchers: 0,
          generalAllocated: 0,
          pastReceipts: 0,
          due: Math.max(0, gross - upfront)
        };
      });

      // Assign PO-specific vouchers and accumulate general unallocated vouchers
      (pastVouchers || []).forEach(v => {
        if (currentEditVoucherId && v.id === currentEditVoucherId) return;
        const vAmt = Number(v.total_amount) || 0;
        totalVouchersPaid += vAmt;

        const vPoRef = v.original_invoice_no || v.metadata?.linkedPurchaseNo || '';
        if (vPoRef) {
          const cleanVPoId = String(vPoRef).replace(/\D/g, '');
          const matchedPo = sortedVendorPurchases.find(p => p.purchase_no === vPoRef || String(p.id) === cleanVPoId);
          if (matchedPo && allocations[matchedPo.purchase_no]) {
            allocations[matchedPo.purchase_no].specificVouchers += vAmt;
          } else {
            unallocatedGeneralVouchers += vAmt;
          }
        } else {
          unallocatedGeneralVouchers += vAmt;
        }
      });

      // 3. Fetch Debit Notes (Purchase Returns) for this vendor
      const { data: debitNotes } = await supabase
        .from('purchase_returns')
        .select('id, total_amount, amount_paid, purchase_no')
        .eq('vendor_name', vendorName);

      (debitNotes || []).forEach(d => {
        const dAmt = Math.max(0, (Number(d.total_amount) || 0) - (Number(d.amount_paid) || 0));
        if (dAmt <= 0) return;
        totalVouchersPaid += dAmt;

        const dPoRef = d.purchase_no || '';
        if (dPoRef) {
          const cleanDPoId = String(dPoRef).replace(/\D/g, '');
          const matchedPo = sortedVendorPurchases.find(p => p.purchase_no === dPoRef || String(p.id) === cleanDPoId);
          if (matchedPo && allocations[matchedPo.purchase_no]) {
            allocations[matchedPo.purchase_no].specificVouchers += dAmt;
          } else {
            unallocatedGeneralVouchers += dAmt;
          }
        } else {
          unallocatedGeneralVouchers += dAmt;
        }
      });

      // Extract overpayments (credits) from specifically overpaid POs and move them to the general unallocated pool
      sortedVendorPurchases.forEach(p => {
        const key = p.purchase_no;
        const alloc = allocations[key];
        if (alloc) {
          const rawDue = alloc.gross - alloc.upfront - alloc.specificVouchers;
          if (rawDue < 0) {
            const overpayment = Math.abs(rawDue);
            unallocatedGeneralVouchers += overpayment;
            alloc.specificVouchers -= overpayment;
          }
        }
      });

      // Allocate general unallocated vouchers across open POs (FIFO order)
      let generalRemaining = unallocatedGeneralVouchers;
      sortedVendorPurchases.forEach(p => {
        const key = p.purchase_no;
        const alloc = allocations[key];
        if (alloc) {
          const dueBeforeGeneral = Math.max(0, alloc.gross - alloc.upfront - alloc.specificVouchers);
          if (dueBeforeGeneral > 0 && generalRemaining > 0) {
            const toDistribute = Math.min(dueBeforeGeneral, generalRemaining);
            alloc.generalAllocated += toDistribute;
            generalRemaining -= toDistribute;
          }
          alloc.pastReceipts = alloc.specificVouchers + alloc.generalAllocated;
          alloc.due = alloc.gross - alloc.upfront - alloc.pastReceipts;
        }
      });

      setPoAllocationsMap(allocations);

      const netVendorLiability = totalPurchasesGross - totalPurchasesUpfrontPaid - totalVouchersPaid;
      setVendorTotalOutstanding(netVendorLiability);

      // If a specific PO is selected
      if (poNumber && allocations[poNumber]) {
        const currentAlloc = allocations[poNumber];
        setPoGrossBill(currentAlloc.gross);
        setPoPaidUpfront(currentAlloc.upfront);
        setPoPastReceiptsPaid(currentAlloc.pastReceipts);
        setEffectiveDueForThisReceipt(currentAlloc.due);
      } else {
        // No specific PO selected -> clearing from overall vendor balance
        setPoGrossBill(totalPurchasesGross);
        setPoPaidUpfront(totalPurchasesUpfrontPaid);
        setPoPastReceiptsPaid(totalVouchersPaid);
        setEffectiveDueForThisReceipt(netVendorLiability);
      }
    } catch (err: any) {
      console.error('Balance calculation error:', err);
    }
  };

  // Vendor selection handler
  const handleSelectVendor = (vendor: any) => {
    const vName = vendor.vendor_name;
    setSelectedVendor(vName);
    setVendorSearchQuery(vName);
    setSelectedVendorObj(vendor);
    setIsVendorDropdownOpen(false);

    setSelectedPurchaseNo('');
    setPoSearchQuery('-- General Vendor Balance Clearing (All Orders) --');
    setSelectedPurchaseObj(null);

    calculateVendorBalances(vName, '', purchaseOptions, editData?.id || null);
  };

  // PO selection handler
  const handleSelectPurchase = (poNo: string) => {
    setSelectedPurchaseNo(poNo);
    setPoSearchQuery(poNo || '-- General Vendor Balance Clearing (All Orders) --');
    setIsPoDropdownOpen(false);

    if (poNo) {
      const cleanId = String(poNo).replace(/\D/g, '');
      const poObj = purchaseOptions.find(p => p.purchase_no === poNo || String(p.id) === cleanId);
      setSelectedPurchaseObj(poObj || null);
    } else {
      setSelectedPurchaseObj(null);
    }

    calculateVendorBalances(selectedVendor, poNo, purchaseOptions, editData?.id || null);
  };

  // Filtered lists for autocomplete
  const filteredVendors = vendorOptions.filter(v =>
    (v.vendor_name || '').toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
    (v.contact_name || v.contact_person || '').toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
    (v.cell_no || v.phone_no || v.phone || '').toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
    (v.city || '').toLowerCase().includes(vendorSearchQuery.toLowerCase())
  );

  const vendorPurchasesList = purchaseOptions.filter(p => 
    selectedVendor && (p.supplier_name || p.vendor_name || '').toLowerCase() === selectedVendor.toLowerCase()
  );

  const filteredPurchases = vendorPurchasesList.filter(p => {
    if (!poSearchQuery || poSearchQuery.startsWith('-- General')) return true;
    return (
      (p.purchase_no || '').toLowerCase().includes(poSearchQuery.toLowerCase()) ||
      (p.purchase_date || '').toLowerCase().includes(poSearchQuery.toLowerCase()) ||
      (p.target_warehouse || '').toLowerCase().includes(poSearchQuery.toLowerCase())
    );
  });

  const validationSchema = Yup.object().shape({
    voucherNo: Yup.string().required('Receipt Voucher # is required'),
    voucherType: Yup.string().required('Payment method is required'),
    paymentDate: Yup.string().required('Payment date is required'),
    amount: Yup.number().when('voucherType', {
      is: (val: string) => val === 'By Cash' || val === 'By Bank',
      then: () => Yup.number().typeError('Amount must be a number').min(1, 'Amount must be greater than 0').required('Amount is required'),
      otherwise: () => Yup.number().nullable()
    }),
    cashAmount: Yup.number().when('voucherType', {
      is: 'Split',
      then: () => Yup.number().typeError('Cash must be numeric').min(0, 'Cannot be negative'),
      otherwise: () => Yup.number().nullable()
    }),
    bankAmount: Yup.number().when('voucherType', {
      is: 'Split',
      then: () => Yup.number().typeError('Bank must be numeric').min(0, 'Cannot be negative'),
      otherwise: () => Yup.number().nullable()
    }),
    selectedBankId: Yup.string().when('voucherType', {
      is: (val: string) => val === 'By Bank' || val === 'Split',
      then: () => Yup.string().required('Please select the source bank account'),
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
    <div className="mx-auto max-w-7xl text-xs text-slate-800 dark:text-slate-200">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MdOutlinePayment className="text-emerald-600" size={24} />
            {isEditMode ? 'Edit Vendor Purchase Receipt Voucher' : 'Log Vendor Outflow Purchase Receipt'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Disburse cash, bank wire, or split payments to settle supplier bills with automated FIFO ledger balancing
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Receipt/List`)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs"
        >
          <MdArrowBack size={16} /> Back to Receipts Log
        </button>
      </div>

      <Formik
        initialValues={isEditMode && editData ? {
          voucherNo: editData.voucher_no || '',
          voucherType: editData.voucher_type === 'Bank Payment Voucher' ? 'By Bank' : (editData.voucher_type === 'Cash & Bank Payment Voucher' || (editData.metadata?.cashAmount && editData.metadata?.bankAmount) ? 'Split' : 'By Cash'),
          selectedBankId: editData.metadata?.selectedBankId || '',
          paymentDate: editData.voucher_date || new Date().toISOString().split('T')[0],
          amount: editData.total_amount || '',
          cashAmount: editData.metadata?.cashAmount || '',
          bankAmount: editData.metadata?.bankAmount || '',
          notes: editData.narration || ''
        } : {
          voucherNo: generatedVoucherNo,
          voucherType: 'By Cash',
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

          if (values.voucherNo) {
            let query = supabase.from('financial_vouchers').select('id').eq('voucher_no', values.voucherNo);
            if (isEditMode && editData?.id) {
              query = query.neq('id', editData.id);
            }
            const { data: existingRecords, error: checkError } = await query;
            if (checkError) {
              toast.error('Failed to validate voucher number.');
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

          if (values.voucherType === 'By Cash') {
            cashPortion = Number(values.amount) || 0;
            finalAmount = cashPortion;
          } else if (values.voucherType === 'By Bank') {
            bankPortion = Number(values.amount) || 0;
            finalAmount = bankPortion;
            if (!values.selectedBankId) {
              toast.error('Please select the source bank account.');
              return;
            }
          } else if (values.voucherType === 'Split') {
            cashPortion = Number(values.cashAmount) || 0;
            bankPortion = Number(values.bankAmount) || 0;
            finalAmount = cashPortion + bankPortion;
            if (!values.selectedBankId && bankPortion > 0) {
              toast.error('Please select the source bank account for the bank transfer portion.');
              return;
            }
          }

          if (finalAmount <= 0) {
            toast.error('Please enter a valid disbursement amount greater than 0.');
            return;
          }

          if (finalAmount > effectiveDueForThisReceipt + 1) {
            toast.error(`Error: Disbursement amount (Rs. ${formatMoney(finalAmount)}) exceeds the total payable due (Rs. ${formatMoney(effectiveDueForThisReceipt)}).`);
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

            let balancedJournalItems: any[] = [];
            let voucherTypeRecord = 'Cash Payment Voucher';

            if (values.voucherType === 'By Cash') {
              voucherTypeRecord = 'Cash Payment Voucher';
              balancedJournalItems = [
                { accountCode: vendorAccountCode, description: `Settled balance due to ${selectedVendor}`, debit: finalAmount, credit: 0 },
                { accountCode: cashAccountCode, description: `Fund disbursed via ${values.voucherNo}`, debit: 0, credit: finalAmount }
              ];
            } else if (values.voucherType === 'By Bank') {
              voucherTypeRecord = 'Bank Payment Voucher';
              balancedJournalItems = [
                { accountCode: vendorAccountCode, description: `Settled balance due to ${selectedVendor}`, debit: finalAmount, credit: 0 },
                { accountCode: bankAccountCode, description: `Fund disbursed via ${values.voucherNo}`, debit: 0, credit: finalAmount }
              ];
            } else {
              voucherTypeRecord = 'Cash & Bank Payment Voucher';
              balancedJournalItems = [
                { accountCode: vendorAccountCode, description: `Settled balance due to ${selectedVendor}`, debit: finalAmount, credit: 0 },
                ...(cashPortion > 0 ? [{ accountCode: cashAccountCode, description: `Cash disbursement via ${values.voucherNo}`, debit: 0, credit: cashPortion }] : []),
                ...(bankPortion > 0 ? [{ accountCode: bankAccountCode, description: `Bank disbursement via ${values.voucherNo}`, debit: 0, credit: bankPortion }] : [])
              ];
            }

            const methodStr = values.voucherType === 'Split'
              ? ` | Split (Cash: Rs. ${formatMoney(cashPortion)} + Bank: Rs. ${formatMoney(bankPortion)} via ${selectedBankObj?.bankName || values.selectedBankId})`
              : (values.voucherType === 'By Bank' ? ` | Source Bank: ${selectedBankObj?.bankName || values.selectedBankId}` : ' | Mode: Cash Drawer');

            const poInfoStr = selectedPurchaseNo ? ` | Linked PO: ${selectedPurchaseNo}` : ' | General Vendor Settlement';
            const compositeNarration = `Paid to Vendor: ${selectedVendor}${poInfoStr}${methodStr} | Remarks: ${values.notes.trim()}`.trim();

            const payload = {
              voucher_no: values.voucherNo,
              voucher_type: voucherTypeRecord,
              voucher_date: values.paymentDate,
              customerName: selectedVendor,
              customer_name: selectedVendor,
              original_invoice_no: selectedPurchaseNo || null,
              narration: compositeNarration,
              notes: compositeNarration,
              total_amount: finalAmount,
              items: balancedJournalItems,
              metadata: { 
                selectedBankId: (values.voucherType === 'By Bank' || values.voucherType === 'Split') ? values.selectedBankId : null,
                selectedBankTitle: selectedBankObj ? `${selectedBankObj.bankName} - ${selectedBankObj.accountTitle}` : null,
                linkedPurchaseNo: selectedPurchaseNo || null,
                cashAmount: values.voucherType === 'Split' ? cashPortion : (values.voucherType === 'By Cash' ? finalAmount : 0),
                bankAmount: values.voucherType === 'Split' ? bankPortion : (values.voucherType === 'By Bank' ? finalAmount : 0),
                paymentTerm: values.voucherType,
                moduleSource: 'purchase_receipt'
              }
            };

            // Insert / Update in financial_vouchers
            if (isEditMode) {
              const { error: updateErr } = await supabase
                .from('financial_vouchers')
                .update(payload)
                .eq('id', editData.id);
              if (updateErr) throw updateErr;
            } else {
              const { error: insertErr } = await supabase
                .from('financial_vouchers')
                .insert([payload]);
              if (insertErr) throw insertErr;
            }

            // 2. Sync with supplier_purchases if a specific PO was linked
            if (selectedPurchaseNo) {
              const cleanId = String(selectedPurchaseNo).replace(/\D/g, '');
              const targetPo = purchaseOptions.find(p => p.purchase_no === selectedPurchaseNo || String(p.id) === cleanId);
              
              if (targetPo) {
                const { data: allVouchersForPo } = await supabase
                  .from('financial_vouchers')
                  .select('id, total_amount')
                  .eq('customer_name', selectedVendor)
                  .or(`original_invoice_no.eq.${selectedPurchaseNo},original_invoice_no.eq.${targetPo.purchase_no}`);

                const totalVoucherSum = (allVouchersForPo || []).reduce((acc: number, v: any) => acc + (Number(v.total_amount) || 0), 0);
                const upfrontPaid = Number(targetPo.cash_amount_paid || 0) + Number(targetPo.bank_amount_paid || 0);
                const newTotalPaid = upfrontPaid + totalVoucherSum;
                const newRemaining = Math.max(0, (Number(targetPo.total_amount) || 0) - newTotalPaid);

                await supabase
                  .from('supplier_purchases')
                  .update({
                    amount_paid: newTotalPaid,
                    remaining_balance: newRemaining
                  })
                  .eq('id', targetPo.id);
              }
            }

            toast.success(isEditMode ? 'Purchase payment voucher updated!' : 'Vendor payment receipt processed successfully!');
            navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Receipt/List`);
          } catch (err: any) {
            toast.error('Error processing payment: ' + err.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {({ handleChange, handleBlur, setFieldValue, values, errors, touched }) => {
          const currentTotalAmt = values.voucherType === 'Split'
            ? (Number(values.cashAmount || 0) + Number(values.bankAmount || 0))
            : (Number(values.amount) || 0);

          const projectedRemaining = effectiveDueForThisReceipt - currentTotalAmt;

          return (
            <Form className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* ── LEFT COLUMN: FORM INPUTS (7 COLS) ── */}
              <div className="lg:col-span-7 bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs space-y-5">
                
                {/* Row 1: Voucher # & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Receipt Voucher # <span className="text-rose-500">*</span>
                            </label>
                            <input
                              name="voucherNo"
                              value={values.voucherNo}
                              onChange={handleChange}
                              onBlur={handleBlur}
                              className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold bg-gray-50 dark:bg-slate-800 text-black dark:text-white outline-none focus:border-primary cursor-not-allowed ${
                                touched.voucherNo && errors.voucherNo ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                              }`}
                              placeholder="Auto-generated"
                              readOnly
                            />
                            {touched.voucherNo && errors.voucherNo && (
                              <div className="text-[10px] font-bold text-rose-500 mt-0.5 px-1">{errors.voucherNo as string}</div>
                            )}
                          </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                      Payment Date: *
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
                          calculateVendorBalances('', '', purchaseOptions, editData?.id || null);
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
                            setSelectedPurchaseNo('');
                            setPoSearchQuery('');
                            calculateVendorBalances('', '', purchaseOptions, editData?.id || null);
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

                {/* Row 3: Settle Specific Purchase Order (Searchable Autocomplete Input) */}
                {selectedVendor && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 relative" ref={poContainerRef}>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MdReceipt size={15} className="text-emerald-600" /> Settle Specific Purchase Order (Optional):
                      </span>
                      {selectedPurchaseNo && (
                        <button
                          type="button"
                          onClick={() => handleSelectPurchase('')}
                          className="text-[10px] text-emerald-600 hover:underline font-bold"
                        >
                          Clear Selection (Pay General Ledger)
                        </button>
                      )}
                    </label>

                    <div className="relative">
                      <input
                        type="text"
                        value={poSearchQuery}
                        onFocus={() => setIsPoDropdownOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlightedPoIndex(prev => Math.min(prev + 1, filteredPurchases.length));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedPoIndex(prev => Math.max(prev - 1, 0));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (highlightedPoIndex === 0) {
                              handleSelectPurchase('');
                            } else if (filteredPurchases[highlightedPoIndex - 1]) {
                              handleSelectPurchase(filteredPurchases[highlightedPoIndex - 1].purchase_no);
                            }
                          } else if (e.key === 'Escape') {
                            setIsPoDropdownOpen(false);
                          }
                        }}
                        onChange={(e) => {
                          setPoSearchQuery(e.target.value);
                          setIsPoDropdownOpen(true);
                          setHighlightedPoIndex(0);
                        }}
                        placeholder="Search PO # (e.g. PUR-275918), date, or warehouse..."
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 pr-10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600"
                      />

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {selectedPurchaseNo && (
                          <button
                            type="button"
                            onClick={() => handleSelectPurchase('')}
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <MdClear size={16} />
                          </button>
                        )}
                        <MdKeyboardArrowDown className="text-slate-400" size={18} />
                      </div>
                    </div>

                    {/* PO Autocomplete Dropdown */}
                    {isPoDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1.5 z-[9999] w-full max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                        {/* Option 1: General Vendor Balance Clearing */}
                        <div
                          onMouseEnter={() => setHighlightedPoIndex(0)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectPurchase('');
                          }}
                          className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${
                            highlightedPoIndex === 0 || !selectedPurchaseNo
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-xs">-- General Vendor Balance Clearing (All Orders) --</span>
                            <span className="text-[10px] text-slate-400">Automated FIFO allocation against oldest open bills</span>
                          </div>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            General
                          </span>
                        </div>

                        {/* PO List */}
                        {filteredPurchases.map((pur, pIdx) => {
                          const alloc = poAllocationsMap[pur.purchase_no];
                          const bill = alloc ? alloc.gross : (Number(pur.total_amount) || 0);
                          const due = alloc ? alloc.due : Math.max(0, bill - (Number(pur.cash_amount_paid || 0) + Number(pur.bank_amount_paid || 0)));

                          return (
                            <div
                              key={pur.id}
                              onMouseEnter={() => setHighlightedPoIndex(pIdx + 1)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectPurchase(pur.purchase_no);
                              }}
                              className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${
                                highlightedPoIndex === (pIdx + 1) || selectedPurchaseNo === pur.purchase_no
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono font-black text-xs text-emerald-700 dark:text-emerald-400">{pur.purchase_no}</span>
                                <span className="text-[10px] text-slate-400">
                                  {pur.purchase_date || 'N/A'} • {pur.target_warehouse || 'Main Warehouse'}
                                </span>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-slate-500 text-[10px] block">Bill: Rs. {formatMoney(bill)}</span>
                                <span className="text-rose-600 dark:text-rose-400 font-black text-xs">
                                  Due: Rs. {formatMoney(due)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Select a specific consignment order to clear its invoice balance, or leave on General Balance to disburse funds against the vendor's total liability.
                    </p>
                  </div>
                )}

                {/* Row 4: Disbursement Source with Split Payment */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                        Disbursement Source: *
                      </label>
                      <select
                        name="voucherType"
                        onChange={(e) => {
                          const val = e.target.value;
                          setFieldValue('voucherType', val);
                          if (val === 'Split') {
                            setFieldValue('cashAmount', '');
                            setFieldValue('bankAmount', '');
                          }
                        }}
                        value={values.voucherType}
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600"
                      >
                        <option value="By Cash">💵 Cash Drawer / Vault</option>
                        <option value="By Bank">🏦 Bank Wire / Online Transfer</option>
                        <option value="Split">💳 Split Payment (Cash + Bank)</option>
                      </select>
                    </div>

                    {(values.voucherType === 'By Bank' || values.voucherType === 'Split') && (
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                          Source Bank Account: *
                        </label>
                        <select
                          name="selectedBankId"
                          onChange={handleChange}
                          value={values.selectedBankId}
                          className={`w-full border rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs ${
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
                  {values.voucherType === 'Split' ? (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-emerald-700 dark:text-emerald-400 font-black uppercase text-[11px]">
                          Split Payment Breakdown (Cash + Bank): *
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
                              disabled={effectiveDueForThisReceipt <= 0}
                              className={`w-full border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-3 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white text-xs outline-none focus:border-emerald-600 ${effectiveDueForThisReceipt <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                              disabled={effectiveDueForThisReceipt <= 0}
                              className={`w-full border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-3 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white text-xs outline-none focus:border-emerald-600 ${effectiveDueForThisReceipt <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                          Disbursed Amount (PKR): *
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
                          disabled={effectiveDueForThisReceipt <= 0}
                          className={`w-full border rounded-xl py-3 pl-10 pr-4 bg-white dark:bg-slate-800 font-mono font-black text-slate-950 dark:text-white text-base outline-none ${
                            touched.amount && errors.amount ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                          } ${effectiveDueForThisReceipt <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Row 6: Remarks */}
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                    Transaction Remarks / Voucher Notes:
                  </label>
                  <textarea
                    name="notes"
                    rows={2}
                    onChange={handleChange}
                    value={values.notes}
                    placeholder="Enter cheque #, online transaction reference, or clearing notes..."
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 outline-none text-slate-900 dark:text-white text-xs focus:border-emerald-600"
                  />
                </div>

                {/* Submit / Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Receipt/List`)}
                    className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !selectedVendor}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-black text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Voucher' : 'Post & Disburse Receipt'}</span>}
                  </button>
                </div>

              </div>

              {/* ── RIGHT COLUMN: LIVE FINANCIAL BREAKDOWN (5 COLS) ── */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* 1. Vendor Profile Card */}
                <div className="bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <MdPerson className="text-emerald-600" size={16} /> Payee Vendor Profile
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
                      <p className="text-xs">Type or search a vendor on the left to inspect billing history</p>
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
                      {selectedPurchaseNo ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                          {selectedPurchaseNo}
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          General Ledger
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5 font-mono text-xs">
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span className="font-sans">Gross Billed Total:</span>
                        <strong className="text-slate-900 dark:text-white font-black text-sm">
                          Rs. {formatMoney(poGrossBill)}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                        <span className="font-sans">Paid Upfront:</span>
                        <span>Rs. {formatMoney(poPaidUpfront)}</span>
                      </div>

                      {poPastReceiptsPaid > 0 && (
                        <div className="flex justify-between items-center text-teal-700 dark:text-teal-400">
                          <span className="font-sans">Past Voucher Disbursements:</span>
                          <span>Rs. {formatMoney(poPastReceiptsPaid)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2.5 border-t border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 font-black">
                        <span className="font-sans">Current Outstanding Due:</span>
                        <strong className="text-base">Rs. {formatMoney(effectiveDueForThisReceipt)}</strong>
                      </div>

                      {/* Live Calculation */}
                      <div className="pt-3 border-t-2 border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex justify-between items-center text-slate-500 font-sans text-[11px]">
                          <span>Paying in this Voucher:</span>
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
                              {projectedRemaining <= 0 ? 'Fully Cleared & Settled' : 'Remaining Payable Balance'}
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
}

export default AddPurchaseReceipt;
