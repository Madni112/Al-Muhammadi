import React, { useState, useEffect, useRef } from 'react';
import { getAvailableStock, getTotalAvailableStock, fetchStockDataset } from '../../../utils/stockCalculator';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiPrinter, FiSave, FiCheck, FiX, FiUserCheck, FiTrash2, FiUser } from 'react-icons/fi';
import { SearchableDropdown } from '../../../components/SearchableDropdown';
import { useAuth } from '../../../Context/Auth';

const NewInvoice = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId, role, userName } = useAuth();
  const currentRole = (role || localStorage.getItem('zac_user_role') || '').toLowerCase();
  const currentSalesmanName = (userName || localStorage.getItem('zac_user_name') || '').trim();
  const isSalesman = currentRole.includes('salesman');
  const editData = location.state?.invoice || location.state?.record || null;

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [submitAction, setSubmitAction] = useState<'save' | 'print'>('save');

  const [customersList, setCustomersList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [salesmenList, setSalesmenList] = useState<any[]>([]);
  const matchedSalesman = salesmenList.find(
    (s) => (s.name || '').toLowerCase().trim() === currentSalesmanName.toLowerCase()
  )?.name || currentSalesmanName;
  const [transportList, setTransportList] = useState<any[]>([]);
  const [warehousesList, setWarehousesList] = useState<any[]>([]);
  const [stockDataset, setStockDataset] = useState<any>(null);
  const productDropdownScrollRef = useRef<HTMLDivElement>(null);
  const [banksList, setBanksList] = useState<any[]>([]);
  const [activeSkuIndex, setActiveSkuIndex] = useState<number | null>(null);
  const [highlightedSkuIndex, setHighlightedSkuIndex] = useState<number>(0);
  const [activeProdNameIndex, setActiveProdNameIndex] = useState<number | null>(null);
  const [highlightedProdNameIndex, setHighlightedProdNameIndex] = useState<number>(0);
  const [activeWhIndex, setActiveWhIndex] = useState<number | null>(null);
  const [highlightedWhIndex, setHighlightedWhIndex] = useState<number>(0);

  const [showCustomerModal, setShowCustomerModal] = useState<boolean>(false);
  const [customerModalType, setCustomerModalType] = useState<'walkin' | 'recorded'>('walkin');
  const [walkinName, setWalkinName] = useState<string>('');
  const [walkinPhone, setWalkinPhone] = useState<string>('');
  const [recordWalkinCustomer, setRecordWalkinCustomer] = useState<boolean>(true);
  const [selectedRecordedCustomer, setSelectedRecordedCustomer] = useState<string>('');
  const [pendingFormValues, setPendingFormValues] = useState<any>(null);
  const [serverToday, setServerToday] = useState<Date | null>(null);

  useEffect(() => {
    // Fetch server date so validation is not based on user's local clock
    supabase.rpc('get_server_date').then(({ data }) => {
      if (data) setServerToday(new Date(data));
      else setServerToday(new Date());
    }).catch(() => setServerToday(new Date()));

  // Fetch enterprise catalog
    const fetchCompleteEnterpriseCatalog = async () => {
      try {
        setInitialLoading(true);
        const { data: cust } = await supabase.from('customers').select('id, customerName, primaryPhone');
        const { data: prod } = await supabase.from('products').select('id, product_name, current_stock, retail_price, item_sr_no, category, hs_code, uom, pieces_per_box, pcs_per_box, pieces_per_packing, product_description, bin, item_type, service_charges');
        const { data: sm } = await supabase.from('salesmen').select('id, name, invoice_name, invoice_names');
        const { data: trans } = await supabase.from('logistics_transportation').select('id, name, base_charges');
        const { data: locMaster } = await supabase.from('inventory_locations').select('name');
        const { data: wh } = await supabase.from('opening_stocks').select('location');
        const { data: invWh } = await supabase.from('warehouse_inventory').select('warehouse_name');
        const { data: bnk } = await supabase.from('banks').select('id, bankName, accountTitle');

        // Load the stock ledger snapshot once (reused for every row's availability check)
        fetchStockDataset().then(setStockDataset).catch(() => setStockDataset(null));

        if (cust) setCustomersList(cust);
        if (prod) setProductsList(prod);
        if (sm) setSalesmenList(sm);
        if (trans) setTransportList(trans);

        const combinedLocs = [
          ...(locMaster || []).map((l: any) => l.name)
        ];
        const uniqueLocations = Array.from(new Set(combinedLocs.map((loc: any) => String(loc || '').trim()).filter(Boolean)));
        setWarehousesList(uniqueLocations);

        if (bnk) setBanksList(bnk);
      } catch (err: any) {
        toast.error('Failed to aggregate core infrastructure registries: ' + err.message);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchCompleteEnterpriseCatalog();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.sku-container')) {
        setActiveSkuIndex(null);
      }
      if (!target.closest('.prod-name-container')) {
        setActiveProdNameIndex(null);
      }
      if (!target.closest('.wh-container')) {
        setActiveWhIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSalesmanPrefix = (salesmanName: string, smList: any[] = salesmenList): string => {
    if (!salesmanName) return '';
    const smObj = (smList && smList.length > 0 ? smList : salesmenList).find(
      (s) => (s.name || '').toLowerCase().trim() === salesmanName.toLowerCase().trim()
    );
    const rawPrefix = (
      smObj?.invoice_name ||
      (smObj?.invoice_names && smObj?.invoice_names[0]) ||
      smObj?.name ||
      salesmanName ||
      ''
    )
      .trim()
      .toUpperCase();

    return rawPrefix ? `${rawPrefix}-` : '';
  };

  const getFormInitialValues = () => {
    if (editData) {
      const parsedItems = Array.isArray(editData.items)
        ? editData.items
        : JSON.parse(editData.items || '[]');
      return {
        invoiceNo: editData.invoice_no || '',
        customerName: editData.customer_name || editData.customerName || '',
        saleDate: editData.sale_date || new Date().toISOString().split('T')[0],
        paymentTerm: editData.payment_term || 'Cash',
        dispatchWarehouse: editData.dispatch_warehouse || '',
        applyFbrTax: Boolean(editData.apply_fbr_tax || (editData.scenario_type && editData.scenario_type !== 'Standard Retail Sale (No Tax)')),
        taxScenario: editData.scenario_type || 'Goods at Standard Rate to Registered Buyers',
        salesman: editData.salesman || (isSalesman ? (matchedSalesman || currentSalesmanName) : ''),
        transportType: editData.transport_name || 'No Transport (Handover)',
        transportCharges: Number(editData.transport_charges || 0),
        settlementMode: (Number(editData.cash_amount_paid || 0) > 0 && (Number(editData.bank_amount || 0) > 0 || editData.selected_bank))
          ? 'Split'
          : (editData.selected_bank || Number(editData.bank_amount || 0) > 0 ? 'Bank' : 'Cash'),
        selectedBankTitle: editData.selected_bank || '',
        cashAmountPaid: Number(editData.cash_amount_paid || 0),
        bankAmountPaid: Number(editData.bank_amount || 0),
        dcNo: editData.dc_no || '',
        gatePasses: (() => {
          if (!editData.gate_pass_no) return {};
          try {
            if (editData.gate_pass_no.includes(':')) {
              const parts = String(editData.gate_pass_no).split(' | ');
              const obj: any = {};
              parts.forEach((p) => {
                const [k, v] = p.split(':');
                if (k && v) obj[k.trim()] = v.trim();
              });
              return obj;
            }
            return { [editData.items?.[0]?.warehouse || 'Main Warehouse']: editData.gate_pass_no };
          } catch (e) { return {}; }
        })(),
        shippingAddress: editData.shipping_address || '',
        showDiscount: parsedItems.some((i: any) => Number(i.discountAmt || i.discount_amt || i.discount || 0) > 0),
        items: parsedItems.map((it: any) => ({
          ...it,
          warehouse: it.warehouse || editData.dispatch_warehouse || '',
          discountPer: Number(it.discountPer ?? it.discount_per ?? 0),
          discountAmt: Number(it.discountAmt ?? it.discount_amt ?? it.discount ?? 0)
        }))
      };
    }
    return {
      invoiceNo: '', customerName: '', saleDate: new Date().toISOString().split('T')[0], paymentTerm: 'Cash',
      dispatchWarehouse: '', applyFbrTax: false, showDiscount: false, showAdditionalCharges: false, additionalCharges: 0, taxScenario: 'Goods at Standard Rate to Registered Buyers',
      salesman: isSalesman ? (matchedSalesman || currentSalesmanName) : '',
      transportType: 'No Transport (Handover)', transportCharges: 0, settlementMode: 'Cash',
      selectedBankTitle: '', cashAmountPaid: 0, bankAmountPaid: 0,
      dcNo: '',
      gatePasses: {},
      shippingAddress: '',
      items: [{ skuCode: '', itemName: '', warehouse: '', qty: 1, rp: 0, discountPer: 0, discountAmt: 0, gstRate: 0, fTaxPer: 0, amount: 0, availableQty: 0, itemServiceCharges: 0 }]
    };
  };

  const validationSchema = Yup.object().shape({
    invoiceNo: Yup.string()
      .required('Invoice # is required')
      .test(
        'has-digits',
        'Please enter the invoice number digits',
        function (value, ctx) {
          if (!value) return false;
          const prefix = getSalesmanPrefix(ctx.parent.salesman, salesmenList);
          if (prefix && value.trim().toUpperCase() === prefix.trim().toUpperCase()) {
            return false;
          }
          return true;
        }
      )
      .test(
        'check-invoice-unique',
        'This Invoice Number already exists!',
        async function (value) {
          if (!value) return true;
          const originalInvoiceNo = editData?.invoice_no;
          if (originalInvoiceNo && String(originalInvoiceNo).trim().toLowerCase() === String(value).trim().toLowerCase()) {
            return true;
          }
          try {
            const { data, error } = await supabase
              .from('sales_invoices')
              .select('id')
              .ilike('invoice_no', value.trim())
              .maybeSingle();
            if (error) return true;
            if (data) return false;
            return true;
          } catch (e) {
            return true;
          }
        }
      ),
    gatePasses: Yup.object().test('all-gate-passes', 'Gate pass required for all locations', function (value, ctx) {
      const { items } = ctx.parent;
      if (!items || !Array.isArray(items)) return true;
      const validItems = items.filter((i: any) => i.itemName && i.itemName.trim() !== '');
      if (validItems.length === 0) return true;
      const uniqueLocations = Array.from(new Set(validItems.map((i: any) => i.warehouse || ctx.parent.dispatchWarehouse || 'Main Warehouse').filter(Boolean)));
      for (const loc of uniqueLocations) {
        if (!value || !value[loc as string]) {
          return this.createError({ message: `Gate Pass required for ${loc}` });
        }
      }
      return true;
    }),
    shippingAddress: Yup.string().nullable(),
    saleDate: Yup.string().required('Required Field').test('valid-date', 'Date must be within last 3 days', function(value) {
      if (!value) return false;
      if (editData && (editData.sale_date || editData.date) && value === String(editData.sale_date || editData.date).split('T')[0]) {
        return true;
      }
      const selected = new Date(value);
      selected.setHours(0,0,0,0);
      const base = serverToday ? new Date(serverToday) : new Date();
      const today = new Date(base);
      today.setHours(0,0,0,0);
      const minDate = new Date(today);
      minDate.setDate(today.getDate() - 3);
      return selected >= minDate && selected <= today;
    }),
    taxScenario: Yup.string().required('Required Field'),
    salesman: Yup.string().required('Required Field'),
    settlementMode: Yup.string().oneOf(['Cash', 'Bank', 'Split']).required('Required Field'),
    cashAmountPaid: Yup.number().min(0).required('Required Field'),
    bankAmountPaid: Yup.number().min(0).nullable(),
    selectedBankTitle: Yup.string().when('settlementMode', {
      is: (val: string) => val === 'Bank' || val === 'Split',
      then: (schema) => schema.required('Please select corporate bank ledger profile'),
      otherwise: (schema) => schema.notRequired()
    }),
    items: Yup.array().of(
      Yup.object().shape({
        itemName: Yup.string().required('Item Name is required'),
        warehouse: Yup.string().required('Warehouse is required'),
        qty: Yup.number().min(0.001, 'Qty must be > 0').required('Qty is required'),
        rp: Yup.number().min(0, 'Price cannot be negative').required('Price is required'),
        discountPer: Yup.number().min(0).nullable(),
        discountAmt: Yup.number().min(0).nullable(),
        gstRate: Yup.number().min(0).required('Required Field'),
        fTaxPer: Yup.number().min(0).required('Required Field')
      })
    ).min(1)
  });

  const fetchStockForWarehouse = async (productName: string, chosenWarehouse: string) => {
    if (!productName) return 0;
    try {
      if (!chosenWarehouse) {
        const t = await getTotalAvailableStock(productName, stockDataset);
        console.log(`[Invoice] No WH. Total stock for ${productName}:`, t);
        return t;
      }
      const s = await getAvailableStock(productName, chosenWarehouse, stockDataset);
      console.log(`[Invoice] WH selected (${chosenWarehouse}). Stock for ${productName}:`, s);
      return s;
    } catch (err) {
      console.error("[Invoice] Error fetching stock:", err);
      return 0;
    }
  };

  // Keep the highlighted option in view while navigating with the arrow keys
  const queueProductScroll = (next: number) => {
    setTimeout(() => {
      const box = productDropdownScrollRef.current;
      if (!box) return;
      const el = box.querySelector(`[data-opt="${next}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, 0);
  };

  const handleProductSelectionWithWH = async (selectedProduct: any, index: number, chosenWarehouse: string, setFieldValue: any, currentItem?: any) => {
    if (!selectedProduct) {
      setFieldValue(`items.${index}.itemName`, '');
      setFieldValue(`items.${index}.skuCode`, '');
      setFieldValue(`items.${index}.availableQty`, 0);
      return;
    }
    const serviceCharges = Number(selectedProduct.service_charges || 0);
    const isService = selectedProduct.item_type === 'service';
    const newRp = (Number(selectedProduct.retail_price) || 0) + (isService ? serviceCharges : 0);
    setFieldValue(`items.${index}.itemName`, selectedProduct.product_name);
    setFieldValue(`items.${index}.skuCode`, selectedProduct.item_sr_no || '');
    setFieldValue(`items.${index}.rp`, newRp);
    setFieldValue(`items.${index}.itemServiceCharges`, isService ? serviceCharges : 0);
    setFieldValue(`items.${index}.hsCode`, selectedProduct.hs_code || '');

    if (currentItem && currentItem.discountPer) {
      const gross = newRp * (Number(currentItem.qty) || 1);
      const calculatedAmt = (gross * Number(currentItem.discountPer)) / 100;
      setFieldValue(`items.${index}.discountAmt`, Number(calculatedAmt.toFixed(2)));
    }

    const effectiveWarehouse = (currentItem && currentItem.warehouse) ? currentItem.warehouse : chosenWarehouse;
    if (!effectiveWarehouse) {
      setFieldValue(`items.${index}.availableQty`, 0);
      return;
    }
    const availStock = await fetchStockForWarehouse(selectedProduct.product_name, effectiveWarehouse);
    setFieldValue(`items.${index}.availableQty`, availStock);
  };

  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['-', 'e', 'E', '+'].includes(e.key)) {
      e.preventDefault();
    }
  };

  const calculateLineTotals = (item: any, scenario: string, applyFbrTax: boolean = false) => {
    const qty = Math.max(0, Number(item.qty) || 0);
    const rp = Math.max(0, Number(item.rp) || 0);
    const grossBase = rp * qty;
    const discountAmt = Math.max(0, Number(item.discountAmt) || 0);
    const remainingRetail = grossBase - discountAmt;

    if (!applyFbrTax) {
      return {
        grossBase,
        activeGstRate: 0,
        activeFTaxPer: 0,
        gstAmt: 0,
        fTaxAmt: 0,
        discountAmt,
        remainingRetail,
        netTotal: remainingRetail
      };
    }

    let activeGstRate = Number(item.gstRate || 18);
    let activeFTaxPer = Number(item.fTaxPer || 0);

    if (scenario === 'Reduced Rate Sale') {
      activeGstRate = item.gstRate !== undefined && item.gstRate !== null && item.gstRate !== '' ? Number(item.gstRate) : 0;
      activeFTaxPer = item.fTaxPer !== undefined && item.fTaxPer !== null && item.fTaxPer !== '' ? Number(item.fTaxPer) : 0;
    } else {
      switch (scenario) {
        case 'Goods at Standard Rate to Unregistered Buyers':
          activeGstRate = 18;
          activeFTaxPer = 4;
          break;
        case 'Exempt Goods Sale':
        case 'Zero Rated Sale':
          activeGstRate = 0;
          activeFTaxPer = 0;
          break;
        case 'Goods Sold that are Listed in SRO 297(1)/2023':
          activeGstRate = 25;
          activeFTaxPer = 0;
          break;
        case 'Sale of 3rd Schedule Goods':
          activeGstRate = 18;
          activeFTaxPer = 0;
          break;
        case 'Goods at Standard Rate to Registered Buyers':
        default:
          activeGstRate = 18;
          activeFTaxPer = 0;
          break;
      }
    }

    const isRetailBasedTax =
      scenario === 'Sale of 3rd Schedule Goods' ||
      scenario === 'Goods Sold that are Listed in SRO 297(1)/2023';

    const gstTaxBase = isRetailBasedTax ? grossBase : Math.max(0, grossBase - discountAmt);

    const gstAmt = (gstTaxBase / 100) * activeGstRate;
    const fTaxAmt = (gstTaxBase / 100) * activeFTaxPer;

    const netTotal = remainingRetail + gstAmt + fTaxAmt;

    return { grossBase, activeGstRate, activeFTaxPer, gstAmt, fTaxAmt, discountAmt, remainingRetail, netTotal };
  };

  const executeInvoicePersistence = async (values: any, customerFinalName: string) => {
    try {
      setLoading(true);
      
      // STRICT VALIDATION: Block if quantity exceeds available stock
      for (const item of values.items) {
        let maxAllowed = Number(item.availableQty || 0);
        if (editData && editData.items) {
           const oldItems = typeof editData.items === 'string' ? JSON.parse(editData.items || '[]') : (editData.items || []);
           const original = oldItems.find((oi: any) => oi.skuCode === item.skuCode && (oi.warehouse || editData.dispatch_warehouse || 'Main Warehouse') === (item.warehouse || values.dispatchWarehouse || 'Main Warehouse'));
           if (original) {
              maxAllowed += Number(original.qty || 0);
           }
        }
        if (item.itemName && Number(item.qty) > maxAllowed) {
          toast.error(`Insufficient stock for ${item.itemName}. Max Available: ${maxAllowed.toLocaleString()}, Requested: ${Number(item.qty).toLocaleString()}`);
          setLoading(false);
          return;
        }
      }

      let calculatedGrandTotal = values.items.reduce((acc: number, item: any) => {
        return acc + calculateLineTotals(item, values.taxScenario, values.applyFbrTax).netTotal;
      }, 0) + Number(values.transportCharges || 0) + Number(values.additionalCharges || 0);

      let paidCash = 0;
      let paidBank = 0;

      if (values.settlementMode === 'Cash') {
        paidCash = Number(values.cashAmountPaid || 0);
        paidBank = 0;
      } else if (values.settlementMode === 'Bank') {
        paidCash = 0;
        paidBank = Number(values.bankAmountPaid || values.cashAmountPaid || 0);
      } else if (values.settlementMode === 'Split') {
        paidCash = Number(values.cashAmountPaid || 0);
        paidBank = Number(values.bankAmountPaid || 0);
      }

      const totalPaidCombined = paidCash + paidBank;
      if (totalPaidCombined > calculatedGrandTotal + 0.01) {
        toast.error(`Payment amount (Rs. ${totalPaidCombined.toLocaleString(undefined, { minimumFractionDigits: 2 })}) cannot exceed total bill amount (Rs. ${calculatedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })})!`);
        setLoading(false);
        return;
      }
      const runningBalanceTerm = totalPaidCombined >= calculatedGrandTotal ? 'Cash' : 'Credit';

      const databasePayload = {
        invoice_no: values.invoiceNo,
        customer_name: customerFinalName,
        sale_date: values.saleDate,
        payment_term: runningBalanceTerm,
        dispatch_warehouse: values.dispatchWarehouse,
        salesman: values.salesman || (isSalesman ? (matchedSalesman || currentSalesmanName) : ''),
        transport_name: values.transportType,
        transport_charges: Number(values.transportCharges || 0),
        additional_charges: Number(values.additionalCharges || 0),
        selected_bank: (values.settlementMode === 'Bank' || values.settlementMode === 'Split') ? values.selectedBankTitle : null,
        bank_amount: String(paidBank),
        cash_amount_paid: paidCash,
        total_amount: String(calculatedGrandTotal),
        receipt_status: totalPaidCombined >= calculatedGrandTotal ? 'Paid' : 'On Credit',
        sale_status: 'Confirm',
        shipping_address: values.shippingAddress,
        gate_pass_no: Object.entries(values.gatePasses || {}).map(([k, v]) => `${k}: ${v}`).join(' | '),
        items: values.items,
        scenario_type: values.applyFbrTax ? values.taxScenario : 'Standard Retail Sale (No Tax)'
      };

      let finalInvoiceId = editData?.id;

      if (editData && editData.id) {
        const formattedInvCode = editData.invoice_no || values.invoiceNo;
        
        // 1. Fetch DCs associated with this invoice
        const { data: dcs, error: dcErr } = await supabase
          .from('delivery_challans')
          .select('*')
          .eq('invoice_no', formattedInvCode);
        
        if (dcErr) throw dcErr;

        const activeDCs = (dcs || []).filter(dc => dc.status !== 'Pending Approval');
        const pendingDCs = (dcs || []).filter(dc => dc.status === 'Pending Approval');

        // Track covered quantities by sku_warehouse
        const coveredQtys: Record<string, number> = {};
        activeDCs.forEach(dc => {
          (dc.items || []).forEach((i: any) => {
            const key = `${i.skuCode}_${i.location}`;
            coveredQtys[key] = (coveredQtys[key] || 0) + Number(i.orderQty || 0);
          });
        });

        // Helper for error formatting
        const formatErrorQty = (qty: number, skuCode: string, itemName?: string) => {
          const matchedProd = productsList.find(p => p.product_name === itemName || (skuCode && (p.item_sr_no === skuCode || `SKU-${p.id}` === skuCode)));
          let displayQty = String(qty);
          if (matchedProd) {
            const isTile = Boolean(String(matchedProd.category || '').toLowerCase().includes('tile'));
            let pcsPerBox = Number(matchedProd.pieces_per_box || matchedProd.pcs_per_box || matchedProd.pieces_per_packing || 1);
            if (isTile && pcsPerBox <= 1) pcsPerBox = 4;
            if (pcsPerBox > 1) {
              const totalPcs = Math.round(qty * pcsPerBox);
              const b = Math.floor(totalPcs / pcsPerBox);
              const p = totalPcs % pcsPerBox;
              displayQty = p === 0 ? `${b} Boxes` : `${b} Boxes + ${p} Pcs`;
            }
          }
          return displayQty;
        };

        // 2. Validate
        for (const item of values.items) {
          const wh = (item.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim();
          const key = `${item.skuCode}_${wh}`;
          const covered = coveredQtys[key] || 0;
          if (Number(item.qty) < covered) {
             const fmt = formatErrorQty(covered, item.skuCode, item.itemName);
             throw new Error(`Cannot decrease quantity for ${item.itemName} below the actively processed DC amount (${fmt}).`);
          }
        }
        
        for (const key of Object.keys(coveredQtys)) {
          const covered = coveredQtys[key];
          if (covered > 0) {
            const found = values.items.find((i:any) => `${i.skuCode}_${(i.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim()}` === key);
            if (!found) {
               const sku = key.split('_')[0];
               const fmt = formatErrorQty(covered, sku);
               throw new Error(`Cannot remove item with SKU ${sku} because it already has actively processed DCs (${fmt}).`);
            }
          }
        }

        // 3. Update Invoice
        const { error: invoiceUpdateError } = await supabase
          .from('sales_invoices')
          .update(databasePayload)
          .eq('id', editData.id);

        if (invoiceUpdateError) throw invoiceUpdateError;

        // 4. Update products.current_stock (Restore old, Deduct new)
        // warehouse_inventory is no longer the source of truth — formula-based
        const oldItems = typeof editData.items === 'string' ? JSON.parse(editData.items || '[]') : (editData.items || []);
        for (const oldItem of oldItems) {
          const { data: prod } = await supabase.from('products').select('id, current_stock').ilike('product_name', oldItem.itemName).maybeSingle();
          if (prod) await supabase.from('products').update({ current_stock: Number(prod.current_stock) + Number(oldItem.qty || 0) }).eq('id', prod.id);
        }
        for (const newItem of values.items) {
          const { data: prod } = await supabase.from('products').select('id, current_stock').ilike('product_name', newItem.itemName).maybeSingle();
          if (prod) await supabase.from('products').update({ current_stock: Number(prod.current_stock) - Number(newItem.qty || 0) }).eq('id', prod.id);
        }

        // 5. Sync DCs (Delete pending, create new for remaining quantities)
        if (pendingDCs.length > 0) {
          const pendingIds = pendingDCs.map(d => d.id);
          const { error: delErr } = await supabase.from('delivery_challans').delete().in('id', pendingIds);
          if (delErr) console.error('Error deleting pending DCs:', delErr);
        }

        const itemsByWarehouse: Record<string, any[]> = {};
        for (const item of values.items) {
          const wh = (item.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim();
          const key = `${item.skuCode}_${wh}`;
          const covered = coveredQtys[key] || 0;
          const remaining = Number(item.qty) - covered;

          if (remaining > 0) {
            if (!itemsByWarehouse[wh]) itemsByWarehouse[wh] = [];
            
            // Prorate discount if any
            const origQty = Number(item.qty) || 1;
            const proratedDisAmt = (Number(item.discountAmt) || 0) * (remaining / origQty);

            itemsByWarehouse[wh].push({
              poNoSub: values.clientPoNumber || '',
              pDescription: item.itemName || 'Product',
              skuCode: item.skuCode || '',
              location: wh,
              rate: Number(item.rp) || 0,
              qty: remaining,
              disAmt: Number(proratedDisAmt.toFixed(2)),
              distPer: Number(item.discountPer) || 0,
              discount: 0,
              notes: item.notes || ''
            });
          }
        }

        const { data: existingDcs } = await supabase
          .from('delivery_challans')
          .select('id, challan_no, dispatch_warehouse')
          .eq('invoice_no', formattedInvCode)
          .order('id', { ascending: true });

        for (const [whName, whItems] of Object.entries(itemsByWarehouse)) {
          const whQty = whItems.reduce((acc, i) => acc + Number(i.qty || 0), 0);
          const whBaseAmt = whItems.reduce((acc, i) => acc + (Number(i.rate || 0) * Number(i.qty || 0)), 0);
          const whDiscAmt = whItems.reduce((acc, i) => acc + Number(i.disAmt || 0), 0);
          const whNetAmt = whBaseAmt - whDiscAmt;

          let nextChallanNo = undefined;
          if (existingDcs && existingDcs.length > 0) {
            const whDcs = existingDcs.filter(dc => dc.dispatch_warehouse === whName);
            if (whDcs.length > 0) {
              const baseDc = whDcs[0];
              const baseCode = (baseDc.challan_no || `DC-${String(baseDc.id).padStart(4, '0')}`).replace(/-[A-Z]+$/, '');
              const existingSubCount = existingDcs.filter(c => (c.challan_no || `DC-${String(c.id).padStart(4, '0')}`).startsWith(baseCode)).length;
              let nextLetter = '';
              if (existingSubCount < 26) {
                nextLetter = String.fromCharCode(65 + existingSubCount);
              } else {
                nextLetter = String.fromCharCode(65 + (existingSubCount % 26)).repeat(Math.floor(existingSubCount / 26) + 1);
              }
              nextChallanNo = `${baseCode}-${nextLetter}`;
            }
          }

          if (!nextChallanNo) {
            const safePrefix = whName.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const { data: allDcs } = await supabase
              .from('delivery_challans')
              .select('challan_no')
              .ilike('challan_no', `${safePrefix}-%`);

            let nextNum = 1;
            if (allDcs && allDcs.length > 0) {
              const maxNum = allDcs.reduce((max, dc) => {
                const match = (dc.challan_no || '').match(new RegExp(`^${safePrefix}-(\\d+)`));
                if (match && match[1]) {
                  const num = parseInt(match[1], 10);
                  return num > max ? num : max;
                }
                return max;
              }, 0);
              nextNum = maxNum + 1;
            }
            nextChallanNo = `${safePrefix}-${String(nextNum).padStart(4, '0')}`;
          }

          await supabase.from('delivery_challans').insert([{
            challan_no: nextChallanNo,
            invoice_no: formattedInvCode,
            customer_name: customerFinalName,
            challan_date: values.saleDate || new Date().toISOString().split('T')[0],
            dispatch_warehouse: whName,
            transport_name: values.transportType || 'By Road Transport',
            transportation: values.transportType || 'By Road Transport',
            po_no: values.clientPoNumber || '',
            po_date: values.saleDate || null,
            gate_pass_no: (values.gatePasses && values.gatePasses[whName]) || null,
            vehicle_no: values.transportCharges ? `Pending Dispatch` : 'Counter Delivery',
            remarks: `Awaiting warehouse approval for ${formattedInvCode} (${whName}) [EDITED]`,
            total_quantity: whQty,
            total_amount: whBaseAmt,
            total_discount: whDiscAmt,
            total_net_amount: whNetAmt,
            status: 'Pending Approval',
            items: whItems.map(i => ({
              ...i,
              orderQty: Number(i.qty || 0),
              dispatchedQty: 0,
              holdQty: Number(i.qty || 0)
            }))
          }]);
        }

        toast.success('Sales Invoice changes compiled and DCs synced successfully!');
      } else {
        const { data: insertedInvoice, error: invoiceError } = await supabase
          .from('sales_invoices')
          .insert([databasePayload])
          .select('id')
          .single();

        if (invoiceError) throw invoiceError;

        finalInvoiceId = insertedInvoice?.id;
        const formattedInvCode = values.invoiceNo;

        // ── AUTO-CREATE DELIVERY CHALLANS PER UNIQUE WAREHOUSE ──
        try {
          // Group invoice items by warehouse destination
          const itemsByWarehouse: Record<string, any[]> = {};
          (values.items || []).forEach((item: any) => {
            const wh = (item.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim();
            if (!itemsByWarehouse[wh]) itemsByWarehouse[wh] = [];
            itemsByWarehouse[wh].push({
              poNoSub: values.clientPoNumber || '',
              pDescription: item.itemName || 'Product',
              skuCode: item.skuCode || '',
              location: wh,
              rate: Number(item.rp) || 0,
              qty: Number(item.qty) || 0,
              disAmt: Number(item.discountAmt) || 0,
              distPer: Number(item.discountPer) || 0,
              discount: 0,
              notes: item.notes || ''
            });
          });

          for (const [whName, whItems] of Object.entries(itemsByWarehouse)) {
            const whQty = whItems.reduce((acc, i) => acc + Number(i.qty || 0), 0);
            const whBaseAmt = whItems.reduce((acc, i) => acc + (Number(i.rate || 0) * Number(i.qty || 0)), 0);
            const whDiscAmt = whItems.reduce((acc, i) => acc + Number(i.disAmt || 0), 0);
            const whNetAmt = whBaseAmt - whDiscAmt;

            const safePrefix = whName.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const { data: allDcs } = await supabase
              .from('delivery_challans')
              .select('challan_no')
              .ilike('challan_no', `${safePrefix}-%`);

            let nextNum = 1;
            if (allDcs && allDcs.length > 0) {
              const maxNum = allDcs.reduce((max, dc) => {
                const match = (dc.challan_no || '').match(new RegExp(`^${safePrefix}-(\\d+)`));
                if (match && match[1]) {
                  const num = parseInt(match[1], 10);
                  return num > max ? num : max;
                }
                return max;
              }, 0);
              nextNum = maxNum + 1;
            }
            
            const newChallanNo = `${safePrefix}-${String(nextNum).padStart(4, '0')}`;

            await supabase.from('delivery_challans').insert([{
              challan_no: newChallanNo,
              invoice_no: formattedInvCode,
              customer_name: customerFinalName,
              challan_date: values.saleDate || new Date().toISOString().split('T')[0],
              dispatch_warehouse: whName,
              transport_name: values.transportType || 'By Road Transport',
              transportation: values.transportType || 'By Road Transport',
              po_no: values.clientPoNumber || '',
              po_date: values.saleDate || null,
              gate_pass_no: (values.gatePasses && values.gatePasses[whName]) || null,
              vehicle_no: values.transportCharges ? `Pending Dispatch` : 'Counter Delivery',
              remarks: `Awaiting warehouse approval for ${formattedInvCode} (${whName})`,
              total_quantity: whQty,
              total_amount: whBaseAmt,
              total_discount: whDiscAmt,
              total_net_amount: whNetAmt,
              status: 'Pending Approval',
              items: whItems.map(i => ({
                ...i,
                orderQty: Number(i.qty || 0),
                dispatchedQty: 0,
                holdQty: Number(i.qty || 0)
              }))
            }]);
          }
        } catch (dcErr: any) {
          console.error('Delivery challan auto-generation warning:', dcErr);
          toast.error(`DC Auto-generation failed: ${dcErr.message || 'Unknown error'}`);
        }

        // Update products.current_stock only — warehouse_inventory retired
        for (const item of values.items) {
          const { data: prod } = await supabase.from('products').select('id, current_stock').ilike('product_name', item.itemName).maybeSingle();
          if (prod) await supabase.from('products').update({ current_stock: Number(prod.current_stock) - Number(item.qty) }).eq('id', prod.id);
        }
        toast.success('Sales Invoice & Delivery Challan(s) logged successfully!');
      }
      setShowCustomerModal(false);
      if (submitAction === 'print' && finalInvoiceId) {
        navigate(`${tenantId ? `/${tenantId}` : ''}/sales/invoice/print/${finalInvoiceId}`);
      } else {
        navigate(`${tenantId ? `/${tenantId}` : ''}/sales/invoice/list`);
      }
    } catch (err: any) {
      toast.error('Submission failure: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalCustomerModalSubmit = async () => {
    if (!pendingFormValues) return;

    let finalCustomerName = '';

    if (customerModalType === 'recorded') {
      if (!selectedRecordedCustomer) {
        toast.error('Please select an existing customer account from the list.');
        return;
      }
      finalCustomerName = selectedRecordedCustomer;
    } else {
      const cleanName = walkinName.trim() || 'Walk-in Customer';
      const cleanPhone = walkinPhone.trim();
      finalCustomerName = cleanName;

      if (recordWalkinCustomer && cleanName && cleanName.toLowerCase() !== 'walk-in customer') {
        try {
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .ilike('customerName', cleanName)
            .maybeSingle();

          if (!existing) {
            const { error: custErr } = await supabase.from('customers').insert([{
              customerName: cleanName,
              customername: cleanName,
              primaryPhone: cleanPhone || 'N/A',
              phone: cleanPhone || 'N/A',
              company: 'Retail Walk-in'
            }]);

            if (custErr) {
              console.error('Customer insert warning:', custErr);
            } else {
              toast.success(`Customer "${cleanName}" saved to directory!`);
            }
          }
        } catch (e: any) {
          console.error('Customer registration error:', e);
        }
      }
    }

    await executeInvoicePersistence(pendingFormValues, finalCustomerName);
  };

  if (initialLoading) return <div className="flex h-48 items-center justify-center"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-7xl text-black dark:text-bodydark text-xs font-sans relative">
      {/* CUSTOMER CHECKOUT MODAL */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-boxdark w-full max-w-lg rounded-2xl shadow-2xl p-6 border border-stroke dark:border-strokedark animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-black dark:text-white flex items-center gap-2"><FiUserCheck className="text-emerald-500" /> Checkout Customer</h2>
              <button onClick={() => setShowCustomerModal(false)}><FiX className="text-xl text-gray-400 hover:text-black dark:hover:text-white" /></button>
            </div>

            <div className="flex gap-2 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button onClick={() => setCustomerModalType('walkin')} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${customerModalType === 'walkin' ? 'bg-white dark:bg-boxdark shadow-sm text-primary' : 'text-gray-500'}`}>Walk-in Sale</button>
              <button onClick={() => setCustomerModalType('recorded')} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${customerModalType === 'recorded' ? 'bg-white dark:bg-boxdark shadow-sm text-primary' : 'text-gray-500'}`}>Recorded Client</button>
            </div>

            {customerModalType === 'walkin' ? (
              <div className="space-y-4">
                <input type="text" placeholder="Customer Name (Optional)" value={walkinName} onChange={(e) => setWalkinName(e.target.value)} className="w-full p-3 border rounded-lg bg-transparent dark:border-strokedark" />
                <input type="text" placeholder="Phone Number (Optional)" value={walkinPhone} onChange={(e) => setWalkinPhone(e.target.value)} className="w-full p-3 border rounded-lg bg-transparent dark:border-strokedark" />
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-400">
                  <input type="checkbox" checked={recordWalkinCustomer} onChange={(e) => setRecordWalkinCustomer(e.target.checked)} />
                  Save this customer to directory
                </label>
              </div>
            ) : (
              <select value={selectedRecordedCustomer} onChange={(e) => setSelectedRecordedCustomer(e.target.value)} className="w-full p-3 border rounded-lg bg-transparent dark:border-strokedark">
                <option value="">-- Search Customer --</option>
                {customersList.map(c => {
                  const code = c.customer_code || c.customerCode;
                  return (
                    <option key={c.id} value={c.customerName}>
                      {code ? `[${code}] ${c.customerName}` : c.customerName}
                    </option>
                  );
                })}
              </select>
            )}

            <div className="mt-8 flex gap-3">
              <button onClick={() => setShowCustomerModal(false)} className="flex-1 py-2.5 rounded-lg border border-stroke font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={handleFinalCustomerModalSubmit} disabled={loading} className="flex-1 py-2.5 rounded-lg bg-primary text-white font-bold text-xs shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><FiCheck /> {loading ? 'Processing...' : 'Finalize & Log'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6">
        <div className="flex items-center justify-between border-b border-stroke pb-4 mb-6 dark:border-strokedark">
          <h3 className="font-semibold text-black dark:text-white text-base">
            {editData ? `Modify Historical Sales Invoice Reference # ${editData.id}` : 'Generate Commercial Sales Invoice'}
          </h3>
          <button type="button" onClick={() => navigate('/sales/invoice/list')} className="text-sm font-medium text-primary hover:underline">See Logs List</button>
        </div>

        <Formik
          initialValues={getFormInitialValues()}
          enableReinitialize={true}
          validationSchema={validationSchema}
          onSubmit={async (values) => {
            if (isSalesman) {
              values.salesman = matchedSalesman || currentSalesmanName || values.salesman;
            }
            setPendingFormValues(values);
            if (editData && editData.customer_name) {
              const custName = String(editData.customer_name).trim();
              const isExistingRecorded = customersList.some(c => (c.customerName || '').toLowerCase() === custName.toLowerCase());

              if (isExistingRecorded) {
                const found = customersList.find(c => (c.customerName || '').toLowerCase() === custName.toLowerCase());
                setSelectedRecordedCustomer(found?.customerName || custName);
                setCustomerModalType('recorded');
              } else {
                setCustomerModalType('walkin');
                setWalkinName(custName);
                setWalkinPhone('');
                setRecordWalkinCustomer(false);
              }
            } else {
              setCustomerModalType('walkin');
              setWalkinName('');
              setWalkinPhone('');
              setRecordWalkinCustomer(true);
            }
            setShowCustomerModal(true);
          }}
        >
          {({ values, handleChange, setFieldValue, errors, touched, submitCount, submitForm }) => {
            const hasAttempted = submitCount > 0;
            const currentSubtotalValue = values.items.reduce((acc: number, item: any) => {
              return acc + calculateLineTotals(item, values.taxScenario, values.applyFbrTax).netTotal;
            }, 0) + Number(values.transportCharges || 0) + Number(values.additionalCharges || 0);

            const currentPrefix = getSalesmanPrefix(values.salesman, salesmenList);

            // Extract user-typed suffix
            let rawSuffix = values.invoiceNo || '';
            if (currentPrefix && rawSuffix.toUpperCase().startsWith(currentPrefix.toUpperCase())) {
              rawSuffix = rawSuffix.slice(currentPrefix.length);
            }

            // Auto-lock salesman value if logged in as salesman
            if (isSalesman && (matchedSalesman || currentSalesmanName)) {
              const currentOfficer = matchedSalesman || currentSalesmanName;
              if (values.salesman !== currentOfficer) {
                setTimeout(() => {
                  setFieldValue('salesman', currentOfficer);
                }, 0);
              }
            }

            return (
              <Form className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 dark:bg-meta-4/5 p-4 rounded-sm border border-stroke dark:border-strokedark">
                  <div>
                    <label className="block font-bold text-gray-500 mb-1">Invoice Number #: *</label>
                    <div className={`flex items-center rounded border overflow-hidden bg-white dark:bg-boxdark ${hasAttempted && errors.invoiceNo ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus-within:border-primary'}`}>
                      <span className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 font-mono font-black text-sm border-r border-stroke dark:border-strokedark select-none whitespace-nowrap min-w-[70px] text-center flex items-center justify-center">
                        {currentPrefix || <span className="text-gray-400 font-normal text-xs">Prefix-</span>}
                      </span>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]*"
                        name="invoiceNo" 
                        placeholder={currentPrefix ? "e.g. 001 or 26388" : "Select salesman first"} 
                        value={rawSuffix} 
                        onKeyDown={(e) => {
                          if (
                            !/[\d]/.test(e.key) &&
                            !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
                            !e.ctrlKey &&
                            !e.metaKey
                          ) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, '');
                          if (currentPrefix) {
                            setFieldValue('invoiceNo', `${currentPrefix}${digitsOnly}`);
                          } else {
                            setFieldValue('invoiceNo', digitsOnly);
                          }
                        }} 
                        className="w-full p-2 text-sm bg-transparent font-bold outline-none text-black dark:text-white placeholder:font-normal placeholder:text-xs placeholder:text-gray-400 font-mono" 
                      />
                    </div>
                    {hasAttempted && errors.invoiceNo && <p className="text-red-500 text-xs font-bold mt-1">{String(errors.invoiceNo)}</p>}
                  </div>

                  <div>
                    <label className="block font-bold text-gray-500 mb-1">Billing Date: *</label>
                    <input 
                      type="date" 
                      name="saleDate" 
                      value={values.saleDate} 
                      onChange={handleChange}
                      min={editData ? undefined : new Date(new Date().setDate(new Date().getDate() - 3)).toISOString().split('T')[0]}
                      max={new Date().toISOString().split('T')[0]}
                      className={`w-full rounded border p-2 text-sm bg-transparent font-bold outline-none text-black dark:text-white ${hasAttempted && errors.saleDate ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus:border-primary'}`} 
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-500 mb-1">
                      Assigned Salesman: * {isSalesman && <span className="text-[11px] text-emerald-600 font-semibold">(Locked)</span>}
                    </label>
                    {isSalesman ? (
                      <div className="relative">
                        <input
                          type="text"
                          name="salesman"
                          value={values.salesman || matchedSalesman || currentSalesmanName}
                          readOnly
                          className="w-full rounded border p-2 text-sm bg-gray-100 dark:bg-slate-800 font-bold outline-none text-slate-800 dark:text-slate-100 border-stroke dark:border-strokedark cursor-not-allowed select-none"
                        />
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                          🔒 Logged In
                        </div>
                      </div>
                    ) : (
                      <select
                        name="salesman"
                        value={values.salesman}
                        onChange={(e) => {
                          const selectedSm = e.target.value;
                          setFieldValue('salesman', selectedSm);
                          const newPrefix = getSalesmanPrefix(selectedSm, salesmenList);
                          if (rawSuffix) {
                            setFieldValue('invoiceNo', newPrefix ? `${newPrefix}${rawSuffix}` : rawSuffix);
                          } else {
                            setFieldValue('invoiceNo', newPrefix ? `${newPrefix}` : '');
                          }
                        }}
                        className={`w-full rounded border p-2 text-sm bg-white dark:bg-boxdark font-bold outline-none text-black dark:text-white ${hasAttempted && errors.salesman ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus:border-primary'}`}
                      >
                        <option value="">-- Select Officer --</option>
                        {salesmenList.map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name} {s.invoice_name ? `(${s.invoice_name})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {hasAttempted && errors.salesman && (
                      <p className="text-red-500 text-xs font-bold mt-1">{String(errors.salesman)}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-meta-4/5 p-4 rounded-sm border border-stroke dark:border-strokedark">
                  <div className="hidden">
                    {/* Gate pass moved below */}
                  </div>
                  <div>
                    <label className="block font-bold text-gray-500 mb-1">Shipping Address (Optional):</label>
                    <textarea 
                      name="shippingAddress" 
                      placeholder="Enter full shipping address if applicable..." 
                      value={values.shippingAddress} 
                      onChange={handleChange} 
                      rows={2}
                      className="w-full rounded border border-stroke p-2 text-sm bg-white dark:bg-boxdark font-bold outline-none text-black dark:text-white focus:border-primary dark:border-strokedark" 
                    />
                  </div>
                </div>

                {/* 🌟 TAX & DISCOUNT TOGGLE BAR: CLEAN & UNCLUTTERED DEFAULT UI */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-meta-4/20 border border-stroke dark:border-strokedark rounded-sm">
                  <div className="flex flex-wrap items-center gap-6">
                    {/* Tax Invoicing Toggle (Commented out - ready to be re-enabled if client requests GST/FBR Tax Invoicing) */}
                    {/*
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={values.applyFbrTax}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setFieldValue('applyFbrTax', isChecked);
                        }}
                        className="w-4 h-4 text-emerald-600 rounded cursor-pointer accent-emerald-600"
                      />
                      <span className="font-bold text-xs text-black dark:text-white">Enable GST / FBR Tax Invoicing</span>
                    </label>
                    */}

                    {/* Discount Column Toggle */}
                    <div 
                      onClick={() => {
                        const isChecked = !values.showDiscount;
                        setFieldValue('showDiscount', isChecked);
                        if (!isChecked) {
                          values.items.forEach((_: any, idx: number) => {
                            setFieldValue(`items.${idx}.discountPer`, 0);
                            setFieldValue(`items.${idx}.discountAmt`, 0);
                          });
                        }
                      }}
                      className={`cursor-pointer px-3 py-1.5 text-xs font-bold rounded-full transition select-none flex items-center justify-center border ${
                        values.showDiscount 
                          ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800' 
                          : 'bg-white text-slate-500 border-stroke dark:bg-boxdark dark:text-slate-400 dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4'
                      }`}
                    >
                      Discounts
                    </div>

                    {/* Freight Charges Toggle */}
                    <div
                      onClick={() => {
                        const isChecked = !values.showAdditionalCharges;
                        setFieldValue('showAdditionalCharges', isChecked);
                        if (!isChecked) setFieldValue('additionalCharges', 0);
                      }}
                      className={`cursor-pointer px-3 py-1.5 text-xs font-bold rounded-full transition select-none flex items-center justify-center border ${
                        values.showAdditionalCharges
                          ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-800'
                          : 'bg-white text-slate-500 border-stroke dark:bg-boxdark dark:text-slate-400 dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4'
                      }`}
                    >
                      Freight Charges
                    </div>
                  </div>

                  {values.applyFbrTax && (
                    <div className="w-full sm:w-auto">
                      <select
                        name="taxScenario"
                        value={values.taxScenario}
                        onChange={handleChange}
                        className="w-full sm:w-auto text-xs font-bold bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded p-1.5 outline-none text-black dark:text-white"
                      >
                        <option value="Goods at Standard Rate to Registered Buyers">Standard Rate to Registered Buyers (18% GST)</option>
                        <option value="Goods at Standard Rate to Unregistered Buyers">Standard Rate to Unregistered Buyers (18% GST + 4% F.Tax)</option>
                        <option value="Reduced Rate Sale">Custom / Reduced Rate Sale</option>
                        <option value="Sale of 3rd Schedule Goods">3rd Schedule Goods (18% Retail GST)</option>
                        <option value="Goods Sold that are Listed in SRO 297(1)/2023">SRO 297(1)/2023 (25% GST)</option>
                        <option value="Exempt Goods Sale">Exempt Goods Sale (0% Tax)</option>
                        <option value="Zero Rated Sale">Zero Rated Sale (0% Tax)</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="border border-stroke dark:border-strokedark rounded-sm mt-4 relative z-30 overflow-visible pb-4">
                  <FieldArray name="items">
                    {({ push, remove }) => {
                      const showDiscount = values.showDiscount;
                      return (
                        <div className="w-full min-w-[900px]">
                          <table className="w-full table-auto border-collapse text-left">
                            <thead className="bg-gray-100 dark:bg-meta-4 text-[10px] font-black uppercase text-black dark:text-white border-b">
                              <tr>
                                <th className="p-2 w-8 text-center">S#</th>
                                <th className="p-2 min-w-[220px]">Product (Name / Code)</th>
                                <th className="p-2 w-40">Warehouse Zone Source</th>
                                <th className="p-2 w-32 text-center bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-bold">Stock In Warehouse</th>
                                <th className="p-2 w-48 text-center">Qty (UOM)</th>
                                <th className="p-2 w-24 text-right">Sale Price</th>
                                {showDiscount && (
                                  <>
                                    <th className="p-2 w-24 text-center bg-amber-50/80 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">Discount %</th>
                                    <th className="p-2 w-32 text-right bg-amber-50/80 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">Discount Amt</th>
                                  </>
                                )}
                                {values.applyFbrTax && (
                                  <>
                                    <th className="p-2 w-16 text-center">GST %</th>
                                    <th className="p-2 w-16 text-center">F.Tax %</th>
                                    <th className="p-2 w-24 text-right">GST Amt</th>
                                    <th className="p-2 w-24 text-right">F.Tax Amt</th>
                                  </>
                                )}
                                <th className="p-2 w-36 text-right pr-4">Net Total Line</th>
                                <th className="p-2 w-8 text-center"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {values.items.map((item: any, idx: number) => {
                                const lineCalc = calculateLineTotals(item, values.taxScenario, values.applyFbrTax);
                                const hasItemError = hasAttempted && errors.items && (errors.items as any)[idx]?.itemName;
                                const isCurrentActive = activeSkuIndex === idx;
                                const isCurrentProdNameActive = activeProdNameIndex === idx;

                                const selectedProd = productsList.find(p => p.product_name === item.itemName || (item.skuCode && (p.item_sr_no === item.skuCode || `SKU-${p.id}` === item.skuCode)));
                                const rawPcs = Number(selectedProd?.pieces_per_box || selectedProd?.pcs_per_box || selectedProd?.pieces_per_packing || 0);
                                const isTile = Boolean(
                                  selectedProd && (
                                    String(selectedProd.category || '').toLowerCase().includes('tile') ||
                                    String(selectedProd.scenario_name || '').toLowerCase().includes('tile')
                                  ) && (rawPcs > 1 || String(selectedProd.scenario_name || '').toLowerCase().includes('tile'))
                                );
                                const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);
                                const uomName = selectedProd?.uom ? selectedProd.uom : (isTile ? 'BOX' : 'PCS');

                                // Calculate available stock breakdown
                                let effectiveAvailStock = Number(item.availableQty || 0);
                                if (editData && editData.items) {
                                  const oldItems = typeof editData.items === 'string' ? JSON.parse(editData.items || '[]') : (editData.items || []);
                                  const original = oldItems.find((oi: any) => oi.skuCode === item.skuCode && (oi.warehouse || editData.dispatch_warehouse || 'Main Warehouse') === (item.warehouse || values.dispatchWarehouse || 'Main Warehouse'));
                                  if (original) {
                                     effectiveAvailStock += Number(original.qty || 0);
                                  }
                                }
                                const totalAvailStock = effectiveAvailStock;
                                const totalPieces = isTile && pcsPerBox > 1 ? Math.round(totalAvailStock * pcsPerBox) : 0;
                                const availBoxes = isTile && pcsPerBox > 1 ? Math.floor(totalPieces / pcsPerBox) : Math.floor(totalAvailStock);
                                const availLoosePcs = isTile && pcsPerBox > 1 ? (totalPieces % pcsPerBox) : 0;

                                return (
                                  <tr key={idx} className={`border-b border-stroke dark:border-strokedark font-mono font-semibold text-black dark:text-white ${isCurrentActive || isCurrentProdNameActive || activeWhIndex === idx ? 'relative z-30' : 'relative z-10'} ${hasItemError ? 'bg-red-50/5' : ''}`}>
                                    <td className="p-2 text-center font-sans text-gray-400">{idx + 1}</td>

                                    {/* Legacy SKU cell kept hidden — code now shows under the product name */}
                                    <td className="hidden sku-container">
                                      {(() => {
                                        const filteredProds = productsList.filter(p => {
                                          if (!item.skuCode) return true;
                                          const query = item.skuCode.toLowerCase().trim();
                                          const sku = (p.item_sr_no || `SKU-${p.id}`).toLowerCase();
                                          const name = (p.product_name || '').toLowerCase();
                                          return sku.includes(query) || name.includes(query);
                                        });

                                        return (
                                          <>
                                            <input
                                              type="text"
                                              autoComplete="off"
                                              value={item.skuCode || ''}
                                              onFocus={() => {
                                                setActiveSkuIndex(idx);
                                                setHighlightedSkuIndex(0);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'ArrowDown') {
                                                  e.preventDefault();
                                                  setHighlightedSkuIndex((prev) =>
                                                    prev < filteredProds.length - 1 ? prev + 1 : 0
                                                  );
                                                } else if (e.key === 'ArrowUp') {
                                                  e.preventDefault();
                                                  setHighlightedSkuIndex((prev) =>
                                                    prev > 0 ? prev - 1 : filteredProds.length - 1
                                                  );
                                                } else if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  if (filteredProds.length > 0) {
                                                    const selected = filteredProds[highlightedSkuIndex] || filteredProds[0];
                                                    handleProductSelectionWithWH(selected, idx, values.dispatchWarehouse, setFieldValue, item);
                                                    setActiveSkuIndex(null);
                                                  }
                                                } else if (e.key === 'Tab' || e.key === 'Escape') {
                                                  setActiveSkuIndex(null);
                                                }
                                              }}
                                              onChange={(e) => {
                                                const typed = e.target.value;
                                                setFieldValue(`items.${idx}.skuCode`, typed);
                                                setActiveSkuIndex(idx);
                                                setHighlightedSkuIndex(0);

                                                // Only auto-fill if the user has typed the EXACT FULL Code (e.g. SKU-002)
                                                const matched = productsList.find(
                                                  p => p.item_sr_no && p.item_sr_no.toLowerCase() === typed.trim().toLowerCase()
                                                );
                                                if (matched) {
                                                  handleProductSelectionWithWH(matched, idx, values.dispatchWarehouse, setFieldValue, item);
                                                }
                                              }}
                                              placeholder="Type SKU..."
                                              className="w-full bg-slate-50 dark:bg-slate-800 font-mono font-bold border border-stroke dark:border-strokedark rounded p-2 outline-none text-xs text-primary focus:border-primary uppercase shadow-inner"
                                            />

                                            {/* RICH FULL-WIDTH SKU DROPDOWN (UPPER LAYER ON Z-AXIS) */}
                                            {isCurrentActive && (
                                              <div className="absolute left-2 right-2 top-full mt-1.5 z-[99999] min-w-[320px] max-w-[380px] max-h-[290px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                                                {filteredProds.map((p, pIdx) => {
                                                  const displaySku = p.item_sr_no || `SKU-${p.id}`;
                                                  const isHighlighted = pIdx === highlightedSkuIndex;
                                                  return (
                                                    <div
                                                      key={p.id}
                                                      onMouseEnter={() => setHighlightedSkuIndex(pIdx)}
                                                      onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleProductSelectionWithWH(p, idx, values.dispatchWarehouse, setFieldValue, item);
                                                        setActiveSkuIndex(null);
                                                      }}
                                                      onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleProductSelectionWithWH(p, idx, values.dispatchWarehouse, setFieldValue, item);
                                                        setActiveSkuIndex(null);
                                                      }}
                                                      className={`p-3 cursor-pointer transition flex items-center justify-between group ${isHighlighted
                                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500'
                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                                                        }`}
                                                    >
                                                      <div className="flex flex-col gap-0.5 text-left">
                                                        <span className="font-mono font-bold text-xs text-primary group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                                          {displaySku}
                                                        </span>
                                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 line-clamp-1">
                                                          {p.product_name}
                                                        </span>
                                                      </div>
                                                      <div className="text-right font-mono text-[11px] text-slate-400 dark:text-slate-500 pl-2">
                                                        <span className="font-bold text-slate-800 dark:text-white">Rs. {Number(p.retail_price || 0).toLocaleString()}</span>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                                {filteredProds.length === 0 && (
                                                  <div className="p-4 text-center text-xs text-slate-400 italic">
                                                    No matching products or SKUs
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </>
                                        );
                                      })()}
                                    </td>

                                    {/* Description & DESCRIPTION (SEARCHABLE TWO-WAY INPUT WITH RICH DROPDOWN) */}
                                    <td className="p-2 relative prod-name-container min-w-[220px] max-w-[320px]">
                                      {(() => {
                                        const normText = (v: any) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
                                        const exactSelected = productsList.some(p => p.product_name === item.itemName);
                                        const query = exactSelected ? '' : normText(item.itemName);
                                        let filteredByName = query
                                          ? productsList.filter(p =>
                                              normText(p.product_name).includes(query) ||
                                              normText(p.item_sr_no).includes(query) ||
                                              normText(p.category).includes(query)
                                            )
                                          : productsList.slice();
                                        filteredByName = filteredByName
                                          .slice()
                                          .sort((a, b) =>
                                            (Number(b.current_stock) || 0) - (Number(a.current_stock) || 0) ||
                                            String(a.product_name || '').localeCompare(String(b.product_name || ''))
                                          )
                                          .slice(0, 60);

                                        return (
                                          <div className="relative">
                                            <input
                                              type="text"
                                              autoComplete="off"
                                              value={item.itemName || ''}
                                              onFocus={() => {
                                                setActiveProdNameIndex(idx);
                                                setActiveSkuIndex(null);
                                                setHighlightedProdNameIndex(0);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'ArrowDown') {
                                                  e.preventDefault();
                                                  if (filteredByName.length === 0) return;
                                                  setHighlightedProdNameIndex((prev) => {
                                                    const next = prev < filteredByName.length - 1 ? prev + 1 : 0;
                                                    queueProductScroll(next);
                                                    return next;
                                                  });
                                                } else if (e.key === 'ArrowUp') {
                                                  e.preventDefault();
                                                  if (filteredByName.length === 0) return;
                                                  setHighlightedProdNameIndex((prev) => {
                                                    const next = prev > 0 ? prev - 1 : filteredByName.length - 1;
                                                    queueProductScroll(next);
                                                    return next;
                                                  });
                                                } else if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  if (filteredByName.length > 0) {
                                                    const selected = filteredByName[highlightedProdNameIndex] || filteredByName[0];
                                                    handleProductSelectionWithWH(selected, idx, values.dispatchWarehouse, setFieldValue, item);
                                                    setActiveProdNameIndex(null);
                                                  }
                                                } else if (e.key === 'Tab' || e.key === 'Escape') {
                                                  setActiveProdNameIndex(null);
                                                }
                                              }}
                                              onChange={(e) => {
                                                const typed = e.target.value;
                                                setFieldValue(`items.${idx}.itemName`, typed);
                                                setFieldValue(`items.${idx}.skuCode`, '');
                                                setActiveProdNameIndex(idx);
                                                setHighlightedProdNameIndex(0);

                                                // Exact Description match auto-sync
                                                const matched = productsList.find(
                                                  p => p.product_name && p.product_name.toLowerCase() === typed.trim().toLowerCase()
                                                );
                                                if (matched) {
                                                  handleProductSelectionWithWH(matched, idx, values.dispatchWarehouse, setFieldValue, item);
                                                }
                                              }}
                                              placeholder="Search Description..."
                                              className="w-full bg-white dark:bg-boxdark font-bold border border-stroke dark:border-strokedark rounded p-2 outline-none text-xs text-black dark:text-white focus:border-primary shadow-sm"
                                            />

                                            {selectedProd?.bin && (
                                              <div className="text-[10px] text-gray-500 dark:text-gray-400 font-sans mt-0.5 truncate">
                                                BIN Location: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedProd.bin || 'N/A'}</span> {selectedProd.category ? `• ${selectedProd.category}` : ''}
                                              </div>
                                            )}

                                            {item.skuCode && (
                                              <div className="text-[10px] font-mono font-bold text-primary dark:text-blue-400 mt-0.5 truncate">
                                                Code: {item.skuCode}
                                              </div>
                                            )}

                                            {/* SEARCHABLE PRODUCT DROPDOWN (UPPER LAYER ON Z-AXIS) */}
                                            {isCurrentProdNameActive && (
                                              <div ref={productDropdownScrollRef} className="absolute left-0 top-full mt-1.5 z-[99999] min-w-[340px] max-w-[420px] max-h-[300px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                                                {filteredByName.map((p, pIdx) => {
                                                  const displaySku = p.item_sr_no || `SKU-${p.id}`;
                                                  const isHighlighted = pIdx === highlightedProdNameIndex;
                                                  return (
                                                    <div
                                                      key={p.id}
                                                      data-opt={pIdx}
                                                      onMouseEnter={() => setHighlightedProdNameIndex(pIdx)}
                                                      onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleProductSelectionWithWH(p, idx, values.dispatchWarehouse, setFieldValue, item);
                                                        setActiveProdNameIndex(null);
                                                      }}
                                                      onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleProductSelectionWithWH(p, idx, values.dispatchWarehouse, setFieldValue, item);
                                                        setActiveProdNameIndex(null);
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
                                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                                                          <span className="bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded font-bold text-primary">
                                                            {displaySku}
                                                          </span>

                                                          {p.category && <span>• {p.category}</span>}
                                                        </div>
                                                      </div>
                                                      <div className="text-right font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                                                        Rs. {Number(p.retail_price || 0).toLocaleString()}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                                {filteredByName.length === 0 && (
                                                  <div className="p-4 text-center text-xs text-slate-400 italic">
                                                    No matching products found
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                      {hasItemError && <p className="text-red-500 text-[9px] font-bold mt-0.5">Required Field</p>}
                                    </td>

                                    {/* ROW-LEVEL WAREHOUSE ZONE SOURCE */}
                                    <td className="p-2 w-44 relative wh-container">
                                      {(() => {
                                        const isWhActive = activeWhIndex === idx;
                                        const currentWh = item.warehouse || values.dispatchWarehouse || '';
                                        const filteredWhs = warehousesList.filter(w =>
                                          w.toLowerCase().includes(currentWh.toLowerCase().trim())
                                        );

                                        return (
                                          <div className="relative">
                                            <input
                                              type="text"
                                              autoComplete="off"
                                              value={currentWh}
                                              onFocus={() => {
                                                setActiveWhIndex(idx);
                                                setHighlightedWhIndex(0);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'ArrowDown') {
                                                  e.preventDefault();
                                                  setHighlightedWhIndex(prev => prev < filteredWhs.length - 1 ? prev + 1 : 0);
                                                } else if (e.key === 'ArrowUp') {
                                                  e.preventDefault();
                                                  setHighlightedWhIndex(prev => prev > 0 ? prev - 1 : filteredWhs.length - 1);
                                                } else if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  if (filteredWhs[highlightedWhIndex]) {
                                                    const selectedWh = filteredWhs[highlightedWhIndex];
                                                    setFieldValue(`items.${idx}.warehouse`, selectedWh);
                                                    if (item.itemName) {
                                                      fetchStockForWarehouse(item.itemName, selectedWh).then(stock => setFieldValue(`items.${idx}.availableQty`, stock));
                                                    }
                                                    setActiveWhIndex(null);
                                                  }
                                                } else if (e.key === 'Escape' || e.key === 'Tab') {
                                                  setActiveWhIndex(null);
                                                }
                                              }}
                                              onChange={(e) => {
                                                const typed = e.target.value;
                                                setFieldValue(`items.${idx}.warehouse`, typed);
                                                setActiveWhIndex(idx);
                                                setHighlightedWhIndex(0);
                                              }}
                                              placeholder={`Default (${values.dispatchWarehouse || 'None'})`}
                                              className="w-full bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded p-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-primary shadow-sm"
                                            />

                                            {/* WAREHOUSE DROPDOWN */}
                                            {isWhActive && filteredWhs.length > 0 && (
                                              <div className="absolute left-0 right-0 top-full mt-1 z-[99999] max-h-[200px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300">
                                                {filteredWhs.map((wh, wIdx) => {
                                                  const isHighlighted = wIdx === highlightedWhIndex;
                                                  return (
                                                    <div
                                                      key={wh}
                                                      onMouseEnter={() => setHighlightedWhIndex(wIdx)}
                                                      onMouseDown={async (e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setFieldValue(`items.${idx}.warehouse`, wh);
                                                        if (item.itemName) {
                                                          const stock = await fetchStockForWarehouse(item.itemName, wh);
                                                          setFieldValue(`items.${idx}.availableQty`, stock);
                                                        }
                                                        setActiveWhIndex(null);
                                                      }}
                                                      onClick={async (e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setFieldValue(`items.${idx}.warehouse`, wh);
                                                        if (item.itemName) {
                                                          const stock = await fetchStockForWarehouse(item.itemName, wh);
                                                          setFieldValue(`items.${idx}.availableQty`, stock);
                                                        }
                                                        setActiveWhIndex(null);
                                                      }}
                                                      className={`p-2 cursor-pointer transition text-xs font-bold ${isHighlighted ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-l-4 border-emerald-500' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                                                    >
                                                      {wh}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </td>

                                    {/* STOCK IN WAREHOUSE WITH LOOSE PIECES BREAKDOWN */}
                                    <td className="p-2 text-center bg-success/5 text-xs w-[140px]">
                                      <div className="flex flex-col items-center justify-center font-mono">
                                        <span className="font-black text-success text-xs">
                                          {isTile && pcsPerBox > 1 ? `${availBoxes.toLocaleString()} Boxes` : totalAvailStock.toLocaleString()}
                                        </span>
                                        {isTile && pcsPerBox > 1 && (
                                          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-sans">
                                            {availLoosePcs > 0 ? `+ ${availLoosePcs} pcs loose` : `(0 loose pcs)`}
                                          </span>
                                        )}
                                        {!isTile && uomName && (
                                          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-sans">
                                            {uomName}
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* QTY (UOM) WITH DEDICATED BOXES & LOOSE PIECES INPUTS FOR TILES */}
                                    <td className="p-2 min-w-[250px]">
                                      {isTile ? (
                                        (() => {
                                          // Parse tile dimensions from product description or SKU (e.g. "60 × 60 cm" or "Size: 60 × 60 cm")
                                          let tileWidthCm = 60;
                                          let tileHeightCm = 60;
                                          const desc = selectedProd?.product_description || '';
                                          const sku = selectedProd?.item_sr_no || '';
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

                                          const isOverStock = Boolean(item.itemName && currentQty > totalAvailStock);

                                          return (
                                            <div className="flex flex-col gap-1">
                                              {/* ── TOP BADGES: Per Box Sq.Mtr & Per Piece Sq.Mtr ── */}
                                              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-1 font-mono">
                                                <span className="text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800/60 font-bold">
                                                  Box: {perBoxSqm.toFixed(2)} sq.m
                                                </span>
                                                <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60 font-bold">
                                                  Pc: {perPieceSqm.toFixed(4)} sq.m
                                                </span>
                                              </div>

                                              {/* ── INPUTS CONTAINER ── */}
                                              <div className={`flex items-center gap-2 p-1.5 rounded-lg border shadow-inner transition ${isOverStock ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-800' : 'bg-slate-50 dark:bg-slate-800/90 border-stroke dark:border-strokedark'}`}>
                                                {/* BOXES INPUT */}
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

                                                      const currentRp = Math.max(0, Number(item.rp) || 0);
                                                      const gross = combinedQty * currentRp;
                                                      const disPer = Math.max(0, Number(item.discountPer) || 0);
                                                      if (disPer > 0) {
                                                        setFieldValue(`items.${idx}.discountAmt`, Number(((gross * disPer) / 100).toFixed(2)));
                                                      }
                                                    }}
                                                    className="w-full bg-transparent text-center font-black text-sm text-primary outline-none min-w-[36px]"
                                                  />
                                                  <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 pl-1 select-none">Box</span>
                                                </div>

                                                <span className="text-gray-400 font-black text-sm select-none">+</span>

                                                {/* LOOSE PIECES INPUT */}
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

                                                      // Automatic carryover if loose pieces >= pieces_per_box
                                                      const extraBoxes = Math.floor(enteredLoose / pcsPerBox);
                                                      const remLoose = enteredLoose % pcsPerBox;
                                                      const finalBoxes = currentBoxes + extraBoxes;
                                                      const combinedQty = remLoose > 0
                                                        ? Number((finalBoxes + remLoose / pcsPerBox).toFixed(3))
                                                        : finalBoxes;

                                                      setFieldValue(`items.${idx}.qty`, combinedQty);

                                                      const currentRp = Math.max(0, Number(item.rp) || 0);
                                                      const gross = combinedQty * currentRp;
                                                      const disPer = Math.max(0, Number(item.discountPer) || 0);
                                                      if (disPer > 0) {
                                                        setFieldValue(`items.${idx}.discountAmt`, Number(((gross * disPer) / 100).toFixed(2)));
                                                      }
                                                    }}
                                                    className="w-full bg-transparent text-center font-black text-sm text-emerald-600 dark:text-emerald-400 outline-none min-w-[36px]"
                                                  />
                                                  <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 pl-1 select-none">Pcs</span>
                                                </div>
                                              </div>

                                              {/* ── BOTTOM TOTAL SQ.MTR CALCULATION ── */}
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
                                          const u = String(uomName || selectedProd?.uom || '').trim().toUpperCase();
                                          const isDecimalUom = [
                                            'KG', 'KILOGRAM', 'GM', 'GRAM', 'TON', 'METRIC TON', 'LBS',
                                            'LTR', 'LITER', 'LITRE', 'ML', 'GAL',
                                            'MTR', 'METER', 'FT', 'FEET', 'INCH', 'CM', 'MM', 'YD',
                                            'SQM', 'SQ.M', 'SQ.MTR', 'SQ.FT', 'SQF', 'SQY', 'SQUARE METER'
                                          ].includes(u);
                                          const isOverStock = Boolean(item.itemName && Number(item.qty || 0) > totalAvailStock);

                                          return (
                                            <div className={`flex items-center gap-1.5 rounded px-2 py-1 border transition ${isOverStock ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-400 dark:border-rose-800' : 'bg-slate-50 dark:bg-slate-800 border-stroke dark:border-strokedark'}`}>
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
                                                    const newQty = parseFloat(val) || 0;
                                                    const currentRp = Math.max(0, Number(item.rp) || 0);
                                                    const gross = newQty * currentRp;
                                                    const disPer = Math.max(0, Number(item.discountPer) || 0);
                                                    if (disPer > 0) {
                                                      setFieldValue(`items.${idx}.discountAmt`, Number(((gross * disPer) / 100).toFixed(2)));
                                                    }
                                                  }
                                                }}
                                                placeholder="1"
                                                className="w-full bg-transparent text-center font-black text-sm text-primary outline-none"
                                              />
                                              {uomName && (
                                                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap select-none">
                                                  {uomName}
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })()
                                      )}
                                    </td>
                                    <td className="p-2">
                                      <input
                                        type="number"
                                        min="0"
                                        onKeyDown={blockInvalidChar}
                                        onInput={(e: any) => { if (Number(e.target.value) < 0) e.target.value = 0; }}
                                        name={`items.${idx}.rp`}
                                        value={item.rp}
                                        onChange={(e) => {
                                          const newRp = Math.max(0, Number(e.target.value) || 0);
                                          setFieldValue(`items.${idx}.rp`, newRp);
                                          const currentQty = Math.max(0, Number(item.qty) || 0);
                                          const gross = newRp * currentQty;
                                          const disPer = Math.max(0, Number(item.discountPer) || 0);
                                          if (disPer > 0) {
                                            setFieldValue(`items.${idx}.discountAmt`, Number(((gross * disPer) / 100).toFixed(2)));
                                          }
                                        }}
                                        className={`w-full bg-transparent text-right font-bold outline-none border rounded p-1 ${hasAttempted && (errors.items as any)?.[idx] && (!item.rp || item.rp < 0) ? 'border-red-500 bg-red-50/10' : 'border-transparent'}`}
                                      />
                                      {Number(item.itemServiceCharges) > 0 && (
                                        <div className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold text-right mt-0.5 whitespace-nowrap">
                                          Svc: Rs.{Number(item.itemServiceCharges).toFixed(0)}
                                        </div>
                                      )}
                                    </td>

                                    {showDiscount && (
                                      <>
                                        <td className="p-2">
                                          <input
                                            type="number"
                                            min="0"
                                            onKeyDown={blockInvalidChar}
                                            onInput={(e: any) => { if (Number(e.target.value) < 0) e.target.value = 0; }}
                                            name={`items.${idx}.discountPer`}
                                            value={item.discountPer ?? 0}
                                            onChange={(e) => {
                                              const val = Math.max(0, Number(e.target.value) || 0);
                                              setFieldValue(`items.${idx}.discountPer`, val);
                                              const gross = Math.max(0, Number(item.qty) || 0) * Math.max(0, Number(item.rp) || 0);
                                              const amt = (gross * val) / 100;
                                              setFieldValue(`items.${idx}.discountAmt`, Number(amt.toFixed(2)));
                                            }}
                                            placeholder="0"
                                            className="w-full bg-amber-50/40 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 text-center font-black outline-none border border-amber-300 dark:border-amber-700 rounded p-1 text-xs focus:border-amber-500"
                                          />
                                        </td>
                                        <td className="p-2">
                                          <input
                                            type="number"
                                            min="0"
                                            onKeyDown={blockInvalidChar}
                                            onInput={(e: any) => { if (Number(e.target.value) < 0) e.target.value = 0; }}
                                            name={`items.${idx}.discountAmt`}
                                            value={item.discountAmt ?? 0}
                                            onChange={(e) => {
                                              const val = Math.max(0, Number(e.target.value) || 0);
                                              setFieldValue(`items.${idx}.discountAmt`, val);
                                              const gross = Math.max(0, Number(item.qty) || 0) * Math.max(0, Number(item.rp) || 0);
                                              const per = gross > 0 ? (val / gross) * 100 : 0;
                                              setFieldValue(`items.${idx}.discountPer`, Number(per.toFixed(2)));
                                            }}
                                            placeholder="0"
                                            className="w-full bg-amber-50/40 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 text-right font-black outline-none border border-amber-300 dark:border-amber-700 rounded p-1 text-xs focus:border-amber-500"
                                          />
                                        </td>
                                      </>
                                    )}

                                    {values.applyFbrTax && (
                                      <>
                                        {values.taxScenario === 'Reduced Rate Sale' ? (
                                          <>
                                            <td className="p-2 w-20">
                                              <input
                                                type="number"
                                                min="0"
                                                onKeyDown={blockInvalidChar}
                                                onInput={(e: any) => { if (Number(e.target.value) < 0) e.target.value = 0; }}
                                                name={`items.${idx}.gstRate`}
                                                value={item.gstRate ?? 0}
                                                onChange={(e) => setFieldValue(`items.${idx}.gstRate`, Math.max(0, Number(e.target.value) || 0))}
                                                placeholder="0"
                                                className="w-full bg-emerald-50/40 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 text-center font-black outline-none border border-emerald-300 dark:border-emerald-700 rounded p-1 text-xs focus:border-emerald-500"
                                              />
                                            </td>
                                            <td className="p-2 w-20">
                                              <input
                                                type="number"
                                                min="0"
                                                onKeyDown={blockInvalidChar}
                                                onInput={(e: any) => { if (Number(e.target.value) < 0) e.target.value = 0; }}
                                                name={`items.${idx}.fTaxPer`}
                                                value={item.fTaxPer ?? 0}
                                                onChange={(e) => setFieldValue(`items.${idx}.fTaxPer`, Math.max(0, Number(e.target.value) || 0))}
                                                placeholder="0"
                                                className="w-full bg-emerald-50/40 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 text-center font-black outline-none border border-emerald-300 dark:border-emerald-700 rounded p-1 text-xs focus:border-emerald-500"
                                              />
                                            </td>
                                          </>
                                        ) : (
                                          <>
                                            <td className="p-2 text-center text-gray-400 font-sans">{lineCalc.activeGstRate}%</td>
                                            <td className="p-2 text-center text-gray-400 font-sans">{lineCalc.activeFTaxPer}%</td>
                                          </>
                                        )}
                                        <td className="p-2 text-right pr-2 text-gray-400">Rs. {lineCalc.gstAmt.toFixed(2)}</td>
                                        <td className="p-2 text-right pr-2 text-gray-400">Rs. {lineCalc.fTaxAmt.toFixed(2)}</td>
                                      </>
                                    )}
                                    <td className="p-2 text-right pr-4 text-success font-black">Rs. {lineCalc.netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="p-1 w-8 text-center">{values.items.length > 1 && <button type="button" onClick={() => remove(idx)} className="text-gray-400 hover:text-danger cursor-pointer"><FiTrash2 size={14} /></button>}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="p-2 bg-gray-50/10 dark:bg-meta-4/10 border-t border-stroke dark:border-strokedark text-left">
                            <button
                              type="button"
                              onClick={() => push({ itemName: '', skuCode: '', qty: 1, rp: 0, discountPer: 0, discountAmt: 0, gstRate: 18, fTaxPer: 0, amount: 0, availableQty: 0 })}
                              className="text-success font-bold hover:underline cursor-pointer"
                            >
                              + Append Item Row
                            </button>
                          </div>
                        </div>
                      );
                    }}
                  </FieldArray>
                </div>

                {/* --- LOCATION GATE PASSES DYNAMIC SECTION --- */}
                {(() => {
                  const validItems = values.items.filter((i: any) => i.itemName && i.itemName.trim() !== '');
                  if (validItems.length === 0) return null;
                  const uniqueLocations = Array.from(new Set(validItems.map((i: any) => i.warehouse || values.dispatchWarehouse || 'Main Warehouse').filter(Boolean)));
                  if (uniqueLocations.length === 0) return null;
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-meta-4/5 p-4 rounded-sm border border-stroke dark:border-strokedark mt-6">
                      <div className="col-span-full mb-1">
                        <h4 className="font-bold text-gray-700 dark:text-gray-300">Location Gate Passes</h4>
                        <p className="text-xs text-gray-500">Provide a gate pass number for each dispatch location involved in this invoice.</p>
                      </div>
                      {uniqueLocations.map(loc => (
                        <div key={loc as string}>
                          <label className="block font-bold text-gray-500 mb-1 flex items-center gap-2">
                            <span className="truncate">{loc as string}</span> *
                          </label>
                          <input 
                            type="text" 
                            name={`gatePasses.${loc as string}`} 
                            value={values.gatePasses[loc as string] || ''} 
                            onChange={handleChange} 
                            placeholder={`Gate pass for ${loc}`} 
                            className={`w-full rounded border p-2 text-sm bg-transparent font-bold outline-none text-black dark:text-white ${hasAttempted && !values.gatePasses[loc as string] ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus:border-primary'}`} 
                          />
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="flex flex-col md:flex-row justify-between items-start gap-6 border border-stroke p-4 rounded-sm bg-slate-50/10 mt-6 relative z-0">
                  <div className="w-full md:w-1/2 space-y-4">
                    <div>
                      <span className="font-bold text-gray-500 block mb-1">Payment Method / Settlement Mode: *</span>
                      <select
                        name="settlementMode"
                        value={values.settlementMode}
                        onChange={(e) => {
                          handleChange(e);
                          if (e.target.value === 'Cash') {
                            setFieldValue('selectedBankTitle', '');
                            setFieldValue('bankAmountPaid', 0);
                          }
                        }}
                        className={`w-full border rounded p-2 text-xs bg-white dark:bg-boxdark font-black outline-none text-black dark:text-white ${hasAttempted && errors.settlementMode ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus:border-primary'}`}
                      >
                        <option value="Cash">Cash Only</option>
                        <option value="Bank">Bank Transfer Only</option>
                        <option value="Split">Cash & Bank Combined</option>
                      </select>
                      {hasAttempted && errors.settlementMode && <p className="text-red-500 text-[10px] font-bold mt-1">{String(errors.settlementMode)}</p>}
                    </div>

                    {(values.settlementMode === 'Bank' || values.settlementMode === 'Split') && (
                      <div>
                        <span className="font-bold text-gray-500 block mb-1">Corporate Bank Ledger Profile: *</span>
                        <SearchableDropdown
                          options={banksList.map(b => `${b.bankName} - ${b.accountTitle}`)}
                          value={
                            banksList.find(b => b.accountTitle === values.selectedBankTitle)
                              ? `${banksList.find(b => b.accountTitle === values.selectedBankTitle)!.bankName} - ${values.selectedBankTitle}`
                              : values.selectedBankTitle
                          }
                          onChange={(val) => {
                            const match = banksList.find(b => `${b.bankName} - ${b.accountTitle}` === val);
                            handleChange({ target: { name: 'selectedBankTitle', value: match ? match.accountTitle : val } });
                          }}
                          placeholder="-- Search Account Wire Registry --"
                          className={hasAttempted && errors.selectedBankTitle ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus:border-primary'}
                        />
                        {hasAttempted && errors.selectedBankTitle && <p className="text-red-500 text-[10px] font-bold mt-1">{String(errors.selectedBankTitle)}</p>}
                      </div>
                    )}

                    {(() => {
                      const totalPaidNow = values.settlementMode === 'Cash'
                        ? Number(values.cashAmountPaid || 0)
                        : (values.settlementMode === 'Bank' ? Number(values.bankAmountPaid || 0) : (Number(values.cashAmountPaid || 0) + Number(values.bankAmountPaid || 0)));
                      const isOverpaid = totalPaidNow > currentSubtotalValue + 0.01;

                      return (
                        <div className="w-full space-y-2">
                          <div className={values.settlementMode === 'Split' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'w-full'}>
                            {(values.settlementMode === 'Cash' || values.settlementMode === 'Split') && (
                              <div>
                                <span className={`font-bold block mb-1 ${isOverpaid ? 'text-red-600 dark:text-red-400' : 'text-danger'}`}>
                                  Cash Payment Amount (PKR): *
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  onKeyDown={blockInvalidChar}
                                  onWheel={(e: any) => e.target.blur()}
                                  name="cashAmountPaid"
                                  value={values.cashAmountPaid === 0 ? '' : values.cashAmountPaid}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const num = val === '' ? 0 : Math.max(0, Number(val) || 0);
                                    setFieldValue('cashAmountPaid', num);
                                  }}
                                  placeholder="0"
                                  className={`w-full rounded border p-2 bg-transparent text-right font-black text-sm outline-none ${
                                    isOverpaid 
                                      ? 'border-2 border-red-500 bg-red-50/50 dark:bg-red-950/30 text-red-600 dark:text-red-400 ring-2 ring-red-400' 
                                      : (hasAttempted && errors.cashAmountPaid ? 'border-red-500 bg-red-50/10 text-danger' : 'border-stroke dark:border-strokedark focus:border-primary text-black dark:text-white')
                                  }`}
                                />
                                {hasAttempted && errors.cashAmountPaid && <p className="text-red-500 text-[10px] font-bold mt-1">{errors.cashAmountPaid}</p>}
                              </div>
                            )}

                            {(values.settlementMode === 'Bank' || values.settlementMode === 'Split') && (
                              <div>
                                <span className={`font-bold block mb-1 ${isOverpaid ? 'text-red-600 dark:text-red-400' : 'text-primary'}`}>
                                  Bank Payment Amount (PKR): *
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  onKeyDown={blockInvalidChar}
                                  onWheel={(e: any) => e.target.blur()}
                                  name="bankAmountPaid"
                                  value={values.bankAmountPaid === 0 ? '' : values.bankAmountPaid}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const num = val === '' ? 0 : Math.max(0, Number(val) || 0);
                                    setFieldValue('bankAmountPaid', num);
                                  }}
                                  placeholder="0"
                                  className={`w-full rounded border p-2 bg-transparent text-right font-black text-sm outline-none ${
                                    isOverpaid 
                                      ? 'border-2 border-red-500 bg-red-50/50 dark:bg-red-950/30 text-red-600 dark:text-red-400 ring-2 ring-red-400' 
                                      : (hasAttempted && errors.bankAmountPaid ? 'border-red-500 bg-red-50/10 text-primary' : 'border-stroke dark:border-strokedark focus:border-primary text-black dark:text-white')
                                  }`}
                                />
                                {hasAttempted && errors.bankAmountPaid && <p className="text-red-500 text-[10px] font-bold mt-1">{errors.bankAmountPaid}</p>}
                              </div>
                            )}
                          </div>

                          {isOverpaid && (
                            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold flex items-center gap-2 animate-pulse">
                              <span className="text-base">⚠️</span>
                              <span>
                                <strong>Payment Exceeds Total Bill:</strong> Entered Rs. {totalPaidNow.toLocaleString(undefined, { minimumFractionDigits: 2 })} on a bill of Rs. {currentSubtotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}. Please correct the amount before logging.
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* FINANCIAL AUDIT SUMMARY CARD */}
                  <div className="w-full md:w-1/3 space-y-2 font-mono font-bold text-xs text-black dark:text-white">
                    <div className="flex justify-between border-b pb-1 dark:border-strokedark">
                      <span>Net Invoice Value Total:</span>
                      <span>Rs. {currentSubtotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    {values.showAdditionalCharges && (
                      <div className="flex justify-between items-center border-b pb-1 dark:border-strokedark text-blue-600 dark:text-blue-400">
                        <span className="text-xs">Freight Charges:</span>
                        <input
                          type="number"
                          min="0"
                          name="additionalCharges"
                          value={values.additionalCharges}
                          onChange={handleChange}
                          placeholder="0.00"
                          className="w-28 text-right font-black bg-blue-50/40 dark:bg-blue-900/10 border border-blue-300 dark:border-blue-700 rounded p-1 text-xs outline-none focus:border-blue-500 text-blue-700 dark:text-blue-300"
                        />
                      </div>
                    )}

                    {(values.settlementMode === 'Cash' || values.settlementMode === 'Split') && (
                      <div className="flex justify-between border-b pb-1 dark:border-strokedark text-emerald-600">
                        <span>Received Cash Flow:</span>
                        <span>Rs. {Number(values.cashAmountPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {(values.settlementMode === 'Bank' || values.settlementMode === 'Split') && (
                      <div className="flex justify-between border-b pb-1 dark:border-strokedark text-primary">
                        <span>Received Bank Wire:</span>
                        <span>Rs. {Number(values.bankAmountPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {values.settlementMode === 'Split' && (
                      <div className="flex justify-between border-b pb-1 dark:border-strokedark text-success font-black">
                        <span>Total Paid (Cash + Bank):</span>
                        <span>Rs. {(Number(values.cashAmountPaid || 0) + Number(values.bankAmountPaid || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {(() => {
                      const totalPaidNow = values.settlementMode === 'Cash'
                        ? Number(values.cashAmountPaid || 0)
                        : (values.settlementMode === 'Bank' ? Number(values.bankAmountPaid || 0) : (Number(values.cashAmountPaid || 0) + Number(values.bankAmountPaid || 0)));
                      const remBalance = Math.max(0, currentSubtotalValue - totalPaidNow);
                      return (
                        <div className="flex justify-between pt-1 border-double border-b-4 border-stroke dark:border-strokedark">
                          <span className="font-sans text-[11px]">Un-invoiced Remaining Balance:</span>
                          <b className={`text-sm ${remBalance > 0 ? 'text-danger' : 'text-success'}`}>
                            Rs. {remBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </b>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-6 mt-6 border-t border-stroke dark:border-strokedark">
                  <button
                    type="button"
                    onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/sales/invoice/list`)}
                    className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                  >
                    Cancel
                  </button>

                  {(() => {
                    const totalPaidNow = values.settlementMode === 'Cash'
                      ? Number(values.cashAmountPaid || 0)
                      : (values.settlementMode === 'Bank' ? Number(values.bankAmountPaid || 0) : (Number(values.cashAmountPaid || 0) + Number(values.bankAmountPaid || 0)));
                    const isOverpaid = totalPaidNow > currentSubtotalValue + 0.01;

                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (isOverpaid) {
                              toast.error(`Payment (Rs. ${totalPaidNow.toLocaleString()}) cannot exceed bill total (Rs. ${currentSubtotalValue.toLocaleString()})!`);
                              return;
                            }
                            setSubmitAction('print');
                            submitForm();
                          }}
                          disabled={loading || isOverpaid}
                          className={`rounded-xl py-3 px-6 font-bold text-white transition shadow-md text-xs cursor-pointer flex items-center gap-2 ${
                            isOverpaid ? 'bg-gray-400 cursor-not-allowed opacity-50' : 'bg-teal-600 hover:bg-teal-700'
                          }`}
                        >
                          <FiPrinter size={15} /> <span>Save & Print</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (isOverpaid) {
                              toast.error(`Payment (Rs. ${totalPaidNow.toLocaleString()}) cannot exceed bill total (Rs. ${currentSubtotalValue.toLocaleString()})!`);
                              return;
                            }
                            setSubmitAction('save');
                            submitForm();
                          }}
                          disabled={loading || isOverpaid}
                          className={`rounded-xl py-3 px-8 font-bold text-white transition shadow-md text-xs cursor-pointer flex items-center gap-2 ${
                            isOverpaid ? 'bg-gray-400 cursor-not-allowed opacity-50' : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <><FiCheck size={15} /> <span>{editData ? 'Apply Updates' : 'Log Invoice'}</span></>}
                        </button>
                      </>
                    );
                  })()}
                </div>
              </Form>
            );
          }}
        </Formik>
      </div>
    </div>
  );
};

export default NewInvoice;
