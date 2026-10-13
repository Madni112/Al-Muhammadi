import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { useAuth } from '../../../Context/Auth';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import TableActions from '../../../ui/TableActions';
import { MdInventory } from 'react-icons/md';

const OpeningStockList = () => {
  const { userName, userEmail } = useAuth();
  const [stocks, setStocks] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage] = useState(10);
  const [viewBatch, setViewBatch] = useState<any[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStocks();
  }, []);

  const fetchStocks = async () => {
    setLoading(true);
    try {
      const [stocksRes, prodRes] = await Promise.all([
        supabase.from('opening_stocks').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('id, product_name, item_sr_no, pieces_per_box, pcs_per_box, pieces_per_packing, product_description, category'),
      ]);

      if (stocksRes.error) throw stocksRes.error;
      setStocks(stocksRes.data || []);
      if (prodRes.data) setProducts(prodRes.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getProductPiecesPerBox = (productName?: string, skuCode?: string) => {
    const norm = (s: string) => (s || '').trim().toLowerCase();
    const nameNorm = norm(productName || '');
    const skuNorm = norm(skuCode || '');

    const p = products.find((prod: any) => {
      if (skuNorm && norm(prod.item_sr_no) === skuNorm) return true;
      if (nameNorm && norm(prod.product_name) === nameNorm) return true;
      return false;
    });

    if (p) {
      const raw = Number(p.pieces_per_box ?? p.pcs_per_box ?? p.pieces_per_packing ?? 0);
      if (raw >= 1) return raw;
      const match = String(p.product_description || '').match(/Box:\s*(\d+)\s*pcs/i);
      if (match && Number(match[1]) > 0) return Number(match[1]);
    }

    const text = `${productName || ''} ${p?.product_description || ''}`;
    const slashMatch = text.match(/\b\d+(?:\.\d+)?\/(\d+)\b/);
    if (slashMatch && Number(slashMatch[1]) > 0) return Number(slashMatch[1]);

    return 8;
  };

  const formatItemQty = (r: any) => {
    const qty = Number(r.qty ?? r.quantity) || 0;
    if (qty % 1 === 0 || Math.abs(qty - Math.round(qty)) < 0.0001) {
      return {
        boxes: Math.round(qty),
        loose: 0,
        hasLoose: false,
        rawQty: qty,
      };
    }
    const pcsPerBox = getProductPiecesPerBox(r.itemName || r.product_name, r.skuCode || r.item_code || r.itemCode);
    const boxes = Math.floor(qty);
    const loose = Math.round((qty - boxes) * pcsPerBox);
    return {
      boxes,
      loose,
      hasLoose: loose > 0,
      pcsPerBox,
      rawQty: qty,
    };
  };

  const formatBatchQty = (group: any[]) => {
    let totalBoxes = 0;
    let totalLoose = 0;
    let fallbackPcsPerBox = 8;
    let hasAnyLoose = false;

    (group || []).forEach((r: any) => {
      const info = formatItemQty(r);
      totalBoxes += info.boxes;
      totalLoose += info.loose;
      if (info.hasLoose) {
        hasAnyLoose = true;
        if (info.pcsPerBox) fallbackPcsPerBox = info.pcsPerBox;
      }
    });

    if (fallbackPcsPerBox > 0 && totalLoose >= fallbackPcsPerBox) {
      const extraBoxes = Math.floor(totalLoose / fallbackPcsPerBox);
      totalBoxes += extraBoxes;
      totalLoose = totalLoose % fallbackPcsPerBox;
    }

    return {
      boxes: totalBoxes,
      loose: totalLoose,
      hasLoose: totalLoose > 0,
      rawTotal: (group || []).reduce((sum: number, r: any) => sum + (Number(r.qty ?? r.quantity) || 0), 0),
    };
  };

  // One entry per Stock No — every line created together shares the same Stock No
  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    (stocks || []).forEach((s) => {
      const key = String(s.stockNo || s.stock_no || s.id);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return Object.values(map);
  }, [stocks]);

  const totalEntries = groups.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);
  const paginatedGroups = groups.slice(startIndex, startIndex + entriesPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [entriesPerPage]);

  const subtractProductStock = async (nameKey: string, qty: number) => {
    if (!nameKey || qty <= 0) return;
    const { data: prod } = await supabase
      .from('products')
      .select('id, current_stock')
      .ilike('product_name', nameKey)
      .maybeSingle();

    if (prod) {
      await supabase
        .from('products')
        .update({ current_stock: Math.max(0, (Number(prod.current_stock) || 0) - qty) })
        .eq('id', prod.id);
    }
  };

  const handleDeleteBatch = async (group: any[]) => {
    const stockNoLabel = String(group[0]?.stockNo || group[0]?.stock_no || 'N/A');
    const itemCount = group.length;
    const totalQty = group.reduce((sum: number, r: any) => sum + (Number(r.qty ?? r.quantity) || 0), 0);

    if (!window.confirm(`Delete opening stock batch ${stockNoLabel}? It contains ${itemCount} item(s), total qty ${totalQty}. Stock balances will be reversed.`)) {
      return;
    }

    try {
      // Reverse products.current_stock (aggregated per product)
      const qtyMap: Record<string, number> = {};
      group.forEach((r: any) => {
        const key = String(r.itemName || r.product_name || '').trim().toLowerCase();
        if (key) qtyMap[key] = (qtyMap[key] || 0) + (Number(r.qty ?? r.quantity) || 0);
      });
      for (const [nameKey, qty] of Object.entries(qtyMap)) {
        await subtractProductStock(nameKey, qty);
      }

      const ids = group.map((r: any) => r.id).filter(Boolean);
      const { error } = await supabase.from('opening_stocks').delete().in('id', ids);
      if (error) throw error;

      // Record deletion in audit_logs
      try {
        await supabase.from('audit_logs').insert({
          action_type: 'DELETE',
          table_name: 'opening_stocks',
          performed_by: userName || userEmail || 'Warehouse Manager',
          details: {
            stock_no: stockNoLabel,
            location: group[0]?.location || '',
            items_count: itemCount,
            total_quantity: totalQty,
            deleted_items: group.slice(0, 10).map((r: any) => `${r.itemName || r.product_name} (${r.qty || r.quantity} Units)`),
          },
        });
      } catch (auditErr) {
        console.warn('Opening stock deletion audit log note:', auditErr);
      }

      toast.success(`Opening stock batch ${stockNoLabel} deleted successfully.`);
      fetchStocks();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEditBatch = (group: any[]) => {
    navigate('/Inventory/OpeningStock/Add', { state: { stockBatch: group } });
  };

  const firstValue = (group: any[], keys: string[]) => {
    for (const r of group) {
      for (const k of keys) {
        const v = r[k];
        if (v !== null && v !== undefined && String(v).trim() !== '') return v;
      }
    }
    return '';
  };

  return (
    <div className="rounded-sm border border-stroke bg-white px-5 pt-6 pb-2.5 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5 xl:pb-1">
      <div className="flex justify-between items-center mb-6 border-b border-stroke dark:border-strokedark pb-4">
        <h4 className="text-xl font-semibold text-black dark:text-white flex items-center gap-2">
          <MdInventory className="text-primary text-2xl" /> Opening Stocks Directory
        </h4>
        <button
          onClick={() => navigate('/Inventory/OpeningStock/Add')}
          className="bg-primary hover:bg-opacity-90 text-white font-medium py-2 px-4 rounded text-sm transition-all shadow-sm cursor-pointer"
        >
          + Initialize Opening Stock
        </button>
      </div>

      <div className="max-w-full overflow-x-auto">
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="bg-gray-2 text-left dark:bg-meta-4">
              <th className="py-4 px-4 font-medium text-black dark:text-white">Stock No</th>
              <th className="py-4 px-4 font-medium text-black dark:text-white">Batch No</th>
              <th className="py-4 px-4 font-medium text-black dark:text-white">Location</th>
              <th className="py-4 px-4 font-medium text-black dark:text-white text-center">Opening Date</th>
              <th className="py-4 px-4 font-medium text-black dark:text-white text-center">Expiry Date</th>
              <th className="py-4 px-4 font-medium text-black dark:text-white">Items</th>
              <th className="py-4 px-4 font-medium text-black dark:text-white text-center">Qty</th>
              <th className="py-4 px-4 font-medium text-black dark:text-white text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10"><Spinner /></td></tr>
            ) : paginatedGroups.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-500 italic">No opening stock initialized yet.</td></tr>
            ) : (
              paginatedGroups.map((group) => {
                const stockNoLabel = String(firstValue(group, ['stockNo', 'stock_no']) || 'N/A');
                const batchLabel = String(firstValue(group, ['batchNumber', 'batch_number']) || 'N/A');
                const locLabel = String(firstValue(group, ['location']) || 'N/A');
                const openDate = String(firstValue(group, ['openingDate', 'opening_date']) || 'N/A');
                const expiryLabel = String(firstValue(group, ['expiryDate', 'expiry_date']) || 'N/A');
                const totalQty = group.reduce((sum: number, r: any) => sum + (Number(r.qty ?? r.quantity) || 0), 0);

                return (
                  <tr key={stockNoLabel} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/20 transition-colors">
                    <td className="py-5 px-4 font-mono text-xs font-bold text-primary dark:text-blue-400 whitespace-nowrap">
                      {stockNoLabel}
                    </td>
                    <td className="py-5 px-4 font-mono text-xs font-semibold text-black dark:text-white whitespace-nowrap">
                      {batchLabel}
                    </td>
                    <td className="py-5 px-4 text-xs text-primary font-semibold whitespace-nowrap">
                      {locLabel}
                    </td>
                    <td className="py-5 px-4 text-center text-xs font-mono whitespace-nowrap text-gray-700 dark:text-bodydark">
                      {openDate}
                    </td>
                    <td className="py-5 px-4 text-center text-xs font-mono whitespace-nowrap text-danger font-medium">
                      {expiryLabel}
                    </td>

                    {/* Items: total count — click to see each product */}
                    <td className="py-5 px-4">
                      <button
                        onClick={() => setViewBatch(group)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 px-3 py-1 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition cursor-pointer"
                        title="View all items in this batch"
                      >
                        <MdInventory size={13} />
                        {group.length} Item{group.length > 1 ? 's' : ''}
                        <span className="text-[9px] opacity-70 underline">view</span>
                      </button>
                    </td>

                    <td className="py-5 px-4 text-center">
                      {(() => {
                        const { boxes, loose, hasLoose, rawTotal } = formatBatchQty(group);
                        if (!hasLoose) {
                          return (
                            <span className="font-black text-black dark:text-white">
                              {boxes.toLocaleString()}
                            </span>
                          );
                        }
                        return (
                          <div
                            className="flex flex-col items-center justify-center leading-tight"
                            title={`${boxes} boxes + ${loose} pcs (${rawTotal.toLocaleString(undefined, { maximumFractionDigits: 3 })})`}
                          >
                            <span className="font-black text-black dark:text-white">
                              {boxes.toLocaleString()}
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                              ({loose} {loose === 1 ? 'pc' : 'pcs'})
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    <td className="py-5 px-4 text-center">
                      <TableActions
                        onEdit={() => handleEditBatch(group)}
                        onDelete={() => handleDeleteBatch(group)}
                        editTitle="Modify Stock Batch"
                        deleteTitle="Remove Entire Batch"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <div>
          Showing {totalEntries > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + entriesPerPage, totalEntries)} of {totalEntries} stock entries
          {stocks.length !== totalEntries && (
            <span className="text-slate-400"> ({stocks.length} product lines)</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold disabled:opacity-40 cursor-pointer text-xs"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 font-bold text-teal-600 text-xs">
            Page {currentPage} of {totalPages || 1}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalEntries === 0}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold disabled:opacity-40 cursor-pointer text-xs"
          >
            Next
          </button>
        </div>
      </div>

      {/* Batch Items Popup */}
      {viewBatch && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-boxdark rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-strokedark overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-strokedark bg-slate-50 dark:bg-meta-4/30">
              <div>
                <h4 className="font-bold text-black dark:text-white text-sm">Opening Stock Items</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Stock No: <span className="font-mono font-bold text-primary">{String(firstValue(viewBatch, ['stockNo', 'stock_no']) || 'N/A')}</span>
                  {' · '}Batch: <span className="font-mono font-semibold">{String(firstValue(viewBatch, ['batchNumber', 'batch_number']) || 'N/A')}</span>
                  {' · '}Loc: <span className="font-semibold">{String(firstValue(viewBatch, ['location']) || 'N/A')}</span>
                  {' · '}{String(firstValue(viewBatch, ['openingDate', 'opening_date']) || '')}
                </p>
              </div>
              <button
                onClick={() => setViewBatch(null)}
                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <table className="w-full table-auto text-xs">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-strokedark">
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 px-3 text-center">Qty</th>
                    <th className="py-2 px-3 text-right">Unit Cost (PKR)</th>
                    <th className="py-2 px-3 text-right">Amount (PKR)</th>
                    <th className="py-2 pl-3 text-center">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {viewBatch.map((r) => {
                    const qty = Number(r.qty ?? r.quantity) || 0;
                    const cost = Number(r.purchase_price ?? r.rate ?? r.rp ?? 0) || 0;
                    const amount = Number(r.amount ?? r.total_amount ?? (qty * cost)) || 0;
                    return (
                      <tr key={r.id} className="border-b border-slate-100 dark:border-strokedark/60">
                        <td className="py-2.5 pr-3">
                          <p className="font-semibold text-slate-800 dark:text-white">{r.itemName || r.product_name}</p>
                          {(r.skuCode || r.item_code) && <p className="text-[10px] font-mono text-primary font-bold">{r.skuCode || r.item_code}</p>}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {(() => {
                            const { boxes, loose, hasLoose, rawQty } = formatItemQty(r);
                            if (!hasLoose) {
                              return (
                                <span className="font-bold text-black dark:text-white">
                                  {boxes.toLocaleString()}
                                </span>
                              );
                            }
                            return (
                              <div
                                className="flex flex-col items-center justify-center leading-tight"
                                title={`${boxes} boxes + ${loose} pcs (${rawQty.toLocaleString(undefined, { maximumFractionDigits: 3 })})`}
                              >
                                <span className="font-bold text-black dark:text-white">
                                  {boxes.toLocaleString()}
                                </span>
                                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                  ({loose} {loose === 1 ? 'pc' : 'pcs'})
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">Rs. {cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">Rs. {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 pl-3 text-center font-mono text-xs text-danger">{r.expiryDate || r.expiry_date || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-200 dark:border-strokedark text-xs font-bold">
                <span className="text-slate-500 dark:text-slate-400">
                  Total {viewBatch.length} Item{viewBatch.length > 1 ? 's' : ''}
                </span>
                <span className="text-slate-700 dark:text-slate-200">
                  Total Qty:{' '}
                  {(() => {
                    const { boxes, loose, hasLoose, rawTotal } = formatBatchQty(viewBatch);
                    if (!hasLoose) {
                      return <span className="text-black dark:text-white font-black">{boxes.toLocaleString()}</span>;
                    }
                    return (
                      <span className="font-bold text-black dark:text-white" title={`${rawTotal.toLocaleString(undefined, { maximumFractionDigits: 3 })} total`}>
                        {boxes.toLocaleString()}{' '}
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                          ({loose} {loose === 1 ? 'pc' : 'pcs'})
                        </span>
                      </span>
                    );
                  })()}
                  <span className="mx-2 text-slate-300 dark:text-strokedark">|</span>
                  Total Valuation: <span className="text-emerald-600 dark:text-emerald-400 font-mono">Rs. {viewBatch.reduce((sum, r) => sum + (Number(r.amount ?? r.total_amount ?? 0) || (Number(r.qty ?? r.quantity) || 0) * (Number(r.purchase_price ?? r.rate ?? r.rp) || 0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-meta-4/30 border-t border-slate-100 dark:border-strokedark flex justify-end">
              <button
                onClick={() => setViewBatch(null)}
                className="px-5 py-2 bg-white dark:bg-boxdark border border-slate-200 dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition shadow-sm cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpeningStockList;
