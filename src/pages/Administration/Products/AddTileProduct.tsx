import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import {
  MdViewModule,
  MdLayers,
  MdAttachMoney,
  MdArrowBack,
  MdCheckCircle,
  MdSquareFoot,
} from 'react-icons/md';
import SearchableDropdown from '../../../components/SearchableDropdown';

interface UomItem {
  id: number;
  short_code: string;
  full_name: string;
  category: string;
  is_active: boolean;
}

const AddTileProduct: React.FC = () => {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const editData = location.state?.product;
  const isEditMode = !!editData;

  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);

  // Master lists
  const [categories, setCategories] = useState<any[]>([]);

  const [groupedUoms, setGroupedUoms] = useState<{ [key: string]: UomItem[] }>({});

  // Standard Product Form State
  const [productName, setProductName] = useState(editData?.product_name || '');
  const [category, setCategory] = useState(editData?.category || '');
  const [subCategory, setSubCategory] = useState(editData?.sub_category || '');
  const [subSubCategory, setSubSubCategory] = useState(editData?.sub_sub_category || '');

  const [uom, setUom] = useState(editData?.uom || 'BOX');
  const [itemSrNo, setItemSrNo] = useState(editData?.item_sr_no || '');
  const [sroScheduleNo, setSroScheduleNo] = useState(editData?.sro_schedule_no || '');
  const [scenarioName, setScenarioName] = useState(editData?.scenario_name || 'Standard Tile');
  const [finishType, setFinishType] = useState('Glazed Polished');

  // Tile Specific Dimensions & Box Packing State (Inches to sq.m)
  const [tileHeight, setTileHeight] = useState<number | string>(24);
  const [tileWidth, setTileWidth] = useState<number | string>(24);
  const [tileThickness, setTileThickness] = useState('');
  const [piecesPerBox, setPiecesPerBox] = useState<number | string>(
    (() => {
      const raw = Number(editData?.pieces_per_box || editData?.pcs_per_box || editData?.pieces_per_packing || 0);
      if (raw > 1) return raw;
      const match = String(editData?.product_description || '').match(/Box:\s*(\d+)\s*pcs/i);
      if (match && Number(match[1]) > 0) return Number(match[1]);
      return raw > 0 ? raw : 4;
    })()
  );
  const [weightPerBox, setWeightPerBox] = useState<number | string>(28);

  // Pricing State (Purchase Price & Sale Price)
  const [purchasePrice, setPurchasePrice] = useState<number | string>(editData?.purchase_price || 2400);
  const [salePrice, setSalePrice] = useState<number | string>(editData?.retail_price || 3200);
  const [minStockAlert, setMinStockAlert] = useState<number | string>(editData?.min_stock_alert !== undefined && editData?.min_stock_alert !== null ? editData.min_stock_alert : '');

  useEffect(() => {
    const fetchMasterMetadata = async () => {
      try {
        setMetadataLoading(true);
        const activeTenant = tenantId || 'bashir';

        const { data: catData } = await supabase
          .from('inventory_categories')
          .select('id, name, parent_id')
          .order('name', { ascending: true });

        const { data: uomData } = await supabase
          .from('inventory_uom')
          .select('*')
          .eq('is_active', true)
          .order('category', { ascending: true })
          .order('short_code', { ascending: true });

        if (catData) {
          setCategories(catData);
          if (!subSubCategory) {
            const tileCat = catData.find((c: any) => c.name.toLowerCase().includes('tile') && c.parent_id === null);
            if (tileCat) setSubSubCategory(tileCat.name);
          }
        }


        if (uomData && uomData.length > 0) {
          const groups = uomData.reduce((acc: { [key: string]: UomItem[] }, curr: UomItem) => {
            const cat = curr.category || 'General';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(curr);
            return acc;
          }, {});
          setGroupedUoms(groups);
        }
      } catch (err: any) {
        console.error('Metadata aggregation error:', err);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchMasterMetadata();
  }, []);

  // Compute Area per Tile in Square Meters (Dimensions in Inches)
  // 1 inch = 0.025 m; Area = (h * 0.025) * (w * 0.025) sq.m
  const sqMetersPerTile = useMemo(() => {
    const h = Number(tileHeight) || 0;
    const w = Number(tileWidth) || 0;
    if (h <= 0 || w <= 0) return 0;
    return (h * 0.025) * (w * 0.025);
  }, [tileHeight, tileWidth]);

  // Total Coverage per Box in Square Meters
  const totalSqMetersPerBox = useMemo(() => {
    const pcs = Number(piecesPerBox) || 1;
    return sqMetersPerTile * pcs;
  }, [sqMetersPerTile, piecesPerBox]);

  // Auto-formatted Tile Size String in Inches (e.g. 24 × 24 in)
  const tileSizeFormatted = useMemo(() => {
    return `${tileHeight} × ${tileWidth} in`;
  }, [tileHeight, tileWidth]);

  // Auto-generate Description if empty
  useEffect(() => {
    if (!isEditMode && (!productName || productName.startsWith('Tile '))) {
      setProductName(`Tile ${tileSizeFormatted} (${finishType})`);
  }, [tileSizeFormatted, finishType, isEditMode]);

  // Rates breakdown calculations
  const numSale = Number(salePrice) || 0;
  const numPurchase = Number(purchasePrice) || 0;
  const numPcs = Number(piecesPerBox) || 1;
  const numSqm = totalSqMetersPerBox > 0 ? totalSqMetersPerBox : 1;

  const salePerSqm = (numSale / numSqm).toFixed(2);
  const salePerPiece = (numSale / numPcs).toFixed(2);
  const purchasePerSqm = (numPurchase / numSqm).toFixed(2);
  const purchasePerPiece = (numPurchase / numPcs).toFixed(2);

  const profitPerBox = numSale - numPurchase;
  const profitMarginPercent = numPurchase > 0 ? ((profitPerBox / numPurchase) * 100).toFixed(1) : '0';

  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
    ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productName.trim()) {
      toast.error('Please enter a Description for the tile item');
      return;
    }
    if (!purchasePrice || !salePrice) {
      toast.error('Please enter purchase price and sale price');
      return;
    }

    try {
      setLoading(true);

      const tileDetailsSummary = `[TILE PRODUCT] Size: ${tileSizeFormatted} | Box: ${piecesPerBox} pcs (${totalSqMetersPerBox.toFixed(
        4
      )} sq.m / box) | Finish: ${finishType}${tileThickness ? ` | Thickness: ${tileThickness}` : ''}${
        weightPerBox ? ` | Wt: ${weightPerBox}kg` : ''
      }`;

      const databasePayload: any = {
        item_type: 'goods',
        product_name: productName.trim(),
        category: category,
        sub_category: subCategory,
        sub_sub_category: subSubCategory,

        uom: uom || 'BOX',
        product_description: tileDetailsSummary,
        profit: Number(profitPerBox.toFixed(2)),
        purchase_price: numPurchase,
        scenario_name: scenarioName || 'Tile Box Metric',
        mrp: numSale,
        retail_price: numSale,
        min_stock_alert: minStockAlert !== '' && minStockAlert !== null ? Number(minStockAlert) : 0,
        pieces_per_box: numPcs,
        pcs_per_box: numPcs,
        pieces_per_packing: numPcs,
        hs_code: '6907.2100',
        item_sr_no: itemSrNo.trim() || tileSizeFormatted,
        sro_schedule_no: sroScheduleNo.trim(),
      };

      // 🔍 SKU Uniqueness Validation: Prevent duplicate Codes
      const finalSku = itemSrNo.trim() || tileSizeFormatted;
      if (finalSku) {
        let skuQuery = supabase
          .from('products')
          .select('id, product_name, item_sr_no')
          .ilike('item_sr_no', finalSku);

        if (isEditMode && editData?.id) {
          skuQuery = skuQuery.neq('id', editData.id);
        }

        const { data: existingSku } = await skuQuery;
        if (existingSku && existingSku.length > 0) {
          toast.error(`Code "${finalSku}" is already assigned to "${existingSku[0].product_name}". Each product must have a unique SKU!`, {
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
        toast.success(`Tile product "${productName}" updated successfully!`);
      } else {
        const { error } = await supabase.from('products').insert([databasePayload]);

        if (error) throw error;
        toast.success(`Tile product "${productName}" added to catalog!`);
      }

      navigate('/Administration/Products/List');
    } catch (err: any) {
      console.error('Save Tile Error:', err);
      toast.error('Failed to save tile product: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (metadataLoading) {
    return (
      <div className="flex h-64 items-center justify-center bg-white dark:bg-boxdark rounded-2xl border border-stroke dark:border-strokedark shadow-default">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12 font-sans">
      
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-boxdark p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center justify-center text-2xl shadow-xs">
            <MdViewModule />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {isEditMode ? `Edit Tile Item: ${editData.product_name}` : 'Add New Tile Master Product'}
              </h2>
              <span className="bg-teal-500/20 text-teal-700 dark:text-teal-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-teal-500/30 uppercase tracking-wider">
                Inches & Square Meter Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tile Dimensions (in), Packaging (Pieces/Box), Square Meter Coverage & Box Costing
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/Administration/Products/List')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white bg-slate-100 dark:bg-meta-4/40 hover:bg-slate-200 dark:hover:bg-meta-4 transition cursor-pointer"
        >
          <MdArrowBack /> Return to Inventory List
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* SECTION 1: TILE DIMENSION & PACKAGING ENGINE */}
        <div className="bg-white dark:bg-boxdark rounded-2xl border border-teal-500/30 dark:border-teal-500/20 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400 font-bold text-sm">
              <MdSquareFoot className="text-xl" />
              <span>1. Tile Sizing (Inches) & Box Packaging Setup</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">Unit: Inches (in) | Area: Square Meters (m²)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            
            {/* Dimension Unit - Fixed / Static Inches */}
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

            {/* Height / Length (in) */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Tile Height (in) *
              </label>
              <input
                type="number"
                step="any"
                min="0.1"
                required
                value={tileHeight}
                onChange={e => setTileHeight(e.target.value)}
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
                required
                value={tileWidth}
                onChange={e => setTileWidth(e.target.value)}
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
                required
                value={piecesPerBox}
                onChange={e => setPiecesPerBox(e.target.value)}
                placeholder="e.g. 4"
                className="w-full rounded-xl border border-teal-500/50 dark:border-teal-500/50 p-2.5 bg-teal-50/30 dark:bg-teal-950/20 outline-none focus:border-teal-600 text-xs font-mono font-black text-teal-800 dark:text-teal-300"
              />
            </div>

            {/* Tile Thickness (Optional) */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Thickness <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={tileThickness}
                onChange={e => setTileThickness(e.target.value)}
                placeholder="e.g. 9 mm"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-teal-600 text-xs text-slate-800 dark:text-white"
              />
            </div>

            {/* Brand */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Brand
              </label>
              <select
                value={finishType}
                onChange={e => setFinishType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-teal-600 text-xs text-slate-800 dark:text-slate-200"
              >
                <option value="Glazed Polished">Glazed Polished (High Gloss)</option>
                <option value="Super White Matte">Matte / Satin Finish</option>
                <option value="Carving / Sugar">Carving / Sugar Finish</option>
                <option value="Rustic Anti-Slip">Rustic / Anti-Slip</option>
                <option value="Wooden Planks">Wooden Grain Finish</option>
                <option value="Full Body Porcelain">Full Body Porcelain</option>
              </select>
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

        {/* SECTION 2: PRODUCT MASTER ATTRIBUTES */}
        <div className="bg-white dark:bg-boxdark rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm border-b border-slate-100 dark:border-slate-800 pb-3">
            <MdLayers className="text-emerald-600 text-xl" />
            <span>2. General Product Attributes & Identification</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            
            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Tile Description / Model Title *
              </label>
              <input
                type="text"
                required
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="e.g. Master Tiles Calacatta White 60x60 (Glazed Polished)"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-emerald-600 text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            {/* 1. Parent Category (Top Level) */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Parent Category
              </label>
              <SearchableDropdown
                value={subSubCategory}
                onChange={val => {
                  setSubSubCategory(val);
                  setSubCategory('');
                  setCategory('');
                }}
                options={categories.filter(c => c.parent_id === null).map(c => c.name)}
                placeholder="Parent Category"
                allowAll={false}
              />
            </div>

            {/* 1.1 Sub Category (Middle Level) */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Sub Category
              </label>
              <SearchableDropdown
                value={subCategory}
                onChange={val => {
                  setSubCategory(val);
                  setCategory('');
                }}
                options={(() => {
                  const parent = categories.find(c => c.name === subSubCategory && c.parent_id === null);
                  if (!parent) return [];
                  return categories.filter(c => c.parent_id === parent.id).map(c => c.name);
                })()}
                placeholder="Sub Category"
                allowAll={false}
                disabled={!subSubCategory}
              />
            </div>

            {/* 1.2 Category (Bottom Level) */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Category *
              </label>
              <SearchableDropdown
                value={category}
                onChange={val => setCategory(val)}
                options={(() => {
                  const parent = categories.find(c => c.name === subSubCategory && c.parent_id === null);
                  if (!parent) return [];
                  const sub = categories.find(c => c.name === subCategory && c.parent_id === parent.id);
                  if (!sub) return [];
                  return categories.filter(c => c.parent_id === sub.id).map(c => c.name);
                })()}
                placeholder="Category"
                allowAll={false}
                disabled={!subCategory}
              />
            </div>



            {/* Base UOM */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Base Inventory UOM *
              </label>
              <select
                value={uom}
                onChange={e => setUom(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-emerald-600 text-xs font-bold text-emerald-600 dark:text-emerald-400"
              >
                <option value="BOX">BOX = Master Tile Box</option>
                <option value="SQM">SQM = Square Meter</option>
                <option value="SQFT">SQFT = Square Feet</option>
                <option value="PCS">PCS = Pieces</option>
                {Object.keys(groupedUoms).map(catName => (
                  <optgroup key={catName} label={catName}>
                    {groupedUoms[catName].map(u => (
                      <option key={u.id} value={u.short_code}>
                        {u.short_code} = {u.full_name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Weight per Box (kg) */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Weight Per Box (kg) <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="number"
                step="any"
                value={weightPerBox}
                onChange={e => setWeightPerBox(e.target.value)}
                placeholder="e.g. 28 kg"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-emerald-600 text-xs text-slate-800 dark:text-white font-mono"
              />
            </div>

          </div>
        </div>

        {/* SECTION 3: PRICING (PURCHASE PRICE & SALE PRICE) */}
        <div className="bg-white dark:bg-boxdark rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
              <MdAttachMoney className="text-emerald-600 text-xl" />
              <span>3. Box Pricing & Rate Calculations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Margin:</span>
              <span className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-xs px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                +{profitMarginPercent}% (Rs. {profitPerBox.toFixed(2)}/box)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            
            {/* Purchase Price Input */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Purchase Price (Per Box) *
              </label>
              <input
                type="number"
                step="any"
                required
                onKeyDown={blockInvalidChar}
                value={purchasePrice}
                onChange={e => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-emerald-600 text-sm font-mono font-bold text-slate-900 dark:text-white"
              />
              <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] mt-2 font-mono">
                <span className="bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 font-semibold border border-slate-200/60 dark:border-slate-600">
                  ≈ Rs. {purchasePerPiece} <span className="text-[10px] text-slate-500 font-normal">/ tile (pc)</span>
                </span>
                <span className="text-slate-500">
                  ≈ Rs. {purchasePerSqm} / sq.m
                </span>
              </div>
            </div>

            {/* Sale Price Input */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                Sale Price (Per Box) *
              </label>
              <input
                type="number"
                step="any"
                required
                onKeyDown={blockInvalidChar}
                value={salePrice}
                onChange={e => setSalePrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-emerald-500/50 dark:border-emerald-500/50 p-3 bg-emerald-50/20 dark:bg-emerald-950/20 outline-none focus:border-emerald-600 text-sm font-mono font-black text-emerald-700 dark:text-emerald-300"
              />
              <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] mt-2 font-mono">
                <span className="bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300/60 dark:border-emerald-700/60">
                  ≈ Rs. {salePerPiece} <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">/ tile (loose pc)</span>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  ≈ Rs. {salePerSqm} / sq.m
                </span>
              </div>
            </div>

            {/* Minimum Stock Alert Input */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1 flex items-center justify-between">
                <span>Minimum Stock Alert</span>
                <span className="text-[10px] text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="number"
                min="0"
                onKeyDown={blockInvalidChar}
                value={minStockAlert}
                onChange={e => setMinStockAlert(e.target.value)}
                placeholder="e.g. 20 (Boxes)"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/80 outline-none focus:border-amber-500 text-sm font-mono font-bold text-slate-900 dark:text-white"
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
                Turns stock count <span className="text-rose-500 font-bold">RED</span> when remaining inventory hits or drops below this box quantity.
              </p>
            </div>
          </div>        </div>
        </div>

        {/* SUBMIT BUTTONS */}
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
            {loading ? <Spinner /> : <MdCheckCircle className="text-base" />}
            <span>{isEditMode ? 'Update Tile Product' : 'Save Tile Product to Catalog'}</span>
          </button>
        </div>

      </form>
    </div>
  );
};

export default AddTileProduct;
