import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { FiPrinter, FiArrowLeft, FiPhone, FiMapPin } from 'react-icons/fi';

interface ReturnItem {
  itemName?: string;
  product_name?: string;
  skuCode?: string;
  item_sr_no?: string;
  qty?: number;
  quantity?: number;
  returnedQty?: number;
  returned_qty?: number;
  rate?: number;
  rp?: number;
  sale_price?: number;
  price?: number;
  lineTotal?: number;
  warehouse?: string;
  uom?: string;
}

interface ReturnData {
  id: number;
  return_no?: string;
  original_invoice_no?: string;
  invoice_no?: string;
  customer_name: string;
  salesman?: string;
  return_date?: string;
  settlement_mode?: string;
  payment_term?: string;
  source_warehouse?: string;
  warehouse_name?: string;
  total_quantity?: number;
  total_amount?: number;
  payout_amount_paid?: number;
  amount_paid?: number;
  cash_amount_paid?: number;
  bank_amount_paid?: number;
  status?: string;
  remarks?: string;
  notes?: string;
  metadata?: any;
  items: ReturnItem[];
  created_at: string;
}

const PrintSalesReturn: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [returnData, setReturnData] = useState<ReturnData | null>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [productsCatalog, setProductsCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReturnRecord = async () => {
      try {
        setLoading(true);
        const [returnRes, prodsRes] = await Promise.all([
          supabase.from('sales_returns').select('*').eq('id', id).single(),
          supabase.from('products').select('id, product_name, item_sr_no, category, uom, pieces_per_box, pcs_per_box, pieces_per_packing, product_description, scenario_name, retail_price, sales_price')
        ]);

        if (returnRes.error) throw returnRes.error;
        const retData = returnRes.data;
        const prods = prodsRes.data || [];

        setReturnData(retData);
        setProductsCatalog(prods);

        // Fetch customer info
        const cName = retData?.customer_name;
        if (cName && cName.toLowerCase() !== 'walk-in') {
          const { data: cData } = await supabase
            .from('customers')
            .select('*')
            .or(`customerName.ilike.${cName},company.ilike.${cName}`)
            .maybeSingle();
          if (cData) setCustomerInfo(cData);
        }
      } catch (err: any) {
        toast.error('Failed to load sales return record: ' + err.message);
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
    return <div className="text-center py-20 text-gray-500 font-bold">Sales return record not found.</div>;
  }

  const rawItems = Array.isArray(returnData.items)
    ? returnData.items
    : JSON.parse((returnData.items as any) || '[]');

  let computedTotalGross = 0;
  let computedTotalBoxes = 0;
  let computedTotalLoosePcs = 0;
  let computedTotalSqm = 0;
  let hasTileItems = false;

  const processedItems = rawItems.map((item, idx) => {
    const itemSku = (item.skuCode || item.sku || item.item_sr_no || '').trim();
    const pName = (item.itemName ?? item.product_name ?? 'Item').trim();

    const prodMeta = productsCatalog.find(p => 
      (p.product_name || '').trim().toLowerCase() === pName.toLowerCase() || 
      (itemSku && ((p.item_sr_no || '').toLowerCase() === itemSku.toLowerCase() || `sku-${p.id}`.toLowerCase() === itemSku.toLowerCase()))
    );

    const rawPcs = Number(
      item.pcsPerBox || 
      item.pcs_per_box || 
      prodMeta?.pieces_per_box || 
      prodMeta?.pcs_per_box || 
      prodMeta?.pieces_per_packing || 
      0
    );

    const isTile = Boolean(
      prodMeta && (
        String(prodMeta.category || '').toLowerCase().includes('tile') ||
        String(prodMeta.scenario_name || '').toLowerCase().includes('tile')
      ) && (rawPcs > 1 || String(prodMeta.scenario_name || '').toLowerCase().includes('tile'))
    );

    if (isTile) hasTileItems = true;

    const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);

    const qty = Number(item.qty ?? item.returnedQty ?? item.quantity ?? item.returned_qty ?? 0);
    const rate = Number(item.rate ?? item.rp ?? item.sale_price ?? item.price ?? prodMeta?.retail_price ?? prodMeta?.sales_price ?? 0);
    const lineTotal = Number(item.lineTotal ?? item.total ?? (rate * qty));
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
      const desc = prodMeta?.product_description || prodMeta?.product_name || pName || '';
      const sku = prodMeta?.item_sr_no || itemSku || '';
      const sizeMatch = desc.match(/Size:\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm/i) ||
                        desc.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i) ||
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
    } else if (prodMeta?.uom || item.uom) {
      qtyDisplay = `${qty} ${item.uom || prodMeta?.uom || 'Nos'}`;
    }

    return {
      pName,
      sku: itemSku || prodMeta?.item_sr_no || `SKU-${idx + 1}`,
      warehouse: item.warehouse || returnData.source_warehouse || returnData.warehouse_name || 'Main Warehouse',
      uom: item.uom || prodMeta?.uom || (isTile ? 'BOX' : 'Nos'),
      qty,
      qtyDisplay,
      rate,
      lineTotal,
      isTile,
      totalLineSqm
    };
  });

  const grandTotal = Number(returnData.total_amount || computedTotalGross);
  const upfrontDisbursed = Number(returnData.amount_paid || returnData.payout_amount_paid || returnData.cash_amount_paid || 0) + Number(returnData.bank_amount_paid || 0);

  const rawOrigInvStr = String(returnData.original_invoice_no || returnData.invoice_no || '').trim();
  const displayOrigInvNo = rawOrigInvStr.toUpperCase().startsWith('INV-')
    ? rawOrigInvStr
    : (rawOrigInvStr ? `INV-${rawOrigInvStr.padStart(4, '0')}` : 'FIFO General Return');

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
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales-Return/Debit-Notes/List`)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            <FiArrowLeft size={14} /> Back to Return Registry
          </button>
          <span className="text-slate-400 text-xs hidden sm:inline">|</span>
          <span className="text-xs font-mono font-bold text-emerald-400">{returnNoFormatted}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition cursor-pointer"
          >
            <FiPrinter size={16} /> Print Return Voucher (Ctrl + P)
          </button>
        </div>
      </div>

      {/* ── PRINTABLE VOUCHER CONTAINER ─────────────────────────────────────── */}
      <div className="print-container bg-white border border-slate-200 rounded-xl p-6 md:p-8 shadow-sm">
        
        {/* HEADER SECTION */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 uppercase">
              AL MUHAMMADI
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-0.5">
              Enterprise Sales Return & Credit Adjustment Note
            </p>
            <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-600 font-medium">
              <span className="flex items-center gap-1"><FiMapPin className="text-emerald-600" /> Main Showroom & Warehouse</span>
              <span className="flex items-center gap-1"><FiPhone className="text-emerald-600" /> +92 300 1234567</span>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-block bg-emerald-600 text-white font-black text-xs uppercase px-3 py-1 rounded tracking-wider mb-1">
              SALES RETURN / CREDIT NOTE
            </div>
            <div className="font-mono text-base font-black text-slate-900">
              {returnNoFormatted}
            </div>
            <div className="text-xs font-bold text-slate-600">
              Date: <span className="text-slate-900">{returnDateFormatted}</span>
            </div>
          </div>
        </div>

        {/* CUSTOMER & RETURN AUDIT PROFILE */}
        <div className="grid grid-cols-2 gap-6 bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6 text-xs">
          <div>
            <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider block mb-1">
              Customer Account:
            </span>
            <div className="font-bold text-sm text-slate-900">
              {returnData.customer_name}
            </div>
            {customerInfo && (
              <div className="text-slate-600 space-y-0.5 mt-1 text-[11px]">
                {customerInfo.phone && <div>Phone: {customerInfo.phone}</div>}
                {customerInfo.address && <div>Address: {customerInfo.address}</div>}
              </div>
            )}
          </div>

          <div className="text-right space-y-1">
            <div>
              <span className="text-slate-600 font-bold uppercase text-[10px] mr-1">Linked Invoice:</span>
              <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {displayOrigInvNo}
              </span>
            </div>
            <div>
              <span className="text-slate-600 font-bold uppercase text-[10px] mr-1">Settlement Method:</span>
              <span className="font-bold text-emerald-800">
                {(() => {
                  const mode = returnData.settlement_mode || returnData.payment_term || '';
                  if (mode.toLowerCase().includes('cash')) return '💵 Cash Refund Payout';
                  if (mode.toLowerCase().includes('bank')) return '🏦 Bank Wire Refund';
                  if (mode.toLowerCase().includes('split')) return '💳 Split (Cash + Bank)';
                  return '📄 On Credit (Adjusted Against Ledger)';
                })()}
              </span>
            </div>
          </div>
        </div>

        {/* RETURNED ITEMS TABLE */}
        <table className="w-full border border-slate-300 text-xs mb-6">
          <thead>
            <tr className="print-table-header bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider text-center">
              <th className="p-2 border border-slate-700 w-10 text-center">S#</th>
              <th className="p-2 border border-slate-700 w-24 text-left">Code</th>
              <th className="p-2 border border-slate-700 text-left min-w-[180px]">Product Description</th>
              <th className="p-2 border border-slate-700 w-28 text-left">Warehouse</th>
              <th className="p-2 border border-slate-700 w-24 text-right">Sale Price</th>
              <th className="p-2 border border-slate-700 w-28 text-center">Returned Qty</th>
              <th className="p-2 border border-slate-700 w-28 text-right pr-3">Net Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {processedItems.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50 text-slate-800 font-medium">
                <td className="p-2 border border-slate-300 text-center font-mono font-bold text-slate-500">
                  {idx + 1}
                </td>
                <td className="p-2 border border-slate-300 font-mono font-bold text-emerald-700 whitespace-nowrap">
                  {item.sku}
                </td>
                <td className="p-2 border border-slate-300 font-bold text-slate-900">
                  <div className="font-bold">{item.pName}</div>
                  {item.isTile && item.totalLineSqm > 0 && (
                    <div className="text-[10px] font-mono text-teal-700 font-normal">
                      Area: {item.totalLineSqm.toFixed(2)} sq.m
                    </div>
                  )}
                </td>
                <td className="p-2 border border-slate-300 text-slate-600">
                  {item.warehouse}
                </td>
                <td className="p-2 border border-slate-300 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                  Rs. {formatMoney(item.rate)}
                </td>
                <td className="p-2 border border-slate-300 text-center font-mono font-black text-rose-600 bg-rose-50/40 whitespace-nowrap">
                  {item.qtyDisplay}
                </td>
                <td className="p-2 border border-slate-300 text-right font-mono font-black text-slate-900 pr-3 whitespace-nowrap">
                  Rs. {formatMoney(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* FINANCIAL SUMMARY & SIGNATURES */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          <div className="md:col-span-7 space-y-3">
            {/* Amount In Words */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <span className="text-[10px] font-black uppercase text-slate-600 block">Total Credit In Words:</span>
              <span className="font-bold text-slate-900 italic capitalize">{amountInWords}</span>
            </div>

            {/* Notes / Reason */}
            {returnData.remarks && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <span className="text-[10px] font-black uppercase text-slate-600 block">Return Notes / Reason:</span>
                <span className="text-slate-800">{returnData.remarks}</span>
              </div>
            )}
          </div>

          {/* Right Totals Card */}
          <div className="md:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
            <div className="flex justify-between items-center text-slate-600">
              <span>Total Return Line Items:</span>
              <span className="font-bold font-mono text-slate-900">{processedItems.length} Item(s)</span>
            </div>
            {hasTileItems && (
              <div className="flex justify-between items-center text-teal-700 font-semibold">
                <span>Total Tile Volume:</span>
                <span className="font-mono font-bold">{computedTotalBoxes} Box + {computedTotalLoosePcs} Pcs ({computedTotalSqm.toFixed(2)} sq.m)</span>
              </div>
            )}
            <div className="flex justify-between items-center text-slate-700 font-bold border-t border-slate-200 pt-1.5">
              <span>Gross Reverted Value:</span>
              <span className="font-mono text-sm">Rs. {formatMoney(grandTotal)}</span>
            </div>
            {upfrontDisbursed > 0 && (
              <div className="flex justify-between items-center text-emerald-700 font-bold">
                <span>Upfront Refund Disbursed:</span>
                <span className="font-mono">- Rs. {formatMoney(upfrontDisbursed)}</span>
              </div>
            )}
            <div className="flex justify-between items-center bg-emerald-700 text-white font-black p-2.5 rounded-lg text-sm uppercase tracking-wide mt-2">
              <span>Total Credit Adjusted:</span>
              <span className="font-mono">Rs. {formatMoney(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* SIGNATURE SECTION */}
        <div className="grid grid-cols-2 gap-12 pt-16 mt-6 text-center text-xs font-bold text-slate-600">
          <div>
            <div className="border-t-2 border-slate-400 pt-2 w-48 mx-auto">
              Authorized Signature
            </div>
            <span className="text-[10px] text-slate-400 font-normal block mt-0.5">AL MUHAMMADI</span>
          </div>
          <div>
            <div className="border-t-2 border-slate-400 pt-2 w-48 mx-auto">
              Customer Acknowledgment
            </div>
            <span className="text-[10px] text-slate-400 font-normal block mt-0.5">{returnData.customer_name}</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PrintSalesReturn;
