import React, { useState, useEffect, useRef } from 'react';
import { getAvailableStock, fetchStockDataset } from '../../../utils/stockCalculator';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
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
  MdPrint
} from 'react-icons/md';
import { FiPrinter } from 'react-icons/fi';
import { logActivity } from '../../../service/auditLogger';

const DropdownPortal = ({ children, anchorEl, isOpen, minWidth = 280, maxWidth }: any) => {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!isOpen || !anchorEl) return;
    const update = () => setRect(anchorEl.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen, anchorEl]);

  if (!isOpen || !rect) return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: maxWidth ? Math.min(Math.max(rect.width, minWidth), maxWidth) : Math.max(rect.width, minWidth),
      zIndex: 999999
    }}>
      {children}
    </div>,
    document.body
  );
};

const AddPurchaseReturn = () => {
  const { tenantId, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);

  const [vendors, setVendors] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [stockDataset, setStockDataset] = useState<any>(null);
  const [bankAccountsList, setBankAccountsList] = useState<any[]>([]);
  const [purchaseOrdersList, setPurchaseOrdersList] = useState<any[]>([]);

  // Warehouse Autocomplete State (Top Filter)
  const [warehouseSearchQuery, setWarehouseSearchQuery] = useState('');
  const [isWarehouseDropdownOpen, setIsWarehouseDropdownOpen] = useState(false);
  const [highlightedWarehouseIndex, setHighlightedWarehouseIndex] = useState(0);

  // Vendor Autocomplete State
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [highlightedVendorIndex, setHighlightedVendorIndex] = useState(0);

  // PO Autocomplete State
  const [poSearchQuery, setPoSearchQuery] = useState('');
  const [isPoDropdownOpen, setIsPoDropdownOpen] = useState(false);
  const [highlightedPoIndex, setHighlightedPoIndex] = useState(0);
  const [selectedPoNo, setSelectedPoNo] = useState('');
  const [selectedPoObj, setSelectedPoObj] = useState<any>(null);

  // SKU & Product Search States per row
  const [activeSkuIndex, setActiveSkuIndex] = useState<number | null>(null);
  const [highlightedSkuIndex, setHighlightedSkuIndex] = useState(0);

  const [activeProdNameIndex, setActiveProdNameIndex] = useState<number | null>(null);
  const [highlightedProdNameIndex, setHighlightedProdNameIndex] = useState(0);

  const [activeRowWhIndex, setActiveRowWhIndex] = useState<number | null>(null);
  const [highlightedRowWhIndex, setHighlightedRowWhIndex] = useState(0);

  const skuRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const prodRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const whRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const warehouseContainerRef = useRef<HTMLDivElement>(null);
  const vendorContainerRef = useRef<HTMLDivElement>(null);
  const poContainerRef = useRef<HTMLDivElement>(null);

  const editData = location.state?.returnRecord || location.state?.record;
  const isEditMode = !!editData;
  const [defaultReturnNo] = useState(() => isEditMode && editData?.return_no ? editData.return_no : '');
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
      if (vendorContainerRef.current && !vendorContainerRef.current.contains(target)) {
        setIsVendorDropdownOpen(false);
      }
      if (poContainerRef.current && !poContainerRef.current.contains(target)) {
        setIsPoDropdownOpen(false);
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

        // 1. Fetch Vendors
        const { data: vData } = await supabase.from('vendors').select('*').order('vendor_name', { ascending: true });
        const normalizedVendors = (vData || []).map((v: any) => ({
          id: v.id,
          vendor_name: v.vendor_name || v.name || 'Unnamed Vendor',
          contact_name: v.contact_name || v.contact_person || '',
          phone: v.cell_no || v.phone_no || v.phone || '',
          city: v.city || '',
          address: v.address || ''
        }));
        setVendors(normalizedVendors);

        // 2. Fetch Locations / Warehouses
        const { data: locData } = await supabase.from('inventory_locations').select('*').order('name', { ascending: true });
        const normalizedLocs = (locData || []).map((l: any) => ({
          id: l.id,
          name: l.name || 'Warehouse',
          code: l.code || '',
          address: l.address || ''
        }));
        setLocations(normalizedLocs);

        // 3. Fetch Products
        const { data: prodData } = await supabase.from('products').select('*').order('product_name', { ascending: true });
        setProductList(prodData || []);

        // Load the stock ledger snapshot once (reused for every row's availability check)
        fetchStockDataset().then(setStockDataset).catch(() => setStockDataset(null));

        // 4. Fetch Banks
        const { data: rawBankData } = await supabase.from('banks').select('*');
        const bankData = (rawBankData || []).map((b: any) => ({
          ...b,
          bankName: b.bankName || b.bankname || '',
          accountTitle: b.accountTitle || b.accounttitle || b.account_title || '',
          accountNumber: b.accountNumber || b.accountnumber || ''
        }));
        if (bankData) setBankAccountsList(bankData);

        // 5. Fetch Purchases
        const { data: purData } = await supabase.from('supplier_purchases').select('*').order('id', { ascending: false });
        if (purData) setPurchaseOrdersList(purData);

        // If in Edit Mode, restore state
        if (isEditMode && editData) {
          const vName = editData.vendor_name || '';
          setVendorSearchQuery(vName);

          const whName = editData.source_warehouse || '';
          setWarehouseSearchQuery(whName);

          const poRef = editData.purchase_no || editData.original_purchase_no || editData.metadata?.linkedPurchaseNo || '';
          if (poRef) {
            setSelectedPoNo(poRef);
            setPoSearchQuery(poRef);
            const cleanId = String(poRef).replace(/\D/g, '');
            const matchedPo = purData?.find(p => p.purchase_no === poRef || String(p.id) === cleanId);
            if (matchedPo) setSelectedPoObj(matchedPo);
          } else {
            setPoSearchQuery('');
          }
        }
      } catch (err: any) {
        toast.error('Failed to load return lookup metadata: ' + err.message);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchReturnMetadata();
  }, [isEditMode, editData]);

  // Filtered lists
  const filteredVendors = vendors.filter(v =>
    (v.vendor_name || '').toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
    (v.contact_name || '').toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
    (v.phone || '').toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
    (v.city || '').toLowerCase().includes(vendorSearchQuery.toLowerCase())
  );

  const filteredWarehouses = locations.filter(l =>
    (l.name || '').toLowerCase().includes(warehouseSearchQuery.toLowerCase()) ||
    (l.code || '').toLowerCase().includes(warehouseSearchQuery.toLowerCase()) ||
    (l.address || '').toLowerCase().includes(warehouseSearchQuery.toLowerCase())
  );

  const vendorPurchases = purchaseOrdersList.filter(p =>
    vendorSearchQuery && (p.supplier_name || p.vendor_name || '').toLowerCase() === vendorSearchQuery.toLowerCase()
  );

  const filteredPurchases = vendorPurchases.filter(p => {
    if (!poSearchQuery) return true;
    return (
      (p.purchase_no || '').toLowerCase().includes(poSearchQuery.toLowerCase()) ||
      (p.purchase_date || '').toLowerCase().includes(poSearchQuery.toLowerCase()) ||
      (p.target_warehouse || '').toLowerCase().includes(poSearchQuery.toLowerCase())
    );
  });

  // Extract products bought from the selected vendor
  const getVendorBoughtProducts = (vendorName: string) => {
    const vTrim = (vendorName || '').trim().toLowerCase();
    if (!vTrim) return [];

    const matchedPurchases = purchaseOrdersList.filter(p => {
      const sName = (p.supplier_name || p.vendor_name || '').trim().toLowerCase();
      return sName === vTrim || sName.includes(vTrim) || vTrim.includes(sName);
    });

    if (selectedPoNo && selectedPoObj && selectedPoObj.items) {
      return (selectedPoObj.items || []).map((item: any) => {
        const pName = item.itemName || item.product_name || '';
        const matchingProd = productList.find(p => (p.product_name || '').toLowerCase() === pName.toLowerCase());
        return {
          id: matchingProd?.id || pName,
          product_name: pName,
          item_sr_no: item.sku || matchingProd?.item_sr_no || matchingProd?.sku || '',
          purchase_price: Number(item.rate || item.cost_price || matchingProd?.purchase_price || 0),
          uom: item.uom || matchingProd?.uom || 'Nos',
          totalBoughtQty: Number(item.qty || item.quantity || 0),
          lastPoNo: selectedPoNo,
          current_stock: matchingProd?.current_stock || 0
        };
      });
    }

    const prodMap: Record<string, any> = {};
    matchedPurchases.forEach(pur => {
      (pur.items || []).forEach((item: any) => {
        const pName = item.itemName || item.product_name || '';
        if (!pName) return;
        const key = pName.toLowerCase();
        const matchingProd = productList.find(p => (p.product_name || '').toLowerCase() === key);
        const qty = Number(item.qty || item.quantity || 0);
        const price = Number(item.rate || item.cost_price || 0);

        if (!prodMap[key]) {
          prodMap[key] = {
            id: matchingProd?.id || pName,
            product_name: pName,
            item_sr_no: item.sku || matchingProd?.item_sr_no || matchingProd?.sku || '',
            purchase_price: price || Number(matchingProd?.purchase_price || 0),
            uom: item.uom || matchingProd?.uom || 'Nos',
            totalBoughtQty: qty,
            lastPoNo: pur.purchase_no,
            current_stock: matchingProd?.current_stock || 0
          };
        } else {
          prodMap[key].totalBoughtQty += qty;
          if (price > 0) prodMap[key].purchase_price = price;
        }
      });
    });

    return Object.values(prodMap);
  };

  const validationSchema = Yup.object().shape({
    returnNo: Yup.string().required('Debit Note Return # is required'),
    vendorName: Yup.string().required('Wholesale Vendor selection is required'),
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
      then: () => Yup.string().required('Please select the receiving bank account'),
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
    <div className="mx-auto max-w-full text-xs text-black dark:text-bodydark">

      {/* Top Breadcrumb & Actions */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark mb-6">
        <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-black dark:text-white text-base">
              {isEditMode ? 'Modify Purchase Return (Debit Note)' : 'Create Outbound Purchase Return (Debit Note)'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Return damaged or excess inventory to wholesale supplier and generate balanced debit note credit line
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return/List`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-stroke rounded dark:border-strokedark hover:bg-gray-50 dark:hover:bg-meta-4 transition cursor-pointer text-primary"
          >
            <MdArrowBack size={15} /> Back to Log Registry
          </button>
        </div>

        <Formik
          initialValues={isEditMode && editData ? {
            returnNo: editData.return_no || defaultReturnNo,
            vendorName: editData.vendor_name || '',
            sourceWarehouse: editData.source_warehouse || (locations[0]?.name || 'Main Warehouse'),
            purchaseNo: editData.purchase_no || editData.original_purchase_no || editData.metadata?.linkedPurchaseNo || '',
            returnDate: editData.return_date || new Date().toISOString().split('T')[0],
            paymentTerm: editData.payment_term || (editData.metadata?.cashAmount && editData.metadata?.bankAmount ? 'Split' : 'By Cash'),
            selectedBankId: editData.metadata?.selectedBankId || '',
            amountPaid: editData.amount_paid || 0,
            cashAmountPaid: editData.metadata?.cashAmount || '',
            bankAmountPaid: editData.metadata?.bankAmount || '',
            remarks: editData.remarks || '',
            items: (editData.items || []).map((i: any) => ({
              skuCode: i.sku || i.skuCode || '',
              itemName: i.itemName || i.product_name || '',
              warehouse: i.warehouse || editData.source_warehouse || (locations[0]?.name || 'Main Warehouse'),
              qty: Number(i.qty || i.quantity || 1),
              rate: Number(i.rate || i.cost_price || 0),
              uom: i.uom || 'Nos',
              discountPer: Number(i.discountPer || i.discount_per || 0),
              discountAmt: Number(i.discountAmt || i.discount_amt || 0)
            }))
          } : {
            returnNo: defaultReturnNo,
            vendorName: '',
            sourceWarehouse: locations.length > 0 ? locations[0].name : 'Main Warehouse',
            purchaseNo: '',
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
              warehouse: '',
              qty: 1,
              rate: 0,
              uom: 'Nos'
            }]
          }}
          enableReinitialize={isEditMode}
          onSubmit={async (values) => {
            if (!values.vendorName) {
              toast.error('Validation Error: Please select a wholesale vendor first!');
              return;
            }
            if (!values.sourceWarehouse) {
              toast.error('Validation Error: Please select the source warehouse location!');
              return;
            }

            let grossReturnSum = 0;
            values.items.forEach((item: any) => {
              const gross = (Number(item.qty || 0) * Number(item.rate || 0));
              grossReturnSum += (gross - Number(item.discountAmt || 0));
            });

            if (grossReturnSum <= 0) {
              toast.error('Validation Error: Return items total value must be greater than 0 PKR!');
              return;
            }

            let cashRefund = 0;
            let bankRefund = 0;
            let totalRefundCollected = 0;

            if (values.paymentTerm === 'By Cash') {
              cashRefund = Number(values.amountPaid) || 0;
              totalRefundCollected = cashRefund;
            } else if (values.paymentTerm === 'By Bank') {
              bankRefund = Number(values.amountPaid) || 0;
              totalRefundCollected = bankRefund;
              if (!values.selectedBankId && bankRefund > 0) {
                toast.error('Please select the receiving bank account.');
                return;
              }
            } else if (values.paymentTerm === 'Split') {
              cashRefund = Number(values.cashAmountPaid) || 0;
              bankRefund = Number(values.bankAmountPaid) || 0;
              totalRefundCollected = cashRefund + bankRefund;
              if (!values.selectedBankId && bankRefund > 0) {
                toast.error('Please select the receiving bank account for the bank transfer refund.');
                return;
              }
            }

            if (totalRefundCollected > grossReturnSum) {
              toast.error(`Validation Error: Refund collected (Rs. ${formatMoney(totalRefundCollected)}) cannot exceed the total return value (Rs. ${formatMoney(grossReturnSum)}).`);
              return;
            }

            try {
              setLoading(true);

              if (values.returnNo) {
                let query = supabase.from('purchase_returns').select('id').eq('return_no', values.returnNo);
                if (isEditMode && editData?.id) {
                  query = query.neq('id', editData.id);
                }
                const { data: existingRecords, error: checkError } = await query;
                if (checkError) {
                  toast.error('Failed to validate Debit Note Return #.');
                  setLoading(false);
                  return;
                }
                if (existingRecords && existingRecords.length > 0) {
                  toast.error('Debit Note Return # already exists!');
                  setLoading(false);
                  return;
                }
              }

              // 1. Verify stock using formula-based calculator (same as ProductList breakdown)
              for (const item of values.items) {
                const reqQty = Number(item.qty || 0);
                const pName = item.itemName;
                const effectiveWh = item.warehouse || values.sourceWarehouse;

                const availableQty = await getAvailableStock(pName, effectiveWh, stockDataset);

                if (!isEditMode && reqQty > availableQty) {
                  toast.error(`Stock Shortage Alert: '${pName}' only has ${availableQty} units available in ${effectiveWh}.`);
                  setLoading(false);
                  return;
                }
              }

              // 2. Smart Price-Matching & Newest-First Purchase Invoice Deduction
              // 2. Smart Price-Matching & Oldest-First (FIFO) Purchase Invoice Deduction
              const { data: vendorPurchasesRaw } = await supabase
                .from('supplier_purchases')
                .select('*')
                .ilike('vendor_name', values.vendorName);

              // Sort vendor purchases strictly oldest to newest (FIFO)
              let vendorPurchases = [...(vendorPurchasesRaw || [])].sort((a, b) => {
                const timeA = new Date(a.purchase_date || a.created_at || 0).getTime();
                const timeB = new Date(b.purchase_date || b.created_at || 0).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return (Number(a.id) || 0) - (Number(b.id) || 0);
              });

              if (values.purchaseNo) {
                vendorPurchases = vendorPurchases.filter((p: any) => 
                  p.purchase_no === values.purchaseNo || 
                  String(p.id) === String(values.purchaseNo).replace(/\D/g, '')
                );
              }

              const matchedInvoicesSummary: any[] = [];
              let primaryLinkedPo = values.purchaseNo || selectedPoNo || null;

              for (const item of values.items) {
                const reqQty = Number(item.qty || 0);
                const enteredRate = Number(item.rate || 0);
                const pName = (item.itemName || '').trim().toLowerCase();

                let remainingToMatch = reqQty;
                if (!vendorPurchases || vendorPurchases.length === 0) continue;

                // Tier 1: Look for purchases containing this product at the EXACT entered cost price (oldest to newest)
                const exactRatePurchases = vendorPurchases.filter((pur: any) => {
                  const pItems = Array.isArray(pur.items) ? pur.items : [];
                  return pItems.some((pi: any) => {
                    const matchName = (pi.itemName || pi.product_name || '').trim().toLowerCase() === pName;
                    const matchRate = Math.abs(Number(pi.rate ?? pi.purchase_price ?? pi.cost_price ?? 0) - enteredRate) < 0.01;
                    return matchName && matchRate;
                  });
                });

                // Tier 2: Fallback to all purchases containing this product (oldest to newest)
                const candidateList = exactRatePurchases.length > 0
                  ? exactRatePurchases
                  : vendorPurchases.filter((pur: any) => {
                    const pItems = Array.isArray(pur.items) ? pur.items : [];
                    return pItems.some((pi: any) => (pi.itemName || pi.product_name || '').trim().toLowerCase() === pName);
                  });

                for (const pur of candidateList) {
                  if (remainingToMatch <= 0) break;
                  const pItems = Array.isArray(pur.items) ? pur.items : [];
                  const matchedLine = pItems.find((pi: any) => (pi.itemName || pi.product_name || '').trim().toLowerCase() === pName);
                  if (!matchedLine) continue;

                  const purQty = Number(matchedLine.qty || matchedLine.quantity || 1);
                  const deductQty = Math.min(remainingToMatch, purQty);
                  const invoiceRate = Number(matchedLine.rate ?? matchedLine.purchase_price ?? matchedLine.cost_price ?? enteredRate);

                  matchedInvoicesSummary.push({
                    item_name: item.itemName,
                    sku: item.skuCode || '',
                    purchase_no: pur.purchase_no || `PUR-${pur.id}`,
                    purchase_date: pur.purchase_date || pur.created_at,
                    invoice_rate: invoiceRate,
                    entered_rate: enteredRate,
                    deducted_qty: deductQty,
                    deducted_value: deductQty * invoiceRate,
                    is_exact_rate_match: Math.abs(invoiceRate - enteredRate) < 0.01
                  });

                  if (!primaryLinkedPo) {
                    primaryLinkedPo = pur.purchase_no || `PUR-${pur.id}`;
                  }

                  remainingToMatch -= deductQty;
                }

                if (remainingToMatch > 0) {
                  toast.error(`Validation Error: Cannot return ${reqQty} units of '${pName}'. You only have ${reqQty - remainingToMatch} units available in the ${values.purchaseNo ? 'selected invoice' : 'overall purchase history'} from this vendor.`);
                  setLoading(false);
                  return;
                }
              }

              const databasePayload = {
                return_no: values.returnNo,
                vendor_name: values.vendorName,
                source_warehouse: values.sourceWarehouse,
                warehouse_name: values.sourceWarehouse,
                purchase_no: primaryLinkedPo,
                return_date: values.returnDate,
                payment_term: values.paymentTerm,
                remarks: values.remarks.trim(),
                total_amount: grossReturnSum,
                amount_paid: totalRefundCollected,
                amount_received: totalRefundCollected,
                status: totalRefundCollected >= grossReturnSum ? 'Refunded' : 'Pending',
                items: values.items.map((i: any) => ({
                  sku: i.skuCode || '',
                  itemName: i.itemName,
                  warehouse: i.warehouse || values.sourceWarehouse,
                  qty: Number(i.qty || 0),
                  rate: Number(i.rate || 0),
                  uom: i.uom || 'Nos'
                })),
                metadata: {
                  selectedBankId: (values.paymentTerm === 'By Bank' || values.paymentTerm === 'Split') ? values.selectedBankId : null,
                  linkedPurchaseNo: primaryLinkedPo,
                  matchedInvoices: matchedInvoicesSummary,
                  cashAmount: values.paymentTerm === 'Split' ? cashRefund : (values.paymentTerm === 'By Cash' ? totalRefundCollected : 0),
                  bankAmount: values.paymentTerm === 'Split' ? bankRefund : (values.paymentTerm === 'By Bank' ? totalRefundCollected : 0),
                  paymentTerm: values.paymentTerm
                }
              };

              // 2. Process Stock Adjustments
              let savedRecordId = editData?.id;
              if (isEditMode) {
                // Roll back old return stock (+)
                const { data: oldRtn } = await supabase
                  .from('purchase_returns')
                  .select('items, source_warehouse')
                  .eq('id', editData.id)
                  .single();

                if (oldRtn?.items) {
                  for (const oldItem of oldRtn.items) {
                    const oQty = Number(oldItem.qty || oldItem.quantity || 0);
                    const oName = oldItem.itemName || oldItem.product_name;
                    const oWh = oldItem.warehouse || oldRtn.source_warehouse;

                    // Restore product master
                    const { data: prod } = await supabase.from('products').select('current_stock').ilike('product_name', oName).maybeSingle();
                    if (prod) {
                      await supabase.from('products').update({ current_stock: (Number(prod.current_stock) || 0) + oQty }).ilike('product_name', oName);
                    }

                    // warehouse_inventory retired — formula-based stock is source of truth
                  }
                }

                // Update record
                const { error: updateErr } = await supabase
                  .from('purchase_returns')
                  .update(databasePayload)
                  .eq('id', editData.id);
                if (updateErr) throw updateErr;

                // Log audit activity
                logActivity({
                  action: 'UPDATE',
                  tableName: 'purchase_returns',
                  details: {
                    return_no: values.returnNo || editData.id,
                    vendor_name: selectedVendorName,
                    amount: totalPayable,
                    total_amount: totalPayable,
                    event: 'Updated Purchase Return'
                  },
                  performedBy: user?.name || user?.email || 'User'
                });

                // Deduct new return stock (-)
                for (const newItem of values.items) {
                  const nQty = Number(newItem.qty || 0);
                  const nName = newItem.itemName;
                  const nWh = newItem.warehouse || values.sourceWarehouse;

                  const { data: prod } = await supabase.from('products').select('current_stock').ilike('product_name', nName).maybeSingle();
                  if (prod) {
                    await supabase.from('products').update({ current_stock: Math.max(0, (Number(prod.current_stock) || 0) - nQty) }).ilike('product_name', nName);
                  }

                  // warehouse_inventory retired — formula-based stock is source of truth
                }

              } else {
                // Insert new return record
                const { data: insertedRecord, error: insertErr } = await supabase
                  .from('purchase_returns')
                  .insert([databasePayload])
                  .select('id')
                  .single();
                if (insertErr) throw insertErr;
                savedRecordId = insertedRecord?.id;

                // Log audit activity
                logActivity({
                  action: 'INSERT',
                  tableName: 'purchase_returns',
                  details: {
                    return_no: values.returnNo || savedRecordId,
                    vendor_name: selectedVendorName,
                    amount: totalPayable,
                    total_amount: totalPayable,
                    event: 'Created Purchase Return'
                  },
                  performedBy: user?.name || user?.email || 'User'
                });

                // Deduct stock (-)
                for (const item of values.items) {
                  const qty = Number(item.qty || 0);
                  const pName = item.itemName;
                  const effWh = item.warehouse || values.sourceWarehouse;

                  const { data: prod } = await supabase.from('products').select('current_stock').ilike('product_name', pName).maybeSingle();
                  if (prod) {
                    await supabase.from('products').update({ current_stock: Math.max(0, (Number(prod.current_stock) || 0) - qty) }).ilike('product_name', pName);
                  }

                  // warehouse_inventory retired — formula-based stock is source of truth
                }
              }

              toast.success(isEditMode ? 'Purchase Return updated successfully!' : 'Purchase Return (Debit Note) logged successfully!');
              if (shouldPrintAfterSave && savedRecordId) {
                navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return/Print/${savedRecordId}`);
              } else {
                navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return/List`);
              }

            } catch (err: any) {
              toast.error('Submission Error: ' + err.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {({ handleChange, values, setFieldValue, errors, touched }) => {
            let computedGrossTotal = 0;
            values.items.forEach((i: any) => {
              const gross = (Number(i.qty || 0) * Number(i.rate || 0));
              computedGrossTotal += (gross - Number(i.discountAmt || 0));
            });

            const currentLiquidRefund = values.paymentTerm === 'Split'
              ? (Number(values.cashAmountPaid || 0) + Number(values.bankAmountPaid || 0))
              : (values.paymentTerm === 'On Credit' ? 0 : Number(values.amountPaid || 0));

            const netCreditLineDebt = Math.max(0, computedGrossTotal - currentLiquidRefund);

            const activeVendor = (values.vendorName || vendorSearchQuery || '').trim();
            const boughtProducts = getVendorBoughtProducts(activeVendor);

            const handleProductSelection = (p: any, rowIndex: number) => {
              const displaySku = p.item_sr_no || p.sku || `SKU-${p.id || ''}`;
              const price = Number(p.purchase_price ?? p.cost_price ?? p.rate ?? 0);
              const uom = p.uom || 'Nos';

              const updatedItems = [...values.items];
              const cur = updatedItems[rowIndex] || {};
              updatedItems[rowIndex] = {
                ...cur,
                skuCode: displaySku,
                itemName: p.product_name,
                rate: price,
                uom: uom
              };

              setFieldValue('items', updatedItems);
              setFieldValue(`items.${rowIndex}.skuCode`, displaySku);
              setFieldValue(`items.${rowIndex}.itemName`, p.product_name);
              setFieldValue(`items.${rowIndex}.rate`, price);
              setFieldValue(`items.${rowIndex}.uom`, uom);

              setActiveProdNameIndex(null);
              setActiveSkuIndex(null);
            };

            return (
              <Form className="p-6.5 space-y-6">

                {/* ── TOP METADATA BAR ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                  {/* Return Memo ID */}
                  <div>
                    <label className={`block font-bold mb-1 ${touched.returnNo && errors.returnNo ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      Debit Note Return #: *
                    </label>
                    <input
                      type="text"
                      name="returnNo"
                      onChange={handleChange}
                      value={values.returnNo}
                      placeholder="e.g. RTN-12345"
                      className={`w-full rounded border p-2 font-bold font-mono text-primary outline-none focus:border-primary text-xs bg-transparent ${
                        touched.returnNo && errors.returnNo ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-stroke dark:border-strokedark'
                      }`}
                    />
                  </div>

                  {/* Processing Date */}
                  <div>
                    <label className="block text-gray-500 dark:text-gray-400 font-bold mb-1">
                      Processing Return Date: *
                    </label>
                    <input
                      type="date"
                      name="returnDate"
                      onChange={handleChange}
                      value={values.returnDate}
                      className="w-full rounded border border-stroke dark:border-strokedark p-2 bg-white dark:bg-boxdark font-semibold outline-none text-black dark:text-white text-xs focus:border-primary"
                    />
                  </div>

                  {/* Wholesale Vendor (Searchable Autocomplete) */}
                  <div className="relative" ref={vendorContainerRef}>
                    <label className="block text-gray-500 dark:text-gray-400 font-bold mb-1 flex items-center justify-between">
                      <span>Wholesale Vendor: *</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        disabled={isEditMode}
                        value={vendorSearchQuery}
                        onFocus={() => setIsVendorDropdownOpen(true)}
                        onBlur={() => setIsVendorDropdownOpen(false)}
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
                              const v = filteredVendors[highlightedVendorIndex];
                              setFieldValue('vendorName', v.vendor_name);
                              setVendorSearchQuery(v.vendor_name);
                              setIsVendorDropdownOpen(false);
                            }
                          } else if (e.key === 'Escape') {
                            setIsVendorDropdownOpen(false);
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVendorSearchQuery(val);
                          setFieldValue('vendorName', val);
                          setIsVendorDropdownOpen(true);
                          setHighlightedVendorIndex(0);
                        }}
                        placeholder="Type to search vendor..."
                        className={`w-full rounded border p-2 bg-white dark:bg-boxdark font-bold text-black dark:text-white text-xs outline-none ${touched.vendorName && errors.vendorName ? 'border-red-500' : 'border-stroke dark:border-strokedark focus:border-primary'
                          }`}
                      />

                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {values.vendorName && !isEditMode && (
                          <button
                            type="button"
                            onClick={() => {
                              setFieldValue('vendorName', '');
                              setVendorSearchQuery('');
                            }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <MdClear size={14} />
                          </button>
                        )}
                        <MdSearch className="text-gray-400" size={16} />
                      </div>
                    </div>

                    {/* Vendor Dropdown */}
                    {isVendorDropdownOpen && !isEditMode && (
                      <div className="absolute left-0 top-full mt-1 z-[99999] w-full max-h-56 overflow-y-auto bg-white dark:bg-[#1A222C] border border-stroke dark:border-strokedark rounded-lg shadow-2xl divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredVendors.length > 0 ? (
                          filteredVendors.map((v, vIdx) => (
                            <div
                              key={v.id}
                              onMouseEnter={() => setHighlightedVendorIndex(vIdx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFieldValue('vendorName', v.vendor_name);
                                setVendorSearchQuery(v.vendor_name);
                                setIsVendorDropdownOpen(false);
                              }}
                              className={`p-2.5 cursor-pointer text-xs flex justify-between items-center ${highlightedVendorIndex === vIdx || values.vendorName === v.vendor_name
                                ? 'bg-primary/10 text-primary font-bold'
                                : 'hover:bg-gray-50 dark:hover:bg-slate-800 text-black dark:text-white'
                                }`}
                            >
                              <div>
                                <p className="font-bold">{v.vendor_name}</p>
                                <p className="text-[10px] text-gray-400">{v.contact_name} {v.phone ? `• ${v.phone}` : ''}</p>
                              </div>
                              {v.city && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 font-mono">{v.city}</span>}
                            </div>
                          ))
                        ) : (
                          <div className="p-3 text-center text-xs text-gray-400 italic">No matching vendors found</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Purchase Invoice / Bill Reference */}
                  <div className="relative" ref={poContainerRef}>
                    <label className="block text-gray-500 dark:text-gray-400 font-bold mb-1 flex items-center justify-between">
                      <span>Purchase Invoice (Recommended):</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        disabled={isEditMode || !values.vendorName}
                        value={poSearchQuery}
                        onFocus={() => setIsPoDropdownOpen(true)}
                        onBlur={() => setIsPoDropdownOpen(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlightedPoIndex(prev => Math.min(prev + 1, filteredPurchases.length));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedPoIndex(prev => Math.max(prev - 1, 0));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (filteredPurchases[highlightedPoIndex]) {
                              const p = filteredPurchases[highlightedPoIndex];
                              const pNo = p.purchase_no || `PUR-${p.id}`;
                              setPoSearchQuery(pNo);
                              setSelectedPoNo(pNo);
                              setSelectedPoObj(p);
                              setFieldValue('purchaseNo', pNo);
                              const newFormItems = (p.items || []).map((i: any) => ({
                                skuCode: i.skuCode || i.sku || i.item_sr_no || i.item_code || '',
                                itemName: i.itemName || i.product_name || '',
                                warehouse: values.sourceWarehouse || locations[0]?.name || 'Central Warehouse A',
                                qty: i.qty || i.quantity || 1,
                                rate: i.rate || i.cost_price || 0,
                                uom: i.uom || 'Nos',
                                discountPer: i.discountPer || i.discount_per || 0,
                                discountAmt: i.discountAmt || i.discount_amt || 0
                              }));
                              if (newFormItems.length > 0) setFieldValue('items', newFormItems);
                            }
                            setIsPoDropdownOpen(false);
                          } else if (e.key === 'Escape') {
                            setIsPoDropdownOpen(false);
                          }
                        }}
                        onChange={(e) => {
                          setPoSearchQuery(e.target.value);
                          setIsPoDropdownOpen(true);
                          setHighlightedPoIndex(0);
                        }}
                        placeholder={values.vendorName ? "Type to search invoice..." : "Select Vendor first..."}
                        className={`w-full rounded border p-2 bg-white dark:bg-boxdark font-bold text-black dark:text-white text-xs outline-none border-stroke dark:border-strokedark focus:border-primary`}
                      />
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {poSearchQuery && !isEditMode && (
                          <button
                            type="button"
                            onClick={() => {
                              setPoSearchQuery('');
                              setSelectedPoNo('');
                              setSelectedPoObj(null);
                              setFieldValue('purchaseNo', '');
                              setFieldValue('items', [{ skuCode: '', itemName: '', warehouse: values.sourceWarehouse || locations[0]?.name || 'Central Warehouse A', qty: 1, rate: 0, uom: 'Nos' }]);
                            }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <MdClear size={14} />
                          </button>
                        )}
                        <MdKeyboardArrowDown className="text-gray-400" size={16} />
                      </div>
                    </div>
                    {/* PO Dropdown */}
                    {isPoDropdownOpen && !isEditMode && values.vendorName && (
                      <div className="absolute left-0 top-full mt-1 z-[99999] w-full max-h-56 overflow-y-auto bg-white dark:bg-[#1A222C] border border-stroke dark:border-strokedark rounded-lg shadow-2xl divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredPurchases.length > 0 ? (
                          filteredPurchases.map((p, idx) => {
                            const pNo = p.purchase_no || `PUR-${p.id}`;
                            return (
                              <div
                                key={p.id}
                                onMouseEnter={() => setHighlightedPoIndex(idx)}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setPoSearchQuery(pNo);
                                  setSelectedPoNo(pNo);
                                  setSelectedPoObj(p);
                                  setFieldValue('purchaseNo', pNo);
                                  const newFormItems = (p.items || []).map((i: any) => ({
                                    skuCode: i.skuCode || i.sku || i.item_sr_no || i.item_code || '',
                                    itemName: i.itemName || i.product_name || '',
                                    warehouse: values.sourceWarehouse || locations[0]?.name || 'Central Warehouse A',
                                    qty: i.qty || i.quantity || 1,
                                    rate: i.rate || i.cost_price || 0,
                                    uom: i.uom || 'Nos',
                                    discountPer: i.discountPer || i.discount_per || 0,
                                    discountAmt: i.discountAmt || i.discount_amt || 0
                                  }));
                                  if (newFormItems.length > 0) setFieldValue('items', newFormItems);
                                  setIsPoDropdownOpen(false);
                                }}
                                className={`p-2.5 cursor-pointer text-xs flex justify-between items-center ${highlightedPoIndex === idx || selectedPoNo === pNo ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-gray-50 dark:hover:bg-slate-800 text-black dark:text-white'}`}
                              >
                                <div>
                                  <p className="font-bold">{pNo}</p>
                                  <p className="text-[10px] text-gray-400">{p.purchase_date || p.created_at?.substring(0, 10)}</p>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 font-mono">Rs. {p.total_amount}</span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-3 text-center text-xs text-gray-400 italic">No invoices found</div>
                        )}
                      </div>
                    )}
                  </div>

                </div>

                {/* ── RETURNED PRODUCT INVENTORY MANIFEST TABLE ── */}
                <div className="w-full">
                  <FieldArray name="items">
                    {({ push, remove }) => {
                      const hasDiscount = values.items.some((i: any) => Number(i.discountAmt) > 0 || Number(i.discountPer) > 0);
                      const isAnyTableDropdownOpen = activeSkuIndex !== null || activeProdNameIndex !== null;
                      return (
                        <div className={`border border-stroke dark:border-strokedark rounded-sm relative z-30 overflow-x-auto bg-white dark:bg-boxdark transition-all duration-200 pb-4`}>
                          <div className="w-full min-w-max">
                            <table className="w-full table-auto border-collapse text-left text-xs">
                              <thead>
                                <tr className="bg-gray-2 text-left dark:bg-meta-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                                  <th className="p-2 w-10 text-center">S#</th>
                                  <th className="p-2 w-36">Code (Search)</th>
                                  <th className="p-2 min-w-[200px]">Product Description</th>
                                  <th className="p-2 w-36">Destination Warehouse</th>
                                  <th className="p-2 w-32 text-center">Return Qty (Boxes / Pcs)</th>
                                  <th className="p-2 w-28 text-right">Cost Price (PKR)</th>
                                  {hasDiscount && (
                                    <>
                                      <th className="p-2 w-20 text-center text-amber-700 bg-amber-50/40 dark:bg-amber-950/20">Disc %</th>
                                      <th className="p-2 w-28 text-right text-amber-700 bg-amber-50/40 dark:bg-amber-950/20">Disc Amt</th>
                                    </>
                                  )}
                                  <th className="p-2 w-28 text-right pr-4">Net Total</th>
                                  <th className="p-2 w-10 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stroke dark:divide-strokedark">
                                {values.items.map((item: any, idx: number) => {
                                  const gross = (Number(item.qty || 0) * Number(item.rate || 0));
                                  const lineTotal = gross - Number(item.discountAmt || 0);

                                  const isCurrentSkuActive = activeSkuIndex === idx;
                                  const isCurrentProdNameActive = activeProdNameIndex === idx;

                                  // All candidate products: prioritize vendor products, and include general catalog
                                  const candidateProducts = boughtProducts.length > 0 ? boughtProducts : productList;

                                  const matchedProduct = productList.find((p: any) =>
                                    (item.itemName && p.product_name === item.itemName) ||
                                    (item.skuCode && (p.item_sr_no === item.skuCode || p.sku === item.skuCode || `SKU-${p.id}` === item.skuCode))
                                  );

                                  const rawPcs = Number(matchedProduct?.pieces_per_box ?? matchedProduct?.pcs_per_box ?? matchedProduct?.pieces_per_packing ?? 0);
                                  const isTile = Boolean(
                                    matchedProduct && (
                                      String(matchedProduct.category || '').toLowerCase().includes('tile') ||
                                      String(matchedProduct.scenario_name || '').toLowerCase().includes('tile')
                                    ) && (rawPcs > 1 || String(matchedProduct.scenario_name || '').toLowerCase().includes('tile'))
                                  );
                                  const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);
                                  const uomString = matchedProduct ? matchedProduct.uom : (item.uom || 'NOS');

                                  return (
                                    <tr
                                      key={idx}
                                      className={`text-xs transition ${isCurrentSkuActive || isCurrentProdNameActive
                                        ? 'relative z-50 bg-slate-50/90 dark:bg-meta-4/20'
                                        : 'relative z-10 bg-white dark:bg-boxdark hover:bg-slate-50 dark:hover:bg-meta-4/10'
                                        }`}
                                    >
                                      <td className="p-3 text-center text-gray-400 font-sans">{idx + 1}</td>

                                      {/* 1. Searchable Code */}
                                      <td className="p-3 relative sku-container">
                                        {(() => {
                                          const query = (item.skuCode || '').toLowerCase().trim();
                                          const filteredBySku = candidateProducts.filter((p: any) => {
                                            if (!query) return true;
                                            const sku = (p.item_sr_no || p.sku || `SKU-${p.id || ''}`).toLowerCase();
                                            const name = (p.product_name || '').toLowerCase();
                                            return sku.includes(query) || name.includes(query);
                                          });

                                          return (
                                            <div className="relative">
                                              <input
                                                type="text"
                                                autoComplete="off"
                                                ref={(el) => { skuRefs.current[idx] = el; }}
                                                name={`items.${idx}.skuCode`}
                                                value={item.skuCode || ''}
                                                onFocus={() => {
                                                  setActiveSkuIndex(idx);
                                                  setActiveProdNameIndex(null);
                                                  setHighlightedSkuIndex(0);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    setHighlightedSkuIndex(prev => prev < filteredBySku.length - 1 ? prev + 1 : 0);
                                                  } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    setHighlightedSkuIndex(prev => prev > 0 ? prev - 1 : filteredBySku.length - 1);
                                                  } else if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (filteredBySku[highlightedSkuIndex]) {
                                                      handleProductSelection(filteredBySku[highlightedSkuIndex], idx);
                                                    }
                                                  } else if (e.key === 'Escape' || e.key === 'Tab') {
                                                    setActiveSkuIndex(null);
                                                  }
                                                }}
                                                onChange={(e) => {
                                                  setFieldValue(`items.${idx}.skuCode`, e.target.value);
                                                  setActiveSkuIndex(idx);
                                                }}
                                                placeholder="TYPE SKU..."
                                                className="w-full rounded border border-stroke dark:border-strokedark p-1.5 bg-transparent font-mono font-bold text-xs uppercase outline-none focus:border-primary"
                                              />

                                              {/* Floating SKU Dropdown */}
                                              <DropdownPortal isOpen={isCurrentSkuActive && filteredBySku.length > 0} anchorEl={skuRefs.current[idx]}>
                                                <div className="w-full max-h-56 overflow-y-auto bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl divide-y divide-slate-100 dark:divide-slate-800">
                                                  {filteredBySku.map((prod: any, pIdx: number) => {
                                                    const displaySku = prod.item_sr_no || prod.sku || `SKU-${prod.id || ''}`;
                                                    return (
                                                      <div
                                                        key={prod.id || pIdx}
                                                        onMouseEnter={() => setHighlightedSkuIndex(pIdx)}
                                                        onMouseDown={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          handleProductSelection(prod, idx);
                                                        }}
                                                        onClick={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          handleProductSelection(prod, idx);
                                                        }}
                                                        className={`p-2.5 cursor-pointer text-xs flex justify-between items-center ${highlightedSkuIndex === pIdx
                                                          ? 'bg-primary/10 text-primary font-bold'
                                                          : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                                                          }`}
                                                      >
                                                        <div>
                                                          <p className="font-bold text-black dark:text-white">{prod.product_name}</p>
                                                          <p className="text-[10px] font-mono text-gray-400">{displaySku}</p>
                                                        </div>
                                                        <span className="font-mono font-bold text-emerald-600">
                                                          Rs. {formatMoney(prod.purchase_price || prod.price || 0)}
                                                        </span>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </DropdownPortal>
                                            </div>
                                          );
                                        })()}
                                      </td>

                                      {/* 2. Description / Description (Rich Two-Way Dropdown matching Purchases page) */}
                                      <td className="p-3 relative prod-name-container min-w-[280px]">
                                        {(() => {
                                          const query = (item.itemName || '').toLowerCase().trim();
                                          const filteredByName = candidateProducts.filter((p: any) => {
                                            if (!query) return true;
                                            const name = (p.product_name || '').toLowerCase();
                                            const sku = (p.item_sr_no || p.sku || `SKU-${p.id || ''}`).toLowerCase();
                                            return name.includes(query) || sku.includes(query);
                                          });

                                          return (
                                            <div className="relative">
                                              <input
                                                type="text"
                                                autoComplete="off"
                                                ref={(el) => { prodRefs.current[idx] = el; }}
                                                name={`items.${idx}.itemName`}
                                                value={item.itemName || ''}
                                                onFocus={() => {
                                                  setActiveProdNameIndex(idx);
                                                  setActiveSkuIndex(null);
                                                  setHighlightedProdNameIndex(0);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    setHighlightedProdNameIndex(prev => prev < filteredByName.length - 1 ? prev + 1 : 0);
                                                  } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    setHighlightedProdNameIndex(prev => prev > 0 ? prev - 1 : filteredByName.length - 1);
                                                  } else if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (filteredByName[highlightedProdNameIndex]) {
                                                      handleProductSelection(filteredByName[highlightedProdNameIndex], idx);
                                                    }
                                                  } else if (e.key === 'Escape' || e.key === 'Tab') {
                                                    setActiveProdNameIndex(null);
                                                  }
                                                }}
                                                onChange={(e) => {
                                                  const typed = e.target.value;
                                                  setFieldValue(`items.${idx}.itemName`, typed);
                                                  setActiveProdNameIndex(idx);
                                                  setHighlightedProdNameIndex(0);

                                                  const matched = candidateProducts.find(
                                                    (p: any) => p.product_name && p.product_name.toLowerCase() === typed.trim().toLowerCase()
                                                  );
                                                  if (matched) {
                                                    handleProductSelection(matched, idx);
                                                  }
                                                }}
                                                placeholder="Search Description..."
                                                className="w-full bg-white dark:bg-boxdark font-bold border border-stroke dark:border-strokedark rounded p-1.5 outline-none text-xs text-black dark:text-white focus:border-primary shadow-xs"
                                              />

                                              {/* Rich Dropdown (Pixel-perfect matching Purchases page) */}
                                              <DropdownPortal isOpen={isCurrentProdNameActive && filteredByName.length > 0} anchorEl={prodRefs.current[idx]} minWidth={340} maxWidth={420}>
                                                <div className="w-full max-h-[290px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300">
                                                  {filteredByName.map((p: any, pIdx: number) => {
                                                    const displaySku = p.item_sr_no || p.sku || `SKU-${p.id || ''}`;
                                                    const isHighlighted = pIdx === highlightedProdNameIndex;
                                                    return (
                                                      <div
                                                        key={p.id || pIdx}
                                                        onMouseEnter={() => setHighlightedProdNameIndex(pIdx)}
                                                        onMouseDown={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          handleProductSelection(p, idx);
                                                        }}
                                                        onClick={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          handleProductSelection(p, idx);
                                                        }}
                                                        className={`p-3 cursor-pointer transition flex items-center justify-between group ${isHighlighted
                                                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500'
                                                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                                                          }`}
                                                      >
                                                        <div className="flex flex-col gap-0.5 text-left pr-2">
                                                          <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 leading-tight">
                                                            {p.product_name}
                                                          </span>
                                                          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
                                                            <span>{displaySku}</span>
                                                            {p.totalBoughtQty && (
                                                              <span className="text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">
                                                                Bought: {p.totalBoughtQty} {p.uom || 'Nos'}
                                                              </span>
                                                            )}
                                                          </div>
                                                        </div>
                                                        <div className="text-right font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                                                          Rs. {formatMoney(p.purchase_price || p.price || 0)}
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </DropdownPortal>
                                            </div>
                                          );
                                        })()}
                                      </td>

                                      {/* 3. Destination Warehouse */}
                                      <td className="p-3 relative row-wh-container min-w-[180px]">
                                        {(() => {
                                          const whQuery = (item.warehouse || '').toLowerCase().trim();
                                          const filteredWarehouses = locations.filter(loc => {
                                            if (!whQuery) return true;
                                            return (loc.name || '').toLowerCase().includes(whQuery) || (loc.code || '').toLowerCase().includes(whQuery);
                                          });
                                          const isCurrentWhActive = activeRowWhIndex === idx;

                                          return (
                                            <div className="relative">
                                              <input
                                                type="text"
                                                autoComplete="off"
                                                ref={(el) => { whRefs.current[idx] = el; }}
                                                name={`items.${idx}.warehouse`}
                                                value={item.warehouse || ''}
                                                onFocus={() => {
                                                  setActiveRowWhIndex(idx);
                                                  setActiveSkuIndex(null);
                                                  setActiveProdNameIndex(null);
                                                  setHighlightedRowWhIndex(0);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    setHighlightedRowWhIndex(prev => prev < filteredWarehouses.length - 1 ? prev + 1 : 0);
                                                  } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    setHighlightedRowWhIndex(prev => prev > 0 ? prev - 1 : filteredWarehouses.length - 1);
                                                  } else if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (filteredWarehouses[highlightedRowWhIndex]) {
                                                      setFieldValue(`items.${idx}.warehouse`, filteredWarehouses[highlightedRowWhIndex].name);
                                                      setActiveRowWhIndex(null);
                                                    }
                                                  } else if (e.key === 'Escape' || e.key === 'Tab') {
                                                    setActiveRowWhIndex(null);
                                                  }
                                                }}
                                                onChange={(e) => {
                                                  setFieldValue(`items.${idx}.warehouse`, e.target.value);
                                                  setActiveRowWhIndex(idx);
                                                }}
                                                placeholder="Select Warehouse..."
                                                className="w-full bg-white dark:bg-boxdark font-bold border border-stroke dark:border-strokedark rounded p-1.5 outline-none text-xs text-black dark:text-white focus:border-primary shadow-xs"
                                              />

                                              {/* Floating Warehouse Dropdown via Portal */}
                                              <DropdownPortal isOpen={isCurrentWhActive && filteredWarehouses.length > 0} anchorEl={whRefs.current[idx]} minWidth={240}>
                                                <div className="w-full max-h-56 overflow-y-auto bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl divide-y divide-slate-100 dark:divide-slate-800">
                                                  {filteredWarehouses.map((loc: any, wIdx: number) => {
                                                    const isHighlighted = wIdx === highlightedRowWhIndex;
                                                    const isSelected = item.warehouse === loc.name;
                                                    return (
                                                      <div
                                                        key={loc.id || wIdx}
                                                        onMouseEnter={() => setHighlightedRowWhIndex(wIdx)}
                                                        onMouseDown={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          setFieldValue(`items.${idx}.warehouse`, loc.name);
                                                          setActiveRowWhIndex(null);
                                                        }}
                                                        onClick={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          setFieldValue(`items.${idx}.warehouse`, loc.name);
                                                          setActiveRowWhIndex(null);
                                                        }}
                                                        className={`p-2.5 text-xs font-semibold cursor-pointer transition flex items-center justify-between ${isHighlighted || isSelected
                                                          ? 'bg-primary/10 text-primary font-bold'
                                                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-100'
                                                          }`}
                                                      >
                                                        <div className="flex flex-col text-left">
                                                          <span className="font-bold text-xs">{loc.name}</span>
                                                          {loc.code && <span className="text-[10px] text-gray-400 font-mono">{loc.code}</span>}
                                                        </div>
                                                        {isSelected && (
                                                          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">Selected</span>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </DropdownPortal>
                                            </div>
                                          );
                                        })()}
                                      </td>

                                      {/* 4. Arrived Qty with Dedicated Boxes & Loose Pieces & Sq.Mtr for Tiles */}
                                      <td className="p-3 min-w-[260px]">
                                        {isTile ? (
                                          (() => {
                                            let tileWidthCm = 60;
                                            let tileHeightCm = 60;
                                            const desc = matchedProduct?.product_description || '';
                                            const sku = matchedProduct?.item_sr_no || '';
                                            const sizeMatch = desc.match(/Size:\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm/i) ||
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
                                              <div className="flex flex-col gap-1">
                                                {/* Top Badges */}
                                                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-1 font-mono">
                                                  <span className="text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800/60 font-bold">
                                                    Box: {perBoxSqm.toFixed(2)} sq.m
                                                  </span>
                                                  <span className="text-emerald-700 dark:emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60 font-bold">
                                                    Pc: {perPieceSqm.toFixed(4)} sq.m
                                                  </span>
                                                </div>

                                                {/* Inputs Container: Boxes + Loose Pieces */}
                                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/90 p-1.5 rounded-lg border border-stroke dark:border-strokedark shadow-inner">
                                                  <div className="flex-1 flex items-center bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded-md px-2 py-1 focus-within:border-primary shadow-sm">
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
                                                      className="w-full bg-transparent text-center font-black text-sm text-primary outline-none min-w-[36px]"
                                                    />
                                                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 pl-1 select-none">Box</span>
                                                  </div>

                                                  <span className="text-gray-400 font-black text-sm select-none">+</span>

                                                  <div className="flex-1 flex items-center bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded-md px-2 py-1 focus-within:border-emerald-500 shadow-sm">
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
                                                      className="w-full bg-transparent text-center font-black text-sm text-emerald-600 dark:text-emerald-400 outline-none min-w-[36px]"
                                                    />
                                                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 pl-1 select-none">Pcs</span>
                                                  </div>
                                                </div>

                                                {/* Bottom Total Sq.Mtr */}
                                                <div className="text-center font-mono text-[10px] font-bold text-teal-800 dark:text-teal-300 bg-teal-50/70 dark:bg-teal-950/30 rounded py-0.5 border border-teal-200/60 dark:border-teal-800/40">
                                                  Total: <span className="text-xs font-black">{totalLineSqm.toFixed(2)}</span> sq.m
                                                  <span className="text-slate-400 font-sans font-normal ml-1">({boxes} Box{boxes !== 1 ? 'es' : ''}{loosePcs > 0 ? ` + ${loosePcs} Pcs` : ''})</span>
                                                </div>
                                              </div>
                                            );
                                          })()
                                        ) : (
                                          /* STANDARD SINGLE QTY INPUT FOR NON-TILE ITEMS */
                                          (() => {
                                            const u = String(item.uom || uomString || matchedProduct?.uom || '').trim().toUpperCase();
                                            const isDecimalUom = [
                                              'KG', 'KILOGRAM', 'GM', 'GRAM', 'TON', 'METRIC TON', 'LBS',
                                              'LTR', 'LITER', 'LITRE', 'ML', 'GAL',
                                              'MTR', 'METER', 'FT', 'FEET', 'INCH', 'CM', 'MM', 'YD',
                                              'SQM', 'SQ.M', 'SQ.MTR', 'SQ.FT', 'SQF', 'SQY', 'SQUARE METER'
                                            ].includes(u);

                                            return (
                                              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 rounded px-2 py-1 border border-stroke dark:border-strokedark">
                                                <input
                                                  type="text"
                                                  inputMode={isDecimalUom ? "decimal" : "numeric"}
                                                  onKeyDown={(e) => {
                                                    blockInvalidChar(e);
                                                    if (!isDecimalUom && (e.key === '.' || e.key === 'Decimal')) {
                                                      e.preventDefault();
                                                    }
                                                  }}
                                                  name={`items.${idx}.qty`}
                                                  value={item.qty === 0 ? '' : item.qty}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    const regex = isDecimalUom ? /^\d*\.?\d*$/ : /^\d*$/;
                                                    if (val === '' || regex.test(val)) {
                                                      setFieldValue(`items.${idx}.qty`, val);
                                                      const newQty = Number(val) || 0;
                                                      const dPer = Number(item.discountPer) || 0;
                                                      if (dPer > 0) {
                                                        const rate = Number(item.rate) || 0;
                                                        const gross = newQty * rate;
                                                        setFieldValue(`items.${idx}.discountAmt`, Number(((gross * dPer) / 100).toFixed(2)));
                                                      }
                                                    }
                                                  }}
                                                  placeholder="1"
                                                  className="w-full bg-transparent text-center font-bold text-xs text-black dark:text-white outline-none"
                                                />
                                                <span className="text-[10px] font-mono text-gray-400 uppercase select-none w-8 text-center">
                                                  {item.uom || uomString || 'NOS'}
                                                </span>
                                              </div>
                                            );
                                          })()
                                        )}
                                      </td>

                                      {/* 5. Cost Price (PKR) */}
                                      <td className="p-3">
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          name={`items.${idx}.rate`}
                                          onKeyDown={blockInvalidChar}
                                          onChange={(e) => {
                                            const newRate = Math.max(0, Number(e.target.value) || 0);
                                            setFieldValue(`items.${idx}.rate`, newRate);
                                            const cost = (Number(item.qty) || 0) * newRate;
                                            if (Number(item.discountPer) > 0) {
                                              setFieldValue(`items.${idx}.discountAmt`, Number(((cost * Number(item.discountPer)) / 100).toFixed(2)));
                                            }
                                          }}
                                          value={item.rate}
                                          className="w-full rounded border border-stroke dark:border-strokedark bg-white dark:bg-boxdark p-1.5 text-right font-bold font-mono text-xs outline-none focus:border-primary text-black dark:text-white"
                                        />
                                      </td>

                                      {/* Discount Columns */}
                                      {hasDiscount && (
                                        <>
                                          <td className="p-2 w-20 min-w-[80px] bg-amber-50/30 dark:bg-amber-950/10">
                                            <input
                                              type="number"
                                              min="0"
                                              step="any"
                                              onKeyDown={blockInvalidChar}
                                              name={`items.${idx}.discountPer`}
                                              value={item.discountPer ?? 0}
                                              onChange={(e) => {
                                                const rawVal = e.target.value;
                                                setFieldValue(`items.${idx}.discountPer`, rawVal);
                                                const dPer = Number(rawVal);
                                                if (!isNaN(dPer) && dPer >= 0) {
                                                  const g = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                                                  setFieldValue(`items.${idx}.discountAmt`, Number(((g * dPer) / 100).toFixed(2)));
                                                }
                                              }}
                                              placeholder="0"
                                              className="w-full text-center font-bold font-mono text-amber-700 bg-white dark:bg-boxdark border border-amber-300 rounded p-1 text-xs outline-none"
                                            />
                                          </td>
                                          <td className="p-2 w-28 min-w-[100px] bg-amber-50/30 dark:bg-amber-950/10">
                                            <input
                                              type="number"
                                              min="0"
                                              step="any"
                                              onKeyDown={blockInvalidChar}
                                              name={`items.${idx}.discountAmt`}
                                              value={item.discountAmt ?? 0}
                                              onChange={(e) => {
                                                const rawVal = e.target.value;
                                                setFieldValue(`items.${idx}.discountAmt`, rawVal);
                                                const dAmt = Number(rawVal);
                                                if (!isNaN(dAmt) && dAmt >= 0 && Number(item.rate) > 0 && Number(item.qty) > 0) {
                                                  const g = Number(item.qty) * Number(item.rate);
                                                  setFieldValue(`items.${idx}.discountPer`, Number(((dAmt / g) * 100).toFixed(2)));
                                                }
                                              }}
                                              placeholder="0"
                                              className="w-full text-right font-bold font-mono text-amber-700 bg-white dark:bg-boxdark border border-amber-300 rounded p-1 text-xs outline-none"
                                            />
                                          </td>
                                        </>
                                      )}

                                      {/* 6. Net Total Line */}
                                      <td className="p-3 text-right font-mono font-bold text-success pr-4 text-xs">
                                        Rs. {formatMoney(lineTotal)}
                                      </td>

                                      {/* 7. Action */}
                                      <td className="p-3 text-center">
                                        {values.items.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => remove(idx)}
                                            className="text-danger hover:opacity-80 p-1 cursor-pointer"
                                          >
                                            <MdDelete size={16} />
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }}
                  </FieldArray>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        const newRow = {
                          skuCode: '',
                          itemName: '',
                          warehouse: values.sourceWarehouse || (locations[0]?.name || 'Central Warehouse A'),
                          qty: 1,
                          rate: 0,
                          uom: 'Nos'
                        };
                        setFieldValue('items', [...values.items, newRow]);
                      }}
                      className="rounded bg-primary py-2 px-4 text-xs font-medium text-white hover:bg-opacity-90 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <MdAdd size={16} /> Add Row Line
                    </button>
                  </div>
                </div>

                {/* ── BOTTOM SECTION: REIMBURSEMENT & TOTAL BILL VALUE ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-stroke dark:border-strokedark">

                  {/* Left Side: Settlement Mode & Notes */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-gray-500 dark:text-gray-400 font-bold mb-1">
                        Payment Method / Settlement Mode: *
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
                        className="w-full rounded border border-stroke dark:border-strokedark p-2 bg-transparent text-xs text-black dark:text-white font-bold outline-none focus:border-primary dark:bg-boxdark"
                      >
                        <option value="On Credit">On Credit (Deduct from Vendor Payable Ledger)</option>
                        <option value="By Cash">Cash Only (Refund Received)</option>
                        <option value="By Bank">Bank Wire Only</option>
                        <option value="Split">Split (Cash + Bank Combined)</option>
                      </select>
                    </div>

                    {(values.paymentTerm === 'By Bank' || values.paymentTerm === 'Split') && (
                      <div>
                        <label className="block text-gray-500 dark:text-gray-400 font-bold mb-1">
                          Receiving Bank Account: *
                        </label>
                        <select
                          name="selectedBankId"
                          onChange={handleChange}
                          value={values.selectedBankId}
                          className="w-full rounded border border-stroke dark:border-strokedark p-2 bg-transparent text-xs text-black dark:text-white font-bold outline-none focus:border-primary dark:bg-boxdark"
                        >
                          <option value="">-- Select Bank Account --</option>
                          {bankAccountsList.map(b => (
                            <option key={b.id} value={b.bankName}>
                              {b.bankName} - {b.accountTitle} ({b.accountNumber || '-'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {values.paymentTerm === 'Split' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-gray-500 dark:text-gray-400 font-bold mb-1 text-[11px]">
                            Cash Portion (PKR):
                          </label>
                          <input
                            type="number"
                            name="cashAmountPaid"
                            placeholder="0"
                            onKeyDown={blockInvalidChar}
                            onChange={handleChange}
                            value={values.cashAmountPaid}
                            className="w-full rounded border border-stroke dark:border-strokedark p-2 text-xs font-bold font-mono outline-none focus:border-primary text-black dark:text-white bg-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-500 dark:text-gray-400 font-bold mb-1 text-[11px]">
                            Bank Portion (PKR):
                          </label>
                          <input
                            type="number"
                            name="bankAmountPaid"
                            placeholder="0"
                            onKeyDown={blockInvalidChar}
                            onChange={handleChange}
                            value={values.bankAmountPaid}
                            className="w-full rounded border border-stroke dark:border-strokedark p-2 text-xs font-bold font-mono outline-none focus:border-primary text-black dark:text-white bg-transparent"
                          />
                        </div>
                      </div>
                    )}

                    {(values.paymentTerm === 'By Cash' || values.paymentTerm === 'By Bank') && (
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-gray-600 dark:text-gray-400 font-bold">
                            Cash Refund Received (PKR):
                          </label>
                          {computedGrossTotal > 0 && (
                            <button
                              type="button"
                              onClick={() => setFieldValue('amountPaid', computedGrossTotal)}
                              className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                            >
                              ⚡ Pay Full Refund (Rs. {formatMoney(computedGrossTotal)})
                            </button>
                          )}
                        </div>
                        <input
                          type="number"
                          name="amountPaid"
                          placeholder="0"
                          onKeyDown={blockInvalidChar}
                          onChange={handleChange}
                          value={values.amountPaid}
                          className="w-full rounded border border-stroke dark:border-strokedark p-2 text-xs font-bold font-mono outline-none focus:border-primary text-black dark:text-white bg-transparent"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-gray-500 dark:text-gray-400 font-bold mb-1">
                        Purchase Return Memo / Remarks:
                      </label>
                      <textarea
                        name="remarks"
                        rows={2}
                        onChange={handleChange}
                        value={values.remarks}
                        placeholder="Describe fault metrics, batch breakage, or debit credit arrangement..."
                        className="w-full rounded border border-stroke dark:border-strokedark p-2 bg-transparent text-xs text-black dark:text-white font-semibold outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Right Side: Total Bill Value Card */}
                  <div className="flex flex-col justify-between space-y-4">
                    <div className="space-y-3 font-mono">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-sans font-bold text-gray-600 dark:text-gray-400">Total Return Value:</span>
                        <strong className="text-black dark:text-white font-bold text-base">
                          Rs. {formatMoney(computedGrossTotal)}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center text-sm text-success">
                        <span className="font-sans font-medium">Refund Collected:</span>
                        <strong className="font-bold">
                          - Rs. {formatMoney(currentLiquidRefund)}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center text-sm text-primary pt-2 border-t border-stroke dark:border-strokedark">
                        <span className="font-sans font-bold">Remaining Debit Note Credit Line:</span>
                        <strong className="font-bold text-base">
                          Rs. {formatMoney(netCreditLineDebt)}
                        </strong>
                      </div>
                    </div>

                    {/* Submit Actions */}
                    <div className="flex items-center justify-end gap-3 pt-6">
                      <button
                        type="button"
                        onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return/List`)}
                        className="rounded border border-stroke py-2.5 px-6 font-medium text-black hover:shadow-1 dark:border-strokedark dark:text-white transition text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShouldPrintAfterSave(true);
                          handleSubmit();
                        }}
                        disabled={loading}
                        className="rounded bg-rose-600 hover:bg-rose-700 py-2.5 px-6 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <FiPrinter size={14} />
                        <span>Save & Print</span>
                      </button>
                      <button
                        type="submit"
                        onClick={() => setShouldPrintAfterSave(false)}
                        disabled={loading}
                        className="rounded bg-primary py-2.5 px-8 font-bold text-white hover:bg-opacity-90 transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                      >
                        {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Return' : 'Save & Post Return'}</span>}
                      </button>
                    </div>

                  </div>

                </div>

              </Form>
            );
          }}
        </Formik>

      </div>
    </div>
  );
};

export default AddPurchaseReturn;
