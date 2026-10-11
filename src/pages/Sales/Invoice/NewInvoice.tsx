import React, { useState, useEffect, useRef } from 'react';
import { getAvailableStock, getTotalAvailableStock, getWarehouseAvailableStock, fetchStockDataset } from '../../../utils/stockCalculator';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiPrinter, FiSave, FiCheck, FiX, FiUserCheck, FiTrash2, FiUser } from 'react-icons/fi';
import { SearchableDropdown } from '../../../components/SearchableDropdown';
import { useAuth } from '../../../Context/Auth';
import { logActivity } from '../../../service/auditLogger';

// Helper to identify Tile products based on parent category
const isTileProduct = (p: any) => {
  const parent = String(p?.sub_sub_category || '').toLowerCase().trim();
  return parent.includes('tile');
};

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
  const [activeReturnProdIndex, setActiveReturnProdIndex] = useState<number | null>(null);
  const [highlightedReturnProdIndex, setHighlightedReturnProdIndex] = useState<number>(0);
  const [activeReturnWhIndex, setActiveReturnWhIndex] = useState<number | null>(null);
  const [highlightedReturnWhIndex, setHighlightedReturnWhIndex] = useState<number>(0);
  const [activeTileProdIndex, setActiveTileProdIndex] = useState<number | null>(null);
  const [highlightedTileProdIndex, setHighlightedTileProdIndex] = useState<number>(0);
  const [activeTileWhIndex, setActiveTileWhIndex] = useState<number | null>(null);
  const [highlightedTileWhIndex, setHighlightedTileWhIndex] = useState<number>(0);

  const [totalStockMap, setTotalStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let isCancelled = false;
    const calculateAllStocks = async () => {
      if (!productsList || productsList.length === 0) return;
      const map: Record<string, number> = {};

      if (stockDataset) {
        if (stockDataset.balancesMode && Array.isArray(stockDataset.balances)) {
          (stockDataset.balances || []).forEach((r: any) => {
            const name = String(r.product_name || '').toLowerCase().trim();
            map[name] = (map[name] || 0) + (Number(r.quantity) || 0);
          });
        } else {
          for (const p of productsList) {
            const name = (p.product_name || '').toLowerCase().trim();
            try {
              const val = await getTotalAvailableStock(p.product_name, stockDataset);
              map[name] = val;
            } catch {
              map[name] = Number(p.current_stock || 0);
            }
          }
        }
      }
      productsList.forEach(p => {
        const name = (p.product_name || '').toLowerCase().trim();
        if (map[name] === undefined) {
          map[name] = Number(p.current_stock || 0);
        }
      });
      if (!isCancelled) {
        setTotalStockMap(map);
      }
    };
    calculateAllStocks();
    return () => { isCancelled = true; };
  }, [stockDataset, productsList]);

  const getProductOverallStock = (p: any): number => {
    if (!p) return 0;
    const key = String(p.product_name || '').toLowerCase().trim();
    if (totalStockMap[key] !== undefined) return totalStockMap[key];
    return Number(p.current_stock || 0);
  };

  const getTileStockBreakdown = (p: any) => {
    const totStock = getProductOverallStock(p);
    let pcsPerBox = Number(p.pieces_per_box || p.pcs_per_box || p.pieces_per_packing || 0);
    if (pcsPerBox <= 1) {
      const match = String(p.product_description || '').match(/Box:\s*(\d+)\s*pcs/i);
      if (match && Number(match[1]) > 0) pcsPerBox = Number(match[1]);
      else pcsPerBox = 4;
    }
    const boxes = Math.floor(totStock / pcsPerBox);
    const loose = totStock % pcsPerBox;
    return { totStock, boxes, loose, pcsPerBox };
  };

  const getItemWarehouseStock = (productName: string, warehouseName: string): number => {
    if (!productName || !warehouseName) return 0;
    return getWarehouseAvailableStock(productName, warehouseName, stockDataset);
  };

  const [showCustomerModal, setShowCustomerModal] = useState<boolean>(false);
  const [customerModalType, setCustomerModalType] = useState<'walkin' | 'recorded'>('walkin');
  const [walkinName, setWalkinName] = useState<string>('');
  const [walkinPhone, setWalkinPhone] = useState<string>('');
  const [recordWalkinCustomer, setRecordWalkinCustomer] = useState<boolean>(true);
  const [selectedRecordedCustomer, setSelectedRecordedCustomer] = useState<string>('');
  const [pendingFormValues, setPendingFormValues] = useState<any>(null);
  const [isOpeningCustomerModal, setIsOpeningCustomerModal] = useState<boolean>(false);
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
        const { data: rawCust } = await supabase.from('customers').select('*');
        const { data: prod } = await supabase.from('products').select('id, product_name, current_stock, retail_price, purchase_price, item_sr_no, category, sub_category, sub_sub_category, hs_code, uom, pieces_per_box, pcs_per_box, pieces_per_packing, product_description, bin, item_type, service_charges');
        const { data: sm } = await supabase.from('salesmen').select('id, name, invoice_name, invoice_names');
        const { data: trans } = await supabase.from('logistics_transportation').select('id, name, base_charges');
        const { data: locMaster } = await supabase.from('inventory_locations').select('name');
        const { data: wh } = await supabase.from('opening_stocks').select('location');
        const { data: invWh } = await supabase.from('warehouse_inventory').select('warehouse_name');
        const { data: rawBnk } = await supabase.from('banks').select('*');

        const cust = (rawCust || []).map((c: any) => ({
          ...c,
          customerName: c.customerName || c.customername || c.name || '',
          primaryPhone: c.primaryPhone || c.primaryphone || c.phone || '',
          customer_code: c.customer_code || c.customerCode || c.customercode || ''
        }));
        const bnk = (rawBnk || []).map((b: any) => ({
          ...b,
          bankName: b.bankName || b.bankname || '',
          accountTitle: b.accountTitle || b.accounttitle || b.account_title || ''
        }));

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
      if (!target.closest('.return-prod-name-container')) {
        setActiveReturnProdIndex(null);
      }
      if (!target.closest('.return-wh-container')) {
        setActiveReturnWhIndex(null);
      }
      if (!target.closest('.tile-prod-name-container')) {
        setActiveTileProdIndex(null);
      }
      if (!target.closest('.tile-wh-container')) {
        setActiveTileWhIndex(null);
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
        showOverallDiscount: Number(editData.overall_discount || editData.discount_amount || parsedItems.find((i: any) => i._overallDiscount !== undefined)?._overallDiscount || 0) > 0,
        overallDiscount: Number(editData.overall_discount || editData.discount_amount || parsedItems.find((i: any) => i._overallDiscount !== undefined)?._overallDiscount || 0),
        showAdditionalCharges: Number(editData.additional_charges || 0) > 0,
        additionalCharges: Number(editData.additional_charges || 0),
        showReturnSection: (Array.isArray(editData.return_items) && editData.return_items.length > 0) || (Array.isArray(parsedItems[0]?._returnItems) && parsedItems[0]._returnItems.length > 0),
        returnItems: (Array.isArray(editData.return_items) ? editData.return_items : (parsedItems[0]?._returnItems || [])).map((r: any) => ({
          skuCode: r.skuCode || r.sku || '',
          itemName: r.itemName || r.product_name || '',
          warehouse: r.warehouse || editData.dispatch_warehouse || '',
          qty: Number(r.qty || 1),
          rp: Number(r.rp ?? r.rate ?? 0),
          uom: r.uom || 'PCS',
          amount: Number(r.total || (Number(r.qty || 1) * Number(r.rp ?? r.rate ?? 0)))
        })),
        showTileSection: (Array.isArray(editData.tile_items) && editData.tile_items.length > 0) || (Array.isArray(parsedItems[0]?._tileItems) && parsedItems[0]._tileItems.length > 0) || parsedItems.some((i: any) => i.isTileItem),
        tileItems: (
          Array.isArray(editData.tile_items) && editData.tile_items.length > 0
            ? editData.tile_items
            : (Array.isArray(parsedItems[0]?._tileItems) && parsedItems[0]._tileItems.length > 0
                ? parsedItems[0]._tileItems
                : parsedItems.filter((i: any) => i.isTileItem))
        ).map((t: any, tIdx: number) => ({
          id: t.id || `tile-${tIdx}-${Date.now()}`,
          skuCode: t.skuCode || t.sku || '',
          itemName: t.itemName || t.product_name || '',
          warehouse: t.warehouse || editData.dispatch_warehouse || '',
          availableQty: Number(t.availableQty || 0),
          boxQty: Number(t.boxQty ?? t.qty ?? 1),
          loosePcs: Number(t.loosePcs ?? 0),
          piecesPerBox: Number(t.piecesPerBox ?? 4),
          sqmPerBox: Number(t.sqmPerBox ?? 1.44),
          pricePerBox: Number(t.pricePerBox ?? t.rp ?? 0),
          pricePerSqm: Number(t.pricePerSqm ?? 0),
          pricePerPiece: Number(t.pricePerPiece ?? 0),
          totalAmount: Number(t.totalAmount ?? t.total ?? t.amount ?? 0),
          totalSqm: Number(t.totalSqm ?? 0),
          isTileItem: true
        })),
        items: (parsedItems.filter((i: any) => !i.isTileItem).length > 0
          ? parsedItems.filter((i: any) => !i.isTileItem)
          : [{ skuCode: '', itemName: '', warehouse: '', qty: 1, rp: 0, discountPer: 0, discountAmt: 0, gstRate: 0, fTaxPer: 0, amount: 0, availableQty: 0, itemServiceCharges: 0 }]
        ).map((it: any) => ({
          ...it,
          warehouse: it.warehouse || editData.dispatch_warehouse || '',
          discountPer: Number(it.discountPer ?? it.discount_per ?? 0),
          discountAmt: Number(it.discountAmt ?? it.discount_amt ?? it.discount ?? 0)
        }))
      };
    }
    return {
      invoiceNo: '', customerName: '', saleDate: new Date().toISOString().split('T')[0], paymentTerm: 'Cash',
      dispatchWarehouse: '', applyFbrTax: false, showDiscount: false, showOverallDiscount: false, overallDiscount: 0, showAdditionalCharges: false, additionalCharges: 0,
      showReturnSection: false, returnItems: [],
      showTileSection: false, tileItems: [],
      taxScenario: 'Goods at Standard Rate to Registered Buyers',
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
      const { items, tileItems, showTileSection } = ctx.parent;
      const validItems = [
        ...(Array.isArray(items) ? items : []).filter((i: any) => i.itemName && i.itemName.trim() !== ''),
        ...(showTileSection && Array.isArray(tileItems) ? tileItems : []).filter((t: any) => t.itemName && t.itemName.trim() !== '')
      ];
      if (validItems.length === 0) return true;
      const uniqueLocations = Array.from(new Set(validItems.map((i: any) => i.warehouse || ctx.parent.dispatchWarehouse).filter(Boolean)));
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
        itemName: Yup.string().nullable(),
        warehouse: Yup.string().when('itemName', {
          is: (val: string) => Boolean(val && val.trim()),
          then: (s) => s.required('Warehouse is required'),
          otherwise: (s) => s.nullable()
        }),
        qty: Yup.number().when('itemName', {
          is: (val: string) => Boolean(val && val.trim()),
          then: (s) => s.min(0.001, 'Qty must be > 0').required('Qty is required'),
          otherwise: (s) => s.nullable()
        }),
        rp: Yup.number().when('itemName', {
          is: (val: string) => Boolean(val && val.trim()),
          then: (s) => s.min(0, 'Price cannot be negative').required('Price is required'),
          otherwise: (s) => s.nullable()
        }),
        discountPer: Yup.number().min(0).nullable(),
        discountAmt: Yup.number().min(0).nullable(),
        gstRate: Yup.number().min(0).nullable(),
        fTaxPer: Yup.number().min(0).nullable()
      })
    ).test('at-least-one-item', 'Please add at least one product (Standard or Tile) to the invoice', function (items, ctx) {
      const { tileItems, showTileSection } = ctx.parent;
      const hasStandard = Array.isArray(items) && items.some((i: any) => i && i.itemName && String(i.itemName).trim() !== '');
      const hasTile = showTileSection && Array.isArray(tileItems) && tileItems.some((t: any) => t && t.itemName && String(t.itemName).trim() !== '');
      return hasStandard || hasTile;
    }),
    tileItems: Yup.array().of(
      Yup.object().shape({
        itemName: Yup.string().nullable(),
        warehouse: Yup.string().when('itemName', {
          is: (val: string) => Boolean(val && val.trim()),
          then: (s) => s.required('Warehouse is required'),
          otherwise: (s) => s.nullable()
        }),
        boxQty: Yup.number().min(0).nullable(),
        loosePcs: Yup.number().min(0).nullable(),
        totalSqm: Yup.number().min(0).nullable()
      })
    ).nullable(),
    returnItems: Yup.array().of(
      Yup.object().shape({
        itemName: Yup.string().required('Item Name is required'),
        warehouse: Yup.string().required('Warehouse is required'),
        qty: Yup.number().min(0.001, 'Return Qty must be > 0').required('Qty is required'),
        rp: Yup.number().min(0, 'Return rate cannot be negative').required('Rate is required')
      })
    ).nullable()
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
      setFieldValue(`items.${index}.rp`, 0);
      setFieldValue(`items.${index}.amount`, 0);
      setFieldValue(`items.${index}.discountAmt`, 0);
      setFieldValue(`items.${index}.itemServiceCharges`, 0);
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

  const handleTileProductSelection = async (
    selectedProduct: any,
    tIdx: number,
    chosenWarehouse: string,
    setFieldValue: any,
    currentTileItem?: any
  ) => {
    if (!selectedProduct) {
      setFieldValue(`tileItems.${tIdx}.itemName`, '');
      setFieldValue(`tileItems.${tIdx}.skuCode`, '');
      setFieldValue(`tileItems.${tIdx}.availableQty`, 0);
      setFieldValue(`tileItems.${tIdx}.pricePerBox`, 0);
      setFieldValue(`tileItems.${tIdx}.pricePerSqm`, 0);
      setFieldValue(`tileItems.${tIdx}.pricePerPiece`, 0);
      setFieldValue(`tileItems.${tIdx}.totalAmount`, 0);
      setFieldValue(`tileItems.${tIdx}.totalSqm`, 0);
      return;
    }

    let pcsPerBox = Number(selectedProduct.pieces_per_box || selectedProduct.pcs_per_box || selectedProduct.pieces_per_packing || 0);
    if (pcsPerBox <= 1) {
      const match = String(selectedProduct.product_description || '').match(/Box:\s*(\d+)\s*pcs/i);
      if (match && Number(match[1]) > 0) pcsPerBox = Number(match[1]);
      else pcsPerBox = 4;
    }

    let sqmPerBox = 1.44;
    const matchSqm = String(selectedProduct.product_description || '').match(/([\d\.]+)\s*sq\.m/i);
    if (matchSqm && Number(matchSqm[1]) > 0) {
      sqmPerBox = Number(matchSqm[1]);
    } else {
      const dimMatch = String(`${selectedProduct.sub_category || ''} ${selectedProduct.product_description || ''} ${selectedProduct.item_sr_no || ''}`).match(/(\d+(?:\.\d+)?)\s*(?:[xX×*])\s*(\d+(?:\.\d+)?)/);
      if (dimMatch) {
        const h = Number(dimMatch[1]) || 60;
        const w = Number(dimMatch[2]) || 60;
        sqmPerBox = Number((((h / 100) * (w / 100)) * pcsPerBox).toFixed(2));
      }
    }

    const pBox = Number(selectedProduct.retail_price || 0);
    const pPiece = Number((pBox / pcsPerBox).toFixed(2));
    const pSqm = Number((pBox / (sqmPerBox || 1)).toFixed(2));

    const boxQty = currentTileItem?.boxQty !== undefined ? Number(currentTileItem.boxQty) : 1;
    const loosePcs = currentTileItem?.loosePcs !== undefined ? Number(currentTileItem.loosePcs) : 0;
    const lineTotal = Number(((boxQty * pBox) + (loosePcs * pPiece)).toFixed(2));
    const lineSqm = Number(((boxQty * sqmPerBox) + ((loosePcs / pcsPerBox) * sqmPerBox)).toFixed(2));

    setFieldValue(`tileItems.${tIdx}.itemName`, selectedProduct.product_name);
    setFieldValue(`tileItems.${tIdx}.skuCode`, selectedProduct.item_sr_no || `SKU-${selectedProduct.id}`);
    setFieldValue(`tileItems.${tIdx}.piecesPerBox`, pcsPerBox);
    setFieldValue(`tileItems.${tIdx}.sqmPerBox`, sqmPerBox);
    setFieldValue(`tileItems.${tIdx}.pricePerBox`, pBox);
    setFieldValue(`tileItems.${tIdx}.pricePerPiece`, pPiece);
    setFieldValue(`tileItems.${tIdx}.pricePerSqm`, pSqm);
    setFieldValue(`tileItems.${tIdx}.boxQty`, boxQty);
    setFieldValue(`tileItems.${tIdx}.loosePcs`, loosePcs);
    setFieldValue(`tileItems.${tIdx}.totalAmount`, lineTotal);
    setFieldValue(`tileItems.${tIdx}.totalSqm`, lineSqm);
    setFieldValue(`tileItems.${tIdx}.isTileItem`, true);

    const effectiveWarehouse = (currentTileItem && currentTileItem.warehouse) ? currentTileItem.warehouse : chosenWarehouse;
    if (effectiveWarehouse) {
      const availStock = await fetchStockForWarehouse(selectedProduct.product_name, effectiveWarehouse);
      setFieldValue(`tileItems.${tIdx}.availableQty`, availStock);
    }
  };

  const handleTileItemChange = (
    tIdx: number,
    field: 'boxQty' | 'loosePcs' | 'pricePerBox' | 'pricePerSqm' | 'pricePerPiece' | 'totalSqm',
    val: any,
    tileItems: any[],
    setFieldValue: any
  ) => {
    const item = { ...tileItems[tIdx] };
    const pcsPerBox = Math.max(1, Number(item.piecesPerBox) || 4);
    const sqmPerBox = Math.max(0.01, Number(item.sqmPerBox) || 1.44);

    let bQty = Number(item.boxQty || 0);
    let lPcs = Number(item.loosePcs || 0);
    let pBox = Number(item.pricePerBox || 0);
    let pSqm = Number(item.pricePerSqm || 0);
    let pPiece = Number(item.pricePerPiece || 0);
    let lineSqm = Number(item.totalSqm || 0);

    if (field === 'boxQty') {
      bQty = Math.max(0, Number(val) || 0);
      lineSqm = Number(((bQty * sqmPerBox) + ((lPcs / pcsPerBox) * sqmPerBox)).toFixed(2));
    } else if (field === 'loosePcs') {
      let rawLoose = Math.max(0, Number(val) || 0);
      if (pcsPerBox > 1 && rawLoose >= pcsPerBox) {
        const extraBoxes = Math.floor(rawLoose / pcsPerBox);
        const remLoose = rawLoose % pcsPerBox;
        bQty = bQty + extraBoxes;
        lPcs = remLoose;
      } else {
        lPcs = rawLoose;
      }
      lineSqm = Number(((bQty * sqmPerBox) + ((lPcs / pcsPerBox) * sqmPerBox)).toFixed(2));
    } else if (field === 'totalSqm') {
      const enteredSqm = Math.max(0, Number(val) || 0);
      lineSqm = enteredSqm;
      if (sqmPerBox > 0) {
        const totalBoxesFloat = enteredSqm / sqmPerBox;
        bQty = Math.floor(totalBoxesFloat);
        const remFraction = totalBoxesFloat - bQty;
        lPcs = Math.round(remFraction * pcsPerBox);
        if (pcsPerBox > 1 && lPcs >= pcsPerBox) {
          bQty += Math.floor(lPcs / pcsPerBox);
          lPcs = lPcs % pcsPerBox;
        }
      }
    } else if (field === 'pricePerBox') {
      pBox = Math.max(0, Number(val) || 0);
      pPiece = Number((pBox / pcsPerBox).toFixed(2));
      pSqm = Number((pBox / sqmPerBox).toFixed(2));
      lineSqm = Number(((bQty * sqmPerBox) + ((lPcs / pcsPerBox) * sqmPerBox)).toFixed(2));
    } else if (field === 'pricePerSqm') {
      pSqm = Math.max(0, Number(val) || 0);
      pBox = Number((pSqm * sqmPerBox).toFixed(2));
      pPiece = Number((pBox / pcsPerBox).toFixed(2));
      lineSqm = Number(((bQty * sqmPerBox) + ((lPcs / pcsPerBox) * sqmPerBox)).toFixed(2));
    } else if (field === 'pricePerPiece') {
      pPiece = Math.max(0, Number(val) || 0);
      pBox = Number((pPiece * pcsPerBox).toFixed(2));
      pSqm = Number((pBox / sqmPerBox).toFixed(2));
      lineSqm = Number(((bQty * sqmPerBox) + ((lPcs / pcsPerBox) * sqmPerBox)).toFixed(2));
    }

    const lineTotal = Number(((bQty * pBox) + (lPcs * pPiece)).toFixed(2));

    setFieldValue(`tileItems.${tIdx}.boxQty`, bQty);
    setFieldValue(`tileItems.${tIdx}.loosePcs`, lPcs);
    setFieldValue(`tileItems.${tIdx}.pricePerBox`, pBox);
    setFieldValue(`tileItems.${tIdx}.pricePerSqm`, pSqm);
    setFieldValue(`tileItems.${tIdx}.pricePerPiece`, pPiece);
    setFieldValue(`tileItems.${tIdx}.totalAmount`, lineTotal);
    setFieldValue(`tileItems.${tIdx}.totalSqm`, lineSqm);
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
      
      // STRICT VALIDATION: Block if quantity exceeds available stock across all rows
      const consumedInInvoice: Record<string, number> = {};
      for (let i = 0; i < values.items.length; i++) {
        const item = values.items[i];
        if (!item.itemName) continue;
        const wh = String(item.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim().toLowerCase();
        const itemKey = `${String(item.skuCode || item.itemName).trim().toLowerCase()}_${wh}`;

        let maxAllowed = Number(item.availableQty || 0);
        if (editData && editData.items) {
           const oldItems = typeof editData.items === 'string' ? JSON.parse(editData.items || '[]') : (editData.items || []);
           const original = oldItems.find((oi: any) => oi.skuCode === item.skuCode && (oi.warehouse || editData.dispatch_warehouse || 'Main Warehouse') === (item.warehouse || values.dispatchWarehouse || 'Main Warehouse'));
           if (original) {
              maxAllowed += Number(original.qty || 0);
           }
        }

        const priorUsed = consumedInInvoice[itemKey] || 0;
        const availableForRow = Math.max(0, maxAllowed - priorUsed);

        if (Number(item.qty) > availableForRow) {
          toast.error(`Insufficient stock for ${item.itemName} (Row #${i + 1}). Max Available: ${availableForRow.toLocaleString()}, Requested: ${Number(item.qty).toLocaleString()}`);
          setLoading(false);
          return;
        }

        consumedInInvoice[itemKey] = priorUsed + Number(item.qty || 0);
      }

      // 2. Validate Tile Items Stock
      const validTileItems = values.showTileSection
        ? (values.tileItems || []).filter((t: any) => t.itemName && (Number(t.boxQty || 0) > 0 || Number(t.loosePcs || 0) > 0))
        : [];

      for (let i = 0; i < validTileItems.length; i++) {
        const tItem = validTileItems[i];
        const wh = String(tItem.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim().toLowerCase();
        const itemKey = `${String(tItem.skuCode || tItem.itemName).trim().toLowerCase()}_${wh}`;
        const pcsPerBox = Math.max(1, Number(tItem.piecesPerBox) || 4);
        const reqPcs = (Number(tItem.boxQty || 0) * pcsPerBox) + Number(tItem.loosePcs || 0);

        let maxAllowed = Number(tItem.availableQty || 0);
        if (editData && editData.items) {
          const oldItems = typeof editData.items === 'string' ? JSON.parse(editData.items || '[]') : (editData.items || []);
          const original = oldItems.find((oi: any) => oi.skuCode === tItem.skuCode && (oi.warehouse || editData.dispatch_warehouse || 'Main Warehouse') === (tItem.warehouse || values.dispatchWarehouse || 'Main Warehouse'));
          if (original) {
            const origPcs = original.isTileItem
              ? ((Number(original.boxQty || 0) * pcsPerBox) + Number(original.loosePcs || 0))
              : Math.round(Number(original.qty || 0) * pcsPerBox);
            maxAllowed += origPcs;
          }
        }

        const priorUsed = consumedInInvoice[itemKey] || 0;
        const availableForRow = Math.max(0, maxAllowed - priorUsed);

        if (reqPcs > availableForRow) {
          const avBoxes = Math.floor(availableForRow / pcsPerBox);
          const avLoose = availableForRow % pcsPerBox;
          toast.error(`Insufficient tile stock for ${tItem.itemName} (Tile Row #${i + 1}). Max Available: ${avBoxes} Boxes + ${avLoose} Pcs (${availableForRow} Pcs total).`);
          setLoading(false);
          return;
        }

        consumedInInvoice[itemKey] = priorUsed + reqPcs;
      }

      const validReturnItems = (values.returnItems || []).filter(
        (r: any) => r.itemName && Number(r.qty || 0) > 0
      );

      const returnTotalVal = validReturnItems.reduce((acc: number, rItem: any) => {
        return acc + (Number(rItem.qty || 0) * Number(rItem.rp ?? rItem.rate ?? 0));
      }, 0);

      const tileTotalVal = validTileItems.reduce((acc: number, t: any) => acc + Number(t.totalAmount || 0), 0);

      const convertedTileItems = validTileItems.map((t: any) => {
        const pcsPerBox = Math.max(1, Number(t.piecesPerBox) || 4);
        const bQty = Number(t.boxQty || 0);
        const lPcs = Number(t.loosePcs || 0);
        const totalPcs = (bQty * pcsPerBox) + lPcs;
        const qtyBoxDec = Number((totalPcs / pcsPerBox).toFixed(3));
        return {
          skuCode: t.skuCode,
          itemName: t.itemName,
          warehouse: t.warehouse || values.dispatchWarehouse || 'Main Warehouse',
          qty: qtyBoxDec,
          rp: Number(t.pricePerBox || 0),
          discountPer: 0,
          discountAmt: 0,
          gstRate: 0,
          fTaxPer: 0,
          amount: Number(t.totalAmount || 0),
          netTotal: Number(t.totalAmount || 0),
          uom: 'BOX',
          isTileItem: true,
          boxQty: bQty,
          loosePcs: lPcs,
          piecesPerBox: pcsPerBox,
          sqmPerBox: Number(t.sqmPerBox || 1.44),
          totalSqm: Number(t.totalSqm || 0),
          pricePerBox: Number(t.pricePerBox || 0),
          pricePerSqm: Number(t.pricePerSqm || 0),
          pricePerPiece: Number(t.pricePerPiece || 0)
        };
      });

      const validStandardItems = (values.items || []).filter((it: any) => it.itemName && it.itemName.trim() !== '');
      const allMergedItems = [...validStandardItems, ...convertedTileItems];

      const soldItemsSum = validStandardItems.reduce((acc: number, item: any) => {
        return acc + calculateLineTotals(item, values.taxScenario, values.applyFbrTax).netTotal;
      }, 0) + tileTotalVal;

      const grossAfterCharges = soldItemsSum + Number(values.transportCharges || 0) + Number(values.additionalCharges || 0) - Number(values.overallDiscount || 0);
      const calculatedGrandTotal = grossAfterCharges - returnTotalVal;

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
      if (calculatedGrandTotal >= 0 && totalPaidCombined > calculatedGrandTotal + 0.01) {
        toast.error(`Payment amount (Rs. ${totalPaidCombined.toLocaleString(undefined, { minimumFractionDigits: 2 })}) cannot exceed total bill amount (Rs. ${calculatedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })})!`);
        setLoading(false);
        return;
      }
      const runningBalanceTerm = calculatedGrandTotal <= 0 
        ? 'Credit' 
        : (totalPaidCombined >= calculatedGrandTotal ? 'Cash' : 'Credit');

      const itemsToSave = (allMergedItems.length > 0 ? allMergedItems : values.items).map((it: any, idx: number) => {
        const cleanItem = {
          ...it,
          gstRate: values.applyFbrTax ? Number(it.gstRate || 0) : 0,
          fTaxPer: values.applyFbrTax ? Number(it.fTaxPer || 0) : 0
        };
        if (idx === 0) {
          return { 
            ...cleanItem, 
            _overallDiscount: Number(values.overallDiscount || 0),
            _returnItems: validReturnItems,
            _returnAmount: returnTotalVal,
            _tileItems: validTileItems,
            _tileAmount: tileTotalVal
          };
        }
        return cleanItem;
      });

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
        total_amount: String(grossAfterCharges),
        receipt_status: (calculatedGrandTotal <= 0 && returnTotalVal > 0) ? 'Credit Adjusted' : (totalPaidCombined >= calculatedGrandTotal ? 'Paid' : 'On Credit'),
        sale_status: 'Confirm',
        shipping_address: values.shippingAddress,
        gate_pass_no: Object.entries(values.gatePasses || {}).map(([k, v]) => `${k}: ${v}`).join(' | '),
        items: itemsToSave,
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

        const isPendingStatus = (st: string) => /pending/i.test(st || '');
        const activeDCs = (dcs || []).filter(dc => !isPendingStatus(dc.status));
        const pendingDCs = (dcs || []).filter(dc => isPendingStatus(dc.status));

        // Track covered quantities by sku_warehouse from already approved DCs
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

        // 2. Validate against approved DCs
        for (const item of allMergedItems) {
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
            const found = allMergedItems.find((i:any) => `${i.skuCode}_${(i.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim()}` === key);
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

        logActivity({
          action: 'UPDATE',
          tableName: 'sales_invoices',
          details: {
            id: editData.id,
            invoice_number: editData.invoice_no || values.invoiceNo,
            customer_name: customerFinalName,
            total_amount: calculatedGrandTotal,
            item_count: (values.items || []).length,
            payment_term: runningBalanceTerm,
            warehouse: values.dispatchWarehouse,
            event: `Updated sales invoice ${editData.invoice_no || values.invoiceNo} for ${customerFinalName}`
          }
        });

        // 4. Update products.current_stock (Restore old, Deduct new)
        const oldItems = typeof editData.items === 'string' ? JSON.parse(editData.items || '[]') : (editData.items || []);
        for (const oldItem of oldItems) {
          const { data: prod } = await supabase.from('products').select('id, current_stock').ilike('product_name', oldItem.itemName).maybeSingle();
          if (prod) await supabase.from('products').update({ current_stock: Number(prod.current_stock) + Number(oldItem.qty || 0) }).eq('id', prod.id);
        }
        for (const newItem of values.items) {
          const { data: prod } = await supabase.from('products').select('id, current_stock').ilike('product_name', newItem.itemName).maybeSingle();
          if (prod) await supabase.from('products').update({ current_stock: Number(prod.current_stock) - Number(newItem.qty || 0) }).eq('id', prod.id);
        }

        // 5. Sync DCs (Recalculate remaining uncovered quantities, delete old pending, create new only if needed)
        const remainingItemsByWarehouse: Record<string, any[]> = {};
        for (const item of values.items) {
          const wh = (item.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim();
          const key = `${item.skuCode}_${wh}`;
          const covered = coveredQtys[key] || 0;
          const remaining = Number(item.qty) - covered;

          if (remaining > 0) {
            if (!remainingItemsByWarehouse[wh]) remainingItemsByWarehouse[wh] = [];
            
            // Prorate discount if any
            const origQty = Number(item.qty) || 1;
            const proratedDisAmt = (Number(item.discountAmt) || 0) * (remaining / origQty);

            remainingItemsByWarehouse[wh].push({
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

        // Delete old pending DCs so they are replaced cleanly with the adjusted lines (or removed entirely if items deleted)
        if (pendingDCs.length > 0) {
          const pendingIds = pendingDCs.map(d => d.id);
          const { error: delErr } = await supabase.from('delivery_challans').delete().in('id', pendingIds);
          if (delErr) console.error('Error deleting pending DCs:', delErr);
        }

        // Check current active DCs to compute appropriate challan code
        const { data: currentActiveDcs } = await supabase
          .from('delivery_challans')
          .select('id, challan_no, dispatch_warehouse')
          .eq('invoice_no', formattedInvCode)
          .order('id', { ascending: true });

        for (const [whName, whItems] of Object.entries(remainingItemsByWarehouse)) {
          if (whItems.length === 0) continue;
          const whQty = whItems.reduce((acc, i) => acc + Number(i.qty || 0), 0);
          if (whQty <= 0) continue;

          const whBaseAmt = whItems.reduce((acc, i) => acc + (Number(i.rate || 0) * Number(i.qty || 0)), 0);
          const whDiscAmt = whItems.reduce((acc, i) => acc + Number(i.disAmt || 0), 0);
          const whNetAmt = whBaseAmt - whDiscAmt;

          let nextChallanNo = undefined;
          const activeWhDcs = (currentActiveDcs || []).filter(dc => dc.dispatch_warehouse === whName);
          if (activeWhDcs.length > 0) {
            const baseDc = activeWhDcs[0];
            const baseCode = (baseDc.challan_no || `DC-${String(baseDc.id).padStart(4, '0')}`).replace(/-[A-Z]+$/, '');
            const existingSubCount = (currentActiveDcs || []).filter(c => (c.challan_no || `DC-${String(c.id).padStart(4, '0')}`).startsWith(baseCode)).length;
            let nextLetter = '';
            if (existingSubCount < 26) {
              nextLetter = String.fromCharCode(65 + existingSubCount);
            } else {
              nextLetter = String.fromCharCode(65 + (existingSubCount % 26)).repeat(Math.floor(existingSubCount / 26) + 1);
            }
            nextChallanNo = `${baseCode}-${nextLetter}`;
          }

          if (!nextChallanNo) {
            const prevPending = pendingDCs.find(d => d.dispatch_warehouse === whName);
            if (prevPending && prevPending.challan_no && !activeWhDcs.length) {
              nextChallanNo = prevPending.challan_no.replace(/-[A-Z]+$/, '');
            } else {
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
            status: 'Pending',
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

        logActivity({
          action: 'INSERT',
          tableName: 'sales_invoices',
          details: {
            id: insertedInvoice?.id,
            invoice_number: values.invoiceNo,
            customer_name: customerFinalName,
            total_amount: calculatedGrandTotal,
            item_count: (values.items || []).length,
            payment_term: runningBalanceTerm,
            warehouse: values.dispatchWarehouse,
            event: `Created sales invoice ${values.invoiceNo} for ${customerFinalName}`
          }
        });

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
              status: 'Pending',
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

      // ── AUTO-SYNC SALES RETURN RECORD (FOR IN-INVOICE RETURN / EXCHANGE) ──
      try {
        if (validReturnItems.length > 0) {
          const returnPayload = {
            return_no: values.invoiceNo,
            customer_name: customerFinalName,
            return_date: values.saleDate || new Date().toISOString().split('T')[0],
            warehouse_name: values.dispatchWarehouse || 'Main Warehouse',
            source_warehouse: values.dispatchWarehouse || 'Main Warehouse',
            invoice_no: values.invoiceNo,
            original_invoice_no: values.invoiceNo,
            settlement_mode: 'On Credit',
            payment_term: 'On Credit',
            total_amount: returnTotalVal,
            payout_amount_paid: 0,
            status: 'Credit Applied',
            inward_status: 'Pending Inward',
            remarks: `In-invoice return/exchange against Invoice #${values.invoiceNo}`,
            items: validReturnItems.map((i: any) => ({
              sku: i.skuCode || '',
              itemName: i.itemName,
              warehouse: i.warehouse || values.dispatchWarehouse || 'Main Warehouse',
              qty: Number(i.qty),
              rate: Number(i.rp),
              uom: i.uom || 'Nos',
              total: Number(i.qty) * Number(i.rp)
            }))
          };

          const { data: existingReturn } = await supabase
            .from('sales_returns')
            .select('id')
            .eq('return_no', values.invoiceNo)
            .maybeSingle();

          if (existingReturn) {
            await supabase.from('sales_returns').update(returnPayload).eq('id', existingReturn.id);
          } else {
            await supabase.from('sales_returns').insert([returnPayload]);
          }
        } else if (editData) {
          await supabase.from('sales_returns').delete().eq('return_no', editData.invoice_no || values.invoiceNo);
        }
      } catch (retSyncErr: any) {
        console.error('Sales Return sync warning:', retSyncErr);
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

    // Calculate if sale is on credit
    const returnVal = (pendingFormValues.returnItems || []).reduce(
      (acc: number, r: any) => acc + (Number(r.qty || 0) * Number(r.rp ?? r.rate ?? 0)), 0
    );
    const grossTotal = (pendingFormValues.items || []).reduce((acc: number, item: any) => {
      return acc + calculateLineTotals(item, pendingFormValues.taxScenario, pendingFormValues.applyFbrTax).netTotal;
    }, 0) + Number(pendingFormValues.transportCharges || 0) + Number(pendingFormValues.additionalCharges || 0) - Number(pendingFormValues.overallDiscount || 0);

    const netPayable = grossTotal - returnVal;
    const currentSubtotal = Math.max(0, netPayable);

    const totalPaidNow = pendingFormValues.settlementMode === 'Cash'
      ? Number(pendingFormValues.cashAmountPaid || 0)
      : (pendingFormValues.settlementMode === 'Bank' ? Number(pendingFormValues.bankAmountPaid || 0) : (Number(pendingFormValues.cashAmountPaid || 0) + Number(pendingFormValues.bankAmountPaid || 0)));
    const remainingBal = Math.max(0, currentSubtotal - totalPaidNow);
    const isOnCredit = remainingBal > 0.01 || netPayable < -0.01;

    let finalCustomerName = '';

    if (customerModalType === 'recorded') {
      if (!selectedRecordedCustomer) {
        toast.error('Please select an existing customer account from the list.');
        return;
      }
      finalCustomerName = selectedRecordedCustomer;
    } else {
      const cleanName = walkinName.trim();
      const cleanPhone = walkinPhone.trim();

      if (isOnCredit && (!cleanName || cleanName.toLowerCase() === 'walk-in customer')) {
        toast.error(`Customer Name is required for credit sales (Outstanding balance: Rs. ${remainingBal.toLocaleString()}) to maintain customer directory record.`);
        return;
      }

      finalCustomerName = cleanName || 'Walk-in Customer';

      // If user specified a custom walk-in customer name
      if ((recordWalkinCustomer || isOnCredit) && cleanName && cleanName.toLowerCase() !== 'walk-in customer') {
        try {
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .ilike('customerName', cleanName)
            .maybeSingle();

          if (!existing) {
            const { error: custErr } = await supabase.from('customers').insert([{
              customerName: cleanName,
              customer_code: null,
              customercode: null,
              primaryphone: cleanPhone || '-',
              phone: cleanPhone || '-',
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
      // If user did not provide a custom name, auto-create / link to unified "Walk-in Customer" profile
      else if (!cleanName || cleanName.toLowerCase() === 'walk-in customer') {
        try {
          const { data: existingWalkin } = await supabase
            .from('customers')
            .select('id')
            .ilike('customerName', 'Walk-in Customer')
            .maybeSingle();

          if (!existingWalkin) {
            const { error: walkinErr } = await supabase.from('customers').insert([{
              customerName: 'Walk-in Customer',
              customer_code: 'WALK-IN',
              customercode: 'WALK-IN',
              primaryphone: '-',
              phone: '-',
              company: 'Counter Walk-in / Direct Retail'
            }]);

            if (walkinErr) {
              console.error('Walk-in Customer profile auto-creation warning:', walkinErr);
            }
          }
        } catch (e: any) {
          console.error('Walk-in customer lookup error:', e);
        }
      }
    }

    await executeInvoicePersistence(pendingFormValues, finalCustomerName);
  };

  if (initialLoading) return <div className="flex h-48 items-center justify-center"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-7xl text-black dark:text-bodydark text-xs font-sans relative">
      {/* CUSTOMER CHECKOUT MODAL */}
      {showCustomerModal && (() => {
        const modalReturnVal = (pendingFormValues?.returnItems || []).reduce((acc: number, r: any) => acc + (Number(r.qty || 0) * Number(r.rp ?? r.rate ?? 0)), 0);
        const modalTileVal = (pendingFormValues?.showTileSection ? (pendingFormValues?.tileItems || []) : []).reduce((acc: number, t: any) => acc + Number(t.totalAmount || 0), 0);
        const modalGross = pendingFormValues ? (
          (pendingFormValues.items || []).reduce((acc: number, item: any) => {
            return acc + calculateLineTotals(item, pendingFormValues.taxScenario, pendingFormValues.applyFbrTax).netTotal;
          }, 0) + modalTileVal + Number(pendingFormValues.transportCharges || 0) + Number(pendingFormValues.additionalCharges || 0) - Number(pendingFormValues.overallDiscount || 0)
        ) : 0;
        const modalNetPayable = modalGross - modalReturnVal;
        const modalSubtotal = Math.max(0, modalNetPayable);

        const modalPaid = pendingFormValues ? (
          pendingFormValues.settlementMode === 'Cash'
            ? Number(pendingFormValues.cashAmountPaid || 0)
            : (pendingFormValues.settlementMode === 'Bank' ? Number(pendingFormValues.bankAmountPaid || 0) : (Number(pendingFormValues.cashAmountPaid || 0) + Number(pendingFormValues.bankAmountPaid || 0)))
        ) : 0;

        const modalRemainingBal = Math.max(0, modalSubtotal - modalPaid);
        const isModalOnCredit = modalRemainingBal > 0.01 || modalNetPayable < -0.01;

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-boxdark w-full max-w-lg rounded-2xl shadow-2xl p-6 border border-stroke dark:border-strokedark animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
                  <FiUserCheck className="text-emerald-500" /> Checkout Customer
                </h2>
                <button onClick={() => setShowCustomerModal(false)}>
                  <FiX className="text-xl text-gray-400 hover:text-black dark:hover:text-white" />
                </button>
              </div>

              {modalNetPayable < -0.01 ? (
                <div className="mb-4 p-3 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>
                    <strong>Customer Account Credit (Excess Return: Rs. {Math.abs(modalNetPayable).toLocaleString(undefined, { minimumFractionDigits: 2 })}):</strong> Balance will be credited to customer receivable account.
                  </span>
                </div>
              ) : isModalOnCredit && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>
                    <strong>Credit Sale (Remaining: Rs. {modalRemainingBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}):</strong> Customer account will be saved to directory.
                  </span>
                </div>
              )}

              <div className="flex gap-2 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button 
                  type="button"
                  onClick={() => setCustomerModalType('walkin')} 
                  className={`flex-1 py-2 text-xs font-bold rounded-md transition ${customerModalType === 'walkin' ? 'bg-white dark:bg-boxdark shadow-sm text-primary dark:text-teal-400' : 'text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
                >
                  Walk-in Sale
                </button>
                <button 
                  type="button"
                  onClick={() => setCustomerModalType('recorded')} 
                  className={`flex-1 py-2 text-xs font-bold rounded-md transition ${customerModalType === 'recorded' ? 'bg-white dark:bg-boxdark shadow-sm text-primary dark:text-teal-400' : 'text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
                >
                  Recorded Client
                </button>
              </div>

              {customerModalType === 'walkin' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                      Customer Name {isModalOnCredit ? <span className="text-red-500 font-extrabold">*</span> : '(Optional)'}
                    </label>
                    <input 
                      type="text" 
                      placeholder={isModalOnCredit ? "Customer Name *" : "Customer Name (Optional)"} 
                      value={walkinName} 
                      onChange={(e) => setWalkinName(e.target.value)} 
                      className={`w-full p-3 border rounded-lg bg-white dark:bg-boxdark dark:border-strokedark outline-none text-xs font-bold text-black dark:text-white ${
                        isModalOnCredit && !walkinName.trim() ? 'border-amber-500 focus:border-amber-600 bg-amber-50/5' : 'focus:border-primary'
                      }`} 
                    />
                    {isModalOnCredit && !walkinName.trim() && (
                      <p className="text-amber-600 dark:text-amber-400 text-[10px] font-semibold mt-1">
                        * Required for credit sale
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Phone Number (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="Phone Number (Optional)" 
                      value={walkinPhone} 
                      onChange={(e) => setWalkinPhone(e.target.value)} 
                      className="w-full p-3 border rounded-lg bg-white dark:bg-boxdark dark:border-strokedark outline-none text-xs text-black dark:text-white focus:border-primary" 
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-400">
                    <input 
                      type="checkbox" 
                      checked={recordWalkinCustomer || isModalOnCredit} 
                      disabled={isModalOnCredit}
                      onChange={(e) => setRecordWalkinCustomer(e.target.checked)} 
                    />
                    <span>Save this customer to directory {isModalOnCredit && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">(Auto-enabled for credit)</span>}</span>
                  </label>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">Select Customer Profile</label>
                  <select 
                    value={selectedRecordedCustomer} 
                    onChange={(e) => setSelectedRecordedCustomer(e.target.value)} 
                    className="w-full p-3 border rounded-lg bg-white dark:bg-boxdark dark:border-strokedark outline-none text-xs font-bold text-black dark:text-white focus:border-primary"
                  >
                    <option value="" className="bg-white dark:bg-boxdark text-black dark:text-white">-- Search Customer --</option>
                    {customersList.map(c => {
                      const code = c.customer_code || c.customerCode;
                      return (
                        <option key={c.id} value={c.customerName} className="bg-white dark:bg-boxdark text-black dark:text-white">
                          {code ? `[${code}] ${c.customerName}` : c.customerName}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="mt-8 flex gap-3">
                <button type="button" onClick={() => setShowCustomerModal(false)} className="flex-1 py-2.5 rounded-lg border border-stroke dark:border-strokedark font-bold text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                <button type="button" onClick={handleFinalCustomerModalSubmit} disabled={loading} className="flex-1 py-2.5 rounded-lg bg-primary text-white font-bold text-xs shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><FiCheck /> {loading ? 'Processing...' : 'Finalize & Log'}</button>
              </div>
            </div>
          </div>
        );
      })()}

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
            setIsOpeningCustomerModal(false);
            setShowCustomerModal(true);
          }}
        >
          {({ values, handleChange, setFieldValue, errors, touched, submitCount, submitForm, isSubmitting, isValidating, validateForm }) => {
            const hasAttempted = submitCount > 0;
            const isModalLoading = isOpeningCustomerModal || isSubmitting || isValidating;
            const returnTotalValue = (values.returnItems || []).reduce((acc: number, rItem: any) => {
              return acc + (Number(rItem.qty || 0) * Number(rItem.rp ?? rItem.rate ?? 0));
            }, 0);

            const tileTotalValue = (values.showTileSection ? (values.tileItems || []) : []).reduce((acc: number, tItem: any) => {
              return acc + Number(tItem.totalAmount || 0);
            }, 0);

            const grossSubtotalValue = values.items.reduce((acc: number, item: any) => {
              return acc + calculateLineTotals(item, values.taxScenario, values.applyFbrTax).netTotal;
            }, 0) + tileTotalValue + Number(values.transportCharges || 0) + Number(values.additionalCharges || 0);

            const netPayableBeforeFloor = grossSubtotalValue - Number(values.overallDiscount || 0) - returnTotalValue;
            const currentSubtotalValue = Math.max(
              0,
              netPayableBeforeFloor
            );

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
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-gray-50 dark:bg-meta-4/5 p-4 rounded-sm border border-stroke dark:border-strokedark">
                  <div className="md:col-span-5">
                    <label className="block font-bold text-gray-500 mb-1">Invoice Number #: *</label>
                    <div className={`flex items-center rounded border overflow-hidden bg-white dark:bg-boxdark ${hasAttempted && errors.invoiceNo ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus-within:border-primary'}`}>
                      <span className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 font-mono font-black text-xs sm:text-sm border-r border-stroke dark:border-strokedark select-none whitespace-nowrap shrink-0 flex items-center justify-center">
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
                        className="w-full min-w-0 p-2 text-sm bg-transparent font-bold outline-none text-black dark:text-white placeholder:font-normal placeholder:text-xs placeholder:text-gray-400 font-mono" 
                      />
                    </div>
                    {hasAttempted && errors.invoiceNo && <p className="text-red-500 text-xs font-bold mt-1">{String(errors.invoiceNo)}</p>}
                  </div>

                  <div className="md:col-span-3">
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

                  <div className="md:col-span-4">
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

                    {/* Overall Bill Discount Toggle */}
                    <div
                      onClick={() => {
                        const isChecked = !values.showOverallDiscount;
                        setFieldValue('showOverallDiscount', isChecked);
                        if (!isChecked) setFieldValue('overallDiscount', 0);
                      }}
                      className={`cursor-pointer px-3 py-1.5 text-xs font-bold rounded-full transition select-none flex items-center justify-center border ${
                        values.showOverallDiscount
                          ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800'
                          : 'bg-white text-slate-500 border-stroke dark:bg-boxdark dark:text-slate-400 dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4'
                      }`}
                    >
                      Overall Discount
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

                    {/* Return / Exchange Toggle Pill */}
                    <div
                      onClick={() => {
                        const isChecked = !values.showReturnSection;
                        setFieldValue('showReturnSection', isChecked);
                        if (!isChecked) {
                          setFieldValue('returnItems', []);
                        } else if ((values.returnItems || []).length === 0) {
                          setFieldValue('returnItems', [{
                            itemName: '',
                            skuCode: '',
                            warehouse: values.dispatchWarehouse || '',
                            qty: 1,
                            rp: 0,
                            amount: 0
                          }]);
                        }
                      }}
                      className={`cursor-pointer px-3 py-1.5 text-xs font-bold rounded-full transition select-none flex items-center justify-center border ${
                        values.showReturnSection
                          ? 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/40 dark:text-rose-400 dark:border-rose-800'
                          : 'bg-white text-slate-500 border-stroke dark:bg-boxdark dark:text-slate-400 dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4'
                      }`}
                    >
                      Return
                    </div>

                    {/* Tile Products Toggle Pill */}
                    <div
                      onClick={() => {
                        const isChecked = !values.showTileSection;
                        setFieldValue('showTileSection', isChecked);
                        if (!isChecked) {
                          setFieldValue('tileItems', []);
                        } else if ((values.tileItems || []).length === 0) {
                          setFieldValue('tileItems', [{
                            id: Date.now(),
                            itemName: '',
                            skuCode: '',
                            warehouse: values.dispatchWarehouse || '',
                            availableQty: 0,
                            boxQty: 1,
                            loosePcs: 0,
                            piecesPerBox: 4,
                            sqmPerBox: 1.44,
                            pricePerBox: 0,
                            pricePerSqm: 0,
                            pricePerPiece: 0,
                            totalAmount: 0,
                            totalSqm: 1.44,
                            isTileItem: true
                          }]);
                        }
                      }}
                      className={`cursor-pointer px-3 py-1.5 text-xs font-bold rounded-full transition select-none flex items-center justify-center border ${
                        values.showTileSection
                          ? 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800'
                          : 'bg-white text-slate-500 border-stroke dark:bg-boxdark dark:text-slate-400 dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4'
                      }`}
                    >
                      Tile
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

                                // Deduct quantities already allocated to prior rows in this invoice
                                const priorConsumed = values.items.slice(0, idx).reduce((sum: number, prev: any) => {
                                  const prevName = String(prev.itemName || '').trim().toLowerCase();
                                  const currName = String(item.itemName || '').trim().toLowerCase();
                                  const prevSku = String(prev.skuCode || '').trim().toLowerCase();
                                  const currSku = String(item.skuCode || '').trim().toLowerCase();
                                  const prevWh = String(prev.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim().toLowerCase();
                                  const currWh = String(item.warehouse || values.dispatchWarehouse || 'Main Warehouse').trim().toLowerCase();
                                  
                                  const isMatch = (currName && prevName === currName) || (currSku && prevSku === currSku);
                                  if (isMatch && prevWh === currWh) {
                                    return sum + (Number(prev.qty) || 0);
                                  }
                                  return sum;
                                }, 0);

                                const totalAvailStock = Math.max(0, effectiveAvailStock - priorConsumed);
                                const totalPieces = isTile && pcsPerBox > 1 ? Math.round(totalAvailStock * pcsPerBox) : 0;
                                const availBoxes = isTile && pcsPerBox > 1 ? Math.floor(totalPieces / pcsPerBox) : Math.floor(totalAvailStock);
                                const availLoosePcs = isTile && pcsPerBox > 1 ? (totalPieces % pcsPerBox) : 0;

                                return (
                                  <tr key={idx} className={`border-b border-stroke dark:border-strokedark font-mono font-semibold text-black dark:text-white ${isCurrentActive || isCurrentProdNameActive || activeWhIndex === idx ? 'relative z-30' : 'relative z-10'} ${hasItemError ? 'bg-red-50/5' : ''}`}>
                                    <td className="p-2 text-center font-sans text-gray-400">{idx + 1}</td>

                                    {/* Legacy SKU cell kept hidden — code now shows under the product name */}
                                    <td className="hidden sku-container">
                                      {(() => {
                                        const nonTileList = productsList.filter(p => !isTileProduct(p));
                                        const filteredProds = nonTileList.filter(p => {
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
                                                      <div className="text-right font-mono shrink-0 pl-2 flex flex-col items-end justify-center">
                                                        <span className="text-xs font-bold text-slate-800 dark:text-white">Rs. {Number(p.retail_price || 0).toLocaleString()}</span>
                                                        <span className={`text-[10px] font-bold ${getProductOverallStock(p) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                          {getProductOverallStock(p).toLocaleString()} {p.uom || 'Nos'}
                                                        </span>
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
                                        const exactSelected = productsList.some(p => normText(p.product_name) === normText(item.itemName));
                                        const query = exactSelected ? '' : normText(item.itemName);
                                        const nonTileList = productsList.filter(p => !isTileProduct(p));
                                        let filteredByName = query
                                          ? nonTileList.filter(p =>
                                              normText(p.product_name).includes(query) ||
                                              normText(p.item_sr_no).includes(query) ||
                                              normText(p.category).includes(query)
                                            )
                                          : nonTileList.slice();
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
                                              className="w-full bg-white dark:bg-boxdark font-bold border border-stroke dark:border-strokedark rounded p-2 pr-7 outline-none text-xs text-black dark:text-white focus:border-primary shadow-sm"
                                            />

                                            {Boolean(item.itemName || item.skuCode) && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleProductSelectionWithWH(null, idx, values.dispatchWarehouse, setFieldValue, item);
                                                  setActiveProdNameIndex(null);
                                                }}
                                                className="absolute right-2 top-[17px] -translate-y-1/2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-meta-4 transition-colors z-10"
                                                title="Deselect Product"
                                              >
                                                <FiX className="w-3.5 h-3.5" />
                                              </button>
                                            )}

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
                                                      {(() => {
                                                        const totStock = getProductOverallStock(p);
                                                        return (
                                                          <div className="text-right font-mono shrink-0 pl-2 flex flex-col items-end justify-center">
                                                            <span className="text-xs font-bold text-slate-800 dark:text-white">
                                                              Rs. {Number(p.retail_price || 0).toLocaleString()}
                                                            </span>
                                                            <span className={`text-[11px] font-bold ${totStock > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                              {totStock.toLocaleString()} {p.uom || 'Nos'}
                                                            </span>
                                                          </div>
                                                        );
                                                      })()}
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
                                        const currentWh = item.warehouse !== undefined ? item.warehouse : (values.dispatchWarehouse || '');
                                        const exactWhSelected = warehousesList.some(w => String(w || '').toLowerCase().trim() === String(currentWh || '').toLowerCase().trim());
                                        const whQuery = exactWhSelected ? '' : currentWh.toLowerCase().trim();
                                        let filteredWhs = whQuery
                                          ? warehousesList.filter(w => w.toLowerCase().includes(whQuery))
                                          : warehousesList;
                                        if (filteredWhs.length === 0 && warehousesList.length > 0) {
                                          filteredWhs = warehousesList;
                                        }

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
                                              onClick={() => {
                                                setActiveWhIndex(idx);
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
                                              className="w-full bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded p-1.5 pr-6 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-primary shadow-sm"
                                            />

                                            {Boolean(currentWh) && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setFieldValue(`items.${idx}.warehouse`, '');
                                                  if (item.itemName) {
                                                    fetchStockForWarehouse(item.itemName, values.dispatchWarehouse || '').then(stock => setFieldValue(`items.${idx}.availableQty`, stock));
                                                  }
                                                  setActiveWhIndex(null);
                                                }}
                                                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-meta-4 transition-colors z-10"
                                                title="Deselect Warehouse"
                                              >
                                                <FiX className="w-3 h-3" />
                                              </button>
                                            )}

                                            {/* WAREHOUSE DROPDOWN */}
                                            {isWhActive && filteredWhs.length > 0 && (
                                              <div className="absolute left-0 min-w-[230px] max-w-[300px] top-full mt-1 z-[99999] max-h-[200px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300">
                                                {filteredWhs.map((wh, wIdx) => {
                                                  const isHighlighted = wIdx === highlightedWhIndex;
                                                  const whStock = item.itemName ? getItemWarehouseStock(item.itemName, wh) : null;
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
                                                      className={`p-2.5 cursor-pointer transition text-xs font-bold flex items-center justify-between gap-2 ${isHighlighted ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-l-4 border-emerald-500' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                                                    >
                                                      <span className="truncate">{wh}</span>
                                                      {item.itemName && (
                                                        <span className={`font-mono text-[11px] font-bold shrink-0 ${whStock !== null && whStock > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                          {(whStock ?? 0).toLocaleString()} {item.uom || selectedProd?.uom || 'Nos'}
                                                        </span>
                                                      )}
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
                              onClick={() => push({ itemName: '', skuCode: '', qty: 1, rp: 0, discountPer: 0, discountAmt: 0, gstRate: 0, fTaxPer: 0, amount: 0, availableQty: 0 })}
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

                {/* --- TILE INVENTORY PRODUCTS DYNAMIC FIELDARRAY --- */}
                {values.showTileSection && (
                  <div className={`border border-teal-400 dark:border-teal-800/80 bg-teal-50/20 dark:bg-teal-950/10 rounded-sm mt-6 relative ${activeTileProdIndex !== null || activeTileWhIndex !== null ? 'z-30' : 'z-20'} overflow-visible pb-4`}>
                    <FieldArray name="tileItems">
                      {({ push, remove }) => {
                        const tileTotalSum = (values.tileItems || []).reduce((acc: number, t: any) => acc + (Number(t.totalAmount || 0)), 0);
                        const totalBoxesCount = (values.tileItems || []).reduce((acc: number, t: any) => acc + (Number(t.boxQty || 0)), 0);
                        const totalLoosePcsCount = (values.tileItems || []).reduce((acc: number, t: any) => acc + (Number(t.loosePcs || 0)), 0);
                        const totalSqmCount = (values.tileItems || []).reduce((acc: number, t: any) => acc + (Number(t.totalSqm || 0)), 0);

                        return (
                          <div className="w-full min-w-[980px]">
                            <div className="p-3 bg-teal-100/70 dark:bg-teal-900/40 border-b border-teal-300 dark:border-teal-800 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-teal-600 text-white font-mono text-[10px] font-black tracking-wider uppercase">
                                  Tiles
                                </span>
                                <span className="font-bold text-xs text-teal-950 dark:text-teal-200">
                                  Tile Items (Boxes, Loose Pieces & Sq. Mtr Sales)
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-xs font-mono font-bold text-teal-800 dark:text-teal-300">
                                <span>Boxes: <strong className="font-black text-black dark:text-white">{totalBoxesCount}</strong></span>
                                <span>Pcs: <strong className="font-black text-black dark:text-white">{totalLoosePcsCount}</strong></span>
                                <span>Sq.M Given: <strong className="font-black text-teal-950 dark:text-teal-100 bg-teal-200/80 dark:bg-teal-800/80 px-2 py-0.5 rounded shadow-sm">{totalSqmCount.toFixed(2)} m²</strong></span>
                                <span className="text-teal-950 dark:text-teal-100 font-black text-sm">
                                  Total Tiles: Rs. {tileTotalSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                            <table className="w-full table-auto border-collapse text-left">
                              <thead className="bg-teal-50/80 dark:bg-teal-950/60 text-[10px] font-black uppercase text-teal-950 dark:text-teal-300 border-b border-teal-200 dark:border-teal-800">
                                <tr>
                                  <th className="p-2 w-8 text-center">S#</th>
                                  <th className="p-2 min-w-[240px]">Product (NAME / CODE)</th>
                                  <th className="p-2 w-44">Warehouse ZONE SOURCE</th>
                                  <th className="p-2 w-32 text-center text-teal-800 dark:text-teal-400">Stock in Warehouse</th>
                                  <th className="p-2 w-24 text-center">QTY (Box)</th>
                                  <th className="p-2 w-24 text-center">Pcs (Loose)</th>
                                  <th className="p-2 w-28 text-right">Sale Price (Per Box)</th>
                                  <th className="p-2 w-28 text-right">Sale Price (Per Sq. Mtr)</th>
                                  <th className="p-2 w-28 text-right">Sale Price (Per Piece)</th>
                                  <th className="p-2 w-32 text-right pr-3 font-mono">Net Total</th>
                                  <th className="p-2 w-8 text-center"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {(values.tileItems || []).map((tItem: any, tIdx: number) => {
                                  const isCurrentProdActive = activeTileProdIndex === tIdx;
                                  const isCurrentWhActive = activeTileWhIndex === tIdx;
                                  const pcsPerBox = Math.max(1, Number(tItem.piecesPerBox) || 4);
                                  const sqmPerBox = Math.max(0.01, Number(tItem.sqmPerBox) || 1.44);
                                  const currentStockVal = Number(tItem.availableQty || 0);
                                  const availBoxes = Math.floor(currentStockVal / pcsPerBox);
                                  const availLoose = currentStockVal % pcsPerBox;
                                  const itemLineSqm = Number(tItem.totalSqm) > 0
                                    ? Number(tItem.totalSqm)
                                    : Number(((Number(tItem.boxQty || 0) * sqmPerBox) + ((Number(tItem.loosePcs || 0) / pcsPerBox) * sqmPerBox)).toFixed(2));

                                  const tileProducts = productsList.filter(p => isTileProduct(p));
                                  const exactTileSelected = tileProducts.some((p: any) => String(p.product_name || '').toLowerCase().trim() === String(tItem.itemName || '').toLowerCase().trim());
                                  const tileSearch = exactTileSelected ? '' : (tItem.itemName || '').toLowerCase().trim();
                                  const filteredTileProds = tileProducts.filter((p: any) => {
                                    if (!tileSearch) return true;
                                    return (
                                      (p.product_name && p.product_name.toLowerCase().includes(tileSearch)) ||
                                      (p.item_sr_no && p.item_sr_no.toLowerCase().includes(tileSearch)) ||
                                      (`sku-${p.id}`.includes(tileSearch))
                                    );
                                  });

                                  const currentWh = tItem.warehouse !== undefined ? tItem.warehouse : (values.dispatchWarehouse || '');
                                  const exactTileWhSelected = warehousesList.some(w => String(w || '').toLowerCase().trim() === String(currentWh || '').toLowerCase().trim());
                                  const tileWhQuery = exactTileWhSelected ? '' : currentWh.toLowerCase().trim();
                                  let filteredWhs = tileWhQuery
                                    ? warehousesList.filter(w => w.toLowerCase().includes(tileWhQuery))
                                    : warehousesList;
                                  if (filteredWhs.length === 0 && warehousesList.length > 0) {
                                    filteredWhs = warehousesList;
                                  }

                                  return (
                                    <tr key={tItem.id || tIdx} className={`border-b border-teal-100 dark:border-teal-900/40 hover:bg-teal-50/30 ${isCurrentProdActive || isCurrentWhActive ? 'relative z-30' : 'relative z-10'}`}>
                                      <td className="p-2 text-center text-gray-500 font-mono text-xs">{tIdx + 1}</td>

                                      {/* TILE PRODUCT SELECTOR */}
                                      <td className="p-2 relative tile-prod-name-container">
                                        <div className="relative">
                                          <input
                                            type="text"
                                            autoComplete="off"
                                            value={tItem.itemName || ''}
                                            onFocus={() => {
                                              setActiveTileProdIndex(tIdx);
                                              setHighlightedTileProdIndex(0);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                if (filteredTileProds.length === 0) return;
                                                setHighlightedTileProdIndex(prev => prev < filteredTileProds.length - 1 ? prev + 1 : 0);
                                              } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                if (filteredTileProds.length === 0) return;
                                                setHighlightedTileProdIndex(prev => prev > 0 ? prev - 1 : filteredTileProds.length - 1);
                                              } else if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (filteredTileProds.length > 0) {
                                                  const sel = filteredTileProds[highlightedTileProdIndex] || filteredTileProds[0];
                                                  handleTileProductSelection(sel, tIdx, values.dispatchWarehouse, setFieldValue, tItem);
                                                  setActiveTileProdIndex(null);
                                                }
                                              } else if (e.key === 'Tab' || e.key === 'Escape') {
                                                setActiveTileProdIndex(null);
                                              }
                                            }}
                                            onChange={(e) => {
                                              const typed = e.target.value;
                                              setFieldValue(`tileItems.${tIdx}.itemName`, typed);
                                              setActiveTileProdIndex(tIdx);
                                              setHighlightedTileProdIndex(0);

                                              const match = tileProducts.find(p => p.product_name && p.product_name.toLowerCase() === typed.trim().toLowerCase());
                                              if (match) {
                                                handleTileProductSelection(match, tIdx, values.dispatchWarehouse, setFieldValue, tItem);
                                              }
                                            }}
                                            placeholder="Search tile product..."
                                            className="w-full bg-white dark:bg-boxdark font-bold border border-teal-300 dark:border-teal-800 rounded p-2 pr-7 outline-none text-xs text-black dark:text-white focus:border-teal-500 shadow-sm"
                                          />

                                          {Boolean(tItem.itemName || tItem.skuCode) && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleTileProductSelection(null, tIdx, values.dispatchWarehouse, setFieldValue, tItem);
                                                setActiveTileProdIndex(null);
                                              }}
                                              className="absolute right-2 top-[17px] -translate-y-1/2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-meta-4 transition-colors z-10"
                                              title="Deselect Tile Product"
                                            >
                                              <FiX className="w-3.5 h-3.5" />
                                            </button>
                                          )}

                                          {tItem.skuCode && (
                                            <div className="text-[10px] font-mono font-bold text-teal-700 dark:text-teal-400 mt-0.5 truncate">
                                              Code: {tItem.skuCode} • Packing: {pcsPerBox} pcs/box {tItem.sqmPerBox ? `(${tItem.sqmPerBox} m²)` : ''}
                                            </div>
                                          )}

                                          {/* TILE PRODUCT DROPDOWN */}
                                          {isCurrentProdActive && (
                                            <div className="absolute left-0 top-full mt-1.5 z-[99999] min-w-[340px] max-w-[440px] max-h-[260px] overflow-y-auto rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin">
                                              {filteredTileProds.map((p, pIdx) => {
                                                const displaySku = p.item_sr_no || `SKU-${p.id}`;
                                                const isHighlighted = pIdx === highlightedTileProdIndex;
                                                const pPcsPerBox = Number(p.pieces_per_box || p.pcs_per_box || 4);
                                                return (
                                                  <div
                                                    key={p.id}
                                                    onMouseEnter={() => setHighlightedTileProdIndex(pIdx)}
                                                    onMouseDown={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      handleTileProductSelection(p, tIdx, values.dispatchWarehouse, setFieldValue, tItem);
                                                      setActiveTileProdIndex(null);
                                                    }}
                                                    className={`p-2.5 cursor-pointer transition flex items-center justify-between ${isHighlighted ? 'bg-teal-50 dark:bg-teal-950/40 border-l-4 border-teal-500' : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                                                  >
                                                    <div className="flex flex-col text-left pr-2">
                                                      <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                                                        {p.product_name}
                                                      </span>
                                                      <span className="text-[10px] text-slate-500 font-mono">
                                                        {displaySku} {p.sub_sub_category ? `• ${p.sub_sub_category}` : ''} • {pPcsPerBox} pcs/box
                                                      </span>
                                                    </div>
                                                    {(() => {
                                                      const { boxes, loose } = getTileStockBreakdown(p);
                                                      const hasStock = boxes > 0 || loose > 0;
                                                      return (
                                                        <div className="text-right font-mono shrink-0 pl-2 flex flex-col items-end justify-center">
                                                          <span className="text-xs font-bold text-teal-700 dark:text-teal-400">
                                                            Rs. {Number(p.retail_price || 0).toLocaleString()} / Box
                                                          </span>
                                                          <span className={`text-[11px] font-bold ${hasStock ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                            {boxes} Box{boxes !== 1 ? 'es' : ''}
                                                          </span>
                                                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium leading-none mt-0.5">
                                                            {loose} Pc{loose !== 1 ? 's' : ''}
                                                          </span>
                                                        </div>
                                                      );
                                                    })()}
                                                  </div>
                                                );
                                              })}
                                              {filteredTileProds.length === 0 && (
                                                <div className="p-4 text-center text-xs text-slate-400 italic">No tile products found (Parent Category: Tile)</div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </td>

                                      {/* TILE WAREHOUSE SELECTOR */}
                                      <td className="p-2 w-44 relative tile-wh-container">
                                        <div className="relative">
                                          <input
                                            type="text"
                                            autoComplete="off"
                                            value={currentWh}
                                            onFocus={() => {
                                              setActiveTileWhIndex(tIdx);
                                              setHighlightedTileWhIndex(0);
                                            }}
                                            onClick={() => {
                                              setActiveTileWhIndex(tIdx);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                if (filteredWhs.length === 0) return;
                                                setHighlightedTileWhIndex(prev => prev < filteredWhs.length - 1 ? prev + 1 : 0);
                                              } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                if (filteredWhs.length === 0) return;
                                                setHighlightedTileWhIndex(prev => prev > 0 ? prev - 1 : filteredWhs.length - 1);
                                              } else if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (filteredWhs[highlightedTileWhIndex]) {
                                                  const selWh = filteredWhs[highlightedTileWhIndex];
                                                  setFieldValue(`tileItems.${tIdx}.warehouse`, selWh);
                                                  if (tItem.itemName) {
                                                    fetchStockForWarehouse(tItem.itemName, selWh).then(avail => {
                                                      setFieldValue(`tileItems.${tIdx}.availableQty`, avail);
                                                    });
                                                  }
                                                  setActiveTileWhIndex(null);
                                                }
                                              } else if (e.key === 'Escape' || e.key === 'Tab') {
                                                setActiveTileWhIndex(null);
                                              }
                                            }}
                                            onChange={(e) => {
                                              const newWh = e.target.value;
                                              setFieldValue(`tileItems.${tIdx}.warehouse`, newWh);
                                              setActiveTileWhIndex(tIdx);
                                              setHighlightedTileWhIndex(0);
                                            }}
                                            placeholder={`Default (${values.dispatchWarehouse || 'None'})`}
                                            className="w-full bg-white dark:bg-boxdark border border-teal-300 dark:border-teal-800 rounded p-1.5 pr-6 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 shadow-sm"
                                          />

                                          {Boolean(currentWh) && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setFieldValue(`tileItems.${tIdx}.warehouse`, '');
                                                if (tItem.itemName) {
                                                  fetchStockForWarehouse(tItem.itemName, values.dispatchWarehouse || '').then(avail => {
                                                    setFieldValue(`tileItems.${tIdx}.availableQty`, avail);
                                                  });
                                                }
                                                setActiveTileWhIndex(null);
                                              }}
                                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-meta-4 transition-colors z-10"
                                              title="Deselect Warehouse"
                                            >
                                              <FiX className="w-3 h-3" />
                                            </button>
                                          )}

                                          {isCurrentWhActive && filteredWhs.length > 0 && (
                                            <div className="absolute left-0 min-w-[250px] max-w-[320px] top-full mt-1 z-[99999] max-h-[180px] overflow-y-auto rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin">
                                              {filteredWhs.map((wh, wIdx) => {
                                                const pcsPerBox = Math.max(1, Number(tItem.piecesPerBox) || 4);
                                                const whStock = tItem.itemName ? getItemWarehouseStock(tItem.itemName, wh) : null;
                                                const whBoxes = whStock !== null ? Math.floor(whStock / pcsPerBox) : 0;
                                                const whLoose = whStock !== null ? (whStock % pcsPerBox) : 0;
                                                const hasStock = whStock !== null && whStock > 0;
                                                return (
                                                  <div
                                                    key={wh}
                                                    onMouseEnter={() => setHighlightedTileWhIndex(wIdx)}
                                                    onMouseDown={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      setFieldValue(`tileItems.${tIdx}.warehouse`, wh);
                                                      if (tItem.itemName) {
                                                        fetchStockForWarehouse(tItem.itemName, wh).then(avail => {
                                                          setFieldValue(`tileItems.${tIdx}.availableQty`, avail);
                                                        });
                                                      }
                                                      setActiveTileWhIndex(null);
                                                    }}
                                                    className={`p-2.5 cursor-pointer transition text-xs font-bold flex items-center justify-between gap-2 ${wIdx === highlightedTileWhIndex ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-l-4 border-teal-500' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                                                  >
                                                    <span className="truncate">{wh}</span>
                                                    {tItem.itemName && (
                                                      <div className="text-right font-mono shrink-0 pl-2 flex flex-col items-end leading-none">
                                                        <span className={`text-[11px] font-bold ${hasStock ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                          {whBoxes} Box{whBoxes !== 1 ? 'es' : ''}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                                                          {whLoose} Pc{whLoose !== 1 ? 's' : ''}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      </td>

                                      {/* STOCK IN WAREHOUSE */}
                                      <td className="p-2 w-32 text-center">
                                        <div className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                          {availBoxes} Boxes + {availLoose} Pcs
                                        </div>
                                        <div className="text-[10px] text-teal-700 dark:text-teal-300 font-mono font-bold">
                                          {((availBoxes * sqmPerBox) + ((availLoose / pcsPerBox) * sqmPerBox)).toFixed(2)} m²
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-mono">
                                          ({currentStockVal} Total Pcs)
                                        </div>
                                      </td>

                                      {/* QTY (BOX) */}
                                      <td className="p-2 w-24 text-center">
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={tItem.boxQty ?? 0}
                                          onKeyDown={blockInvalidChar}
                                          onChange={(e) => {
                                            handleTileItemChange(tIdx, 'boxQty', e.target.value, values.tileItems, setFieldValue);
                                          }}
                                          className="w-full text-center bg-white dark:bg-boxdark border border-teal-300 dark:border-teal-800 rounded p-1.5 text-xs font-bold font-mono text-black dark:text-white outline-none focus:border-teal-500"
                                        />
                                      </td>

                                      {/* PCS (LOOSE) - AUTO ROLLS UP TO BOX IF >= PIECES PER BOX */}
                                      <td className="p-2 w-24 text-center">
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={tItem.loosePcs ?? 0}
                                          onKeyDown={blockInvalidChar}
                                          onChange={(e) => {
                                            handleTileItemChange(tIdx, 'loosePcs', e.target.value, values.tileItems, setFieldValue);
                                          }}
                                          className="w-full text-center bg-white dark:bg-boxdark border border-teal-300 dark:border-teal-800 rounded p-1.5 text-xs font-bold font-mono text-black dark:text-white outline-none focus:border-teal-500"
                                        />
                                      </td>

                                      {/* SALE PRICE (PER BOX) */}
                                      <td className="p-2 w-28 text-right">
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          value={tItem.pricePerBox ?? 0}
                                          onKeyDown={blockInvalidChar}
                                          onChange={(e) => {
                                            handleTileItemChange(tIdx, 'pricePerBox', e.target.value, values.tileItems, setFieldValue);
                                          }}
                                          className="w-full text-right bg-white dark:bg-boxdark border border-teal-300 dark:border-teal-800 rounded p-1.5 text-xs font-bold font-mono text-black dark:text-white outline-none focus:border-teal-500"
                                        />
                                      </td>

                                      {/* SALE PRICE (PER SQ. MTR) */}
                                      <td className="p-2 w-28 text-right">
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          value={tItem.pricePerSqm ?? 0}
                                          onKeyDown={blockInvalidChar}
                                          onChange={(e) => {
                                            handleTileItemChange(tIdx, 'pricePerSqm', e.target.value, values.tileItems, setFieldValue);
                                          }}
                                          className="w-full text-right bg-white dark:bg-boxdark border border-teal-300 dark:border-teal-800 rounded p-1.5 text-xs font-bold font-mono text-black dark:text-white outline-none focus:border-teal-500"
                                        />
                                        <div className="mt-1 text-right font-mono">
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 px-1.5 py-0.5 rounded border border-teal-200/80 dark:border-teal-800/60" title="Total Sq. Mtr being given for this item">
                                            <span className="text-[9px] text-teal-600 dark:text-teal-400 font-medium">Sq.M:</span>
                                            <strong className="text-teal-950 dark:text-teal-100 font-black">{itemLineSqm.toFixed(2)} m²</strong>
                                          </span>
                                        </div>
                                      </td>

                                      {/* SALE PRICE (PER PIECE) */}
                                      <td className="p-2 w-28 text-right">
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          value={tItem.pricePerPiece ?? 0}
                                          onKeyDown={blockInvalidChar}
                                          onChange={(e) => {
                                            handleTileItemChange(tIdx, 'pricePerPiece', e.target.value, values.tileItems, setFieldValue);
                                          }}
                                          className="w-full text-right bg-white dark:bg-boxdark border border-teal-300 dark:border-teal-800 rounded p-1.5 text-xs font-bold font-mono text-black dark:text-white outline-none focus:border-teal-500"
                                        />
                                      </td>

                                      {/* NET TOTAL */}
                                      <td className="p-2 w-32 text-right pr-3 font-mono font-black text-xs text-teal-800 dark:text-teal-300">
                                        Rs. {Number(tItem.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </td>

                                      {/* DELETE ROW */}
                                      <td className="p-2 w-8 text-center">
                                        <button
                                          type="button"
                                          onClick={() => remove(tIdx)}
                                          className="text-slate-400 hover:text-red-600 transition p-1"
                                          title="Remove tile item"
                                        >
                                          <FiTrash2 size={14} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <div className="p-2 bg-teal-50/50 dark:bg-teal-950/20 border-t border-teal-200 dark:border-teal-900/50 text-left">
                              <button
                                type="button"
                                onClick={() => push({
                                  id: Date.now(),
                                  itemName: '',
                                  skuCode: '',
                                  warehouse: values.dispatchWarehouse || '',
                                  availableQty: 0,
                                  boxQty: 1,
                                  loosePcs: 0,
                                  piecesPerBox: 4,
                                  sqmPerBox: 1.44,
                                  pricePerBox: 0,
                                  pricePerSqm: 0,
                                  pricePerPiece: 0,
                                  totalAmount: 0,
                                  totalSqm: 1.44,
                                  isTileItem: true
                                })}
                                className="text-teal-700 dark:text-teal-400 font-bold hover:underline cursor-pointer text-xs"
                              >
                                + Append Tile Item Row
                              </button>
                            </div>
                          </div>
                        );
                      }}
                    </FieldArray>
                  </div>
                )}

                {/* --- RETURN / EXCHANGE PRODUCTS DYNAMIC FIELDARRAY --- */}
                {values.showReturnSection && (
                  <div className={`border border-rose-300 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10 rounded-sm mt-6 relative ${activeReturnProdIndex !== null || activeReturnWhIndex !== null ? 'z-30' : 'z-10'} overflow-visible pb-4`}>
                    <FieldArray name="returnItems">
                      {({ push, remove }) => {
                        return (
                          <div className="w-full min-w-[800px]">
                            <div className="p-3 bg-rose-100/60 dark:bg-rose-900/30 border-b border-rose-200 dark:border-rose-800 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono text-[10px] font-black tracking-wider uppercase">
                                  Return / Exchange
                                </span>
                                <span className="font-bold text-xs text-rose-900 dark:text-rose-200">
                                  Returned Items (Credit Subtracted From This Invoice)
                                </span>
                              </div>
                              <div className="text-xs font-mono font-black text-rose-700 dark:text-rose-300">
                                Total Return Credit: Rs. {returnTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                            <table className="w-full table-auto border-collapse text-left">
                              <thead className="bg-rose-50/70 dark:bg-rose-950/40 text-[10px] font-black uppercase text-rose-900 dark:text-rose-300 border-b border-rose-200 dark:border-rose-800">
                                <tr>
                                  <th className="p-2 w-8 text-center">S#</th>
                                  <th className="p-2 min-w-[240px]">Returned Product (Name / Code)</th>
                                  <th className="p-2 w-44">Return Warehouse Zone</th>
                                  <th className="p-2 w-32 text-center">Return Qty</th>
                                  <th className="p-2 w-32 text-right">Return Rate (RP)</th>
                                  <th className="p-2 w-36 text-right pr-4">Line Credit Total</th>
                                  <th className="p-2 w-8 text-center"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {(values.returnItems || []).map((rItem: any, rIdx: number) => {
                                  const isCurrentProdActive = activeReturnProdIndex === rIdx;
                                  const isCurrentWhActive = activeReturnWhIndex === rIdx;
                                  const lineTotal = Number(rItem.qty || 0) * Number(rItem.rp ?? rItem.rate ?? 0);

                                  const exactReturnSelected = productsList.some((p: any) => String(p.product_name || '').toLowerCase().trim() === String(rItem.itemName || '').toLowerCase().trim());
                                  const returnSearch = exactReturnSelected ? '' : (rItem.itemName || '').toLowerCase().trim();
                                  const filteredProducts = productsList.filter((p: any) => {
                                    if (!returnSearch) return true;
                                    return (
                                      (p.product_name && p.product_name.toLowerCase().includes(returnSearch)) ||
                                      (p.item_sr_no && p.item_sr_no.toLowerCase().includes(returnSearch)) ||
                                      (`sku-${p.id}`.includes(returnSearch))
                                    );
                                  });

                                  const currentWh = rItem.warehouse !== undefined ? rItem.warehouse : (values.dispatchWarehouse || '');
                                  const exactReturnWhSelected = warehousesList.some(w => String(w || '').toLowerCase().trim() === String(currentWh || '').toLowerCase().trim());
                                  const returnWhQuery = exactReturnWhSelected ? '' : currentWh.toLowerCase().trim();
                                  let filteredWhs = returnWhQuery
                                    ? warehousesList.filter(w => w.toLowerCase().includes(returnWhQuery))
                                    : warehousesList;
                                  if (filteredWhs.length === 0 && warehousesList.length > 0) {
                                    filteredWhs = warehousesList;
                                  }

                                  return (
                                    <tr key={rIdx} className={`border-b border-rose-100 dark:border-rose-900/30 hover:bg-rose-50/30 ${isCurrentProdActive || isCurrentWhActive ? 'relative z-30' : 'relative z-10'}`}>
                                      <td className="p-2 text-center text-gray-500 font-mono text-xs">{rIdx + 1}</td>
                                      
                                      {/* RETURN PRODUCT SELECTOR */}
                                      <td className="p-2 relative return-prod-name-container">
                                        <div className="relative">
                                          <input
                                            type="text"
                                            autoComplete="off"
                                            value={rItem.itemName || ''}
                                            onFocus={() => {
                                              setActiveReturnProdIndex(rIdx);
                                              setHighlightedReturnProdIndex(0);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                if (filteredProducts.length === 0) return;
                                                setHighlightedReturnProdIndex(prev => prev < filteredProducts.length - 1 ? prev + 1 : 0);
                                              } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                if (filteredProducts.length === 0) return;
                                                setHighlightedReturnProdIndex(prev => prev > 0 ? prev - 1 : filteredProducts.length - 1);
                                              } else if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (filteredProducts.length > 0) {
                                                  const sel = filteredProducts[highlightedReturnProdIndex] || filteredProducts[0];
                                                  setFieldValue(`returnItems.${rIdx}.itemName`, sel.product_name);
                                                  setFieldValue(`returnItems.${rIdx}.skuCode`, sel.item_sr_no || `SKU-${sel.id}`);
                                                  setFieldValue(`returnItems.${rIdx}.rp`, Number(sel.retail_price || 0));
                                                  setFieldValue(`returnItems.${rIdx}.uom`, sel.uom || 'Nos');
                                                  setActiveReturnProdIndex(null);
                                                }
                                              } else if (e.key === 'Tab' || e.key === 'Escape') {
                                                setActiveReturnProdIndex(null);
                                              }
                                            }}
                                            onChange={(e) => {
                                              const typed = e.target.value;
                                              setFieldValue(`returnItems.${rIdx}.itemName`, typed);
                                              setActiveReturnProdIndex(rIdx);
                                              setHighlightedReturnProdIndex(0);

                                              const match = productsList.find(p => p.product_name && p.product_name.toLowerCase() === typed.trim().toLowerCase());
                                              if (match) {
                                                setFieldValue(`returnItems.${rIdx}.skuCode`, match.item_sr_no || `SKU-${match.id}`);
                                                setFieldValue(`returnItems.${rIdx}.rp`, Number(match.retail_price || 0));
                                                setFieldValue(`returnItems.${rIdx}.uom`, match.uom || 'Nos');
                                              }
                                            }}
                                            placeholder="Search product to return..."
                                            className="w-full bg-white dark:bg-boxdark font-bold border border-rose-200 dark:border-rose-900 rounded p-2 pr-7 outline-none text-xs text-black dark:text-white focus:border-rose-500 shadow-sm"
                                          />

                                          {Boolean(rItem.itemName || rItem.skuCode) && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setFieldValue(`returnItems.${rIdx}.itemName`, '');
                                                setFieldValue(`returnItems.${rIdx}.skuCode`, '');
                                                setFieldValue(`returnItems.${rIdx}.rp`, 0);
                                                setFieldValue(`returnItems.${rIdx}.amount`, 0);
                                                setActiveReturnProdIndex(null);
                                              }}
                                              className="absolute right-2 top-[17px] -translate-y-1/2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-meta-4 transition-colors z-10"
                                              title="Deselect Return Product"
                                            >
                                              <FiX className="w-3.5 h-3.5" />
                                            </button>
                                          )}

                                          {rItem.skuCode && (
                                            <div className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                                              Code: {rItem.skuCode}
                                            </div>
                                          )}

                                          {/* PRODUCT DROPDOWN */}
                                          {isCurrentProdActive && (
                                            <div className="absolute left-0 top-full mt-1.5 z-[99999] min-w-[340px] max-w-[420px] max-h-[260px] overflow-y-auto rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin">
                                              {filteredProducts.map((p, pIdx) => {
                                                const displaySku = p.item_sr_no || `SKU-${p.id}`;
                                                const isHighlighted = pIdx === highlightedReturnProdIndex;
                                                return (
                                                  <div
                                                    key={p.id}
                                                    onMouseEnter={() => setHighlightedReturnProdIndex(pIdx)}
                                                    onMouseDown={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      setFieldValue(`returnItems.${rIdx}.itemName`, p.product_name);
                                                      setFieldValue(`returnItems.${rIdx}.skuCode`, displaySku);
                                                      setFieldValue(`returnItems.${rIdx}.rp`, Number(p.retail_price || 0));
                                                      setFieldValue(`returnItems.${rIdx}.uom`, p.uom || 'Nos');
                                                      setActiveReturnProdIndex(null);
                                                    }}
                                                    className={`p-2.5 cursor-pointer transition flex items-center justify-between ${isHighlighted ? 'bg-rose-50 dark:bg-rose-950/40 border-l-4 border-rose-500' : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                                                  >
                                                    <div className="flex flex-col text-left pr-2">
                                                      <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                                                        {p.product_name}
                                                      </span>
                                                      <span className="text-[10px] text-slate-500 font-mono">
                                                        {displaySku} {p.category ? `• ${p.category}` : ''}
                                                      </span>
                                                    </div>
                                                    {(() => {
                                                      const isTile = isTileProduct(p);
                                                      if (isTile) {
                                                        const { boxes, loose } = getTileStockBreakdown(p);
                                                        const hasStock = boxes > 0 || loose > 0;
                                                        return (
                                                          <div className="text-right font-mono shrink-0 pl-2 flex flex-col items-end justify-center">
                                                            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                                              Rs. {Number(p.retail_price || 0).toLocaleString()}
                                                            </span>
                                                            <span className={`text-[11px] font-bold ${hasStock ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                              {boxes} Box{boxes !== 1 ? 'es' : ''}
                                                            </span>
                                                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium leading-none mt-0.5">
                                                              {loose} Pc{loose !== 1 ? 's' : ''}
                                                            </span>
                                                          </div>
                                                        );
                                                      }
                                                      const totStock = getProductOverallStock(p);
                                                      return (
                                                        <div className="text-right font-mono shrink-0 pl-2 flex flex-col items-end justify-center">
                                                          <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                                            Rs. {Number(p.retail_price || 0).toLocaleString()}
                                                          </span>
                                                          <span className={`text-[10px] font-bold ${totStock > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                            {totStock.toLocaleString()} {p.uom || 'Nos'}
                                                          </span>
                                                        </div>
                                                      );
                                                    })()}
                                                  </div>
                                                );
                                              })}
                                              {filteredProducts.length === 0 && (
                                                <div className="p-4 text-center text-xs text-slate-400 italic">No products found</div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </td>

                                      {/* RETURN WAREHOUSE SELECTOR */}
                                      <td className="p-2 w-44 relative return-wh-container">
                                        <div className="relative">
                                          <input
                                            type="text"
                                            autoComplete="off"
                                            value={currentWh}
                                            onFocus={() => {
                                              setActiveReturnWhIndex(rIdx);
                                              setHighlightedReturnWhIndex(0);
                                            }}
                                            onClick={() => {
                                              setActiveReturnWhIndex(rIdx);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                setHighlightedReturnWhIndex(prev => prev < filteredWhs.length - 1 ? prev + 1 : 0);
                                              } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setHighlightedReturnWhIndex(prev => prev > 0 ? prev - 1 : filteredWhs.length - 1);
                                              } else if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (filteredWhs[highlightedReturnWhIndex]) {
                                                  setFieldValue(`returnItems.${rIdx}.warehouse`, filteredWhs[highlightedReturnWhIndex]);
                                                  setActiveReturnWhIndex(null);
                                                }
                                              } else if (e.key === 'Escape' || e.key === 'Tab') {
                                                setActiveReturnWhIndex(null);
                                              }
                                            }}
                                            onChange={(e) => {
                                              setFieldValue(`returnItems.${rIdx}.warehouse`, e.target.value);
                                              setActiveReturnWhIndex(rIdx);
                                              setHighlightedReturnWhIndex(0);
                                            }}
                                            placeholder={`Default (${values.dispatchWarehouse || 'None'})`}
                                            className="w-full bg-white dark:bg-boxdark border border-rose-200 dark:border-rose-900 rounded p-1.5 pr-6 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-rose-500 shadow-sm"
                                          />

                                          {Boolean(currentWh) && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setFieldValue(`returnItems.${rIdx}.warehouse`, '');
                                                setActiveReturnWhIndex(null);
                                              }}
                                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-meta-4 transition-colors z-10"
                                              title="Deselect Warehouse"
                                            >
                                              <FiX className="w-3 h-3" />
                                            </button>
                                          )}

                                          {isCurrentWhActive && filteredWhs.length > 0 && (
                                            <div className="absolute left-0 min-w-[230px] max-w-[300px] top-full mt-1 z-[99999] max-h-[180px] overflow-y-auto rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin">
                                              {filteredWhs.map((wh, wIdx) => {
                                                const whStock = rItem.itemName ? getItemWarehouseStock(rItem.itemName, wh) : null;
                                                return (
                                                  <div
                                                    key={wh}
                                                    onMouseEnter={() => setHighlightedReturnWhIndex(wIdx)}
                                                    onMouseDown={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      setFieldValue(`returnItems.${rIdx}.warehouse`, wh);
                                                      setActiveReturnWhIndex(null);
                                                    }}
                                                    className={`p-2.5 cursor-pointer transition text-xs font-bold flex items-center justify-between gap-2 ${wIdx === highlightedReturnWhIndex ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-l-4 border-rose-500' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                                                  >
                                                    <span className="truncate">{wh}</span>
                                                    {rItem.itemName && (
                                                      <span className={`font-mono text-[11px] font-bold shrink-0 ${whStock !== null && whStock > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                        {(whStock ?? 0).toLocaleString()} {rItem.uom || 'Nos'}
                                                      </span>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      </td>

                                      {/* RETURN QTY */}
                                      <td className="p-2 w-32">
                                        <input
                                          type="number"
                                          min="1"
                                          onKeyDown={blockInvalidChar}
                                          value={rItem.qty === 0 ? '' : rItem.qty}
                                          onChange={(e) => {
                                            const val = e.target.value.trim();
                                            const num = val === '' ? 0 : Math.max(0, Number(val) || 0);
                                            setFieldValue(`returnItems.${rIdx}.qty`, num);
                                          }}
                                          placeholder="1"
                                          className="w-full bg-white dark:bg-boxdark font-black text-xs text-center border border-rose-200 dark:border-rose-900 rounded p-1.5 outline-none focus:border-rose-500 shadow-sm text-black dark:text-white"
                                        />
                                      </td>

                                      {/* RETURN RATE / RP */}
                                      <td className="p-2 w-32">
                                        <input
                                          type="number"
                                          min="0"
                                          onKeyDown={blockInvalidChar}
                                          value={rItem.rp === 0 ? '' : rItem.rp}
                                          onChange={(e) => {
                                            const val = e.target.value.trim();
                                            const num = val === '' ? 0 : Math.max(0, Number(val) || 0);
                                            setFieldValue(`returnItems.${rIdx}.rp`, num);
                                          }}
                                          placeholder="0"
                                          className="w-full bg-white dark:bg-boxdark font-black text-xs text-right border border-rose-200 dark:border-rose-900 rounded p-1.5 outline-none focus:border-rose-500 shadow-sm text-black dark:text-white"
                                        />
                                      </td>

                                      {/* LINE CREDIT TOTAL */}
                                      <td className="p-2 text-right pr-4 text-rose-600 dark:text-rose-400 font-black font-mono">
                                        - Rs. {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </td>

                                      {/* ACTION */}
                                      <td className="p-1 w-8 text-center">
                                        <button
                                          type="button"
                                          onClick={() => remove(rIdx)}
                                          className="text-gray-400 hover:text-danger cursor-pointer"
                                          title="Remove Return Item"
                                        >
                                          <FiTrash2 size={14} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <div className="p-2 bg-rose-50/40 dark:bg-rose-950/20 border-t border-rose-200 dark:border-rose-900/50 text-left">
                              <button
                                type="button"
                                onClick={() => push({ itemName: '', skuCode: '', warehouse: values.dispatchWarehouse || '', qty: 1, rp: 0, amount: 0 })}
                                className="text-rose-600 dark:text-rose-400 font-bold hover:underline cursor-pointer text-xs"
                              >
                                + Append Returned Item Row
                              </button>
                            </div>
                          </div>
                        );
                      }}
                    </FieldArray>
                  </div>
                )}

                {/* --- LOCATION GATE PASSES DYNAMIC SECTION --- */}
                {(() => {
                  const allRows = [
                    ...values.items,
                    ...(values.showTileSection ? (values.tileItems || []) : []),
                    ...(values.showReturnSection ? (values.returnItems || []) : [])
                  ];
                  const uniqueLocations = Array.from(new Set(
                    allRows
                      .map((i: any) => i.warehouse || values.dispatchWarehouse)
                      .filter(Boolean)
                  ));
                  if (uniqueLocations.length === 0) return null;
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-meta-4/5 p-4 rounded-sm border border-stroke dark:border-strokedark mt-6">
                      <div className="col-span-full mb-1">
                        <h4 className="font-bold text-gray-700 dark:text-gray-300">Location Gate Passes</h4>
                        <p className="text-xs text-gray-500">Provide a gate pass number for each dispatch location involved in this invoice.</p>
                      </div>
                      {uniqueLocations.map(loc => (
                        <div key={loc as string}>
                          <label className="block font-bold text-black dark:text-white mb-1 flex items-center gap-2">
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
                      <span>Rs. {grossSubtotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    {values.showOverallDiscount && (
                      <div className="flex justify-between items-center border-b pb-1 dark:border-strokedark text-amber-600 dark:text-amber-400">
                        <span className="text-xs">Overall Discount (PKR):</span>
                        <input
                          type="number"
                          min="0"
                          onKeyDown={blockInvalidChar}
                          name="overallDiscount"
                          value={values.overallDiscount === 0 ? '' : values.overallDiscount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFieldValue('overallDiscount', val === '' ? 0 : Math.max(0, Number(val) || 0));
                          }}
                          placeholder="0.00"
                          className="w-28 text-right font-black bg-amber-50/40 dark:bg-amber-900/10 border border-amber-300 dark:border-amber-700 rounded p-1 text-xs outline-none focus:border-amber-500 text-amber-700 dark:text-amber-300"
                        />
                      </div>
                    )}

                    {values.showOverallDiscount && (
                      <div className="flex justify-between border-b pb-1 dark:border-strokedark text-green-600 dark:text-green-400 font-black">
                        <span>Net Invoice Total (After Discount):</span>
                        <span>Rs. {currentSubtotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    {values.showAdditionalCharges && (
                      <div className="flex justify-between items-center border-b pb-1 dark:border-strokedark text-blue-600 dark:text-blue-400">
                        <span className="text-xs">Freight Charges:</span>
                        <input
                          type="number"
                          min="0"
                          onKeyDown={blockInvalidChar}
                          name="additionalCharges"
                          value={values.additionalCharges === 0 ? '' : values.additionalCharges}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFieldValue('additionalCharges', val === '' ? 0 : Math.max(0, Number(val) || 0));
                          }}
                          placeholder="0.00"
                          className="w-28 text-right font-black bg-blue-50/40 dark:bg-blue-900/10 border border-blue-300 dark:border-blue-700 rounded p-1 text-xs outline-none focus:border-blue-500 text-blue-700 dark:text-blue-300"
                        />
                      </div>
                    )}

                    {(values.showReturnSection || returnTotalValue > 0) && (
                      <div className="flex justify-between border-b pb-1 dark:border-strokedark text-rose-600 dark:text-rose-400 font-bold">
                        <span>Less Return Credit:</span>
                        <span>- Rs. {returnTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    <div className={`flex justify-between border-b pb-1 dark:border-strokedark font-black ${netPayableBeforeFloor < 0 ? 'text-teal-600 dark:text-teal-400' : 'text-slate-900 dark:text-white'}`}>
                      <span>{netPayableBeforeFloor < 0 ? 'Excess Customer Credit:' : 'Net Bill Payable:'}</span>
                      <span>Rs. {Math.abs(netPayableBeforeFloor).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

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
                      
                      if (netPayableBeforeFloor < 0) {
                        return (
                          <div className="flex justify-between pt-1 border-double border-b-4 border-teal-500 dark:border-teal-400">
                            <span className="font-sans text-[11px] text-teal-600 dark:text-teal-400 font-bold">Adjusted into Customer Balance:</span>
                            <b className="text-sm text-teal-600 dark:text-teal-400 font-mono">
                              - Rs. {Math.abs(netPayableBeforeFloor).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </b>
                          </div>
                        );
                      }

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

                    const handleInvoiceSubmitAttempt = async (action: 'save' | 'print') => {
                      if (isOverpaid) {
                        toast.error(`Payment (Rs. ${totalPaidNow.toLocaleString()}) cannot exceed bill total (Rs. ${currentSubtotalValue.toLocaleString()})!`);
                        return;
                      }

                      // Check validation actively
                      const formErrors: any = await validateForm();
                      if (formErrors && Object.keys(formErrors).length > 0) {
                        let errorMsg = 'Please complete all required fields before logging the invoice.';
                        if (formErrors.items) {
                          if (typeof formErrors.items === 'string') {
                            errorMsg = formErrors.items;
                          } else if (Array.isArray(formErrors.items)) {
                            const firstIt: any = formErrors.items.find(Boolean);
                            if (firstIt) {
                              errorMsg = typeof firstIt === 'string' ? firstIt : (firstIt.itemName || firstIt.warehouse || firstIt.qty || firstIt.rp || 'Please select a product for all item rows.');
                            }
                          }
                        } else if (formErrors.gatePasses) {
                          errorMsg = typeof formErrors.gatePasses === 'string' ? formErrors.gatePasses : 'Please provide gate passes for all dispatch locations.';
                        } else if (formErrors.salesman) {
                          errorMsg = String(formErrors.salesman);
                        } else if (formErrors.saleDate) {
                          errorMsg = String(formErrors.saleDate);
                        } else {
                          const firstVal = Object.values(formErrors)[0];
                          if (typeof firstVal === 'string') errorMsg = firstVal;
                        }
                        toast.error(errorMsg);
                        return;
                      }

                      setSubmitAction(action);
                      setIsOpeningCustomerModal(true);
                      submitForm().finally(() => {
                        setTimeout(() => setIsOpeningCustomerModal(false), 1200);
                      });
                    };

                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => handleInvoiceSubmitAttempt('print')}
                          disabled={loading || isModalLoading || isOverpaid}
                          className={`rounded-xl py-3 px-6 font-bold text-white transition shadow-md text-xs cursor-pointer flex items-center gap-2 ${
                            isOverpaid || isModalLoading ? 'bg-gray-400 cursor-not-allowed opacity-75' : 'bg-teal-600 hover:bg-teal-700'
                          }`}
                        >
                          {isModalLoading && submitAction === 'print' ? (
                            <>
                              <Spinner color="border-white" size="w-4 h-4" />
                              <span>Validating...</span>
                            </>
                          ) : (
                            <>
                              <FiPrinter size={15} /> <span>Save & Print</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleInvoiceSubmitAttempt('save')}
                          disabled={loading || isModalLoading || isOverpaid}
                          className={`rounded-xl py-3 px-8 font-bold text-white transition shadow-md text-xs cursor-pointer flex items-center gap-2 ${
                            isOverpaid || isModalLoading ? 'bg-gray-400 cursor-not-allowed opacity-75' : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          {isModalLoading && submitAction === 'save' ? (
                            <>
                              <Spinner color="border-white" size="w-4 h-4" />
                              <span>Validating...</span>
                            </>
                          ) : loading ? (
                            <Spinner color="border-white" size="w-4 h-4" />
                          ) : (
                            <>
                              <FiCheck size={15} /> <span>{editData ? 'Apply Updates' : 'Log Invoice'}</span>
                            </>
                          )}
                        </button>
                      </>
                    );
                  })()}
                </div>

                {/* MODAL OPENING TOAST INDICATOR */}
                {isModalLoading && !showCustomerModal && (
                  <div className="fixed bottom-6 right-6 z-[9998] flex items-center gap-3 bg-white dark:bg-boxdark border border-teal-500/40 shadow-2xl py-3 px-5 rounded-xl animate-fade-in pointer-events-none">
                    <Spinner color="border-teal-600" size="w-4 h-4" />
                    <span className="text-xs font-bold text-slate-800 dark:text-white">
                      Validating invoice & opening client checkout...
                    </span>
                  </div>
                )}
              </Form>
            );
          }}
        </Formik>
      </div>
    </div>
  );
};

export default NewInvoice;
