import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import TableActions from '../../../ui/TableActions';
import { useAuth } from '../../../Context/Auth';
import { FiCheckCircle, FiTruck, FiX, FiClock, FiPlusCircle, FiAlertCircle, FiPrinter, FiCalendar } from 'react-icons/fi';

// Helper to get exact date in Pakistan Time (YYYY-MM-DD)
const getPakistanDate = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
};


const ShopDispatchQueue = () => {
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [challans, setChallans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State for Warehouse Dispatch Approval
  const [selectedChallanForApproval, setSelectedChallanForApproval] = useState<any | null>(null);
  const [approvalItems, setApprovalItems] = useState<any[]>([]);
  const [transportList, setTransportList] = useState<any[]>([]);
  const [productsMaster, setProductsMaster] = useState<any[]>([]);
  const [approvalTransportName, setApprovalTransportName] = useState('Customer\'s Own Transport');
  const [approvalTransportSearch, setApprovalTransportSearch] = useState('');
  const [isTransportDropdownOpen, setIsTransportDropdownOpen] = useState(false);
  const [approvalFreightCharges, setApprovalFreightCharges] = useState<number | string>(0);
  const [approvalVehicle, setApprovalVehicle] = useState('');
  const [approvalDriver, setApprovalDriver] = useState('');
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [isManualDriver, setIsManualDriver] = useState(false);

  // Datatable layout state controllers
  const [searchTerm, setSearchTerm] = useState('');
  const [viewHoldModal, setViewHoldModal] = useState<any | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchChallans();
    fetchTransportList();
  }, []);

  const fetchTransportList = async () => {
    try {
      const { data } = await supabase.from('logistics_transportation').select('*').order('name');
      setTransportList(data || []);

      const { data: prods } = await supabase
        .from('products')
        .select('product_name, pieces_per_box, pcs_per_box, pieces_per_packing, category, scenario_name');
      setProductsMaster(prods || []);
    } catch (_) {}
  };

  // ── Boxes / Pcs formatting (same as Delivery Challan page) ──
  const pcsPerBoxFor = (productName: string) => {
    const key = String(productName || '').trim().toLowerCase();
    const pr = productsMaster.find((p: any) => String(p.product_name || '').trim().toLowerCase() === key);
    if (!pr) return 1;
    const isTile = Boolean(
      String(pr.category || '').toLowerCase().includes('tile') ||
      String(pr.scenario_name || '').toLowerCase().includes('tile')
    );
    const rp = Number(pr.pieces_per_box || pr.pcs_per_box || pr.pieces_per_packing || 0);
    return isTile ? (rp > 1 ? rp : 4) : 1;
  };

  const fmtBoxPcs = (qty: number, productName: string) => {
    const pb = pcsPerBoxFor(productName);
    if (pb > 1) {
      const pieces = Math.round(qty * pb);
      const boxes = Math.floor(pieces / pb);
      const loose = pieces % pb;
      return `${boxes} Boxes${loose > 0 ? ` + ${loose} Pcs` : ''}`;
    }
    return qty.toLocaleString();
  };

  const sumGroupQty = (group: any, kind: 'order' | 'disp' | 'hold') => {
    let boxes = 0;
    let pcs = 0;
    (group.challans || []).forEach((c: any) => {
      (c.items || []).forEach((it: any) => {
        const qty = kind === 'order'
          ? Number(it.orderQty ?? it.qty ?? 0)
          : kind === 'disp'
            ? Number(it.dispatchedQty ?? 0)
            : Number(it.holdQty ?? 0);
        const pb = pcsPerBoxFor(it.pDescription || it.itemName || it.product_name || '');
        if (pb > 1) {
          const pieces = Math.round(qty * pb);
          boxes += Math.floor(pieces / pb);
          pcs += pieces % pb;
        } else {
          boxes += qty;
        }
      });
    });
    return `${boxes.toLocaleString()}${pcs > 0 ? ` + ${pcs} Pcs` : ''}`;
  };

  const fetchChallans = async () => {
    setLoading(true);
    try {
      // 1. Fetch location types to identify all Sale Points (Shops/Showrooms)
      const { data: locs } = await supabase.from('inventory_locations').select('name, location_type');
      const shopNames = new Set(
        (locs || [])
          .filter(l => {
            const t = String(l.location_type || '').toLowerCase();
            return t.includes('sale') || t.includes('shop') || t.includes('showroom') || t.includes('counter');
          })
          .map(l => String(l.name || '').trim().toLowerCase())
      );

      const { data, error } = await supabase
        .from('delivery_challans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter to only include Shop / Showroom / Sale Point locations
      const shopOnly = (data || []).filter(dc => {
        const whName = String(dc.dispatch_warehouse || '').trim().toLowerCase();
        if (whName === 'shop' || whName.includes('showroom') || whName.includes('shop')) return true;
        if (shopNames.has(whName)) return true;
        return false;
      });

      setChallans(shopOnly);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string | number) => {
    if (window.confirm('Are you completely sure you want to delete this delivery challan? This cannot be undone.')) {
      try {
        const { error } = await supabase.from('delivery_challans').delete().eq('id', id);
        if (error) throw error;
        toast.success('Challan deleted successfully');
        fetchChallans();
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  // Open the Approval Popup Modal
  const openApprovalModal = (challan: any) => {
    setSelectedChallanForApproval(challan);
    const parsedItems = (challan.items || []).map((item: any) => {
      const orderQty = Number(item.orderQty ?? item.qty ?? 0);
      const prevDispatched = Number(item.dispatchedQty ?? 0);
      const availableToDispatch = orderQty - prevDispatched;
      const initialSend = availableToDispatch > 0 ? availableToDispatch : orderQty;

      return {
        ...item,
        orderQty: orderQty,
        dispatchedQty: initialSend,
        holdQty: Math.max(0, orderQty - initialSend),
        rate: Number(item.rate || 0)
      };
    });

    setApprovalItems(parsedItems);
    setApprovalTransportName(challan.transport_name || challan.transportation || 'Customer\'s Own Transport');
    setApprovalTransportSearch('');
    setIsTransportDropdownOpen(false);
    setApprovalFreightCharges(challan.freight_charges !== undefined && challan.freight_charges !== null ? Number(challan.freight_charges) : 0);
    setApprovalVehicle(challan.vehicle_no && challan.vehicle_no !== 'Pending Dispatch' ? challan.vehicle_no : '');
    setApprovalDriver(challan.driver_name && challan.driver_name !== 'Pending Dispatch' ? challan.driver_name : '');
    setApprovalRemarks(challan.gate_remarks || '');
    setIsManualDriver(false);
    setIsSubmittingApproval(false);
  };

  // Handle Qty change inside the Approval modal (supports blank, 0, and fractional)
  const handleItemDispatchedChange = (index: number, rawVal: string) => {
    setApprovalItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      const orderQty = Number(item.orderQty || 0);

      if (rawVal === '') {
        updated[index] = {
          ...item,
          dispatchedQty: '',
          holdQty: orderQty
        };
        return updated;
      }

      const numVal = parseFloat(rawVal);
      if (isNaN(numVal) || numVal < 0) {
        updated[index] = {
          ...item,
          dispatchedQty: 0,
          holdQty: orderQty
        };
        return updated;
      }

      const cappedSend = Math.min(numVal, orderQty > 0 ? orderQty : numVal);
      const hold = Math.max(0, orderQty - cappedSend);

      updated[index] = {
        ...item,
        dispatchedQty: cappedSend,
        holdQty: hold
      };
      return updated;
    });
  };

  const handleBlurDispatched = (index: number) => {
    setApprovalItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      const orderQty = Number(item.orderQty || 0);
      if (item.dispatchedQty === '' || item.dispatchedQty === undefined || isNaN(Number(item.dispatchedQty))) {
        updated[index] = {
          ...item,
          dispatchedQty: 0,
          holdQty: orderQty
        };
      }
      return updated;
    });
  };

  // Quick Action Buttons
  const setAllItemsToSend = () => {
    setApprovalItems(prev => prev.map(item => ({
      ...item,
      dispatchedQty: Number(item.orderQty || 0),
      holdQty: 0
    })));
  };

  const setAllItemsToHold = () => {
    setApprovalItems(prev => prev.map(item => ({
      ...item,
      dispatchedQty: 0,
      holdQty: Number(item.orderQty || 0)
    })));
  };

  // Save the Warehouse Approval
  const submitWarehouseApproval = async () => {
    if (!selectedChallanForApproval) return;

    const totalDispatchedQty = approvalItems.reduce((sum, i) => sum + (Number(i.dispatchedQty) || 0), 0);
    if (totalDispatchedQty <= 0) {
      toast.error('Cannot confirm dispatch with 0 quantity. Please specify at least 1 item in "Sending Now" to approve dispatch.', {
        duration: 4000,
        icon: '⚠️'
      });
      return;
    }

    setIsSubmittingApproval(true);

    try {
      const totalOrderQty = approvalItems.reduce((sum, i) => sum + Number(i.orderQty || 0), 0);
      const totalHoldQty = approvalItems.reduce((sum, i) => sum + (Number(i.holdQty) || 0), 0);

      const baseAmount = approvalItems.reduce((acc, i) => acc + (Number(i.rate || 0) * (Number(i.dispatchedQty) || 0)), 0);
      const totalDisc = approvalItems.reduce((acc, i) => acc + (Number(i.disAmt || 0)), 0);
      const netAmount = baseAmount - totalDisc;

      let finalStatus = 'Dispatched';
      if (totalHoldQty > 0 || totalDispatchedQty < totalOrderQty) {
        finalStatus = 'Partially Dispatched';
      } else {
        finalStatus = 'Dispatched';
      }

      const freightNum = Number(approvalFreightCharges) || 0;

      // Current challan records only the approved/dispatched quantity
      const processedApprovalItems = approvalItems.map(i => ({
        ...i,
        qty: Number(i.dispatchedQty || 0),
        dispatchedQty: Number(i.dispatchedQty || 0),
        orderQty: Number(i.orderQty || 0),
        holdQty: Number(i.holdQty || 0)
      }));

      const { error } = await supabase
        .from('delivery_challans')
        .update({
          transport_name: approvalTransportName,
          transportation: approvalTransportName,
          freight_charges: freightNum,
          freight_payment_status: freightNum > 0 ? 'Pending Approval' : 'Free / Direct',
          vehicle_no: approvalVehicle.trim() || 'Counter Delivery',
          driver_name: approvalDriver.trim() || 'Direct Handover',
          remarks: approvalRemarks.trim() || `Approved by Warehouse Manager (Dispatched ${totalDispatchedQty} pcs)`,
          total_quantity: totalDispatchedQty,
          total_amount: baseAmount,
          total_discount: totalDisc,
          total_net_amount: netAmount,
          status: 'Dispatched',
          items: processedApprovalItems
        })
        .eq('id', selectedChallanForApproval.id);

      if (error) throw error;

      toast.success(`Challan #${selectedChallanForApproval.challan_no || selectedChallanForApproval.id} approved: Dispatched ${totalDispatchedQty} pcs`);
      setSelectedChallanForApproval(null);
      fetchChallans();
    } catch (err: any) {
      toast.error('Approval failed: ' + err.message);
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  // Create a separate DC for remaining Hold items
  const createSubsequentHoldChallan = async (parentChallan: any) => {
    const holdItems = (parentChallan.items || [])
      .filter((i: any) => Number(i.holdQty || 0) > 0)
      .map((i: any) => ({
        ...i,
        orderQty: Number(i.holdQty),
        dispatchedQty: Number(i.holdQty),
        holdQty: 0,
        qty: Number(i.holdQty)
      }));

    if (holdItems.length === 0) {
      toast.error('No items on hold for this challan.');
      return;
    }

    try {
      setLoading(true);
      
      // Calculate dynamic next sequence suffix (DC-0005-B, DC-0005-C, etc.)
      const baseCode = (parentChallan.challan_no || `DC-${String(parentChallan.id).padStart(4, '0')}`).replace(/-[A-Z]+$/, '');
      const existingSubCount = challans.filter(c => (c.challan_no || '').startsWith(baseCode)).length;
      
      let nextLetter = '';
      if (existingSubCount < 26) {
        nextLetter = String.fromCharCode(65 + existingSubCount); // 1 existing -> B, 2 existing -> C, etc.
      } else {
        nextLetter = String.fromCharCode(65 + (existingSubCount % 26)).repeat(Math.floor(existingSubCount / 26) + 1);
      }
      const subChallanNo = `${baseCode}-${nextLetter}`;

      const whQty = holdItems.reduce((acc: number, i: any) => acc + Number(i.orderQty || 0), 0);
      const whBaseAmt = holdItems.reduce((acc: number, i: any) => acc + (Number(i.rate || 0) * Number(i.orderQty || 0)), 0);

      const { data: newDc, error } = await supabase.from('delivery_challans').insert([{
        challan_no: subChallanNo,
        invoice_no: parentChallan.invoice_no,
        customer_name: parentChallan.customer_name,
        challan_date: new Date().toISOString().split('T')[0],
        dispatch_warehouse: parentChallan.dispatch_warehouse,
        transport_name: parentChallan.transport_name || 'By Road Transport',
        transportation: parentChallan.transportation || 'By Road Transport',
        po_no: parentChallan.po_no || '',
        vehicle_no: 'Pending Dispatch',
        remarks: `Remaining hold items from ${parentChallan.challan_no || parentChallan.id}`,
        total_quantity: whQty,
        total_amount: whBaseAmt,
        total_discount: 0,
        total_net_amount: whBaseAmt,
        status: 'Pending Approval',
        items: holdItems
      }]).select().single();

      if (error) throw error;

      // Update parent challan: mark hold items as transferred to new sub-challan
      const updatedParentItems = (parentChallan.items || []).map((i: any) => ({
        ...i,
        holdQty: 0
      }));

      await supabase.from('delivery_challans').update({
        items: updatedParentItems,
        remarks: `${parentChallan.remarks || ''} (Remaining hold items moved to ${subChallanNo})`
      }).eq('id', parentChallan.id);

      toast.success(`New Delivery Challan ${subChallanNo} created for remaining ${whQty} hold items!`);
      await fetchChallans();
      if (newDc) openApprovalModal(newDc);
    } catch (err: any) {
      toast.error('Failed to create subsequent challan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Live filter query rule logic
  const filteredChallans = challans.filter(c =>
    c.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.challan_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.vehicle_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.dispatch_warehouse?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group Challans by Linked Invoice
  const groupedInvoices = React.useMemo(() => {
    const groups: Record<string, {
      invoice_no: string;
      customer_name: string;
      dispatch_warehouse: string;
      challans: any[];
      totalOrdered: number;
      totalDispatched: number;
      totalHold: number;
    }> = {};

    filteredChallans.forEach(c => {
      const invKey = c.invoice_no || `MANUAL-${c.id}`;
      if (!groups[invKey]) {
        groups[invKey] = {
          invoice_no: c.invoice_no || 'Direct DC',
          customer_name: c.customer_name || 'Walk-in',
          dispatch_warehouse: c.dispatch_warehouse || 'Main Warehouse',
          challans: [],
          totalOrdered: 0,
          totalDispatched: 0,
          totalHold: 0
        };
      }
      groups[invKey].challans.push(c);
    });

    // Compute totals per invoice group
    Object.values(groups).forEach(g => {
      g.challans.forEach(c => {
        (c.items || []).forEach((item: any) => {
          g.totalOrdered += Number(item.orderQty ?? item.qty ?? 0);
          g.totalDispatched += Number(item.dispatchedQty ?? (c.status === 'Dispatched' ? item.qty : 0) ?? 0);
          g.totalHold += Number(item.holdQty ?? 0);
        });
      });
    });

    return Object.values(groups);
  }, [filteredChallans]);

  // Pagination bounds based on grouped invoices
  const totalEntries = groupedInvoices.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedInvoices = groupedInvoices.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  return (
    <div className="rounded-sm border border-stroke bg-white px-5 pt-6 pb-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5 relative">
      
      {/* ── POPUP MODAL: WAREHOUSE MANAGER DISPATCH APPROVAL ── */}
      {selectedChallanForApproval && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-boxdark w-full max-w-3xl rounded-2xl shadow-2xl border border-stroke dark:border-strokedark overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center bg-slate-900 text-white p-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
                  <FiTruck />
                </div>
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    Warehouse Dispatch Approval
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-500 text-white font-black">
                      {selectedChallanForApproval.challan_no || `DC-${selectedChallanForApproval.id}`}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Customer: <span className="text-white font-bold">{selectedChallanForApproval.customer_name}</span> • Location: <span className="text-emerald-400 font-bold">{selectedChallanForApproval.dispatch_warehouse}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedChallanForApproval(null)} className="text-slate-400 hover:text-white text-xl">
                <FiX />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6 text-xs">
              
              {/* Instructions Banner */}
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3.5 flex items-start gap-3">
                <FiCheckCircle className="text-emerald-600 dark:text-emerald-400 text-base shrink-0 mt-0.5" />
                <div className="text-slate-700 dark:text-slate-300">
                  <p className="font-bold text-emerald-800 dark:text-emerald-300">Warehouse Verification Mode</p>
                  <p className="text-[11px] mt-0.5">
                    Enter how many units are being loaded onto the truck right now in <strong className="text-emerald-700 dark:text-emerald-400">Sending Now</strong>. Any difference will automatically be marked <strong className="text-amber-700 dark:text-amber-400">On Hold</strong> for later dispatch.
                  </p>
                </div>
              </div>

                            {/* Locked Dispatch Date Banner (Pakistan Standard Time) */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-meta-4/20 p-3 rounded-xl border border-stroke dark:border-strokedark">
                <div className="flex items-center gap-2">
                  <FiCalendar className="text-primary text-base" />
                  <span className="font-bold text-black dark:text-white">Dispatch Date (PK Time):</span>
                </div>
                <div className="flex items-center gap-1.5 bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded-lg px-3 py-1 font-mono font-bold text-xs text-slate-700 dark:text-slate-300 shadow-xs">
                  <span>🔒 {getPakistanDate()}</span>
                </div>
              </div>

{/* Items Verification Table */}
              <div className="border border-stroke dark:border-strokedark rounded-xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 flex justify-between items-center border-b border-stroke dark:border-strokedark">
                  <span className="font-bold text-[11px] uppercase tracking-wide text-slate-700 dark:text-slate-300">Items Fulfillment List</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={setAllItemsToSend}
                      className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[10px] hover:opacity-80 transition"
                    >
                      ✓ Send All Items (100%)
                    </button>
                    <button
                      type="button"
                      onClick={setAllItemsToHold}
                      className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold text-[10px] hover:opacity-80 transition"
                    >
                      ⏸ Hold All (0 Sent)
                    </button>
                  </div>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-meta-4 text-[10px] font-black uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-strokedark">
                      <th className="p-3 w-8 text-center">S#</th>
                      <th className="p-3 w-32">Code</th>
                      <th className="p-3">Product Description</th>
                      <th className="p-3 w-24 text-center">Ordered Qty</th>
                      <th className="p-3 w-32 text-center bg-emerald-100/60 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">Sending Now</th>
                      <th className="p-3 w-28 text-center bg-amber-100/60 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">Holding (Rest)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke dark:divide-strokedark font-medium">
                    {approvalItems.map((item, idx) => {
                      const orderQty = Number(item.orderQty || 0);
                      const sendQty = item.dispatchedQty;
                      const holdQty = Number(item.holdQty || 0);

                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3 text-center text-gray-400 font-sans">{idx + 1}</td>
                          <td className="p-3 font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            {item.skuCode}
                          </td>
                          <td className="p-3">
                            <p className="font-bold text-black dark:text-white">{item.pDescription}</p>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300 text-sm">
                            {orderQty}
                          </td>
                          <td className="p-3 text-center bg-emerald-50/40 dark:bg-emerald-950/20">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max={orderQty}
                                value={sendQty === undefined ? '' : sendQty}
                                onChange={(e) => handleItemDispatchedChange(idx, e.target.value)}
                                onBlur={() => handleBlurDispatched(idx)}
                                placeholder="0"
                                className="w-20 text-center font-black font-mono text-sm text-emerald-600 dark:text-emerald-400 bg-white dark:bg-boxdark border-2 border-emerald-400 rounded-lg p-1.5 shadow-sm outline-none focus:ring-2 focus:ring-emerald-400"
                              />
                            </div>
                          </td>
                          <td className="p-3 text-center bg-amber-50/40 dark:bg-amber-950/20 font-mono">
                            {holdQty > 0 ? (
                              <span className="inline-flex px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-700">
                                {holdQty} Hold
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">0 (All Sent)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Manual Driver Pill Toggle */}
              <div className="flex justify-end mb-2">
                <div 
                  onClick={() => setIsManualDriver(!isManualDriver)}
                  className={`cursor-pointer px-3 py-1.5 text-xs font-bold rounded-full transition select-none flex items-center justify-center border w-fit ${
                    isManualDriver 
                      ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800' 
                      : 'bg-white text-slate-500 border-stroke dark:bg-boxdark dark:text-slate-400 dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4'
                  }`}
                >
                  Add Custom Driver Details
                </div>
              </div>

              {/* Transit Logistics & Freight Settlement Info */}
              {!isManualDriver && (
              <div className="grid grid-cols-1 gap-4 bg-slate-50 dark:bg-meta-4/10 p-3.5 rounded-xl border border-stroke dark:border-strokedark mb-4">
                
                {/* Searchable Transportation Carrier Dropdown */}
                <div className="relative">
                  <label className="block font-bold text-black dark:text-white mb-1">
                    Logistics / Transportation Service:
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={isTransportDropdownOpen ? approvalTransportSearch : approvalTransportName}
                      onFocus={() => {
                        setIsTransportDropdownOpen(true);
                        setApprovalTransportSearch('');
                      }}
                      onChange={(e) => {
                        setApprovalTransportSearch(e.target.value);
                        setApprovalTransportName(e.target.value);
                      }}
                      placeholder="Search Carrier (e.g. TCS, Leopards, Customer Truck)..."
                      className="w-full p-2.5 rounded-lg border border-stroke dark:border-strokedark bg-white dark:bg-boxdark font-bold text-xs outline-none focus:ring-2 focus:ring-primary"
                    />
                    {isTransportDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-stroke dark:divide-strokedark">
                        {['No Transport (Handover)', 'Customer\'s Own Transport', ...transportList.map(t => t.name)]
                          .filter((name, i, arr) => arr.indexOf(name) === i)
                          .filter(name => name.toLowerCase().includes(approvalTransportSearch.toLowerCase()))
                          .map((name, tIdx) => {
                            const match = transportList.find(t => t.name === name);
                            return (
                              <div
                                key={tIdx}
                                onMouseDown={() => {
                                  setApprovalTransportName(name);
                                  if (match) {
                                    if (match.vehicle_number) setApprovalVehicle(match.vehicle_number);
                                    if (match.driver_name) setApprovalDriver(match.driver_name);
                                    if (match.base_charges) setApprovalFreightCharges(Number(match.base_charges));
                                  } else {
                                    setApprovalFreightCharges(0);
                                  }
                                  setIsTransportDropdownOpen(false);
                                }}
                                className="p-2 hover:bg-emerald-50 dark:hover:bg-meta-4/20 cursor-pointer flex justify-between items-center text-xs"
                              >
                                <span className="font-bold text-black dark:text-white">{name}</span>
                                {match && match.base_charges ? (
                                  <span className="font-mono text-[10px] text-emerald-600 font-black">Base: Rs. {Number(match.base_charges).toLocaleString()}</span>
                                ) : (
                                  <span className="text-[10px] text-gray-400">Direct Handover</span>
                                )}
                              </div>
                            );
                          })}
                          {approvalTransportSearch.trim() !== '' &&
                            !['No Transport (Handover)', 'Customer\'s Own Transport', ...transportList.map(t => t.name)]
                              .some(name => name.toLowerCase() === approvalTransportSearch.trim().toLowerCase()) && (
                              <div
                                onMouseDown={async () => {
                                  const newCarrier = approvalTransportSearch.trim();
                                  setApprovalTransportName(newCarrier);
                                  setIsTransportDropdownOpen(false);
                                  setApprovalFreightCharges(0);
                                  
                                  try {
                                    const { error } = await supabase.from('logistics_transportation').insert([{
                                      name: newCarrier,
                                      status: 'Active'
                                    }]);
                                    if (error) throw error;
                                    toast.success(`"${newCarrier}" added to Transport Directory!`);
                                    fetchTransportList();
                                  } catch (err: any) {
                                    toast.error('Could not save transporter: ' + err.message);
                                  }
                                }}
                                className="p-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 cursor-pointer flex justify-between items-center text-xs font-bold border-t border-emerald-100 dark:border-emerald-800/50"
                              >
                                <span>+ Add "{approvalTransportSearch.trim()}" as New Transporter</span>
                              </div>
                            )}
                      </div>
                    )}
                  </div>
                </div>



              </div>
              )}

              {/* Transit & Vehicle Information */}
              {isManualDriver && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-bold text-black dark:text-white mb-1">Vehicle No / Truck Plate #</label>
                  <input
                    type="text"
                    value={approvalVehicle}
                    onChange={(e) => setApprovalVehicle(e.target.value)}
                    placeholder="e.g. LES-1122 or By Hand"
                    className="w-full p-2.5 rounded-lg border border-stroke dark:border-strokedark bg-white dark:bg-boxdark font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-black dark:text-white mb-1">Driver Name / Carrier Contact</label>
                  <input
                    type="text"
                    value={approvalDriver}
                    onChange={(e) => setApprovalDriver(e.target.value)}
                    placeholder="e.g. Muhammad Ali / 0300-1234567"
                    className="w-full p-2.5 rounded-lg border border-stroke dark:border-strokedark bg-white dark:bg-boxdark font-bold text-xs"
                  />
                </div>
              </div>
              )}

              <div>
                <label className="block font-bold text-black dark:text-white mb-1">Remarks</label>
                <input
                  type="text"
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                  placeholder="e.g. 5 boxes loaded on truck, 5 boxes to follow tomorrow."
                  className="w-full p-2.5 rounded-lg border border-stroke dark:border-strokedark bg-white dark:bg-boxdark font-medium text-xs"
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center p-5 bg-slate-50 dark:bg-slate-800/80 border-t border-stroke dark:border-strokedark">
              <button
                onClick={() => setSelectedChallanForApproval(null)}
                className="px-5 py-2.5 rounded-lg border border-stroke font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={submitWarehouseApproval}
                disabled={isSubmittingApproval}
                className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition cursor-pointer"
              >
                {isSubmittingApproval ? <Spinner /> : <><FiCheckCircle /> Confirm & Approve Dispatch</>}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── POPUP: REMAINING HOLD BREAKDOWN ── */}
      {viewHoldModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-boxdark w-full max-w-xl rounded-2xl shadow-2xl border border-stroke dark:border-strokedark overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center bg-slate-900 text-white p-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg font-bold">
                  <FiCheckCircle />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Remaining Hold</h3>
                  <p className="text-[11px] text-slate-400">
                    {viewHoldModal.customer_name} • {viewHoldModal.dispatch_warehouse}
                  </p>
                </div>
              </div>
              <button onClick={() => setViewHoldModal(null)} className="text-slate-400 hover:text-white text-xl">
                <FiX />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
              {viewHoldModal.challans.map((c: any) => {
                const heldItems = (c.items || []).map((it: any) => {
                  const orderQty = Number(it.orderQty ?? it.qty ?? 0);
                  const dispatchedQty = Number(it.dispatchedQty ?? (c.status === 'Dispatched' ? orderQty : 0) ?? 0);
                  const holdQty = Number(it.holdQty !== undefined ? it.holdQty : Math.max(0, orderQty - dispatchedQty));
                  return { name: it.itemName || it.product_name || it.item_name || 'Item', orderQty, dispatchedQty, holdQty };
                }).filter((x: any) => x.holdQty > 0);

                if (heldItems.length === 0) return null;

                return (
                  <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 dark:bg-meta-4/30 flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-primary">{c.challan_no || `DC-${c.id}`}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{c.status || ''}</span>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-strokedark">
                          <th className="py-1.5 px-3 text-left">Product</th>
                          <th className="py-1.5 px-3 text-center">Order</th>
                          <th className="py-1.5 px-3 text-center">Dispatched</th>
                          <th className="py-1.5 px-3 text-center text-amber-600 dark:text-amber-400">Hold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {heldItems.map((it: any, iIdx: number) => (
                          <tr key={iIdx} className="border-b border-slate-100 dark:border-strokedark/60">
                            <td className="py-1.5 px-3 font-semibold text-slate-800 dark:text-white">{it.name}</td>
                            <td className="py-1.5 px-3 text-center font-mono">{fmtBoxPcs(it.orderQty, it.name)}</td>
                            <td className="py-1.5 px-3 text-center font-mono">{fmtBoxPcs(it.dispatchedQty, it.name)}</td>
                            <td className="py-1.5 px-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">{fmtBoxPcs(it.holdQty, it.name)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-meta-4/30 border-t border-stroke dark:border-strokedark flex justify-end">
              <button
                onClick={() => setViewHoldModal(null)}
                className="px-4 py-2 bg-white dark:bg-boxdark border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-meta-4 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Controls row */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex-1">
          <h4 className="text-xl font-semibold text-black dark:text-white">Shop Dispatch Queue (SDQ)</h4>
          <p className="text-xs text-gray-500 mt-0.5">Manage shop counter handovers and pending deliveries</p>
        </div>
      </div>

      {/* Datatable Filters Wrapper */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-stroke py-1 px-2 bg-transparent dark:border-strokedark outline-none focus:border-primary text-sm font-medium text-black dark:text-white"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size} className="dark:bg-boxdark">{size}</option>
            ))}
          </select>
          <span>invoices</span>
        </div>

        <div className="flex items-center gap-2 text-sm w-full sm:w-auto text-gray-500 dark:text-gray-400">
          <span>Search:</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search invoice, customer, challan..."
            className="w-full sm:w-64 rounded border border-stroke py-1.5 px-3 bg-transparent dark:border-strokedark outline-none focus:border-primary text-sm text-black dark:text-white"
          />
        </div>
      </div>

      {/* Core Table Layout: Grouped by Invoice with Nested Sub-Challan Entries */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-12 text-center bg-white dark:bg-boxdark rounded-xl border border-stroke"><Spinner /></div>
        ) : paginatedInvoices.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-boxdark rounded-xl border border-stroke">No matching transit record entries found.</div>
        ) : (
          paginatedInvoices.map((group, groupIdx) => {
            return (
              <div key={groupIdx} className="border border-stroke dark:border-strokedark rounded-xl overflow-hidden shadow-xs bg-white dark:bg-boxdark">
                
                {/* ── PARENT HEADER ENTRY: INVOICE & CUSTOMER METADATA ── */}
                <div className="bg-slate-50 dark:bg-meta-4/30 p-4 border-b border-stroke dark:border-strokedark flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      {startIndex + groupIdx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                          {group.invoice_no}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-sm font-bold text-black dark:text-white">
                          {group.customer_name}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex flex-col gap-0.5">
                        <p>Dispatch Source: <span className="font-semibold text-slate-700 dark:text-slate-300">{group.dispatch_warehouse}</span></p>
                        {group.challans[0]?.shipping_address && (
                          <p className="text-emerald-700 dark:text-emerald-400">
                            Ship To: <span className="font-semibold">{group.challans[0].shipping_address}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary Badges */}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 font-mono text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700">
                      Total Order: {sumGroupQty(group, 'order')}
                    </span>
                    <span className="px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 font-mono text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                      Dispatched: {sumGroupQty(group, 'disp')}
                    </span>
                    {group.totalHold > 0 && (
                      <button
                        type="button"
                        onClick={() => setViewHoldModal(group)}
                        className="px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950/40 font-mono text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition shadow-sm cursor-pointer"
                      >
                        Remaining Hold: {sumGroupQty(group, 'hold')}
                      </button>
                    )}
                  </div>
                </div>

                {/* ── SUB-ENTRIES: ALL DELIVERY CHALLANS LINKED TO THIS INVOICE ── */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100/70 dark:bg-meta-4/10 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-stroke dark:border-strokedark">
                        <th className="py-2.5 px-4 w-32">Challan / Gate Pass #</th>
                        <th className="py-2.5 px-4">Vehicle / Driver Details</th>
                        <th className="py-2.5 px-4">Items / Breakdown</th>
                        <th className="py-2.5 px-4 text-center w-28">Status</th>
                        <th className="py-2.5 px-4 text-right pr-6 w-56">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke dark:divide-strokedark">
                      {group.challans.map((c: any) => {
                        const challanCode = c.challan_no || `DC-${String(c.id).padStart(4, '0')}`;
                        const totalHoldUnits = (c.items || []).reduce((acc: number, item: any) => acc + (Number(item.holdQty) || 0), 0);
                        const totalDispatchedUnits = (c.items || []).reduce((acc: number, item: any) => acc + (Number(item.dispatchedQty) || 0), 0);
                        
                        const isPending = !c.status || c.status === 'Pending' || c.status === 'Pending Approval' || c.status === 'Pending Dispatch';
                        const isPartial = c.status === 'Partially Dispatched' || String(c.status || '').toLowerCase().includes('partial');
                        const isDispatched = c.status === 'Dispatched' || c.status === 'Fully Dispatched';

                        // "Send Rest" appears whenever there are remaining hold items on an approved/printed challan
                        const canSendRest = totalHoldUnits > 0 && (!isPending || c.is_printed);

                        return (
                          <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4 font-mono">
                              <p className="font-bold text-primary dark:text-primary text-xs">{challanCode}</p>
                              {c.gate_pass_no && <p className="text-[10px] text-emerald-600 font-bold mb-0.5">GP: {c.gate_pass_no}</p>}
                              <p className="text-[10px] text-gray-500">{c.challan_date || (c.created_at ? new Date(c.created_at).toLocaleDateString() : '-')}</p>
                            </td>

                            <td className="py-3 px-4">
                              <p className="font-bold text-black dark:text-white">{c.vehicle_no || 'Pending Dispatch'}</p>
                              <p className="text-[10px] text-gray-500">{c.driver_name ? `Driver: ${c.driver_name}` : (c.transportation || 'By Road Transport')}</p>
                            </td>

                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                {(c.items || []).map((i: any, itemIdx: number) => {
                                  const ord = Number(i.orderQty ?? i.qty ?? 0);
                                  const disp = Number(i.dispatchedQty ?? 0);
                                  const hld = Number(i.holdQty ?? 0);

                                  return (
                                    <div key={itemIdx} className="mb-2 last:mb-0 pb-2 last:pb-0 border-b border-gray-100 dark:border-gray-800 last:border-0">
                                      <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 leading-snug mb-1">
                                        • {i.pDescription}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-1.5 pl-3">
                                        {isPending ? (
                                          <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400">
                                            {fmtBoxPcs(ord, i.pDescription || i.itemName || i.product_name || '')} Ordered (Pending)
                                          </span>
                                        ) : (
                                          <>
                                            <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400">
                                              {fmtBoxPcs(disp, i.pDescription || i.itemName || i.product_name || '')} Sent
                                            </span>
                                            {hld > 0 && (
                                              <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400">
                                                {fmtBoxPcs(hld, i.pDescription || i.itemName || i.product_name || '')} on Hold
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-center">
                              {c.is_printed ? (
                                <span className="inline-flex items-center gap-1 rounded-full py-0.5 px-2.5 text-[10px] font-black uppercase tracking-wider bg-green-50 text-green-600 border border-green-300 dark:bg-green-950/60 dark:text-green-400 dark:border-green-700">
                                  <FiPrinter /> Printed
                                </span>
                              ) : isPending ? (
                                <span className="inline-flex items-center gap-1 rounded-full py-0.5 px-2.5 text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800">
                                  <FiClock /> Pending
                                </span>
                              ) : null}
                            </td>

                            <td className="py-3 px-4 text-right pr-6">
                              <div className="flex items-center justify-end gap-2">
                                {/* APPROVE BUTTON (When Pending) */}
                                {isPending && (
                                  <button
                                    type="button"
                                    onClick={() => openApprovalModal(c)}
                                    className="inline-flex items-center gap-1 py-1 px-2.5 rounded text-[11px] font-bold text-white shadow-xs transition duration-150 cursor-pointer bg-emerald-600 hover:bg-emerald-700"
                                  >
                                    <FiTruck size={12} /> Approve Items
                                  </button>
                                )}

                                {/* EDIT DISPATCH BUTTON (Only shown before printing; disappears once printed) */}
                                {!isPending && !c.is_printed && (
                                  <button
                                    type="button"
                                    onClick={() => openApprovalModal(c)}
                                    className="inline-flex items-center gap-1 py-1 px-2.5 rounded text-[11px] font-bold text-white shadow-xs transition duration-150 cursor-pointer bg-slate-700 hover:bg-slate-800"
                                  >
                                    <FiTruck size={12} /> Edit Dispatch
                                  </button>
                                )}

                                {/* SEND REST BUTTON (Only shown when partially dispatched with remaining hold items) */}
                                {canSendRest && (
                                  <button
                                    type="button"
                                    onClick={() => createSubsequentHoldChallan(c)}
                                    title={`Create new DC for remaining ${totalHoldUnits} hold items`}
                                    className="inline-flex items-center gap-1 py-1 px-2.5 rounded text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition duration-150 cursor-pointer"
                                  >
                                    <FiPlusCircle size={12} /> Dispatch Remaining
                                  </button>
                                )}

                                {/* PRINT GATE PASS - Only available after approval/dispatch */}
                                {!isPending && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!c.is_printed) {
                                        await supabase.from('delivery_challans').update({ is_printed: true }).eq('id', c.id);
                                      }
                                      navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/Delivery-Challan/Print/${c.id}`);
                                    }}
                                    className="inline-flex items-center gap-1 py-1 px-2.5 rounded text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 transition shadow-xs cursor-pointer"
                                    title="Print Official Gate Pass / Delivery Voucher"
                                  >
                                    🖨️ Print Gate Pass
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Footer statistics logic pagination arrays mapping */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-stroke dark:border-strokedark">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing {startIndex + 1} to {endIndex} of {totalEntries} entries
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold disabled:opacity-40 cursor-pointer text-xs"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 font-bold text-teal-600 text-xs">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold disabled:opacity-40 cursor-pointer text-xs"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopDispatchQueue;
