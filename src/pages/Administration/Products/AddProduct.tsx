// Helper: parse tile dimensions (h × w) from sub_category, description, or SKU
const parseTileDimensions = (data: any) => {
  if (!data) return { h: 24, w: 24 };
  const text = `${data?.sub_category || ''} ${data?.product_description || ''} ${data?.item_sr_no || ''}`;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:[xX×*])\s*(\d+(?:\.\d+)?)/);
  if (match) {
    return {
      h: Number(match[1]) || 24,
      w: Number(match[2]) || 24
    };
  }
  return { h: 24, w: 24 };
};

const parsePiecesPerBox = (data: any) => {
  if (!data) return 4;
  const raw = Number(data?.pieces_per_box ?? data?.pcs_per_box ?? data?.pieces_per_packing ?? 0);
  if (raw >= 1) return raw;
  const match = String(data?.product_description || '').match(/Box:\s*(\d+)\s*pcs/i);
  if (match && Number(match[1]) > 0) return Number(match[1]);
  return 4;
};

import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { MdSquareFoot, MdViewModule, MdAttachMoney, MdLayers, MdClose, MdSave, MdFormatColorFill, MdAdd, MdDelete, MdEdit, MdCheck, MdInfo, MdLabelOutline } from 'react-icons/md';
import SearchableDropdown from '../../../components/SearchableDropdown';
import { logActivity } from '../../../service/auditLogger';

interface UomItem {
  id: number;
  short_code: string;
  full_name: string;
  category: string;
  is_active: boolean;
}

