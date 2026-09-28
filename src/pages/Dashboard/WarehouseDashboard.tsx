import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../Context/supabaseClient';
import { useAuth } from '../../Context/Auth';
import Spinner from '../../ui/Spinner';
import GlassCard from '../../ui/GlassCard';
import StatCard from '../../ui/StatCard';
import ActionCard from '../../ui/ActionCard';
import {
  MdWarehouse,
  MdStorefront,
  MdLocalShipping,
  MdAssignmentReturn,
  MdMoveToInbox,
  MdCompareArrows,
  MdCheckCircle,
  MdHourglassEmpty,
  MdWarning,
  MdRefresh,
  MdSearch,
  MdArrowForward,
  MdLocationOn,
  MdInventory2,
  MdDescription,
  MdSyncAlt
} from 'react-icons/md';

interface DeliveryChallanItem {
  id: number;
  challan_no: string;
  customer_name: string;
  challan_date: string;
  dispatch_warehouse: string;
  status: string;
  total_quantity: number;
  driver_name?: string;
  vehicle_no?: string;
  created_at: string;
}

interface StockBalanceItem {
  product_name: string;
  warehouse_name: string;
  quantity: number;
  updated_at: string;
}

interface StockTransferItem {
  id: number;
  transfer_no: string;
  transfer_date: string;
  from_location: string;
  to_location: string;
  status: string;
}

interface WarehouseDashboardProps {
  initialLocation?: 'A-39' | 'SHOP';
}

