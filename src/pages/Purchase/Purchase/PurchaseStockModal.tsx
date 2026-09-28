import React, { useEffect, useState } from 'react';
import { supabase } from '../../../Context/supabaseClient';
import Spinner from '../../../ui/Spinner';
import { MdStore, MdCheckCircle, MdHourglassTop, MdCancel, MdClose } from 'react-icons/md';

interface PurchaseStockModalProps {
  purchase: any;
  initialTab?: string;
  onClose: () => void;
}

const PurchaseStockModal: React.FC<PurchaseStockModalProps> = ({ purchase, initialTab, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [grn, setGrn] = useState<any>(null);
  const [locationItemsMap, setLocationItemsMap] = useState<Record<string, any[]>>({});
  const [availableLocations, setAvailableLocations] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');

  useEffect(() => {
    loadStockData();
  }, [purchase]);

  const loadStockData = async () => {
    setLoading(true);
    try {
      // 1. Fetch GRN record
      let grnRecord = null;
      if (purchase.metadata?.grn_id) {
        const { data } = await supabase
          .from('grn_receipts')
          .select('*')
          .eq('id', purchase.metadata.grn_id)
          .maybeSingle();
        grnRecord = data;
      }

      if (!grnRecord && purchase.purchase_no) {
        const { data } = await supabase
          .from('grn_receipts')
          .select('*')
          .ilike('grn_no', `GRN-${purchase.purchase_no}`)
          .maybeSingle();
        grnRecord = data;
      }

      setGrn(grnRecord);

      // 2. Fetch Products Meta for tile pieces/box formatting
      const { data: productsData } = await supabase
        .from('products')
        .select('product_name, category, pcs_per_box, pieces_per_box, pieces_per_packing, scenario_name, uom');

      const prodMap: Record<string, any> = {};
      (productsData || []).forEach(p => {
        if (p.product_name) prodMap[p.product_name.trim().toLowerCase()] = p;
      });

      // 3. Fetch GRN items if grn exists
      let grnItems: any[] = [];
      if (grnRecord?.id) {
        const { data } = await supabase
          .from('grn_items')
          .select('*')
          .eq('grn_id', grnRecord.id);
        grnItems = data || [];
      }

      // 4. Map and group items by warehouse location
      const grouped: Record<string, any[]> = {};
      const purchaseItems = Array.isArray(purchase.items) ? purchase.items : [];

      if (grnItems.length > 0) {
        grnItems.forEach(item => {
          const loc = (item.warehouse_name || purchase.target_warehouse || 'General').trim();
          if (!grouped[loc]) grouped[loc] = [];

          const prod = prodMap[(item.product_name || '').trim().toLowerCase()];
          const rawPcs = Number(prod?.pieces_per_box ?? prod?.pcs_per_box ?? prod?.pieces_per_packing ?? 0);
          const isTile = rawPcs > 1 || String(prod?.scenario_name || '').toUpperCase().includes('TILE') || String(prod?.category || '').toUpperCase().includes('TILE') || String(prod?.uom || '').toUpperCase() === 'BOX';
          const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);

          grouped[loc].push({
            id: item.id,
            product_name: item.product_name,
            qty: Number(item.qty || 0),
            accepted_qty: item.accepted_qty != null ? Number(item.accepted_qty) : null,
            hold_qty: item.hold_qty != null ? Number(item.hold_qty) : null,
            rejected_qty: item.rejected_qty != null ? Number(item.rejected_qty) : null,
            reject_reason: item.reject_reason || '',
            uom: item.uom || prod?.uom || '',
            isTile,
            pcsPerBox
          });
        });
      } else {
        // Fallback to purchase.items if GRN items aren't available yet
        purchaseItems.forEach((item: any, idx: number) => {
          const loc = (item.warehouse || purchase.target_warehouse || 'General').trim();
          if (!grouped[loc]) grouped[loc] = [];

          const pName = item.product_name || item.name || `Item #${idx + 1}`;
          const prod = prodMap[pName.trim().toLowerCase()];
          const rawPcs = Number(prod?.pieces_per_box ?? prod?.pcs_per_box ?? prod?.pieces_per_packing ?? 0);
          const isTile = rawPcs > 1 || String(prod?.scenario_name || '').toUpperCase().includes('TILE') || String(prod?.category || '').toUpperCase().includes('TILE') || String(prod?.uom || '').toUpperCase() === 'BOX';
          const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);

          grouped[loc].push({
            id: `temp-${idx}`,
            product_name: pName,
            qty: Number(item.quantity || item.qty || 0),
            accepted_qty: null,
            hold_qty: Number(item.quantity || item.qty || 0),
            rejected_qty: 0,
            reject_reason: '',
            uom: item.uom || prod?.uom || '',
            isTile,
            pcsPerBox
          });
        });
      }

      const locations = Object.keys(grouped);
      setLocationItemsMap(grouped);
      setAvailableLocations(locations);

      // Select initial active tab
      if (initialTab) {
        const match = locations.find(l => l.trim().toLowerCase() === initialTab.trim().toLowerCase());
        if (match) {
          setActiveTab(match);
        } else if (locations.length > 0) {
          setActiveTab(locations[0]);
        }
      } else if (locations.length > 0) {
        setActiveTab(locations[0]);
      }
    } catch (err: any) {
      console.error('Error loading stock details:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatQty = (qtyVal: number | null | undefined, pcsPerBox: number, isTile: boolean, uom: string = '') => {
    if (qtyVal === null || qtyVal === undefined) return '—';
    if (isTile && pcsPerBox > 1) {
      const totalPieces = Math.round(Number(qtyVal) * pcsPerBox);
      const b = Math.floor(totalPieces / pcsPerBox);
      const p = totalPieces % pcsPerBox;
      if (b === 0 && p === 0) return '0 Box';
      return `${b} Box${p > 0 ? ` + ${p} Pcs` : ''}`;
    }
    return `${qtyVal} ${uom}`.trim();
  };

  const currentItems = activeTab ? (locationItemsMap[activeTab] || []) : [];

  return (
    <div className="w-full text-black dark:text-white text-xs max-h-[80vh] flex flex-col">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stroke dark:border-strokedark pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-mono font-black text-primary">
              PUR-{purchase.purchase_no || purchase.id}
            </span>
            {grn && (
              <span className={`inline-flex rounded-md py-0.5 px-2.5 text-[10px] font-black uppercase tracking-wide border ${
                grn.status === 'Confirm' || grn.status === 'Billed'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : grn.status === 'Partially Received'
                  ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300'
              }`}>
                {grn.status}
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 font-medium">
            Vendor: <span className="font-bold text-black dark:text-white">{purchase.supplier_name || purchase.vendor_name || 'General Vendor'}</span> • Entry Date: <span className="font-bold text-black dark:text-white">{purchase.purchase_date}</span>
          </p>
        </div>

        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-slate-100 dark:hover:bg-meta-4 hover:text-black dark:hover:text-white transition"
        >
          <MdClose size={20} />
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Spinner /></div>
      ) : availableLocations.length === 0 ? (
        <div className="text-center py-12 text-gray-400 font-bold italic">No receiving locations recorded for this purchase.</div>
      ) : (
        <>
          {/* Location Tabs */}
          <div className="flex items-center gap-2 border-b border-stroke dark:border-strokedark mb-4 overflow-x-auto pb-1">
            {availableLocations.map((loc) => {
              const locItems = locationItemsMap[loc] || [];
              const allAccepted = locItems.length > 0 && locItems.every(i => i.accepted_qty !== null && Number(i.hold_qty || 0) === 0);
              const hasHold = locItems.some(i => Number(i.hold_qty || 0) > 0 || i.accepted_qty === null);
              const isActive = activeTab === loc;

              return (
                <button
                  key={loc}
                  onClick={() => setActiveTab(loc)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-bold text-xs transition duration-150 border-b-2 cursor-pointer ${
                    isActive
                      ? 'border-primary text-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-transparent text-gray-500 hover:text-black dark:hover:text-white hover:bg-slate-50 dark:hover:bg-meta-4/20'
                  }`}
                >
                  <MdStore size={16} />
                  <span>{loc}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                    allAccepted
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                      : hasHold
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-meta-4 dark:text-gray-300'
                  }`}>
                    {allAccepted ? 'Received' : hasHold ? 'Pending / Hold' : `${locItems.length} items`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Location Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-50 dark:bg-meta-4/30 border border-stroke dark:border-strokedark rounded-xl p-3">
              <span className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Total Items</span>
              <span className="text-base font-black text-black dark:text-white">{currentItems.length} SKU(s)</span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-3">
              <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block mb-1 flex items-center gap-1">
                <MdCheckCircle size={12} /> Accepted / Received
              </span>
              <span className="text-base font-black text-emerald-700 dark:text-emerald-300">
                {currentItems.filter(i => (i.accepted_qty || 0) > 0).length} Item(s) Verified
              </span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3">
              <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 block mb-1 flex items-center gap-1">
                <MdHourglassTop size={12} /> On Hold / Pending
              </span>
              <span className="text-base font-black text-amber-700 dark:text-amber-300">
                {currentItems.filter(i => (i.hold_qty || 0) > 0 || i.accepted_qty === null).length} Item(s) Pending
              </span>
            </div>
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 rounded-xl p-3">
              <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400 block mb-1 flex items-center gap-1">
                <MdCancel size={12} /> Rejected
              </span>
              <span className="text-base font-black text-rose-700 dark:text-rose-300">
                {currentItems.filter(i => (i.rejected_qty || 0) > 0).length} Item(s) Rejected
              </span>
            </div>
          </div>

          {/* Items Detail Table */}
          <div className="rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark overflow-hidden flex-grow flex flex-col">
            <div className="max-w-full overflow-x-auto max-h-[350px] overflow-y-auto">
              <table className="w-full table-auto border-collapse text-left">
                <thead className="sticky top-0 bg-slate-100 dark:bg-meta-4 z-10 shadow-sm">
                  <tr className="text-[10px] font-black uppercase tracking-wider border-b border-stroke dark:border-strokedark text-slate-700 dark:text-white">
                    <th className="py-3 px-4">Product Item</th>
                    <th className="py-3 px-4 text-center">Expected Qty</th>
                    <th className="py-3 px-4 text-center text-emerald-700 dark:text-emerald-400">Accepted Qty</th>
                    <th className="py-3 px-4 text-center text-amber-600 dark:text-amber-400">On Hold</th>
                    <th className="py-3 px-4 text-center text-rose-600 dark:text-rose-400">Rejected Qty</th>
                    <th className="py-3 px-4">Reject Reason</th>
                    <th className="py-3 px-4 text-center">QC Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((item) => {
                    const isVerified = item.accepted_qty !== null;
                    const isFullyAccepted = isVerified && Number(item.hold_qty || 0) === 0 && Number(item.rejected_qty || 0) === 0;
                    const isPartiallyAccepted = isVerified && Number(item.accepted_qty || 0) > 0 && Number(item.hold_qty || 0) > 0;
                    const isRejected = isVerified && Number(item.rejected_qty || 0) > 0 && Number(item.accepted_qty || 0) === 0;

                    return (
                      <tr key={item.id} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/20 font-semibold text-xs text-black dark:text-white">
                        <td className="py-3 px-4 font-bold">{item.product_name}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-gray-700 dark:text-gray-300">
                          {formatQty(item.qty, item.pcsPerBox, item.isTile, item.uom)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-mono font-bold ${Number(item.accepted_qty) > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400'}`}>
                            {formatQty(item.accepted_qty, item.pcsPerBox, item.isTile, item.uom)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-mono font-bold ${Number(item.hold_qty) > 0 || !isVerified ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                            {formatQty(isVerified ? item.hold_qty : item.qty, item.pcsPerBox, item.isTile, item.uom)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-mono font-bold ${Number(item.rejected_qty) > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-gray-400'}`}>
                            {formatQty(item.rejected_qty, item.pcsPerBox, item.isTile, item.uom)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-500 italic">
                          {item.reject_reason || '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {!isVerified ? (
                            <span className="inline-flex rounded-md py-0.5 px-2 text-[9px] font-black uppercase bg-gray-100 text-gray-600 dark:bg-meta-4 dark:text-gray-300">
                              Pending QC
                            </span>
                          ) : isFullyAccepted ? (
                            <span className="inline-flex items-center gap-1 rounded-md py-0.5 px-2 text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              <MdCheckCircle size={10} /> Fully Received
                            </span>
                          ) : isPartiallyAccepted ? (
                            <span className="inline-flex items-center gap-1 rounded-md py-0.5 px-2 text-[9px] font-black uppercase bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                              <MdHourglassTop size={10} /> Partial
                            </span>
                          ) : isRejected ? (
                            <span className="inline-flex items-center gap-1 rounded-md py-0.5 px-2 text-[9px] font-black uppercase bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                              <MdCancel size={10} /> Rejected
                            </span>
                          ) : (
                            <span className="inline-flex rounded-md py-0.5 px-2 text-[9px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              On Hold
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end pt-4 mt-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-stroke dark:border-strokedark px-6 py-2 font-bold hover:bg-slate-50 dark:hover:bg-meta-4 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default PurchaseStockModal;
