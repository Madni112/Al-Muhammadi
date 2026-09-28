import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { 
  MdStore, 
  MdPerson, 
  MdReceipt, 
  MdEvent, 
  MdDelete, 
  MdAdd, 
  MdSearch, 
  MdClear, 
  MdArrowBack, 
  MdAccountBalance, 
  MdKeyboardArrowDown,
  MdOutlinePayment
} from 'react-icons/md';
import { FiPrinter } from 'react-icons/fi';

const AddSalesReturn = () => {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeId } = useParams<{ id?: string }>();

  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);

  const [customers, setCustomers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [bankAccountsList, setBankAccountsList] = useState<any[]>([]);
  const [salesInvoicesList, setSalesInvoicesList] = useState<any[]>([]);

  // Warehouse Autocomplete State (Top Filter)
  const [warehouseSearchQuery, setWarehouseSearchQuery] = useState('');
  const [isWarehouseDropdownOpen, setIsWarehouseDropdownOpen] = useState(false);
  const [highlightedWarehouseIndex, setHighlightedWarehouseIndex] = useState(0);

  // Customer Autocomplete State
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(0);

  // Invoice Autocomplete State
  const [invSearchQuery, setInvSearchQuery] = useState('');
  const [isInvDropdownOpen, setIsInvDropdownOpen] = useState(false);
  const [highlightedInvIndex, setHighlightedInvIndex] = useState(0);
  const [selectedInvNo, setSelectedInvNo] = useState('');
  const [selectedInvObj, setSelectedInvObj] = useState<any>(null);

  // SKU & Product Search States per row
  const [activeSkuIndex, setActiveSkuIndex] = useState<number | null>(null);
  const [highlightedSkuIndex, setHighlightedSkuIndex] = useState(0);

  const [activeProdNameIndex, setActiveProdNameIndex] = useState<number | null>(null);
  const [highlightedProdNameIndex, setHighlightedProdNameIndex] = useState(0);

  const [activeRowWhIndex, setActiveRowWhIndex] = useState<number | null>(null);
  const [highlightedRowWhIndex, setHighlightedRowWhIndex] = useState(0);

  const warehouseContainerRef = useRef<HTMLDivElement>(null);
  const customerContainerRef = useRef<HTMLDivElement>(null);
  const invContainerRef = useRef<HTMLDivElement>(null);

  const [fetchedEditRecord, setFetchedEditRecord] = useState<any>(null);

  const rawStateData = location.state?.returnData || 
                       location.state?.editData || 
                       location.state?.returnRecord || 
                       location.state?.invoice || 
                       location.state?.item || 
                       location.state?.record;

  const editData = rawStateData || fetchedEditRecord;

  const isEditMode = !!editData && (
    editData.hasOwnProperty('original_invoice_no') ||
    editData.hasOwnProperty('return_no') ||
    editData.hasOwnProperty('payout_amount_paid') ||
    editData.hasOwnProperty('total_amount') ||
    !!location.state?.returnData ||
    !!location.state?.editData ||
    !!location.state?.returnRecord ||
    !!fetchedEditRecord
  );
  const isDirectInvoiceLink = !!editData && !isEditMode;

  const [defaultReturnNo] = useState(() => (isEditMode && editData?.return_no ? editData.return_no : `RTN-${Math.floor(100000 + Math.random() * 900000)}`));
  const [shouldPrintAfterSave, setShouldPrintAfterSave] = useState(false);

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
      const target = e.target as HTMLElement;
      if (warehouseContainerRef.current && !warehouseContainerRef.current.contains(target)) {
        setIsWarehouseDropdownOpen(false);
      }
      if (customerContainerRef.current && !customerContainerRef.current.contains(target)) {
        setIsCustomerDropdownOpen(false);
      }
      if (invContainerRef.current && !invContainerRef.current.contains(target)) {
        setIsInvDropdownOpen(false);
      }
      if (!target.closest('.sku-container')) {
        setActiveSkuIndex(null);
      }
      if (!target.closest('.prod-name-container')) {
        setActiveProdNameIndex(null);
      }
      if (!target.closest('.row-wh-container')) {
        setActiveRowWhIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchReturnMetadata = async () => {
      try {
        setMetadataLoading(true);

        // Fetch edit record if ID passed in URL and state is empty
        let currentEdit = rawStateData;
        const targetId = routeId || new URLSearchParams(location.search).get('id');
        if (!currentEdit && targetId) {
          const { data: rtnRecord } = await supabase
            .from('sales_returns')
            .select('*')
            .eq('id', targetId)
            .maybeSingle();
          if (rtnRecord) {
            currentEdit = rtnRecord;
            setFetchedEditRecord(rtnRecord);
          }
        }

        // 1. Fetch Customers & Sales Invoices
        const { data: cData } = await supabase.from('customers').select('*');
        const { data: invData } = await supabase.from('sales_invoices').select('*').order('id', { ascending: false });
        if (invData) setSalesInvoicesList(invData);

        // Combine customers from customers table + unique customer names from sales_invoices
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
          const name = (inv.customer_name || inv.customerName || '').trim();
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

        const normalizedCustomers = Array.from(customerMap.values()).sort((a, b) => a.customer_name.localeCompare(b.customer_name));
        setCustomers(normalizedCustomers);

        // 2. Fetch Locations / Warehouses
        const { data: locData } = await supabase.from('inventory_locations').select('*');
        const normalizedLocs = (locData || []).map((l: any) => ({
          id: l.id,
          name: l.name || 'Main Warehouse',
          code: l.code || '',
          address: l.address || ''
        }));
        setLocations(normalizedLocs.length > 0 ? normalizedLocs : [{ id: 1, name: 'Main Warehouse', code: 'MW' }]);

        // 3. Fetch Products
        const { data: prodData } = await supabase.from('products').select('*').order('product_name', { ascending: true });
        setProductList(prodData || []);

        // 4. Fetch Banks
        const { data: bankData } = await supabase.from('banks').select('id, bankName, accountTitle, accountNumber');
        if (bankData) setBankAccountsList(bankData);

        // If in Edit Mode or Direct Invoice Link, restore state
        if (currentEdit) {
          const cName = currentEdit.customer_name || '';
          setCustomerSearchQuery(cName);

          const whName = currentEdit.warehouse_name || currentEdit.source_warehouse || '';
          if (whName) setWarehouseSearchQuery(whName);

          const invRef = currentEdit.original_invoice_no || currentEdit.invoice_no || currentEdit.metadata?.linkedInvoiceNo || '';
          if (invRef) {
            setSelectedInvNo(invRef);
            setInvSearchQuery(invRef);
            const cleanId = String(invRef).replace(/\D/g, '');
            const matchedInv = invData?.find(i => (i.invoice_no || `INV-${String(i.id).padStart(4, '0')}`) === invRef || String(i.id) === cleanId);
            if (matchedInv) setSelectedInvObj(matchedInv);
          } else {
            setInvSearchQuery('-- General Return (All Invoices FIFO) --');
          }
        }
      } catch (err: any) {
        toast.error('Failed to load sales return lookup metadata: ' + err.message);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchReturnMetadata();
  }, [routeId, rawStateData]);

  // Filtered lists
  const filteredCustomers = customers.filter(c =>
    (c.customer_name || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.customer_code || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.contact_name || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.phone || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    (c.city || '').toLowerCase().includes(customerSearchQuery.toLowerCase())
  );

  const filteredWarehouses = locations.filter(l =>
    (l.name || '').toLowerCase().includes(warehouseSearchQuery.toLowerCase()) ||
    (l.code || '').toLowerCase().includes(warehouseSearchQuery.toLowerCase()) ||
    (l.address || '').toLowerCase().includes(warehouseSearchQuery.toLowerCase())
  );

  const customerInvoices = salesInvoicesList.filter(inv =>
    customerSearchQuery && (inv.customer_name || '').toLowerCase() === customerSearchQuery.toLowerCase()
  );

  const filteredInvoices = customerInvoices.filter(inv => {
    if (!invSearchQuery || invSearchQuery.startsWith('-- General')) return true;
    const invFormatted = inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`;
    return (
      invFormatted.toLowerCase().includes(invSearchQuery.toLowerCase()) ||
      (inv.invoice_date || '').toLowerCase().includes(invSearchQuery.toLowerCase()) ||
      (inv.dispatch_warehouse || '').toLowerCase().includes(invSearchQuery.toLowerCase())
    );
  });

  // ── Extract ONLY products sold to the selected customer ─────────────────────
  const getCustomerSoldProducts = (custName: string) => {
    const cTrim = (custName || '').trim().toLowerCase();
    if (!cTrim) return [];

    const matchedInvoices = salesInvoicesList.filter(inv => {
      const name = (inv.customer_name || '').trim().toLowerCase();
      return name === cTrim || name.includes(cTrim) || cTrim.includes(name);
    });

    if (selectedInvNo && selectedInvObj && selectedInvObj.items) {
      return (selectedInvObj.items || []).map((item: any) => {
        const pName = item.itemName || item.product_name || '';
        const itemSku = item.sku || item.skuCode || '';
        const matchingProd = productList.find(p => 
          (p.product_name || '').toLowerCase() === pName.toLowerCase() || 
          (itemSku && (p.item_sr_no || '').toLowerCase() === itemSku.toLowerCase())
        );
        const effectivePrice = Number(item.rp ?? item.rate ?? item.sale_price ?? item.price ?? matchingProd?.retail_price ?? matchingProd?.sales_price ?? matchingProd?.price ?? 0);

        return {
          id: matchingProd?.id || pName,
          product_name: pName,
          item_sr_no: itemSku || matchingProd?.item_sr_no || matchingProd?.sku || '',
          sale_price: effectivePrice,
          uom: item.uom || matchingProd?.uom || 'Nos',
          totalSoldQty: Number(item.qty || item.quantity || 0),
          lastInvNo: selectedInvNo,
          current_stock: matchingProd?.current_stock || 0
        };
      });
    }

    const prodMap: Record<string, any> = {};
    matchedInvoices.forEach(inv => {
      (inv.items || []).forEach((item: any) => {
        const pName = item.itemName || item.product_name || '';
        if (!pName) return;
        const key = pName.toLowerCase();
        const itemSku = item.sku || item.skuCode || '';
        const matchingProd = productList.find(p => 
          (p.product_name || '').toLowerCase() === key || 
          (itemSku && (p.item_sr_no || '').toLowerCase() === itemSku.toLowerCase())
        );
        const qty = Number(item.qty || item.quantity || 0);
        const price = Number(item.rp ?? item.rate ?? item.sale_price ?? item.price ?? matchingProd?.retail_price ?? matchingProd?.sales_price ?? matchingProd?.price ?? 0);

        if (!prodMap[key]) {
          prodMap[key] = {
            id: matchingProd?.id || pName,
            product_name: pName,
            item_sr_no: itemSku || matchingProd?.item_sr_no || matchingProd?.sku || '',
            sale_price: price,
            uom: item.uom || matchingProd?.uom || 'Nos',
            totalSoldQty: qty,
            lastInvNo: inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`,
            current_stock: matchingProd?.current_stock || 0
          };
        } else {
          prodMap[key].totalSoldQty += qty;
          if (price > 0) prodMap[key].sale_price = price;
        }
      });
    });

    return Object.values(prodMap);
  };

  const validationSchema = Yup.object().shape({
    customerName: Yup.string().required('Customer selection is required'),
    sourceWarehouse: Yup.string().required('Receiving warehouse selection is required'),
    gatePassNo: Yup.string().required('Gate Pass No is required'),
    returnDate: Yup.string().required('Return date is required'),
    paymentTerm: Yup.string().required('Reimbursement method is required'),
    amountPaid: Yup.number().when('paymentTerm', {
      is: (val: string) => val === 'By Cash' || val === 'By Bank',
      then: () => Yup.number().typeError('Amount must be numeric').min(0, 'Cannot be negative'),
      otherwise: () => Yup.number().nullable()
    }),
    cashAmountPaid: Yup.number().when('paymentTerm', {
      is: 'Split',
      then: () => Yup.number().typeError('Cash must be numeric').min(0, 'Cannot be negative'),
      otherwise: () => Yup.number().nullable()
    }),
    bankAmountPaid: Yup.number().when('paymentTerm', {
      is: 'Split',
      then: () => Yup.number().typeError('Bank must be numeric').min(0, 'Cannot be negative'),
      otherwise: () => Yup.number().nullable()
    }),
    selectedBankId: Yup.string().when('paymentTerm', {
      is: (val: string) => val === 'By Bank' || val === 'Split',
      then: () => Yup.string().required('Please select the disbursing bank account'),
      otherwise: () => Yup.string().nullable()
    }),
    items: Yup.array().of(
      Yup.object().shape({
        itemName: Yup.string().required('Product selection is required'),
        qty: Yup.number().typeError('Numeric only').min(0.01, 'Min 0.01').required('Quantity required'),
        rate: Yup.number().typeError('Numeric only').min(0, 'Min 0').required('Rate required')
      })
    ).min(1, 'At least one return line item is required')
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
    <div className="mx-auto max-w-full text-xs text-slate-800 dark:text-slate-200 antialiased font-sans">
      
      {/* Top Header & Breadcrumb */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white shadow-xs dark:bg-boxdark mb-6 p-5">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <MdReceipt className="text-emerald-600" size={24} />
              {isEditMode ? 'Modify Sales Return (Credit Note)' : 'Compile Sales Return Note (Credit Slip)'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Return items from customer and automatically deduct chronologically across customer sales invoices (FIFO)
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales-Return/Debit-Notes/List`)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs"
          >
            <MdArrowBack size={16} /> Back to Return Registry
          </button>
        </div>

        <Formik
          initialValues={isEditMode && editData ? {
            returnNo: editData.return_no || defaultReturnNo,
            customerName: editData.customer_name || '',
            sourceWarehouse: editData.warehouse_name || editData.source_warehouse || (locations[0]?.name || 'Main Warehouse'),
            invoiceNo: editData.original_invoice_no || editData.invoice_no || editData.metadata?.linkedInvoiceNo || '',
            gatePassNo: editData.gate_pass_no || '',
            returnDate: editData.return_date || (editData.created_at ? editData.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
            paymentTerm: editData.settlement_mode || editData.payment_term || (editData.metadata?.cashPayoutPaid && editData.metadata?.bankPayoutPaid ? 'Split' : (Number(editData.payout_amount_paid || editData.amount_paid || 0) > 0 ? 'By Cash' : 'On Credit')),
            selectedBankId: editData.metadata?.selectedBankId || editData.bank_name || '',
            amountPaid: editData.payout_amount_paid || editData.amount_paid || 0,
            cashAmountPaid: editData.metadata?.cashPayoutPaid || '',
            bankAmountPaid: editData.metadata?.bankPayoutPaid || '',
            remarks: editData.remarks || editData.notes || '',
            items: ((Array.isArray(editData.items) ? editData.items : (typeof editData.items === 'string' ? JSON.parse(editData.items) : []))).length > 0 ? (Array.isArray(editData.items) ? editData.items : JSON.parse(editData.items)).map((i: any) => ({
              skuCode: i.sku || i.skuCode || '',
              itemName: i.itemName || i.product_name || '',
              warehouse: i.warehouse || editData.warehouse_name || editData.source_warehouse || (locations[0]?.name || 'Main Warehouse'),
              qty: Number(i.qty || i.returnedQty || i.quantity || 1),
              rate: Number(i.rate || i.price || i.sale_price || i.rp || 0),
              uom: i.uom || 'Nos'
            })) : [{
              skuCode: '',
              itemName: '',
              warehouse: locations[0]?.name || 'Main Warehouse',
              qty: 1,
              rate: 0,
              uom: 'Nos'
            }]
          } : (isDirectInvoiceLink && editData ? {
            returnNo: defaultReturnNo,
            customerName: editData.customer_name || '',
            sourceWarehouse: editData.dispatch_warehouse || (locations[0]?.name || 'Main Warehouse'),
            invoiceNo: editData.invoice_no || `INV-${String(editData.id).padStart(4, '0')}`,
            gatePassNo: editData.gate_pass_no || '',
            returnDate: new Date().toISOString().split('T')[0],
            paymentTerm: 'On Credit',
            selectedBankId: '',
            amountPaid: 0,
            cashAmountPaid: '',
            bankAmountPaid: '',
            remarks: '',
            items: (Array.isArray(editData.items) ? editData.items : (typeof editData.items === 'string' ? JSON.parse(editData.items) : [])).map((i: any) => ({
              skuCode: i.sku || i.skuCode || '',
              itemName: i.itemName || i.product_name || '',
              warehouse: editData.dispatch_warehouse || (locations[0]?.name || 'Main Warehouse'),
              qty: Number(i.qty || i.quantity || 1),
              rate: Number(i.rate || i.sale_price || i.price || 0),
              uom: i.uom || 'Nos'
            }))
          } : {
            returnNo: defaultReturnNo,
            customerName: '',
            sourceWarehouse: locations[0]?.name || 'Main Warehouse',
            invoiceNo: '',
            gatePassNo: '',
            returnDate: new Date().toISOString().split('T')[0],
            paymentTerm: 'On Credit',
            selectedBankId: '',
            amountPaid: 0,
            cashAmountPaid: '',
            bankAmountPaid: '',
            remarks: '',
            items: [{
              skuCode: '',
              itemName: '',
              warehouse: locations[0]?.name || 'Main Warehouse',
              qty: 1,
              rate: 0,
              uom: 'Nos'
            }]
          })}
          enableReinitialize={true}
          validationSchema={validationSchema}
          onSubmit={async (values) => {
            if (!values.customerName) {
              toast.error('Validation Error: Please select a customer first!');
              return;
            }
            if (!values.sourceWarehouse) {
              toast.error('Validation Error: Please select the receiving warehouse location!');
              return;
            }

            let grossReturnSum = 0;
            values.items.forEach((item: any) => {
              grossReturnSum += (Number(item.qty || 0) * Number(item.rate || 0));
            });

            if (grossReturnSum <= 0) {
              toast.error('Validation Error: Return items total value must be greater than 0 PKR!');
              return;
            }

            let cashRefund = 0;
            let bankRefund = 0;
            let totalRefundDisbursed = 0;

            if (values.paymentTerm === 'By Cash') {
              cashRefund = Number(values.amountPaid) || 0;
              totalRefundDisbursed = cashRefund;
            } else if (values.paymentTerm === 'By Bank') {
              bankRefund = Number(values.amountPaid) || 0;
              totalRefundDisbursed = bankRefund;
              if (!values.selectedBankId && bankRefund > 0) {
                toast.error('Please select the disbursing bank account.');
                return;
              }
            } else if (values.paymentTerm === 'Split') {
              cashRefund = Number(values.cashAmountPaid) || 0;
              bankRefund = Number(values.bankAmountPaid) || 0;
              totalRefundDisbursed = cashRefund + bankRefund;
              if (!values.selectedBankId && bankRefund > 0) {
                toast.error('Please select the disbursing bank account for the bank transfer portion.');
                return;
              }
            }

            if (totalRefundDisbursed > grossReturnSum) {
              toast.error(`Validation Error: Refund disbursed (Rs. ${formatMoney(totalRefundDisbursed)}) cannot exceed the total return value (Rs. ${formatMoney(grossReturnSum)}).`);
              return;
            }

            try {
              setLoading(true);

              // 1. Smart Price-Matching & Oldest-First (FIFO) Sales Invoice Deduction
              const { data: customerInvoicesRaw } = await supabase
                .from('sales_invoices')
                .select('*')
                .ilike('customer_name', values.customerName);

              // Sort customer invoices strictly oldest to newest (FIFO)
              const customerInvoices = [...(customerInvoicesRaw || [])].sort((a, b) => {
                const timeA = new Date(a.invoice_date || a.created_at || 0).getTime();
                const timeB = new Date(b.invoice_date || b.created_at || 0).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return (Number(a.id) || 0) - (Number(b.id) || 0);
              });

              const matchedInvoicesSummary: any[] = [];
              let primaryLinkedInv = values.invoiceNo || selectedInvNo || null;

              for (const item of values.items) {
                const reqQty = Number(item.qty || 0);
                const enteredRate = Number(item.rate || 0);
                const pName = (item.itemName || '').trim().toLowerCase();

                let remainingToMatch = reqQty;
                if (!customerInvoices || customerInvoices.length === 0) continue;

                // Tier 1: Look for invoices containing this product at the EXACT entered sale price (oldest to newest)
                const exactRateInvoices = customerInvoices.filter((inv: any) => {
                  const pItems = Array.isArray(inv.items) ? inv.items : [];
                  return pItems.some((pi: any) => {
                    const matchName = (pi.itemName || pi.product_name || '').trim().toLowerCase() === pName;
                    const matchRate = Math.abs(Number(pi.rate ?? pi.sale_price ?? pi.price ?? 0) - enteredRate) < 0.01;
                    return matchName && matchRate;
                  });
                });

                // Tier 2: Fallback to all invoices containing this product (oldest to newest)
                const candidateList = exactRateInvoices.length > 0
                  ? exactRateInvoices
                  : customerInvoices.filter((inv: any) => {
                      const pItems = Array.isArray(inv.items) ? inv.items : [];
                      return pItems.some((pi: any) => (pi.itemName || pi.product_name || '').trim().toLowerCase() === pName);
                    });

                for (const inv of candidateList) {
                  if (remainingToMatch <= 0) break;
                  const pItems = Array.isArray(inv.items) ? inv.items : [];
                  const matchedLine = pItems.find((pi: any) => (pi.itemName || pi.product_name || '').trim().toLowerCase() === pName);
                  if (!matchedLine) continue;

                  const soldQty = Number(matchedLine.qty || matchedLine.quantity || 1);
                  const deductQty = Math.min(remainingToMatch, soldQty);
                  const invoiceRate = Number(matchedLine.rate ?? matchedLine.sale_price ?? matchedLine.price ?? enteredRate);

                  matchedInvoicesSummary.push({
                    item_name: item.itemName,
                    sku: item.skuCode || '',
                    invoice_no: inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`,
                    invoice_date: inv.invoice_date || inv.created_at,
                    invoice_rate: invoiceRate,
                    entered_rate: enteredRate,
                    deducted_qty: deductQty,
                    deducted_value: deductQty * invoiceRate,
                    is_exact_rate_match: Math.abs(invoiceRate - enteredRate) < 0.01
                  });

                  if (!primaryLinkedInv) {
                    primaryLinkedInv = inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`;
                  }

                  remainingToMatch -= deductQty;
                }
              }

              // 2. Prepare payload
              const returnPayload = {
                return_no: values.returnNo,
                customer_name: values.customerName,
                return_date: values.returnDate,
                gate_pass_no: values.gatePassNo,
                warehouse_name: values.sourceWarehouse,
                source_warehouse: values.sourceWarehouse,
                invoice_no: primaryLinkedInv || (selectedInvNo ? selectedInvNo : null),
                original_invoice_no: primaryLinkedInv || (selectedInvNo ? selectedInvNo : null),
                settlement_mode: values.paymentTerm === 'By Cash' ? 'Cash' : (values.paymentTerm === 'By Bank' ? 'Bank' : (values.paymentTerm === 'Split' ? 'Split' : 'On Credit')),
                payment_term: values.paymentTerm,
                bank_name: values.selectedBankId || null,
                total_amount: grossReturnSum,
                payout_amount_paid: totalRefundDisbursed,
                status: totalRefundDisbursed >= grossReturnSum - 1 ? 'Refunded' : (values.paymentTerm === 'On Credit' ? 'Credit Applied' : 'Partial Refund'),
                remarks: values.remarks || null,
                items: values.items.map((i: any) => ({
                  sku: i.skuCode,
                  itemName: i.itemName,
                  warehouse: i.warehouse || values.sourceWarehouse,
                  qty: Number(i.qty),
                  rate: Number(i.rate),
                  uom: i.uom || 'Nos',
                  total: Number(i.qty) * Number(i.rate)
                })),
                metadata: {
                  cashPayoutPaid: cashRefund,
                  bankPayoutPaid: bankRefund,
                  selectedBankId: (values.paymentTerm === 'By Bank' || values.paymentTerm === 'Split') ? values.selectedBankId : null,
                  settlementMode: values.paymentTerm,
                  paymentTerm: values.paymentTerm,
                  linkedInvoiceNo: primaryLinkedInv,
                  matchedInvoices: matchedInvoicesSummary
                }
              };

              let savedReturnId = editData?.id;

              if (isEditMode) {
                const { error: updateErr } = await supabase
                  .from('sales_returns')
                  .update(returnPayload)
                  .eq('id', editData.id);
                if (updateErr) throw updateErr;
              } else {
                const { data: insertedRtn, error: insertErr } = await supabase
                  .from('sales_returns')
                  .insert([returnPayload])
                  .select('id')
                  .single();
                if (insertErr) throw insertErr;
                savedReturnId = insertedRtn?.id;
              }

              // Physical stock increment is now handled by the Warehouse team via Return Challans (VerifyReturnChallan.tsx)
              
              toast.success(isEditMode ? 'Sales Return updated successfully!' : 'Sales Return Note generated & pending warehouse verification!');

              if (shouldPrintAfterSave && savedReturnId) {
                navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/Sales-Return/Print/${savedReturnId}`);
              } else {
                navigate(`${tenantId ? `/${tenantId}` : ''}/Sales-Return/Debit-Notes/List`);
              }
            } catch (err: any) {
              toast.error('Error recording sales return: ' + err.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {({ values, errors, touched, handleChange, setFieldValue, handleSubmit }) => {
            const customerSoldProducts = getCustomerSoldProducts(values.customerName);

            let calculatedGrossTotal = 0;
            let totalDiscountDeducted = 0;
            values.items.forEach((it: any) => {
              const qty = Number(it.qty || 0);
              const rate = Number(it.rate || 0);
              const rowGross = qty * rate;
              calculatedGrossTotal += rowGross;

              if (Number(it.discountPer) > 0) {
                totalDiscountDeducted += rowGross * (Number(it.discountPer) / 100);
              } else if (Number(it.discountAmt) > 0 && Number(it.originalQty) > 0) {
                totalDiscountDeducted += (Number(it.discountAmt) / Number(it.originalQty)) * qty;
              }
            });
            const netReturnTotal = Math.max(0, calculatedGrossTotal - totalDiscountDeducted);

            return (
              <Form className="space-y-6">
                
                {/* ── TOP FORM HEADER GRID ── */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  
                  {/* Return Memo ID Code */}
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                      Return Memo ID Code #:
                    </label>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl font-mono font-black text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between">
                      <span>{values.returnNo}</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-sans uppercase font-bold">Auto</span>
                    </div>
                  </div>

                  {/* Return Date */}
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                      Processing Return Date: *
                    </label>
                    <input
                      type="date"
                      name="returnDate"
                      onChange={handleChange}
                      value={values.returnDate}
                      className={`w-full border rounded-xl p-2.5 bg-slate-50/50 dark:bg-slate-800 font-bold outline-none text-slate-900 dark:text-white text-xs ${
                        touched.returnDate && errors.returnDate ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600'
                      }`}
                    />
                  </div>

                  {/* Gate Pass No */}
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                      Gate Pass No: *
                    </label>
                    <input
                      type="text"
                      name="gatePassNo"
                      onChange={handleChange}
                      value={values.gatePassNo}
                      placeholder="Enter Gate Pass..."
                      className={`w-full border rounded-xl p-2.5 bg-slate-50/50 dark:bg-slate-800 font-bold outline-none text-slate-900 dark:text-white text-xs ${
                        touched.gatePassNo && errors.gatePassNo ? 'border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600'
                      }`}
                    />
                  </div>

                  {/* Target Customer Autocomplete */}
                  <div className="relative" ref={customerContainerRef}>
                    <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1 flex items-center gap-1.5">
                      <MdPerson size={15} className="text-emerald-600" /> Target Customer Account: *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        disabled={isEditMode}
                        value={customerSearchQuery || values.customerName}
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
                              const c = filteredCustomers[highlightedCustomerIndex];
                              setFieldValue('customerName', c.customer_name);
                              setCustomerSearchQuery(c.customer_name);
                              setSelectedInvNo('');
                              setInvSearchQuery('-- General Return (All Invoices FIFO) --');
                              setSelectedInvObj(null);
                              setIsCustomerDropdownOpen(false);
                            }
                          } else if (e.key === 'Escape') {
                            setIsCustomerDropdownOpen(false);
                          }
                        }}
                        onChange={(e) => {
                          setCustomerSearchQuery(e.target.value);
                          setFieldValue('customerName', e.target.value);
                          setIsCustomerDropdownOpen(true);
                          setHighlightedCustomerIndex(0);
                        }}
                        placeholder="Search customer name or phone..."
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 pr-8 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600"
                      />
                      <MdSearch className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    </div>

                    {isCustomerDropdownOpen && !isEditMode && (
                      <div className="absolute left-0 top-full mt-1 z-[9999] w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                        {filteredCustomers.length > 0 ? (
                          filteredCustomers.map((cust, cIdx) => (
                            <div
                              key={cust.id}
                              onMouseEnter={() => setHighlightedCustomerIndex(cIdx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFieldValue('customerName', cust.customer_name);
                                setCustomerSearchQuery(cust.customer_name);
                                setSelectedInvNo('');
                                setInvSearchQuery('-- General Return (All Invoices FIFO) --');
                                setSelectedInvObj(null);
                                setFieldValue('invoiceNo', '');
                                setFieldValue('items', [{
                                  skuCode: '',
                                  itemName: '',
                                  warehouse: locations[0]?.name || 'Main Warehouse',
                                  qty: 1,
                                  rate: 0,
                                  uom: 'Nos'
                                }]);
                                setIsCustomerDropdownOpen(false);
                              }}
                              className={`p-2.5 cursor-pointer text-xs flex justify-between items-center transition ${
                                highlightedCustomerIndex === cIdx || values.customerName === cust.customer_name
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-bold">{cust.customer_name}</span>
                                {cust.phone && <span className="text-[10px] text-slate-400">{cust.phone}</span>}
                              </div>
                              {cust.city && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700">{cust.city}</span>}
                            </div>
                          ))
                        ) : (
                          <div className="p-3 text-center text-slate-400 italic">No customers found</div>
                        )}
                      </div>
                    )}
                  </div>

                </div>

                {/* ── ROW 2: SPECIFIC SALES INVOICE PICKER (OPTIONAL) ── */}
                {values.customerName && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 relative" ref={invContainerRef}>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px] mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MdReceipt size={15} className="text-emerald-600" /> Search / Select Specific Customer Invoice (Optional):
                      </span>
                      {selectedInvNo && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedInvNo('');
                            setInvSearchQuery('-- General Return (All Invoices FIFO) --');
                            setSelectedInvObj(null);
                            setFieldValue('invoiceNo', '');
                            setFieldValue('paymentTerm', 'On Credit');
                            setFieldValue('items', [{
                              skuCode: '',
                              itemName: '',
                              warehouse: locations[0]?.name || 'Main Warehouse',
                              qty: 1,
                              rate: 0,
                              uom: 'Nos'
                            }]);
                          }}
                          className="text-[10px] text-emerald-600 hover:underline font-bold"
                        >
                          Clear Selection (Return Across All Customer Invoices via FIFO)
                        </button>
                      )}
                    </label>

                    <div className="relative">
                      <input
                        type="text"
                        value={invSearchQuery}
                        onFocus={() => setIsInvDropdownOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlightedInvIndex(prev => Math.min(prev + 1, filteredInvoices.length));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedInvIndex(prev => Math.max(prev - 1, 0));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (highlightedInvIndex === 0) {
                              setSelectedInvNo('');
                              setInvSearchQuery('-- General Return (All Invoices FIFO) --');
                              setSelectedInvObj(null);
                              setFieldValue('invoiceNo', '');
                              setFieldValue('paymentTerm', 'On Credit');
                              setFieldValue('items', [{
                                skuCode: '',
                                itemName: '',
                                warehouse: locations[0]?.name || 'Main Warehouse',
                                qty: 1,
                                rate: 0,
                                uom: 'Nos'
                              }]);
                              setIsInvDropdownOpen(false);
                            } else if (filteredInvoices[highlightedInvIndex - 1]) {
                              const inv = filteredInvoices[highlightedInvIndex - 1];
                              const formattedInv = inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`;
                              setSelectedInvNo(formattedInv);
                              setInvSearchQuery(formattedInv);
                              setSelectedInvObj(inv);
                              setFieldValue('invoiceNo', formattedInv);

                              if (values.paymentTerm === 'On Credit') {
                                setFieldValue('paymentTerm', 'By Cash');
                              }

                              // Auto-populate all line items from the selected invoice
                              const rawItems = Array.isArray(inv.items) ? inv.items : [];
                              if (rawItems.length > 0) {
                                const populated = rawItems.map((pi: any) => ({
                                  skuCode: pi.skuCode || pi.sku || '',
                                  itemName: pi.itemName || pi.product_name || '',
                                  warehouse: pi.warehouse || inv.dispatch_warehouse || locations[0]?.name || 'Main Warehouse',
                                  qty: Number(pi.qty || pi.quantity || 1),
                                  originalQty: Number(pi.qty || pi.quantity || 1),
                                  discountPer: Number(pi.discountPer || 0),
                                  discountAmt: Number(pi.discountAmt || 0),
                                  rate: Number(pi.rp ?? pi.rate ?? pi.sale_price ?? pi.price ?? 0),
                                  uom: pi.uom || 'Nos'
                                }));
                                setFieldValue('items', populated);
                                toast.success(`Loaded ${populated.length} items from ${formattedInv}! You can now adjust quantities, prices, or remove rows.`);
                              }

                              setIsInvDropdownOpen(false);
                            }
                          } else if (e.key === 'Escape') {
                            setIsInvDropdownOpen(false);
                          }
                        }}
                        onChange={(e) => {
                          setInvSearchQuery(e.target.value);
                          setIsInvDropdownOpen(true);
                          setHighlightedInvIndex(0);
                        }}
                        placeholder="Search invoice # (e.g. INV-0003), date, or warehouse..."
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 pr-8 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600"
                      />
                      <MdKeyboardArrowDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    </div>

                    {isInvDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1 z-[9999] w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                        <div
                          onMouseEnter={() => setHighlightedInvIndex(0)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSelectedInvNo('');
                            setInvSearchQuery('-- General Return (All Invoices FIFO) --');
                            setSelectedInvObj(null);
                            setFieldValue('invoiceNo', '');
                            setFieldValue('paymentTerm', 'On Credit');
                            setFieldValue('items', [{
                              skuCode: '',
                              itemName: '',
                              warehouse: locations[0]?.name || 'Main Warehouse',
                              qty: 1,
                              rate: 0,
                              uom: 'Nos'
                            }]);
                            setIsInvDropdownOpen(false);
                          }}
                          className={`p-2.5 cursor-pointer text-xs flex justify-between items-center transition ${
                            highlightedInvIndex === 0 || !selectedInvNo
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold">-- General Return (All Invoices FIFO) --</span>
                            <span className="text-[10px] text-slate-400">Deduct items automatically starting from oldest customer invoice</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-bold">FIFO</span>
                        </div>

                        {filteredInvoices.map((inv, iIdx) => {
                          const formattedInv = inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`;
                          return (
                            <div
                              key={inv.id}
                              onMouseEnter={() => setHighlightedInvIndex(iIdx + 1)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSelectedInvNo(formattedInv);
                                setInvSearchQuery(formattedInv);
                                setSelectedInvObj(inv);
                                setFieldValue('invoiceNo', formattedInv);

                                // Auto-populate all line items from the selected invoice
                                const rawItems = Array.isArray(inv.items) ? inv.items : [];
                                if (rawItems.length > 0) {
                                  const populated = rawItems.map((pi: any) => ({
                                    skuCode: pi.skuCode || pi.sku || '',
                                    itemName: pi.itemName || pi.product_name || '',
                                    warehouse: pi.warehouse || inv.dispatch_warehouse || locations[0]?.name || 'Main Warehouse',
                                    qty: Number(pi.qty || pi.quantity || 1),
                                    originalQty: Number(pi.qty || pi.quantity || 1),
                                    discountPer: Number(pi.discountPer || 0),
                                    discountAmt: Number(pi.discountAmt || 0),
                                    rate: Number(pi.rp ?? pi.rate ?? pi.sale_price ?? pi.price ?? 0),
                                    uom: pi.uom || 'Nos'
                                  }));
                                  setFieldValue('items', populated);
                                  toast.success(`Loaded ${populated.length} items from ${formattedInv}! You can now adjust quantities, prices, or remove rows.`);
                                }

                                setIsInvDropdownOpen(false);
                              }}
                              className={`p-2.5 cursor-pointer text-xs flex justify-between items-center transition ${
                                highlightedInvIndex === (iIdx + 1) || selectedInvNo === formattedInv
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-mono font-black text-emerald-700 dark:text-emerald-400">{formattedInv}</span>
                                <span className="text-[10px] text-slate-400">{inv.invoice_date || 'N/A'} • {inv.dispatch_warehouse || 'Main Warehouse'}</span>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-slate-900 dark:text-white font-bold text-xs">Rs. {formatMoney(inv.total_amount)}</span>
                                <span className="text-[10px] text-slate-400 block">Items: {inv.items?.length || 0}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── RETURN LINE ITEMS DYNAMIC TABLE ── */}
                <FieldArray name="items">
                  {({ push, remove }) => (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-boxdark p-5 shadow-xs space-y-4 overflow-visible">
                      <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Returned Items Line Items
                          </span>
                          {values.customerName && (
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-bold">
                              Filtered to items sold to {values.customerName} ({customerSoldProducts.length} Products Found)
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!values.customerName) {
                              toast.error('Please select a customer first!');
                              return;
                            }
                            push({
                              skuCode: '',
                              itemName: '',
                              warehouse: values.sourceWarehouse || (locations[0]?.name || 'Main Warehouse'),
                              qty: 1,
                              rate: 0,
                              uom: 'Nos'
                            });
                          }}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-bold transition text-xs cursor-pointer shadow-xs"
                        >
                          <MdAdd size={16} /> Add Item Row
                        </button>
                      </div>

                      {!values.customerName ? (
                        <div className="py-8 text-center text-slate-400 italic">
                          Please select a target customer above to inspect and return their purchased items
                        </div>
                      ) : (
                        <div className="overflow-visible min-h-[140px]">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                <th className="p-3 w-12 text-center">S#</th>
                                <th className="p-3 w-36">Code</th>
                                <th className="p-3 min-w-[220px]">Item Description</th>
                                <th className="p-3 w-36">Return Warehouse</th>
                                <th className="p-3 w-20 text-center">UOM</th>
                                <th className="p-3 w-28 text-right">Sale Price (PKR)</th>
                                <th className="p-3 min-w-[220px] text-center">Return Qty (Boxes / Pcs / Sq.M)</th>
                                <th className="p-3 w-32 text-right">Amount (PKR)</th>
                                <th className="p-3 w-12 text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {values.items.map((item: any, idx: number) => {
                                const rowAmount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                                const isRowActive = activeSkuIndex === idx || activeProdNameIndex === idx;

                                const matchedProduct = productList.find(p => 
                                  (p.product_name || '').toLowerCase() === (item.itemName || '').toLowerCase() || 
                                  (item.skuCode && ((p.item_sr_no || '').toLowerCase() === item.skuCode.toLowerCase() || `SKU-${p.id}`.toLowerCase() === item.skuCode.toLowerCase()))
                                );

                                const rawPcs = Number(matchedProduct?.pieces_per_box || matchedProduct?.pcs_per_box || matchedProduct?.pieces_per_packing || 0);
                                const isTile = Boolean(
                                  matchedProduct && (
                                    String(matchedProduct.category || '').toLowerCase().includes('tile') || 
                                    String(matchedProduct.scenario_name || '').toLowerCase().includes('tile')
                                  ) && (rawPcs > 1 || String(matchedProduct.scenario_name || '').toLowerCase().includes('tile'))
                                );

                                const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);

                                let tileWidthCm = 60;
                                let tileHeightCm = 60;
                                const desc = matchedProduct?.product_description || matchedProduct?.product_name || item.itemName || '';
                                const sku = matchedProduct?.item_sr_no || item.skuCode || '';
                                const sizeMatch = desc.match(/Size:\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm/i) ||
                                                  desc.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i) ||
                                                  sku.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
                                if (sizeMatch) {
                                  tileHeightCm = Number(sizeMatch[1]) || 60;
                                  tileWidthCm = Number(sizeMatch[2]) || 60;
                                }
                                const perPieceSqm = (tileHeightCm * tileWidthCm) / 10000;
                                const perBoxSqm = perPieceSqm * pcsPerBox;

                                const currentQty = Number(item.qty || 0);
                                const boxes = Math.floor(currentQty);
                                const loosePcs = Math.round((currentQty - boxes) * pcsPerBox);
                                const totalLineSqm = (boxes * perBoxSqm) + (loosePcs * perPieceSqm);

                                return (
                                  <tr key={idx} className={`transition ${isRowActive ? 'relative z-[99999] bg-slate-50/90 dark:bg-slate-800/90 shadow-xs' : 'relative z-[1]'} hover:bg-slate-50/60 dark:hover:bg-slate-800/40`}>
                                    {/* S# */}
                                    <td className="p-3 text-center font-bold text-slate-400 font-mono">
                                      {idx + 1}
                                    </td>

                                    {/* SKU Autocomplete */}
                                    <td className={`p-2.5 relative sku-container ${activeSkuIndex === idx ? 'z-[999999]' : ''}`}>
                                      {(() => {
                                        const query = (item.skuCode || '').toLowerCase().trim();
                                        const filteredSkuList = customerSoldProducts.filter(p => (p.item_sr_no || '').toLowerCase().includes(query) || (p.product_name || '').toLowerCase().includes(query));

                                        const lookupItem = (queryStr: string) => {
                                          const q = (queryStr || '').trim().toLowerCase();
                                          if (!q) return null;
                                          const inSold = customerSoldProducts.find(p => 
                                            (p.item_sr_no || '').toLowerCase() === q || 
                                            (p.product_name || '').toLowerCase() === q ||
                                            (`SKU-${p.id || ''}`).toLowerCase() === q
                                          );
                                          if (inSold && Number(inSold.sale_price) > 0) return inSold;

                                          const inProd = productList.find(p => 
                                            (p.item_sr_no || '').toLowerCase() === q || 
                                            (p.product_name || '').toLowerCase() === q ||
                                            (`SKU-${p.id || ''}`).toLowerCase() === q
                                          );
                                          if (inProd) {
                                            const salePrice = Number(inSold?.sale_price || inProd.retail_price || inProd.sales_price || inProd.price || 0);
                                            return {
                                              product_name: inProd.product_name,
                                              item_sr_no: inProd.item_sr_no || `SKU-${inProd.id}`,
                                              sale_price: salePrice,
                                              uom: inProd.uom || inSold?.uom || 'Nos'
                                            };
                                          }
                                          return inSold || null;
                                        };

                                        return (
                                          <div className="relative">
                                            <input
                                              type="text"
                                              value={item.skuCode}
                                              onFocus={() => {
                                                setActiveSkuIndex(idx);
                                                setActiveProdNameIndex(null);
                                                setHighlightedSkuIndex(0);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'ArrowDown') {
                                                  e.preventDefault();
                                                  setHighlightedSkuIndex(prev => Math.min(prev + 1, filteredSkuList.length - 1));
                                                } else if (e.key === 'ArrowUp') {
                                                  e.preventDefault();
                                                  setHighlightedSkuIndex(prev => Math.max(prev - 1, 0));
                                                } else if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  if (filteredSkuList[highlightedSkuIndex]) {
                                                    const prod = filteredSkuList[highlightedSkuIndex];
                                                    const effectivePrice = Number(prod.sale_price) > 0
                                                      ? Number(prod.sale_price)
                                                      : Number(lookupItem(prod.item_sr_no || prod.product_name)?.sale_price || 0);
                                                    setFieldValue(`items.${idx}.skuCode`, prod.item_sr_no);
                                                    setFieldValue(`items.${idx}.itemName`, prod.product_name);
                                                    setFieldValue(`items.${idx}.rate`, effectivePrice);
                                                    setFieldValue(`items.${idx}.uom`, prod.uom || 'Nos');
                                                    setActiveSkuIndex(null);
                                                  }
                                                } else if (e.key === 'Escape' || e.key === 'Tab') {
                                                  setActiveSkuIndex(null);
                                                }
                                              }}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setFieldValue(`items.${idx}.skuCode`, val);
                                                setActiveSkuIndex(idx);
                                                setHighlightedSkuIndex(0);
                                                const matched = lookupItem(val);
                                                if (matched) {
                                                  setFieldValue(`items.${idx}.itemName`, matched.product_name);
                                                  if (Number(matched.sale_price) > 0 || !item.rate) {
                                                    setFieldValue(`items.${idx}.rate`, Number(matched.sale_price) || 0);
                                                  }
                                                  setFieldValue(`items.${idx}.uom`, matched.uom || 'Nos');
                                                }
                                              }}
                                              placeholder="Type SKU..."
                                              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 text-xs outline-none focus:border-emerald-600"
                                            />

                                            {activeSkuIndex === idx && filteredSkuList.length > 0 && (
                                              <div className="absolute left-0 top-full mt-1.5 z-[999999] w-72 max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                                                {filteredSkuList.map((prod, pIdx) => {
                                                  const displayPrice = Number(prod.sale_price) > 0 
                                                    ? Number(prod.sale_price) 
                                                    : Number(lookupItem(prod.item_sr_no || prod.product_name)?.sale_price || 0);

                                                  return (
                                                    <div
                                                      key={pIdx}
                                                      onMouseEnter={() => setHighlightedSkuIndex(pIdx)}
                                                      onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setFieldValue(`items.${idx}.skuCode`, prod.item_sr_no);
                                                        setFieldValue(`items.${idx}.itemName`, prod.product_name);
                                                        setFieldValue(`items.${idx}.rate`, displayPrice);
                                                        setFieldValue(`items.${idx}.uom`, prod.uom || 'Nos');
                                                        setActiveSkuIndex(null);
                                                      }}
                                                      className={`p-2.5 cursor-pointer text-xs flex justify-between items-center transition ${
                                                        highlightedSkuIndex === pIdx
                                                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold'
                                                          : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                                                      }`}
                                                    >
                                                      <div className="flex flex-col">
                                                        <span className="font-mono font-black text-emerald-700">{prod.item_sr_no || 'NO-SKU'}</span>
                                                        <span className="text-[10px] text-slate-400">{prod.product_name}</span>
                                                      </div>
                                                      <span className="text-[10px] font-mono font-bold text-slate-500">Rs. {formatMoney(displayPrice)}</span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </td>

                                    {/* Item Name Autocomplete */}
                                    <td className={`p-2.5 relative prod-name-container ${activeProdNameIndex === idx ? 'z-[999999]' : ''}`}>
                                      {(() => {
                                        const query = (item.itemName || '').toLowerCase().trim();
                                        const filteredNameList = customerSoldProducts.filter(p => (p.product_name || '').toLowerCase().includes(query) || (p.item_sr_no || '').toLowerCase().includes(query));

                                        const lookupItem = (queryStr: string) => {
                                          const q = (queryStr || '').trim().toLowerCase();
                                          if (!q) return null;
                                          const inSold = customerSoldProducts.find(p => 
                                            (p.item_sr_no || '').toLowerCase() === q || 
                                            (p.product_name || '').toLowerCase() === q ||
                                            (`SKU-${p.id || ''}`).toLowerCase() === q
                                          );
                                          if (inSold && Number(inSold.sale_price) > 0) return inSold;

                                          const inProd = productList.find(p => 
                                            (p.item_sr_no || '').toLowerCase() === q || 
                                            (p.product_name || '').toLowerCase() === q ||
                                            (`SKU-${p.id || ''}`).toLowerCase() === q
                                          );
                                          if (inProd) {
                                            const salePrice = Number(inSold?.sale_price || inProd.retail_price || inProd.sales_price || inProd.price || 0);
                                            return {
                                              product_name: inProd.product_name,
                                              item_sr_no: inProd.item_sr_no || `SKU-${inProd.id}`,
                                              sale_price: salePrice,
                                              uom: inProd.uom || inSold?.uom || 'Nos'
                                            };
                                          }
                                          return inSold || null;
                                        };

                                        return (
                                          <div className="relative">
                                            <input
                                              type="text"
                                              value={item.itemName}
                                              onFocus={() => {
                                                setActiveProdNameIndex(idx);
                                                setActiveSkuIndex(null);
                                                setHighlightedProdNameIndex(0);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'ArrowDown') {
                                                  e.preventDefault();
                                                  setHighlightedProdNameIndex(prev => Math.min(prev + 1, filteredNameList.length - 1));
                                                } else if (e.key === 'ArrowUp') {
                                                  e.preventDefault();
                                                  setHighlightedProdNameIndex(prev => Math.max(prev - 1, 0));
                                                } else if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  if (filteredNameList[highlightedProdNameIndex]) {
                                                    const prod = filteredNameList[highlightedProdNameIndex];
                                                    const effectivePrice = Number(prod.sale_price) > 0 
                                                      ? Number(prod.sale_price) 
                                                      : Number(lookupItem(prod.product_name || prod.item_sr_no)?.sale_price || 0);
                                                    setFieldValue(`items.${idx}.itemName`, prod.product_name);
                                                    setFieldValue(`items.${idx}.skuCode`, prod.item_sr_no);
                                                    setFieldValue(`items.${idx}.rate`, effectivePrice);
                                                    setFieldValue(`items.${idx}.uom`, prod.uom || 'Nos');
                                                    setActiveProdNameIndex(null);
                                                  }
                                                } else if (e.key === 'Escape' || e.key === 'Tab') {
                                                  setActiveProdNameIndex(null);
                                                }
                                              }}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setFieldValue(`items.${idx}.itemName`, val);
                                                setActiveProdNameIndex(idx);
                                                setHighlightedProdNameIndex(0);
                                                const matched = lookupItem(val);
                                                if (matched) {
                                                  setFieldValue(`items.${idx}.skuCode`, matched.item_sr_no);
                                                  if (Number(matched.sale_price) > 0 || !item.rate) {
                                                    setFieldValue(`items.${idx}.rate`, Number(matched.sale_price) || 0);
                                                  }
                                                  setFieldValue(`items.${idx}.uom`, matched.uom || 'Nos');
                                                }
                                              }}
                                              placeholder="Search customer purchased item..."
                                              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 text-xs outline-none focus:border-emerald-600"
                                            />

                                            {activeProdNameIndex === idx && filteredNameList.length > 0 && (
                                              <div className="absolute left-0 top-full mt-1.5 z-[999999] w-80 max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                                                {filteredNameList.map((prod, pIdx) => {
                                                  const displayPrice = Number(prod.sale_price) > 0 
                                                    ? Number(prod.sale_price) 
                                                    : Number(lookupItem(prod.product_name || prod.item_sr_no)?.sale_price || 0);

                                                  return (
                                                    <div
                                                      key={pIdx}
                                                      onMouseEnter={() => setHighlightedProdNameIndex(pIdx)}
                                                      onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setFieldValue(`items.${idx}.itemName`, prod.product_name);
                                                        setFieldValue(`items.${idx}.skuCode`, prod.item_sr_no);
                                                        setFieldValue(`items.${idx}.rate`, displayPrice);
                                                        setFieldValue(`items.${idx}.uom`, prod.uom || 'Nos');
                                                        setActiveProdNameIndex(null);
                                                      }}
                                                      className={`p-2.5 cursor-pointer text-xs flex justify-between items-center transition ${
                                                        highlightedProdNameIndex === pIdx
                                                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold'
                                                          : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                                                      }`}
                                                    >
                                                      <div className="flex flex-col">
                                                        <span className="font-bold">{prod.product_name}</span>
                                                        <span className="text-[10px] text-slate-400">
                                                          {prod.item_sr_no ? `SKU: ${prod.item_sr_no} • ` : ''}Sold Qty: {prod.totalSoldQty} {prod.uom}
                                                        </span>
                                                      </div>
                                                      <div className="text-right font-mono">
                                                        <span className="font-black text-emerald-700 block">Rs. {formatMoney(displayPrice)}</span>
                                                        <span className="text-[10px] text-slate-400">{prod.lastInvNo}</span>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </td>

                                    {/* Warehouse */}
                                    <td className="p-2.5">
                                      <select
                                        name={`items.${idx}.warehouse`}
                                        onChange={handleChange}
                                        value={item.warehouse}
                                        className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-bold bg-white dark:bg-slate-800 text-xs outline-none focus:border-emerald-600 cursor-pointer"
                                      >
                                        {locations.map(loc => (
                                          <option key={loc.id} value={loc.name}>{loc.name}</option>
                                        ))}
                                      </select>
                                    </td>

                                    {/* UOM */}
                                    <td className="p-2.5 text-center font-bold text-slate-500 font-mono">
                                      {item.uom || 'Nos'}
                                    </td>

                                    {/* Sale Price */}
                                    <td className="p-2.5">
                                      <input
                                        type="number"
                                        name={`items.${idx}.rate`}
                                        onKeyDown={blockInvalidChar}
                                        onChange={handleChange}
                                        value={item.rate}
                                        placeholder="0"
                                        className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono font-bold text-right bg-white dark:bg-slate-800 text-xs outline-none focus:border-emerald-600"
                                      />
                                    </td>

                                    {/* Return Qty with Dedicated Boxes & Loose Pieces & Sq.Mtr for Tiles */}
                                    <td className="p-2.5 min-w-[220px]">
                                      {isTile ? (
                                        <div className="flex flex-col gap-1">
                                          {/* Top Badges */}
                                          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-1 font-mono">
                                            <span className="text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800/60 font-bold">
                                              Box: {perBoxSqm.toFixed(2)} sq.m
                                            </span>
                                            <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60 font-bold">
                                              Pc: {perPieceSqm.toFixed(4)} sq.m
                                            </span>
                                          </div>

                                          {/* Inputs Container: Boxes + Loose Pieces */}
                                          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/90 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
                                            {/* BOXES INPUT */}
                                            <div className="flex-1 flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 focus-within:border-emerald-600 shadow-xs">
                                              <input
                                                type="text"
                                                inputMode="numeric"
                                                onKeyDown={blockInvalidChar}
                                                value={(() => {
                                                  const b = Math.floor(Number(item.qty || 0));
                                                  return b === 0 ? '' : b;
                                                })()}
                                                placeholder="0"
                                                onChange={(e) => {
                                                  const val = e.target.value.trim();
                                                  const newBoxes = val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0);
                                                  const currentLoose = Math.round((Number(item.qty || 0) - Math.floor(Number(item.qty || 0))) * pcsPerBox);
                                                  const combinedQty = Number((newBoxes + currentLoose / pcsPerBox).toFixed(3));
                                                  setFieldValue(`items.${idx}.qty`, combinedQty);
                                                }}
                                                className="w-full bg-transparent text-center font-black text-xs text-emerald-700 dark:text-emerald-400 outline-none min-w-[32px]"
                                              />
                                              <span className="text-[10px] font-bold text-slate-400 pl-1 select-none">Box</span>
                                            </div>

                                            <span className="text-slate-400 font-black text-xs select-none">+</span>

                                            {/* LOOSE PIECES INPUT */}
                                            <div className="flex-1 flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 focus-within:border-emerald-600 shadow-xs">
                                              <input
                                                type="text"
                                                inputMode="numeric"
                                                onKeyDown={blockInvalidChar}
                                                value={(() => {
                                                  const currentLoose = Math.round((Number(item.qty || 0) - Math.floor(Number(item.qty || 0))) * pcsPerBox);
                                                  return currentLoose === 0 ? '' : currentLoose;
                                                })()}
                                                placeholder={`${pcsPerBox}`}
                                                onChange={(e) => {
                                                  const val = e.target.value.trim();
                                                  const enteredLoose = val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0);
                                                  const currentBoxes = Math.floor(Number(item.qty || 0));

                                                  const extraBoxes = Math.floor(enteredLoose / pcsPerBox);
                                                  const remLoose = enteredLoose % pcsPerBox;
                                                  const finalBoxes = currentBoxes + extraBoxes;
                                                  const combinedQty = remLoose > 0 
                                                    ? Number((finalBoxes + remLoose / pcsPerBox).toFixed(3)) 
                                                    : finalBoxes;

                                                  setFieldValue(`items.${idx}.qty`, combinedQty);
                                                }}
                                                className="w-full bg-transparent text-center font-black text-xs text-emerald-600 dark:text-emerald-400 outline-none min-w-[32px]"
                                              />
                                              <span className="text-[10px] font-bold text-slate-400 pl-1 select-none">Pcs</span>
                                            </div>
                                          </div>

                                          {/* Bottom Total Summary */}
                                          <div className="text-center font-mono text-[10px] font-bold text-teal-800 dark:text-teal-300 bg-teal-50/70 dark:bg-teal-950/30 rounded py-0.5 border border-teal-200/60 dark:border-teal-800/40">
                                            Total: <span className="text-xs font-black">{totalLineSqm.toFixed(2)}</span> sq.m
                                            <span className="text-slate-400 font-sans font-normal ml-1">({boxes} Box{boxes !== 1 ? 'es' : ''}{loosePcs > 0 ? ` + ${loosePcs} Pcs` : ''})</span>
                                          </div>
                                        </div>
                                      ) : (
                                        (() => {
                                          const u = String(item.uom || matchedProduct?.uom || '').trim().toUpperCase();
                                          const isDecimalUom = [
                                            'KG', 'KILOGRAM', 'GM', 'GRAM', 'TON', 'METRIC TON', 'LBS',
                                            'LTR', 'LITER', 'LITRE', 'ML', 'GAL',
                                            'MTR', 'METER', 'FT', 'FEET', 'INCH', 'CM', 'MM', 'YD',
                                            'SQM', 'SQ.M', 'SQ.MTR', 'SQ.FT', 'SQF', 'SQY', 'SQUARE METER'
                                          ].includes(u);

                                          return (
                                            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-700 focus-within:border-emerald-600">
                                              <input
                                                type="text"
                                                inputMode={isDecimalUom ? "decimal" : "numeric"}
                                                name={`items.${idx}.qty`}
                                                onKeyDown={(e) => {
                                                  blockInvalidChar(e);
                                                  if (!isDecimalUom && (e.key === '.' || e.key === 'Decimal')) {
                                                    e.preventDefault();
                                                  }
                                                }}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  const regex = isDecimalUom ? /^\d*\.?\d*$/ : /^\d*$/;
                                                  if (val === '' || regex.test(val)) {
                                                    setFieldValue(`items.${idx}.qty`, val);
                                                  }
                                                }}
                                                value={item.qty ?? ''}
                                                placeholder="1"
                                                className="w-full bg-transparent font-mono font-black text-center text-xs outline-none text-emerald-800 dark:text-emerald-400"
                                              />
                                              {item.uom && (
                                                <span className="text-[10px] font-bold text-slate-400 uppercase select-none pr-1">
                                                  {item.uom}
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })()
                                      )}
                                    </td>

                                    {/* Net Row Amount */}
                                    <td className="p-2.5 text-right font-mono font-black text-xs text-slate-900 dark:text-white">
                                      Rs. {formatMoney(rowAmount)}
                                    </td>

                                    {/* Delete Row */}
                                    <td className="p-2.5 text-center">
                                      <button
                                        type="button"
                                        title={values.items.length > 1 ? "Remove this item row" : "Clear this row"}
                                        onClick={() => {
                                          if (values.items.length > 1) {
                                            remove(idx);
                                          } else {
                                            setFieldValue(`items.0.skuCode`, '');
                                            setFieldValue(`items.0.itemName`, '');
                                            setFieldValue(`items.0.rate`, 0);
                                            setFieldValue(`items.0.qty`, 1);
                                            setFieldValue(`items.0.uom`, 'Nos');
                                          }
                                        }}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                      >
                                        <MdDelete size={17} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </div>
                  )}
                </FieldArray>

                {/* ── BOTTOM FINANCIAL AUDIT & SETTLEMENT CARDS (2 COLUMNS) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Left Column: Settlement Gateway (7 Cols) */}
                  <div className="lg:col-span-7 bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
                    <div className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                      <MdOutlinePayment className="text-emerald-600" size={16} /> 1. Reimbursement & Settlement Mode:
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                          Settlement Method: *
                        </label>
                        <select
                          name="paymentTerm"
                          onChange={(e) => {
                            const val = e.target.value;
                            setFieldValue('paymentTerm', val);
                            if (val === 'On Credit') {
                              setFieldValue('amountPaid', 0);
                              setFieldValue('cashAmountPaid', '');
                              setFieldValue('bankAmountPaid', '');
                            }
                          }}
                          value={values.paymentTerm}
                          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600 cursor-pointer"
                        >
                          <option value="On Credit">📄 On Credit (Adjusted Against Invoices / Customer Balance)</option>
                          <option value="By Cash">💵 By Cash (Immediate Cash Drawer Payout)</option>
                          <option value="By Bank">🏦 By Bank (Immediate Bank Wire Transfer)</option>
                          <option value="Split">💳 Split Payment (Cash + Bank Payout)</option>
                        </select>
                      </div>

                      {(values.paymentTerm === 'By Bank' || values.paymentTerm === 'Split') && (
                        <div>
                          <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                            Disbursing Bank Account: *
                          </label>
                          <select
                            name="selectedBankId"
                            onChange={handleChange}
                            value={values.selectedBankId}
                            className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold outline-none text-xs focus:border-emerald-600 cursor-pointer"
                          >
                            <option value="">-- Choose Disbursing Bank --</option>
                            {bankAccountsList.map(b => (
                              <option key={b.id} value={b.bankName}>
                                {b.bankName} - {b.accountTitle} ({b.accountNumber || '-'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Immediate Refund Payout Input */}
                    {values.paymentTerm !== 'On Credit' && (
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
                        {values.paymentTerm === 'Split' ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                  <label className="block text-slate-500 font-bold text-[10px] uppercase">Cash Payout (PKR):</label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const half = Math.floor(netReturnTotal / 2);
                                      const remainder = netReturnTotal - half;
                                      setFieldValue('cashAmountPaid', half.toString());
                                      setFieldValue('bankAmountPaid', remainder.toString());
                                    }}
                                    className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-400 text-slate-600 dark:text-slate-300 px-2 rounded cursor-pointer transition-colors"
                                  >
                                    50 / 50
                                  </button>
                                </div>
                              <input
                                type="number"
                                name="cashAmountPaid"
                                onKeyDown={blockInvalidChar}
                                onChange={handleChange}
                                value={values.cashAmountPaid}
                                placeholder="0"
                                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono font-bold bg-white dark:bg-slate-800 text-xs outline-none focus:border-emerald-600"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Bank Payout (PKR):</label>
                              <input
                                type="number"
                                name="bankAmountPaid"
                                onKeyDown={blockInvalidChar}
                                onChange={handleChange}
                                value={values.bankAmountPaid}
                                placeholder="0"
                                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono font-bold bg-white dark:bg-slate-800 text-xs outline-none focus:border-emerald-600"
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px]">
                                Refund Amount Paid to Customer (PKR):
                              </label>
                              <button
                                type="button"
                                onClick={() => setFieldValue('amountPaid', netReturnTotal)}
                                className="text-[10px] text-emerald-600 hover:underline font-bold"
                              >
                                ⚡ Pay Full (Rs. {formatMoney(netReturnTotal)})
                              </button>
                            </div>
                            <input
                              type="number"
                              name="amountPaid"
                              onKeyDown={blockInvalidChar}
                              onChange={handleChange}
                              value={values.amountPaid}
                              placeholder="0"
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-mono font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 text-xs outline-none focus:border-emerald-600"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Remarks */}
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] mb-1">
                        Return Reason / Notes:
                      </label>
                      <textarea
                        name="remarks"
                        rows={2}
                        onChange={handleChange}
                        value={values.remarks}
                        placeholder="Enter return reason, damaged box details, or reference notes..."
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>

                  {/* Right Column: Live Settlement Summary (5 Cols) */}
                  <div className="lg:col-span-5 bg-white dark:bg-boxdark rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-3.5">
                    <div className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MdAccountBalance className="text-emerald-600" size={16} /> 2. Return Audit Profile
                      </span>
                      {selectedInvNo ? (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {selectedInvNo}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          FIFO All Invoices
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5 font-mono text-xs">
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span className="font-sans">Total Return Line Items:</span>
                        <strong className="text-slate-900 dark:text-white font-bold">{values.items.length} Items</strong>
                      </div>

                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span className="font-sans">Gross Return Items Value:</span>
                        <strong className="text-slate-900 dark:text-white font-black text-sm">
                          Rs. {formatMoney(calculatedGrossTotal)}
                        </strong>
                      </div>

                      {totalDiscountDeducted > 0 && (
                        <div className="flex justify-between items-center text-rose-500 dark:text-rose-400 mt-2">
                          <span className="font-sans">Total Discount Deducted:</span>
                          <strong className="text-rose-600 dark:text-rose-400 font-black text-sm">
                            - Rs. {formatMoney(totalDiscountDeducted)}
                          </strong>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-slate-800 dark:text-slate-200 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <span className="font-sans font-bold">Net Return Value:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400 font-black text-lg">
                          Rs. {formatMoney(netReturnTotal)}
                        </strong>
                      </div>

                      {values.paymentTerm !== 'On Credit' && (
                        <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                          <span className="font-sans">Upfront Refund Disbursed:</span>
                          <span>- Rs. {formatMoney(values.paymentTerm === 'Split' ? (Number(values.cashAmountPaid || 0) + Number(values.bankAmountPaid || 0)) : (Number(values.amountPaid) || 0))}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2.5 border-t border-slate-200 dark:border-slate-700 text-emerald-800 dark:text-emerald-300 font-black">
                        <span className="font-sans">
                          {values.paymentTerm === 'On Credit' ? 'Credit Balance to Invoices:' : 'Remaining Customer Balance:'}
                        </span>
                        <strong className="text-base">
                          Rs. {formatMoney(values.paymentTerm === 'On Credit' ? netReturnTotal : Math.max(0, netReturnTotal - (values.paymentTerm === 'Split' ? (Number(values.cashAmountPaid || 0) + Number(values.bankAmountPaid || 0)) : (Number(values.amountPaid) || 0))))}
                        </strong>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[11px] font-sans text-emerald-900 dark:text-emerald-300">
                        <strong>FIFO Auto-Deduction Active:</strong> Returned quantities will deduct chronologically starting from the oldest invoice issued to <strong>{values.customerName || 'the customer'}</strong>.
                      </div>
                    </div>
                  </div>

                </div>

                {/* ── ACTION BUTTONS FOOTER ── */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales-Return/Debit-Notes/List`)}
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
                    disabled={loading || !values.customerName}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-6 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <FiPrinter size={15} />
                    <span>Save & Print Credit Note</span>
                  </button>

                  <button
                    type="submit"
                    onClick={() => setShouldPrintAfterSave(false)}
                    disabled={loading || !values.customerName}
                    className="rounded-xl bg-primary hover:bg-opacity-90 py-3 px-8 font-black text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Credit Note' : 'Post & Authorize Return'}</span>}
                  </button>
                </div>

              </Form>
            );
          }}
        </Formik>

      </div>

    </div>
  );
};

export default AddSalesReturn;
