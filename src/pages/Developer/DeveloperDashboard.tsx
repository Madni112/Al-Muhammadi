import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import { createClient } from '@supabase/supabase-js';
import Spinner from '../../ui/Spinner';
import DarkModeSwitcher from '../../components/Header/DarkModeSwitcher';
import {
  MdDashboard,
  MdPeople,
  MdAddBusiness,
  MdSecurity,
  MdCheckCircle,
  MdLaunch,
  MdRefresh,
  MdLock,
  MdStorage,
  MdCloudDone,
  MdVpnKey,
  MdLockOutline,
  MdPowerSettingsNew,
  MdContentCopy,
  MdEdit,
  MdCheck,
  MdKeyboardArrowDown,
  MdKeyboardArrowRight,
  MdAdminPanelSettings,
  MdLogout,
  MdLayers,
  MdBusiness,
  MdAddCircle,
  MdAccountBalance,
  MdLocationOn,
  MdVpnLock,
  MdBadge,
  MdHistory,
  MdVisibility,
  MdClose,
  MdSearch,
  MdFilterList,
  MdPerson,
  MdCode,
  MdInfoOutline,
  MdDelete,
  MdDeleteOutline,
} from 'react-icons/md';
import { ROLE_PRESETS, RolePreset, getModulesForRole } from '../../constant/roles';

export interface PermissionSubNode {
  id: string;
  label: string;
}

export interface PermissionNode {
  id: string;
  label: string;
  children?: PermissionSubNode[];
}

