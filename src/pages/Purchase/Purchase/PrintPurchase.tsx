import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { FiPrinter, FiArrowLeft, FiPhone, FiMapPin, FiCheckCircle } from 'react-icons/fi';

interface PurchaseItem {
  itemName?: string;
  product_name?: string;
  skuCode?: string;
  item_sr_no?: string;
  qty?: number;
  quantity?: number;
  rate?: number;
  cost_price?: number;
  discountPer?: number;
  discountAmt?: number;
  gstRate?: number;
  gstAmt?: number;
  warehouse?: string;
}

interface PurchaseData {
  id: number;
  purchase_no: string;
  supplier_name?: string;
  vendor_name?: string;
  target_warehouse?: string;
  purchase_date?: string;
  purchase_type?: string;
  payment_term?: string;
  amount_paid?: number;
  cash_amount_paid?: number;
  bank_amount_paid?: number;
  selected_bank_title?: string;
  total_amount?: number;
  remaining_balance?: number;
  remarks?: string;
  notes?: string;
  items: PurchaseItem[];
  metadata?: any;
  created_at: string;
}

const PrintPurchase = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [purchase, setPurchase] = useState<PurchaseData | null>(null);
  const [vendorInfo, setVendorInfo] = useState<any>(null);
  const [productsCatalog, setProductsCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPurchaseData = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('supplier_purchases')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setPurchase(data);

        // Fetch products to know tile packings & units
        const { data: prods } = await supabase
          .from('products')
          .select('product_name, item_sr_no, category, uom, pieces_per_box, pcs_per_box, pieces_per_packing, product_description, scenario_name');
        if (prods) setProductsCatalog(prods);

        // Fetch vendor info dynamically
        const vName = data.supplier_name || data.vendor_name;
        if (vName) {
          const { data: vData } = await supabase
            .from('vendors')
            .select('*')
            .or(`vendor_name.ilike.${vName},name.ilike.${vName}`)
            .maybeSingle();
          if (vData) {
            setVendorInfo(vData);
          }
        }
      } catch (err: any) {
        toast.error('Failed to load purchase record: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPurchaseData();
  }, [id]);

  if (loading) return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
  if (!purchase) return <div className="text-center py-20 text-gray-500 font-bold">Purchase record not found.</div>;

  // ── Compute line items ──────────────────────────────────────────────────────
  const rawItems = Array.isArray(purchase.items) ? purchase.items : [];

  let computedTotalGross = 0;
  let computedTotalDiscount = 0;
  let computedTotalGst = 0;
  let computedTotalNet = 0;
  let computedTotalSqm = 0;
  let computedTotalBoxes = 0;
  let computedTotalLoosePcs = 0;
  let hasTileItems = false;

  const processedItems = rawItems.map((item) => {
    const pName = item.itemName ?? item.product_name ?? 'N/A';
    const prodMeta = productsCatalog.find(p => 
      p.product_name === pName || 
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
    const grossAmount = rate * qty;

    const discountPer = Number(item.discountPer ?? 0);
    const discountAmt = Number(item.discountAmt ?? ((grossAmount * discountPer) / 100));
    const afterDiscount = Math.max(0, grossAmount - discountAmt);

    const gstRate = Number(item.gstRate ?? 0);
    const gstAmount = Number(item.gstAmt ?? ((afterDiscount * gstRate) / 100));
    const netTotal = afterDiscount + gstAmount;

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

    computedTotalGross += grossAmount;
    computedTotalDiscount += discountAmt;
    computedTotalGst += gstAmount;
    computedTotalNet += netTotal;

    return {
      pName,
      skuCode: item.skuCode || prodMeta?.item_sr_no || '-',
      warehouse: item.warehouse || purchase.target_warehouse || 'Main Warehouse',
      qty,
      qtyDisplay,
      isTile,
      perBoxSqm,
      perPieceSqm,
      totalLineSqm,
      rate,
      grossAmount,
      discountPer,
      discountAmt,
      gstRate,
      gstAmount,
      netTotal
    };
  });

  const computedTotalSqFt = computedTotalSqm * 10.7639;
  const additionalCharges = Number(purchase.additional_charges || 0);
  const grandTotal = (computedTotalNet > 0 ? computedTotalNet : Number(purchase.total_amount || 0)) + additionalCharges;
  const cashPaid = Number(purchase.cash_amount_paid || 0);
  const bankPaid = Number(purchase.bank_amount_paid || 0);
  const totalPaid = (cashPaid > 0 || bankPaid > 0) ? (cashPaid + bankPaid) : Number(purchase.amount_paid || 0);
  const remainingPayable = Math.max(0, grandTotal - totalPaid);

  const purchaseNoFormatted = purchase.purchase_no || `PUR-${String(purchase.id).padStart(4, '0')}`;
  const purchaseDateFormatted = purchase.purchase_date 
    ? new Date(purchase.purchase_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date(purchase.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // ── Currency / Number Formatter (Hide .00 if whole number, show decimals if fractional) ──
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

  // ── Number to Words Helper ───────────────────────────────────────────────
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
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchases/List`)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition cursor-pointer"
          >
            <FiArrowLeft size={14} /> Back to Purchases List
          </button>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Inbound Purchase Consignment Voucher</h1>
            <p className="text-[11px] text-slate-400 font-mono">PO Ref: {purchaseNoFormatted}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2.5 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg shadow-md transition cursor-pointer"
        >
          <FiPrinter size={16} /> Print Purchase Note
        </button>
      </div>

      {/* ── PRINTABLE DOCUMENT CONTAINER (Full A4 Width) ──────────────────────── */}
      <div className="print-container bg-white p-6 sm:p-8 border border-slate-200 rounded-xl shadow-xs print:border-none print:p-0 print:shadow-none">
        
        {/* ── 1. CORPORATE EXECUTIVE HEADER ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 pb-5 mb-5 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-700 text-white font-black flex items-center justify-center text-base shadow-sm">Z</span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 uppercase">ZOAIB ALI & COMPANY</h2>
            </div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">Wholesale Tile & Sanitary Procurement Hub</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 mt-2 font-medium">
              <span className="flex items-center gap-1.5"><FiMapPin className="text-emerald-700" size={13} /> Main Showroom & Warehouse Yard, Pakistan</span>
              <span className="flex items-center gap-1.5"><FiPhone className="text-emerald-700" size={13} /> Hotline: 0312-8039911</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 min-w-[230px] text-right font-mono">
            <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Official Consignment Note</div>
            <div className="text-lg sm:text-xl font-black text-slate-950 tracking-tight mt-0.5">{purchaseNoFormatted}</div>
            <div className="text-xs text-slate-600 font-sans mt-1">
              Inbound Date: <strong className="text-slate-900 font-mono">{purchaseDateFormatted}</strong>
            </div>
            <div className="mt-1.5">
              <span className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                Payment: {purchase.payment_term || 'By Cash'}
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. METADATA CARDS: VENDOR & RECEIVING WAREHOUSE ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Vendor Card */}
          <div className="bg-slate-50/80 border border-slate-300 rounded-xl p-4 text-xs">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FiCheckCircle className="text-emerald-700" size={13} /> Supplying Factory / Wholesale Vendor
            </div>
            <h3 className="font-black text-slate-900 text-sm">{purchase.supplier_name || purchase.vendor_name || 'General Factory Vendor'}</h3>
            {vendorInfo?.contact_name && (
              <p className="text-slate-700 mt-1"><strong className="text-slate-900">Contact:</strong> {vendorInfo.contact_name}</p>
            )}
            {(vendorInfo?.cell_no || vendorInfo?.phone_no || vendorInfo?.phone) && (
              <p className="text-slate-700 mt-0.5 font-mono"><strong className="text-slate-900">Phone:</strong> {vendorInfo.cell_no || vendorInfo.phone_no || vendorInfo.phone}</p>
            )}
            {vendorInfo?.address && (
              <p className="text-slate-600 mt-0.5"><strong className="text-slate-900">Address:</strong> {vendorInfo.address} {vendorInfo?.city ? `(${vendorInfo.city})` : ''}</p>
            )}
          </div>

          {/* Inward Details Card */}
          <div className="bg-slate-50/80 border border-slate-300 rounded-xl p-4 text-xs">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Receiving Coordinates & Status
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Destination Warehouse:</span>
                <strong className="text-slate-950 font-bold">{purchase.target_warehouse || 'Main Warehouse'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Consignment Status:</span>
                <strong className="text-emerald-800 font-bold inline-flex items-center gap-1">
                  <FiCheckCircle size={12} className="text-emerald-700" /> Restocked
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Disbursed From Bank:</span>
                <strong className="text-slate-900 font-mono text-[11px]">{purchase.selected_bank_title || 'Cash Vault'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Settlement Mode:</span>
                <strong className="text-slate-900 font-mono text-[11px]">{purchase.payment_term || 'Cash Only'}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. RECEIVED ITEMS INVENTORY TABLE ── */}
        <div className="border border-slate-300 rounded-xl overflow-hidden mb-5">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white print-table-header text-[10.5px] font-black uppercase tracking-wider">
                <th className="py-2.5 px-3 w-[5%] text-center">S#</th>
                <th className="py-2.5 px-3 w-[14%] font-mono">Code</th>
                <th className="py-2.5 px-3 w-[30%]">Product Description</th>
                <th className="py-2.5 px-3 w-[17%] text-center">Received Qty</th>
                <th className="py-2.5 px-3 w-[16%] text-right">Cost Rate (PKR)</th>
                <th className="py-2.5 px-3 w-[18%] text-right pr-4 font-black">Total (PKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-xs">
              {processedItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.skuCode}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-slate-950 block text-xs">{item.pName}</span>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      {item.isTile && item.perBoxSqm > 0 && (
                        <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">
                          [Tile Metric] 1 Box = {item.perBoxSqm.toFixed(2)} sq.m
                        </span>
                      )}
                      {item.warehouse && item.warehouse !== purchase.target_warehouse && (
                        <span className="text-[10px] text-slate-600 font-medium">
                          • Bin: {item.warehouse}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center bg-slate-50/40">
                    <div className="font-mono font-black text-slate-900 text-xs">{item.qtyDisplay}</div>
                    {item.isTile && item.totalLineSqm > 0 && (
                      <div className="mt-0.5">
                        <span className="text-[9.5px] font-black text-teal-900 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 inline-block font-mono whitespace-nowrap">
                          Total: {item.totalLineSqm.toFixed(2)} sq.m
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                    Rs. {formatMoney(item.rate)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-black text-slate-950 pr-4 whitespace-nowrap">
                    Rs. {formatMoney(item.netTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-900 bg-slate-100 font-bold text-xs print-total-row">
              <tr>
                <td colSpan={3} className="py-2.5 px-3 text-right font-black uppercase text-slate-900 tracking-wider">
                  Consignment Total ({processedItems.length} {processedItems.length === 1 ? 'Item' : 'Items'}):
                </td>
                <td className="py-2.5 px-3 text-center bg-slate-200/70">
                  <div className="font-mono font-black text-slate-950 text-xs">
                    {hasTileItems && computedTotalBoxes > 0
                      ? `${computedTotalBoxes} Box${computedTotalBoxes > 1 ? 'es' : ''}${computedTotalLoosePcs > 0 ? ` + ${computedTotalLoosePcs} Pcs` : ''}`
                      : `${processedItems.reduce((acc, it) => acc + it.qty, 0)} Units`}
                  </div>
                  {computedTotalSqm > 0 && (
                    <div className="mt-1">
                      <span className="text-[10px] font-black text-emerald-950 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-400 inline-block font-mono shadow-xs">
                        Total: {computedTotalSqm.toFixed(2)} sq.m
                      </span>
                    </div>
                  )}
                </td>
                <td colSpan={2} className="py-2.5 px-3 text-right pr-4 bg-slate-200/50">
                  <div className="inline-flex items-baseline justify-end gap-2">
                    <span className="text-slate-600 font-sans text-[11px] font-bold uppercase tracking-wider">Net Total:</span>
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
          {/* Amount in words and notes */}
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Total Amount in Words:</span>
              <p className="font-bold text-slate-900 italic text-xs">{amountInWords}</p>
            </div>

            {/* Consignment Area Metric Badge */}
            {computedTotalSqm > 0 && (
              <div className="p-3.5 rounded-xl bg-teal-50/80 border border-teal-300 text-xs flex items-center justify-between gap-4 sm:gap-6">
                <div className="min-w-0">
                  <span className="text-[10px] font-black text-teal-800 uppercase tracking-wider block">Total Tile Coverage Area:</span>
                  <p className="font-black text-teal-950 text-sm font-mono mt-0.5 whitespace-nowrap">
                    {computedTotalSqm.toFixed(2)} Sq.M <span className="text-xs font-medium text-teal-700">({computedTotalSqFt.toLocaleString(undefined, { maximumFractionDigits: 1 })} Sq.Ft)</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] font-black text-teal-800 uppercase tracking-wider block">TOTAL PACKING:</span>
                  <p className="font-black text-teal-950 text-sm font-mono mt-0.5 whitespace-nowrap">
                    {computedTotalBoxes} Box{computedTotalBoxes !== 1 ? 'es' : ''}
                    {computedTotalLoosePcs > 0 ? ` + ${computedTotalLoosePcs} Pcs` : ''}
                  </p>
                </div>
              </div>
            )}

            {(purchase.remarks || purchase.notes) && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Procurement / Consignment Remarks:</span>
                <p className="text-slate-800 font-medium">{purchase.remarks || purchase.notes}</p>
              </div>
            )}
          </div>

          {/* Payables Summary */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-2 font-mono text-xs">
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-sans font-bold">Gross Total Bill:</span>
              <strong className="font-black text-sm text-slate-950">Rs. {formatMoney(grandTotal - additionalCharges)}</strong>
            </div>

            {additionalCharges > 0 && (
              <div className="flex justify-between items-center text-blue-700 pt-1.5 border-t border-slate-200 font-bold">
                <span className="font-sans text-[11px]">Freight Charges:</span>
                <strong className="font-black text-xs text-blue-950 font-mono">Rs. {formatMoney(additionalCharges)}</strong>
              </div>
            )}
            
            {additionalCharges > 0 && (
               <div className="flex justify-between items-center text-slate-700 pt-1.5 border-t border-slate-200 font-bold">
                 <span className="font-sans text-[11px]">Net Payable Total:</span>
                 <strong className="font-black text-sm text-slate-950 font-mono">Rs. {formatMoney(grandTotal)}</strong>
               </div>
            )}

            {computedTotalSqm > 0 && (
              <div className="flex justify-between items-center text-teal-900 pt-1.5 border-t border-slate-200 font-bold">
                <span className="font-sans text-[11px]">Consignment Tile Area:</span>
                <strong className="font-black text-xs text-teal-950 font-mono">{computedTotalSqm.toFixed(2)} Sq.M</strong>
              </div>
            )}

            <div className="flex justify-between items-center text-emerald-800 pt-1.5 border-t border-slate-200 font-bold">
              <span className="font-sans">Amount Paid Upfront:</span>
              <strong className="font-black text-sm">Rs. {formatMoney(totalPaid)}</strong>
            </div>

            {cashPaid > 0 && bankPaid > 0 && (
              <div className="text-[10px] text-slate-500 flex justify-between px-2">
                <span>(Cash: Rs. {formatMoney(cashPaid)} + Bank: Rs. {formatMoney(bankPaid)})</span>
              </div>
            )}

            <div className="flex justify-between items-center text-rose-700 pt-2 border-t-2 border-slate-300">
              <span className="font-sans font-black">Remaining Vendor Payable:</span>
              <strong className="font-black text-base">Rs. {formatMoney(remainingPayable)}</strong>
            </div>
          </div>
        </div>

        {/* ── 5. VERIFICATION SIGNATURES FOOTER ── */}
        <div className="grid grid-cols-3 gap-8 pt-10 mt-6 border-t-2 border-slate-300 text-center text-xs">
          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Goods Received & Inspected
            </div>
            <span className="text-[10px] text-slate-500">(Storekeeper / Warehouse)</span>
          </div>

          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Accounts Verification
            </div>
            <span className="text-[10px] text-slate-500">(Accountant / Ledger Entry)</span>
          </div>

          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Authorized Signature
            </div>
            <span className="text-[10px] text-slate-500">(Executive Management)</span>
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-400 font-mono mt-8 pt-3 border-t border-slate-200">
          This is an official computer-generated Goods Receiving Note generated by Zoaib Ali & Company ERP.
        </div>

      </div>
    </div>
  );
};

export default PrintPurchase;
