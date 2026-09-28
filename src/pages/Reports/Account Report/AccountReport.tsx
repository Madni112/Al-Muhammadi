import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { SearchableMultiSelect } from '../../../components/SearchableMultiSelect';

const AccountReport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);

  const initialTab = Number(location.state?.activeTab || location.state?.tab || 1);
  const [activeTab, setActiveTab] = useState<number>(initialTab);

  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [salesmen, setSalesmen] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [uniqueCategoryCodes, setUniqueCategoryCodes] = useState<any[]>([]);
  const [uniqueSubCategoryCodes, setUniqueSubCategoryCodes] = useState<any[]>([]);
  const [uniqueControlCodes, setUniqueControlCodes] = useState<any[]>([]);

  const getPastWeekDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  };

  const getTodayDateString = () => {
    return new Date().toISOString().split('T')[0];
  };

  const [filters, setFilters] = useState(location.state?.filters || {
    categoryCode: [],
    subCategoryCode: [],
    controlCode: [],
    chartOfAccountCode: [],
    customerCategory: [],
    customer: [],
    vendor: [],
    company: [],
    voucherType: 'All',
    saleType: 'Sale',
    salesman: [],
    showZeroValues: false,
    showOnlyTransacted: false,
    dateFrom: getPastWeekDateString(),
    dateTo: getTodayDateString()
  });

  useEffect(() => {
    navigate('.', { replace: true, state: { ...location.state, activeTab, filters } });
  }, [activeTab, filters, navigate]);

  useEffect(() => {
    const fetchAccountCriteriaLookups = async () => {
      try {
        setLoading(true);
        const [custRes, vendRes, smRes, compRes, coaRes] = await Promise.all([
          supabase.from('customers').select('id, customerName, registrationType, primaryPhone, customer_code, customerCode'),
          supabase.from('vendors').select('id, vendor_name'),
          supabase.from('salesmen').select('id, name'),
          supabase.from('companies').select('id, name'),
          supabase.from('chart_of_accounts').select('id, category_code, sub_category_code, control_code, account_code, account_title')
        ]);

        if (custRes.data) setCustomers(custRes.data);
        if (vendRes.data) setVendors(vendRes.data);
        if (smRes.data) setSalesmen(smRes.data);
        if (compRes.data) setCompanies(compRes.data);

        if (coaRes.data) {
          setChartOfAccounts(coaRes.data);
          const cats = Array.from(new Set(coaRes.data.map((item: any) => item.category_code).filter(Boolean)));
          setUniqueCategoryCodes(cats);
          const subs = Array.from(new Set(coaRes.data.map((item: any) => item.sub_category_code).filter(Boolean)));
          setUniqueSubCategoryCodes(subs);
          const ctrls = Array.from(new Set(coaRes.data.map((item: any) => item.control_code).filter(Boolean)));
          setUniqueControlCodes(ctrls);
        }
      } catch (err: any) {
        toast.error('Financial registry lookup interruption: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAccountCriteriaLookups();
  }, []);

  const handleInputChange = (field: string, value: any) => {
    setFilters(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'categoryCode') {
        updated.subCategoryCode = [];
        updated.controlCode = [];
        updated.chartOfAccountCode = [];
      } else if (field === 'subCategoryCode') {
        updated.controlCode = [];
        updated.chartOfAccountCode = [];
      } else if (field === 'controlCode') {
        updated.chartOfAccountCode = [];
      }
      return updated;
    });
  };

  const getFilteredSubCategoryCodesPool = () => {
    if (!filters.categoryCode || filters.categoryCode.length === 0) return uniqueSubCategoryCodes;
    return Array.from(new Set(
      chartOfAccounts
        .filter((item: any) => filters.categoryCode.includes(item.category_code))
        .map((item: any) => item.sub_category_code)
        .filter(Boolean)
    ));
  };

  const getFilteredControlCodesPool = () => {
    if ((!filters.categoryCode || filters.categoryCode.length === 0) && (!filters.subCategoryCode || filters.subCategoryCode.length === 0)) return uniqueControlCodes;
    return Array.from(new Set(
      chartOfAccounts
        .filter((item: any) => (filters.categoryCode?.length === 0 || filters.categoryCode?.includes(item.category_code)))
        .filter((item: any) => (filters.subCategoryCode?.length === 0 || filters.subCategoryCode?.includes(item.sub_category_code)))
        .map((item: any) => item.control_code)
        .filter(Boolean)
    ));
  };

  const getFilteredChartOfAccountsPool = () => {
    let pool = chartOfAccounts;
    if (filters.categoryCode && filters.categoryCode.length > 0) {
      pool = pool.filter((item: any) => item.category_code === filters.categoryCode);
    }
    if (filters.subCategoryCode && filters.subCategoryCode.length > 0) {
      pool = pool.filter((item: any) => filters.subCategoryCode.includes(item.sub_category_code));
    }
    if (filters.controlCode && filters.controlCode.length > 0) {
      pool = pool.filter((item: any) => filters.controlCode.includes(item.control_code));
    }
    return pool;
  };

  const categoryCodeOptions = useMemo(() => uniqueCategoryCodes, [uniqueCategoryCodes]);
  const subCategoryCodeOptions = useMemo(() => getFilteredSubCategoryCodesPool(), [uniqueSubCategoryCodes, chartOfAccounts, filters.categoryCode]);
  const controlCodeOptions = useMemo(() => getFilteredControlCodesPool(), [uniqueControlCodes, chartOfAccounts, filters.categoryCode, filters.subCategoryCode]);
  const chartOfAccountOptions = useMemo(() => getFilteredChartOfAccountsPool().map(c => `${c.account_code} - ${c.account_title}`), [chartOfAccounts, filters.categoryCode, filters.subCategoryCode, filters.controlCode]);
  const customerOptions = useMemo(() => customers.map(c => {
    const code = c.customer_code || c.customerCode;
    return code ? `[${code}] ${c.customerName}` : c.customerName;
  }).filter(Boolean), [customers]);
  const customerCategoryOptions = useMemo(() => {
    const fromCust = customers.map(c => c.registrationType).filter(Boolean);
    const standard = ['Retail / General', 'Contractor / Builder', 'Wholesaler / Dealer', 'Registered Corporate'];
    return Array.from(new Set([...standard, ...fromCust]));
  }, [customers]);
  const vendorOptions = useMemo(() => vendors.map(v => v.vendor_name).filter(Boolean), [vendors]);
  const companyOptions = useMemo(() => companies.map(c => c.name).filter(Boolean), [companies]);
  const salesmanOptions = useMemo(() => salesmen.map(s => s.name).filter(Boolean), [salesmen]);

  const handleTabChange = (tab: number) => {
    setActiveTab(tab);
    setFilters(prev => ({
      categoryCode: [],
      subCategoryCode: [],
      controlCode: [],
      chartOfAccountCode: [],
      customerCategory: [],
      customer: [],
      vendor: [],
      company: [],
      voucherType: 'All',
      saleType: 'Sale',
      salesman: [],
      showZeroValues: false,
      showOnlyTransacted: false,
      dateFrom: prev.dateFrom,
      dateTo: prev.dateTo
    }));
  };

  const handleDispatchReportView = () => {
    if (activeTab === 1 || activeTab === 8) {
      if (filters.dateFrom && filters.dateTo) {
        const start = new Date(filters.dateFrom);
        const end = new Date(filters.dateTo);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 93) {
          toast.error("Please select a date range of 3 months or less for detailed reports.");
          return;
        }
      }
    }

    navigate(`${tenantId ? `/${tenantId}` : ''}/Reports/Account-Report/Print`, {
      state: { tab: activeTab, criteria: filters }
    });
  };

  if (loading) return <div className="flex h-48 items-center justify-center"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 text-black dark:text-bodydark text-xs antialiased font-sans relative">
      <div>
        <h2 className="text-xl font-bold text-black dark:text-white uppercase tracking-wider">Corporate Account Auditing Center</h2>
        <p className="text-xs text-gray-400">Compile general ledgers, trial balance summaries, and corporate financial aging statements</p>
      </div>

      <div className="flex flex-wrap border-b border-stroke dark:border-strokedark gap-1 bg-white dark:bg-boxdark font-black tracking-wider text-[10px] uppercase text-gray-500">
        <button type="button" onClick={() => handleTabChange(13)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 13 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Customer Balance Detail</button>
        <button type="button" onClick={() => handleTabChange(3)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 3 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Vendor Balance Detail</button>
        <button type="button" onClick={() => handleTabChange(1)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 1 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>General Ledger</button>
        <button type="button" onClick={() => handleTabChange(2)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 2 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Customer Summary</button>
        <button type="button" onClick={() => handleTabChange(4)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 4 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Operational Expenses</button>
        <button type="button" onClick={() => handleTabChange(5)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 5 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Chart of Accounts</button>
        <button type="button" onClick={() => handleTabChange(6)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 6 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Vendor Outstanding</button>
        <button type="button" onClick={() => handleTabChange(7)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 7 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Customer Recovery</button>
        <button type="button" onClick={() => handleTabChange(8)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 8 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Voucher Report</button>
        <button type="button" onClick={() => handleTabChange(9)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 9 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Cash & Bank Daybook</button>
        <button type="button" onClick={() => handleTabChange(10)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 10 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Salesman Statement</button>
        <button type="button" onClick={() => handleTabChange(11)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 11 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Trial Balance</button>
        <button type="button" onClick={() => handleTabChange(12)} className={`py-2.5 px-4 transition border-b-2 cursor-pointer ${activeTab === 12 ? 'border-primary text-primary font-black bg-primary/5' : 'border-transparent text-gray-400 hover:text-black'}`}>Aging Report</button>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6">
        <h3 className="font-bold text-sm text-black dark:text-white mb-4 uppercase tracking-wider text-primary">Report Criteria Specification</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">

          {(activeTab === 1 || activeTab === 13) && (
            <>
              <SearchableMultiSelect 
                label="Customer Category / Type:" 
                placeholder="All Categories" 
                options={customerCategoryOptions} 
                value={filters.customerCategory} 
                onChange={(val) => handleInputChange('customerCategory', val)} 
              />
              <SearchableMultiSelect 
                label="Select Customer Title:" 
                placeholder="All Customers" 
                options={customerOptions} 
                value={filters.customer} 
                onChange={(val) => handleInputChange('customer', val)} 
              />
              <div className="md:col-span-2 flex flex-wrap items-center gap-6 pt-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={Boolean(filters.showZeroValues)} 
                    onChange={(e) => handleInputChange('showZeroValues', e.target.checked)}
                    className="w-4 h-4 text-primary rounded border-stroke dark:border-strokedark focus:ring-0 cursor-pointer accent-primary"
                  />
                  <span className="text-xs font-bold text-black dark:text-white">Show Zero Values (Settled Accounts)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={Boolean(filters.showOnlyTransacted)} 
                    onChange={(e) => handleInputChange('showOnlyTransacted', e.target.checked)}
                    className="w-4 h-4 text-primary rounded border-stroke dark:border-strokedark focus:ring-0 cursor-pointer accent-primary"
                  />
                  <span className="text-xs font-bold text-black dark:text-white">Show Only Customers With Transaction</span>
                </label>
              </div>
            </>
          )}

          {activeTab === 3 && (
            <>
              <SearchableMultiSelect 
                label="Select Procurement Vendor:" 
                placeholder="All Vendors" 
                options={vendorOptions} 
                value={filters.vendor} 
                onChange={(val) => handleInputChange('vendor', val)} 
              />
              <div className="md:col-span-3 flex flex-wrap items-center gap-6 pt-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={Boolean(filters.showZeroValues)} 
                    onChange={(e) => handleInputChange('showZeroValues', e.target.checked)}
                    className="w-4 h-4 text-primary rounded border-stroke dark:border-strokedark focus:ring-0 cursor-pointer accent-primary"
                  />
                  <span className="text-xs font-bold text-black dark:text-white">Show Zero Values (Settled / Inactive Vendors)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={Boolean(filters.showOnlyTransacted)} 
                    onChange={(e) => handleInputChange('showOnlyTransacted', e.target.checked)}
                    className="w-4 h-4 text-primary rounded border-stroke dark:border-strokedark focus:ring-0 cursor-pointer accent-primary"
                  />
                  <span className="text-xs font-bold text-black dark:text-white">Show Only Vendors With Transactions</span>
                </label>
              </div>
            </>
          )}

          {activeTab === 1 && (
            <>
              <SearchableMultiSelect label="Category Code:" placeholder="Category Code" options={categoryCodeOptions} value={filters.categoryCode} onChange={(val) => handleInputChange('categoryCode', val)} />
              <SearchableMultiSelect label="Sub-Category:" placeholder="Sub-Category" options={subCategoryCodeOptions} value={filters.subCategoryCode} onChange={(val) => handleInputChange('subCategoryCode', val)} />
              <SearchableMultiSelect label="Control Code:" placeholder="Control Code" options={controlCodeOptions} value={filters.controlCode} onChange={(val) => handleInputChange('controlCode', val)} />
              <SearchableMultiSelect
                label="Chart of Account Code:"
                placeholder="Account"
                options={chartOfAccountOptions}
                value={filters.chartOfAccountCode}
                onChange={(val) => {
                  const cleanCode = val.map((v: string) => v.split(' - ')[0]);
                  handleInputChange('chartOfAccountCode', cleanCode);
                }}
              />
              <SearchableMultiSelect label="Select Customer Title:" placeholder="Customer" options={customerOptions} value={filters.customer} onChange={(val) => handleInputChange('customer', val)} />
            </>
          )}

          {activeTab === 2 && (
            <SearchableMultiSelect label="Select Customer Title:" placeholder="Customer" options={customerOptions} value={filters.customer} onChange={(val) => handleInputChange('customer', val)} />
          )}

          {activeTab === 3 && (
            <SearchableMultiSelect label="Select Procurement Vendor:" placeholder="Vendor" options={vendorOptions} value={filters.vendor} onChange={(val) => handleInputChange('vendor', val)} />
          )}

          {activeTab === 4 && (
            <div className="md:col-span-4 text-gray-400 italic font-mono">Generates dynamic operational statement parameters sheets on print compilation dispatch tracking pools.</div>
          )}

          {activeTab === 5 && (
            <SearchableMultiSelect label="Category Code Selection:" placeholder="Category Code" options={categoryCodeOptions} value={filters.categoryCode} onChange={(val) => handleInputChange('categoryCode', val)} />
          )}

          {activeTab === 6 && (
            <SearchableMultiSelect label="Select Procurement Vendor:" placeholder="Vendor" options={vendorOptions} value={filters.vendor} onChange={(val) => handleInputChange('vendor', val)} />
          )}

          {activeTab === 7 && (
            <>
              <SearchableMultiSelect label="Select Customer Title:" placeholder="Customer" options={customerOptions} value={filters.customer} onChange={(val) => handleInputChange('customer', val)} />
              {/* <SearchableMultiSelect label="Linked Principal Company:" placeholder="Company" options={companyOptions} value={filters.company} onChange={(val) => handleInputChange('company', val)} /> */}
            </>
          )}

          {activeTab === 8 && (
            <div>
              <label className="block font-bold text-gray-500 mb-1">Select Voucher Classification:</label>
              <select value={filters.voucherType} onChange={(e) => handleInputChange('voucherType', e.target.value)} className="w-full border border-stroke dark:border-strokedark rounded p-2 bg-transparent font-semibold text-xs text-black dark:text-white dark:bg-boxdark outline-none">
                <option value="All">All Vouchers</option>
                <option value="Cash Receipt">Cash Receipt Voucher (CRV)</option>
                <option value="Cash Payment">Cash Payment Voucher (CPV)</option>
                <option value="Bank Receipt">Bank Receipt Voucher (BRV)</option>
                <option value="Bank Payment">Bank Payment Voucher (BPV)</option>
              </select>
            </div>
          )}

          {activeTab === 9 && (
            <div>
              <label className="block font-bold text-gray-500 mb-1">Allocation Activity Mode:</label>
              <select value={filters.saleType} onChange={(e) => handleInputChange('saleType', e.target.value)} className="w-full border border-stroke dark:border-strokedark rounded p-2 bg-transparent font-semibold text-xs text-black dark:text-white dark:bg-boxdark outline-none">
                <option value="Sale">Commercial Invoice Sales</option>
                <option value="Purchase">Procurement Supplier Purchase</option>
                <option value="Banks">Corporate Bank Registers</option>
                <option value="Cashbook">Counter Cash Box Ledger</option>
              </select>
            </div>
          )}

          {activeTab === 10 && (
            <SearchableMultiSelect label="Linked Salesman Agent:" placeholder="Salesman" options={salesmanOptions} value={filters.salesman} onChange={(val) => handleInputChange('salesman', val)} />
          )}

          {activeTab === 11 && (
            <SearchableMultiSelect label="Category Code Selection:" placeholder="Category Code" options={categoryCodeOptions} value={filters.categoryCode} onChange={(val) => handleInputChange('categoryCode', val)} />
          )}

          {activeTab === 12 && (
            <SearchableMultiSelect label="Select Customer Title:" placeholder="Customer" options={customerOptions} value={filters.customer} onChange={(val) => handleInputChange('customer', val)} />
          )}

          {activeTab !== 5 && activeTab !== 11 && activeTab !== 12 && (
            <>
              <div><label className="block font-bold text-gray-500 mb-1">Date Bracket From:</label><input type="date" max={new Date().toISOString().split('T')[0]} value={filters.dateFrom} onChange={(e) => { const today = new Date().toISOString().split('T')[0]; let newDateFrom = e.target.value; if (newDateFrom > today) newDateFrom = today; handleInputChange('dateFrom', newDateFrom); if (activeTab === 1 || activeTab === 8) { const dFrom = new Date(newDateFrom); const dTo = new Date(filters.dateTo); const diffDays = Math.ceil(Math.abs(dTo.getTime() - dFrom.getTime()) / (1000 * 60 * 60 * 24)); if (dTo < dFrom || diffDays > 90) { const maxAllowed = new Date(dFrom.setDate(dFrom.getDate() + 90)).toISOString().split('T')[0]; handleInputChange('dateTo', maxAllowed < today ? maxAllowed : today); } } }} className="w-full border border-stroke rounded p-2 bg-transparent font-semibold text-black dark:text-white text-xs outline-none dark:bg-boxdark" /></div>
              <div><label className="block font-bold text-gray-500 mb-1">Date Bracket To:</label><input type="date" min={filters.dateFrom} max={filters.dateFrom && (activeTab === 1 || activeTab === 8) ? [new Date(new Date(filters.dateFrom).setDate(new Date(filters.dateFrom).getDate() + 90)).toISOString().split('T')[0], new Date().toISOString().split('T')[0]].sort()[0] : new Date().toISOString().split('T')[0]} value={filters.dateTo} onChange={(e) => { const today = new Date().toISOString().split('T')[0]; const maxAllowed = filters.dateFrom && (activeTab === 1 || activeTab === 8) ? [new Date(new Date(filters.dateFrom).setDate(new Date(filters.dateFrom).getDate() + 90)).toISOString().split('T')[0], today].sort()[0] : today; let newDateTo = e.target.value; if (newDateTo > maxAllowed) newDateTo = maxAllowed; if (newDateTo < filters.dateFrom) newDateTo = filters.dateFrom; handleInputChange('dateTo', newDateTo); }} className="w-full border border-stroke rounded p-2 bg-transparent font-semibold text-black dark:text-white text-xs outline-none dark:bg-boxdark" /></div>
              <div className="md:col-span-4 flex flex-wrap items-center gap-1.5 pt-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Quick Dates:</span>
                <button type="button" onClick={() => { const t = new Date().toISOString().split('T')[0]; handleInputChange('dateFrom', t); handleInputChange('dateTo', t); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">Today</button>
                <button type="button" onClick={() => { const y = new Date(); y.setDate(y.getDate() - 1); const ys = y.toISOString().split('T')[0]; handleInputChange('dateFrom', ys); handleInputChange('dateTo', ys); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">Yesterday</button>
                <button type="button" onClick={() => { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); const s = new Date(d.setDate(diff)).toISOString().split('T')[0]; handleInputChange('dateFrom', s); handleInputChange('dateTo', new Date().toISOString().split('T')[0]); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">This Week</button>
                <button type="button" onClick={() => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; handleInputChange('dateFrom', s); handleInputChange('dateTo', new Date().toISOString().split('T')[0]); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">This Month</button>
                <button type="button" onClick={() => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split('T')[0]; const e = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0]; handleInputChange('dateFrom', s); handleInputChange('dateTo', e); }} className="py-1 px-2.5 bg-gray-100 hover:bg-primary hover:text-white rounded text-[10px] font-bold transition">Last Month</button>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 pt-4 border-t border-stroke dark:border-strokedark flex justify-end">
          <button
            type="button"
            onClick={handleDispatchReportView}
            className="rounded bg-primary py-2.5 px-12 font-black text-white hover:bg-opacity-90 transition text-xs shadow-sm h-9 cursor-pointer uppercase tracking-wider"
          >
            Show Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountReport;