export const PERMISSION_TREE: PermissionNode[] = [
  {
    id: 'dashboards',
    label: 'Dashboards',
    children: [
      { id: 'dashboard', label: 'Main / Executive Dashboard' },
      { id: '/Dashboard/Salesman', label: 'Salesman Dashboard' },
      { id: '/Dashboard/Warehouse', label: 'Warehouse (Location) Dashboard' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    children: [
      { id: '/Administration/Categories/List', label: 'Categories' },
      { id: '/Administration/Surface-Finish', label: 'Brand / Surface Finish' },
      { id: '/Administration/UOM/List', label: 'UOM (Units of Measure)' },
      { id: '/Administration/Products/List', label: 'Products' },
      { id: '/Administration/Products/Bulk-Upload', label: 'Bulk Product Upload' },
      { id: '/Administration/Locations/List', label: 'Locations' },
      { id: '/Administration/Transportation/List', label: 'Transportation' },
      { id: '/Administration/StockTransfer/List', label: 'Stock Transfer' },
      { id: '/company', label: 'Company Profile' },
    ],
  },
  {
    id: 'registration',
    label: 'Registration',
    children: [
      { id: '/Registration/Chart-of-Account/List', label: 'Chart of Account' },
      { id: '/Registration/Vouchers/List', label: 'Financial Vouchers' },
      { id: '/Registration/Bank-Account/BankAccountList', label: 'Bank Accounts' },
      { id: '/Inventory/OpeningStock/List', label: 'Opening Stock' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    children: [
      { id: '/Sales/Invoice/List', label: 'Sales Invoice' },
      { id: '/Sales/InvoiceReceipt/List', label: 'Invoice Receipts' },
      { id: '/Sales/Sales-Return/List', label: 'Sales Returns' },
      { id: '/Sales-Return/Debit-Notes/List', label: 'Debit Notes' },
      { id: '/Sales/Sales-Return-Receipt/List', label: 'Sales Return Receipts' },
      { id: '/Sales/Customers/List', label: 'Customers Directory' },
      { id: '/Sales/Salesman/List', label: 'Salesmen Ledger' },
      { id: '/Sales/Delivery-Challan/List', label: 'Delivery Challan (A-39 WDQ)' },
      { id: '/Sales/Shop-Dispatch/List', label: 'Shop Dispatch Queue (SHOP SDQ)' },
    ],
  },
  {
    id: 'purchase',
    label: 'Purchase',
    children: [
      { id: '/Purchase/Purchases/List', label: 'Purchases (PO & Invoices)' },
      { id: '/Purchase/Inward-Challan/List', label: 'Inward Challan (A-39 Warehouse)' },
      { id: '/Purchase/Shop-Receiving', label: 'Shop Receiving Queue (SHOP)' },
      { id: '/Purchase/Purchase-Receipt/List', label: 'Purchase Receipts' },
      { id: '/Purchase/Purchase-Return/List', label: 'Purchase Returns' },
      { id: '/Purchase/Purchase-Return-Receipt/List', label: 'Purchase Return Receipts' },
      { id: '/Purchase/Vendor/List', label: 'Vendors Directory' },
    ],
  },
  {
    id: 'warehouse',
    label: 'Warehouse & Logistics (A-39 & SHOP)',
    children: [
      { id: '/Sales/Delivery-Challan/List', label: 'A-39 Outward Delivery Challan (WDQ)' },
      { id: '/Sales/Shop-Dispatch/List', label: 'Shop Counter Dispatch Queue (SDQ)' },
      { id: '/Purchase/Inward-Challan/List', label: 'A-39 Supplier Inward Challan (Receiving)' },
      { id: '/Purchase/Shop-Receiving', label: 'Shop Incoming Stock Receiving' },
      { id: '/Warehouse/Return-Challan', label: 'A-39 Customer Return Challans' },
      { id: '/Warehouse/Shop-Return', label: 'Shop Return Receiving Queue' },
      { id: '/Administration/StockTransfer/List', label: 'Inter-Warehouse Stock Transfers' },
    ],
  },
  {
    id: 'reports_hub',
    label: 'Reports Directory Hub',
    children: [
      { id: '/Reports/Reports-Dashboard', label: 'Reports Directory Main Hub' },
    ],
  },
  {
    id: 'reports_sales',
    label: 'Sales Reports (8 Available)',
    children: [
      { id: 'report:category-wise-sales', label: 'Category-Wise Sales & Volume Report' },
      { id: 'report:product-sales-history', label: 'Product Sales History Report' },
      { id: 'report:sale-inv-detail', label: 'Sales Invoice Detail Report' },
      { id: 'report:commercial-sale-ledger', label: 'Commercial Sales Audit Ledger' },
      { id: 'report:sales-query-center', label: 'Sales Filter & Parameter Builder' },
      { id: 'report:sales-return-ledger', label: 'Sales Return & Credit Ledger' },
      { id: 'report:customer-sales-breakdown', label: 'Customer Sales & Volume Analysis' },
      { id: 'report:customer-loyalty-ledger', label: 'Customer Financial Statement & Invoice Ledger' },
    ],
  },
  {
    id: 'reports_purchases',
    label: 'Purchases & Payables Reports (8 Available)',
    children: [
      { id: 'report:purchase-ledger', label: 'Purchase Invoice Register' },
      { id: 'report:category-purchases', label: 'Category-Wise Purchases & Volume Report' },
      { id: 'report:product-purchase-history', label: 'Product Purchase History & Price Trend' },
      { id: 'report:purchase-invoice-detail', label: 'Purchase Invoice Detail Report' },
      { id: 'report:purchase-query-center', label: 'Purchase Parameter Builder' },
      { id: 'report:vendor-return-ledger', label: 'Purchase Returns & Debit Ledger' },
      { id: 'report:vendor-balance-detail-pur', label: 'Vendor Balance Detail & Account Ledger' },
      { id: 'report:vendor-outstanding-report-pur', label: 'Vendor Outstanding Payables Schedule' },
    ],
  },
  {
    id: 'reports_inventory',
    label: 'Inventory & Stock Reports (7 Available)',
    children: [
      { id: 'report:stock-activity-ledger', label: 'Stock Activity & Movement Ledger' },
      { id: 'report:current-stock-balance', label: 'Stock Balances & Valuation Registry' },
      { id: 'report:as-of-date-stock-status', label: 'As-Of-Date Stock Status Report' },
      { id: 'report:inter-warehouse-transfers', label: 'Inter-Warehouse Transfer Statement' },
      { id: 'report:category-wise-stock', label: 'Category-Wise Stock Valuation Ledger' },
      { id: 'report:warehouse-location-report', label: 'Warehouse Bin & Location Stock Breakdown' },
      { id: 'report:holding-stock-report', label: 'Holding Stock & Gatepass Queue' },
    ],
  },
  {
    id: 'reports_accounts',
    label: 'Accounts & Financials Reports (9 Available)',
    children: [
      { id: 'report:customer-balance-detail', label: 'Customer Balance Detail Report' },
      { id: 'report:vendor-balance-detail', label: 'Vendor Balance Detail & Account Ledger' },
      { id: 'report:customer-ledger', label: 'Customer Account Ledger (General Ledger)' },
      { id: 'report:daybook-activity-report', label: 'Daily Cash & Bank Daybook' },
      { id: 'report:customer-aging-report', label: 'Customer Receivables Aging Analysis' },
      { id: 'report:voucher-audit-register', label: 'Financial Voucher Audit Register' },
      { id: 'report:trial-balance-statement', label: 'Trial Balance Audit Statement' },
      { id: 'report:vendor-outstanding-report', label: 'Vendor Outstanding Payables Schedule' },
      { id: 'report:expense-ledger', label: 'Operational Expense Statement' },
    ],
  },
  {
    id: 'reports_business',
    label: 'Business Overview Reports (2 Available)',
    children: [
      { id: 'report:balance-sheet-stat', label: 'Balance Sheet Financial Statement' },
      { id: 'report:executive-summary-report', label: 'Commercial Executive Summary' },
    ],
  },
];

export const getAllPermissionIds = (): string[] => {
  const ids: string[] = [];
  PERMISSION_TREE.forEach(node => {
    ids.push(node.id);
    if (node.children) {
      node.children.forEach(child => ids.push(child.id));
    }
  });
  return ids;
};

export interface EmployeeAccount {
  id: string;
  name: string;
  slug: string;
  email?: string;
  role: string;
  allowed_modules: string[];
  created_at: string;
}

// Master Super Admin / Developer Credentials
const DEV_EMAIL = 'admin@almuhammadi.com';
const ALMUHAMMADI_DEV_EMAIL = 'admin@almuhammadi.com';
const DEV_PASSWORD = 'admin123';
const BACKUP_DEV_EMAIL = 'developer@noorhorizontechnologies.com';
const BACKUP_DEV_PASSWORD = 'NoorHorizon@5923';

/**
 * Hierarchical Permission Tree Selector Component with Group Expand/Collapse & Toggle All
 */
const PermissionTreeEditor: React.FC<{
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}> = ({ selectedIds, onChange }) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    dashboards: true,
    administration: true,
    registration: true,
    sales: true,
    purchase: true,
    warehouse: true,
    reports_hub: true,
    reports_sales: true,
    reports_purchases: true,
    reports_inventory: true,
    reports_accounts: true,
    reports_business: true,
    reports: true,
  });

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const handleToggleParent = (node: PermissionNode) => {
    if (!node.children) {
      const isSelected = selectedIds.includes(node.id);
      onChange(isSelected ? selectedIds.filter(id => id !== node.id) : [...selectedIds, node.id]);
      return;
    }

    const childIds = node.children.map(c => c.id);
    const allSelected = childIds.every(id => selectedIds.includes(id));

    if (allSelected) {
      onChange(selectedIds.filter(id => id !== node.id && !childIds.includes(id)));
    } else {
      const newIds = Array.from(new Set([...selectedIds, node.id, ...childIds]));
      onChange(newIds);
    }
  };

  const handleToggleChild = (childId: string, parentNode: PermissionNode) => {
    const isSelected = selectedIds.includes(childId);
    let nextIds = isSelected
      ? selectedIds.filter(id => id !== childId)
      : [...selectedIds, childId];

    if (parentNode.children) {
      const anyChildActive = parentNode.children.some(c => nextIds.includes(c.id));
      if (anyChildActive) {
        if (!nextIds.includes(parentNode.id)) {
          nextIds.push(parentNode.id);
        }
      } else {
        nextIds = nextIds.filter(id => id !== parentNode.id);
      }
    }

    onChange(nextIds);
  };

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
      {PERMISSION_TREE.map(node => {
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const isExpanded = expandedNodes[node.id];

        if (!hasChildren) {
          const isChecked = selectedIds.includes(node.id);
          return (
            <div
              key={node.id}
              onClick={() => handleToggleParent(node)}
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                isChecked
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold'
                  : 'bg-white dark:bg-boxdark border-stroke dark:border-strokedark text-gray-600 dark:text-gray-400 hover:border-emerald-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-bold text-black dark:text-white">{node.label}</span>
                <span className="text-[10px] text-gray-400">(General Overview)</span>
              </div>
              {isChecked ? (
                <MdCheckCircle className="text-emerald-600 dark:text-emerald-400 text-base" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-stroke dark:border-strokedark" />
              )}
            </div>
          );
        }

        const childIds = node.children!.map(c => c.id);
        const selectedChildrenCount = childIds.filter(id => selectedIds.includes(id)).length;
        const totalChildren = childIds.length;
        const allSelected = selectedChildrenCount === totalChildren && totalChildren > 0;
        const partiallySelected = selectedChildrenCount > 0 && selectedChildrenCount < totalChildren;

        return (
          <div
            key={node.id}
            className="rounded-xl border border-stroke dark:border-strokedark bg-white dark:bg-boxdark overflow-hidden shadow-xs"
          >
            {/* PARENT CATEGORY HEADER */}
            <div className="p-3 bg-gray-100 dark:bg-meta-4/40 flex items-center justify-between border-b border-stroke dark:border-strokedark">
              <button
                type="button"
                onClick={() => toggleExpand(node.id)}
                className="flex items-center gap-2 text-xs font-bold text-black dark:text-white hover:text-emerald-600 transition cursor-pointer"
              >
                {isExpanded ? (
                  <MdKeyboardArrowDown className="text-lg text-gray-500" />
                ) : (
                  <MdKeyboardArrowRight className="text-lg text-gray-500" />
                )}
                <span>{node.label}</span>
                <span className="text-[10px] bg-gray-200 dark:bg-meta-4 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full font-mono">
                  {selectedChildrenCount} / {totalChildren} active
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleParent(node)}
                className={`text-[11px] px-2.5 py-1 rounded font-semibold transition cursor-pointer flex items-center gap-1 ${
                  allSelected
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : partiallySelected
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                    : 'bg-white dark:bg-boxdark text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-stroke dark:border-strokedark'
                }`}
              >
                {allSelected ? (
                  <>
                    <MdCheckCircle className="text-xs text-emerald-600" /> All Selected
                  </>
                ) : (
                  'Toggle All'
                )}
              </button>
            </div>

            {/* EXPANDED SUB-PAGES / CATEGORIES */}
            {isExpanded && (
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50/50 dark:bg-meta-4/10">
                {node.children!.map(child => {
                  const isChildChecked = selectedIds.includes(child.id);
                  return (
                    <div
                      key={child.id}
                      onClick={() => handleToggleChild(child.id, node)}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                        isChildChecked
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'bg-white dark:bg-boxdark border-stroke dark:border-strokedark text-gray-700 dark:text-gray-300 hover:border-emerald-500'
                      }`}
                    >
                      <span className="truncate">{child.label}</span>
                      {isChildChecked ? (
                        <MdCheckCircle className="text-emerald-600 dark:text-emerald-400 text-sm shrink-0 ml-2" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-stroke dark:border-strokedark shrink-0 ml-2" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const DeveloperDashboard: React.FC = () => {
  const navigate = useNavigate();

  // Developer Session State
  const [isDevAuthorized, setIsDevAuthorized] = useState<boolean>(() => {
    return sessionStorage.getItem('nht_dev_auth_session') === 'authorized';
  });

  // Login Form State
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'create' | 'logs'>('overview');

  // Audit Logs State
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilterAction, setLogFilterAction] = useState<string>('ALL');
  const [logFilterEmployee, setLogFilterEmployee] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');
  const [logPage, setLogPage] = useState<number>(1);
  const [selectedLogModal, setSelectedLogModal] = useState<any | null>(null);
  const [showRawJsonModal, setShowRawJsonModal] = useState<boolean>(false);

  const fetchAuditLogs = async () => {
    try {
      setLogsLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Stats
  const [loading, setLoading] = useState(true);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);

  // Employee Data
  const [employees, setEmployees] = useState<EmployeeAccount[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // Newly Created Result
  const [createdResult, setCreatedResult] = useState<{ name: string; email: string; role: string } | null>(null);

  // Edit Permissions Modal State
  const [editingEmployee, setEditingEmployee] = useState<EmployeeAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('Warehouse Manager');
  const [editModules, setEditModules] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete Employee State (requires developer password verification)
  const [deletingEmployee, setDeletingEmployee] = useState<EmployeeAccount | null>(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Create Employee Form State
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Warehouse Manager',
    location_id: '' as string | number,
    modules: ROLE_PRESETS['Warehouse Manager'].modules,
  });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isDevAuthorized) {
      fetchDevData();
      fetchAuditLogs();
    }
  }, [isDevAuthorized]);

  useEffect(() => {
    if (isDevAuthorized && activeTab === 'logs') {
      fetchAuditLogs();
    }
  }, [isDevAuthorized, activeTab]);

  const handleDevLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const enteredEmail = emailInput.trim().toLowerCase();
    if (
      (enteredEmail === DEV_EMAIL.toLowerCase() && passwordInput === DEV_PASSWORD) ||
      (enteredEmail === ALMUHAMMADI_DEV_EMAIL.toLowerCase() && passwordInput === DEV_PASSWORD) ||
      (enteredEmail === BACKUP_DEV_EMAIL.toLowerCase() && passwordInput === BACKUP_DEV_PASSWORD)
    ) {
      sessionStorage.setItem('nht_dev_auth_session', 'authorized');
      setIsDevAuthorized(true);
      toast.success('Super Admin Console Access Granted');
    } else {
      setAuthError('Invalid administrator email or password.');
    }
  };

  const handleDevLogout = () => {
    sessionStorage.removeItem('nht_dev_auth_session');
    setIsDevAuthorized(false);
    setEmailInput('');
    setPasswordInput('');
    toast('Developer Session Terminated');
  };

  const fetchDevData = async () => {
    try {
      setLoading(true);

      const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
      setTotalProducts(prodCount || 0);

      const { count: invCount } = await supabase.from('sales_invoices').select('*', { count: 'exact', head: true });
      setTotalInvoices(invCount || 0);

      // Fetch locations
      const { data: locData } = await supabase.from('inventory_locations').select('*');
      if (locData) setLocations(locData);

      // Fetch saved employee tenant accounts
      const { data: tenantData } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
      
      let formattedEmployees: EmployeeAccount[] = [];
      if (tenantData && tenantData.length > 0) {
        formattedEmployees = tenantData.map((t: any) => ({
          id: String(t.id),
          name: t.name,
          slug: t.slug,
          email: t.email,
          role: t.role || t.business_activity || (t.name?.toLowerCase().includes('admin') ? 'Super Admin' : 'Staff'),
          allowed_modules: Array.isArray(t.allowed_modules) && t.allowed_modules.length > 0 ? t.allowed_modules : getAllPermissionIds(),
          created_at: t.created_at || new Date().toISOString(),
        }));
      }

      setEmployees(formattedEmployees);
      setTotalEmployees(formattedEmployees.length);
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to load employee access data');
    } finally {
      setLoading(false);
    }
  };

  const applyRolePresetToNew = (presetKey: string) => {
    const preset = ROLE_PRESETS[presetKey];
    if (preset) {
      setNewEmployee(prev => ({
        ...prev,
        role: presetKey,
        modules: preset.modules,
      }));
      toast.success(`Loaded "${preset.name}" permission template`);
    }
  };

  const applyRolePresetToEdit = (presetKey: string) => {
    const preset = ROLE_PRESETS[presetKey];
    if (preset) {
      setEditRole(presetKey);
      setEditModules(preset.modules);
      toast.success(`Applied "${preset.name}" permissions`);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployee.name || !newEmployee.email || !newEmployee.password) {
      toast.error('Please fill in all required employee fields');
      return;
    }

    try {
      setIsCreating(true);
      const cleanSlug = newEmployee.name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');

      // 1. Create User in Supabase Auth with allowed modules and role
      // Create a secondary client so we don't log out the active session
      const secondaryAuthClient = createClient(
        import.meta.env.VITE_SUPABASE_URL || 'https://ioxsprfchcytqbyriwby.supabase.co',
        import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_59EOl26obYAzn_Z9pZQ9Bw_T0iKDKZJ',
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      
      const { data: authData, error: authError } = await secondaryAuthClient.auth.signUp({
        email: newEmployee.email.trim(),
        password: newEmployee.password,
        options: {
          data: {
            name: newEmployee.name.trim(),
            full_name: newEmployee.name.trim(),
            role: newEmployee.role,
            tenant_id: cleanSlug,
            business_name: 'AL MUHAMMADI',
            allowed_modules: newEmployee.modules,
          },
        },
      });

      if (authError) throw authError;

      // 2. Record employee in tenants table
      try {
        await supabase.from('tenants').upsert([
          {
            name: newEmployee.name.trim(),
            slug: cleanSlug,
            email: newEmployee.email.trim(),
            business_activity: newEmployee.role,
            seller_address: 'AL MUHAMMADI Headquarters',
            allowed_modules: newEmployee.modules,
            location_id: newEmployee.role === 'Warehouse Manager' && newEmployee.location_id ? Number(newEmployee.location_id) : null,
          },
        ], { onConflict: 'slug' });
      } catch (err) {
        console.warn('Tenants table upsert:', err);
      }

      // 3. Auto-link Salesman role to Salesmen directory
      if (newEmployee.role === 'Salesman' && authData?.user?.id) {
        try {
          await supabase.from('salesmen').insert({
            name: newEmployee.name.trim(),
            user_id: authData.user.id,
          });
        } catch (err) {
          console.warn('Salesmen table insert:', err);
        }
      }


      setCreatedResult({
        name: newEmployee.name.trim(),
        email: newEmployee.email.trim(),
        role: newEmployee.role,
      });

      toast.success(`Employee account "${newEmployee.name}" registered with role "${newEmployee.role}"!`);
      
      setNewEmployee({
        name: '',
        email: '',
        password: '',
        role: 'Warehouse Manager',
        location_id: '',
        modules: ROLE_PRESETS['Warehouse Manager'].modules,
      });
      fetchDevData();
    } catch (err: any) {
      toast.error('Registration failed: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEditModal = (emp: EmployeeAccount) => {
    setEditingEmployee(emp);
    setEditName(emp.name || '');
    setEditRole(emp.role || 'Warehouse Manager');
    setEditModules(emp.allowed_modules || getAllPermissionIds());
  };

  const handleSaveEmployeePermissions = async () => {
    if (!editingEmployee) return;

    try {
      setIsSavingEdit(true);
      
      // Attempt update with standard columns (business_activity, allowed_modules)
      const updatePayload: any = {
        name: editName.trim(),
        business_activity: editRole,
        allowed_modules: editModules,
      };

      const { error } = await supabase
        .from('tenants')
        .update(updatePayload)
        .eq('slug', editingEmployee.slug);

      if (error) {
        // Fallback update without crashing if specific column differs
        const { error: fallbackError } = await supabase
          .from('tenants')
          .update({ name: editName.trim(), business_activity: editRole })
          .eq('slug', editingEmployee.slug);
        
        if (fallbackError) {
          console.warn('Tenant record fallback:', fallbackError);
        }
      }

      // If they are a salesman, sync name to salesmen table
      if (editRole === 'Salesman' || editingEmployee.role === 'Salesman') {
        try {
          await supabase.from('salesmen').update({ name: editName.trim() }).eq('name', editingEmployee.name);
        } catch (err) {
          console.warn('Sync salesman name error:', err);
        }
      }

      // Also update local cache for immediate effect
      try {
        localStorage.setItem(`nht_modules_${editingEmployee.slug}`, JSON.stringify(editModules));
      } catch (_) {}

      toast.success(`Role & permissions for "${editingEmployee.name}" updated!`);
      setEditingEmployee(null);
      fetchDevData();
    } catch (e: any) {
      toast.error('Update failed: ' + e.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleOpenDeleteModal = (emp: EmployeeAccount) => {
    setDeletingEmployee(emp);
    setDeletePasswordInput('');
    setDeleteError(null);
  };

  const handleConfirmDeleteEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingEmployee) return;

    // Validate Developer / Super Admin Password
    const entered = deletePasswordInput.trim();
    if (entered !== DEV_PASSWORD && entered !== BACKUP_DEV_PASSWORD) {
      setDeleteError('Incorrect Developer Password. Access denied.');
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError(null);

      // 1. Delete from tenants table
      if (deletingEmployee.slug) {
        const { error: delErr } = await supabase.from('tenants').delete().eq('slug', deletingEmployee.slug);
        if (delErr) console.warn('Tenant delete error:', delErr);
      } else if (deletingEmployee.id) {
        const { error: delErr } = await supabase.from('tenants').delete().eq('id', deletingEmployee.id);
        if (delErr) console.warn('Tenant delete error:', delErr);
      }

      // 2. If Salesman, also remove from salesmen directory
      if (deletingEmployee.role === 'Salesman' || deletingEmployee.name) {
        try {
          await supabase
            .from('salesmen')
            .delete()
            .eq('name', deletingEmployee.name);
        } catch (err) {
          console.warn('Salesman cleanup warning:', err);
        }
      }

      // 3. Clear local storage permissions cache
      try {
        localStorage.removeItem(`nht_modules_${deletingEmployee.slug}`);
      } catch (_) {}

      // Update state locally for instant UI update
      setEmployees(prev => prev.filter(e => e.id !== deletingEmployee.id && e.slug !== deletingEmployee.slug));

      toast.success(`Employee account "${deletingEmployee.name}" deleted successfully.`);
      setDeletingEmployee(null);
      setDeletePasswordInput('');
      fetchDevData();
    } catch (err: any) {
      console.error('Delete employee failed:', err);
      toast.error('Failed to delete employee: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  // IF NOT AUTHENTICATED AS DEVELOPER -> SHOW SECURE LOGIN FORM
  if (!isDevAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 text-body dark:bg-boxdark-2 dark:text-bodydark flex flex-col items-center justify-center p-6 font-sans transition-colors duration-200">
        
        <div className="absolute top-6 right-6">
          <ul className="flex items-center gap-2 list-none m-0">
            <DarkModeSwitcher />
          </ul>
        </div>

        <div className="w-full max-w-md bg-white dark:bg-boxdark border border-stroke dark:border-strokedark p-8 sm:p-10 rounded-3xl shadow-default space-y-6 transition-colors duration-200">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mx-auto flex items-center justify-center text-3xl shadow-xs">
              <MdSecurity />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-black dark:text-white">Master Role & Dev Console</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Employee Access & Roles Control for AL Muhammadi</p>
          </div>

          {authError && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-danger text-xs p-3 rounded-lg flex items-center gap-2">
              <MdLockOutline /> {authError}
            </div>
          )}

          <form onSubmit={handleDevLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-black dark:text-white mb-1.5">Master Developer Email</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="developer@noorhorizontechnologies.com"
                className="w-full bg-transparent dark:bg-form-input border border-stroke dark:border-form-strokedark rounded-xl p-3 text-xs text-black dark:text-white outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-black dark:text-white mb-1.5">Master Password</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-transparent dark:bg-form-input border border-stroke dark:border-form-strokedark rounded-xl p-3 text-xs text-black dark:text-white outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <MdVpnKey /> Authenticate Role Console
            </button>
          </form>

          <div className="pt-2 text-center">
            <a href="/" className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-emerald-600 transition">
              ← Return to Main Application
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Resolve employee friendly name, role, and avatar from performed_by identifier
  const getEmployeeInfo = (performedBy?: string) => {
    if (!performedBy || performedBy.toLowerCase() === 'system') {
      return {
        name: 'System Automated',
        role: 'Background System',
        email: 'Automated Audit Daemon',
        initials: 'SYS',
        avatarBg: 'bg-gray-100 text-gray-700 dark:bg-meta-4 dark:text-gray-300',
        badgeColor: 'bg-gray-100 text-gray-700 dark:bg-meta-4 dark:text-gray-300 border-gray-300 dark:border-strokedark',
      };
    }
    const lower = performedBy.toLowerCase();
    if (
      lower.includes('admin') ||
      lower === 'system administrator' ||
      lower === DEV_EMAIL.toLowerCase() ||
      lower === BACKUP_DEV_EMAIL.toLowerCase()
    ) {
      return {
        name: 'Al Muhammadi',
        role: 'Super Admin',
        email: lower.includes('@') ? performedBy : DEV_EMAIL,
        initials: 'AM',
        avatarBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
        badgeColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      };
    }

    const matched = employees.find(
      e =>
        (e.email && e.email.toLowerCase() === lower) ||
        (e.name && e.name.toLowerCase() === lower) ||
        (e.slug && e.slug.toLowerCase() === lower)
    );

    if (matched) {
      const parts = matched.name.split(' ');
      const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase();
      return {
        name: matched.name,
        role: matched.role || 'Staff Member',
        email: matched.email || performedBy,
        initials,
        avatarBg: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
        badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-300 dark:border-blue-800',
      };
    }

    if (performedBy.includes('@')) {
      const username = performedBy.split('@')[0];
      const prettyName = username.charAt(0).toUpperCase() + username.slice(1);
      return {
        name: prettyName,
        role: 'Staff User',
        email: performedBy,
        initials: prettyName.slice(0, 2).toUpperCase(),
        avatarBg: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
        badgeColor: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-300 dark:border-purple-800',
      };
    }

    return {
      name: performedBy,
      role: 'Staff Member',
      email: performedBy,
      initials: performedBy.slice(0, 2).toUpperCase(),
      avatarBg: 'bg-gray-100 text-gray-700 dark:bg-meta-4 dark:text-gray-300',
      badgeColor: 'bg-gray-100 text-gray-700 dark:bg-meta-4 dark:text-gray-300 border-gray-300 dark:border-strokedark',
    };
  };

  // Plain-English Activity Formatter for Non-Technical Users
  const formatActivityEvent = (log: any) => {
    const action = (log.action_type || 'UNKNOWN').toUpperCase();
    const table = (log.table_name || '').toLowerCase();
    const details = log.details || {};

    if (action === 'LOGIN') {
      return {
        category: 'User Authentication',
        actionLabel: 'Logged In',
        badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800',
        icon: '🔐',
        title: 'Logged into ERP System',
        summary: details.email ? `User ${details.email} logged in` : 'Employee session started',
      };
    }
    if (action === 'LOGOUT') {
      return {
        category: 'User Authentication',
        actionLabel: 'Logged Out',
        badgeClass: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800',
        icon: '🚪',
        title: 'Signed Out of System',
        summary: details.email ? `User ${details.email} signed out` : 'Employee session ended',
      };
    }

    if (table.includes('system') || action === 'SYSTEM') {
      return {
        category: 'System Operations',
        actionLabel: 'System Notice',
        badgeClass: 'bg-gray-100 text-gray-700 dark:bg-meta-4 dark:text-gray-300 border-gray-300 dark:border-strokedark',
        icon: '⚙️',
        title: details.event || 'System Audit Initialized',
        summary: details.scope || 'System background audit stream active',
      };
    }

    if (table.includes('sales_invoice') && !table.includes('receipt')) {
      const invNo = details.invoice_number || (details.id ? `#${details.id}` : '');
      const cust = details.customer_name || details.customer || '';
      const total = details.total_amount ? `Rs. ${Number(details.total_amount).toLocaleString()}` : '';

      if (action === 'INSERT') {
        return {
          category: 'Sales & Invoicing',
          actionLabel: 'Created Invoice',
          badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
          icon: '🧾',
          title: `Created Sales Invoice ${invNo}`,
          summary: [cust && `Customer: ${cust}`, total && `Total: ${total}`].filter(Boolean).join(' • ') || 'New sales invoice recorded',
        };
      }
      if (action === 'UPDATE') {
        return {
          category: 'Sales & Invoicing',
          actionLabel: 'Modified Invoice',
          badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
          icon: '✏️',
          title: `Modified Sales Invoice ${invNo}`,
          summary: [cust && `Customer: ${cust}`, total && `Total: ${total}`].filter(Boolean).join(' • ') || 'Sales invoice updated',
        };
      }
      if (action === 'DELETE') {
        return {
          category: 'Sales & Invoicing',
          actionLabel: 'Deleted Invoice',
          badgeClass: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-300 dark:border-red-800',
          icon: '🗑️',
          title: `Deleted Sales Invoice ${invNo}`,
          summary: cust ? `Cancelled invoice for customer: ${cust}` : 'Sales invoice removed',
        };
      }
    }

    if (table.includes('receipt') || table.includes('invoice_receipt')) {
      const rcptNo = details.receipt_number || (details.id ? `#${details.id}` : '');
      const amt = details.received_amount || details.amount ? `Rs. ${Number(details.received_amount || details.amount).toLocaleString()}` : '';
      const cust = details.customer_name || '';

      if (action === 'INSERT') {
        return {
          category: 'Finance & Receipts',
          actionLabel: 'Payment Received',
          badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
          icon: '💰',
          title: `Received Customer Payment ${rcptNo}`,
          summary: [cust && `From: ${cust}`, amt && `Amount: ${amt}`].filter(Boolean).join(' • ') || 'Payment receipt generated',
        };
      }
      return {
        category: 'Finance & Receipts',
        actionLabel: action === 'UPDATE' ? 'Updated Receipt' : 'Deleted Receipt',
        badgeClass: action === 'UPDATE' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300' : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-300',
        icon: '💵',
        title: `${action === 'UPDATE' ? 'Modified' : 'Deleted'} Receipt ${rcptNo}`,
        summary: amt ? `Amount: ${amt}` : 'Payment receipt altered',
      };
    }

    if (table.includes('delivery_challan') || table.includes('challan')) {
      const chNo = details.challan_number || (details.id ? `#${details.id}` : '');
      const cust = details.customer_name || '';

      if (action === 'INSERT') {
        return {
          category: 'Warehouse & Logistics',
          actionLabel: 'Stock Dispatched',
          badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
          icon: '🚚',
          title: `Dispatched Delivery Challan ${chNo}`,
          summary: cust ? `Outward delivery to: ${cust}` : 'Goods dispatched from warehouse',
        };
      }
      return {
        category: 'Warehouse & Logistics',
        actionLabel: action === 'UPDATE' ? 'Updated Challan' : 'Deleted Challan',
        badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300',
        icon: '📦',
        title: `${action === 'UPDATE' ? 'Modified' : 'Deleted'} Delivery Challan ${chNo}`,
        summary: 'Warehouse dispatch record changed',
      };
    }

    if (table.includes('return')) {
      const retNo = details.return_number || (details.id ? `#${details.id}` : '');
      return {
        category: 'Sales Returns',
        actionLabel: 'Sales Return',
        badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800',
        icon: '↩️',
        title: `Processed Sales Return ${retNo}`,
        summary: details.reason ? `Reason: ${details.reason}` : 'Returned item received into inventory',
      };
    }

    if (table.includes('stock_transfer') || table.includes('transfer')) {
      return {
        category: 'Warehouse Inventory',
        actionLabel: 'Stock Transfer',
        badgeClass: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-300 dark:border-teal-800',
        icon: '🔄',
        title: 'Inter-Warehouse Stock Transfer',
        summary: details.source_location && details.destination_location
          ? `Transferred from ${details.source_location} to ${details.destination_location}`
          : 'Stock movement recorded between locations',
      };
    }

    if (table.includes('purchase')) {
      const poNo = details.purchase_number || (details.id ? `#${details.id}` : '');
      const vendor = details.vendor_name || details.supplier || '';
      return {
        category: 'Purchase & Stock Inward',
        actionLabel: action === 'INSERT' ? 'New Purchase' : 'Purchase Record',
        badgeClass: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
        icon: '🛍️',
        title: `Supplier Purchase ${poNo}`,
        summary: vendor ? `Vendor: ${vendor}` : 'Purchase transaction registered',
      };
    }

    if (table.includes('opening_stock') || table.includes('opening_stocks')) {
      const stockNo = details.stock_no || details.stockNo || (details.id ? `#${details.id}` : '');
      const loc = details.location || '';
      const itemsCount = details.items_count ? `${details.items_count} Products` : (details.product_name ? details.product_name : '');
      const totalUnits = details.total_quantity || details.quantity || details.qty ? `${details.total_quantity || details.quantity || details.qty} Units` : '';

      return {
        category: 'Inventory & Opening Stock',
        actionLabel: action === 'INSERT' ? 'Opening Stock In' : action === 'UPDATE' ? 'Updated Stock' : 'Deleted Stock',
        badgeClass: action === 'INSERT'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
          : action === 'UPDATE'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
          : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-300 dark:border-red-800',
        icon: '📦',
        title: action === 'INSERT' ? `Initialized Opening Stock (${stockNo})` : action === 'UPDATE' ? `Updated Opening Stock (${stockNo})` : `Deleted Opening Stock (${stockNo})`,
        summary: [loc && `Location: ${loc}`, itemsCount, totalUnits].filter(Boolean).join(' • ') || 'Opening stock record processed',
      };
    }

    if (table.includes('product')) {
      const isBulk = Boolean(details.event?.toLowerCase().includes('bulk') || details.new_products_added !== undefined || details.file_name);
      if (isBulk) {
        const added = details.new_products_added ?? 0;
        const updated = details.existing_products_updated ?? 0;
        const skipped = details.skipped_duplicates ?? 0;
        return {
          category: 'Product Catalog',
          actionLabel: 'Bulk Product Upload',
          badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
          icon: '📦',
          title: `Bulk Upload: ${added} New Products Added`,
          summary: `${added} added • ${updated} updated • ${skipped} duplicates skipped (${details.file_name || 'Excel'})`,
        };
      }

      return {
        category: 'Product Catalog',
        actionLabel: action === 'INSERT' ? 'Created Product' : action === 'UPDATE' ? 'Updated Product' : 'Deleted Product',
        badgeClass: action === 'INSERT'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
          : action === 'UPDATE'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300'
          : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-300',
        icon: '🏷️',
        title: `${action === 'INSERT' ? 'Added' : action === 'UPDATE' ? 'Updated' : 'Removed'} Product: ${details.product_name || details.name || ''}`,
        summary: details.item_sr_no ? `Code: ${details.item_sr_no}` : (details.category ? `Category: ${details.category}` : 'Product catalog modified'),
      };
    }

    let friendlyAction = 'Activity Logged';
    let badgeClass = 'bg-gray-100 text-gray-700 dark:bg-meta-4 dark:text-gray-300 border-gray-300 dark:border-strokedark';
    if (action === 'INSERT') {
      friendlyAction = 'Created Record';
      badgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300';
    } else if (action === 'UPDATE') {
      friendlyAction = 'Modified Record';
      badgeClass = 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300';
    } else if (action === 'DELETE') {
      friendlyAction = 'Deleted Record';
      badgeClass = 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-300';
    }

    const cleanCategory = table ? table.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'System';

    return {
      category: cleanCategory,
      actionLabel: friendlyAction,
      badgeClass,
      icon: '📝',
      title: `${friendlyAction} in ${cleanCategory}`,
      summary: details.id ? `Record ID #${details.id}` : (typeof details === 'string' ? details : JSON.stringify(details).slice(0, 70)),
    };
  };

  // Distinct list of employees for filter dropdown
  const employeeFilterOptions = React.useMemo(() => {
    const list: { key: string; label: string }[] = [];
    const added = new Set<string>();

    employees.forEach(emp => {
      if (emp.name && !added.has(emp.name.toLowerCase())) {
        added.add(emp.name.toLowerCase());
        list.push({ key: emp.name, label: `${emp.name} (${emp.role || 'Staff'})` });
      }
    });

    logs.forEach(log => {
      const info = getEmployeeInfo(log.performed_by);
      if (info.name && !added.has(info.name.toLowerCase())) {
        added.add(info.name.toLowerCase());
        list.push({ key: info.name, label: `${info.name} (${info.role})` });
      }
    });

    return list;
  }, [employees, logs]);

  // Audit Logs computed filtering & pagination
  const filteredLogs = logs.filter(log => {
    // Action filter
    if (logFilterAction !== 'ALL') {
      if (logFilterAction === 'AUTH') {
        if (log.action_type !== 'LOGIN' && log.action_type !== 'LOGOUT') return false;
      } else if (log.action_type !== logFilterAction) {
        return false;
      }
    }

    // Employee filter
    if (logFilterEmployee !== 'ALL') {
      const empInfo = getEmployeeInfo(log.performed_by);
      const matchesName = empInfo.name.toLowerCase() === logFilterEmployee.toLowerCase();
      const matchesEmail = empInfo.email.toLowerCase() === logFilterEmployee.toLowerCase();
      const matchesRaw = (log.performed_by || '').toLowerCase() === logFilterEmployee.toLowerCase();
      if (!matchesName && !matchesEmail && !matchesRaw) return false;
    }

    // Search query
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      const empInfo = getEmployeeInfo(log.performed_by);
      const activity = formatActivityEvent(log);
      const matchAction = (log.action_type || '').toLowerCase().includes(q);
      const matchCategory = activity.category.toLowerCase().includes(q);
      const matchTitle = activity.title.toLowerCase().includes(q);
      const matchSummary = activity.summary.toLowerCase().includes(q);
      const matchEmpName = empInfo.name.toLowerCase().includes(q);
      const matchEmpRole = empInfo.role.toLowerCase().includes(q);
      const matchDetails = JSON.stringify(log.details || {}).toLowerCase().includes(q);
      return matchAction || matchCategory || matchTitle || matchSummary || matchEmpName || matchEmpRole || matchDetails;
    }

    return true;
  });

  const pageSize = 15;
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = filteredLogs.slice((logPage - 1) * pageSize, logPage * pageSize);

  return (
    <div className="min-h-screen bg-gray-50 text-body dark:bg-boxdark-2 dark:text-bodydark font-sans p-6 md:p-10 flex flex-col items-center transition-colors duration-200">
      
      {/* HEADER */}
      <header className="w-full max-w-6xl bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded-2xl p-6 shadow-default flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 transition-colors duration-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-2xl">
            <MdAdminPanelSettings />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-black dark:text-white tracking-tight">AL Muhammadi</h1>
              <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                Employee Role & Access Control
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
              Admin & Role Console: <span className="text-black dark:text-gray-200 font-medium">admin@almuhammadi.com</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* TABS SWITCHER */}
          <div className="bg-gray-100 dark:bg-meta-4/30 p-1 rounded-xl border border-stroke dark:border-strokedark flex text-xs font-semibold">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-1.5 px-3 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'overview' ? 'bg-white dark:bg-boxdark text-emerald-700 dark:text-white shadow-xs font-bold' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <MdDashboard /> Roles Overview
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`py-1.5 px-3 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'employees' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <MdPeople /> Employee Accounts ({employees.length})
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`py-1.5 px-3 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'create' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <MdAddCircle /> Add Employee User
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-1.5 px-3 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'logs' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <MdHistory /> Logs {logs.length > 0 && `(${logs.length})`}
            </button>
          </div>

          <ul className="flex items-center gap-2 list-none m-0">
            <DarkModeSwitcher />
          </ul>

          <button
            onClick={handleDevLogout}
            title="Sign Out of Console"
            className="p-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-danger border border-red-200 dark:border-red-500/30 transition cursor-pointer"
          >
            <MdLogout />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="w-full max-w-6xl space-y-6">
        
        {/* TAB 1: OVERVIEW METRICS */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white dark:bg-boxdark p-6 rounded-2xl border border-stroke dark:border-strokedark shadow-default transition-colors duration-200">
                <div className="flex justify-between items-center text-gray-500 dark:text-gray-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Active Employee Accounts</span>
                  <MdPeople className="text-emerald-600 text-xl" />
                </div>
                <div className="text-3xl font-black text-black dark:text-white">{totalEmployees}</div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Configured company user profiles</p>
              </div>

              <div className="bg-white dark:bg-boxdark p-6 rounded-2xl border border-stroke dark:border-strokedark shadow-default transition-colors duration-200">
                <div className="flex justify-between items-center text-gray-500 dark:text-gray-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Registered Products</span>
                  <MdLayers className="text-teal-600 text-xl" />
                </div>
                <div className="text-3xl font-black text-black dark:text-white">{totalProducts}</div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Inventory master catalog</p>
              </div>

              <div className="bg-white dark:bg-boxdark p-6 rounded-2xl border border-stroke dark:border-strokedark shadow-default transition-colors duration-200">
                <div className="flex justify-between items-center text-gray-500 dark:text-gray-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Processed Invoices</span>
                  <MdSecurity className="text-emerald-600 text-xl" />
                </div>
                <div className="text-3xl font-black text-black dark:text-white">{totalInvoices}</div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Total sales transactions recorded</p>
              </div>
            </div>

            {/* ROLE PRESET QUICK TEMPLATES */}
            <div className="bg-white dark:bg-boxdark p-6 rounded-2xl border border-stroke dark:border-strokedark shadow-default transition-colors duration-200">
              <h3 className="text-sm font-bold text-black dark:text-white mb-2 uppercase tracking-wider">Predefined Employee Role Templates</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Click any template below to create a new employee with pre-configured screen permissions:</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                  <div
                    key={key}
                    onClick={() => {
                      applyRolePresetToNew(key);
                      setActiveTab('create');
                    }}
                    className="bg-gray-50 dark:bg-meta-4/20 p-4 rounded-xl border border-stroke dark:border-strokedark hover:border-emerald-500 dark:hover:border-emerald-500 transition cursor-pointer flex flex-col justify-between space-y-2 group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{preset.icon}</span>
                        <h4 className="font-bold text-black dark:text-white text-sm group-hover:text-emerald-600 transition">{preset.name}</h4>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">{preset.description}</p>
                    </div>
                    <div className="pt-2 flex justify-between items-center border-t border-stroke/50 dark:border-strokedark/50">
                      <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                        {preset.modules.length} Permitted Pages
                      </span>
                      <span className="text-xs text-emerald-600 font-bold group-hover:translate-x-1 transition-transform">
                        Use Role →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EMPLOYEE ACCOUNTS & PERMISSION MATRIX */}
        {activeTab === 'employees' && (
          <div className="bg-white dark:bg-boxdark rounded-2xl border border-stroke dark:border-strokedark shadow-default overflow-hidden transition-colors duration-200">
            <div className="p-6 border-b border-stroke dark:border-strokedark flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-bold text-black dark:text-white">Active Company Employee Accounts</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Manage individual employee permissions, roles, and allowed pages.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('create')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <MdAddCircle /> Add New Employee User
              </button>
            </div>

            <div className="max-w-full overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-meta-4/30 text-gray-600 dark:text-gray-300 font-bold uppercase tracking-wider border-b border-stroke dark:border-strokedark">
                    <th className="p-4">Employee Name</th>
                    <th className="p-4">Assigned Role</th>
                    <th className="p-4">Login Email</th>
                    <th className="p-4">Permitted Modules</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-strokedark">
                  {employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-meta-4/20 transition">
                      <td className="p-4 font-bold text-black dark:text-white flex items-center gap-2">
                        <MdBadge className="text-emerald-600 text-base shrink-0" />
                        <span>{emp.name}</span>
                      </td>
                      <td className="p-4">
                        <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 px-2.5 py-1 rounded-md text-[11px] font-bold">
                          {emp.role || 'Staff'}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-gray-600 dark:text-gray-400">
                        {emp.email || '—'}
                      </td>
                      <td className="p-4">
                        <span className="bg-gray-100 dark:bg-meta-4 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-md text-[11px] font-mono border border-stroke dark:border-strokedark font-bold">
                          {emp.allowed_modules?.length || 0} pages allowed
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenEditModal(emp)}
                            className="inline-flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition shadow-xs"
                          >
                            <MdEdit /> Edit Role & Permissions
                          </button>
                          <button
                            onClick={() => handleOpenDeleteModal(emp)}
                            className="inline-flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition shadow-xs"
                            title="Delete Employee Account"
                          >
                            <MdDeleteOutline className="text-sm" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: CREATE NEW EMPLOYEE USER */}
        {activeTab === 'create' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {createdResult && (
              <div className="bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-500/50 rounded-2xl p-6 shadow-default space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                  <MdCheckCircle className="text-xl" />
                  <span>Employee Account Registered Successfully!</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Employee <strong>{createdResult.name}</strong> can now log into the application with email <code>{createdResult.email}</code> and their designated role <strong>{createdResult.role}</strong>.
                </p>
              </div>
            )}

            <div className="bg-white dark:bg-boxdark p-8 rounded-2xl border border-stroke dark:border-strokedark shadow-default transition-colors duration-200">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-stroke dark:border-strokedark">
                <div>
                  <h3 className="text-xl font-extrabold text-black dark:text-white">Register New Employee User</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Assign a role (Warehouse Manager, Accountant, Salesman, etc.) and configure accessible pages.
                  </p>
                </div>
                <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs px-3 py-1 rounded-full border border-emerald-500/20 font-semibold flex items-center gap-1.5">
                  <MdSecurity /> AL MUHAMMADI RBAC
                </span>
              </div>

              <form onSubmit={handleCreateEmployee} className="space-y-6">
                
                {/* 1. EMPLOYEE DETAILS */}
                <div className="bg-gray-50 dark:bg-meta-4/20 p-5 rounded-xl border border-stroke dark:border-strokedark space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <MdBadge /> 1. Employee Profile & Login Credentials
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-black dark:text-white mb-1">
                        Employee Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ali Raza (Warehouse Lead)"
                        value={newEmployee.name}
                        onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })}
                        className="w-full bg-white dark:bg-form-input border border-stroke dark:border-form-strokedark rounded-lg p-2.5 text-black dark:text-white text-xs outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-black dark:text-white mb-1">
                        Assigned Employee Role *
                      </label>
                      <select
                        value={newEmployee.role}
                        onChange={e => applyRolePresetToNew(e.target.value)}
                        className="w-full bg-white dark:bg-form-input border border-stroke dark:border-form-strokedark rounded-lg p-2.5 text-black dark:text-white text-xs outline-none focus:border-emerald-500 font-semibold"
                      >
                        {Object.keys(ROLE_PRESETS).map(roleKey => (
                          <option key={roleKey} value={roleKey}>
                            {ROLE_PRESETS[roleKey].name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {newEmployee.role === 'Warehouse Manager' && (
                      <div>
                        <label className="block text-xs font-bold text-black dark:text-white mb-1 text-emerald-600">Assigned Location *</label>
                        <select
                          required
                          value={newEmployee.location_id}
                          onChange={e => setNewEmployee({ ...newEmployee, location_id: e.target.value })}
                          className="w-full bg-white dark:bg-form-input border border-emerald-300 dark:border-emerald-700 rounded-lg p-2.5 text-black dark:text-white text-xs outline-none focus:border-emerald-500"
                        >
                          <option value="">Select Location</option>
                          {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name} ({loc.location_type})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-black dark:text-white mb-1">Login Email / Username *</label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. warehouse@almuhammadi.com"
                        value={newEmployee.email}
                        onChange={e => setNewEmployee({ ...newEmployee, email: e.target.value })}
                        className="w-full bg-white dark:bg-form-input border border-stroke dark:border-form-strokedark rounded-lg p-2.5 text-black dark:text-white text-xs outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-black dark:text-white mb-1">Login Password *</label>
                      <input
                        type="password"
                        required
                        placeholder="8+ Characters"
                        value={newEmployee.password}
                        onChange={e => setNewEmployee({ ...newEmployee, password: e.target.value })}
                        className="w-full bg-white dark:bg-form-input border border-stroke dark:border-form-strokedark rounded-lg p-2.5 text-black dark:text-white text-xs outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. ROLE PRESETS QUICK-BAR */}
                <div className="bg-gray-50 dark:bg-meta-4/20 p-5 rounded-xl border border-stroke dark:border-strokedark space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <MdLayers /> 2. Fast Role Template Selector
                    </h4>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                      Selected: <strong className="text-emerald-600">{newEmployee.modules.length} Pages</strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                      <button
                        type="button"
                        key={key}
                        onClick={() => applyRolePresetToNew(key)}
                        className={`text-xs px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          newEmployee.role === key
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white dark:bg-boxdark text-gray-700 dark:text-gray-300 border-stroke dark:border-strokedark hover:border-emerald-500'
                        }`}
                      >
                        <span>{preset.icon}</span>
                        <span>{key}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. PERMISSION TREE EDITOR */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <MdSecurity /> 3. Fine-Grained Module & Page Permissions
                  </h4>
                  <PermissionTreeEditor
                    selectedIds={newEmployee.modules}
                    onChange={ids => setNewEmployee({ ...newEmployee, modules: ids })}
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-stroke dark:border-strokedark">
                  <button
                    type="button"
                    onClick={() => setActiveTab('employees')}
                    className="px-5 py-2.5 rounded-xl border border-stroke dark:border-strokedark text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-meta-4 transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isCreating ? <Spinner /> : <MdCheckCircle />} Register Employee Account
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= TAB 4: AUDIT LOGS ================= */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            {/* LOGS HEADER & FILTERS BAR */}
            <div className="bg-white dark:bg-boxdark p-5 rounded-2xl border border-stroke dark:border-strokedark shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-lg">
                    <MdHistory />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-black dark:text-white">
                      Live System Activity & Audit Logs
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Real-time forensic logs tracking user logins, sales operations, stock dispatches, and data changes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Search Bar */}
                <div className="relative">
                  <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
                  <input
                    type="text"
                    placeholder="Search logs (user, table, action)..."
                    value={logSearch}
                    onChange={(e) => {
                      setLogSearch(e.target.value);
                      setLogPage(1);
                    }}
                    className="pl-9 pr-3 py-2 text-xs bg-gray-50 dark:bg-meta-4/30 border border-stroke dark:border-strokedark rounded-xl text-black dark:text-white placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none w-56 sm:w-64"
                  />
                  {logSearch && (
                    <button
                      onClick={() => { setLogSearch(''); setLogPage(1); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <MdClose className="text-xs" />
                    </button>
                  )}
                </div>

                {/* Refresh Button */}
                <button
                  onClick={() => fetchAuditLogs()}
                  disabled={logsLoading}
                  className="px-3 py-2 text-xs font-bold rounded-xl border border-stroke dark:border-strokedark hover:bg-gray-50 dark:hover:bg-meta-4 text-gray-700 dark:text-gray-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Reload Logs"
                >
                  <MdRefresh className={logsLoading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>
            </div>

            {/* ACTION & EMPLOYEE FILTERS BAR */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              {/* Action Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
                <span className="text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1 pl-1">
                  <MdFilterList /> Filter:
                </span>
                {[
                  { id: 'ALL', label: 'All Activities', count: logs.length },
                  { id: 'INSERT', label: 'Created', count: logs.filter(l => l.action_type === 'INSERT').length },
                  { id: 'UPDATE', label: 'Modified', count: logs.filter(l => l.action_type === 'UPDATE').length },
                  { id: 'DELETE', label: 'Deleted', count: logs.filter(l => l.action_type === 'DELETE').length },
                  { id: 'AUTH', label: 'Logins & Logouts', count: logs.filter(l => l.action_type === 'LOGIN' || l.action_type === 'LOGOUT').length },
                ].map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => {
                      setLogFilterAction(filter.id);
                      setLogPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-xl border font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      logFilterAction === filter.id
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white dark:bg-boxdark text-gray-600 dark:text-gray-300 border-stroke dark:border-strokedark hover:border-emerald-500'
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      logFilterAction === filter.id
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 dark:bg-meta-4 text-gray-500 dark:text-gray-400'
                    }`}>
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Employee Filter Dropdown */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1">
                  <MdPeople className="text-emerald-600" /> Filter by Employee:
                </span>
                <select
                  value={logFilterEmployee}
                  onChange={e => {
                    setLogFilterEmployee(e.target.value);
                    setLogPage(1);
                  }}
                  className="bg-white dark:bg-boxdark border border-stroke dark:border-strokedark text-black dark:text-white rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
                >
                  <option value="ALL">All Employees & System ({logs.length})</option>
                  {employeeFilterOptions.map(opt => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {logFilterEmployee !== 'ALL' && (
                  <button
                    onClick={() => { setLogFilterEmployee('ALL'); setLogPage(1); }}
                    className="text-[11px] text-emerald-600 hover:underline font-bold"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* LOGS TABLE CARD */}
            <div className="bg-white dark:bg-boxdark rounded-2xl border border-stroke dark:border-strokedark shadow-xs overflow-hidden">
              {logsLoading && logs.length === 0 ? (
                <div className="p-12 text-center">
                  <Spinner />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Loading audit log stream...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-meta-4 flex items-center justify-center mx-auto text-gray-400 text-xl">
                    <MdHistory />
                  </div>
                  <h4 className="text-sm font-bold text-black dark:text-white">No activity logs found</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                    {logSearch || logFilterAction !== 'ALL' || logFilterEmployee !== 'ALL'
                      ? 'No logs matched your current filter criteria. Try changing filters or clearing search.'
                      : 'Audit logs will record here automatically when employees perform sales, inventory, or auth actions.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-stroke dark:border-strokedark bg-gray-50/70 dark:bg-meta-4/20 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <th className="py-3.5 px-4 whitespace-nowrap">Date & Time</th>
                        <th className="py-3.5 px-4">Employee / Performer</th>
                        <th className="py-3.5 px-4">Action</th>
                        <th className="py-3.5 px-4">Activity Description</th>
                        <th className="py-3.5 px-4">Summary Details</th>
                        <th className="py-3.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke dark:divide-strokedark text-xs">
                      {paginatedLogs.map((log: any) => {
                        const emp = getEmployeeInfo(log.performed_by);
                        const activity = formatActivityEvent(log);

                        return (
                          <tr key={log.id} className="hover:bg-gray-50/70 dark:hover:bg-meta-4/10 transition">
                            {/* Date & Time */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="font-semibold text-black dark:text-white">
                                {new Date(log.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: '2-digit',
                                  year: 'numeric',
                                })}
                              </div>
                              <div className="text-[11px] text-gray-400 font-mono">
                                {new Date(log.created_at).toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </div>
                            </td>

                            {/* Employee */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${emp.avatarBg}`}>
                                  {emp.initials}
                                </div>
                                <div>
                                  <div className="font-bold text-black dark:text-white leading-tight">
                                    {emp.name}
                                  </div>
                                  <span className={`inline-block text-[10px] px-1.5 py-0.2 rounded-md font-semibold mt-0.5 border ${emp.badgeColor}`}>
                                    {emp.role}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Action */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${activity.badgeClass}`}>
                                <span>{activity.icon}</span>
                                <span>{activity.actionLabel}</span>
                              </span>
                            </td>

                            {/* Activity Event Title & Category */}
                            <td className="py-3.5 px-4 font-medium text-black dark:text-white max-w-xs">
                              <div className="font-semibold text-xs leading-snug">
                                {activity.title}
                              </div>
                              <div className="text-[11px] text-gray-400">
                                {activity.category}
                              </div>
                            </td>

                            {/* Details Summary */}
                            <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300 max-w-sm">
                              <div className="line-clamp-2 text-xs">
                                {activity.summary || '—'}
                              </div>
                            </td>

                            {/* Action Button */}
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <button
                                onClick={() => {
                                  setSelectedLogModal(log);
                                  setShowRawJsonModal(false);
                                }}
                                className="px-3 py-1.5 rounded-xl border border-stroke dark:border-strokedark bg-white dark:bg-boxdark hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-gray-700 dark:text-gray-200 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                              >
                                <MdVisibility className="text-emerald-600 dark:text-emerald-400 text-sm" /> View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAGINATION BAR */}
              {filteredLogs.length > pageSize && (
                <div className="border-t border-stroke dark:border-strokedark p-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <div>
                    Showing <strong className="text-black dark:text-white">{(logPage - 1) * pageSize + 1}</strong> to{' '}
                    <strong className="text-black dark:text-white">
                      {Math.min(logPage * pageSize, filteredLogs.length)}
                    </strong>{' '}
                    of <strong className="text-black dark:text-white">{filteredLogs.length}</strong> entries
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setLogPage(p => Math.max(1, p - 1))}
                      disabled={logPage === 1}
                      className="px-3 py-1.5 rounded-lg border border-stroke dark:border-strokedark disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-meta-4 transition cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 font-bold text-black dark:text-white">
                      {logPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setLogPage(p => Math.min(totalPages, p + 1))}
                      disabled={logPage >= totalPages}
                      className="px-3 py-1.5 rounded-lg border border-stroke dark:border-strokedark disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-meta-4 transition cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* EDIT EMPLOYEE PERMISSIONS MODAL */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-black/60 z-99999 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-boxdark w-full max-w-2xl rounded-3xl border border-stroke dark:border-strokedark p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
            
            <div className="flex items-center justify-between border-b border-stroke dark:border-strokedark pb-4">
              <div>
                <h4 className="text-lg font-bold text-black dark:text-white">Edit Employee Role & Permissions</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Employee: <strong className="text-emerald-700 dark:text-emerald-400">{editingEmployee.name}</strong> ({editingEmployee.email})
                </p>
              </div>
              <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] px-3 py-1 rounded-md font-mono font-bold border border-emerald-200 dark:border-emerald-800/60">
                {editModules.length} Pages Permitted
              </span>
            </div>

            {/* QUICK PRESET TEMPLATES */}
            {editingEmployee.role === 'Super Admin' || editingEmployee.slug === 'almuhammadi-admin' || editingEmployee.slug === 'zoaib-admin' ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-2xl text-xs text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-3">
                <span className="text-2xl">👑</span>
                <div>
                  <h5 className="font-bold text-amber-900 dark:text-amber-200">Super Admin (Owner) Role is Permanent</h5>
                  <p className="mt-0.5 text-[11px] opacity-90">This master account maintains unrestricted access to all business modules and controls. Its role cannot be modified or downgraded.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-black dark:text-white mb-1">Employee Name:</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-transparent dark:bg-form-input border border-stroke dark:border-form-strokedark rounded-xl p-2 text-xs text-black dark:text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-black dark:text-white mb-2">Role Template Presets:</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => applyRolePresetToEdit(key)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition cursor-pointer ${
                        editRole === key
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-gray-100 dark:bg-meta-4/40 text-gray-700 dark:text-gray-300 border-stroke dark:border-strokedark hover:border-emerald-500'
                      }`}
                    >
                      <span>{preset.icon}</span>
                      <span>{key}</span>
                    </button>
                  ))}
                </div>
              </div>
              </div>
            )}

            {/* PERMISSION TREE */}
            <div className="flex-1 overflow-y-auto pr-1">
              <PermissionTreeEditor
                selectedIds={editModules}
                onChange={ids => setEditModules(ids)}
              />
            </div>

            {/* MODAL ACTIONS */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-stroke dark:border-strokedark">
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 border border-stroke dark:border-strokedark rounded-xl hover:bg-gray-100 dark:hover:bg-meta-4 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveEmployeePermissions}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingEdit ? <Spinner /> : <MdCheck />} Save Role & Permissions
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DELETE EMPLOYEE CONFIRMATION MODAL WITH MASTER DEV PASSWORD */}
      {deletingEmployee && (
        <div className="fixed inset-0 bg-black/60 z-99999 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-boxdark w-full max-w-md rounded-3xl border border-stroke dark:border-strokedark p-6 shadow-2xl space-y-5 transition-colors duration-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-stroke dark:border-strokedark pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center justify-center text-xl shrink-0">
                  <MdDeleteOutline />
                </div>
                <div>
                  <h4 className="text-base font-bold text-black dark:text-white">Delete Employee Account</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Security Verification Required</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setDeletingEmployee(null);
                  setDeletePasswordInput('');
                  setDeleteError(null);
                }}
                className="p-1.5 rounded-xl text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-meta-4 transition cursor-pointer"
              >
                <MdClose className="text-xl" />
              </button>
            </div>

            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 rounded-2xl space-y-1.5 text-xs text-red-700 dark:text-red-300">
              <p className="font-bold">
                Are you sure you want to permanently delete account for <span className="text-red-900 dark:text-red-200 underline underline-offset-2">{deletingEmployee.name}</span> ({deletingEmployee.email || 'No email'})?
              </p>
              <p className="text-[11px] text-red-600/90 dark:text-red-400/90">
                This will revoke their access ({deletingEmployee.allowed_modules?.length || 0} permitted modules) and delete their account profile.
              </p>
            </div>

            <form onSubmit={handleConfirmDeleteEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-black dark:text-white mb-1.5 flex items-center gap-1">
                  <MdLockOutline className="text-gray-400 text-sm" /> Enter Developer Password to Confirm:
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={deletePasswordInput}
                  onChange={e => {
                    setDeletePasswordInput(e.target.value);
                    setDeleteError(null);
                  }}
                  placeholder="Enter master dev password"
                  className="w-full bg-white dark:bg-form-input border border-stroke dark:border-form-strokedark rounded-xl p-3 text-xs text-black dark:text-white outline-none focus:border-red-500 transition shadow-inner"
                />
                {deleteError && (
                  <div className="mt-2 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs p-2.5 rounded-xl border border-red-300 dark:border-red-800 flex items-center gap-1.5 font-semibold">
                    <MdLockOutline className="shrink-0" /> {deleteError}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stroke dark:border-strokedark">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingEmployee(null);
                    setDeletePasswordInput('');
                    setDeleteError(null);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-stroke dark:border-strokedark hover:bg-gray-100 dark:hover:bg-meta-4 text-gray-700 dark:text-gray-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || !deletePasswordInput.trim()}
                  className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? <Spinner /> : <MdDeleteOutline className="text-sm" />} Confirm & Delete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDIT LOG DETAILS MODAL */}
      {selectedLogModal && (() => {
        const emp = getEmployeeInfo(selectedLogModal.performed_by);
        const activity = formatActivityEvent(selectedLogModal);
        const details = selectedLogModal.details || {};
        const isDetailsObject = typeof details === 'object' && details !== null && !Array.isArray(details);

        return (
          <div className="fixed inset-0 bg-black/60 z-99999 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-boxdark w-full max-w-2xl rounded-3xl border border-stroke dark:border-strokedark p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-stroke dark:border-strokedark pb-4">
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-2xl flex items-center justify-center shrink-0">
                    {activity.icon}
                  </span>
                  <div>
                    <h4 className="text-base font-bold text-black dark:text-white">
                      {activity.title}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Recorded on {new Date(selectedLogModal.created_at).toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLogModal(null)}
                  className="p-2 rounded-xl text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-meta-4 transition cursor-pointer"
                >
                  <MdClose className="text-xl" />
                </button>
              </div>

              {/* Quick Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* 1. Employee Performer */}
                <div className="bg-gray-50 dark:bg-meta-4/20 p-3.5 rounded-2xl border border-stroke dark:border-strokedark space-y-1.5">
                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">
                    Performed By
                  </span>
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${emp.avatarBg}`}>
                      {emp.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-black dark:text-white truncate">
                        {emp.name}
                      </div>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block truncate">
                        {emp.role}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Action Type */}
                <div className="bg-gray-50 dark:bg-meta-4/20 p-3.5 rounded-2xl border border-stroke dark:border-strokedark space-y-1.5">
                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">
                    Action Event
                  </span>
                  <div className="pt-0.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${activity.badgeClass}`}>
                      <span>{activity.icon}</span>
                      <span>{activity.actionLabel}</span>
                    </span>
                  </div>
                </div>

                {/* 3. Business Department */}
                <div className="bg-gray-50 dark:bg-meta-4/20 p-3.5 rounded-2xl border border-stroke dark:border-strokedark space-y-1.5">
                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">
                    Business Area
                  </span>
                  <div className="font-bold text-black dark:text-white pt-1 truncate">
                    {activity.category}
                  </div>
                </div>
              </div>

              {/* User-Friendly Activity Breakdown */}
              <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <MdInfoOutline className="text-emerald-600 text-sm" /> Activity Information & Summary
                  </h5>
                  <button
                    type="button"
                    onClick={() => setShowRawJsonModal(prev => !prev)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <MdCode /> {showRawJsonModal ? 'Hide Technical Data' : 'View Technical Data'}
                  </button>
                </div>

                {/* Friendly Field Cards */}
                {isDetailsObject && Object.keys(details).length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {Object.entries(details).map(([key, val]) => {
                      const friendlyKey = key
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase());

                      if (Array.isArray(val)) {
                        return (
                          <div
                            key={key}
                            className="sm:col-span-2 bg-gray-50 dark:bg-meta-4/20 p-3 rounded-xl border border-stroke dark:border-strokedark"
                          >
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1.5">
                              {friendlyKey} ({val.length})
                            </span>
                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                              {val.map((item: any, idx: number) => (
                                <span
                                  key={idx}
                                  className="inline-block bg-white dark:bg-boxdark border border-stroke dark:border-strokedark text-black dark:text-white px-2.5 py-1 rounded-lg text-xs font-medium shadow-2xs"
                                >
                                  {String(item)}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      let displayVal = String(val);
                      if (typeof val === 'number') {
                        if (key.toLowerCase().includes('quantity') || key.toLowerCase().includes('qty')) {
                          displayVal = `${val.toLocaleString()} Units`;
                        } else if (key.toLowerCase().includes('count')) {
                          displayVal = `${val.toLocaleString()}`;
                        } else if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('price') || key.toLowerCase().includes('total')) {
                          displayVal = `Rs. ${val.toLocaleString()}`;
                        } else {
                          displayVal = val.toLocaleString();
                        }
                      } else if (typeof val === 'object' && val !== null) {
                        displayVal = JSON.stringify(val);
                      }

                      return (
                        <div
                          key={key}
                          className="bg-gray-50 dark:bg-meta-4/20 p-3 rounded-xl border border-stroke dark:border-strokedark"
                        >
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                            {friendlyKey}
                          </span>
                          <span className="text-xs font-semibold text-black dark:text-white mt-0.5 block break-words">
                            {displayVal || '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-meta-4/20 p-4 rounded-xl border border-stroke dark:border-strokedark text-xs text-gray-700 dark:text-gray-300">
                    {String(details || 'No additional details recorded for this activity.')}
                  </div>
                )}

                {/* Collapsible Technical JSON (Hidden by default for non-technical users) */}
                {showRawJsonModal && (
                  <div className="pt-2 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[11px] text-gray-400">Raw Technical Payload (JSON)</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(selectedLogModal.details, null, 2));
                          toast.success('Log payload copied to clipboard');
                        }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <MdContentCopy className="text-xs" /> Copy JSON
                      </button>
                    </div>
                    <pre className="bg-gray-900 text-emerald-400 p-3.5 rounded-xl text-xs font-mono border border-gray-800 leading-relaxed overflow-x-auto max-h-48">
                      {JSON.stringify(selectedLogModal.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-stroke dark:border-strokedark flex justify-end">
                <button
                  onClick={() => setSelectedLogModal(null)}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-meta-4 hover:bg-gray-200 dark:hover:bg-meta-4/80 text-black dark:text-white transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default DeveloperDashboard;
