import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import SearchableMultiSelect from '../../../components/SearchableMultiSelect';
import SearchableDropdown from '../../../components/SearchableDropdown';

const PurchaseReport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);

  const initialTab = (location.state?.activeTab || location.state?.tab || 'purchase') as 'purchase' | 'return' | 'invoice';
  const [activeTab, setActiveTab] = useState<'purchase' | 'return' | 'invoice'>(initialTab);

  const [vendors, setVendors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [bins, setBins] = useState<any[]>([]);

  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [availableInvoices, setAvailableInvoices] = useState<any[]>([]);

  const getPastWeekDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  };

  const getTodayDateString = () => {
    return new Date().toISOString().split('T')[0];
  };

  const parseCriteriaArray = (val: any) => Array.isArray(val) ? val : (typeof val === 'string' && val !== 'All' ? [val] : []);

  const [criteria, setCriteria] = useState(() => {
    const base = location.state?.criteria || {};
    return {
      vendor: location.state?.vendor ? [location.state.vendor] : parseCriteriaArray(base.vendor),
      parentCategory: location.state?.parentCategory ? [location.state.parentCategory] : parseCriteriaArray(base.parentCategory),
      subCategory: location.state?.subCategory ? [location.state.subCategory] : parseCriteriaArray(base.subCategory),
      subSubCategory: location.state?.subSubCategory ? [location.state.subSubCategory] : parseCriteriaArray(base.subSubCategory),
      uom: parseCriteriaArray(base.uom), 
      bin: parseCriteriaArray(base.bin), 
      product: parseCriteriaArray(base.product), 
      location: parseCriteriaArray(base.location), 
      purchaseType: base.purchaseType || 'All', 
      invoiceNo: base.invoiceNo || 'All',
      dateFrom: location.state?.dateFrom || base.dateFrom || getPastWeekDateString(),
      dateTo: location.state?.dateTo || base.dateTo || getTodayDateString()
    };
  });

  useEffect(() => {
    navigate('.', { replace: true, state: { ...location.state, activeTab, criteria } });
  }, [activeTab, criteria, navigate]);

  useEffect(() => {
    const fetchPurchaseCriteriaLookups = async () => {
      try {
        setLoading(true);
        const [vendRes, catRes, prodRes, locRes, purInvRes, uomRes, binRes] = await Promise.all([
          supabase.from('vendors').select('id, vendor_name'),
          supabase.from('inventory_categories').select('id, name, parent_id'),
          supabase.from('products').select('id, product_name, category, bin, uom'),
          supabase.from('inventory_locations').select('id, name'),
          supabase.from('supplier_purchases').select('id, total_amount, supplier_name, purchase_no').order('id', { ascending: false }),
          supabase.from('inventory_uom').select('id, short_code, full_name').eq('tenant_id', tenantId || 'bashir').eq('is_active', true),
          supabase.from('inventory_surface_finishes').select('id, name')
        ]);

        if (vendRes.data) setVendors(vendRes.data);
        if (catRes.data) setCategories(catRes.data);
        if (prodRes.data) setProducts(prodRes.data);
        if (locRes.data) setLocations(locRes.data);
        if (binRes.data) setBins(binRes.data);
        if (purInvRes.data) setAvailableInvoices(purInvRes.data);

        if (uomRes.data) {
          const normalizedUoms = uomRes.data.map((u: any) => ({
            id: u.id,
            name: `${u.short_code} = ${u.full_name}`
          }));
          setUoms(normalizedUoms);
        }
      } catch (err: any) {
        toast.error('Purchase registry lookup interruption: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPurchaseCriteriaLookups();
  }, [tenantId]);

  const handleInputChange = (field: string, value: any) => {
    setCriteria(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'bin') updated.product = [];
      if (field === 'parentCategory') {
        updated.subCategory = [];
        updated.subSubCategory = [];
      }
      if (field === 'subCategory') {
        updated.subSubCategory = [];
      }
      return updated;
    });
  };

  const getContextualProductSelectionPool = () => {
    if (!criteria.bin || criteria.bin.length === 0) return products;
    const selectedBins = criteria.bin.map((b: string) => b.toLowerCase());
    return products.filter(p => selectedBins.includes(String(p.bin || '').trim().toLowerCase()));
  };

  const vendorOptions = useMemo(() => vendors.map(v => v.vendor_name).filter(Boolean), [vendors]);
  const parentCategories = useMemo(() => categories.filter(c => c.parent_id === null), [categories]);
  const subCategories = useMemo(() => {
    if (!criteria.parentCategory || criteria.parentCategory.length === 0) {
      const parentIds = new Set(parentCategories.map(p => p.id));
      return categories.filter(c => c.parent_id !== null && parentIds.has(c.parent_id));
    }
    const selectedPCatIds = new Set(parentCategories.filter(c => criteria.parentCategory.includes(c.name)).map(c => c.id));
    return categories.filter(c => c.parent_id !== null && selectedPCatIds.has(c.parent_id));
  }, [categories, criteria.parentCategory, parentCategories]);
  
  const bottomCategories = useMemo(() => {
    if (!criteria.subCategory || criteria.subCategory.length === 0) {
      const subIds = new Set(subCategories.map(s => s.id));
      return categories.filter(c => c.parent_id !== null && subIds.has(c.parent_id));
    }
    const selectedSCatIds = new Set(subCategories.filter(c => criteria.subCategory.includes(c.name)).map(c => c.id));
    return categories.filter(c => c.parent_id !== null && selectedSCatIds.has(c.parent_id));
  }, [categories, criteria.subCategory, subCategories]);

  const parentCategoryOptions = useMemo(() => parentCategories.map(c => c.name).filter(Boolean), [parentCategories]);
  const subCategoryOptions = useMemo(() => subCategories.map(c => c.name).filter(Boolean), [subCategories]);
  const subSubCategoryOptions = useMemo(() => bottomCategories.map(c => c.name).filter(Boolean), [bottomCategories]);
  const uomOptions = useMemo(() => uoms.map(u => u.name).filter(Boolean), [uoms]);
  const binOptions = useMemo(() => bins.map(b => b.name).filter(Boolean), [bins]);

  const handleTabChange = (tab: 'purchase' | 'return' | 'invoice') => {
    setActiveTab(tab);
    setCriteria(prev => ({
      vendor: [],
      parentCategory: [], subCategory: [], subSubCategory: [],
      uom: [], bin: [], product: [], location: [], purchaseType: 'All', invoiceNo: 'All',
      dateFrom: prev.dateFrom,
      dateTo: prev.dateTo
    }));
  };

  const productOptions = useMemo(() => getContextualProductSelectionPool().map(p => p.product_name).filter(Boolean), [products, criteria.bin]);
  const locationOptions = useMemo(() => locations.map(l => l.name).filter(Boolean), [locations]);
  const invoiceOptions = useMemo(() => availableInvoices.map(i => i.purchase_no || `PUR-${String(i.id).padStart(4, '0')}`), [availableInvoices]);

  const handleDispatchReportView = () => {
    if (activeTab === 'invoice' && criteria.invoiceNo === 'All') {
      toast.error('Please isolate or choose a target document profile reference ID');
      return;
    }
    if (activeTab === 'purchase' || activeTab === 'return') {
      if (criteria.dateFrom && criteria.dateTo) {
        const start = new Date(criteria.dateFrom);
        const end = new Date(criteria.dateTo);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 93) {
          toast.error("Please select a date range of 3 months or less for detailed reports.");
          return;
        }
      }
    }
    const filterPayload = {
      ...criteria,
      brand: criteria.bin,
      supplier: criteria.vendor
    };
    navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/Purchase-Report/Print`, { state: { type: activeTab, filters: filterPayload, criteria: filterPayload } });
  };

  if (loading) return <div className="flex h-48 items-center justify-center"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 text-black dark:text-bodydark text-xs antialiased font-sans relative">
      <div>
        <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-wider">Corporate Purchase Auditing Center</h2>
        <p className="text-xs text-gray-400">Isolate procurement parameters and compile vendor distribution sheets metrics</p>
      </div>

      <div className="flex border-b border-stroke dark:border-strokedark gap-2 bg-white dark:bg-boxdark font-black tracking-wider text-[11px] uppercase text-gray-500">
        <button type="button" onClick={() => handleTabChange('purchase')} className={`py-2.5 px-6 font-bold uppercase transition tracking-wide text-xs border-b-2 cursor-pointer ${activeTab === 'purchase' ? 'border-primary text-primary font-black' : 'border-transparent text-gray-400 hover:text-black dark:hover:text-white'}`}>General Purchase Detail</button>
        <button type="button" onClick={() => handleTabChange('return')} className={`py-2.5 px-6 font-bold uppercase transition tracking-wide text-xs border-b-2 cursor-pointer ${activeTab === 'return' ? 'border-primary text-primary font-black' : 'border-transparent text-gray-400 hover:text-black dark:hover:text-white'}`}>Purchase Return</button>
        <button type="button" onClick={() => handleTabChange('invoice')} className={`py-2.5 px-6 font-bold uppercase transition tracking-wide text-xs border-b-2 cursor-pointer ${activeTab === 'invoice' ? 'border-primary text-primary font-black' : 'border-transparent text-gray-400 hover:text-black dark:hover:text-white'}`}>Purchase Itemized Detail</button>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6">
        <h3 className="font-bold text-sm text-black dark:text-white mb-4 uppercase tracking-wider text-primary">Report Criteria Specification</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">

          {activeTab === 'purchase' && (
            <>
              <SearchableMultiSelect label="Procurement Vendor:" placeholder="Vendor" options={vendorOptions} value={criteria.vendor} onChange={(val) => handleInputChange('vendor', val)} />
              <SearchableMultiSelect label="Parent Category:" placeholder="Parent Category" options={parentCategoryOptions} value={criteria.parentCategory} onChange={(val) => handleInputChange('parentCategory', val)} />
              <SearchableMultiSelect label="Sub Category:" placeholder="Sub Category" options={subCategoryOptions} value={criteria.subCategory} onChange={(val) => handleInputChange('subCategory', val)} />
              <SearchableMultiSelect label="Category:" placeholder="Category" options={subSubCategoryOptions} value={criteria.subSubCategory} onChange={(val) => handleInputChange('subSubCategory', val)} />
              <SearchableMultiSelect label="Product Groups (UOM):" placeholder="UOM" options={uomOptions} value={criteria.uom} onChange={(val) => handleInputChange('uom', val)} />
              <SearchableMultiSelect label="Brand:" placeholder="Brand" options={binOptions} value={criteria.bin} onChange={(val) => handleInputChange('bin', val)} />
              <SearchableMultiSelect label="Target Stock Assets:" placeholder="Product" options={productOptions} value={criteria.product} onChange={(val) => handleInputChange('product', val)} />
              <SearchableMultiSelect label="Receiving Warehouses:" placeholder="Location" options={locationOptions} value={criteria.location} onChange={(val) => handleInputChange('location', val)} />
              
              <div>
                <label className="block font-bold text-gray-500 mb-1">Procurement Mode:</label>
                <select value={criteria.purchaseType} onChange={(e) => handleInputChange('purchaseType', e.target.value)} className="w-full border border-stroke dark:border-strokedark rounded p-2 bg-transparent font-semibold text-xs text-black dark:text-white dark:bg-boxdark outline-none">
                  <option value="All">All Procurement Types</option>
                  <option value="Cash">Cash Purchases</option>
                  <option value="Credit">Credit Purchases</option>
                </select>
              </div>
            </>
          )}

          {activeTab === 'return' && (
            <>
              <SearchableMultiSelect label="Procurement Vendor:" placeholder="Vendor" options={vendorOptions} value={criteria.vendor} onChange={(val) => handleInputChange('vendor', val)} />
              <SearchableMultiSelect label="Parent Category:" placeholder="Parent Category" options={parentCategoryOptions} value={criteria.parentCategory} onChange={(val) => handleInputChange('parentCategory', val)} />
              <SearchableMultiSelect label="Sub Category:" placeholder="Sub Category" options={subCategoryOptions} value={criteria.subCategory} onChange={(val) => handleInputChange('subCategory', val)} />
              <SearchableMultiSelect label="Category:" placeholder="Category" options={subSubCategoryOptions} value={criteria.subSubCategory} onChange={(val) => handleInputChange('subSubCategory', val)} />
              <SearchableMultiSelect label="Product Groups (UOM):" placeholder="UOM" options={uomOptions} value={criteria.uom} onChange={(val) => handleInputChange('uom', val)} />
              <SearchableMultiSelect label="Brand:" placeholder="Brand" options={binOptions} value={criteria.bin} onChange={(val) => handleInputChange('bin', val)} />
              <SearchableMultiSelect label="Target Stock Assets:" placeholder="Product" options={productOptions} value={criteria.product} onChange={(val) => handleInputChange('product', val)} />
              <SearchableMultiSelect label="Receiving Warehouses:" placeholder="Location" options={locationOptions} value={criteria.location} onChange={(val) => handleInputChange('location', val)} />
            </>
          )}

          {activeTab === 'invoice' && (
            <>
              <div className="md:col-span-2">
                <SearchableDropdown
                  label="Select Supplier Purchase No: *"
                  placeholder="Purchase No"
                  options={invoiceOptions}
                  value={criteria.invoiceNo}
                  onChange={(val) => handleInputChange('invoiceNo', val)}
                />
              </div>
            </>
          )}

          <div>
            <label className="block font-bold text-gray-500 mb-1">Date Bracket From:</label>
            <input type="date" max={new Date().toISOString().split('T')[0]} value={criteria.dateFrom} onChange={(e) => { const today = new Date().toISOString().split('T')[0]; let newDateFrom = e.target.value; if (newDateFrom > today) newDateFrom = today; handleInputChange('dateFrom', newDateFrom); if (activeTab === 'purchase' || activeTab === 'return') { const dFrom = new Date(newDateFrom); const dTo = new Date(criteria.dateTo); const diffDays = Math.ceil(Math.abs(dTo.getTime() - dFrom.getTime()) / (1000 * 60 * 60 * 24)); if (dTo < dFrom || diffDays > 90) { const maxAllowed = new Date(dFrom.setDate(dFrom.getDate() + 90)).toISOString().split('T')[0]; handleInputChange('dateTo', maxAllowed < today ? maxAllowed : today); } } }} className="w-full border border-stroke rounded p-2 bg-transparent font-semibold text-black dark:text-white text-xs outline-none dark:bg-boxdark" />
          </div>
          <div>
            <label className="block font-bold text-gray-500 mb-1">Date Bracket To:</label>
            <input type="date" min={criteria.dateFrom} max={criteria.dateFrom && (activeTab === 'purchase' || activeTab === 'return') ? [new Date(new Date(criteria.dateFrom).setDate(new Date(criteria.dateFrom).getDate() + 90)).toISOString().split('T')[0], new Date().toISOString().split('T')[0]].sort()[0] : new Date().toISOString().split('T')[0]} value={criteria.dateTo} onChange={(e) => { const today = new Date().toISOString().split('T')[0]; const maxAllowed = criteria.dateFrom && (activeTab === 'purchase' || activeTab === 'return') ? [new Date(new Date(criteria.dateFrom).setDate(new Date(criteria.dateFrom).getDate() + 90)).toISOString().split('T')[0], today].sort()[0] : today; let newDateTo = e.target.value; if (newDateTo > maxAllowed) newDateTo = maxAllowed; if (newDateTo < criteria.dateFrom) newDateTo = criteria.dateFrom; handleInputChange('dateTo', newDateTo); }} className="w-full border border-stroke rounded p-2 bg-transparent font-semibold text-black dark:text-white text-xs outline-none dark:bg-boxdark" />
          </div>

          <div className="md:col-span-4 flex flex-wrap items-center gap-1.5 pt-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Quick Date Range:</span>
            <button type="button" onClick={() => { const t = getTodayDateString(); handleInputChange('dateFrom', t); handleInputChange('dateTo', t); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">Today</button>
            <button type="button" onClick={() => { const y = new Date(); y.setDate(y.getDate() - 1); const ys = y.toISOString().split('T')[0]; handleInputChange('dateFrom', ys); handleInputChange('dateTo', ys); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">Yesterday</button>
            <button type="button" onClick={() => { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); const s = new Date(d.setDate(diff)).toISOString().split('T')[0]; handleInputChange('dateFrom', s); handleInputChange('dateTo', getTodayDateString()); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">This Week</button>
            <button type="button" onClick={() => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; handleInputChange('dateFrom', s); handleInputChange('dateTo', getTodayDateString()); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">This Month</button>
            <button type="button" onClick={() => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split('T')[0]; const e = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0]; handleInputChange('dateFrom', s); handleInputChange('dateTo', e); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">Last Month</button>
          </div>

        </div>

        <div className="mt-8 pt-4 border-t border-stroke dark:border-strokedark flex justify-end">
          <button
            type="button"
            onClick={handleDispatchReportView}
            className="rounded bg-primary py-2.5 px-12 font-bold text-white hover:bg-opacity-90 transition text-xs shadow-sm h-9 cursor-pointer"
          >
            Generate Statement
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseReport;