const AddProduct = () => {
  const { tenantId, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);
  
  // Master database lists
  const [categories, setCategories] = useState<any[]>([]);

  const [surfaceFinishes, setSurfaceFinishes] = useState<any[]>([]);
  const [groupedUoms, setGroupedUoms] = useState<{ [key: string]: UomItem[] }>({});

  // Tile prints list & search dropdown state (Option 2: dedicated table rows)
  const [tilePrints, setTilePrints] = useState<{ id?: number | string; name: string; category_id?: number | null }[]>([]);
  const [isPrintDropdownOpen, setIsPrintDropdownOpen] = useState(false);
  const [highlightedPrintIndex, setHighlightedPrintIndex] = useState(0);

  // Inline edit & delete state for tile prints dropdown
  const [editingPrintName, setEditingPrintName] = useState<string | null>(null);
  const [editPrintInput, setEditPrintInput] = useState<string>('');
  const [deletingPrintItem, setDeletingPrintItem] = useState<{ id?: number | string; name: string } | null>(null);

  const fetchTilePrintsFromDb = async (parentCatName?: string) => {
    try {
      const parent = categories.find((c: any) => c.name === parentCatName && c.parent_id === null);
      let query = supabase.from('inventory_prints').select('*').order('name', { ascending: true });
      if (parent?.id) {
        query = query.or(`category_id.eq.${parent.id},category_id.is.null`);
      }
      const { data, error } = await query;
      if (!error && data) {
        setTilePrints(data);
        return;
      }
    } catch (e) {}

    // Fallback to localStorage if table not yet created
    try {
      const saved = localStorage.getItem('al_muhammadi_tile_prints') || localStorage.getItem('zac_tile_prints');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setTilePrints(parsed.map((p: any) => (typeof p === 'string' ? { name: p } : p)));
          return;
        }
      }
    } catch (e) {}
    setTilePrints([]);
  };

  const handleAddPrint = async (newPrintName: string, setFieldValue?: (f: string, v: any) => void, parentCatName?: string) => {
    const clean = newPrintName.trim();
    if (!clean) {
      toast.error('Print name cannot be empty');
      return;
    }
    if (tilePrints.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      toast.error('A print with this name already exists');
      return;
    }

    const parent = categories.find((c: any) => c.name === parentCatName && c.parent_id === null);
    let insertedItem: { id?: number | string; name: string; category_id?: number | null } = { name: clean };

    try {
      const { data, error } = await supabase
        .from('inventory_prints')
        .insert([{ name: clean, category_id: parent?.id || null }])
        .select()
        .single();
      if (!error && data) {
        insertedItem = data;
      }
    } catch (e) {}

    const updated = [...tilePrints, insertedItem];
    setTilePrints(updated);
    try {
      localStorage.setItem('al_muhammadi_tile_prints', JSON.stringify(updated));
      localStorage.setItem('zac_tile_prints', JSON.stringify(updated));
    } catch (err) {}

    if (setFieldValue) {
      setFieldValue('tilePrint', clean);
    }
    toast.success(`Print "${clean}" added successfully!`);
  };

  const handleStartEditPrint = (e: React.MouseEvent, pName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingPrintName(pName);
    setEditPrintInput(pName);
  };

  const handleSaveEditPrint = async (e: React.MouseEvent | React.KeyboardEvent, oldItem: { id?: number | string; name: string }, setFieldValue?: (f: string, v: any) => void) => {
    e.preventDefault();
    e.stopPropagation();
    const clean = editPrintInput.trim();
    if (!clean) {
      toast.error('Print name cannot be empty');
      return;
    }
    if (clean.toLowerCase() !== oldItem.name.toLowerCase() && tilePrints.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      toast.error('A print with this name already exists');
      return;
    }

    try {
      if (oldItem.id) {
        await supabase.from('inventory_prints').update({ name: clean }).eq('id', oldItem.id);
      } else {
        await supabase.from('inventory_prints').update({ name: clean }).eq('name', oldItem.name);
      }
    } catch (e) {}

    const updated = tilePrints.map((p) => (p.name === oldItem.name ? { ...p, name: clean } : p));
    setTilePrints(updated);
    try {
      localStorage.setItem('al_muhammadi_tile_prints', JSON.stringify(updated));
      localStorage.setItem('zac_tile_prints', JSON.stringify(updated));
    } catch (err) {}

    if (setFieldValue) {
      setFieldValue('tilePrint', clean);
    }
    setEditingPrintName(null);
    setEditPrintInput('');
    toast.success(`Print updated to "${clean}"`);
  };

  const handleCancelEditPrint = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingPrintName(null);
    setEditPrintInput('');
  };

  const handleStartDeletePrint = (e: React.MouseEvent, item: { id?: number | string; name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPrintDropdownOpen(false);
    setDeletingPrintItem(item);
  };

  const handleConfirmDeletePrint = async (setFieldValue?: (f: string, v: any) => void, currentVal?: string) => {
    if (!deletingPrintItem) return;
    const itemToDelete = deletingPrintItem;

    try {
      if (itemToDelete.id) {
        await supabase.from('inventory_prints').delete().eq('id', itemToDelete.id);
      } else {
        await supabase.from('inventory_prints').delete().eq('name', itemToDelete.name);
      }
    } catch (e) {}

    const updated = tilePrints.filter((p) => p.name !== itemToDelete.name);
    setTilePrints(updated);
    try {
      localStorage.setItem('al_muhammadi_tile_prints', JSON.stringify(updated));
      localStorage.setItem('zac_tile_prints', JSON.stringify(updated));
    } catch (err) {}

    if (setFieldValue && currentVal === itemToDelete.name) {
      setFieldValue('tilePrint', '');
    }
    setDeletingPrintItem(null);
    toast.success(`Print "${itemToDelete.name}" deleted`);
  };

  const [isUomDropdownOpen, setIsUomDropdownOpen] = useState(false);
  const [highlightedUomIndex, setHighlightedUomIndex] = useState(0);

  const [isBinDropdownOpen, setIsBinDropdownOpen] = useState(false);
  const [highlightedBinIndex, setHighlightedBinIndex] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();

  const editData = location.state?.product;
  const isEditMode = !!editData;

  useEffect(() => {
    const fetchAllMasterMetadata = async () => {
      try {
        setMetadataLoading(true);
        const activeTenant = tenantId || 'bashir';
        
        const { data: catData } = await supabase
          .from('inventory_categories')
          .select('id, name, code, parent_id')
          .order('name', { ascending: true });

        
        try {
          const { data: finishData } = await supabase
            .from('inventory_surface_finishes')
            .select('id, name')
            .order('name', { ascending: true });
          if (finishData && finishData.length > 0) {
            setSurfaceFinishes(finishData);
          } else {
            const local = localStorage.getItem('zac_surface_finishes');
            if (local) setSurfaceFinishes(JSON.parse(local));
          }
        } catch (e) {
          const local = localStorage.getItem('zac_surface_finishes');
          if (local) setSurfaceFinishes(JSON.parse(local));
        }

        const { data: uomData } = await supabase
          .from('inventory_uom')
          .select('*')
          .eq('is_active', true)
          .order('category', { ascending: true })
          .order('short_code', { ascending: true });

        if (catData) setCategories(catData);

        
        if (uomData && uomData.length > 0) {
          const groups = uomData.reduce((acc: { [key: string]: UomItem[] }, curr: UomItem) => {
            const cat = curr.category || 'General';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(curr);
            return acc;
          }, {});
          setGroupedUoms(groups);
        }

        fetchTilePrintsFromDb();
      } catch (err: any) {
        console.error('Metadata aggregation error: ', err.message);
        toast.error('Failed to load setup configurations');
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchAllMasterMetadata();
  }, []);

  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) => 
    ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

  if (metadataLoading) {
    return (
      <div className="flex h-48 items-center justify-center bg-white dark:bg-boxdark rounded-2xl border border-stroke dark:border-strokedark">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12 font-sans">
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800/80 dark:bg-[#111827] overflow-hidden">
        
        {/* HEADER BAR */}
        <div className="border-b border-slate-100 py-4.5 px-6.5 dark:border-slate-800/80 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              {isEditMode ? `Edit Product: ${editData.product_name}` : 'Add New Product Master Item'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select category to automatically load product or tile-specific dimension & packaging fields
            </p>
          </div>
          <button
            onClick={() => navigate('/Administration/Products/List')}
            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            ← Back to List
          </button>
        </div>

        <Formik
          initialValues={isEditMode ? {
            productName: editData.product_name || '',
            category: editData.category || '',
            subCategory: editData.sub_category || '',
            subSubCategory: editData.sub_sub_category || '',
            itemType: editData.item_type || 'goods',

            uom: editData.uom || 'PCS',
            profit: editData.profit || 0,
            purchasePrice: editData.purchase_price || 0,
            scenarioName: editData.scenario_name || '',
            mrp: editData.mrp || editData.retail_price || 0,
            retailPrice: editData.retail_price || 0,
            serviceCharges: editData.service_charges || 0,
            minStockAlert: editData.min_stock_alert !== undefined && editData.min_stock_alert !== null ? editData.min_stock_alert : '',
            hsCode: editData.hs_code || '',
            itemSrNo: editData.item_sr_no || '',
            sroScheduleNo: editData.sro_schedule_no || '',
                        // Tile specific fields dynamically parsed from existing record
            tileHeight: parseTileDimensions(editData).h,
            tileWidth: parseTileDimensions(editData).w,
            tileThickness: (() => {
              const match = String(editData?.product_description || '').match(/Thickness:\s*([^|]+)/i);
              return match ? match[1].trim() : '';
            })(),
            piecesPerBox: parsePiecesPerBox(editData),
            finishType: editData.bin || '',
            tilePrint: editData.tile_print || editData.print || (() => {
              const match = String(editData?.product_description || '').match(/Print:\s*([^|]+)/i);
              return match ? match[1].trim() : '';
            })() || '',
            weightPerBox: 28,
          } : {
            productName: '',
            category: '',
            subCategory: '',
            subSubCategory: '',
            itemType: 'goods',

            uom: '',
            profit: 0,
            purchasePrice: '',
            scenarioName: '',
            mrp: '',
            retailPrice: '',
            serviceCharges: 0,
            minStockAlert: '',
            hsCode: '',
            itemSrNo: '',
            sroScheduleNo: '',
            // Tile specific defaults
            tileHeight: 24,
            tileWidth: 24,
            tileThickness: '',
            piecesPerBox: 4,
            finishType: '',
            tilePrint: '',
            weightPerBox: 28,
          }}
          enableReinitialize={true}
          validationSchema={Yup.object().shape({
            productName: Yup.string().required('Description is required'),
            category: Yup.string().required('Category is required'),
            purchasePrice: Yup.number().typeError('Must be a number').min(0).required('Required'),
            retailPrice: Yup.number().typeError('Must be a number').min(0).required('Required'),
            minStockAlert: Yup.number().typeError('Must be a valid quantity number').min(0, 'Cannot be negative').nullable(),
          })}
          onSubmit={async (values) => {
            setLoading(true);
            const isTileCategory = String(values.subSubCategory || '').trim().toLowerCase().includes('tile');
            const computedProfit = (Number(values.retailPrice) || 0) + (values.itemType === 'service' ? (Number(values.serviceCharges) || 0) : 0) - (Number(values.purchasePrice) || 0);

            let finalDescription = '';
            let finalUom = values.uom;
            let finalHsCode = values.hsCode?.trim() || '';
            let finalItemSrNo = values.itemSrNo?.trim() || '';
            const pcs = Number(values.piecesPerBox) || 1;

            if (isTileCategory) {
              const h = Number(values.tileHeight) || 0;
              const w = Number(values.tileWidth) || 0;
              // 1 inch = 0.025 meters; exact sq.m = (h * 0.025) * (w * 0.025)
              const sqMetersPerTile = (h > 0 && w > 0) ? (h * 0.025) * (w * 0.025) : 0;
              const totalSqMetersPerBox = sqMetersPerTile * pcs;
              const tileSizeFormatted = `${h} × ${w} in`;

              finalDescription = `[TILE PRODUCT] Size: ${tileSizeFormatted} | Box: ${pcs} pcs (${totalSqMetersPerBox.toFixed(4)} sq.m / box) | Finish: ${values.finishType}${values.tilePrint ? ` | Print: ${values.tilePrint}` : ''}${values.tileThickness ? ` | Thickness: ${values.tileThickness}` : ''}${values.weightPerBox ? ` | Wt: ${values.weightPerBox}kg` : ''}`;
              finalUom = values.uom || 'BOX';
              finalHsCode = values.hsCode?.trim() || '6907.2100';
              finalItemSrNo = values.itemSrNo?.trim() || tileSizeFormatted;
            }

            const databasePayload = {
              item_type: values.itemType || 'goods',
              product_name: String(values.productName || '').replace(/\s+/g, ' ').trim(),
              category: values.category,
              sub_category: values.subCategory,
              sub_sub_category: values.subSubCategory,

              uom: finalUom || 'PCS',
              bin: values.finishType?.trim() || '',
              product_description: finalDescription,
              profit: computedProfit,
              purchase_price: Number(values.purchasePrice) || 0,
              scenario_name: values.scenarioName || (isTileCategory ? 'Tile Metric' : ''),
              mrp: Number(values.mrp) || Number(values.retailPrice) || 0,
              retail_price: Number(values.retailPrice) || 0,
              service_charges: values.itemType === 'service' ? Number(values.serviceCharges) || 0 : 0,
              min_stock_alert: values.minStockAlert !== '' && values.minStockAlert !== null ? Number(values.minStockAlert) : 0,
              pieces_per_box: pcs,
              pcs_per_box: pcs,
              pieces_per_packing: pcs,
              hs_code: finalHsCode,
              item_sr_no: finalItemSrNo,
              sro_schedule_no: values.sroScheduleNo?.trim() || '',
            };

            try {
              // 🔍 SKU Uniqueness Validation: Prevent duplicate Codes
              if (finalItemSrNo) {
                let skuQuery = supabase
                  .from('products')
                  .select('id, product_name, item_sr_no')
                  .ilike('item_sr_no', finalItemSrNo.trim());

                if (isEditMode && editData?.id) {
                  skuQuery = skuQuery.neq('id', editData.id);
                }

                const { data: existingSku, error: skuCheckError } = await skuQuery;
                if (skuCheckError) console.warn('SKU Check warning:', skuCheckError);

                if (existingSku && existingSku.length > 0) {
                  toast.error(`Code "${finalItemSrNo}" is already assigned to "${existingSku[0].product_name}". Each product must have a unique SKU!`, {
                    duration: 5000,
                  });
                  setLoading(false);
                  return;
                }
              }

              if (isEditMode) {
                const { error } = await supabase
                  .from('products')
                  .update(databasePayload)
                  .eq('id', editData.id);

                if (error) throw error;

                logActivity({
                  action: 'UPDATE',
                  tableName: 'products',
                  details: {
                    product_name: values.productName,
                    item_code: finalItemSrNo,
                    category: values.category,
                    retail_price: values.retailPrice,
                    purchase_price: values.purchasePrice,
                    event: 'Updated Product Master'
                  },
                  performedBy: user?.name || user?.email || 'User'
                });

                toast.success('Product updated successfully!');
              } else {
                const { error } = await supabase
                  .from('products')
                  .insert([databasePayload]);

                if (error) throw error;

                logActivity({
                  action: 'INSERT',
                  tableName: 'products',
                  details: {
                    product_name: values.productName,
                    item_code: finalItemSrNo,
                    category: values.category,
                    retail_price: values.retailPrice,
                    purchase_price: values.purchasePrice,
                    event: 'Created Product Master'
                  },
                  performedBy: user?.name || user?.email || 'User'
                });

                toast.success('Product saved successfully!');
              }
              navigate('/Administration/Products/List');
            } catch (err: any) {
              toast.error('Database Operation Failure: ' + err.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {({ handleChange, values, errors, touched, setFieldValue }) => {
            const isTileCategory = String(values.subSubCategory || '').trim().toLowerCase().includes('tile');

            // Tile Live Calculations (Inches to sq.m)
            const tileH = Number(values.tileHeight) || 0;
            const tileW = Number(values.tileWidth) || 0;
            const tilePcs = Number(values.piecesPerBox) || 1;
            // 1 inch = 0.025 meters; exact sq.m = (h * 0.025) * (w * 0.025)
            const sqMetersPerTile = (tileH > 0 && tileW > 0) ? (tileH * 0.025) * (tileW * 0.025) : 0;
            const totalSqMetersPerBox = sqMetersPerTile * tilePcs;
            const tileSizeFormatted = `${tileH} × ${tileW} in`;

            const numSale = Number(values.retailPrice) || 0;
            const numPurchase = Number(values.purchasePrice) || 0;
            const numSqm = totalSqMetersPerBox > 0 ? totalSqMetersPerBox : 1;

            const salePerSqm = (numSale / numSqm).toFixed(2);
            const salePerPiece = (numSale / tilePcs).toFixed(2);
            const purchasePerSqm = (numPurchase / numSqm).toFixed(2);
            const purchasePerPiece = (numPurchase / tilePcs).toFixed(2);

            const numServiceCharges = values.itemType === 'service' ? (Number(values.serviceCharges) || 0) : 0;
            const totalRevenue = numSale + numServiceCharges;
            const profit = totalRevenue - numPurchase;
            const profitMarginPercent = numPurchase > 0 ? ((profit / numPurchase) * 100).toFixed(1) : '0';

            useEffect(() => {
              setFieldValue('profit', profit.toFixed(2));
              if (isTileCategory && !values.uom) {
                setFieldValue('uom', 'BOX');
              }
            }, [numSale, numPurchase, isTileCategory, setFieldValue]);

            return (
              <Form className="p-6.5 text-xs text-slate-700 dark:text-slate-200 space-y-6">

                {/* ITEM TYPE TAB SWITCHER */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                  {(['goods', 'service'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFieldValue('itemType', type)}
                      className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                        values.itemType === type
                          ? type === 'goods'
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'bg-indigo-500 text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      {type === 'goods' ? '📦 Goods Item' : '🛠️ Service Item'}
                    </button>
                  ))}
                </div>
                
                {/* 1. CORE PRODUCT ATTRIBUTES (Always visible) */}
                <div className="bg-slate-50/50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-3">
                    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                      <MdLayers className="text-emerald-600 text-lg" />
                      <span>Product Category & Identity</span>
                    </div>
                    {isTileCategory && (
                      <span className="bg-teal-500/20 text-teal-700 dark:text-teal-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-teal-500/30 uppercase tracking-wider">
                        Tile Mode Active
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                    {/* 1. Parent Category (Top Level) */}
                    <div>
                      <label className="mb-1.5 block font-bold text-slate-800 dark:text-slate-100">
                        Parent Category
                      </label>
                      <SearchableDropdown
                        value={values.subSubCategory}
                        onChange={(val) => {
                          setFieldValue('subSubCategory', val);
                          setFieldValue('subCategory', '');
                          setFieldValue('category', '');
                          fetchTilePrintsFromDb(val);
                        }}
                        options={categories.filter(c => c.parent_id === null).map(cat => cat.name)}
                        placeholder="Parent Category"
                        allowAll={false}
                      />
                    </div>

                    {/* 1.1 Sub Category (Middle Level) */}
                    <div>
                      <label className="mb-1.5 block font-bold text-slate-800 dark:text-slate-100">
                        Sub Category
                      </label>
                      <SearchableDropdown
                        value={values.subCategory}
                        onChange={(val) => {
                          setFieldValue('subCategory', val);
                          setFieldValue('category', '');
                        }}
                        options={(() => {
                          const parent = categories.find(c => c.name === values.subSubCategory && c.parent_id === null);
                          if (!parent) return [];
                          return categories.filter(c => c.parent_id === parent.id).map(cat => cat.name);
                        })()}
                        placeholder="Sub Category"
                        allowAll={false}
                        disabled={!values.subSubCategory}
                      />
                    </div>

                    {/* 1.2 Category (Bottom Level) */}
                    <div>
                      <label className="mb-1.5 block font-bold text-slate-800 dark:text-slate-100">
                        Category <span className="text-rose-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={values.category}
                        onChange={(val) => setFieldValue('category', val)}
                        options={(() => {
                          const parent = categories.find(c => c.name === values.subSubCategory && c.parent_id === null);
                          if (!parent) return [];
                          const sub = categories.find(c => c.name === values.subCategory && c.parent_id === parent.id);
                          if (!sub) return [];
                          return categories.filter(c => c.parent_id === sub.id).map(cat => cat.name);
                        })()}
                        placeholder="Category"
                        allowAll={false}
                        disabled={!values.subCategory}
                        className={touched.category && errors.category ? 'border border-rose-500 rounded-lg' : ''}
                      />
                      {touched.category && errors.category && (
                        <p className="text-[10px] text-rose-500 mt-1 font-semibold">{errors.category as string}</p>
                      )}
                    </div>

                    {/* 1.25 Print Dropdown (Shown when Parent Category includes 'tile') */}
                    {isTileCategory && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block font-bold text-slate-800 dark:text-slate-100">
                            Print
                          </label>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            name="tilePrint"
                            autoComplete="off"
                            onChange={(e) => {
                              handleChange(e);
                              setIsPrintDropdownOpen(true);
                              setHighlightedPrintIndex(0);
                            }}
                            onFocus={() => {
                              setIsPrintDropdownOpen(true);
                              setHighlightedPrintIndex(0);
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                if (!editingPrintName && !deletingPrintItem) {
                                  setIsPrintDropdownOpen(false);
                                }
                              }, 250);
                            }}
                            onKeyDown={(e) => {
                              const filteredPrints = tilePrints.filter((p) =>
                                p.name.toLowerCase().includes(String(values.tilePrint || '').toLowerCase().trim())
                              );
                              const showAddPrint = !!(String(values.tilePrint || '').trim() && !tilePrints.some(p => p.name.toLowerCase() === String(values.tilePrint || '').trim().toLowerCase()));
                              const totalOptions = filteredPrints.length + (showAddPrint ? 1 : 0);

                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                if (totalOptions > 0) {
                                  setHighlightedPrintIndex((prev) => prev < totalOptions - 1 ? prev + 1 : 0);
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                if (totalOptions > 0) {
                                  setHighlightedPrintIndex((prev) => prev > 0 ? prev - 1 : totalOptions - 1);
                                }
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                if (showAddPrint && highlightedPrintIndex === filteredPrints.length) {
                                  handleAddPrint(String(values.tilePrint || '').trim(), setFieldValue, values.subSubCategory);
                                  setIsPrintDropdownOpen(false);
                                } else if (filteredPrints.length > 0) {
                                  setFieldValue('tilePrint', (filteredPrints[highlightedPrintIndex] || filteredPrints[0]).name);
                                  setIsPrintDropdownOpen(false);
                                } else if (values.tilePrint && values.tilePrint.trim()) {
                                  handleAddPrint(values.tilePrint.trim(), setFieldValue, values.subSubCategory);
                                  setIsPrintDropdownOpen(false);
                                }
                              } else if (e.key === 'Tab' || e.key === 'Escape') {
                                setIsPrintDropdownOpen(false);
                              }
                            }}
                            value={values.tilePrint}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 pr-8 bg-white dark:bg-slate-800 outline-none focus:border-emerald-600 text-xs font-semibold text-slate-900 dark:text-white"
                            placeholder="Search or enter print..."
                          />

                          {/* Clear (x) button when a value is selected / entered */}
                          {values.tilePrint && (
                            <button
                              type="button"
                              title="Clear Print"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setFieldValue('tilePrint', '');
                                setIsPrintDropdownOpen(true);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                            >
                              <MdClose className="text-sm" />
                            </button>
                          )}

                          {isPrintDropdownOpen && (
                            <div className="absolute left-0 top-full mt-1.5 z-[99999] w-full min-w-[200px] max-h-[250px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                              {(() => {
                                const filteredPrints = tilePrints.filter((p) =>
                                  p.name.toLowerCase().includes(String(values.tilePrint || '').toLowerCase().trim())
                                );
                                const showAddPrint = !!(String(values.tilePrint || '').trim() && !tilePrints.some(p => p.name.toLowerCase() === String(values.tilePrint || '').trim().toLowerCase()));

                                return (
                                  <>
                                    {filteredPrints.length > 0 ? (
                                      filteredPrints.map((pItem, idx) => {
                                        const isHighlighted = idx === highlightedPrintIndex;
                                        const isEditing = editingPrintName === pItem.name;

                                        if (isEditing) {
                                          return (
                                            <div
                                              key={pItem.name}
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                              }}
                                              className="p-2 bg-emerald-50/90 dark:bg-emerald-950/50 border-l-4 border-emerald-500 flex items-center gap-1.5"
                                            >
                                              <input
                                                type="text"
                                                autoFocus
                                                value={editPrintInput}
                                                onChange={(e) => setEditPrintInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                  e.stopPropagation();
                                                  if (e.key === 'Enter') {
                                                    handleSaveEditPrint(e, pItem, setFieldValue);
                                                  } else if (e.key === 'Escape') {
                                                    handleCancelEditPrint(e);
                                                  }
                                                }}
                                                className="flex-1 min-w-0 px-2 py-1 text-xs font-semibold rounded-lg border border-emerald-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                                              />
                                              <button
                                                type="button"
                                                title="Save"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={(e) => handleSaveEditPrint(e, pItem, setFieldValue)}
                                                className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition shrink-0"
                                              >
                                                <MdCheck className="text-sm" />
                                              </button>
                                              <button
                                                type="button"
                                                title="Cancel"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={(e) => handleCancelEditPrint(e)}
                                                className="p-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer transition shrink-0"
                                              >
                                                <MdClose className="text-sm" />
                                              </button>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div
                                            key={pItem.name}
                                            onMouseEnter={() => setHighlightedPrintIndex(idx)}
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setFieldValue('tilePrint', pItem.name);
                                              setIsPrintDropdownOpen(false);
                                            }}
                                            className={`p-2.5 px-3 cursor-pointer transition text-xs font-bold flex items-center justify-between group ${
                                              isHighlighted 
                                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 text-emerald-700 dark:text-emerald-400' 
                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                                            }`}
                                          >
                                            <span className="truncate mr-2">{pItem.name}</span>
                                            <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                              {values.tilePrint === pItem.name && (
                                                <span className="text-[10px] text-emerald-600 font-semibold mr-1">Selected</span>
                                              )}
                                              <button
                                                type="button"
                                                title="Edit Print"
                                                onMouseDown={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                }}
                                                onClick={(e) => handleStartEditPrint(e, pItem.name)}
                                                className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
                                              >
                                                <MdEdit className="text-sm" />
                                              </button>
                                              <button
                                                type="button"
                                                title="Delete Print"
                                                onMouseDown={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                }}
                                                onClick={(e) => handleStartDeletePrint(e, pItem)}
                                                className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                                              >
                                                <MdDelete className="text-sm" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })
                                    ) : null}

                                    {showAddPrint && (
                                      <div 
                                        onMouseEnter={() => setHighlightedPrintIndex(filteredPrints.length)}
                                        className={`p-3 text-center text-xs font-semibold cursor-pointer border-t border-slate-100 dark:border-slate-800 transition ${
                                          highlightedPrintIndex === filteredPrints.length
                                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold'
                                            : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                        }`}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          if (values.tilePrint && values.tilePrint.trim()) {
                                            handleAddPrint(values.tilePrint.trim(), setFieldValue, values.subSubCategory);
                                            setIsPrintDropdownOpen(false);
                                          }
                                        }}
                                      >
                                        + Add "{values.tilePrint || 'New Print'}"
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 4. Brand */}
                    <div>
                      <label className="mb-1.5 block font-bold text-slate-800 dark:text-slate-100">
                        Brand
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          name="finishType"
                          autoComplete="off"
                          onChange={(e) => {
                            handleChange(e);
                            setIsBinDropdownOpen(true);
                            setHighlightedBinIndex(0);
                          }}
                          onFocus={() => {
                            setIsBinDropdownOpen(true);
                            setHighlightedBinIndex(0);
                          }}
                          onBlur={() => {
                            setTimeout(() => setIsBinDropdownOpen(false), 200);
                          }}
                          onKeyDown={(e) => {
                            let availableBins = surfaceFinishes.map((f: any) => f.name);
                            const filteredBins = availableBins.filter(b => b.toLowerCase().includes(String(values.finishType || '').toLowerCase()));
                            
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setHighlightedBinIndex((prev) => prev < filteredBins.length - 1 ? prev + 1 : 0);
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setHighlightedBinIndex((prev) => prev > 0 ? prev - 1 : filteredBins.length - 1);
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (filteredBins.length > 0) {
                                setFieldValue('finishType', filteredBins[highlightedBinIndex] || filteredBins[0]);
                                setIsBinDropdownOpen(false);
                              }
                            } else if (e.key === 'Tab' || e.key === 'Escape') {
                              setIsBinDropdownOpen(false);
                            }
                          }}
                          value={values.finishType}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 outline-none focus:border-emerald-600 text-xs font-semibold text-slate-900 dark:text-white"
                          placeholder="Search or enter brand..."
                        />
                        {isBinDropdownOpen && (
                          <div className="absolute left-0 top-full mt-1.5 z-[99999] w-full min-w-[200px] max-h-[250px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                            {(() => {
                              let availableBins = surfaceFinishes.map((f: any) => f.name);
                              const filteredBins = availableBins.filter(b => b.toLowerCase().includes(String(values.finishType || '').toLowerCase()));
                              
                              return filteredBins.length > 0 ? (
                                filteredBins.map((bin, idx) => {
                                  const isHighlighted = idx === highlightedBinIndex;
                                  return (
                                    <div
                                      key={bin}
                                      onMouseEnter={() => setHighlightedBinIndex(idx)}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setFieldValue('finishType', bin);
                                        setIsBinDropdownOpen(false);
                                      }}
                                      className={`p-3 cursor-pointer transition text-xs font-bold flex items-center ${
                                        isHighlighted 
                                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 text-emerald-700 dark:text-emerald-400' 
                                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                                      }`}
                                    >
                                      {bin}
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="p-4 text-center text-xs text-slate-400 italic">
                                  Press Enter to add "{values.finishType}"
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 5. UOM */}
                    <div>
                      <label className="mb-1.5 block font-bold text-slate-800 dark:text-slate-100">
                        {isTileCategory ? 'Inventory UOM (e.g. BOX)' : 'UOM *'}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          name="uom"
                          autoComplete="off"
                          onChange={(e) => {
                            handleChange(e);
                            setIsUomDropdownOpen(true);
                            setHighlightedUomIndex(0);
                          }}
                          onFocus={() => {
                            setIsUomDropdownOpen(true);
                            setHighlightedUomIndex(0);
                          }}
                          onBlur={() => {
                            setTimeout(() => setIsUomDropdownOpen(false), 200);
                          }}
                          onKeyDown={(e) => {
                            let availableUoms: string[] = [];
                            if (isTileCategory) {
                              availableUoms = ['BOX', 'SQM', 'SQFT', 'PCS'];
                            }
                            Object.keys(groupedUoms).forEach(cat => {
                              groupedUoms[cat].forEach(u => availableUoms.push(u.short_code));
                            });
                            availableUoms.push('EACH');
                            availableUoms = Array.from(new Set(availableUoms));
                            const filteredUoms = availableUoms.filter(u => u.toLowerCase().includes(String(values.uom || '').toLowerCase()));
                            
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setHighlightedUomIndex((prev) => prev < filteredUoms.length - 1 ? prev + 1 : 0);
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setHighlightedUomIndex((prev) => prev > 0 ? prev - 1 : filteredUoms.length - 1);
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (filteredUoms.length > 0) {
                                setFieldValue('uom', filteredUoms[highlightedUomIndex] || filteredUoms[0]);
                                setIsUomDropdownOpen(false);
                              }
                            } else if (e.key === 'Tab' || e.key === 'Escape') {
                              setIsUomDropdownOpen(false);
                            }
                          }}
                          value={values.uom}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 outline-none focus:border-emerald-600 text-xs font-bold text-emerald-600 dark:text-emerald-400"
                          placeholder="Search or enter UOM..."
                        />
                        {isUomDropdownOpen && (
                          <div className="absolute left-0 top-full mt-1.5 z-[99999] w-full min-w-[200px] max-h-[250px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                            {(() => {
                              let availableUoms: string[] = [];
                              if (isTileCategory) {
                                availableUoms = ['BOX', 'SQM', 'SQFT', 'PCS'];
                              }
                              Object.keys(groupedUoms).forEach(cat => {
                                groupedUoms[cat].forEach(u => availableUoms.push(u.short_code));
                              });
                              availableUoms.push('EACH');
                              availableUoms = Array.from(new Set(availableUoms));
                              const filteredUoms = availableUoms.filter(u => u.toLowerCase().includes(String(values.uom || '').toLowerCase()));
                              
                              return filteredUoms.length > 0 ? (
                                filteredUoms.map((uom, idx) => {
                                  const isHighlighted = idx === highlightedUomIndex;
                                  return (
                                    <div
                                      key={uom}
                                      onMouseEnter={() => setHighlightedUomIndex(idx)}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setFieldValue('uom', uom);
                                        setIsUomDropdownOpen(false);
                                      }}
                                      className={`p-3 cursor-pointer transition text-xs font-bold flex items-center ${
                                        isHighlighted 
                                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 text-emerald-700 dark:text-emerald-400' 
                                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                                      }`}
                                    >
                                      {uom}
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="p-4 text-center text-xs text-slate-400 italic">
                                  Press Enter to add "{values.uom}"
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 6. Code */}
                    <div>
                      <label className="mb-1.5 block font-bold text-slate-800 dark:text-slate-100">
                        Code
                      </label>
                      <input
                        type="text"
                        name="itemSrNo"
                        onChange={handleChange}
                        value={values.itemSrNo}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 outline-none focus:border-emerald-600 text-xs text-slate-800 dark:text-white font-mono"
                        placeholder="Enter Code"
                      />
                    </div>

                    {/* 7. Description */}
                    <div className="sm:col-span-2 md:col-span-1 lg:col-span-1">
                      <label className="mb-1.5 block font-bold text-slate-800 dark:text-slate-100">
                        Description *
                      </label>
                      <input
                        type="text"
                        name="productName"
                        onChange={handleChange}
                        value={values.productName}
                        className={`w-full rounded-xl border p-2.5 bg-white dark:bg-slate-800 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 text-xs text-slate-900 dark:text-white ${
                          touched.productName && errors.productName ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                        }`}
                        placeholder={isTileCategory ? "e.g. Master Tiles Calacatta White 60x60 (Glazed Polished)" : "Enter Description"}
                      />
                      {touched.productName && errors.productName && (
                        <p className="text-[10px] text-rose-500 mt-1 font-semibold">{errors.productName as string}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. DYNAMIC TILE SPECIFIC SECTION (Only shown when category = Tile) */}
                {isTileCategory && (
                  <div className="bg-white dark:bg-boxdark rounded-2xl border border-teal-500/30 dark:border-teal-500/20 shadow-sm p-5 space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400 font-bold text-sm">
                        <MdSquareFoot className="text-xl" />
                        <span>Tile Sizing (Inches) & Box Packaging Setup</span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">Unit: Inches (in) | Area: Square Meters (sq.m)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {/* Dimension Unit - Fixed Static */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                          Dimension Unit
                        </label>
                        <input
                          type="text"
                          readOnly
                          value="Inches (in)"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-100 dark:bg-slate-800 outline-none text-xs font-bold text-teal-700 dark:text-teal-400 cursor-not-allowed"
                        />
                      </div>

                      {/* Height (in) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                          Tile Height (in) *
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          name="tileHeight"
                          value={values.tileHeight}
                          onChange={handleChange}
                          placeholder="e.g. 12 or 24"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-teal-600 text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Width (in) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                          Tile Width (in) *
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          name="tileWidth"
                          value={values.tileWidth}
                          onChange={handleChange}
                          placeholder="e.g. 24 or 48"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-teal-600 text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Pieces Per Box */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                          Pieces Per Box *
                        </label>
                        <input
                          type="number"
                          min="1"
                          name="piecesPerBox"
                          value={values.piecesPerBox}
                          onChange={handleChange}
                          placeholder="e.g. 4 or 8"
                          className="w-full rounded-xl border border-teal-500/50 dark:border-teal-500/50 p-2.5 bg-teal-50/30 dark:bg-teal-950/20 outline-none focus:border-teal-600 text-xs font-mono font-black text-teal-800 dark:text-teal-300"
                        />
                      </div>

                      {/* Thickness (Optional) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                          Thickness <span className="text-slate-400 font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          name="tileThickness"
                          value={values.tileThickness}
                          onChange={handleChange}
                          placeholder="e.g. 9 mm"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-teal-600 text-xs text-slate-800 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* LIVE COMPUTED SQUARE METER BADGES */}
                    <div className="bg-teal-50 dark:bg-teal-950/40 rounded-xl p-4 border border-teal-200 dark:border-teal-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📐</span>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Formatted Tile Size:</span>
                          <strong className="text-teal-800 dark:text-teal-300 font-bold text-sm">{tileSizeFormatted}</strong>
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Area per Tile:</span>
                        <strong className="text-slate-900 dark:text-white font-mono font-bold text-sm">
                          {sqMetersPerTile.toFixed(4)} sq.m
                        </strong>
                      </div>

                      <div className="bg-white dark:bg-slate-900 px-5 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 shadow-xs">
                        <span className="text-teal-600 dark:text-teal-400 block text-[10px] font-bold uppercase tracking-wider">
                          Total Coverage Per Box:
                        </span>
                        <strong className="text-teal-800 dark:text-teal-300 font-mono font-black text-lg">
                          {totalSqMetersPerBox.toFixed(4)} sq.m
                        </strong>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono ml-2">
                          / Box
                        </span>
                      </div>
                    </div>
                  </div>
                )}


                {/* 4. PRICING SECTION (Clean Purchase Price & Sale Price) */}
                <div className="bg-white dark:bg-boxdark rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                      <MdAttachMoney className="text-emerald-600 text-xl" />
                      <span>{isTileCategory ? 'Tile Box Pricing & Rate Breakdown' : 'Product Pricing & Margin'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-semibold">Calculated Margin:</span>
                      <span className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-xs px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                        +{profitMarginPercent}% (Rs. {profit.toFixed(2)}/{isTileCategory ? 'box' : (values.uom || 'unit')})
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {/* Purchase Price Input */}
                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                        {isTileCategory ? 'Purchase Price (Per Box) *' : 'Purchase Price *'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        name="purchasePrice"
                        onKeyDown={blockInvalidChar}
                        value={values.purchasePrice}
                        onChange={handleChange}
                        placeholder="0.00"
                        className={`w-full rounded-xl border p-3 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-emerald-600 text-sm font-mono font-bold text-slate-900 dark:text-white ${
                          touched.purchasePrice && errors.purchasePrice ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                        }`}
                      />
                      {isTileCategory && (
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] mt-2 font-mono">
                          <span className="bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 font-semibold border border-slate-200/60 dark:border-slate-600">
                            ≈ Rs. {purchasePerPiece} <span className="text-[10px] text-slate-500 font-normal">/ tile (pc)</span>
                          </span>
                          <span className="text-slate-500">
                            ≈ Rs. {purchasePerSqm} / sq.m
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Sale Price Input */}
                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                        {isTileCategory ? 'Sale Price (Per Box) *' : 'Sale Price (Retail Rate) *'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        name="retailPrice"
                        onKeyDown={blockInvalidChar}
                        value={values.retailPrice}
                        onChange={handleChange}
                        placeholder="0.00"
                        className={`w-full rounded-xl border p-3 bg-emerald-50/20 dark:bg-emerald-950/20 outline-none focus:border-emerald-600 text-sm font-mono font-black text-emerald-700 dark:text-emerald-300 ${
                          touched.retailPrice && errors.retailPrice ? 'border-rose-500' : 'border-emerald-500/50 dark:border-emerald-500/50'
                        }`}
                      />
                      {isTileCategory && (
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] mt-2 font-mono">
                          <span className="bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300/60 dark:border-emerald-700/60">
                            ≈ Rs. {salePerPiece} <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">/ tile (loose pc)</span>
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            ≈ Rs. {salePerSqm} / sq.m
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Service Charges Input - only for service items */}
                    {values.itemType === 'service' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                          Service Charges *
                        </label>
                        <input
                          type="number"
                          step="any"
                          name="serviceCharges"
                          onKeyDown={blockInvalidChar}
                          value={values.serviceCharges}
                          onChange={handleChange}
                          placeholder="0.00"
                          className="w-full rounded-xl border p-3 bg-indigo-50/20 dark:bg-indigo-950/20 outline-none focus:border-indigo-500 text-sm font-mono font-black text-indigo-700 dark:text-indigo-300 border-indigo-400/50 dark:border-indigo-500/50"
                        />
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
                          Rate charged to the customer for this service.
                        </p>
                      </div>
                    )}

                    {/* Minimum Stock Alert Input (Optional) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1 flex items-center justify-between">
                        <span>Minimum Stock Alert</span>
                        <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        name="minStockAlert"
                        onKeyDown={blockInvalidChar}
                        value={values.minStockAlert}
                        onChange={handleChange}
                        placeholder={isTileCategory ? "e.g. 20 (Boxes)" : "e.g. 10 (Units)"}
                        className={`w-full rounded-xl border p-3 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-amber-500 text-sm font-mono font-bold text-slate-900 dark:text-white ${
                          touched.minStockAlert && errors.minStockAlert ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
                        }`}
                      />
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
                        Turns stock count <span className="text-rose-500 font-bold">RED</span> when remaining inventory hits or drops below this quantity.
                      </p>
                    </div>
                  </div>
                </div>

                {/* FORM ACTIONS */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/Administration/Products/List')}
                    className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <Spinner /> : <MdViewModule className="text-base" />}
                    <span>{isEditMode ? 'Update Product' : isTileCategory ? 'Save Tile Product' : 'Save Product'}</span>
                  </button>
                </div>

                                {/* DELETE PRINT CONFIRMATION MODAL POPUP */}
                {deletingPrintItem && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setDeletingPrintItem(null);
                      }
                    }}
                    className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
                  >
                    <div
                      className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-sm w-full overflow-hidden p-5 space-y-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 shrink-0">
                          <MdDelete className="text-xl" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">Delete Print</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Are you sure you want to delete <span className="font-bold text-slate-800 dark:text-slate-200">"{deletingPrintItem.name}"</span>?
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          autoFocus
                          ref={(btn) => btn && btn.focus()}
                          onClick={() => setDeletingPrintItem(null)}
                          className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer border border-transparent focus:ring-2 focus:ring-slate-400 focus:outline-none"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmDeletePrint(setFieldValue, values.tilePrint)}
                          className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 rounded-xl shadow-sm transition flex items-center gap-1 cursor-pointer focus:ring-2 focus:ring-rose-400 focus:outline-none"
                        >
                          <MdDelete className="text-sm" />
                          Delete
                        </button>
                      </div>
                    </div>
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

export default AddProduct;
