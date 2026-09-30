import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { useAuth } from '../../../Context/Auth';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';

const todayStr = () => new Date().toISOString().split('T')[0];

const AddOpeningStock = () => {
    const { userName, userEmail } = useAuth();
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [showSkuDropdown, setShowSkuDropdown] = useState(false);
    const [highlightedSkuIndex, setHighlightedSkuIndex] = useState<number>(0);
    const skuDropdownRef = useRef<HTMLDivElement>(null);
    const productDropdownScrollRef = useRef<HTMLDivElement>(null);
    const productInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Multi-row product picker state
    const [openProductRow, setOpenProductRow] = useState<number | null>(null);
    const [highlightedProductIndex, setHighlightedProductIndex] = useState<number>(0);

    const location = useLocation();
    const navigate = useNavigate();

    const editData = location.state?.stock;
    const isEditMode = !!editData;

    // Batch edit: list page sends every line sharing one Stock No
    const stockBatch = Array.isArray(location.state?.stockBatch) ? location.state.stockBatch : null;
    const isBatchEdit = !!stockBatch && stockBatch.length > 0;
    const batchStockNo = isBatchEdit ? String(stockBatch[0].stockNo || stockBatch[0].stock_no || '') : '';

    const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
        ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

    useEffect(() => {
        const fetchMetadata = async () => {
            try {
                const { data: locData } = await supabase.from('inventory_locations').select('*');
                if (locData) setLocations(locData);

                const { data: prodData } = await supabase.from('products').select('id, product_name, purchase_price, retail_price, mrp, item_sr_no, uom, current_stock');
                if (prodData) setProducts(prodData);
            } catch (err: any) {
                console.error('Metadata fetch error:', err.message);
            }
        };
        fetchMetadata();

        // Close SKU dropdown when clicking outside (used by edit-mode single form)
        const handleClickOutside = (event: MouseEvent) => {
            if (skuDropdownRef.current && !skuDropdownRef.current.contains(event.target as Node)) {
                setShowSkuDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const generateUniqueStockNo = () => {
        const timestamp = Date.now().toString().slice(-6);
        const randomCode = Math.floor(1000 + Math.random() * 9000);
        return `STK-${timestamp}-${randomCode}`;
    };

    // Keep the highlighted option in view while navigating with arrow keys
    const queueProductScroll = (next: number) => {
        setTimeout(() => {
            const box = productDropdownScrollRef.current;
            if (!box) return;
            const el = box.querySelector(`[data-opt="${next}"]`) as HTMLElement | null;
            if (el) el.scrollIntoView({ block: 'nearest' });
        }, 0);
    };

    const emptyItemRow = () => ({
        itemCode: '',
        itemName: '',
        qty: 1,
        purchasePrice: 0,
        expiryDate: ''
    });

    const fmtMoney = (val: number) =>
        val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ------------------------------------------------------------
    // MULTI-ROW (Add mode): shared Location + Opening Date header,
    // then one product line per opening stock record.
    // ------------------------------------------------------------
    const multiInitialValues = {
        location: '',
        openingDate: todayStr(),
        batchNumber: '',
        items: [emptyItemRow()]
    };

    const multiValidationSchema = Yup.object().shape({
        location: Yup.string().required('Warehouse is required'),
        openingDate: Yup.string().required('Required'),
        batchNumber: Yup.string().required('Required'),
        items: Yup.array().of(
            Yup.object().shape({
                itemName: Yup.string().required('Select a product'),
                qty: Yup.number().typeError('Number only').min(1, 'Min 1').required('Required'),
                purchasePrice: Yup.number().typeError('Number only').min(0, 'Min 0').required('Required'),
                expiryDate: Yup.string().nullable()
            })
        ).min(1, 'Add at least one product row')
    });

    // Add (positive) or remove (negative) stock on products.current_stock for a product name
    const updateProductStock = async (nameKey: string, delta: number) => {
        if (!nameKey || delta === 0) return;
        const { data: prod } = await supabase
            .from('products')
            .select('id, current_stock')
            .ilike('product_name', nameKey)
            .maybeSingle();

        if (prod) {
            const next = Math.max(0, (Number(prod.current_stock) || 0) + delta);
            await supabase.from('products').update({ current_stock: next }).eq('id', prod.id);
        }
    };

    // Guard: throw a friendly error message when any product repeats across rows
    const assertNoDuplicateRows = (rows: any[]): string | null => {
        const seen: Record<string, number> = {};
        for (let i = 0; i < rows.length; i++) {
            const key = String(rows[i].itemName || '').trim().toLowerCase();
            if (seen[key] !== undefined) {
                return `Cannot save — "${rows[i].itemName}" is added in both row ${seen[key] + 1} and row ${i + 1}. Please remove the duplicate line.`;
            }
            seen[key] = i;
        }
        return null;
    };

    const buildPayloads = (rows: any[], stockNoValue: string, header: any) =>
        rows.map((r: any) => {
            const unitCost = Number(r.purchasePrice) || 0;
            const quantity = Number(r.qty) || 0;
            const totalValuation = quantity * unitCost;
            return {
                stock_no: stockNoValue,
                stockno: stockNoValue,
                item_code: r.itemCode || '',
                product_name: r.itemName,
                batch_number: header.batchNumber,
                location: header.location,
                qty: quantity,
                quantity: quantity,
                purchase_price: unitCost,
                rate: unitCost,
                amount: totalValuation,
                total_amount: totalValuation,
                opening_date: header.openingDate,
                expiry_date: r.expiryDate ? r.expiryDate : null
            };
        });

    // Aggregate per-product quantity across rows for current_stock updates
    const aggregateByProduct = (rows: any[]): Record<string, number> => {
        const map: Record<string, number> = {};
        rows.forEach((r: any) => {
            const key = String(r.itemName || '').trim().toLowerCase();
            if (key) map[key] = (map[key] || 0) + (Number(r.qty) || 0);
        });
        return map;
    };

    const handleMultiSubmit = async (values: any) => {
        setLoading(true);
        try {
            const rows = (values.items || []).filter((r: any) => r.itemName);
            if (rows.length === 0) {
                toast.error('Add at least one product row.');
                return;
            }

            const dupError = assertNoDuplicateRows(rows);
            if (dupError) {
                toast.error(dupError);
                return;
            }

            const sharedStockNo = generateUniqueStockNo();
            const payloads = buildPayloads(rows, sharedStockNo, values);

            const { error: stockError } = await supabase.from('opening_stocks').insert(payloads);
            if (stockError) throw stockError;

            // Increase products.current_stock once per distinct product (aggregated qty)
            for (const [nameKey, totalQty] of Object.entries(aggregateByProduct(rows))) {
                await updateProductStock(nameKey, totalQty);
            }

            // Record in audit_logs
            try {
                const totalUnits = rows.reduce((sum: number, r: any) => sum + (Number(r.qty) || 0), 0);
                await supabase.from('audit_logs').insert({
                    action_type: 'INSERT',
                    table_name: 'opening_stocks',
                    performed_by: userName || userEmail || 'Warehouse Manager',
                    details: {
                        stock_no: sharedStockNo,
                        batch_number: values.batchNumber || '001',
                        location: values.location,
                        opening_date: values.openingDate,
                        items_count: rows.length,
                        total_quantity: totalUnits,
                        products: rows.slice(0, 10).map((r: any) => `${r.itemName} (${r.qty} Units)`),
                    },
                });
            } catch (auditErr) {
                console.warn('Opening stock audit log note:', auditErr);
            }

            toast.success(`Opening stock initialized for ${rows.length} item(s) under ${sharedStockNo}!`);
            navigate('/Inventory/OpeningStock/List');
        } catch (err: any) {
            toast.error('Operation Failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Prefill for editing an existing batch (all lines share one Stock No)
    const getBatchInitialValues = () => {
        const first = stockBatch[0];
        return {
            location: first.location || '',
            openingDate: first.openingDate || first.opening_date || todayStr(),
            batchNumber: first.batchNumber || first.batch_number || '',
            items: stockBatch.map((r: any) => ({
                itemCode: r.skuCode || r.item_code || r.itemCode || '',
                itemName: r.itemName || r.product_name || '',
                qty: Number(r.qty ?? r.quantity) || 1,
                purchasePrice: Number(r.purchase_price ?? r.rate ?? r.rp ?? r.purchasePrice) || 0,
                expiryDate: r.expiryDate || r.expiry_date || ''
            }))
        };
    };

    // Edit an existing batch: revert old stock, delete old lines, re-insert with same Stock No
    const handleBatchSubmit = async (values: any) => {
        setLoading(true);
        try {
            const rows = (values.items || []).filter((r: any) => r.itemName);
            if (rows.length === 0) {
                toast.error('Add at least one product row.');
                return;
            }

            const dupError = assertNoDuplicateRows(rows);
            if (dupError) {
                toast.error(dupError);
                return;
            }

            // 1. Revert stock added by the old batch
            for (const [nameKey, qty] of Object.entries(aggregateByProduct(stockBatch))) {
                await updateProductStock(nameKey, -qty);
            }

            // 2. Remove old lines
            const oldIds = stockBatch.map((r: any) => r.id).filter(Boolean);
            if (oldIds.length > 0) {
                const { error: delError } = await supabase.from('opening_stocks').delete().in('id', oldIds);
                if (delError) throw delError;
            }

            // 3. Insert updated lines under the same Stock No
            const payloads = buildPayloads(rows, batchStockNo, values);
            const { error: insError } = await supabase.from('opening_stocks').insert(payloads);
            if (insError) throw insError;

            // 4. Re-apply stock for the new lines
            for (const [nameKey, qty] of Object.entries(aggregateByProduct(rows))) {
                await updateProductStock(nameKey, qty);
            }

            // Record batch update in audit_logs
            try {
                const totalUnits = rows.reduce((sum: number, r: any) => sum + (Number(r.qty) || 0), 0);
                await supabase.from('audit_logs').insert({
                    action_type: 'UPDATE',
                    table_name: 'opening_stocks',
                    performed_by: userName || userEmail || 'Warehouse Manager',
                    details: {
                        stock_no: batchStockNo,
                        batch_number: values.batchNumber || '001',
                        location: values.location,
                        opening_date: values.openingDate,
                        items_count: rows.length,
                        total_quantity: totalUnits,
                        products: rows.slice(0, 10).map((r: any) => `${r.itemName} (${r.qty} Units)`),
                    },
                });
            } catch (auditErr) {
                console.warn('Opening stock batch update audit log note:', auditErr);
            }

            toast.success(`Opening stock batch ${batchStockNo} updated (${rows.length} item(s))!`);
            navigate('/Inventory/OpeningStock/List');
        } catch (err: any) {
            toast.error('Operation Failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const renderMultiForm = ({ initialValues, onSubmit, submitPrefix }: any) => (
        <Formik
            initialValues={initialValues}
            enableReinitialize={false}
            validationSchema={multiValidationSchema}
            onSubmit={onSubmit}
        >
            {({ values, setFieldValue, handleChange, errors, touched }) => {
                const totalQty = (values.items || []).reduce((sum: number, r: any) => sum + (Number(r.qty) || 0), 0);
                const totalValuation = (values.items || []).reduce(
                    (sum: number, r: any) => sum + ((Number(r.qty) || 0) * (Number(r.purchasePrice) || 0)),
                    0
                );

                // Duplicate product detection across rows (case-insensitive, trimmed)
                const productCounts: Record<string, number> = {};
                (values.items || []).forEach((r: any) => {
                    const k = String(r.itemName || '').trim().toLowerCase();
                    if (k) productCounts[k] = (productCounts[k] || 0) + 1;
                });
                const duplicateProductKeys = new Set(
                    Object.keys(productCounts).filter((k) => productCounts[k] > 1)
                );

                const applyProduct = (p: any, index: number) => {
                    const updated = [...values.items];
                    updated[index] = {
                        ...updated[index],
                        itemName: p.product_name,
                        itemCode: p.item_sr_no || `SKU-${p.id}`,
                        purchasePrice: Number(p.purchase_price) || 0
                    };
                    setFieldValue('items', updated);
                    setOpenProductRow(null);
                };

                return (
                    <Form className="p-6.5 space-y-6">
                        {/* Shared batch header */}
                        <div className="rounded-xl border border-stroke dark:border-strokedark bg-slate-50/60 dark:bg-meta-4/20 p-4">
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                                Batch Details (applies to every row below)
                            </p>
                            <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-gray-500">Location / Warehouse *</label>
                                    <select
                                        name="location"
                                        onChange={handleChange}
                                        value={values.location}
                                        className={`w-full rounded border px-3 h-10 bg-transparent text-xs font-bold outline-none focus:border-primary dark:bg-boxdark text-black dark:text-white ${touched.location && errors.location ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}
                                    >
                                        <option value="" className="dark:bg-boxdark">-- Select Warehouse --</option>
                                        {locations.map((loc) => {
                                            const label = loc.name || loc.locationName || loc.location_name;
                                            return <option key={loc.id} value={label} className="dark:bg-boxdark">{label}</option>;
                                        })}
                                    </select>
                                    {touched.location && errors.location && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.location)}</p>}
                                </div>
                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-gray-500">Opening Date *</label>
                                    <input type="date" name="openingDate" onChange={handleChange} value={values.openingDate} className={`w-full rounded border px-3 h-10 bg-transparent text-xs text-black dark:text-white ${touched.openingDate && errors.openingDate ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`} />
                                    {touched.openingDate && errors.openingDate && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.openingDate)}</p>}
                                </div>
                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-gray-500">Batch No *</label>
                                    <input name="batchNumber" onChange={handleChange} value={values.batchNumber} placeholder="e.g., BN-001" className={`w-full rounded border px-3 h-10 bg-transparent text-xs text-black dark:text-white outline-none focus:border-primary ${touched.batchNumber && errors.batchNumber ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`} />
                                    {touched.batchNumber && errors.batchNumber && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.batchNumber)}</p>}
                                </div>
                            </div>
                        </div>

                        {/* Line items */}
                        <div>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                                Product Lines <span className="font-normal normal-case">(each line creates one opening stock record)</span>
                            </p>

                            <FieldArray
                                name="items"
                                render={({ push, remove }) => (
                                    <div className="rounded-xl border border-stroke dark:border-strokedark">
                                        <table className="w-full table-auto border-collapse min-w-[860px]">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-meta-4/60 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-left">
                                                    <th className="py-2.5 px-2 w-10 text-center border-b border-stroke dark:border-strokedark">S#</th>
                                                    <th className="py-2.5 px-2 border-b border-stroke dark:border-strokedark w-72">Product *</th>
                                                    <th className="py-2.5 px-2 border-b border-stroke dark:border-strokedark w-28 text-center">Qty *</th>
                                                    <th className="py-2.5 px-2 border-b border-stroke dark:border-strokedark w-32 text-right">Unit Cost (PKR) *</th>
                                                    <th className="py-2.5 px-2 border-b border-stroke dark:border-strokedark w-36">Expiry (Opt)</th>
                                                    <th className="py-2.5 px-2 border-b border-stroke dark:border-strokedark w-36 text-right">Line Amount</th>
                                                    <th className="py-2.5 px-2 border-b border-stroke dark:border-strokedark w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {values.items.map((item: any, index: number) => {
                                                    const normText = (v: any) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
                                                    const query = normText(item.itemName);
                                                    const filtered = (query
                                                        ? products.filter((p) =>
                                                            normText(p.product_name).includes(query) ||
                                                            normText(p.item_sr_no).includes(query)
                                                        )
                                                        : products
                                                    )
                                                        .slice()
                                                        .sort((a: any, b: any) =>
                                                            (Number(b.current_stock) || 0) - (Number(a.current_stock) || 0) ||
                                                            String(a.product_name || '').localeCompare(String(b.product_name || ''))
                                                        )
                                                        .slice(0, 60);

                                                    const lineError = (errors as any)?.items?.[index];
                                                    const lineTouched = (touched as any)?.items?.[index];

                                                    const rowProductKey = String(item.itemName || '').trim().toLowerCase();
                                                    const isDuplicateRow = !!rowProductKey && duplicateProductKeys.has(rowProductKey);
                                                    const firstDupRowIndex = isDuplicateRow
                                                        ? (values.items || []).findIndex(
                                                            (r: any, j: number) =>
                                                                j !== index &&
                                                                String(r.itemName || '').trim().toLowerCase() === rowProductKey
                                                        )
                                                        : -1;
                                                    const productInputRed = Boolean(lineError?.itemName) || isDuplicateRow;

                                                    return (
                                                        <tr key={index} className="border-b border-stroke dark:border-strokedark align-top">
                                                            <td className="py-2 px-2 text-center font-medium text-slate-500">{index + 1}</td>

                                                            {/* Product search */}
                                                            <td className="py-2 px-2">
                                                                <div className="relative">
                                                                    <input
                                                                        type="text"
                                                                        autoComplete="off"
                                                                        placeholder="Search name or code..."
                                                                        value={item.itemName}
                                                                        ref={(el) => (productInputRefs.current[index] = el)}
                                                                        onFocus={() => {
                                                                            setOpenProductRow(index);
                                                                            setHighlightedProductIndex(0);
                                                                        }}
                                                                        onBlur={() => {
                                                                            setTimeout(() => {
                                                                                setOpenProductRow((prev) => (prev === index ? null : prev));
                                                                            }, 150);
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'ArrowDown') {
                                                                                e.preventDefault();
                                                                                if (filtered.length === 0) return;
                                                                                setHighlightedProductIndex((prev) => {
                                                                                    const next = prev < filtered.length - 1 ? prev + 1 : 0;
                                                                                    queueProductScroll(next);
                                                                                    return next;
                                                                                });
                                                                            } else if (e.key === 'ArrowUp') {
                                                                                e.preventDefault();
                                                                                if (filtered.length === 0) return;
                                                                                setHighlightedProductIndex((prev) => {
                                                                                    const next = prev > 0 ? prev - 1 : filtered.length - 1;
                                                                                    queueProductScroll(next);
                                                                                    return next;
                                                                                });
                                                                            } else if (e.key === 'Enter') {
                                                                                e.preventDefault();
                                                                                if (filtered.length > 0) {
                                                                                    applyProduct(filtered[highlightedProductIndex] || filtered[0], index);
                                                                                }
                                                                            } else if (e.key === 'Tab' || e.key === 'Escape') {
                                                                                setOpenProductRow(null);
                                                                            }
                                                                        }}
                                                                        onChange={(e) => {
                                                                            const typed = e.target.value;
                                                                            const updated = [...values.items];
                                                                            updated[index] = { ...updated[index], itemName: typed };
                                                                            setFieldValue('items', updated);
                                                                            setOpenProductRow(index);
                                                                            setHighlightedProductIndex(0);
                                                                        }}
                                                                        className={`w-full rounded border px-2.5 h-9 bg-transparent text-xs font-semibold text-black dark:text-white outline-none focus:border-primary ${productInputRed ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}
                                                                    />
                                                                    {isDuplicateRow && (
                                                                        <p className="text-red-500 text-[10px] mt-1 font-bold">
                                                                            Duplicate product — already added in row {firstDupRowIndex + 1}. Remove it from one of these rows.
                                                                        </p>
                                                                    )}
                                                                    {item.itemCode && (
                                                                        <span className="block mt-1 text-[10px] font-mono font-bold text-primary dark:text-blue-400">
                                                                            Code: {item.itemCode}
                                                                        </span>
                                                                    )}
                                                                    {openProductRow === index && filtered.length > 0 && (
                                                                        <div ref={productDropdownScrollRef} className="absolute left-0 right-0 top-full mt-1 z-[9999] max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-boxdark shadow-2xl divide-y divide-slate-100 dark:divide-slate-800">
                                                                            {filtered.map((p, pIdx) => (
                                                                                <div
                                                                                    key={p.id}
                                                                                    data-opt={pIdx}
                                                                                    onMouseEnter={() => setHighlightedProductIndex(pIdx)}
                                                                                    onMouseDown={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        applyProduct(p, index);
                                                                                    }}
                                                                                    className={`p-2 cursor-pointer transition flex items-center justify-between gap-2 ${pIdx === highlightedProductIndex ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500' : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                                                                                >
                                                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                                                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{p.product_name}</span>
                                                                                        <span className="text-[10px] font-mono text-primary">{p.item_sr_no || `SKU-${p.id}`}</span>
                                                                                    </div>
                                                                                    <span className="text-[10px] font-mono text-slate-400 shrink-0">Rs. {Number(p.purchase_price || 0).toLocaleString()}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {lineTouched?.itemName && lineError?.itemName && (
                                                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(lineError.itemName)}</p>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            {/* Qty */}
                                                            <td className="py-2 px-2">
                                                                <input
                                                                    type="number"
                                                                    name={`items.${index}.qty`}
                                                                    min="1"
                                                                    onKeyDown={blockInvalidChar}
                                                                    onChange={handleChange}
                                                                    value={item.qty}
                                                                    className={`w-full rounded border px-2.5 h-9 bg-transparent text-xs text-right font-bold text-black dark:text-white outline-none focus:border-primary ${lineError?.qty ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}
                                                                />
                                                                {lineTouched?.qty && lineError?.qty && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(lineError.qty)}</p>}
                                                            </td>

                                                            {/* Unit cost */}
                                                            <td className="py-2 px-2">
                                                                <input
                                                                    type="number"
                                                                    name={`items.${index}.purchasePrice`}
                                                                    min="0"
                                                                    onKeyDown={blockInvalidChar}
                                                                    onChange={handleChange}
                                                                    value={item.purchasePrice}
                                                                    className={`w-full rounded border px-2.5 h-9 bg-slate-50/60 dark:bg-meta-4/20 text-xs text-right font-mono font-bold text-black dark:text-white outline-none focus:border-primary ${lineError?.purchasePrice ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}
                                                                />
                                                                {lineTouched?.purchasePrice && lineError?.purchasePrice && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(lineError.purchasePrice)}</p>}
                                                            </td>

                                                            {/* Expiry */}
                                                            <td className="py-2 px-2">
                                                                <input
                                                                    type="date"
                                                                    name={`items.${index}.expiryDate`}
                                                                    onChange={handleChange}
                                                                    value={item.expiryDate || ''}
                                                                    className="w-full rounded border border-stroke dark:border-strokedark px-2.5 h-9 bg-transparent text-xs text-black dark:text-white"
                                                                />
                                                            </td>

                                                            {/* Line amount */}
                                                            <td className="py-2 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                                Rs. {fmtMoney((Number(item.qty) || 0) * (Number(item.purchasePrice) || 0))}
                                                            </td>

                                                            {/* Remove */}
                                                            <td className="py-2 px-2 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (values.items.length > 1) {
                                                                            remove(index);
                                                                        } else {
                                                                            toast.error('At least one product line is required.');
                                                                        }
                                                                    }}
                                                                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg p-1.5 transition cursor-pointer"
                                                                    title="Remove line"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>

                                        <div className="p-3 border-t border-stroke dark:border-strokedark flex items-center justify-between gap-3 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const nextIndex = (values.items || []).length;
                                                    push(emptyItemRow());
                                                    setHighlightedProductIndex(0);
                                                    setTimeout(() => {
                                                        const el = productInputRefs.current[nextIndex];
                                                        if (el) el.focus();
                                                    }, 0);
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-white font-bold py-2 px-4 text-xs transition hover:opacity-90 cursor-pointer"
                                            >
                                                + Add Product Line
                                            </button>
                                            <div className="flex items-center gap-6 text-xs">
                                                <span className="text-slate-500 dark:text-slate-400 font-semibold">
                                                    Total Items: <span className="text-slate-800 dark:text-white font-extrabold">{values.items.length}</span>
                                                    <span className="ml-3">Total Qty: <span className="text-slate-800 dark:text-white font-extrabold">{totalQty.toLocaleString()}</span></span>
                                                </span>
                                                <span className="text-slate-500 dark:text-slate-400 font-semibold">
                                                    Total Valuation: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold font-mono">Rs. {fmtMoney(totalValuation)}</span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            />
                        </div>

                        {typeof errors.items === 'string' && (
                            <p className="text-red-500 text-xs font-semibold">{String(errors.items)}</p>
                        )}

                        <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-stroke dark:border-strokedark">
                            <button
                                type="button"
                                onClick={() => navigate('/Inventory/OpeningStock/List')}
                                className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                            >
                                {loading ? <Spinner color="border-white" size="w-4 h-4" /> : `${submitPrefix || 'Save'} ${values.items.length || 1} Opening Stock Item${(values.items?.length || 1) > 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </Form>
                );
            }}
        </Formik>
    );

    // ------------------------------------------------------------
    // SINGLE-RECORD (Edit mode): unchanged legacy form
    // ------------------------------------------------------------
    const getSingleInitialValues = () => ({
        stockNo: editData?.stockNo || '',
        skuCode: editData?.skuCode || editData?.item_code || '',
        itemName: editData?.itemName || editData?.product_name || '',
        batchNumber: editData?.batchNumber || editData?.batch_number || '',
        location: editData?.location || '',
        qty: Number(editData?.qty ?? editData?.quantity) || 1,
        purchasePrice: Number(editData?.purchasePrice ?? editData?.purchase_price ?? editData?.rate ?? editData?.rp) || 0,
        amount: Number(editData?.amount ?? editData?.total_amount) || 0,
        openingDate: editData?.openingDate || editData?.opening_date || todayStr(),
        expiryDate: editData?.expiryDate || editData?.expiry_date || ''
    });

    const singleValidationSchema = Yup.object().shape({
        itemName: Yup.string().required('Required'),
        batchNumber: Yup.string().required('Required'),
        location: Yup.string().required('Required'),
        qty: Yup.number().min(1, 'Min 1').required('Required'),
        purchasePrice: Yup.number().min(0, 'Min 0').required('Required'),
        openingDate: Yup.string().required('Required'),
        expiryDate: Yup.string().nullable(),
    });

    const renderSingleForm = () => (
        <Formik
            initialValues={getSingleInitialValues()}
            enableReinitialize={false}
            validationSchema={singleValidationSchema}
            onSubmit={async (values) => {
                setLoading(true);
                try {
                    const unitCost = Number(values.purchasePrice) || 0;
                    const quantity = Number(values.qty) || 0;
                    const totalValuation = quantity * unitCost;

                    const finalValues = {
                        stock_no: values.stockNo,
                        stockno: values.stockNo,
                        item_code: values.skuCode,
                        product_name: values.itemName,
                        batch_number: values.batchNumber,
                        location: values.location,
                        qty: quantity,
                        quantity: quantity,
                        purchase_price: unitCost,
                        rate: unitCost,
                        amount: totalValuation,
                        total_amount: totalValuation,
                        opening_date: values.openingDate,
                        expiry_date: values.expiryDate === "" ? null : values.expiryDate
                    };

                    const oldQty = Number(editData.qty || editData.quantity) || 0;
                    const qtyDifference = quantity - oldQty;

                    const { error: stockError } = await supabase
                        .from('opening_stocks')
                        .update(finalValues)
                        .eq('id', editData.id);

                    if (stockError) throw stockError;

                    if (qtyDifference !== 0) {
                        const { data: currentProduct } = await supabase
                            .from('products')
                            .select('current_stock')
                            .ilike('product_name', values.itemName)
                            .maybeSingle();

                        if (currentProduct) {
                            await supabase
                                .from('products')
                                .update({ current_stock: (Number(currentProduct.current_stock) || 0) + qtyDifference })
                                .eq('product_name', values.itemName);
                        }
                    }

                    toast.success('Opening stock updated successfully!');
                    navigate('/Inventory/OpeningStock/List');
                } catch (err: any) {
                    toast.error('Operation Failed: ' + err.message);
                } finally {
                    setLoading(false);
                }
            }}
        >
            {({ handleChange, setFieldValue, values, errors, touched }) => {
                const calculatedAmount = (Number(values.qty || 0) * Number(values.purchasePrice || 0)).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                return (
                    <Form className="p-6.5 space-y-6">
                        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-xs font-semibold text-gray-500">Stock Number (Auto Generated)</label>
                                <input name="stockNo" readOnly value={values.stockNo} className="w-full rounded border border-stroke bg-gray-50 dark:bg-meta-4/10 px-3 h-10 text-xs font-bold outline-none text-black dark:text-white" />
                            </div>

                            {/* 1. Code Typeable Search with Custom Full-Width Dropdown */}
                            <div className="relative" ref={skuDropdownRef}>
                                <label className="mb-2 block text-xs font-semibold text-gray-500">Code (Search & Auto-Select)</label>
                                {(() => {
                                    const filteredProds = products.filter(p => {
                                        if (!values.skuCode) return true;
                                        const query = values.skuCode.toLowerCase().trim();
                                        const sku = (p.item_sr_no || `SKU-${p.id}`).toLowerCase();
                                        const name = (p.product_name || '').toLowerCase();
                                        return sku.includes(query) || name.includes(query);
                                    });

                                    return (
                                        <>
                                            <input
                                                type="text"
                                                name="skuCode"
                                                autoComplete="off"
                                                value={values.skuCode || ''}
                                                onFocus={() => {
                                                    setShowSkuDropdown(true);
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
                                                            const displaySku = selected.item_sr_no || `SKU-${selected.id}`;
                                                            setFieldValue('skuCode', displaySku);
                                                            setFieldValue('itemName', selected.product_name);
                                                            setFieldValue('purchasePrice', selected.purchase_price || 0);
                                                            setShowSkuDropdown(false);
                                                        }
                                                    } else if (e.key === 'Tab' || e.key === 'Escape') {
                                                        setShowSkuDropdown(false);
                                                    }
                                                }}
                                                onChange={(e) => {
                                                    const typed = e.target.value;
                                                    setFieldValue('skuCode', typed);
                                                    setShowSkuDropdown(true);
                                                    setHighlightedSkuIndex(0);

                                                    // Only auto-fill if the user has typed the EXACT FULL Code (e.g. SKU-002)
                                                    const matched = products.find(
                                                        p => p.item_sr_no && p.item_sr_no.toLowerCase() === typed.trim().toLowerCase()
                                                    );
                                                    if (matched) {
                                                        setFieldValue('itemName', matched.product_name);
                                                        setFieldValue('purchasePrice', matched.purchase_price || 0);
                                                    }
                                                }}
                                                placeholder="Type or select Code..."
                                                className="w-full rounded border border-stroke px-3 h-10 bg-transparent text-xs font-mono font-bold outline-none focus:border-primary dark:bg-boxdark text-black dark:text-white uppercase"
                                            />

                                            {/* FULL WIDTH MODERN DROPDOWN */}
                                            {showSkuDropdown && (
                                                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-[290px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                                                    {filteredProds.map((p, pIdx) => {
                                                        const displaySku = p.item_sr_no || `SKU-${p.id}`;
                                                        const isHighlighted = pIdx === highlightedSkuIndex;
                                                        return (
                                                            <div
                                                                key={p.id}
                                                                onMouseEnter={() => setHighlightedSkuIndex(pIdx)}
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    setFieldValue('skuCode', displaySku);
                                                                    setFieldValue('itemName', p.product_name);
                                                                    setFieldValue('purchasePrice', p.purchase_price || 0);
                                                                    setShowSkuDropdown(false);
                                                                }}
                                                                className={`p-3 cursor-pointer transition flex items-center justify-between group ${isHighlighted
                                                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500'
                                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                                                                    }`}
                                                            >
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="font-mono font-bold text-xs text-primary group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                                                        {displaySku}
                                                                    </span>
                                                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                                                        {p.product_name}
                                                                    </span>
                                                                </div>
                                                                <div className="text-right font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                                                    Cost: <span className="font-bold text-slate-800 dark:text-white">Rs. {Number(p.purchase_price || 0).toLocaleString()}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {filteredProds.length === 0 && (
                                                        <div className="p-4 text-center text-xs text-slate-400 italic">
                                                            No matching products or SKUs found
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>

                            <div>
                                <label className="mb-2 block text-xs font-semibold text-gray-500">Item Name (Product) *</label>
                                <select
                                    name="itemName"
                                    value={values.itemName}
                                    onChange={(e) => {
                                        const selectedProd = products.find(p => p.product_name === e.target.value);
                                        setFieldValue('itemName', e.target.value);
                                        if (selectedProd) {
                                            setFieldValue('skuCode', selectedProd.item_sr_no || `SKU-${selectedProd.id}`);
                                            setFieldValue('purchasePrice', selectedProd.purchase_price || 0);
                                        }
                                    }}
                                    className={`w-full rounded border px-3 h-10 bg-transparent text-xs font-bold outline-none focus:border-primary dark:bg-boxdark text-black dark:text-white ${touched.itemName && errors.itemName ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}
                                >
                                    <option value="" className="dark:bg-boxdark">-- Select Existing Product --</option>
                                    {products.map((p) => <option key={p.id} value={p.product_name} className="dark:bg-boxdark">{p.product_name}</option>)}
                                </select>
                                {touched.itemName && errors.itemName && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.itemName)}</p>}
                            </div>

                            <div>
                                <label className="mb-2 block text-xs font-semibold text-gray-500">Batch Number *</label>
                                <input name="batchNumber" onChange={handleChange} value={values.batchNumber} placeholder="e.g., BN-001" className={`w-full rounded border px-3 h-10 bg-transparent text-xs text-black dark:text-white ${touched.batchNumber && errors.batchNumber ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`} />
                                {touched.batchNumber && errors.batchNumber && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.batchNumber)}</p>}
                            </div>

                            <div>
                                <label className="mb-2 block text-xs font-semibold text-gray-500">Location / Warehouse *</label>
                                <select
                                    name="location"
                                    onChange={handleChange}
                                    value={values.location}
                                    className={`w-full rounded border px-3 h-10 bg-transparent text-xs font-bold outline-none focus:border-primary dark:bg-boxdark text-black dark:text-white ${touched.location && errors.location ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}
                                >
                                    <option value="" className="dark:bg-boxdark">-- Select Warehouse --</option>
                                    {locations.map((loc) => {
                                        const label = loc.name || loc.locationName || loc.location_name;
                                        return <option key={loc.id} value={label} className="dark:bg-boxdark">{label}</option>;
                                    })}
                                </select>
                                {touched.location && errors.location && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.location)}</p>}
                            </div>

                            <div>
                                <label className="mb-2 block text-xs font-semibold text-gray-500">Opening Stock Quantity *</label>
                                <input type="number" name="qty" min="1" onKeyDown={blockInvalidChar} onChange={handleChange} value={values.qty} className={`w-full rounded border px-3 h-10 bg-transparent text-xs text-right font-bold text-black dark:text-white ${touched.qty && errors.qty ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`} />
                                {touched.qty && errors.qty && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.qty)}</p>}
                            </div>

                            <div>
                                <label className="mb-2 block text-xs font-semibold text-gray-500">Purchase Price / Unit Cost (PKR) *</label>
                                <input type="number" name="purchasePrice" min="0" onKeyDown={blockInvalidChar} onChange={handleChange} value={values.purchasePrice} className={`w-full rounded border px-3 h-10 bg-slate-50/50 dark:bg-meta-4/20 text-xs text-right font-mono font-bold text-black dark:text-white ${touched.purchasePrice && errors.purchasePrice ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`} />
                                {touched.purchasePrice && errors.purchasePrice && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.purchasePrice)}</p>}
                            </div>

                            <div>
                                <label className="mb-2 block text-xs font-semibold text-gray-500">Opening Date *</label>
                                <input type="date" name="openingDate" onChange={handleChange} value={values.openingDate} className={`w-full rounded border px-3 h-10 bg-transparent text-xs text-black dark:text-white ${touched.openingDate && errors.openingDate ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`} />
                                {touched.openingDate && errors.openingDate && <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.openingDate)}</p>}
                            </div>

                            <div>
                                <label className="mb-2 block text-xs font-semibold text-gray-500">Expiry Date (Optional)</label>
                                <input type="date" name="expiryDate" onChange={handleChange} value={values.expiryDate || ''} className="w-full rounded border border-stroke dark:border-strokedark px-3 h-10 bg-transparent text-xs text-black dark:text-white" />
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col md:flex-row justify-between items-center bg-gray-50 dark:bg-meta-4/20 p-4 rounded border border-stroke dark:border-strokedark">
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Total Valuation Asset Amount (PKR):</span>
                            <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                                Rs. {calculatedAmount}
                            </span>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-stroke dark:border-strokedark">
                            <button
                                type="button"
                                onClick={() => navigate('/Inventory/OpeningStock/List')}
                                className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                            >
                                {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>Update Stock</span>}
                            </button>
                        </div>
                    </Form>
                );
            }}
        </Formik>
    );

    const renderActiveForm = () => {
        if (isBatchEdit) {
            return renderMultiForm({
                initialValues: getBatchInitialValues(),
                onSubmit: handleBatchSubmit,
                submitPrefix: `Update`
            });
        }
        if (isEditMode) {
            return renderSingleForm();
        }
        return renderMultiForm({
            initialValues: multiInitialValues,
            onSubmit: handleMultiSubmit,
            submitPrefix: 'Save'
        });
    };

    return (
        <div className="mx-auto max-w-270 text-black dark:text-bodydark text-xs">
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark flex justify-between items-center">
                    <h3 className="font-medium text-black dark:text-white text-base">
                        {isBatchEdit ? `Modify Opening Stock Batch: ${batchStockNo}` : (isEditMode ? `Modify Stock: ${editData.stockNo}` : 'Initialize Opening Stock (Multi-Item)')}
                    </h3>
                    <span onClick={() => navigate('/Inventory/OpeningStock/List')} className="text-sm text-primary font-medium hover:underline cursor-pointer">
                        {isBatchEdit || isEditMode ? '← Back to List' : '👁 See List'}
                    </span>
                </div>

                {renderActiveForm()}
            </div>
        </div>
    );
};

export default AddOpeningStock;