const WarehouseDashboard: React.FC<WarehouseDashboardProps> = ({ initialLocation }) => {
  const navigate = useNavigate();
  const { userLocationName, userLocationId, userEmail, userName, role } = useAuth();

  // Check if current user is Super Admin / Admin / Owner
  const isAdmin = useMemo(() => {
    const r = (role || '').toLowerCase();
    const email = (userEmail || '').toLowerCase();
    return (
      r.includes('admin') ||
      r.includes('owner') ||
      email === 'admin@almuhammadi.com' ||
      email === 'admin@zoaibalicompany.com' ||
      email === 'developer@noorhorizontechnologies.com'
    );
  }, [role, userEmail]);

  // Determine user's assigned warehouse (SHOP or A-39)
  const userAssignedLocation: 'A-39' | 'SHOP' = useMemo(() => {
    const locName = (userLocationName || '').toUpperCase();
    const uName = (userName || '').toUpperCase();
    const email = (userEmail || '').toLowerCase();
    const locId = userLocationId ? String(userLocationId) : '';

    if (locName.includes('SHOP') || uName.includes('SHOP') || email.includes('shop') || locId === '2') {
      return 'SHOP';
    }
    return 'A-39';
  }, [userLocationName, userName, userEmail, userLocationId]);

  // Can the user switch warehouses?
  // Strictly only Admins can switch between warehouses. Warehouse employees are locked to their own warehouse for safety!
  const canSwitchLocation = isAdmin && !initialLocation;

  // Active location is either prop, or if not admin locked to userAssignedLocation, else default
  const [activeLocation, setActiveLocation] = useState<'A-39' | 'SHOP'>(() => {
    if (initialLocation) return initialLocation;
    if (!isAdmin) return userAssignedLocation;
    return userAssignedLocation || 'A-39';
  });

  // Safety lock: If user is not Admin, strictly enforce their assigned location
  useEffect(() => {
    if (!canSwitchLocation) {
      setActiveLocation(userAssignedLocation);
    }
  }, [canSwitchLocation, userAssignedLocation]);

  const [loading, setLoading] = useState(true);

  // Data states
  const [challans, setChallans] = useState<DeliveryChallanItem[]>([]);
  const [stockBalances, setStockBalances] = useState<StockBalanceItem[]>([]);
  const [transfers, setTransfers] = useState<StockTransferItem[]>([]);

  // Filter states
  const [searchChallan, setSearchChallan] = useState('');
  const [searchStock, setSearchStock] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Dispatched' | 'Partially Dispatched'>('ALL');

  // Load Warehouse Data
  const loadWarehouseData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Delivery Challans
      const { data: dcData, error: dcErr } = await supabase
        .from('delivery_challans')
        .select('*')
        .order('id', { ascending: false })
        .limit(150);

      if (dcErr) throw dcErr;
      setChallans(dcData || []);

      // 2. Fetch Stock Balances
      const { data: stockData, error: stockErr } = await supabase
        .from('stock_balances')
        .select('*');

      if (!stockErr && stockData) {
        setStockBalances(stockData || []);
      }

      // 3. Fetch Stock Transfers
      const { data: transferData, error: transferErr } = await supabase
        .from('stock_transfers')
        .select('id, transfer_no, transfer_date, from_location, to_location, status')
        .order('id', { ascending: false })
        .limit(50);

      if (!transferErr && transferData) {
        setTransfers(transferData || []);
      }
    } catch (err) {
      console.error('Failed to load warehouse dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouseData();
  }, []);

  // Filter Delivery Challans by activeLocation
  const locationChallans = useMemo(() => {
    return challans.filter((dc) => {
      const wh = (dc.dispatch_warehouse || '').toUpperCase();
      const matchLocation =
        activeLocation === 'A-39'
          ? wh.includes('39') || wh.includes('A-39')
          : wh.includes('SHOP');

      if (!matchLocation) return false;

      if (statusFilter !== 'ALL' && dc.status !== statusFilter) {
        return false;
      }

      if (searchChallan.trim()) {
        const q = searchChallan.toLowerCase();
        const matchNo = (dc.challan_no || '').toLowerCase().includes(q);
        const matchCust = (dc.customer_name || '').toLowerCase().includes(q);
        const matchVeh = (dc.vehicle_no || '').toLowerCase().includes(q);
        if (!matchNo && !matchCust && !matchVeh) return false;
      }

      return true;
    });
  }, [challans, activeLocation, statusFilter, searchChallan]);

  // Filter Stock Balances by activeLocation
  const locationStock = useMemo(() => {
    const list = stockBalances.filter((sb) => {
      const wh = (sb.warehouse_name || '').toUpperCase();
      const matchLocation =
        activeLocation === 'A-39'
          ? wh.includes('39') || wh.includes('A-39')
          : wh.includes('SHOP');

      if (!matchLocation) return false;

      if (searchStock.trim()) {
        return (sb.product_name || '').toLowerCase().includes(searchStock.toLowerCase());
      }
      return true;
    });

    return list.sort((a, b) => (Number(b.quantity) || 0) - (Number(a.quantity) || 0));
  }, [stockBalances, activeLocation, searchStock]);

  // Calculate Metrics for the active location
  const metrics = useMemo(() => {
    // Total stock in this location
    const totalStockQty = locationStock.reduce(
      (sum, item) => sum + (parseFloat(String(item.quantity || 0)) || 0),
      0
    );

    // Challans metrics:
    // A challan is Dispatched if it was physically sent out (Full or Partial dispatch).
    // It is Pending ONLY if it is waiting for approval OR is an active partial challan whose hold items haven't been moved yet.
    let totalDispatched = 0;
    let totalPending = 0;

    challans.forEach((dc) => {
      const wh = (dc.dispatch_warehouse || '').toUpperCase();
      const matchLocation =
        activeLocation === 'A-39'
          ? wh.includes('39') || wh.includes('A-39')
          : wh.includes('SHOP');

      if (matchLocation) {
        const isMoved = (dc.remarks || '').includes('Remaining hold items moved to');
        const isPendingApproval = dc.status === 'Pending Approval';
        const isDispatched = dc.status === 'Dispatched' || dc.status === 'Fully Dispatched';
        const isPartial = dc.status === 'Partially Dispatched';

        if (isPendingApproval) {
          totalPending++;
        } else if (isDispatched) {
          totalDispatched++;
        } else if (isPartial) {
          // Physical dispatch occurred for this challan
          totalDispatched++;
          // Only pending if remaining hold units have not yet been moved to a subsequent challan
          if (!isMoved) {
            totalPending++;
          }
        }
      }
    });

    // Transfers count
    const relatedTransfers = transfers.filter((tr) => {
      const from = (tr.from_location || '').toUpperCase();
      const to = (tr.to_location || '').toUpperCase();
      if (activeLocation === 'A-39') {
        return from.includes('39');
      } else {
        return to.includes('SHOP');
      }
    });

    return {
      totalStockQty,
      totalDispatched,
      totalPending,
      totalTransfers: relatedTransfers.length
    };
  }, [locationStock, challans, transfers, activeLocation]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const isA39 = activeLocation === 'A-39';

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Banner & Location Switcher */}
      <GlassCard
        className={`p-6 relative overflow-hidden text-white rounded-3xl shadow-xl transition-all duration-300 ${
          isA39
            ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-slate-900'
            : 'bg-gradient-to-r from-teal-700 via-emerald-700 to-slate-900'
        }`}
      >
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 z-10 relative">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md text-white border border-white/20">
                {isA39 ? <MdWarehouse className="mr-1 text-sm text-yellow-300" /> : <MdStorefront className="mr-1 text-sm text-emerald-300" />}
                {isA39 ? 'Warehouse Hub (Central Storage Point)' : 'Showroom Hub (Sale & Retail Point)'}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-black/25 text-white/90 border border-white/15">
                <MdLocationOn className="mr-1 text-xs" />
                {isA39 ? 'Plot A-39, Near Boulevard Mall' : 'Saddar, Bouri Bazar'}
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white drop-shadow-xs">
              {isA39 ? 'A-39 Storage Operations Terminal' : 'SHOP Floor & Dispatch Terminal'}
            </h1>
            <p className="text-white/85 text-xs sm:text-sm mt-1 max-w-xl">
              {isA39
                ? 'Primary bulk holding, supplier inward verification, outbound delivery challans & transfers to Saddar Shop.'
                : 'Retail counter fulfillment, incoming stock transfers from A-39, customer sales returns & floor stock.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Quick Location Switcher Buttons - Visible ONLY to Super Admin / Admin */}
            {canSwitchLocation ? (
              <div className="flex items-center bg-black/30 p-1 rounded-2xl border border-white/20 backdrop-blur-md">
                <button
                  onClick={() => setActiveLocation('A-39')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isA39
                      ? 'bg-white text-orange-800 shadow-md scale-102'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <MdWarehouse className="text-sm" />
                  A-39 (Storage)
                </button>
                <button
                  onClick={() => setActiveLocation('SHOP')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    !isA39
                      ? 'bg-white text-emerald-800 shadow-md scale-102'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <MdStorefront className="text-sm" />
                  SHOP (Sale Point)
                </button>
              </div>
            ) : (
              /* When locked, show a clean, non-clickable assigned location pill */
              <div className="flex items-center gap-2 bg-black/30 px-3.5 py-2 rounded-2xl border border-white/20 backdrop-blur-md text-xs font-bold text-white shadow-inner">
                {isA39 ? (
                  <>
                    <MdWarehouse className="text-yellow-300 text-sm" />
                    <span>Assigned: A-39 Storage</span>
                  </>
                ) : (
                  <>
                    <MdStorefront className="text-emerald-300 text-sm" />
                    <span>Assigned: Shop Floor</span>
                  </>
                )}
              </div>
            )}

            <button
              onClick={loadWarehouseData}
              title="Refresh Warehouse Records"
              className="p-2.5 bg-white/15 hover:bg-white/25 rounded-xl border border-white/20 transition-all text-white backdrop-blur-md shadow-sm cursor-pointer"
            >
              <MdRefresh className="text-lg" />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* 2. Key Metrics Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={isA39 ? 'A-39 Total Storage Stock' : 'Shop Floor Stock Units'}
          value={metrics.totalStockQty.toLocaleString(undefined, { minimumFractionDigits: 0 })}
          Icon={MdInventory2}
          bgColor="bg-gradient-to-br from-red-500 to-rose-600"
        />
        <StatCard
          title={isA39 ? 'Dispatched Challans' : 'Counter Dispatches'}
          value={metrics.totalDispatched}
          Icon={MdCheckCircle}
          bgColor="bg-gradient-to-br from-rose-600 to-red-800"
        />
        <StatCard
          title="Pending Dispatches"
          value={metrics.totalPending}
          Icon={MdHourglassEmpty}
          bgColor="bg-gradient-to-br from-red-600 to-rose-700"
        />
        <StatCard
          title={isA39 ? 'Transfers Out to Shop' : 'Transfers In from A-39'}
          value={metrics.totalTransfers}
          Icon={MdSyncAlt}
          bgColor="bg-gradient-to-br from-red-800 to-slate-900"
        />
      </div>

      {/* 3. Tailored Quick Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isA39 ? (
          <>
            <ActionCard
              title="Warehouse Dispatch"
              subtitle="Outward Delivery Challan (WDQ)"
              Icon={MdLocalShipping}
              bgGradient="bg-gradient-to-br from-red-600 to-rose-700"
              onClick={() => navigate('/Sales/Delivery-Challan/List')}
            />
            <ActionCard
              title="Inward Challan"
              subtitle="Receive goods from suppliers / GRN"
              Icon={MdMoveToInbox}
              bgGradient="bg-gradient-to-br from-rose-600 to-red-800"
              onClick={() => navigate('/Purchase/Inward-Challan/List')}
            />
            <ActionCard
              title="Stock Transfer"
              subtitle="Transfer boxes to Saddar Shop"
              Icon={MdCompareArrows}
              bgGradient="bg-gradient-to-br from-red-700 to-rose-900"
              onClick={() => navigate('/Administration/StockTransfer/List')}
            />
            <ActionCard
              title="Return Challan"
              subtitle="Process return verification"
              Icon={MdAssignmentReturn}
              bgGradient="bg-gradient-to-br from-red-800 to-slate-900"
              onClick={() => navigate('/Warehouse/Return-Challan')}
            />
          </>
        ) : (
          <>
            <ActionCard
              title="Shop Dispatch"
              subtitle="Shop Dispatch Queue (SDQ)"
              Icon={MdStorefront}
              bgGradient="bg-gradient-to-br from-red-600 to-rose-700"
              onClick={() => navigate('/Sales/Shop-Dispatch/List')}
            />
            <ActionCard
              title="Shop Receiving"
              subtitle="Receive stock transferred from A-39"
              Icon={MdMoveToInbox}
              bgGradient="bg-gradient-to-br from-rose-600 to-red-800"
              onClick={() => navigate('/Purchase/Shop-Receiving')}
            />
            <ActionCard
              title="Shop Returns"
              subtitle="Customer return receiving queue"
              Icon={MdAssignmentReturn}
              bgGradient="bg-gradient-to-br from-red-700 to-rose-900"
              onClick={() => navigate('/Warehouse/Shop-Return')}
            />
            <ActionCard
              title="Shop Stock Report"
              subtitle="View showroom inventory levels"
              Icon={MdInventory2}
              bgGradient="bg-gradient-to-br from-red-800 to-slate-900"
              onClick={() => navigate('/Reports/Stock-Report')}
            />
          </>
        )}
      </div>

      {/* 4. Active Delivery Challan Queue & Location Stock Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Delivery Challans Queue */}
        <div className="lg:col-span-2 space-y-4">
          <GlassCard className="p-5 rounded-2xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MdLocalShipping className={isA39 ? 'text-orange-600 text-xl' : 'text-emerald-600 text-xl'} />
                  {isA39 ? 'A-39 Outward Delivery Challans' : 'Shop Counter Delivery Challans'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {locationChallans.length} active challans for {activeLocation}
                </p>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-semibold">
                {(['ALL', 'Dispatched', 'Partially Dispatched'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      statusFilter === tab
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {tab === 'Partially Dispatched' ? 'Partial' : tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <MdSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
              <input
                type="text"
                value={searchChallan}
                onChange={(e) => setSearchChallan(e.target.value)}
                placeholder="Search challan #, customer name, vehicle..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 dark:text-slate-200 placeholder-slate-400"
              />
            </div>

            {/* Challans Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Challan #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Transport / Driver</th>
                    <th className="py-2.5 px-3 text-right">Total Qty</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {locationChallans.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No delivery challans recorded for {activeLocation}.
                      </td>
                    </tr>
                  ) : (
                    locationChallans.slice(0, 10).map((dc) => (
                      <tr
                        key={dc.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-3 font-bold text-orange-600 dark:text-orange-400">
                          {dc.challan_no || `DC-${dc.id}`}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-slate-500">
                          {dc.challan_date || dc.created_at?.split('T')[0] || '-'}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {dc.customer_name || 'Walk-in'}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                          {dc.driver_name || dc.vehicle_no ? `${dc.driver_name || ''} ${dc.vehicle_no ? `(${dc.vehicle_no})` : ''}` : 'Direct'}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-slate-900 dark:text-white">
                          {Number(dc.total_quantity || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {dc.status === 'Dispatched' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              <MdCheckCircle className="text-xs" />
                              Dispatched
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              <MdHourglassEmpty className="text-xs" />
                              {dc.status || 'Pending'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() =>
                  navigate(isA39 ? '/Sales/Delivery-Challan/List' : '/Sales/Shop-Dispatch/List')
                }
                className="text-xs font-bold text-orange-600 hover:text-orange-700 dark:text-orange-400 flex items-center gap-1 group"
              >
                Go to Full {isA39 ? 'Warehouse Dispatch Queue' : 'Shop Dispatch Queue'}
                <MdArrowForward className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </GlassCard>
        </div>

        {/* Right 1 Col: Location Stock Balances */}
        <div className="space-y-4">
          <GlassCard className="p-5 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MdInventory2 className={isA39 ? 'text-amber-600 text-lg' : 'text-teal-600 text-lg'} />
                  {activeLocation} Stock Balances
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Live counted units in this location
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isA39
                  ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                  : 'bg-teal-100 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300'
              }`}>
                {locationStock.length} SKUs
              </span>
            </div>

            {/* Quick stock search */}
            <div className="relative mb-3">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base" />
              <input
                type="text"
                value={searchStock}
                onChange={(e) => setSearchStock(e.target.value)}
                placeholder="Search item name..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-800 dark:text-slate-200 placeholder-slate-400"
              />
            </div>

            {/* Stock List */}
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {locationStock.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No inventory balances recorded for {activeLocation}.
                </div>
              ) : (
                locationStock.map((item, idx) => {
                  const qty = parseFloat(String(item.quantity || 0)) || 0;
                  const isLow = qty <= 5;
                  return (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:border-slate-200 transition-all"
                    >
                      <div className="truncate mr-2">
                        <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 capitalize truncate">
                          {item.product_name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {activeLocation}
                        </div>
                      </div>

                      <div className="text-right whitespace-nowrap">
                        <span
                          className={`font-extrabold text-xs px-2 py-0.5 rounded-lg ${
                            isLow
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                              : isA39
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                          }`}
                        >
                          {qty.toLocaleString()} Units
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-center">
              <button
                onClick={() => navigate('/Reports/Stock-Report')}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-1"
              >
                Open Full Stock Report →
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default WarehouseDashboard;
