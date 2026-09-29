import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { MdCheckCircle, MdArrowBack } from 'react-icons/md';
import { useAuth } from '../../../Context/Auth';
import { isShopLocation } from '../../../utils/locationUtils';

const VerifyReturnChallan = ({ returnId, locationFilter, onSuccess, onCancel, readonly }: { returnId?: string, locationFilter?: string, onSuccess?: () => void, onCancel?: () => void, readonly?: boolean }) => {
  const params = useParams();
  const idToUse = returnId || params.id;
  const navigate = useNavigate();
  const { tenantId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [returnChallan, setReturnChallan] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetchReturnData();
  }, [idToUse]);

  const fetchReturnData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales_returns')
        .select('*')
        .eq('id', idToUse)
        .single();

      if (error) throw error;
      setReturnChallan(data);

      const rawItems = Array.isArray(data.items) ? data.items : [];
      const receivedItemsData = Array.isArray(data.received_items) ? data.received_items : [];

      const initializedItems = await Promise.all(rawItems.map(async (item: any, idx: number) => {
        const { data: prodInfo } = await supabase
          .from('products')
          .select('category, pcs_per_box, pieces_per_box, pieces_per_packing')
          .ilike('product_name', item.itemName)
          .maybeSingle();

        const rawPcs = Number(prodInfo?.pieces_per_box ?? prodInfo?.pcs_per_box ?? prodInfo?.pieces_per_packing ?? 0);
        const isTile = String(prodInfo?.category || '').toUpperCase().includes('TILE');
        const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);

        const recItem = receivedItemsData.find((r: any) => r.skuCode === item.skuCode && r.itemName === item.itemName);
        const isUnverified = !recItem;

        return {
          ...item,
          idx,
          acceptedQty: isUnverified ? Number(item.qty || 0) : Number(recItem.acceptedQty || 0),
          rejectedQty: isUnverified ? 0 : Number(recItem.rejectedQty || 0),
          holdQty: isUnverified ? 0 : Number(recItem.holdQty || 0),
          rejectReason: recItem?.rejectReason || '',
          isVerified: !isUnverified,
          isTile,
          pcsPerBox
        };
      }));

      let displayItems = initializedItems;
      if (locationFilter && locationFilter !== 'ALL') {
        displayItems = initializedItems.filter(item => {
          const isShop = isShopLocation(item.warehouse || data.warehouse_name);
          return locationFilter === 'SHOP' ? isShop : !isShop;
        });
      }
      setItems(displayItems);

    } catch (err: any) {
      toast.error('Error fetching return details.');
      if (onSuccess) onSuccess();
      else navigate(`${tenantId ? `/${tenantId}` : ''}/Warehouse/Return-Challan`);
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    
    if (field === 'rejectReason') {
      newItems[index][field] = value;
      setItems(newItems);
      return;
    }
    
    let val = Number(value);
    if (isNaN(val) || val < 0) val = 0;
    
    const maxQty = Number(newItems[index].qty || 0);
    if (val > maxQty) val = maxQty;

    newItems[index][field] = val;

    if (field === 'acceptedQty') {
      newItems[index].rejectedQty = Number((maxQty - val - Number(newItems[index].holdQty)).toFixed(3));
    } else if (field === 'rejectedQty') {
      newItems[index].acceptedQty = Number((maxQty - val - Number(newItems[index].holdQty)).toFixed(3));
    } else if (field === 'holdQty') {
      const remaining = Number((maxQty - val - Number(newItems[index].rejectedQty)).toFixed(3));
      newItems[index].acceptedQty = Math.max(0, remaining);
    }
    
    setItems(newItems);
  };

  const handleSubmit = async () => {
    setSubmitted(true);
    if (items.some((item) => Number(item.rejectedQty) > 0 && !item.rejectReason)) {
      toast.error('Please provide a reason for all rejected items.');
      return;
    }
    if (!window.confirm('Are you sure you want to confirm this Return Receipt? Stock will be updated.')) return;

    setSubmitting(true);
    try {
      // Build final received_items array by merging with existing received_items
      const existingReceived = Array.isArray(returnChallan.received_items) ? [...returnChallan.received_items] : [];
      
      const newReceivedData = items.map(uiItem => ({
        skuCode: uiItem.skuCode,
        itemName: uiItem.itemName,
        acceptedQty: uiItem.acceptedQty,
        rejectedQty: uiItem.rejectedQty,
        holdQty: uiItem.holdQty,
        rejectReason: uiItem.rejectReason,
        warehouse: uiItem.warehouse || returnChallan.warehouse_name,
        verified_at: new Date().toISOString()
      }));

      // Merge (replace if exists, otherwise push)
      newReceivedData.forEach(newRec => {
        const idx = existingReceived.findIndex((e: any) => e.skuCode === newRec.skuCode && e.itemName === newRec.itemName);
        if (idx >= 0) existingReceived[idx] = newRec;
        else existingReceived.push(newRec);
      });

      // warehouse_inventory retired — formula-based stock is source of truth
      // Update products.current_stock for accepted items
      for (const item of items) {
        if (!item.isVerified && Number(item.acceptedQty) > 0) {
          const { data: currentMasterProd } = await supabase
            .from('products')
            .select('id, current_stock')
            .ilike('product_name', item.itemName)
            .maybeSingle();

          if (currentMasterProd) {
            await supabase
              .from('products')
              .update({ current_stock: (Number(currentMasterProd.current_stock) || 0) + Number(item.acceptedQty) })
              .eq('id', currentMasterProd.id);
          }
        }
      }

      // Check if all items across the return have been verified
      const rawItems = Array.isArray(returnChallan.items) ? returnChallan.items : [];
      const allVerified = rawItems.every((ri: any) => 
        existingReceived.some((er: any) => er.skuCode === ri.skuCode && er.itemName === ri.itemName)
      );

      const hasRejections = existingReceived.some((r: any) => Number(r.rejectedQty) > 0);
      const allRejected = existingReceived.every((r: any) => Number(r.acceptedQty) === 0);

      let newStatus = 'Partially Received';
      if (allVerified) {
        if (allRejected) newStatus = 'Rejected';
        else if (hasRejections) newStatus = 'Partially Received';
        else newStatus = 'Received';
      }

      const { error: updateErr } = await supabase
        .from('sales_returns')
        .update({ 
          inward_status: newStatus,
          received_items: existingReceived
        })
        .eq('id', returnChallan.id);

      if (updateErr) throw updateErr;

      toast.success(`Return Verified Successfully! Status: ${newStatus}`);
      if (onSuccess) onSuccess();
      else navigate(`${tenantId ? `/${tenantId}` : ''}/Warehouse/Return-Challan`);
    } catch (err: any) {
      toast.error('Failed to verify return: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center bg-white dark:bg-boxdark"><Spinner /></div>;
  if (!returnChallan) return null;

  return (
    <div className={`mx-auto max-w-7xl text-black dark:text-bodydark text-xs ${returnId ? '' : 'pb-12'}`}>
      {!returnId && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-black dark:text-white flex items-center gap-2">
            <MdCheckCircle className="text-emerald-600" size={24} />
            {readonly ? 'View Return Receipt' : 'Verify Customer Return (QC)'}
          </h2>
          <button
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Warehouse/Return-Challan`)}
            className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline cursor-pointer"
          >
            <MdArrowBack /> Back to List
          </button>
        </div>
      )}

      <div className={returnId ? '' : 'rounded-2xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6'}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 pb-6 border-b border-stroke dark:border-strokedark">
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Return Note #</p>
            <p className="text-lg font-mono font-bold text-black dark:text-white">{returnChallan.return_no || `SR-${String(returnChallan.id).padStart(4, '0')}`}</p>
          </div>
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Original Invoice #</p>
            <p className="text-sm font-bold text-black dark:text-white">{returnChallan.invoice_no || '-'}</p>
          </div>
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Customer Name</p>
            <p className="text-sm font-bold text-black dark:text-white">{returnChallan.customer_name}</p>
          </div>
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Return Date</p>
            <p className="text-sm font-bold text-black dark:text-white">{returnChallan.return_date}</p>
          </div>
          {returnChallan.gate_pass_no && (
            <div>
              <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Return Gate Pass #</p>
              <p className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">{returnChallan.gate_pass_no}</p>
            </div>
          )}
        </div>

        <h3 className="font-bold text-sm mb-4">Verification Checklist</h3>
        <div className="max-w-full overflow-x-auto mb-8">
          <table className="w-full table-auto border-collapse text-left">
            <thead>
              <tr className="bg-slate-100 dark:bg-meta-4 text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-white">
                <th className="py-3 px-4 border-b border-stroke dark:border-strokedark">Product Item</th>
                <th className="py-3 px-4 border-b border-stroke dark:border-strokedark">Location</th>
                <th className="py-3 px-4 border-b border-stroke dark:border-strokedark text-center">Returned Qty</th>
                <th className="py-3 px-4 border-b border-stroke dark:border-strokedark text-center text-emerald-600 dark:text-emerald-400">Accepted Qty</th>
                <th className="py-3 px-4 border-b border-stroke dark:border-strokedark text-center text-rose-600 dark:text-rose-400">Rejected Qty</th>
                <th className="py-3 px-4 border-b border-stroke dark:border-strokedark text-center text-amber-500 dark:text-amber-400">On Hold</th>
                <th className="py-3 px-4 border-b border-stroke dark:border-strokedark">Reject Reason</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/20">
                  <td className="py-3 px-4 font-bold">{item.itemName}</td>
                  <td className="py-3 px-4 text-gray-500">
                    <div className="flex items-center gap-2">
                      {item.warehouse || returnChallan.warehouse_name}
                      {readonly && item.isVerified && (
                        <MdCheckCircle className="text-emerald-500 text-base" title="Verified by this location" />
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold">
                    {item.isTile && item.pcsPerBox > 1 ? (
                      <div className="text-[13px] text-gray-700 dark:text-gray-300">
                        {Math.floor(Number(item.qty || 0))} Box + {Math.round((Number(item.qty || 0) - Math.floor(Number(item.qty || 0))) * item.pcsPerBox)} Pcs
                      </div>
                    ) : (
                      <>{item.qty} {item.uom}</>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {readonly ? (
                      !item.isVerified ? (
                        <div className="text-gray-400 font-bold italic text-[10px] uppercase">Pending</div>
                      ) : (
                        <div className="font-mono font-bold text-emerald-700">
                          {item.acceptedQty}
                        </div>
                      )
                    ) : (
                      <input
                        type="number"
                        min="0"
                        max={item.qty}
                        value={item.acceptedQty === 0 ? '' : item.acceptedQty}
                        onChange={(e) => handleItemChange(index, 'acceptedQty', e.target.value)}
                        className="w-24 rounded-lg border border-emerald-300 dark:border-emerald-700 py-1.5 px-3 bg-white dark:bg-boxdark outline-none focus:border-emerald-500 font-mono font-bold text-emerald-700 text-sm shadow-sm text-center mx-auto block"
                        placeholder="0"
                      />
                    )}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {readonly ? (
                      !item.isVerified ? (
                        <div className="text-gray-400 font-bold italic text-[10px] uppercase">-</div>
                      ) : (
                        <div className="font-mono font-bold text-rose-700">
                          {item.rejectedQty}
                        </div>
                      )
                    ) : (
                      <input
                        type="number"
                        min="0"
                        max={item.qty}
                        value={item.rejectedQty === 0 ? '' : item.rejectedQty}
                        onChange={(e) => handleItemChange(index, 'rejectedQty', e.target.value)}
                        className="w-24 rounded-lg border border-rose-300 dark:border-rose-700 py-1.5 px-3 bg-white dark:bg-boxdark outline-none focus:border-rose-500 font-mono font-bold text-rose-700 text-sm shadow-sm text-center mx-auto block"
                        placeholder="0"
                      />
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {readonly ? (
                      <div className="text-gray-600 dark:text-gray-300">{item.rejectReason || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={item.rejectReason}
                        onChange={(e) => handleItemChange(index, 'rejectReason', e.target.value)}
                        placeholder="e.g. Broken/Damaged"
                        className={`w-full rounded border px-2 py-1.5 outline-none focus:border-primary disabled:opacity-50 dark:bg-boxdark ${
                          submitted && Number(item.rejectedQty) > 0 && !item.rejectReason
                            ? 'border-rose-500 bg-rose-50 ring-1 ring-rose-500 placeholder-rose-300'
                            : 'border-stroke dark:border-strokedark'
                        }`}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3 border-t border-stroke dark:border-strokedark pt-6">
          <button
            type="button"
            onClick={() => {
              if (onCancel) onCancel();
              else if (onSuccess) onSuccess();
              else navigate(`${tenantId ? `/${tenantId}` : ''}/Warehouse/Return-Challan`);
            }}
            className="rounded-lg border border-stroke px-6 py-2 font-medium hover:bg-slate-50 dark:border-strokedark dark:hover:bg-meta-4 transition"
            disabled={submitting}
          >
            {readonly ? 'Close' : 'Cancel'}
          </button>
          {!readonly && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {submitting ? <Spinner /> : <MdCheckCircle size={16} />}
              Confirm Receipt
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyReturnChallan;
