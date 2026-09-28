import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { FiTrash2, FiPlus, FiArrowLeft, FiCheckCircle, FiPrinter } from 'react-icons/fi';

const AddPurchases = () => {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [submitAction, setSubmitAction] = useState<'save' | 'print'>('save');

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [bankAccountsList, setBankAccountsList] = useState<any[]>([]);
  const [activeSkuIndex, setActiveSkuIndex] = useState<number | null>(null);
  const [highlightedSkuIndex, setHighlightedSkuIndex] = useState<number>(0);
  const [activeProdNameIndex, setActiveProdNameIndex] = useState<number | null>(null);
  const [highlightedProdNameIndex, setHighlightedProdNameIndex] = useState<number>(0);
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [highlightedVendorIndex, setHighlightedVendorIndex] = useState<number>(0);
  const [pendingGrns, setPendingGrns] = useState<any[]>([]);
  const [isGrnDropdownOpen, setIsGrnDropdownOpen] = useState(false);
  const [highlightedGrnIndex, setHighlightedGrnIndex] = useState(0);
  const [grnSearchTerm, setGrnSearchTerm] = useState('');

  const [defaultPurchaseNo, setDefaultPurchaseNo] = useState('');

  const location = useLocation();
  const navigate = useNavigate();

  const editData = location.state?.purchaseRecord;
  const isEditMode = !!editData;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.sku-container')) {
        setActiveSkuIndex(null);
      }
      if (!target.closest('.prod-name-container')) {
        setActiveProdNameIndex(null);
      }
      if (!target.closest('.vendor-search-container')) {
        setIsVendorDropdownOpen(false);
      }
      if (!target.closest('.grn-search-container')) {
        setIsGrnDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchPurchaseMetadata = async () => {
      try {
        setMetadataLoading(true);
        const { data: vendorData, error: vendorError } = await supabase
          .from('vendors')
          .select('*');
        
        // Auto-generate serial purchaseNo
        const { count } = await supabase.from('supplier_purchases').select('*', { count: 'exact', head: true });
        setDefaultPurchaseNo(String((count || 0) + 1).padStart(2, '0'));

        const { data: grnData } = await supabase.from('grn_receipts').select('*, grn_items(*)').in('status', ['Confirm', 'Partially Received']).order('created_at', { ascending: false });
        if (grnData) setPendingGrns(grnData);

        if (vendorError) throw vendorError;

        const normalizedVendors = (vendorData || []).map((v: any) => ({
          id: v.id,
          vendor_name: v.vendor_name || v.name || 'Unnamed Vendor',
          contact_person: v.contact_person || v.contact || '',
          phone: v.phone || v.mobile || '',
          city: v.city || ''
        })).sort((a: any, b: any) => a.vendor_name.localeCompare(b.vendor_name));

        const { data: locData } = await supabase.from('inventory_locations').select('id, name').order('name', { ascending: true });
        const { data: prodData } = await supabase.from('products').select('id, product_name, purchase_price, uom, item_sr_no, pieces_per_box, pcs_per_box, category, scenario_name, product_description');
        const { data: bankData } = await supabase.from('banks').select('id, bankName, accountTitle, accountNumber');

        setSuppliers(normalizedVendors);
        if (locData) setLocations(locData);
        if (prodData) setProductList(prodData);
        if (bankData) setBankAccountsList(bankData);
      } catch (err: any) {
        toast.error('Failed to load system procurement metadata lookup profiles: ' + err.message);
      } finally {
        setMetadataLoading(false);
      }
    };
    fetchPurchaseMetadata();
  }, []);

  const validationSchema = Yup.object().shape({
    supplierName: Yup.string().required('Wholesale Vendor selection is required'),
    purchaseDate: Yup.string().required('Inbound Date is required'),
    purchaseNo: Yup.string().required('Purchase Order Ref is required'),
    settlementMode: Yup.string().required('Payment Method is required'),
    selectedBankTitle: Yup.string().when('settlementMode', {
      is: (val: string) => val === 'Bank' || val === 'Split',
      then: () => Yup.string().required('Please select a Bank account profile'),
      otherwise: () => Yup.string().nullable()
    }),
    cashAmountPaid: Yup.number().when('settlementMode', {
      is: (val: string) => val === 'Cash' || val === 'Split',
      then: () => Yup.number().typeError('Must be numeric').min(0, 'Cannot be negative'),
      otherwise: () => Yup.number().nullable()
    }),
    bankAmountPaid: Yup.number().when('settlementMode', {
      is: (val: string) => val === 'Bank' || val === 'Split',
      then: () => Yup.number().typeError('Must be numeric').min(0, 'Cannot be negative'),
      otherwise: () => Yup.number().nullable()
    }),
    items: Yup.array().of(
      Yup.object().shape({
        itemName: Yup.string().required('Product selection is required'),
        qty: Yup.number().typeError('Numeric lines only').min(0.001, 'Min 0.001').required('Required'),
        rate: Yup.number().typeError('Numeric lines only').min(0, 'Min 0').required('Required'),
        gstRate: Yup.number().min(0).nullable(),
        gstAmt: Yup.number().min(0).nullable(),
        discountPer: Yup.number().min(0).nullable(),
        discountAmt: Yup.number().min(0).nullable()
      })
    ).min(1, 'At least one product item is required')
  });

  const calculatePurchaseLineTotals = (item: any, applyTax: boolean) => {
    const qty = Math.max(0, Number(item.qty) || 0);
    const rate = Math.max(0, Number(item.rate) || 0);
    const grossTotal = qty * rate;
    const discountAmt = Math.max(0, Number(item.discountAmt) || 0);
    const remainingCost = Math.max(0, grossTotal - discountAmt);

    if (!applyTax) {
      return { grossTotal, gstAmt: 0, discountAmt, netTotal: remainingCost };
    }

    const gstAmt = Math.max(0, Number(item.gstAmt) || 0);
    const netTotal = Math.max(0, remainingCost + gstAmt);

    return { grossTotal, gstAmt, discountAmt, netTotal };
  };

  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
    ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

  const formInitialValues = React.useMemo(() => {
    if (isEditMode && editData) {
      const rawItems = Array.isArray(editData.items) ? editData.items : JSON.parse(editData.items || '[]');
      const paymentTerm = editData.payment_term || 'Cash';
      const settlementMode = paymentTerm.includes('Bank') && paymentTerm.includes('Cash')
        ? 'Split'
        : paymentTerm.includes('Bank')
          ? 'Bank'
          : 'Cash';

      return {
        grnId: editData.metadata?.grn_id || editData.grn_id || null,
        purchaseNo: editData.purchase_no || '',
        supplierName: editData.supplier_name || '',
        targetWarehouse: editData.target_warehouse || '',
        purchaseDate: editData.purchase_date || new Date().toISOString().split('T')[0],
        applyTax: editData.purchase_type && editData.purchase_type !== 'No Tax',
        showDiscount: rawItems.some((i: any) => Number(i.discountAmt || i.discount_amt || 0) > 0),
        settlementMode: settlementMode,
        selectedBankTitle: editData.metadata?.selectedBankTitle || editData.selected_bank_title || '',
        cashAmountPaid: Number(editData.cash_amount_paid ?? (settlementMode === 'Cash' ? editData.amount_paid : 0)),
        bankAmountPaid: Number(editData.bank_amount_paid ?? (settlementMode === 'Bank' ? editData.amount_paid : 0)),
        remarks: editData.remarks || '',
        items: rawItems.map((it: any) => ({
          ...it,
          skuCode: it.skuCode || it.item_sr_no || it.item_code || '',
          warehouse: it.warehouse || it.target_warehouse || '',
          rate: Number(it.rate ?? it.cost_price ?? 0),
          qty: Number(it.qty ?? it.quantity ?? 1),
          gstRate: Number(it.gstRate ?? it.gst_rate ?? 18),
          gstAmt: Number(it.gstAmt ?? it.gst_amt ?? 0),
          discountPer: Number(it.discountPer ?? it.discount_per ?? 0),
          discountAmt: Number(it.discountAmt ?? it.discount_amt ?? 0)
        }))
      };
    }
    return {
      grnId: null,
      purchaseNo: defaultPurchaseNo,
      supplierName: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      applyTax: false,
      showDiscount: false,
      showAdditionalCharges: false,
      additionalCharges: 0,
      settlementMode: 'Cash',
      selectedBankTitle: '',
      cashAmountPaid: 0,
      bankAmountPaid: 0,
      remarks: '',
      items: [
        {
          itemName: '',
          skuCode: '',
          warehouse: locations[0]?.name || '',
          qty: 1,
          rate: 0,
          discountPer: 0,
          discountAmt: 0,
          gstRate: 18,
          gstAmt: 0
        }
      ]
    };
  }, [isEditMode, editData, defaultPurchaseNo]);

  if (loading) return <div className="flex h-64 items-center justify-center bg-white dark:bg-boxdark"><Spinner /></div>;
  if (metadataLoading) return <div className="flex h-64 items-center justify-center bg-white dark:bg-boxdark"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-7xl text-black dark:text-bodydark text-xs pb-12">
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">

        {/* Header Bar */}
        <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark flex flex-wrap justify-between items-center gap-4">
          <div>
            <h3 className="font-bold text-black dark:text-white text-lg tracking-tight">
              {isEditMode ? 'Modify Purchase / Inbound Stock Batch' : 'Log New Supplier Stock Purchase'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Record vendor procurement, receive physical inventory into destination warehouse & settle supplier payables</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchases/List`)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/20"
          >
            <FiArrowLeft size={14} /> Back to Purchases History
          </button>
        </div>

        <Formik
          initialValues={formInitialValues}
          validationSchema={validationSchema}
          enableReinitialize={true}
          onSubmit={async (values) => {
            try {
              setLoading(true);

              if (values.purchaseNo) {
                let query = supabase.from('supplier_purchases').select('id').eq('purchase_no', values.purchaseNo);
                if (isEditMode && editData?.id) {
                  query = query.neq('id', editData.id);
                }
                const { data: existingRecords, error: checkError } = await query;
                if (checkError) throw checkError;
                if (existingRecords && existingRecords.length > 0) {
                  toast.error('Purchase Order Ref already exists!');
                  setLoading(false);
                  return;
                }
              }

              const totalBillAmount = values.items.reduce((acc: any, item: any) => {
                return acc + calculatePurchaseLineTotals(item, values.applyTax).netTotal;
              }, 0) + Number(values.additionalCharges || 0);

              const totalPaid = (values.settlementMode === 'Cash' ? Number(values.cashAmountPaid || 0) : 0) +
                (values.settlementMode === 'Bank' ? Number(values.bankAmountPaid || 0) : 0) +
                (values.settlementMode === 'Split' ? (Number(values.cashAmountPaid || 0) + Number(values.bankAmountPaid || 0)) : 0);

              // Block overpayment
              if (totalPaid > totalBillAmount + 0.01) {
                toast.error(`Overpayment detected! Total paid (Rs. ${totalPaid.toLocaleString()}) exceeds bill total (Rs. ${totalBillAmount.toLocaleString()}). Please correct the payment amount.`);
                setLoading(false);
                return;
              }

              const remainingBalance = Math.max(0, totalBillAmount - totalPaid);

              let paymentTermLabel = 'By Cash';
              if (values.settlementMode === 'Bank') paymentTermLabel = 'By Bank';
              else if (values.settlementMode === 'Split') paymentTermLabel = 'Cash & Bank Combined';

              let grnIdToUse = values.grnId || null;

              // On edit: validate new qty >= already accepted qty in GRN
              if (isEditMode) {
                const linkedGrnId = values.grnId || editData?.metadata?.grn_id || editData?.grn_id || null;
                if (linkedGrnId) {
                  const { data: existingGrnItems } = await supabase
                    .from('grn_items')
                    .select('product_name, warehouse_name, accepted_qty')
                    .eq('grn_id', linkedGrnId);

                  if (existingGrnItems && existingGrnItems.length > 0) {
                    // Group accepted quantities by product
                    const acceptedByProduct: Record<string, number> = {};
                    existingGrnItems.forEach((g: any) => {
                      const pKey = String(g.product_name || '').trim().toLowerCase();
                      const acc = Number(g.accepted_qty || 0);
                      if (acc > 0) {
                        acceptedByProduct[pKey] = (acceptedByProduct[pKey] || 0) + acc;
                      }
                    });

                    // Compare against total new quantities in values.items
                    for (const [pKey, acceptedTotal] of Object.entries(acceptedByProduct)) {
                      if (acceptedTotal <= 0) continue;
                      const newTotalForProduct = values.items
                        .filter((i: any) => String(i.itemName || '').trim().toLowerCase() === pKey)
                        .reduce((sum: number, i: any) => sum + Number(i.qty || 0), 0);

                      // Tolerance of 0.0001 for floating-point rounding
                      if (newTotalForProduct < (acceptedTotal - 0.0001)) {
                        const originalProdName = existingGrnItems.find((g: any) => String(g.product_name || '').trim().toLowerCase() === pKey)?.product_name || pKey;
                        toast.error(
                          `Cannot reduce below approved qty!\n\nProduct: "${originalProdName}"\nAlready Approved in GRN: ${acceptedTotal}\nYour New Total Qty: ${newTotalForProduct}\n\nMinimum allowed total qty is ${acceptedTotal}.`,
                          { duration: 6000 }
                        );
                        setLoading(false);
                        return;
                      }
                    }
                  }
                }
              }

              if (!isEditMode && !grnIdToUse) {
                // Auto-generate a Pending Inward GRN for direct purchases so it goes to the approval queue
                const { data: grnData, error: grnError } = await supabase
                  .from('grn_receipts')
                  .insert([{
                    grn_no: `GRN-${values.purchaseNo || Date.now()}`,
                    vendor_name: values.supplierName,
                    receipt_date: values.purchaseDate,
                    status: 'Pending Inward',
                    remarks: 'Auto-generated from Direct Purchase'
                  }])
                  .select('id')
                  .single();

                if (grnError) throw grnError;
                grnIdToUse = grnData.id;

                const itemsToInsert = values.items.map((item: any) => ({
                  grn_id: grnIdToUse,
                  product_name: item.itemName,
                  warehouse_name: item.warehouse || values.targetWarehouse || locations[0]?.name || 'Main Warehouse',
                  qty: Number(item.qty),
                  uom: 'EACH' // Assuming standard, edit later if needed
                }));

                const { error: grnItemsError } = await supabase.from('grn_items').insert(itemsToInsert);
                if (grnItemsError) throw grnItemsError;
              }

              const databasePayload = {
                purchase_no: values.purchaseNo,
                supplier_name: values.supplierName,
                vendor_name: values.supplierName,
                target_warehouse: values.targetWarehouse || locations[0]?.name || 'Main Warehouse',
                purchase_date: values.purchaseDate,
                purchase_type: values.applyTax ? 'GST Standard Item' : 'No Tax',
                payment_term: paymentTermLabel,
                amount_paid: totalPaid,
                cash_amount_paid: values.settlementMode === 'Bank' ? 0 : Number(values.cashAmountPaid || 0),
                bank_amount_paid: values.settlementMode === 'Cash' ? 0 : Number(values.bankAmountPaid || 0),
                selected_bank_title: values.selectedBankTitle || null,
                additional_charges: Number(values.additionalCharges || 0),
                total_amount: totalBillAmount,
                remaining_balance: remainingBalance,
                remarks: values.remarks.trim() || null,
                notes: values.remarks.trim() || null,
                items: values.items,
                metadata: {
                  settlementMode: values.settlementMode,
                  selectedBankTitle: values.selectedBankTitle,
                  cashAmountPaid: values.cashAmountPaid,
                  bankAmountPaid: values.bankAmountPaid,
                  applyTax: values.applyTax,
                  grn_id: grnIdToUse
                }
              };

              if (isEditMode) {
                const { error } = await supabase.from('supplier_purchases').update(databasePayload).eq('id', editData.id);
                if (error) throw error;

                // Sync updated items back to linked GRN so Inward Challan stays accurate
                const linkedGrnId = values.grnId || editData?.metadata?.grn_id || editData?.grn_id || null;
                if (linkedGrnId) {
                  // Fetch existing GRN items so we retain accepted_qty for already verified items
                  const { data: existingGrnItems } = await supabase
                    .from('grn_items')
                    .select('*')
                    .eq('grn_id', linkedGrnId);

                  await supabase.from('grn_items').delete().eq('grn_id', linkedGrnId);

                  let hasUnverified = false;
                  const updatedGrnItems = values.items.map((item: any) => {
                    const matched = (existingGrnItems || []).find((eg: any) =>
                      eg.product_name === item.itemName &&
                      String(eg.warehouse_name).toUpperCase() === String(item.warehouse || values.targetWarehouse || locations[0]?.name || 'Main Warehouse').toUpperCase() &&
                      Number(eg.qty) === Number(item.qty)
                    );

                    const acceptedQty = matched ? matched.accepted_qty : null;
                    const rejectedQty = matched ? matched.rejected_qty : 0;
                    const holdQty = matched ? matched.hold_qty : 0;

                    const isUnverified = (acceptedQty == null) || (acceptedQty === 0 && rejectedQty === 0 && Number(item.qty) > 0);
                    if (isUnverified) hasUnverified = true;

                    return {
                      grn_id: linkedGrnId,
                      product_name: item.itemName,
                      warehouse_name: item.warehouse || values.targetWarehouse || locations[0]?.name || 'Main Warehouse',
                      qty: Number(item.qty),
                      uom: item.uom || 'EACH',
                      accepted_qty: acceptedQty,
                      rejected_qty: rejectedQty,
                      hold_qty: holdQty
                    };
                  });
                  await supabase.from('grn_items').insert(updatedGrnItems);

                  // Update GRN header date/vendor and status
                  const newStatus = hasUnverified ? 'Partially Received' : 'Confirm';
                  await supabase.from('grn_receipts').update({
                    vendor_name: values.supplierName,
                    receipt_date: values.purchaseDate,
                    status: newStatus
                  }).eq('id', linkedGrnId);
                }

                toast.success('Procurement inventory batch updated successfully!');
                if (submitAction === 'print') {
                  navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchases/Print/${editData.id}`);
                } else {
                  navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchases/List`);
                }
              } else {
                const { data: insertedData, error } = await supabase.from('supplier_purchases').insert([databasePayload]).select('id').single();
                if (error) throw error;
                // If the purchase was imported from an existing GRN, mark that GRN as Billed.
                // If it was auto-generated (values.grnId is null), we leave it as Pending Inward for approval.
                if (values.grnId) {
                  await supabase.from('grn_receipts').update({ status: 'Billed' }).eq('id', values.grnId);
                }

                toast.success('Procurement inventory batch recorded successfully!');
                if (submitAction === 'print' && insertedData?.id) {
                  navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchases/Print/${insertedData.id}`);
                } else {
                  navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchases/List`);
                }
              }

            } catch (err: any) {
              toast.error('Submission Interrupted: ' + err.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {({ handleChange, values, errors, touched, setFieldValue, submitForm }) => {
            const totalBillAmount = values.items.reduce((acc: any, item: any) => {
              return acc + calculatePurchaseLineTotals(item, values.applyTax).netTotal;
            }, 0) + Number(values.additionalCharges || 0);

            const totalPaid = (values.settlementMode === 'Cash' ? Number(values.cashAmountPaid || 0) : 0) +
              (values.settlementMode === 'Bank' ? Number(values.bankAmountPaid || 0) : 0) +
              (values.settlementMode === 'Split' ? (Number(values.cashAmountPaid || 0) + Number(values.bankAmountPaid || 0)) : 0);

            const remainingBalance = Math.max(0, totalBillAmount - totalPaid);

            return (
              <Form className="p-6 space-y-6">



                {/* ── TOP 2-COLUMN HEADER BAR ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-meta-4/5 p-4 rounded-sm border border-stroke dark:border-strokedark">
                  <div>
                    <label className="block font-bold text-gray-500 mb-1">Inbound Purchase Date: *</label>
                    <input
                      type="date"
                      name="purchaseDate"
                      value={values.purchaseDate}
                      onChange={handleChange}
                      className={`w-full rounded border p-2 text-sm bg-transparent font-bold outline-none text-black dark:text-white ${hasAttempted && errors.purchaseDate ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus:border-primary'}`}
                    />
                  </div>

                  {/* Searchable Wholesale Vendor */}
                  <div className="relative vendor-search-container">
                    <label className="block font-bold text-gray-500 mb-1">Wholesale Vendor: *</label>
                    {(() => {
                      const filteredVendors = suppliers.filter(s => {
                        if (!values.supplierName) return true;
                        const q = (values.supplierName || '').toLowerCase().trim();
                        const vName = (s.vendor_name || '').toLowerCase();
                        const vPhone = (s.phone || '').toLowerCase();
                        const vContact = (s.contact_person || '').toLowerCase();
                        return vName.includes(q) || vPhone.includes(q) || vContact.includes(q);
                      });

                      return (
                        <div className="relative">
                          <input
                            type="text"
                            autoComplete="off"
                            value={values.supplierName}
                            onFocus={() => {
                              setIsVendorDropdownOpen(true);
                              setHighlightedVendorIndex(0);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setIsVendorDropdownOpen(true);
                                setHighlightedVendorIndex(prev => prev < filteredVendors.length - 1 ? prev + 1 : 0);
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setIsVendorDropdownOpen(true);
                                setHighlightedVendorIndex(prev => prev > 0 ? prev - 1 : filteredVendors.length - 1);
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                if (filteredVendors[highlightedVendorIndex]) {
                                  setFieldValue('supplierName', filteredVendors[highlightedVendorIndex].vendor_name);
                                  setIsVendorDropdownOpen(false);
                                }
                              } else if (e.key === 'Escape' || e.key === 'Tab') {
                                setIsVendorDropdownOpen(false);
                              }
                            }}
                            onChange={(e) => {
                              setFieldValue('supplierName', e.target.value);
                              setIsVendorDropdownOpen(true);
                              setHighlightedVendorIndex(0);
                            }}
                            placeholder="Type or search vendor name..."
                            className={`w-full rounded border p-2 text-sm bg-white dark:bg-boxdark font-bold outline-none text-black dark:text-white ${hasAttempted && errors.supplierName ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus:border-primary'
                              }`}
                          />

                          {isVendorDropdownOpen && (
                            <div className="absolute left-0 top-full mt-1 z-[999999] w-full max-h-60 overflow-y-auto bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl divide-y divide-slate-100 dark:divide-slate-800">
                              {filteredVendors.length > 0 ? (
                                filteredVendors.map((vendor, vIdx) => (
                                  <div
                                    key={vendor.id}
                                    onMouseEnter={() => setHighlightedVendorIndex(vIdx)}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setFieldValue('supplierName', vendor.vendor_name);
                                      setIsVendorDropdownOpen(false);
                                    }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setFieldValue('supplierName', vendor.vendor_name);
                                      setIsVendorDropdownOpen(false);
                                    }}
                                    className={`p-3 cursor-pointer text-xs flex justify-between items-center transition ${highlightedVendorIndex === vIdx || values.supplierName === vendor.vendor_name
                                        ? 'bg-primary/10 text-primary font-bold'
                                        : 'hover:bg-gray-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100'
                                      }`}
                                  >
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-xs font-bold">{vendor.vendor_name}</span>
                                      {(vendor.contact_person || vendor.phone) && (
                                        <span className="text-[10px] text-slate-400">
                                          {vendor.contact_person} {vendor.phone ? `• ${vendor.phone}` : ''}
                                        </span>
                                      )}
                                    </div>
                                    {vendor.city && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
                                        {vendor.city}
                                      </span>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div className="p-3 text-center text-xs text-slate-400 italic">
                                  No matching vendors found
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {hasAttempted && errors.supplierName && (
                      <p className="text-red-500 text-[10px] font-bold mt-1">{String(errors.supplierName)}</p>
                    )}
                  </div>
                </div>

                {/* 🌟 TAX & DISCOUNT TOGGLE BAR: CLEAN & UNCLUTTERED DEFAULT UI */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-slate-50 dark:bg-meta-4/20 border border-stroke dark:border-strokedark rounded-sm">
                  <div className="flex items-center gap-6">
                    {/* Tax Invoicing Toggle (Commented out - ready to be re-enabled if client requests GST/FBR Purchase Tax) */}
                    {/*
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={values.applyTax}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setFieldValue('applyTax', isChecked);
                          if (!isChecked) {
                            values.items.forEach((_: any, idx: number) => {
                              setFieldValue(`items.${idx}.gstRate`, 0);
                              setFieldValue(`items.${idx}.gstAmt`, 0);
                            });
                          } else {
                            values.items.forEach((item: any, idx: number) => {
                              const r = 18;
                              setFieldValue(`items.${idx}.gstRate`, r);
                              const cost = (Number(item.qty) || 0) * (Number(item.rate) || 0) - (Number(item.discountAmt) || 0);
                              setFieldValue(`items.${idx}.gstAmt`, Number(((cost * r) / 100).toFixed(2)));
                            });
                          }
                        }}
                        className="w-4 h-4 text-emerald-600 rounded cursor-pointer accent-emerald-600"
                      />
                      <span className="font-bold text-xs text-black dark:text-white">Enable GST / FBR Purchase Tax</span>
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

                  <div className="flex items-center gap-2">
                    <label className={`text-[11px] font-bold whitespace-nowrap ${touched.purchaseNo && errors.purchaseNo ? 'text-red-500' : 'text-gray-500'}`}>Purchase Order Ref: *</label>
                    <input
                      type="text"
                      name="purchaseNo"
                      value={values.purchaseNo}
                      readOnly
                      className={`w-32 rounded border bg-gray-50 dark:bg-meta-4 cursor-not-allowed p-1 text-xs font-bold font-mono text-gray-500 outline-none ${
                        touched.purchaseNo && errors.purchaseNo ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                      }`}
                    />
                  </div>
                </div>

                {/* ── PRODUCT ITEM CATALOG ENTRY TABLE ── */}
                <div className="border border-stroke dark:border-strokedark rounded-sm relative z-30 overflow-x-auto pb-16">
                  <div className="w-full min-w-max">
                    <table className="w-full table-auto border-collapse text-left">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-meta-4 text-[10px] font-black uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                          <th className="p-3 w-10 text-center">S#</th>
                          <th className="p-3 w-48">Code (Search)</th>
                          <th className="p-3 min-w-[240px]">Product Description</th>
                          <th className="p-3 w-44">Destination Warehouse</th>
                          <th className="p-3 min-w-[260px] text-center">Arrived Qty (Boxes / Pcs / Sq.m)</th>
                          <th className="p-3 w-36 text-right">Cost Price (PKR)</th>
                          {values.showDiscount && (
                            <>
                              <th className="p-3 w-20 text-center text-amber-700 bg-amber-50/40 dark:bg-amber-950/20">Disc %</th>
                              <th className="p-3 w-28 text-right text-amber-700 bg-amber-50/40 dark:bg-amber-950/20">Disc Amt</th>
                            </>
                          )}
                          {values.applyTax && (
                            <>
                              <th className="p-3 w-20 text-center text-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20">GST %</th>
                              <th className="p-3 w-28 text-right text-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20">GST Amt</th>
                            </>
                          )}
                          <th className="p-3 w-36 text-right pr-4">Net Total Line</th>
                          <th className="p-3 w-10"></th>
                        </tr>
                      </thead>
                      <FieldArray name="items">
                        {({ push, remove }) => (
                          <tbody className="divide-y divide-stroke dark:divide-strokedark">
                            {values.items.map((item: any, idx: number) => {
                              const matchedProduct = productList.find(p =>
                                (item.skuCode && (p.item_sr_no === item.skuCode || `SKU-${p.id}` === item.skuCode)) ||
                                (item.itemName && String(p.product_name || '').toLowerCase() === String(item.itemName || '').toLowerCase())
                              );
                              const rawPcs = Number(matchedProduct?.pieces_per_box ?? matchedProduct?.pcs_per_box ?? matchedProduct?.pieces_per_packing ?? 0);
                              const isTile = Boolean(
                                matchedProduct && (
                                  String(matchedProduct.category || '').toLowerCase().includes('tile') ||
                                  String(matchedProduct.scenario_name || '').toLowerCase().includes('tile')
                                ) && (rawPcs > 1 || String(matchedProduct.scenario_name || '').toLowerCase().includes('tile'))
                              );
                              const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);
                              const uomString = matchedProduct ? matchedProduct.uom : 'NOS';
                              const lineTotals = calculatePurchaseLineTotals(item, values.applyTax);
                              const isCurrentActive = activeSkuIndex === idx;
                              const isCurrentProdNameActive = activeProdNameIndex === idx;

                              const handleProductSelection = (p: any) => {
                                const displaySku = p.item_sr_no || `SKU-${p.id}`;
                                const price = Number(p.purchase_price ?? p.cost_price ?? 0);
                                const updatedItems = [...values.items];
                                const cur = updatedItems[idx] || {};
                                const qty = Number(cur.qty) || 1;
                                const dPer = Number(cur.discountPer) || 0;
                                const dAmt = dPer > 0 ? Number(((price * qty * dPer) / 100).toFixed(2)) : (Number(cur.discountAmt) || 0);

                                updatedItems[idx] = {
                                  ...cur,
                                  skuCode: displaySku,
                                  itemName: p.product_name,
                                  rate: price,
                                  discountAmt: dAmt
                                };

                                setFieldValue('items', updatedItems);
                                setActiveProdNameIndex(null);
                                setActiveSkuIndex(null);
                              };

                              return (
                                <tr key={idx} className={`border-b border-stroke dark:border-strokedark text-xs transition ${isCurrentActive || isCurrentProdNameActive ? 'relative z-50 bg-slate-50/90 dark:bg-meta-4/20' : 'relative z-10 bg-white dark:bg-boxdark hover:bg-slate-50 dark:hover:bg-meta-4/10'}`}>
                                  <td className="p-3 text-center text-gray-400 font-sans">{idx + 1}</td>

                                  {/* Searchable Code */}
                                  <td className="p-3 relative sku-container">
                                    {(() => {
                                      const filteredProds = productList.filter(p => {
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
                                              setActiveProdNameIndex(null);
                                              setHighlightedSkuIndex(0);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                setHighlightedSkuIndex(prev => prev < filteredProds.length - 1 ? prev + 1 : 0);
                                              } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setHighlightedSkuIndex(prev => prev > 0 ? prev - 1 : filteredProds.length - 1);
                                              } else if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (filteredProds[highlightedSkuIndex]) {
                                                  handleProductSelection(filteredProds[highlightedSkuIndex]);
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

                                          {isCurrentActive && filteredProds.length > 0 && (
                                            <div className="absolute left-0 top-full mt-1.5 z-[99999] w-72 max-h-52 overflow-y-auto bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl divide-y divide-slate-100 dark:divide-slate-800">
                                              {filteredProds.map((prod, pIdx) => (
                                                <div
                                                  key={prod.id}
                                                  onMouseEnter={() => setHighlightedSkuIndex(pIdx)}
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleProductSelection(prod);
                                                  }}
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleProductSelection(prod);
                                                  }}
                                                  className={`p-2.5 cursor-pointer text-xs flex justify-between items-center ${highlightedSkuIndex === pIdx ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                                                >
                                                  <div>
                                                    <p className="font-bold text-black dark:text-white">{prod.product_name}</p>
                                                    <p className="text-[10px] font-mono text-gray-400">{prod.item_sr_no || `SKU-${prod.id}`}</p>
                                                  </div>
                                                  <span className="font-mono font-bold text-emerald-600">Rs. {Number(prod.purchase_price || 0).toLocaleString()}</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </td>

                                  {/* Description & Description (Searchable Two-Way Input with Rich Dropdown matching Sales page) */}
                                  <td className="p-3 relative prod-name-container min-w-[260px]">
                                    {(() => {
                                      const query = (item.itemName || '').toLowerCase().trim();
                                      const filteredByName = productList.filter(p => {
                                        if (!query) return true;
                                        const name = (p.product_name || '').toLowerCase();
                                        const sku = (p.item_sr_no || `SKU-${p.id}`).toLowerCase();
                                        return name.includes(query) || sku.includes(query);
                                      });

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
                                                setHighlightedProdNameIndex(prev => prev < filteredByName.length - 1 ? prev + 1 : 0);
                                              } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setHighlightedProdNameIndex(prev => prev > 0 ? prev - 1 : filteredByName.length - 1);
                                              } else if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (filteredByName[highlightedProdNameIndex]) {
                                                  handleProductSelection(filteredByName[highlightedProdNameIndex]);
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

                                              const matched = productList.find(
                                                p => p.product_name && p.product_name.toLowerCase() === typed.trim().toLowerCase()
                                              );
                                              if (matched) {
                                                handleProductSelection(matched);
                                              }
                                            }}
                                            placeholder="Search Description..."
                                            className="w-full bg-white dark:bg-boxdark font-bold border border-stroke dark:border-strokedark rounded p-1.5 outline-none text-xs text-black dark:text-white focus:border-primary shadow-xs"
                                          />

                                          {/* Rich Dropdown */}
                                          {isCurrentProdNameActive && filteredByName.length > 0 && (
                                            <div className="absolute left-0 top-full mt-1.5 z-[99999] min-w-[340px] max-w-[420px] max-h-[290px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300">
                                              {filteredByName.map((p, pIdx) => {
                                                const displaySku = p.item_sr_no || `SKU-${p.id}`;
                                                const isHighlighted = pIdx === highlightedProdNameIndex;
                                                return (
                                                  <div
                                                    key={p.id}
                                                    onMouseEnter={() => setHighlightedProdNameIndex(pIdx)}
                                                    onMouseDown={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      handleProductSelection(p);
                                                    }}
                                                    onClick={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      handleProductSelection(p);
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
                                                      <span className="font-mono text-[10px] text-slate-400">
                                                        {displaySku}
                                                      </span>
                                                    </div>
                                                    <div className="text-right font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                                                      Rs. {Number(p.purchase_price || 0).toLocaleString()}
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

                                  {/* ROW-LEVEL DESTINATION WAREHOUSE */}
                                  <td className="p-3 w-48">
                                    <select
                                      value={item.warehouse || locations[0]?.name || ''}
                                      onChange={(e) => {
                                        setFieldValue(`items.${idx}.warehouse`, e.target.value);
                                      }}
                                      className="w-full bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded p-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-primary shadow-xs"
                                    >
                                      {locations.map((loc) => (
                                        <option key={loc.id} value={loc.name}>
                                          {loc.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>

                                  {/* Arrived Qty with Dedicated Boxes & Loose Pieces & Sq.Mtr for Tiles */}
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
                                            {/* ── TOP BADGES: Per Box Sq.Mtr & Per Piece Sq.Mtr ── */}
                                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-1 font-mono">
                                              <span className="text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800/60 font-bold">
                                                Box: {perBoxSqm.toFixed(2)} sq.m
                                              </span>
                                              <span className="text-emerald-700 dark:emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60 font-bold">
                                                Pc: {perPieceSqm.toFixed(4)} sq.m
                                              </span>
                                            </div>

                                            {/* ── INPUTS CONTAINER: BOXES + LOOSE PIECES ── */}
                                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/90 p-1.5 rounded-lg border border-stroke dark:border-strokedark shadow-inner">
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

                                                    const cost = combinedQty * (Number(item.rate) || 0);
                                                    if (Number(item.discountPer) > 0) {
                                                      setFieldValue(`items.${idx}.discountAmt`, Number(((cost * Number(item.discountPer)) / 100).toFixed(2)));
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

                                                    // Auto carryover if loose pieces >= pcsPerBox
                                                    const extraBoxes = Math.floor(enteredLoose / pcsPerBox);
                                                    const remLoose = enteredLoose % pcsPerBox;
                                                    const finalBoxes = currentBoxes + extraBoxes;
                                                    const combinedQty = remLoose > 0
                                                      ? Number((finalBoxes + remLoose / pcsPerBox).toFixed(3))
                                                      : finalBoxes;

                                                    setFieldValue(`items.${idx}.qty`, combinedQty);

                                                    const cost = combinedQty * (Number(item.rate) || 0);
                                                    if (Number(item.discountPer) > 0) {
                                                      setFieldValue(`items.${idx}.discountAmt`, Number(((cost * Number(item.discountPer)) / 100).toFixed(2)));
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
                                        const u = String(uomString || item.uom || matchedProduct?.uom || '').trim().toUpperCase();
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
                                                  const num = parseFloat(val) || 0;
                                                  const cost = num * (Number(item.rate) || 0);
                                                  if (Number(item.discountPer) > 0) {
                                                    setFieldValue(`items.${idx}.discountAmt`, Number(((cost * Number(item.discountPer)) / 100).toFixed(2)));
                                                  }
                                                }
                                              }}
                                              placeholder="1"
                                              className="w-full bg-transparent text-center font-black text-xs text-primary outline-none"
                                            />
                                            <span className="text-[10px] font-bold text-gray-500 uppercase select-none">{uomString}</span>
                                          </div>
                                        );
                                      })()
                                    )}
                                  </td>

                                  {/* Cost Price */}
                                  <td className="p-3 w-36 min-w-[120px]">
                                    <input
                                      type="number"
                                      min="0"
                                      onKeyDown={blockInvalidChar}
                                      name={`items.${idx}.rate`}
                                      value={item.rate}
                                      onChange={(e) => {
                                        const newRate = Math.max(0, Number(e.target.value) || 0);
                                        setFieldValue(`items.${idx}.rate`, newRate);
                                        const cost = (Number(item.qty) || 0) * newRate;
                                        if (Number(item.discountPer) > 0) {
                                          setFieldValue(`items.${idx}.discountAmt`, Number(((cost * Number(item.discountPer)) / 100).toFixed(2)));
                                        }
                                      }}
                                      className="w-full rounded border border-stroke dark:border-strokedark p-1.5 bg-transparent font-black font-mono text-right outline-none focus:border-primary text-xs"
                                    />
                                    {isTile && pcsPerBox > 1 && (
                                      <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono text-right mt-1">
                                        ≈ Rs. {(Number(item.rate || 0) / pcsPerBox).toFixed(2)} / pc
                                      </div>
                                    )}
                                  </td>

                                  {/* Discount Columns */}
                                  {values.showDiscount && (
                                    <>
                                      <td className="p-3 w-24 min-w-[90px] bg-amber-50/30 dark:bg-amber-950/10">
                                        <input
                                          type="number"
                                          min="0"
                                          onKeyDown={blockInvalidChar}
                                          name={`items.${idx}.discountPer`}
                                          value={item.discountPer ?? 0}
                                          onChange={(e) => {
                                            const rawVal = e.target.value;
                                            setFieldValue(`items.${idx}.discountPer`, rawVal);
                                            const dPer = Number(rawVal);
                                            if (!isNaN(dPer) && dPer >= 0) {
                                              const gross = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                                              setFieldValue(`items.${idx}.discountAmt`, Number(((gross * dPer) / 100).toFixed(2)));
                                            }
                                          }}
                                          placeholder="0"
                                          className="w-full text-center font-bold font-mono text-amber-700 bg-white dark:bg-boxdark border border-amber-300 rounded p-1 text-xs outline-none"
                                        />
                                      </td>
                                      <td className="p-3 w-32 min-w-[110px] bg-amber-50/30 dark:bg-amber-950/10">
                                        <input
                                          type="number"
                                          min="0"
                                          onKeyDown={blockInvalidChar}
                                          name={`items.${idx}.discountAmt`}
                                          value={item.discountAmt ?? 0}
                                          onChange={(e) => {
                                            const rawVal = e.target.value;
                                            setFieldValue(`items.${idx}.discountAmt`, rawVal);
                                            const dAmt = Number(rawVal);
                                            if (!isNaN(dAmt) && dAmt >= 0) {
                                              const gross = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                                              const per = gross > 0 ? (dAmt / gross) * 100 : 0;
                                              setFieldValue(`items.${idx}.discountPer`, Number(per.toFixed(2)));
                                            }
                                          }}
                                          placeholder="0"
                                          className="w-full text-right font-bold font-mono text-amber-700 bg-white dark:bg-boxdark border border-amber-300 rounded p-1 text-xs outline-none"
                                        />
                                      </td>
                                    </>
                                  )}

                                  {/* GST Columns */}
                                  {values.applyTax && (
                                    <>
                                      <td className="p-3 w-24 min-w-[90px] bg-emerald-50/30 dark:bg-emerald-950/10">
                                        <input
                                          type="number"
                                          min="0"
                                          onKeyDown={blockInvalidChar}
                                          name={`items.${idx}.gstRate`}
                                          value={item.gstRate ?? 18}
                                          onChange={(e) => {
                                            const rawVal = e.target.value;
                                            setFieldValue(`items.${idx}.gstRate`, rawVal);
                                            const r = Number(rawVal);
                                            if (!isNaN(r) && r >= 0) {
                                              const cost = (Number(item.qty) || 0) * (Number(item.rate) || 0) - (Number(item.discountAmt) || 0);
                                              setFieldValue(`items.${idx}.gstAmt`, Number(((cost * r) / 100).toFixed(2)));
                                            }
                                          }}
                                          className="w-full text-center font-bold font-mono text-emerald-700 bg-white dark:bg-boxdark border border-emerald-300 rounded p-1 text-xs outline-none"
                                        />
                                      </td>
                                      <td className="p-3 w-32 min-w-[110px] bg-emerald-50/30 dark:bg-emerald-950/10">
                                        <input
                                          type="number"
                                          min="0"
                                          onKeyDown={blockInvalidChar}
                                          name={`items.${idx}.gstAmt`}
                                          value={item.gstAmt ?? 0}
                                          onChange={(e) => {
                                            const rawVal = e.target.value;
                                            setFieldValue(`items.${idx}.gstAmt`, rawVal);
                                          }}
                                          className="w-full text-right font-bold font-mono text-emerald-700 bg-white dark:bg-boxdark border border-emerald-300 rounded p-1 text-xs outline-none"
                                        />
                                      </td>
                                    </>
                                  )}

                                  {/* Net Line Total */}
                                  <td className="p-3 text-right pr-4 text-emerald-600 dark:text-emerald-400 font-black font-mono">
                                    Rs. {lineTotals.netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>

                                  {/* Delete Row */}
                                  <td className="p-3 text-center">
                                    {values.items.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (isEditMode && item.itemName) {
                                            // Pre-deletion stock check
                                            let qtyToReverse = Number(item.qty || 0);
                                            
                                            // Check GRN if this purchase is linked to one
                                            let grnItems = [];
                                            if (editData?.metadata?.grn_id) {
                                              const { data: gi } = await supabase.from('grn_items').select('*').eq('grn_id', editData.metadata.grn_id);
                                              if (gi) {
                                                const gItem = gi.find(g => String(g.product_name || '').toLowerCase() === String(item.itemName).toLowerCase());
                                                if (gItem) qtyToReverse = Number(gItem.accepted_qty ?? 0);
                                                else qtyToReverse = 0;
                                              }
                                            }

                                            if (qtyToReverse > 0) {
                                              const currentStock = await getAvailableStock(item.itemName, item.warehouse);
                                              if (currentStock < qtyToReverse) {
                                                toast.error(`Error: You currently only have ${currentStock} in ${item.warehouse}. Cannot delete this entry as it would cause negative stock.`, { duration: 5000 });
                                                return; // Block removal
                                              }
                                            }
                                          }
                                          remove(idx);
                                        }}
                                        className="text-gray-400 hover:text-danger transition cursor-pointer"
                                      >
                                        <FiTrash2 size={14} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        )}
                      </FieldArray>
                    </table>
                  </div>

                  <div className="p-3 bg-gray-50/50 dark:bg-meta-4/10 border-t border-stroke dark:border-strokedark">
                    <FieldArray name="items">
                      {({ push }) => (
                        <button
                          type="button"
                          onClick={() => push({ itemName: '', skuCode: '', warehouse: locations[0]?.name || '', qty: 1, rate: 0, discountPer: 0, discountAmt: 0, gstRate: 18, gstAmt: 0 })}
                          className="inline-flex items-center gap-1 bg-primary text-white font-bold py-1.5 px-3.5 rounded text-xs hover:bg-opacity-90 transition cursor-pointer shadow-xs"
                        >
                          <FiPlus size={12} /> Add Row Line
                        </button>
                      )}
                    </FieldArray>
                  </div>
                </div>

                {/* ── BOTTOM SETTLEMENT BAR: CASH / BANK / SPLIT SWITCHER ── */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-6 border border-stroke dark:border-strokedark p-5 rounded-sm bg-slate-50/40 dark:bg-meta-4/5 mt-6">

                  {/* Left: Payment Method Controls */}
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
                          } else if (e.target.value === 'Bank') {
                            setFieldValue('cashAmountPaid', 0);
                          }
                        }}
                        className="w-full border rounded border-stroke dark:border-strokedark p-2 text-xs bg-white dark:bg-boxdark font-black outline-none text-black dark:text-white focus:border-primary"
                      >
                        <option value="Cash">Cash Only</option>
                        <option value="Bank">Bank Transfer Only</option>
                        <option value="Split">Cash & Bank Combined (Split)</option>
                      </select>
                    </div>

                    {/* Bank Selection Profile */}
                    {(values.settlementMode === 'Bank' || values.settlementMode === 'Split') && (
                      <div>
                        <span className="font-bold text-gray-500 block mb-1">Corporate Source Vault Bank: *</span>
                        <select
                          name="selectedBankTitle"
                          value={values.selectedBankTitle}
                          onChange={handleChange}
                          className={`w-full border rounded p-2 text-xs bg-white dark:bg-boxdark font-bold outline-none text-black dark:text-white ${hasAttempted && errors.selectedBankTitle ? 'border-red-500 bg-red-50/10' : 'border-stroke dark:border-strokedark focus:border-primary'}`}
                        >
                          <option value="">-- Choose Corporate Bank --</option>
                          {bankAccountsList.map(b => (
                            <option key={b.id} value={b.bankName}>{b.bankName} - {b.accountTitle} ({b.accountNumber || '-'})</option>
                          ))}
                        </select>
                        {hasAttempted && errors.selectedBankTitle && <p className="text-red-500 text-[10px] font-bold mt-1">{String(errors.selectedBankTitle)}</p>}
                      </div>
                    )}

                    {/* Amount Inputs */}
                    <div className={values.settlementMode === 'Split' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'w-full'}>
                      {(values.settlementMode === 'Cash' || values.settlementMode === 'Split') && (
                        <div>
                          <span className="font-bold text-rose-600 block mb-1">Cash Payment Amount (PKR):</span>
                          <input
                            type="number"
                            min="0"
                            onKeyDown={blockInvalidChar}
                            name="cashAmountPaid"
                            value={values.cashAmountPaid === 0 ? '' : values.cashAmountPaid}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFieldValue('cashAmountPaid', val === '' ? 0 : Math.max(0, Number(val) || 0));
                            }}
                            placeholder="0"
                            className="w-full rounded border border-stroke dark:border-strokedark p-2 bg-white dark:bg-boxdark text-right font-black font-mono text-rose-600 text-sm outline-none focus:border-primary"
                          />
                        </div>
                      )}

                      {(values.settlementMode === 'Bank' || values.settlementMode === 'Split') && (
                        <div>
                          <span className="font-bold text-primary block mb-1">Bank Payment Amount (PKR):</span>
                          <input
                            type="number"
                            min="0"
                            onKeyDown={blockInvalidChar}
                            name="bankAmountPaid"
                            value={values.bankAmountPaid === 0 ? '' : values.bankAmountPaid}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFieldValue('bankAmountPaid', val === '' ? 0 : Math.max(0, Number(val) || 0));
                            }}
                            placeholder="0"
                            className="w-full rounded border border-stroke dark:border-strokedark p-2 bg-white dark:bg-boxdark text-right font-black font-mono text-primary text-sm outline-none focus:border-primary"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="font-bold text-gray-500 block mb-1">Remarks:</span>
                      <input
                        type="text"
                        name="remarks"
                        value={values.remarks}
                        onChange={handleChange}
                        placeholder="e.g. Factory restock shipment, consignment bill #889"
                        className="w-full border border-stroke dark:border-strokedark rounded p-2 text-xs bg-white dark:bg-boxdark outline-none focus:border-primary font-medium"
                      />
                    </div>
                  </div>

                  {/* Right: Net Summary & Action Buttons */}
                  <div className="w-full md:w-1/2 flex flex-col justify-between self-stretch bg-white dark:bg-boxdark p-5 rounded-xl border border-stroke dark:border-strokedark shadow-xs">
                    <div className="space-y-3 font-mono">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 font-sans font-bold">Total Bill Value:</span>
                        <strong className="text-black dark:text-white font-black text-base">
                          Rs. {totalBillAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      {values.showAdditionalCharges && (
                        <div className="flex justify-between items-center text-sm text-blue-600 dark:text-blue-400">
                          <span className="font-sans font-bold text-xs">Freight Charges:</span>
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

                      <div className="flex justify-between items-center text-sm text-emerald-600">
                        <span className="font-sans font-bold">Paid Upfront:</span>
                        <strong className="font-black text-base">
                          Rs. {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center text-sm text-rose-600 pt-2 border-t border-stroke dark:border-strokedark">
                        <span className="font-sans font-bold">Remaining Vendor Payable:</span>
                        <strong className="font-black text-base">
                          Rs. {remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      {totalPaid > totalBillAmount + 0.01 && (
                        <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700">
                          <span className="text-[11px] font-black text-red-600 dark:text-red-400">
                            ⚠ Overpayment of Rs. {(totalPaid - totalBillAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} — Cannot save!
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 mt-6 pt-4 border-t border-stroke dark:border-strokedark">
                      <button
                        type="button"
                        onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchases/List`)}
                        className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSubmitAction('print');
                          setHasAttempted(true);
                          submitForm();
                        }}
                        disabled={loading}
                        className="rounded-xl bg-teal-600 hover:bg-teal-700 py-3 px-6 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                      >
                        <FiPrinter size={15} /> <span>Save & Print</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSubmitAction('save');
                          setHasAttempted(true);
                          submitForm();
                        }}
                        disabled={loading}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                      >
                        {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <><FiCheckCircle size={15} /> <span>{isEditMode ? 'Update Purchase' : 'Save & Restock'}</span></>}
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

export default AddPurchases;
