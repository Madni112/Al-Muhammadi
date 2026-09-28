import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { FiPrinter, FiArrowLeft, FiPhone, FiMapPin, FiCheckCircle } from 'react-icons/fi';

interface InvoiceItem {
  itemName?: string;
  product_name?: string;
  skuCode?: string;
  qty?: number;
  quantity?: number;
  rp?: number;
  mrp?: number;
  rate?: number;
  price?: number;
  gstRate?: number;
  gst_rate?: number;
  fTaxPer?: number;
  f_tax_per?: number;
  discountPer?: number;
  discountAmt?: number;
  discount?: number;
  location?: string;
}

interface InvoiceData {
  id: number;
  invoice_no?: string;
  customer_name: string;
  salesman?: string;
  sale_date?: string;
  payment_term?: string;
  dispatch_warehouse?: string;
  transport_name?: string;
  transport_charges?: number;
  selected_bank?: string;
  bank_amount?: number;
  cash_amount_paid?: number;
  total_amount?: number;
  total_gst_amount?: number;
  total_net_amount?: number;
  receipt_status?: string;
  scenario_type?: string;
  dc_no?: string;
  quotation_id?: string;
  remarks?: string;
  seller_name?: string;
  seller_address?: string;
  seller_ntn?: string;
  items: InvoiceItem[];
  created_at: string;
}

