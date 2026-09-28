import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { FiPrinter, FiArrowLeft, FiPhone, FiMapPin, FiCheckCircle, FiRotateCcw } from 'react-icons/fi';

interface ReturnItem {
  itemName?: string;
  product_name?: string;
  skuCode?: string;
  item_sr_no?: string;
  qty?: number;
  quantity?: number;
  rate?: number;
  cost_price?: number;
  lineTotal?: number;
  warehouse?: string;
}

interface PurchaseReturnData {
  id: number;
  return_no: string;
  vendor_name?: string;
  supplier_name?: string;
  source_warehouse?: string;
  warehouse_name?: string;
  purchase_no?: string;
  return_date?: string;
  payment_term?: string;
  amount_paid?: number;
  cash_amount_paid?: number;
  bank_amount_paid?: number;
  total_amount?: number;
  remarks?: string;
  notes?: string;
  items: ReturnItem[];
  metadata?: any;
  created_at: string;
}

const PrintPurchaseReturn: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [returnData, setReturnData] = useState<PurchaseReturnData | null>(null);
  const [vendorInfo, setVendorInfo] = useState<any>(null);
  const [productsCatalog, setProductsCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReturnRecord = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('purchase_returns')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setReturnData(data);

        // Fetch products catalog for tile box/sqm conversions
        const { data: prods } = await supabase
          .from('products')
          .select('id, product_name, item_sr_no, category, uom, pieces_per_box, pcs_per_box, pieces_per_packing, product_description, scenario_name');
        if (prods) setProductsCatalog(prods);

        // Fetch vendor info
        const vName = data.vendor_name || data.supplier_name;
        if (vName) {
          const { data: vData } = await supabase
            .from('vendors')
            .select('*')
            .or(`vendor_name.ilike.${vName},name.ilike.${vName}`)
            .maybeSingle();
          if (vData) setVendorInfo(vData);
        }
      } catch (err: any) {
        toast.error('Failed to load purchase return record: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReturnRecord();
  }, [id]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen bg-white"><Spinner /></div>;
  }

  if (!returnData) {
    return <div className="text-center py-20 text-gray-500 font-bold">Purchase return record not found.</div>;
  }

  const rawItems = Array.isArray(returnData.items) ? returnData.items : [];
  const matchedInvoicesList: any[] = Array.isArray(returnData.metadata?.matchedInvoices) 
    ? returnData.metadata.matchedInvoices 
    : [];

  let computedTotalGross = 0;
  let computedTotalBoxes = 0;
  let computedTotalLoosePcs = 0;
  let computedTotalSqm = 0;
  let hasTileItems = false;

  const processedItems = rawItems.map((item, idx) => {
    const pName = item.itemName ?? item.product_name ?? 'N/A';
    const prodMeta = productsCatalog.find(p => 
      p.product_name?.toLowerCase() === pName.toLowerCase() || 
      (item.skuCode && (p.item_sr_no === item.skuCode || `SKU-${p.id}` === item.skuCode))
    );

    const rawPcs = Number(prodMeta?.pieces_per_box || prodMeta?.pcs_per_box || prodMeta?.pieces_per_packing || 0);
    const isTile = Boolean(
      prodMeta && (
        String(prodMeta.category || '').toLowerCase().includes('tile') ||
        String(prodMeta.scenario_name || '').toLowerCase().includes('tile')
      ) && (rawPcs > 1 || String(prodMeta.scenario_name || '').toLowerCase().includes('tile'))
    );
    if (isTile) hasTileItems = true;

    const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);

    const qty = Number(item.qty ?? item.quantity ?? 0);
    const rate = Number(item.rate ?? item.cost_price ?? 0);
    const lineTotal = Number(item.lineTotal ?? (rate * qty));
    computedTotalGross += lineTotal;

    // Quantity display string and Sq.Mtr calculations
    let qtyDisplay = `${qty}`;
    let perBoxSqm = 0;
    let perPieceSqm = 0;
    let totalLineSqm = 0;

    if (isTile) {
      const boxes = Math.floor(qty);
      const loose = Math.round((qty - boxes) * pcsPerBox);
      computedTotalBoxes += boxes;
      computedTotalLoosePcs += loose;

      let tileWidthCm = 60;
      let tileHeightCm = 60;
      const desc = prodMeta?.product_description || '';
      const sku = prodMeta?.item_sr_no || item.skuCode || '';
      const sizeMatch = desc.match(/Size:\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm/i) ||
                        sku.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
      if (sizeMatch) {
        tileHeightCm = Number(sizeMatch[1]) || 60;
        tileWidthCm = Number(sizeMatch[2]) || 60;
      }
      perPieceSqm = (tileHeightCm * tileWidthCm) / 10000;
      perBoxSqm = perPieceSqm * pcsPerBox;
      totalLineSqm = (boxes * perBoxSqm) + (loose * perPieceSqm);
      computedTotalSqm += totalLineSqm;

      if (boxes > 0 && loose > 0) {
        qtyDisplay = `${boxes} Box + ${loose} Pcs`;
      } else if (boxes > 0) {
        qtyDisplay = `${boxes} Box${boxes > 1 ? 'es' : ''}`;
      } else if (loose > 0) {
        qtyDisplay = `${loose} Pcs`;
      } else {
        qtyDisplay = `0 Box`;
      }
    } else {
      qtyDisplay = `${qty} ${item.uom || prodMeta?.uom || 'NOS'}`;
    }

    // Find matched PO reference for this line item
    const matchedPoObj = matchedInvoicesList.find((mi: any) => 
      (mi.item_name || '').toLowerCase() === pName.toLowerCase() ||
      (mi.sku && item.skuCode && mi.sku === item.skuCode)
    );
    const linkedPoDisplay = matchedPoObj?.purchase_no || returnData.purchase_no || 'General Settlement';

    return {
      pName,
      sku: item.skuCode || prodMeta?.item_sr_no || `SKU-${idx + 1}`,
      warehouse: item.warehouse || returnData.source_warehouse || 'Main Warehouse',
      qty,
      qtyDisplay,
      rate,
      lineTotal,
      isTile,
      linkedPoDisplay,
      totalLineSqm
    };
  });

  const computedTotalSqFt = computedTotalSqm * 10.7639;
  const grandTotal = Number(returnData.total_amount || computedTotalGross);
  const upfrontCollected = Number(returnData.amount_paid || returnData.cash_amount_paid || 0) + Number(returnData.bank_amount_paid || 0);
  const creditAppliedToLedger = Math.max(0, grandTotal - upfrontCollected);

  const returnNoFormatted = returnData.return_no || `RTN-${String(returnData.id).padStart(4, '0')}`;
  const returnDateFormatted = returnData.return_date 
    ? new Date(returnData.return_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date(returnData.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // ── Currency Formatter ──
  const formatMoney = (val: number | string | undefined | null): string => {
    const num = Number(val) || 0;
    if (Number.isInteger(num)) {
      return num.toLocaleString('en-US');
    }
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // ── Number to Words Helper ──
  const numberToWords = (num: number): string => {
    if (num === 0) return 'Zero';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const n = ('000000000' + num).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (Number(n[1]) !== 0) ? (a[Number(n[1])] || b[n[1][0] as any] + ' ' + a[n[1][1] as any]) + 'Crore ' : '';
    str += (Number(n[2]) !== 0) ? (a[Number(n[2])] || b[n[2][0] as any] + ' ' + a[n[2][1] as any]) + 'Lakh ' : '';
    str += (Number(n[3]) !== 0) ? (a[Number(n[3])] || b[n[3][0] as any] + ' ' + a[n[3][1] as any]) + 'Thousand ' : '';
    str += (Number(n[4]) !== 0) ? (a[Number(n[4])] || b[n[4][0] as any] + ' ' + a[n[4][1] as any]) + 'Hundred ' : '';
    str += (Number(n[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0] as any] + ' ' + a[n[5][1] as any]) : '';
    return str.trim() + ' Rupees Only';
  };

  const amountInWords = numberToWords(Math.round(grandTotal));

  return (
    <div className="mx-auto max-w-5xl p-2 sm:p-4 md:p-6 bg-white text-slate-900 font-sans min-h-screen relative print:p-0 print:m-0 print:max-w-none print:w-full">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          html, body, #root, main, div[class*="max-w-screen-2xl"], div[class*="p-4 md:p-6 2xl:p-8"] {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
          }
          aside, nav, header, footer, .no-print, button {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body {
            background: white !important;
            color: #0f172a !important;
            font-size: 11px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
          .print-table-header {
            background-color: #0f172a !important;
            color: #ffffff !important;
          }
          .print-table-header th {
            color: #ffffff !important;
            background-color: #0f172a !important;
          }
          .print-total-row td {
            background-color: #f1f5f9 !important;
            border-top: 2px solid #0f172a !important;
            border-bottom: 2px solid #0f172a !important;
          }
        }
      `}</style>

      {/* ── TOP ACTION BAR (Hidden on Print) ─────────────────────────────────── */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return/List`)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition cursor-pointer"
          >
            <FiArrowLeft size={14} /> Back to Return Notes
          </button>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Vendor Debit Note & Goods Return Note</h1>
            <p className="text-[11px] text-slate-400 font-mono">Debit Note Ref: {returnNoFormatted}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2.5 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg shadow-md transition cursor-pointer"
        >
          <FiPrinter size={16} /> Print Debit Note
        </button>
      </div>

      {/* ── PRINTABLE DOCUMENT CONTAINER (Full A4 Width) ──────────────────────── */}
      <div className="print-container bg-white p-6 sm:p-8 border border-slate-200 rounded-xl shadow-xs print:border-none print:p-0 print:shadow-none">
        
        {/* ── 1. CORPORATE EXECUTIVE HEADER ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 pb-5 mb-5 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-700 text-white font-black flex items-center justify-center text-base shadow-sm">Z</span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 uppercase">AL MUHAMMADI</h2>
            </div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">Wholesale Tile & Sanitary Procurement Hub</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 mt-2 font-medium">
              <span className="flex items-center gap-1.5"><FiMapPin className="text-emerald-700" size={13} /> Main Showroom & Warehouse Yard, Pakistan</span>
              <span className="flex items-center gap-1.5"><FiPhone className="text-emerald-700" size={13} /> Hotline: 0312-8039911</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 min-w-[240px] text-right font-mono">
            <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center justify-end gap-1">
              <FiRotateCcw size={12} /> Official Vendor Debit Note
            </div>
            <div className="text-lg sm:text-xl font-black text-slate-950 tracking-tight mt-0.5">{returnNoFormatted}</div>
            <div className="text-xs text-slate-600 font-sans mt-1">
              Dispatch Date: <strong className="text-slate-900 font-mono">{returnDateFormatted}</strong>
            </div>
            <div className="mt-1.5">
              <span className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                Mode: {returnData.payment_term || 'On Credit'}
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. METADATA CARDS: VENDOR & SOURCE DISPATCH WAREHOUSE ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Vendor Card */}
          <div className="bg-slate-50/80 border border-slate-300 rounded-xl p-4 text-xs">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FiCheckCircle className="text-emerald-700" size={13} /> Wholesale Vendor Profile (Credited)
            </div>
            <h3 className="font-black text-slate-900 text-sm">{returnData.vendor_name || returnData.supplier_name || 'General Factory Vendor'}</h3>
            {vendorInfo?.contact_name && (
              <p className="text-slate-700 mt-1"><strong className="text-slate-900">Contact Person:</strong> {vendorInfo.contact_name}</p>
            )}
            {(vendorInfo?.cell_no || vendorInfo?.phone_no || vendorInfo?.phone) && (
              <p className="text-slate-700 mt-0.5 font-mono"><strong className="text-slate-900">Phone:</strong> {vendorInfo.cell_no || vendorInfo.phone_no || vendorInfo.phone}</p>
            )}
            {vendorInfo?.address && (
              <p className="text-slate-600 mt-0.5 text-[11px]"><strong className="text-slate-900">Address:</strong> {vendorInfo.address}</p>
            )}
          </div>

          {/* Dispatch Warehouse Card */}
          <div className="bg-slate-50/80 border border-slate-300 rounded-xl p-4 text-xs">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FiMapPin className="text-emerald-700" size={13} /> Dispatch Source & Inbound PO Links
            </div>
            <p className="text-slate-700"><strong className="text-slate-900">Source Warehouse:</strong> {returnData.source_warehouse || returnData.warehouse_name || 'Main Warehouse'}</p>
            <p className="text-slate-700 mt-1"><strong className="text-slate-900">Outbound Purpose:</strong> Vendor Return / Debit Note Adjustment</p>
            {matchedInvoicesList.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Matched Inbound PO History:</span>
                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set(matchedInvoicesList.map((m: any) => m.purchase_no))).map((po: any, idx: number) => (
                    <span key={idx} className="bg-slate-200 text-slate-800 text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                      {po}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 3. ITEMIZED RETURN TABLE ── */}
        <div className="overflow-x-auto mb-5">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="print-table-header bg-slate-900 text-white font-black text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3 w-24">Code</th>
                <th className="py-2.5 px-3">Product Description</th>
                <th className="py-2.5 px-3 w-28">Source Location</th>
                <th className="py-2.5 px-3 w-24 font-mono">Matched PO</th>
                <th className="py-2.5 px-3 w-28 text-center">Returned Qty</th>
                <th className="py-2.5 px-3 w-24 text-right">Cost Rate</th>
                <th className="py-2.5 px-3 w-28 text-right pr-4">Credit Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {processedItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 print:hover:bg-transparent">
                  <td className="py-2.5 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{item.sku}</td>
                  <td className="py-2.5 px-3 font-bold text-slate-900">{item.pName}</td>
                  <td className="py-2.5 px-3 text-slate-600 text-[11px]">{item.warehouse}</td>
                  <td className="py-2.5 px-3 font-mono text-[11px] font-bold text-slate-700">{item.linkedPoDisplay}</td>
                  <td className="py-2.5 px-3 text-center font-bold font-mono">
                    <div>{item.qtyDisplay}</div>
                    {item.totalLineSqm > 0 && (
                      <div className="text-[10px] text-teal-700 font-medium">({item.totalLineSqm.toFixed(2)} sq.m)</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold">Rs. {formatMoney(item.rate)}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 pr-4">Rs. {formatMoney(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="print-total-row bg-slate-100 font-black border-t-2 border-slate-900 text-xs">
                <td colSpan={5} className="py-2.5 px-3 text-right uppercase tracking-wider font-bold text-slate-700">
                  Total Outbound Returned Summary:
                </td>
                <td className="py-2.5 px-3 text-center bg-slate-200/70">
                  <div className="font-mono font-black text-slate-950 text-xs">
                    {hasTileItems && computedTotalBoxes > 0
                      ? `${computedTotalBoxes} Box${computedTotalBoxes > 1 ? 'es' : ''}${computedTotalLoosePcs > 0 ? ` + ${computedTotalLoosePcs} Pcs` : ''}`
                      : `${processedItems.reduce((acc, it) => acc + it.qty, 0)} Units`}
                  </div>
                  {computedTotalSqm > 0 && (
                    <div className="mt-0.5">
                      <span className="text-[10px] font-black text-teal-950 bg-teal-100 px-2 py-0.5 rounded border border-teal-300 inline-block font-mono">
                        {computedTotalSqm.toFixed(2)} sq.m
                      </span>
                    </div>
                  )}
                </td>
                <td colSpan={2} className="py-2.5 px-3 text-right pr-4 bg-slate-200/50">
                  <div className="inline-flex items-baseline justify-end gap-2">
                    <span className="text-slate-600 font-sans text-[11px] font-bold uppercase tracking-wider">Gross Credit:</span>
                    <strong className="font-mono font-black text-slate-950 text-sm whitespace-nowrap">
                      Rs. {formatMoney(grandTotal)}
                    </strong>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── 4. FINANCIAL SUMMARY & WORDS BREAKDOWN ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start mb-6">
          {/* Amount in words and remarks */}
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Total Return Value in Words:</span>
              <p className="font-bold text-slate-900 italic text-xs">{amountInWords}</p>
            </div>

            {/* Tile Coverage Area Badge */}
            {computedTotalSqm > 0 && (
              <div className="p-3 rounded-xl bg-teal-50/80 border border-teal-300 text-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-teal-800 uppercase tracking-wider block">Total Tile Coverage Area:</span>
                  <p className="font-black text-teal-950 text-sm font-mono mt-0.5">
                    {computedTotalSqm.toFixed(2)} Sq.M <span className="text-xs font-medium text-teal-700">({computedTotalSqFt.toLocaleString(undefined, { maximumFractionDigits: 1 })} Sq.Ft)</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-teal-800 uppercase tracking-wider block">Boxes:</span>
                  <p className="font-black text-teal-950 text-sm font-mono mt-0.5">{computedTotalBoxes} Boxes</p>
                </div>
              </div>
            )}

            {(returnData.remarks || returnData.notes) && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Return Memo / Reason for Dispatch:</span>
                <p className="text-slate-800 font-medium">{returnData.remarks || returnData.notes}</p>
              </div>
            )}
          </div>

          {/* Debit Note Settlement Summary Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-2 font-mono text-xs">
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-sans font-bold">Gross Goods Return Value:</span>
              <strong className="font-black text-sm text-slate-950">Rs. {formatMoney(grandTotal)}</strong>
            </div>

            {upfrontCollected > 0 && (
              <div className="flex justify-between items-center text-emerald-800 pt-1.5 border-t border-slate-200 font-bold">
                <span className="font-sans">Immediate Cash/Bank Refund Received:</span>
                <strong className="font-black text-sm">Rs. {formatMoney(upfrontCollected)}</strong>
              </div>
            )}

            <div className="flex justify-between items-center text-emerald-900 pt-2 border-t-2 border-slate-300">
              <span className="font-sans font-black">Net Debit Applied to Vendor Ledger:</span>
              <strong className="font-black text-base text-emerald-900">Rs. {formatMoney(creditAppliedToLedger)}</strong>
            </div>
            <p className="text-[10px] text-slate-500 font-sans italic pt-1">
              * This amount has been credited to your supplier balance and deducted from open purchase bills in chronological FIFO order.
            </p>
          </div>
        </div>

        {/* ── 5. VERIFICATION SIGNATURES FOOTER ── */}
        <div className="grid grid-cols-4 gap-4 pt-10 mt-6 border-t-2 border-slate-300 text-center text-xs">
          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Warehouse Dispatcher
            </div>
            <span className="text-[10px] text-slate-500">(Goods Inspected & Loaded)</span>
          </div>

          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Driver / Transport Carrier
            </div>
            <span className="text-[10px] text-slate-500">(Cargo Received for Handover)</span>
          </div>

          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Vendor / Factory Receiving
            </div>
            <span className="text-[10px] text-slate-500">(Goods Accepted & Acknowledged)</span>
          </div>

          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Accounts Executive
            </div>
            <span className="text-[10px] text-slate-500">(Ledger Credit Audited)</span>
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-400 font-mono mt-8 pt-3 border-t border-slate-200">
          This is an official computer-generated Vendor Debit Note & Return Gate Pass generated by AL MUHAMMADI ERP.
        </div>

      </div>
    </div>
  );
};

export default PrintPurchaseReturn;
