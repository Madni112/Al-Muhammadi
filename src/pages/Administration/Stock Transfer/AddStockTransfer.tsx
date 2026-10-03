import React, { useState, useEffect, useRef } from 'react';
import { getAvailableStock, fetchStockDataset } from '../../../utils/stockCalculator';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';

const AddStockTransfer = () => {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [locations, setLocations] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [stockDataset, setStockDataset] = useState<any>(null);
  const [openDropdownRowIndex, setOpenDropdownRowIndex] = useState<number | null>(null);
  const [activeDropdownType, setActiveDropdownType] = useState<'name' | 'code' | null>(null);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const dropdownScrollRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const navigate = useNavigate();

  const editData = location.state?.transfer;
  const isEditMode = !!editData;

  const formInitialValues = React.useMemo(() => {
    return isEditMode ? {
      transferNo: editData.transfer_no || '',
      fromLocation: editData.from_location || '',
      toLocation: editData.to_location || '',
      transferDate: editData.transfer_date || '',
      status: editData.status || 'Confirm',
      remarks: editData.remarks || '',
      items: (editData.items || []).map((item: any) => ({
        itemName: item.itemName || '',
        itemCode: item.itemCode || '',
        qty: item.qty || 1,
        uom: item.uom || 'Nos',
        availableQty: item.availableQty || 0
      }))
    } : {
      transferNo: `TRF-${Date.now().toString().slice(-6)}`,
      fromLocation: '',
      toLocation: '',
      transferDate: new Date().toISOString().split('T')[0],
      status: 'Confirm',
      remarks: '',
      items: [{ itemName: '', itemCode: '', qty: 1, uom: 'Nos', availableQty: 0 }]
    };
  }, [isEditMode, editData]);

  useEffect(() => {
    const fetchTransferMetadata = async () => {
      try {
        setMetadataLoading(true);
        const { data: locData } = await supabase.from('inventory_locations').select('id, name').order('name', { ascending: true });
        const { data: prodData } = await supabase.from('products').select('id, product_name, item_sr_no, current_stock, uom');

        if (locData) setLocations(locData);
        if (prodData) setProductList(prodData);

        // Load the stock ledger snapshot once (reused for every row's availability check)
        fetchStockDataset().then(setStockDataset).catch(() => setStockDataset(null));
      } catch (err: any) {
        toast.error('Failed to load system metadata setup list vectors');
      } finally {
        setMetadataLoading(false);
      }
    };
    fetchTransferMetadata();
  }, []);

  const handleProductSelectionWithWarehouseBalance = async (selectedName: string, index: number, sourceWarehouse: string, setFieldValue: any) => {
    if (!selectedName) {
      setFieldValue(`items.${index}.availableQty`, 0);
      return;
    }

    if (!sourceWarehouse) {
      setFieldValue(`items.${index}.availableQty`, 0);
      return;
    }

    try {
      const available = await getAvailableStock(selectedName, sourceWarehouse, stockDataset);
      setFieldValue(`items.${index}.availableQty`, available);
    } catch (err: any) {
      console.error(err.message);
      setFieldValue(`items.${index}.availableQty`, 0);
    }
  };

  const validationSchema = Yup.object().shape({
    fromLocation: Yup.string().required('Source location is mandatory'),
    toLocation: Yup.string().required('Destination location is mandatory')
      .notOneOf([Yup.ref('fromLocation')], 'Source and Destination warehouses cannot be identical!'),
    transferDate: Yup.string().required('Required'),
    items: Yup.array().of(
      Yup.object().shape({
        itemName: Yup.string().required('Required'),
        qty: Yup.number().typeError('Numeric values only').min(1, 'Min 1').required('Required')
      })
    ).min(1, 'Please add at least one stock row line item')
  });

  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
    ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

  // Keep the highlighted option visible while using the arrow keys
  const queueDropdownScroll = (next: number) => {
    setTimeout(() => {
      const box = dropdownScrollRef.current;
      if (!box) return;
      const el = box.querySelector(`[data-opt="${next}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, 0);
  };

  // Same picker behaviour as the Opening Stock page:
  // focus shows the list (no typing needed), highest stock first, code shown under the name.
  const normText = (v: any) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const productOptions = (queryRaw: string) => {
    const q = normText(queryRaw);
    const base = q
      ? productList.filter((p: any) =>
          normText(p.product_name).includes(q) ||
          normText(p.item_sr_no).includes(q)
        )
      : productList.slice();

    return base
      .slice()
      .sort((a: any, b: any) =>
        (Number(b.current_stock) || 0) - (Number(a.current_stock) || 0) ||
        String(a.product_name || '').localeCompare(String(b.product_name || ''))
      )
      .slice(0, 60);
  };

  const isExactProductName = (name: string) =>
    productList.some((p: any) => p.product_name === name);

  if (metadataLoading) return <div className="flex h-48 items-center justify-center"><Spinner /></div>;
  return (
    <div className="mx-auto max-w-6xl text-xs text-black dark:text-bodydark">
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">

        <div className="border-b border-stroke py-4 px-6.5 dark:border-stroke dark:border-strokedark flex justify-between items-center">
          <h3 className="font-semibold text-black dark:text-white text-base">
            {isEditMode ? `View Transfer Slip: ${editData.transfer_no}` : 'Initialize Multi-Warehouse Stock Transfer'}
          </h3>
          <button type="button" onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Administration/StockTransfer/List`)} className="text-sm font-medium text-primary hover:underline">
            Back to History
          </button>
        </div>


        <Formik
          initialValues={formInitialValues}
          enableReinitialize={true}
          validationSchema={validationSchema}
          onSubmit={async (values) => {
            if (isEditMode && editData.status === 'Confirm') {
              toast.error('Confirmed transfer slips cannot be re-modified or adjusted to prevent accounting lines mismatch fraud.');
              return;
            }

            try {
              setLoading(true);

              // Block duplicates: same product in more than one row
              const seen: Record<string, number> = {};
              for (let i = 0; i < values.items.length; i++) {
                const key = String(values.items[i].itemName || '').trim().toLowerCase();
                if (!key) continue;
                if (seen[key] !== undefined) {
                  toast.error(`Cannot save — "${values.items[i].itemName}" is added in both row ${seen[key] + 1} and row ${i + 1}. Please remove the duplicate line.`);
                  setLoading(false);
                  return;
                }
                seen[key] = i;
              }

              // Validate available stock using formula (same as ProductList breakdown)
              for (const item of values.items) {
                const available = await getAvailableStock(item.itemName, values.fromLocation, stockDataset);
                if (available < Number(item.qty)) {
                  toast.error(`Insufficient Balance: "${item.itemName}" only has ${available} items left in "${values.fromLocation}" warehouse.`);
                  setLoading(false);
                  return;
                }
              }

              // warehouse_inventory retired — stock_transfers table is the source of truth for transfers

              const databasePayload = {
                transfer_no: values.transferNo,
                from_location: values.fromLocation,
                to_location: values.toLocation,
                transfer_date: values.transferDate,
                status: 'Confirm',
                remarks: (values.remarks || '').trim(),
                items: values.items
              };


              const { error } = isEditMode
                ? await supabase.from('stock_transfers').update(databasePayload).eq('id', editData.id)
                : await supabase.from('stock_transfers').insert([databasePayload]);

              if (error) throw error;
              toast.success('Internal stock distribution movement transaction saved successfully!');
              navigate(`${tenantId ? `/${tenantId}` : ''}/Administration/StockTransfer/List`);
            } catch (err: any) {

              toast.error('Transaction Failed: ' + err.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {({ handleChange, values, errors, touched, setFieldValue }) => (
            <Form className="p-6.5 space-y-6">

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">Transfer Document #:</label>
                  <input type="text" name="transferNo" readOnly value={values.transferNo} className="w-full border border-stroke dark:border-strokedark rounded p-2 bg-gray-50 dark:bg-meta-4/10 font-bold font-mono text-primary outline-none" />
                </div>
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">Source Warehouse (From): *</label>
                  <select
                    name="fromLocation"
                    disabled={isEditMode}
                    value={values.fromLocation}
                    onChange={async (e) => {
                      const selectedWH = e.target.value;
                      setFieldValue('fromLocation', selectedWH);
                      if (values.items && values.items.length > 0) {
                        for (let idx = 0; idx < values.items.length; idx++) {
                          const rowItem = values.items[idx];
                          if (rowItem.itemName) {
                            if (!selectedWH) {
                              setFieldValue(`items.${idx}.availableQty`, 0);
                            } else {
                              const available = await getAvailableStock(rowItem.itemName, selectedWH, stockDataset);
                              setFieldValue(`items.${idx}.availableQty`, available);
                            }
                          }
                        }
                      }
                    }}
                    className={`w-full rounded border p-2 bg-transparent outline-none text-black dark:text-white font-semibold focus:border-primary ${touched.fromLocation && errors.fromLocation ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}
                  >
                    <option value="" className="bg-white dark:bg-boxdark font-semibold text-black dark:text-white text-xs py-1">Select Departure Point</option>
                    {locations.map(l => (
                      <option 
                        key={l.id} 
                        value={l.name} 
                        disabled={values.toLocation === l.name}
                        className={`bg-white dark:bg-boxdark font-semibold text-xs py-1 ${values.toLocation === l.name ? 'text-red-400 dark:text-red-500 bg-red-50 dark:bg-red-900/10' : 'text-black dark:text-white'}`}
                      >
                        {l.name} {values.toLocation === l.name ? '(Selected in Destination)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">Destination Warehouse (To): *</label>
                  <select name="toLocation" disabled={isEditMode} onChange={handleChange} value={values.toLocation} className={`w-full rounded border p-2 bg-transparent outline-none text-black dark:text-white font-semibold focus:border-primary ${touched.toLocation && errors.toLocation ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}>
                    <option value="" className="bg-white dark:bg-boxdark font-semibold text-black dark:text-white text-xs py-1">Select Receiving Destination</option>
                    {locations.map(l => (
                      <option 
                        key={l.id} 
                        value={l.name} 
                        disabled={values.fromLocation === l.name}
                        className={`bg-white dark:bg-boxdark font-semibold text-xs py-1 ${values.fromLocation === l.name ? 'text-red-400 dark:text-red-500 bg-red-50 dark:bg-red-900/10' : 'text-black dark:text-white'}`}
                      >
                        {l.name} {values.fromLocation === l.name ? '(Selected in Source)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">Transfer Date: *</label>
                  <input type="date" name="transferDate" disabled={isEditMode} onChange={handleChange} value={values.transferDate} className="w-full border border-stroke dark:border-strokedark rounded p-2 bg-transparent outline-none font-bold text-black dark:text-white focus:border-primary" />
                </div>
              </div>

              <div className="border border-stroke dark:border-strokedark rounded p-4">
                <h4 className="font-bold text-primary text-xs uppercase tracking-wide mb-3">Transferred Product Lines Matrix</h4>

                <table className="w-full border-collapse border border-stroke dark:border-strokedark text-center">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-meta-4 font-bold text-black dark:text-white text-xs uppercase border-b border-stroke dark:border-strokedark">
                      <th className="p-2 border border-stroke dark:border-strokedark w-12">S#</th>
                      <th className="p-2 border border-stroke dark:border-strokedark text-left">Product (Name / Code)</th>
                      <th className="p-2 border border-stroke dark:border-strokedark w-36">Live Available WH Bal</th>
                      <th className="p-2 border border-stroke dark:border-strokedark w-28">UOM</th>
                      <th className="p-2 border border-stroke dark:border-strokedark w-32">Transfer Qty</th>
                      <th className="p-2 border border-stroke dark:border-strokedark w-12"></th>
                    </tr>
                  </thead>
                  <FieldArray name="items">
                    {({ push, remove }) => (
                      <tbody>
                        {values.items.map((item: any, index: number) => {
                          const matchedProdObject = productList.find(p => p.product_name === item.itemName);
                          const currentUomString = matchedProdObject ? matchedProdObject.uom : 'Nos';

                          // Duplicate product detection by Item Code / SKU (case-insensitive, trimmed)
                          const rowProductKey = String(item.itemCode || item.productId || item.itemName || '').trim().toLowerCase();
                          const isDuplicateRow = !!rowProductKey && (values.items || []).some(
                            (x: any, j: number) => j !== index && String(x.itemCode || x.productId || x.itemName || '').trim().toLowerCase() === rowProductKey
                          );
                          const firstDupRowIndex = isDuplicateRow
                            ? (values.items || []).findIndex(
                                (x: any, j: number) => j !== index && String(x.itemCode || x.productId || x.itemName || '').trim().toLowerCase() === rowProductKey
                              )
                            : -1;
                          const dupInputBorder = isDuplicateRow ? ' border-rose-500' : '';

                          return (
                            <tr key={index} className="bg-white dark:bg-boxdark text-xs border-b border-stroke dark:border-strokedark text-black dark:text-white">
                              <td className="p-2 border border-stroke dark:border-strokedark font-medium">{index + 1}</td>
                              {/* Legacy code cell kept hidden — code now shows under the product name */}
                              <td className="hidden">
                                <div className="relative">
                                  <input
                                    type="text"
                                    disabled={isEditMode}
                                    name={`items.${index}.itemCode`}
                                    value={item.itemCode || matchedProdObject?.item_sr_no || ''}
                                    autoComplete="new-password"
                                    onChange={(e) => {
                                      setFieldValue(`items.${index}.itemCode`, e.target.value);
                                      setOpenDropdownRowIndex(index);
                                      setActiveDropdownType('code');
                                      setHighlightedProductIndex(0);
                                    }}
                                    onFocus={() => {
                                      if (!isEditMode) {
                                        setOpenDropdownRowIndex(index);
                                        setActiveDropdownType('code');
                                        setHighlightedProductIndex(0);
                                      }
                                    }}
                                    onBlur={() => {
                                      setTimeout(() => {
                                        if (activeDropdownType === 'code') setOpenDropdownRowIndex(null);
                                      }, 200);
                                    }}
                                    onKeyDown={(e) => {
                                      const filteredProducts = productOptions(item.itemCode);
                                      
                                      if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        if (filteredProducts.length === 0) return;
                                        setHighlightedProductIndex((prev) => {
                                          const next = prev < filteredProducts.length - 1 ? prev + 1 : 0;
                                          queueDropdownScroll(next);
                                          return next;
                                        });
                                      } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        if (filteredProducts.length === 0) return;
                                        setHighlightedProductIndex((prev) => {
                                          const next = prev > 0 ? prev - 1 : filteredProducts.length - 1;
                                          queueDropdownScroll(next);
                                          return next;
                                        });
                                      } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (filteredProducts.length > 0) {
                                          const selectedObj = filteredProducts[highlightedProductIndex] || filteredProducts[0];
                                          
                                          const updatedItems = [...values.items];
                                          updatedItems[index] = {
                                            ...updatedItems[index],
                                            itemName: selectedObj.product_name,
                                            itemCode: selectedObj.item_sr_no,
                                            uom: selectedObj.uom || 'Nos'
                                          };
                                          setFieldValue('items', updatedItems);
                                          
                                          handleProductSelectionWithWarehouseBalance(selectedObj.product_name, index, values.fromLocation, setFieldValue);
                                          setOpenDropdownRowIndex(null);
                                        }
                                      } else if (e.key === 'Tab' || e.key === 'Escape') {
                                        setOpenDropdownRowIndex(null);
                                      }
                                    }}
                                    className={`w-full rounded border p-2 bg-transparent outline-none focus:border-primary font-bold text-black dark:text-white border-stroke dark:border-strokedark text-left font-mono${dupInputBorder}`}
                                    placeholder="Search Code..."
                                  />
                                  {openDropdownRowIndex === index && activeDropdownType === 'code' && (
                                    <div ref={dropdownScrollRef} className="absolute left-0 top-full mt-1 z-[99999] w-full min-w-[250px] max-h-64 overflow-y-auto rounded-lg border border-stroke dark:border-strokedark bg-white dark:bg-boxdark shadow-xl divide-y divide-stroke dark:divide-strokedark text-left">
                                      {(() => {
                                        const filteredProducts = productOptions(item.itemCode);
                                        
                                        return filteredProducts.length > 0 ? (
                                          filteredProducts.map((p, idx) => {
                                            const isHighlighted = idx === highlightedProductIndex;
                                            return (
                                              <div
                                                key={p.id}
                                                data-opt={idx}
                                                onMouseEnter={() => setHighlightedProductIndex(idx)}
                                                onMouseDown={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  
                                                  const updatedItems = [...values.items];
                                                  updatedItems[index] = {
                                                    ...updatedItems[index],
                                                    itemName: p.product_name,
                                                    itemCode: p.item_sr_no,
                                                    uom: p.uom || 'Nos'
                                                  };
                                                  setFieldValue('items', updatedItems);
                                                  
                                                  handleProductSelectionWithWarehouseBalance(p.product_name, index, values.fromLocation, setFieldValue);
                                                  setOpenDropdownRowIndex(null);
                                                }}
                                                className={`p-2.5 cursor-pointer transition text-xs font-semibold text-black dark:text-white flex flex-col gap-0.5 ${
                                                  isHighlighted 
                                                    ? 'bg-primary/10 border-l-4 border-primary' 
                                                    : 'hover:bg-gray-100 dark:hover:bg-meta-4'
                                                }`}
                                              >
                                                <span className={isHighlighted ? 'text-primary font-mono' : 'font-mono'}>{p.item_sr_no || 'N/A'}</span>
                                                <span className="text-[10px] text-slate-500">{p.product_name}</span>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <div className="p-4 text-center text-xs text-gray-400 italic">
                                            No matching codes found.
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-2 border border-stroke dark:border-strokedark">
                                <div className="relative">
                                  <input
                                    type="text"
                                    disabled={isEditMode}
                                    name={`items.${index}.itemName`}
                                    value={item.itemName}
                                    autoComplete="new-password"
                                    onChange={(e) => {
                                      const typed = e.target.value;
                                      const updated = [...values.items];
                                      updated[index] = { ...updated[index], itemName: typed, itemCode: '' };
                                      setFieldValue('items', updated);
                                      setOpenDropdownRowIndex(index);
                                      setActiveDropdownType('name');
                                      setHighlightedProductIndex(0);
                                    }}
                                    onFocus={() => {
                                      if (!isEditMode) {
                                        setOpenDropdownRowIndex(index);
                                        setActiveDropdownType('name');
                                        setHighlightedProductIndex(0);
                                      }
                                    }}
                                    onBlur={() => {
                                      setTimeout(() => {
                                        if (activeDropdownType === 'name') setOpenDropdownRowIndex(null);
                                      }, 200);
                                    }}
                                    onKeyDown={(e) => {
                                      const filteredProducts = productOptions(
                                        isExactProductName(item.itemName) ? '' : item.itemName
                                      );
                                      
                                      if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        if (filteredProducts.length === 0) return;
                                        setHighlightedProductIndex((prev) => {
                                          const next = prev < filteredProducts.length - 1 ? prev + 1 : 0;
                                          queueDropdownScroll(next);
                                          return next;
                                        });
                                      } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        if (filteredProducts.length === 0) return;
                                        setHighlightedProductIndex((prev) => {
                                          const next = prev > 0 ? prev - 1 : filteredProducts.length - 1;
                                          queueDropdownScroll(next);
                                          return next;
                                        });
                                      } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (filteredProducts.length > 0) {
                                          const selectedObj = filteredProducts[highlightedProductIndex] || filteredProducts[0];
                                          
                                          const updatedItems = [...values.items];
                                          updatedItems[index] = {
                                            ...updatedItems[index],
                                            itemName: selectedObj.product_name,
                                            itemCode: selectedObj.item_sr_no,
                                            uom: selectedObj.uom || 'Nos'
                                          };
                                          setFieldValue('items', updatedItems);
                                          
                                          handleProductSelectionWithWarehouseBalance(selectedObj.product_name, index, values.fromLocation, setFieldValue);
                                          setOpenDropdownRowIndex(null);
                                        }
                                      } else if (e.key === 'Tab' || e.key === 'Escape') {
                                        setOpenDropdownRowIndex(null);
                                      }
                                    }}
                                    className={`w-full rounded border p-2 bg-transparent outline-none focus:border-primary font-bold text-black dark:text-white border-stroke dark:border-strokedark text-left${dupInputBorder}`}
                                    placeholder="Search name or code..."
                                  />
                                  {isDuplicateRow && (
                                    <p className="text-rose-500 text-[10px] mt-1 font-bold">
                                      Duplicate product — already added in row {firstDupRowIndex + 1}. Remove it from one of these rows.
                                    </p>
                                  )}
                                  {item.itemCode && (
                                    <span className="block mt-1 text-[10px] font-mono font-bold text-primary dark:text-blue-400 text-left">
                                      Code: {item.itemCode}
                                    </span>
                                  )}
                                  {openDropdownRowIndex === index && activeDropdownType === 'name' && (
                                    <div ref={dropdownScrollRef} className="absolute left-0 top-full mt-1 z-[99999] w-full min-w-[300px] max-h-64 overflow-y-auto rounded-lg border border-stroke dark:border-strokedark bg-white dark:bg-boxdark shadow-xl divide-y divide-stroke dark:divide-strokedark text-left">
                                      {(() => {
                                        const filteredProducts = productOptions(
                                          isExactProductName(item.itemName) ? '' : item.itemName
                                        );
                                        
                                        return filteredProducts.length > 0 ? (
                                          filteredProducts.map((p, idx) => {
                                            const pName = p.product_name;
                                            const isHighlighted = idx === highlightedProductIndex;
                                            return (
                                              <div
                                                key={pName}
                                                data-opt={idx}
                                                onMouseEnter={() => setHighlightedProductIndex(idx)}
                                                onMouseDown={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  
                                                  const updatedItems = [...values.items];
                                                  updatedItems[index] = {
                                                    ...updatedItems[index],
                                                    itemName: pName,
                                                    itemCode: p.item_sr_no,
                                                    uom: p.uom || 'Nos'
                                                  };
                                                  setFieldValue('items', updatedItems);
                                                  
                                                  handleProductSelectionWithWarehouseBalance(pName, index, values.fromLocation, setFieldValue);
                                                  setOpenDropdownRowIndex(null);
                                                }}
                                                className={`p-2.5 cursor-pointer transition text-xs font-semibold text-black dark:text-white flex flex-col gap-0.5 ${
                                                  isHighlighted 
                                                    ? 'bg-primary/10 border-l-4 border-primary' 
                                                    : 'hover:bg-gray-100 dark:hover:bg-meta-4'
                                                }`}
                                              >
                                                <span className={isHighlighted ? 'text-primary' : ''}>{pName}</span>
                                                {p.item_sr_no && (
                                                  <span className="text-[10px] font-mono text-slate-500">Code: {p.item_sr_no}</span>
                                                )}
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <div className="p-4 text-center text-xs text-gray-400 italic">
                                            No matching products found.
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-2 border border-stroke dark:border-strokedark font-bold text-success font-mono text-center w-36 text-sm">
                                {Number(item.availableQty || 0).toLocaleString()}
                              </td>
                              <td className="p-2 border border-stroke dark:border-strokedark text-gray-400 font-semibold w-28 uppercase">{currentUomString}</td>
                              <td className="p-2 border border-stroke dark:border-strokedark w-32">
                                <input
                                  type="number"
                                  name={`items.${index}.qty`}
                                  disabled={isEditMode}
                                  onKeyDown={blockInvalidChar}
                                  onChange={handleChange}
                                  value={item.qty}
                                  className="w-full text-center outline-none border border-stroke rounded p-1 font-bold text-black dark:text-white bg-transparent focus:border-primary dark:border-strokedark"
                                />
                              </td>
                              <td className="p-2 border border-stroke dark:border-strokedark text-center w-12">
                                {!isEditMode && values.items.length > 1 && (
                                  <button type="button" onClick={() => remove(index)} className="text-red-500 font-bold hover:scale-110 duration-100 cursor-pointer">✕</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {!isEditMode && (
                          <tr>
                            <td colSpan={6} className="p-2 text-left bg-gray-50/10">
                              <button type="button" onClick={() => push({ itemName: '', qty: 1, uom: 'Nos', availableQty: 0 })} className="text-success font-bold hover:underline cursor-pointer">+ Append Item Row</button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    )}
                  </FieldArray>
                </table>
              </div>

              <div>
                <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">Transaction Remarks / Internal Tracking Notes:</label>
                <input type="text" name="remarks" disabled={isEditMode} onChange={handleChange} value={values.remarks} className="w-full border border-stroke dark:border-strokedark rounded p-2.5 bg-transparent outline-none focus:border-primary text-black dark:text-white" placeholder="Enter reason description details..." />
              </div>


              {/* ✅ MODIFIED RIGHT-ALIGNED BUTTON ROW CONTAINER */}
              <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-stroke dark:border-strokedark">
                <button
                  type="button"
                  onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Administration/StockTransfer/List`)}
                  className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                >
                  {isEditMode ? 'Close View' : 'Cancel'}
                </button>
                {!isEditMode && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>Dispatch Stock</span>}
                  </button>
                )}
              </div>

            </Form>
          )}
        </Formik>


      </div>
    </div>
  );
};

export default AddStockTransfer;