const PrintInvoice = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [productsCatalog, setProductsCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoiceData = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('sales_invoices')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        setInvoice(data);

        // Fetch products to know tile packings & units
        const { data: prods } = await supabase
          .from('products')
          .select('product_name, item_sr_no, category, uom, pieces_per_box, pcs_per_box, pieces_per_packing, product_description');
        if (prods) setProductsCatalog(prods);

        // Fetch customer info dynamically
        if (data.customer_name) {
          const { data: custData } = await supabase
            .from('customers')
            .select('ntnNo, cnicNo, primaryPhone, address, company')
            .eq('customerName', data.customer_name)
            .maybeSingle();
          if (custData) {
            setCustomerInfo(custData);
          }
        }
      } catch (err: any) {
        toast.error('Failed to load invoice: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoiceData();
  }, [id]);

  if (loading) return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
  if (!invoice) return <div className="text-center py-20 text-gray-500 font-bold">Invoice record not found.</div>;

  // ── Compute line items ──────────────────────────────────────────────────────
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  let computedTotalGross = 0;
  let computedTotalDiscount = 0;
  let computedTotalGst = 0;
  let computedTotalFTax = 0;
  let computedTotalNet = 0;

  const processedItems = items.map((item) => {
    const pName = item.itemName ?? item.product_name ?? 'N/A';
    const prodMeta = productsCatalog.find(p => p.product_name === pName);

    const rawPcs = Number(prodMeta?.pieces_per_box || prodMeta?.pcs_per_box || prodMeta?.pieces_per_packing || 0);
    const isTile = Boolean(
      prodMeta && (
        String(prodMeta.category || '').toLowerCase().includes('tile') ||
        String(prodMeta.scenario_name || '').toLowerCase().includes('tile')
      ) && (rawPcs > 1 || String(prodMeta.scenario_name || '').toLowerCase().includes('tile'))
    );
    const pcsPerBox = rawPcs > 1 ? rawPcs : (isTile ? 4 : 1);

    const qty = Number(item.qty ?? item.quantity ?? 0);
    const rate = Number(item.rp ?? item.mrp ?? item.rate ?? item.price ?? 0);
    const grossAmount = rate * qty;

    const discountPer = Number(item.discountPer ?? item.discount ?? 0);
    const discountAmt = Number(item.discountAmt ?? ((grossAmount * discountPer) / 100));
    const afterDiscount = Math.max(0, grossAmount - discountAmt);

    const gstRate = Number(item.gstRate ?? item.gst_rate ?? 0);
    const fTaxPer = Number(item.fTaxPer ?? item.f_tax_per ?? 0);
    const gstAmount = (afterDiscount * gstRate) / 100;
    const fTaxAmount = (afterDiscount * fTaxPer) / 100;
    const netTotal = afterDiscount + gstAmount + fTaxAmount;

    // Quantity display string and Sq.Mtr calculations (e.g. 5 Boxes + 5 Pcs | Total: 7.20 sq.m)
    let qtyDisplay = `${qty}`;
    let perBoxSqm = 0;
    let perPieceSqm = 0;
    let totalLineSqm = 0;

    if (isTile) {
      const boxes = Math.floor(qty);
      const loose = Math.round((qty - boxes) * pcsPerBox);

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
      qtyDisplay = `${qty} ${item.uom || prodMeta?.uom || 'Nos'}`;
    }

    computedTotalGross += grossAmount;
    computedTotalDiscount += discountAmt;
    computedTotalGst += gstAmount;
    computedTotalFTax += fTaxAmount;
    computedTotalNet += netTotal;

    return {
      pName,
      skuCode: item.skuCode || prodMeta?.item_sr_no || '-',
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
      fTaxPer,
      fTaxAmount,
      netTotal
    };
  });

  const freightCharges = Number(invoice.transport_charges || 0);
  const additionalCharges = Number(invoice.additional_charges || 0);
  const grandTotal = computedTotalNet + freightCharges + additionalCharges;
  const cashPaid = Number(invoice.cash_amount_paid || 0);
  const bankPaid = Number(invoice.bank_amount || 0);
  const totalPaid = (cashPaid > 0 && bankPaid > 0) ? (cashPaid + bankPaid) : (cashPaid > 0 ? cashPaid : (bankPaid > 0 ? bankPaid : Number(invoice.cash_amount_paid || invoice.bank_amount || 0)));
  const remainingDebt = Math.max(0, grandTotal - totalPaid);

  const invoiceNo = invoice.invoice_no || `INV-${String(invoice.id).padStart(4, '0')}`;
  const saleDateFormatted = invoice.sale_date 
    ? new Date(invoice.sale_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date(invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

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
    <div className="mx-auto max-w-4xl p-2 sm:p-4 md:p-6 bg-white text-slate-900 font-sans min-h-screen relative print:p-0 print:m-0 print:max-w-full">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 14mm;
          }
          aside, nav, header, .no-print, button {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
          }
          body {
            background: white !important;
            color: #0f172a !important;
            font-size: 10.5px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-card {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          table {
            width: 100% !important;
            table-layout: fixed !important;
          }
          th {
            background-color: #0f172a !important;
            color: white !important;
          }
        }
      `}</style>

      {/* ── No-print toolbar ─────────────────────────────────────────────── */}
      <div className="no-print flex justify-between items-center mb-6 bg-slate-900 text-white p-4 rounded-xl shadow-md">
        <button
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/sales/invoice/list`)}
          className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer"
        >
          <FiArrowLeft size={16} /> Back to Invoices List
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 py-2 px-5 text-xs font-bold text-white transition shadow-sm cursor-pointer"
        >
          <FiPrinter size={16} /> Print Commercial Invoice
        </button>
      </div>

      {/* ── Printable Invoice Document ─────────────────────────────────────────────── */}
      <div className="print-card border border-slate-300 rounded-2xl p-5 sm:p-7 bg-white shadow-sm print:border-none print:p-0 print:shadow-none">

        {/* ── Top Header Brand ────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 pb-5 mb-5 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 bg-emerald-600 rounded-sm"></span>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase">
                ZOAIB ALI & COMPANY
              </h1>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase mt-0.5">
              Tiles, Sanitary Ware & Building Material Specialists
            </p>
            <div className="flex items-center gap-4 text-[11px] text-slate-600 mt-2 font-medium">
              <span className="flex items-center gap-1"><FiMapPin size={12} className="text-emerald-600" /> Main Showroom & Warehouse, Pakistan</span>
              <span className="flex items-center gap-1"><FiPhone size={12} className="text-emerald-600" /> 0312-8039911</span>
            </div>
          </div>

          {/* Invoice Voucher Tag */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 min-w-[220px] text-right font-mono">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Commercial Voucher</div>
            <div className="text-xl font-black text-slate-950 tracking-tight">{invoiceNo}</div>
            <div className="text-[11px] text-slate-600 font-sans mt-1">
              Date: <b className="text-slate-900 font-mono">{saleDateFormatted}</b>
            </div>
            <div className="mt-1">
              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${invoice.payment_term === 'Cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                Payment Mode: {invoice.payment_term || 'Cash'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Client & Dispatch Details ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Customer Profile Box */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 text-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
              <FiCheckCircle className="text-emerald-600" /> Billed Customer Profile
            </div>
            <div className="font-bold text-slate-900 text-sm">{invoice.customer_name}</div>
            {customerInfo?.company && (
              <div className="text-slate-600 text-[11px]">{customerInfo.company}</div>
            )}
            <div className="mt-1 text-slate-600 text-[11px]">
              Phone / Contact: <b className="text-slate-800 font-mono">{customerInfo?.primaryPhone || 'Walk-in Customer'}</b>
            </div>
            {customerInfo?.address && (
              <div className="text-slate-500 text-[11px]">Address: {customerInfo.address}</div>
            )}
          </div>

          {/* Logistics & Dispatch Box */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 text-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Dispatch & Representative
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500 block">Warehouse Bin:</span>
                <b className="text-slate-900">{invoice.dispatch_warehouse || 'Main Warehouse'}</b>
              </div>
              <div>
                <span className="text-slate-500 block">Sales Officer:</span>
                <b className="text-slate-900">{invoice.salesman || 'Direct Counter'}</b>
              </div>
              <div>
                <span className="text-slate-500 block">Transport Carrier:</span>
                <b className="text-slate-900">{invoice.transport_name || 'Customer Transport'}</b>
              </div>
              <div>
                <span className="text-slate-500 block">Delivery Challan:</span>
                <b className="text-slate-900 font-mono">{invoice.dc_no || 'Direct Dispatch'}</b>
              </div>
            </div>
          </div>
        </div>

        {/* ── Line Items Table ───────────────────────────────────────────────── */}
        <div className="border border-slate-200 rounded-xl overflow-hidden mb-5">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                <th className="py-2.5 px-2 w-[4%] text-center">S#</th>
                <th className="py-2.5 px-2 w-[14%] font-mono">SKU</th>
                <th className="py-2.5 px-2 w-[28%]">Item Description</th>
                <th className="py-2.5 px-2 text-center w-[18%]">Quantity</th>
                <th className="py-2.5 px-2 text-right w-[14%]">Unit Rate</th>
                {computedTotalDiscount > 0 && (
                  <th className="py-2.5 px-2 text-right w-[10%] text-amber-300">Discount</th>
                )}
                {computedTotalGst > 0 && (
                  <th className="py-2.5 px-2 text-right w-[10%] text-emerald-300">GST (18%)</th>
                )}
                <th className="py-2.5 px-2 text-right pr-2 w-[16%] font-black">Net Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-[10.5px]">
              {processedItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-2 px-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                  <td className="py-2 px-2 font-mono font-bold text-slate-700 break-all">{item.skuCode}</td>
                  <td className="py-2 px-2 break-words">
                    <span className="font-bold text-slate-900 block leading-tight">{item.pName}</span>
                  </td>
                  <td className="py-2 px-2 text-center bg-slate-50/40">
                    <div className="font-mono font-black text-slate-900 text-[11px]">{item.qtyDisplay}</div>
                    {item.isTile && item.totalLineSqm > 0 && (
                      <div className="mt-0.5 space-y-0.5 font-mono">
                        <div className="text-[9px] text-teal-800 font-bold bg-teal-50 px-1 py-0.2 rounded border border-teal-200/60 inline-block">
                          {item.totalLineSqm.toFixed(2)} sq.m
                        </div>
                        <div className="text-[8px] text-slate-400">
                          (Box: {item.perBoxSqm.toFixed(2)}m² | Pc: {item.perPieceSqm.toFixed(3)}m²)
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                    Rs. {item.rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  {computedTotalDiscount > 0 && (
                    <td className="py-2 px-2 text-right font-mono text-amber-700 whitespace-nowrap">
                      {item.discountAmt > 0 ? `Rs. ${item.discountAmt.toLocaleString()}` : '-'}
                    </td>
                  )}
                  {computedTotalGst > 0 && (
                    <td className="py-2 px-2 text-right font-mono text-emerald-700 whitespace-nowrap">
                      {item.gstAmount > 0 ? `Rs. ${item.gstAmount.toLocaleString()}` : '-'}
                    </td>
                  )}
                  <td className="py-2 px-2 text-right pr-2 font-mono font-black text-slate-950 whitespace-nowrap">
                    Rs. {item.netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Summary & Settlement Breakdown ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Amount in words */}
          <div className="flex flex-col justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Amount Chargeable (in words):
              </span>
              <span className="font-bold text-slate-900 italic leading-relaxed">
                {amountInWords}
              </span>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-500 space-y-1">
              <div>
                • Payment Received Via:{' '}
                <b>
                  {cashPaid > 0 && bankPaid > 0
                    ? `Split Payment (Cash: Rs. ${cashPaid.toLocaleString()} + Bank: Rs. ${bankPaid.toLocaleString()}${invoice.selected_bank ? ` via ${invoice.selected_bank}` : ''})`
                    : invoice.selected_bank || bankPaid > 0
                    ? `Bank Online (${invoice.selected_bank || 'Direct Wire'})`
                    : 'Counter Cash'}
                </b>
              </div>
              <div>• Status: <b>{invoice.receipt_status || (remainingDebt <= 0 ? 'Full Paid' : 'Credit Balance')}</b></div>
            </div>
          </div>

          {/* Numeric Settlement Totals */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Gross Product Total:</span>
              <span className="font-bold text-slate-900">Rs. {computedTotalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {computedTotalDiscount > 0 && (
              <div className="flex justify-between text-amber-700 font-semibold">
                <span>Total Discount Allowed:</span>
                <span>- Rs. {computedTotalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            {freightCharges > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Freight / Delivery Charges:</span>
                <span className="font-bold text-slate-900">Rs. {freightCharges.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            {additionalCharges > 0 && (
              <div className="flex justify-between text-blue-700">
                <span>Freight Charges:</span>
                <span className="font-bold text-blue-900">Rs. {additionalCharges.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            {computedTotalGst > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Sales Tax (GST / FBR):</span>
                <span>Rs. {computedTotalGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className="flex justify-between border-t border-b py-1.5 border-slate-300 text-sm font-black text-slate-950">
              <span className="font-sans">Grand Invoice Total:</span>
              <span>Rs. {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {cashPaid > 0 && bankPaid > 0 ? (
              <>
                <div className="flex justify-between text-emerald-700 font-semibold pt-1">
                  <span>Received Cash:</span>
                  <span>Rs. {cashPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-primary font-semibold">
                  <span>Received Bank Wire:</span>
                  <span>Rs. {bankPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-black border-t border-slate-200 pt-1">
                  <span>Total Paid:</span>
                  <span>Rs. {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-emerald-700 font-bold pt-1">
                <span>Received Payment:</span>
                <span>Rs. {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className="flex justify-between pt-1 border-t border-slate-200 font-black">
              <span className="font-sans text-[11px]">Unpaid Remaining Balance:</span>
              <span className={`text-xs ${remainingDebt > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'}`}>
                Rs. {remainingDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* ── Signatures & Authorization ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-6 pt-28 mt-12 border-t border-slate-200 text-center text-[11px] font-bold text-slate-600">
          <div className="flex flex-col items-center">
            <div className="border-t-2 border-dashed border-slate-400 w-48 mb-3.5"></div>
            <span>Prepared By</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="border-t-2 border-dashed border-slate-400 w-48 mb-3.5"></div>
            <span>Customer Signature & Stamp</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="border-t-2 border-dashed border-slate-400 w-48 mb-3.5"></div>
            <span>Authorized Signature</span>
          </div>
        </div>

        {/* ── Bottom Terms Note ──────────────────────────────────────────────── */}
        <div className="mt-12 pt-4 border-t border-slate-100 text-center text-[10px] text-slate-400 font-medium">
          Computer generated official commercial sales bill • Goods once sold are subject to company return policies.
        </div>

      </div>
    </div>
  );
};

export default PrintInvoice;

