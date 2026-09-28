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

function AddInvoiceReceipt() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);

  const [customersList, setCustomersList] = useState<any[]>([]);
  const [salesInvoicesList, setSalesInvoicesList] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

  // Customer Autocomplete State
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedCustomerObj, setSelectedCustomerObj] = useState<any>(null);

  // Invoice Autocomplete State
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [isInvoiceDropdownOpen, setIsInvoiceDropdownOpen] = useState(false);
  const [highlightedInvoiceIndex, setHighlightedInvoiceIndex] = useState(0);
  const [selectedInvoiceNo, setSelectedInvoiceNo] = useState<string>('');
  const [selectedInvoiceObj, setSelectedInvoiceObj] = useState<any>(null);

  const [generatedVoucherNo, setGeneratedVoucherNo] = useState('');

  // Balances
  const [customerTotalOutstanding, setCustomerTotalOutstanding] = useState<number>(0);
  const [invGrossBill, setInvGrossBill] = useState<number>(0);
  const [invPaidUpfront, setInvPaidUpfront] = useState<number>(0);
  const [invPastReceiptsPaid, setInvPastReceiptsPaid] = useState<number>(0);
  const [invReturnsDeducted, setInvReturnsDeducted] = useState<number>(0);
  const [effectiveDueForThisReceipt, setEffectiveDueForThisReceipt] = useState<number>(0);
  const [invAllocationsMap, setInvAllocationsMap] = useState<Record<string, { gross: number; upfront: number; pastReceipts: number; returns: number; due: number }>>({});

  const customerContainerRef = useRef<HTMLDivElement>(null);
  const invoiceContainerRef = useRef<HTMLDivElement>(null);

  const editData = location.state?.receipt || location.state?.receiptRecord;
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

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerContainerRef.current && !customerContainerRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
      if (invoiceContainerRef.current && !invoiceContainerRef.current.contains(e.target as Node)) {
        setIsInvoiceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setMetadataLoading(true);

        // 1. Fetch Customers
        const { data: custData } = await supabase.from('customers').select('*');
        const normalizedCust = (custData || []).map((c: any) => ({
          ...c,
          customer_name: c.customerName || c.customername || c.customer_name || c.name || 'Unnamed Customer',
          contact_name: c.company || c.contact_person || c.contact_name || '',
          phone: c.primaryPhone || c.phone || c.cell_no || '',
          city: c.city || ''
        })).sort((a: any, b: any) => (a.customer_name || '').localeCompare(b.customer_name || ''));
        setCustomersList(normalizedCust);

        // 2. Fetch Banks & COA
        const { data: bankData } = await supabase.from('banks').select('id, bankName, accountTitle, accountNumber');
        const { data: coaData } = await supabase.from('chart_of_accounts').select('account_code, account_title, control_code, category_code');

        if (bankData) setBankAccounts(bankData);
        if (coaData) setCoaAccounts(coaData);

        // 3. Fetch Sales Invoices
        const { data: invData } = await supabase
          .from('sales_invoices')
          .select('*')
          .order('id', { ascending: false });

        if (invData) setSalesInvoicesList(invData);

        // If in Edit Mode, restore state
        if (isEditMode && editData) {
          const cName = editData.customerName || editData.customer_name || '';
          setSelectedCustomer(cName);
          setCustomerSearchQuery(cName);
          const matchedCust = normalizedCust.find(c => c.customer_name.toLowerCase() === cName.toLowerCase());
          if (matchedCust) setSelectedCustomerObj(matchedCust);

          const invRef = editData.original_invoice_no || editData.metadata?.linkedInvoiceNo || '';
          if (invRef) {
            setSelectedInvoiceNo(invRef);
            setInvoiceSearchQuery(invRef);
            const cleanId = String(invRef).replace(/\D/g, '');
            const matchedInv = invData?.find(i => 
              (i.invoice_no && i.invoice_no.toLowerCase() === invRef.toLowerCase()) ||
              String(i.id) === cleanId || 
              `INV-${String(i.id).padStart(4, '0')}`.toLowerCase() === invRef.toLowerCase()
            );
            if (matchedInv) setSelectedInvoiceObj(matchedInv);
          } else {
            setSelectedInvoiceNo('');
            setInvoiceSearchQuery('-- General Customer Balance Clearing (All Invoices) --');
            setSelectedInvoiceObj(null);
          }

          calculateCustomerBalances(cName, invRef, invData || [], editData.id);
        } else {
          setGeneratedVoucherNo(`CR-${Math.floor(100000 + Math.random() * 900000)}`);
        }
      } catch (err: any) {
        console.error(err.message);
        toast.error('Failed to load invoice receipt metadata: ' + err.message);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchMetadata();
  }, [isEditMode, editData]);

  // ── Calculate Live Balances for Customer & Selected Invoice ─────────────────
  const calculateCustomerBalances = async (
    custName: string, 
    invoiceRef: string, 
    allInvoices: any[], 
    currentEditVoucherId: number | null = null
  ) => {
    if (!custName) {
      setCustomerTotalOutstanding(0);
      setInvGrossBill(0);
      setInvPaidUpfront(0);
      setInvPastReceiptsPaid(0);
      setInvReturnsDeducted(0);
      setEffectiveDueForThisReceipt(0);
      setInvAllocationsMap({});
      return;
    }

    try {
      // 1. Fetch customer's invoices sorted chronologically (oldest first for FIFO general clearing)
      const customerInvoices = allInvoices.filter(i => 
        (i.customer_name || i.customerName || '').toLowerCase() === custName.toLowerCase()
      );

      const sortedCustomerInvoices = [...customerInvoices].sort((a, b) => {
        const timeA = new Date(a.invoice_date || a.created_at || 0).getTime();
        const timeB = new Date(b.invoice_date || b.created_at || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;

        const createdA = new Date(a.created_at || 0).getTime();
        const createdB = new Date(b.created_at || 0).getTime();
        if (createdA !== createdB) return createdA - createdB;

        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

      // 2. Fetch past receipt vouchers for this customer
      const { data: pastVouchers } = await supabase
        .from('financial_vouchers')
        .select('id, total_amount, original_invoice_no, metadata')
        .eq('customer_name', custName)
        .or('voucher_type.eq.Cash Receipt Voucher,voucher_type.eq.Bank Receipt Voucher,voucher_type.eq.Cash & Bank Receipt Voucher');

      // 3. Fetch sales returns for this customer
      const { data: salesReturns } = await supabase
        .from('sales_returns')
        .select('id, total_amount, original_invoice_no, customer_name');

      const customerReturns = (salesReturns || []).filter(r => 
        (r.customer_name || '').toLowerCase() === custName.toLowerCase()
      );

      // Gross invoices total and upfront paid
      let totalInvoicesGross = 0;
      let totalInvoicesUpfrontPaid = 0;
      let totalCustomerReturns = 0;

      customerReturns.forEach(r => {
        totalCustomerReturns += Number(r.total_amount) || 0;
      });

      customerInvoices.forEach(i => {
        const gross = Number(i.total_amount) || 0;
        const paid = Number(i.cash_amount_paid || 0) + Number(i.bank_amount || 0);
        totalInvoicesGross += gross;
        totalInvoicesUpfrontPaid += paid;
      });

      // Track Invoice allocations
      const allocations: Record<string, { gross: number; upfront: number; returns: number; specificVouchers: number; generalAllocated: number; pastReceipts: number; due: number }> = {};
      let totalVouchersPaid = 0;
      let unallocatedGeneralVouchers = 0;

      // Initialize each Invoice allocation by unique invoice ID and actual invoice_no
      sortedCustomerInvoices.forEach(i => {
        const invId = String(i.id);
        const actualNo = String(i.invoice_no || `INV-${invId.padStart(4, '0')}`).trim();
        const gross = Number(i.total_amount) || 0;
        const upfront = Number(i.cash_amount_paid || 0) + Number(i.bank_amount || 0);

        // Find returns for this specific invoice
        const invoiceReturns = customerReturns.filter(r => {
          const rInv = String(r.original_invoice_no || '').trim().toLowerCase();
          return rInv === invId.toLowerCase() ||
                 (actualNo && rInv === actualNo.toLowerCase()) ||
                 rInv === `inv-${invId.padStart(4, '0')}`.toLowerCase() ||
                 rInv.replace(/\D/g, '') === invId;
        }).reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);

        allocations[invId] = {
          gross,
          upfront,
          returns: invoiceReturns,
          specificVouchers: 0,
          generalAllocated: 0,
          pastReceipts: 0,
          due: Math.max(0, gross - upfront - invoiceReturns)
        };
      });

      // Assign Invoice-specific vouchers and accumulate general unallocated vouchers
      (pastVouchers || []).forEach(v => {
        if (currentEditVoucherId && v.id === currentEditVoucherId) return;
        const vAmt = Number(v.total_amount) || 0;
        totalVouchersPaid += vAmt;

        const vInvRef = String(v.original_invoice_no || v.metadata?.linkedInvoiceNo || '').trim();
        if (vInvRef) {
          const cleanInvId = vInvRef.replace(/\D/g, '');
          const matchedInv = sortedCustomerInvoices.find(i => 
            (i.invoice_no && i.invoice_no.toLowerCase() === vInvRef.toLowerCase()) ||
            String(i.id) === vInvRef ||
            String(i.id) === cleanInvId ||
            `INV-${String(i.id).padStart(4, '0')}`.toLowerCase() === vInvRef.toLowerCase()
          );

          if (matchedInv && allocations[String(matchedInv.id)]) {
            allocations[String(matchedInv.id)].specificVouchers += vAmt;
          } else {
            unallocatedGeneralVouchers += vAmt;
          }
        } else {
          unallocatedGeneralVouchers += vAmt;
        }
      });

      // Allocate general unallocated vouchers across open Invoices (FIFO order)
      let generalRemaining = unallocatedGeneralVouchers;
      sortedCustomerInvoices.forEach(i => {
        const invId = String(i.id);
        const alloc = allocations[invId];
        if (alloc) {
          const dueBeforeGeneral = Math.max(0, alloc.gross - alloc.upfront - alloc.returns - alloc.specificVouchers);
          if (dueBeforeGeneral > 0 && generalRemaining > 0) {
            const toDistribute = Math.min(dueBeforeGeneral, generalRemaining);
            alloc.generalAllocated += toDistribute;
            generalRemaining -= toDistribute;
          }
          alloc.pastReceipts = alloc.specificVouchers + alloc.generalAllocated;
          alloc.due = Math.max(0, alloc.gross - alloc.upfront - alloc.returns - alloc.pastReceipts);
        }
      });

      // Create multi-key map for easy lookup by either '5', actual 'TESTING-01', or 'INV-0005'
      const finalMap: Record<string, typeof allocations[string]> = {};
      sortedCustomerInvoices.forEach(i => {
        const invId = String(i.id);
        const actualNo = String(i.invoice_no || `INV-${invId.padStart(4, '0')}`).trim();
        const formattedKey = `INV-${invId.padStart(4, '0')}`;
        finalMap[invId] = allocations[invId];
        finalMap[formattedKey] = allocations[invId];
        finalMap[formattedKey.toLowerCase()] = allocations[invId];
        if (actualNo) {
          finalMap[actualNo] = allocations[invId];
          finalMap[actualNo.toLowerCase()] = allocations[invId];
        }
      });

      setInvAllocationsMap(finalMap);

      const netCustomerReceivable = Math.max(0, totalInvoicesGross - totalInvoicesUpfrontPaid - totalCustomerReturns - totalVouchersPaid);
      setCustomerTotalOutstanding(netCustomerReceivable);

      // If a specific Invoice is selected
      const cleanRefId = String(invoiceRef).replace(/\D/g, '');
      const selectedAlloc = finalMap[invoiceRef] || (invoiceRef && finalMap[invoiceRef.toLowerCase()]) || finalMap[cleanRefId];

      if (invoiceRef && selectedAlloc) {
        setInvGrossBill(selectedAlloc.gross);
        setInvPaidUpfront(selectedAlloc.upfront);
        setInvReturnsDeducted(selectedAlloc.returns);
        setInvPastReceiptsPaid(selectedAlloc.pastReceipts);
        setEffectiveDueForThisReceipt(selectedAlloc.due);
      } else {
        // General Customer Balance Clearing
        setInvGrossBill(totalInvoicesGross);
        setInvPaidUpfront(totalInvoicesUpfrontPaid);
        setInvReturnsDeducted(totalCustomerReturns);
        setInvPastReceiptsPaid(totalVouchersPaid);
        setEffectiveDueForThisReceipt(netCustomerReceivable);
      }
    } catch (err: any) {
      console.error('Balance calculation error:', err);
    }
  };

  // Customer selection handler
  const handleSelectCustomer = (customer: any) => {
    const cName = customer.customer_name;
    setSelectedCustomer(cName);
    setCustomerSearchQuery(cName);
    setSelectedCustomerObj(customer);
    setIsCustomerDropdownOpen(false);

    setSelectedInvoiceNo('');
    setInvoiceSearchQuery('-- General Customer Balance Clearing (All Invoices) --');
    setSelectedInvoiceObj(null);

    calculateCustomerBalances(cName, '', salesInvoicesList, editData?.id || null);
  };

  // Invoice selection handler
  const handleSelectInvoice = (invNo: string) => {
    setSelectedInvoiceNo(invNo);
    setInvoiceSearchQuery(invNo || '-- General Customer Balance Clearing (All Invoices) --');
    setIsInvoiceDropdownOpen(false);

    if (invNo) {
      const cleanId = String(invNo).replace(/\D/g, '');
      const invObj = salesInvoicesList.find(i => 
        (i.invoice_no && i.invoice_no.toLowerCase() === invNo.toLowerCase()) ||
        String(i.id) === cleanId || 
        `INV-${String(i.id).padStart(4, '0')}`.toLowerCase() === invNo.toLowerCase()
      );
      setSelectedInvoiceObj(invObj || null);
    } else {
      setSelectedInvoiceObj(null);
    }

    calculateCustomerBalances(selectedCustomer, invNo, salesInvoicesList, editData?.id || null);
  };

  // Filtered lists for autocomplete
  const filteredCustomers = customersList.filter(c =>
    (c.customer_name || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.contact_name || c.contact_person || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.cell_no || c.phone_no || c.phone || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.city || '').toLowerCase().includes(customerSearchQuery.toLowerCase())
  );

  const customerInvoicesList = salesInvoicesList.filter(i => 
    selectedCustomer && (i.customer_name || i.customerName || '').toLowerCase() === selectedCustomer.toLowerCase()
  );

  const filteredInvoices = customerInvoicesList.filter(i => {
    if (!invoiceSearchQuery || invoiceSearchQuery.startsWith('-- General')) return true;
    const actualNo = String(i.invoice_no || `INV-${String(i.id).padStart(4, '0')}`);
    const q = invoiceSearchQuery.toLowerCase();
    return (
      actualNo.toLowerCase().includes(q) ||
      String(i.id).includes(q) ||
      (i.gate_pass_no || '').toLowerCase().includes(q) ||
      (i.invoice_date || '').toLowerCase().includes(q) ||
      (i.dispatch_warehouse || '').toLowerCase().includes(q)
    );
  });

  const validationSchema = Yup.object().shape({
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
      then: () => Yup.string().required('Please select the target bank account'),
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
            <MdOutlinePayment className="text-primary" size={24} />
            {isEditMode ? 'Edit Customer Sales Invoice Receipt' : 'Log Customer Sales Invoice Receipt'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Collect cash, bank wire, or split payments from customers with automated FIFO invoice balancing
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/List`)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs"
        >
          <MdArrowBack size={16} /> Back to Receipts Log
        </button>
      </div>

      <Formik
        initialValues={isEditMode && editData ? {
          voucherNo: editData.voucher_no || '',
          voucherType: editData.voucher_type === 'Bank Receipt Voucher' ? 'By Bank' : (editData.voucher_type === 'Cash & Bank Receipt Voucher' || (editData.metadata?.cashAmount && editData.metadata?.bankAmount) ? 'Split' : 'By Cash'),
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
          if (!selectedCustomer) {
            toast.error('Validation Error: Please select a customer first!');
            return;
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
              toast.error('Please select the target bank account.');
              return;
            }
          } else if (values.voucherType === 'Split') {
            cashPortion = Number(values.cashAmount) || 0;
            bankPortion = Number(values.bankAmount) || 0;
            finalAmount = cashPortion + bankPortion;
            if (!values.selectedBankId && bankPortion > 0) {
              toast.error('Please select the target bank account for the bank transfer portion.');
              return;
            }
          }

          if (finalAmount <= 0) {
            toast.error('Please enter a valid collection amount greater than 0.');
            return;
          }

          if (effectiveDueForThisReceipt > 0 && finalAmount > effectiveDueForThisReceipt + 1) {
            toast.error(`Overpayment Warning: Total customer receivable due is Rs. ${formatMoney(effectiveDueForThisReceipt)}.`);
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

            const recvCoa = coaAccounts.find((c: any) =>
              String(c.control_code || '').toLowerCase().includes('debtor') ||
              String(c.control_code || '').toLowerCase().includes('receivable') ||
              String(c.account_title || '').toLowerCase().includes('receivable') ||
              String(c.account_title || '').toLowerCase().includes('debtor')
            );

            const customerAccountCode = recvCoa ? String(recvCoa.account_code) : '1020';
            const cashAccountCode = cashCoa ? String(cashCoa.account_code) : '1010';
            const bankAccountCode = bankCoa ? String(bankCoa.account_code) : (selectedBankObj?.accountNumber || '1015');

            let balancedJournalItems: any[] = [];
            let voucherTypeRecord = 'Cash Receipt Voucher';

            if (values.voucherType === 'By Cash') {
              voucherTypeRecord = 'Cash Receipt Voucher';
              balancedJournalItems = [
                { accountCode: cashAccountCode, description: `Collection received via ${values.voucherNo}`, debit: finalAmount, credit: 0 },
                { accountCode: customerAccountCode, description: `Received from Customer ${selectedCustomer}`, debit: 0, credit: finalAmount }
              ];
            } else if (values.voucherType === 'By Bank') {
              voucherTypeRecord = 'Bank Receipt Voucher';
              balancedJournalItems = [
                { accountCode: bankAccountCode, description: `Bank wire received via ${values.voucherNo}`, debit: finalAmount, credit: 0 },
                { accountCode: customerAccountCode, description: `Received from Customer ${selectedCustomer}`, debit: 0, credit: finalAmount }
              ];
            } else {
              voucherTypeRecord = 'Cash & Bank Receipt Voucher';
              balancedJournalItems = [
                ...(cashPortion > 0 ? [{ accountCode: cashAccountCode, description: `Cash collection via ${values.voucherNo}`, debit: cashPortion, credit: 0 }] : []),
                ...(bankPortion > 0 ? [{ accountCode: bankAccountCode, description: `Bank wire collection via ${values.voucherNo}`, debit: bankPortion, credit: 0 }] : []),
                { accountCode: customerAccountCode, description: `Received from Customer ${selectedCustomer}`, debit: 0, credit: finalAmount }
              ];
            }

            const methodStr = values.voucherType === 'Split'
              ? ` | Split (Cash: Rs. ${formatMoney(cashPortion)} + Bank: Rs. ${formatMoney(bankPortion)} via ${selectedBankObj?.bankName || values.selectedBankId})`
              : (values.voucherType === 'By Bank' ? ` | Target Bank: ${selectedBankObj?.bankName || values.selectedBankId}` : ' | Mode: Cash Counter');

            const invInfoStr = selectedInvoiceNo ? ` | Linked Invoice: ${selectedInvoiceNo}` : ' | General Customer Ledger Collection';
            const compositeNarration = `Received from Customer: ${selectedCustomer}${invInfoStr}${methodStr} | Remarks: ${values.notes.trim()}`.trim();

            const payload = {
              voucher_no: values.voucherNo,
              voucher_type: voucherTypeRecord,
              voucher_date: values.paymentDate,
              customerName: selectedCustomer,
              customer_name: selectedCustomer,
              original_invoice_no: selectedInvoiceNo || null,
              narration: compositeNarration,
              notes: compositeNarration,
              total_amount: finalAmount,
              items: balancedJournalItems,
              metadata: { 
                selectedBankId: (values.voucherType === 'By Bank' || values.voucherType === 'Split') ? values.selectedBankId : null,
                selectedBankTitle: selectedBankObj ? `${selectedBankObj.bankName} - ${selectedBankObj.accountTitle}` : null,
                linkedInvoiceNo: selectedInvoiceNo || null,
                cashAmount: values.voucherType === 'Split' ? cashPortion : (values.voucherType === 'By Cash' ? finalAmount : 0),
                bankAmount: values.voucherType === 'Split' ? bankPortion : (values.voucherType === 'By Bank' ? finalAmount : 0),
                paymentTerm: values.voucherType,
                moduleSource: 'sales_receipt'
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

            // Sync with sales_invoices status if specific invoice was selected
            if (selectedInvoiceNo) {
              const cleanId = String(selectedInvoiceNo).replace(/\D/g, '');
              const targetInv = salesInvoicesList.find(i => 
                (i.invoice_no && i.invoice_no.toLowerCase() === selectedInvoiceNo.toLowerCase()) ||
                String(i.id) === cleanId || 
                `INV-${String(i.id).padStart(4, '0')}`.toLowerCase() === selectedInvoiceNo.toLowerCase()
              );
              if (targetInv) {
                const targetAlloc = invAllocationsMap[selectedInvoiceNo] || (selectedInvoiceNo && invAllocationsMap[selectedInvoiceNo.toLowerCase()]) || invAllocationsMap[cleanId];
                const newRemainingDue = Math.max(0, (targetAlloc ? targetAlloc.due : 0) - finalAmount);
                if (newRemainingDue <= 0.01) {
                  await supabase.from('sales_invoices').update({ receipt_status: 'SETTLED' }).eq('id', targetInv.id);
                }
              }
            }

            toast.success(isEditMode ? 'Customer receipt voucher updated!' : 'Customer sales receipt logged successfully!');
            navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/List`);
          } catch (err: any) {
            toast.error('Error processing sales receipt: ' + err.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {({ handleChange, handleBlur, setFieldValue, values, errors, touched }) => {
          const currentTotalAmt = values.voucherType === 'Split'
            ? (Number(values.cashAmount || 0) + Number(values.bankAmount || 0))
            : (Number(values.amount) || 0);

          const projectedRemaining = Math.max(0, effectiveDueForThisReceipt - currentTotalAmt);

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
                      Collection Date: *
                    </label>
                    <input
                      type="date"
                      name="paymentDate"
                      onChange={handleChange}
                      value={values.paymentDate}
                      className={`w-full border rounded-xl p-2.5 bg-slate-50/50 dark:bg-slate-800 font-bold outline-none text-slate-900 dark:text-white text-xs ${
                        touched.paymentDate && errors.paymentDate ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-primary'
                      }`}
                    />
                  </div>
                </div>

                {/* Row 2: Target Customer (Searchable Autocomplete Input) */}
                <div className="relative" ref={customerContainerRef}>
                  <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1 flex items-center gap-1.5">
                    <MdPerson size={15} className="text-primary" /> Target Customer / Client Account: *
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
                          calculateCustomerBalances('', '', salesInvoicesList, editData?.id || null);
                        }
                      }}
                      placeholder="Type to search customer name, contact, phone, or city..."
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 pr-10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {selectedCustomer && !isEditMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomer('');
                            setCustomerSearchQuery('');
                            setSelectedCustomerObj(null);
                            setSelectedInvoiceNo('');
                            setInvoiceSearchQuery('');
                            calculateCustomerBalances('', '', salesInvoicesList, editData?.id || null);
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
                              highlightedCustomerIndex === cIdx || selectedCustomer === cust.customer_name
                                ? 'bg-primary/10 text-primary font-bold'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-bold">{cust.customer_name}</span>
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
                          No matching customer profiles found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Row 3: Settle Specific Sale Invoice (Searchable Autocomplete Input) */}
                {selectedCustomer && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 relative" ref={invoiceContainerRef}>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MdReceipt size={15} className="text-primary" /> Settle Specific Sale Invoice (Optional):
                      </span>
                      {selectedInvoiceNo && (
                        <button
                          type="button"
                          onClick={() => handleSelectInvoice('')}
                          className="text-[10px] text-primary hover:underline font-bold"
                        >
                          Clear Selection (Pay General Ledger)
                        </button>
                      )}
                    </label>

                    <div className="relative">
                      <input
                        type="text"
                        value={invoiceSearchQuery}
                        onFocus={() => setIsInvoiceDropdownOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlightedInvoiceIndex(prev => Math.min(prev + 1, filteredInvoices.length));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedInvoiceIndex(prev => Math.max(prev - 1, 0));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (highlightedInvoiceIndex === 0) {
                              handleSelectInvoice('');
                            } else if (filteredInvoices[highlightedInvoiceIndex - 1]) {
                              const inv = filteredInvoices[highlightedInvoiceIndex - 1];
                              const actualNo = inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`;
                              handleSelectInvoice(actualNo);
                            }
                          } else if (e.key === 'Escape') {
                            setIsInvoiceDropdownOpen(false);
                          }
                        }}
                        onChange={(e) => {
                          setInvoiceSearchQuery(e.target.value);
                          setIsInvoiceDropdownOpen(true);
                          setHighlightedInvoiceIndex(0);
                        }}
                        placeholder="Search Invoice # (e.g. TESTING-01), date, or warehouse..."
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 pr-10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-primary"
                      />

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {selectedInvoiceNo && (
                          <button
                            type="button"
                            onClick={() => handleSelectInvoice('')}
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <MdClear size={16} />
                          </button>
                        )}
                        <MdKeyboardArrowDown className="text-slate-400" size={18} />
                      </div>
                    </div>

                    {/* Invoice Autocomplete Dropdown */}
                    {isInvoiceDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1.5 z-[9999] w-full max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                        {/* Option 1: General Customer Balance Clearing */}
                        <div
                          onMouseEnter={() => setHighlightedInvoiceIndex(0)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectInvoice('');
                          }}
                          className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${
                            highlightedInvoiceIndex === 0 || !selectedInvoiceNo
                              ? 'bg-primary/10 text-primary font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-xs">-- General Customer Balance Clearing (All Invoices) --</span>
                            <span className="text-[10px] text-slate-400">Automated FIFO allocation against oldest open customer bills</span>
                          </div>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            General
                          </span>
                        </div>

                        {/* Invoice List */}
                        {filteredInvoices.map((inv, iIdx) => {
                          const invFormatted = inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`;
                          const alloc = invAllocationsMap[invFormatted] || (invFormatted && invAllocationsMap[invFormatted.toLowerCase()]) || invAllocationsMap[String(inv.id)];
                          const bill = alloc ? alloc.gross : (Number(inv.total_amount) || 0);
                          const due = alloc ? alloc.due : Math.max(0, bill - (Number(inv.cash_amount_paid || 0) + Number(inv.bank_amount || 0)));

                          return (
                            <div
                              key={inv.id}
                              onMouseEnter={() => setHighlightedInvoiceIndex(iIdx + 1)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectInvoice(invFormatted);
                              }}
                              className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${
                                highlightedInvoiceIndex === (iIdx + 1) || selectedInvoiceNo === invFormatted
                                  ? 'bg-primary/10 text-primary font-bold'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono font-black text-xs text-primary">{invFormatted}</span>
                                <span className="text-[10px] text-slate-400">
                                  {inv.invoice_date || 'N/A'} • {inv.dispatch_warehouse || 'Main Warehouse'}
                                </span>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-slate-500 text-[10px] block">Billed: Rs. {formatMoney(bill)}</span>
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
                      Select a specific sales invoice to clear its balance, or leave on General Balance to collect funds against the customer's total running ledger.
                    </p>
                  </div>
                )}

                {/* Row 4: Settlement Mode with Split Payment */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                        Collection Channel: *
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
                          // Dynamically change voucher prefix
                          let newPrefix = 'CR';
                          if (val === 'By Bank') newPrefix = 'BR';
                          else if (val === 'Split') newPrefix = 'CBR';
                          
                          const currentVoucherNo = values.voucherNo || '';
                          const newVoucherNo = currentVoucherNo.replace(/^(CR|BR|CBR)-/, `${newPrefix}-`);
                          if (newVoucherNo !== currentVoucherNo) {
                            setFieldValue('voucherNo', newVoucherNo);
                          } else if (!currentVoucherNo) {
                            setFieldValue('voucherNo', `${newPrefix}-${Math.floor(100000 + Math.random() * 900000)}`);
                          }
                        }}
                        value={values.voucherType}
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-primary"
                      >
                        <option value="By Cash">💵 Cash Counter / Drawer</option>
                        <option value="By Bank">🏦 Bank Wire / Online Deposit</option>
                        <option value="Split">💳 Split Payment (Cash + Bank)</option>
                      </select>
                    </div>

                    {(values.voucherType === 'By Bank' || values.voucherType === 'Split') && (
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                          Receiving Bank Account: *
                        </label>
                        <select
                          name="selectedBankId"
                          onChange={handleChange}
                          value={values.selectedBankId}
                          className={`w-full border rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs ${
                            touched.selectedBankId && errors.selectedBankId ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-primary'
                          }`}
                        >
                          <option value="">-- Choose Deposited Bank --</option>
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
                        <label className="block text-primary font-black uppercase text-[11px]">
                          Split Collection Breakdown (Cash + Bank): *
                        </label>
                        {effectiveDueForThisReceipt > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const half = Math.floor(effectiveDueForThisReceipt / 2);
                              setFieldValue('cashAmount', half);
                              setFieldValue('bankAmount', effectiveDueForThisReceipt - half);
                            }}
                            className="text-[11px] font-black text-primary hover:underline cursor-pointer"
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
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-3 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white text-xs outline-none focus:border-primary"
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
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-3 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white text-xs outline-none focus:border-primary"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                        <span className="font-bold text-slate-600 dark:text-slate-400">Total Collected in this Voucher:</span>
                        <strong className="font-mono font-black text-sm text-primary">
                          Rs. {formatMoney(Number(values.cashAmount || 0) + Number(values.bankAmount || 0))}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-primary font-black uppercase text-[11px]">
                          Collected Amount (PKR): *
                        </label>
                        {effectiveDueForThisReceipt > 0 && (
                          <button
                            type="button"
                            onClick={() => setFieldValue('amount', effectiveDueForThisReceipt)}
                            className="text-[11px] font-black text-primary hover:underline cursor-pointer flex items-center gap-1"
                          >
                            ⚡ Settle Full Due (Rs. {formatMoney(effectiveDueForThisReceipt)})
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
                            touched.amount && errors.amount ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/20'
                          }`}
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
                    placeholder="Enter deposit slip #, cheque #, online transaction reference, or clearing notes..."
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 outline-none text-slate-900 dark:text-white text-xs focus:border-primary"
                  />
                </div>

                {/* Submit / Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/List`)}
                    className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !selectedCustomer}
                    className="rounded-xl bg-primary hover:bg-primary/90 py-3 px-8 font-black text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Voucher' : 'Post & Collect Receipt'}</span>}
                  </button>
                </div>

              </div>

              {/* ── RIGHT COLUMN: LIVE FINANCIAL BREAKDOWN (5 COLS) ── */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* 1. Customer Profile Card */}
                <div className="bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <MdPerson className="text-primary" size={16} /> Customer Account Coordinates
                  </div>

                  {selectedCustomer ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Customer:</span>
                        <strong className="text-slate-950 dark:text-white font-bold text-sm">{selectedCustomer}</strong>
                      </div>
                      {selectedCustomerObj?.contact_name && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Contact Person:</span>
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
                          <span className="text-slate-700 dark:text-slate-300 text-right max-w-[60%]">{selectedCustomerObj.address} {selectedCustomerObj.city ? `(${selectedCustomerObj.city})` : ''}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400">
                      <MdInfoOutline className="mx-auto mb-1 text-slate-300" size={24} />
                      <p className="text-xs">Type or search a customer on the left to inspect ledger history</p>
                    </div>
                  )}
                </div>

                {/* 2. Interactive Settlement & Balance Card */}
                {selectedCustomer && (
                  <div className="bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        <MdAccountBalance className="text-primary" size={16} /> Receivable Settlement Breakdown
                      </div>
                      {selectedInvoiceNo ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono">
                          {selectedInvoiceNo}
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
                          Rs. {formatMoney(invGrossBill)}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center text-red-700 dark:text-red-400">
                        <span className="font-sans">Paid Upfront at Billing:</span>
                        <span>Rs. {formatMoney(invPaidUpfront)}</span>
                      </div>

                      {invReturnsDeducted > 0 && (
                        <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                          <span className="font-sans">Sales Returns Deducted:</span>
                          <span>- Rs. {formatMoney(invReturnsDeducted)}</span>
                        </div>
                      )}

                      {invPastReceiptsPaid > 0 && (
                        <div className="flex justify-between items-center text-rose-700 dark:text-rose-400">
                          <span className="font-sans">Past Voucher Collections:</span>
                          <span>Rs. {formatMoney(invPastReceiptsPaid)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2.5 border-t border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 font-black">
                        <span className="font-sans">Current Outstanding Due:</span>
                        <strong className="text-base">Rs. {formatMoney(effectiveDueForThisReceipt)}</strong>
                      </div>

                      {/* Live Calculation */}
                      <div className="pt-3 border-t-2 border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex justify-between items-center text-slate-500 font-sans text-[11px]">
                          <span>Collecting in this Voucher:</span>
                          <strong className="font-mono text-primary font-bold">
                            - Rs. {formatMoney(currentTotalAmt)}
                          </strong>
                        </div>

                        <div className={`p-3 rounded-xl border flex justify-between items-center ${
                          projectedRemaining <= 0
                            ? 'bg-red-50 dark:bg-red-950/30 border-red-300 text-red-900 dark:text-red-300'
                            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 text-amber-900 dark:text-amber-300'
                        }`}>
                          <div className="font-sans">
                            <span className="block text-[10px] font-black uppercase tracking-wider">
                              Balance After Collection:
                            </span>
                            <span className="text-[11px] font-medium">
                              {projectedRemaining <= 0 ? 'Fully Cleared & Settled' : 'Remaining Customer Debt'}
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

export default AddInvoiceReceipt;
