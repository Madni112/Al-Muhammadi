import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { FiPrinter, FiArrowLeft, FiPhone, FiMapPin, FiCheckCircle, FiDollarSign, FiRotateCcw } from 'react-icons/fi';

const PrintPurchaseReturnReceipt: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useAuth();

  const [receipt, setReceipt] = useState<any>(null);
  const [linkedReturn, setLinkedReturn] = useState<any>(null);
  const [vendorInfo, setVendorInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReceiptData = async () => {
      try {
        setLoading(true);
        if (!id) return;

        // 1. Fetch receipt record from purchase_return_receipts
        const { data: recData, error: recError } = await supabase
          .from('purchase_return_receipts')
          .select('*')
          .eq('id', id)
          .single();

        if (recError) throw recError;
        setReceipt(recData);

        // 2. Fetch linked purchase return if available
        if (recData?.return_no) {
          const { data: retData } = await supabase
            .from('purchase_returns')
            .select('*')
            .eq('return_no', recData.return_no)
            .maybeSingle();

          if (retData) setLinkedReturn(retData);
        }

        // 3. Fetch vendor info
        const vName = recData?.vendor_name;
        if (vName) {
          const { data: vData } = await supabase
            .from('vendors')
            .select('*')
            .or(`vendor_name.ilike.${vName},name.ilike.${vName}`)
            .maybeSingle();
          if (vData) setVendorInfo(vData);
        }
      } catch (err: any) {
        toast.error('Error loading purchase return receipt: ' + err.message);
        navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return-Receipt/List`);
      } finally {
        setLoading(false);
      }
    };

    fetchReceiptData();
  }, [id, navigate, tenantId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (!receipt) return null;

  const receiptNo = receipt.receipt_no || `PRR-${receipt.id}`;
  const receiptDate = receipt.payment_date
    ? new Date(receipt.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date(receipt.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const vendorName = receipt.vendor_name || 'General Vendor';
  const amountReceived = Number(receipt.amount_received || 0);
  const meta = receipt.metadata || {};

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

  const isSplit = receipt.payment_method === 'Split' || (meta.cashAmount && meta.bankAmount);
  const isBank = receipt.payment_method === 'By Bank';
  const bankTitle = meta.selectedBankTitle || meta.selectedBankId || '';
  const paymentMethodDisplay = isSplit
    ? `Split Refund (Cash: Rs. ${formatMoney(meta.cashAmount || 0)} + Bank: Rs. ${formatMoney(meta.bankAmount || 0)} - ${bankTitle || 'Bank'})`
    : (isBank
      ? `Bank Wire Deposit (${bankTitle || 'Online Wire / Cheque'})`
      : 'Cash Drawer Inflow (Cash in Hand)');

  const returnRefDisplay = receipt.return_no || 'Vendor Return Settlement';

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

  const amountInWords = numberToWords(Math.round(amountReceived));

  return (
    <div className="mx-auto max-w-4xl p-2 sm:p-4 md:p-6 bg-white text-slate-900 font-sans min-h-screen relative print:p-0 print:m-0 print:max-w-none print:w-full">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
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
        }
      `}</style>

      {/* ── TOP ACTION BAR (Hidden on Print) ─────────────────────────────────── */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Return-Receipt/List`)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition cursor-pointer"
          >
            <FiArrowLeft size={14} /> Back to Return Receipts
          </button>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Vendor Return Refund Collection Receipt</h1>
            <p className="text-[11px] text-slate-400 font-mono">Receipt Ref: {receiptNo}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2.5 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg shadow-md transition cursor-pointer"
        >
          <FiPrinter size={16} /> Print Official Receipt
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
              <FiRotateCcw size={12} /> Inward Refund Voucher
            </div>
            <div className="text-lg sm:text-xl font-black text-slate-950 tracking-tight mt-0.5">{receiptNo}</div>
            <div className="text-xs text-slate-600 font-sans mt-1">
              Receipt Date: <strong className="text-slate-900 font-mono">{receiptDate}</strong>
            </div>
            <div className="mt-1.5">
              <span className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                Mode: {receipt.payment_method || 'By Cash'}
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. METADATA CARDS: VENDOR & LINKED RETURN ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Vendor Card */}
          <div className="bg-slate-50/80 border border-slate-300 rounded-xl p-4 text-xs">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FiCheckCircle className="text-emerald-700" size={13} /> Wholesale Vendor Profile (Refund Payer)
            </div>
            <h3 className="font-black text-slate-900 text-sm">{vendorName}</h3>
            {vendorInfo?.contact_name && (
              <p className="text-slate-700 mt-1"><strong className="text-slate-900">Contact:</strong> {vendorInfo.contact_name}</p>
            )}
            {(vendorInfo?.cell_no || vendorInfo?.phone_no || vendorInfo?.phone) && (
              <p className="text-slate-700 mt-0.5 font-mono"><strong className="text-slate-900">Phone:</strong> {vendorInfo.cell_no || vendorInfo.phone_no || vendorInfo.phone}</p>
            )}
            {vendorInfo?.address && (
              <p className="text-slate-600 mt-0.5 text-[11px]"><strong className="text-slate-900">Address:</strong> {vendorInfo.address}</p>
            )}
          </div>

          {/* Linked Return Note Card */}
          <div className="bg-slate-50/80 border border-slate-300 rounded-xl p-4 text-xs">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FiDollarSign className="text-emerald-700" size={13} /> Settlement Audit & Debit Note Reference
            </div>
            <p className="text-slate-700">
              <strong className="text-slate-900">Linked Debit Note:</strong> <span className="font-mono font-bold text-primary">{returnRefDisplay}</span>
            </p>
            {linkedReturn && (
              <div className="mt-1 space-y-0.5 font-mono">
                <p className="text-slate-700">
                  <span className="font-sans font-medium">Return Date:</span> {linkedReturn.return_date || 'N/A'}
                </p>
                <p className="text-slate-700">
                  <span className="font-sans font-medium">Gross Return Total:</span> Rs. {formatMoney(linkedReturn.total_amount)}
                </p>
              </div>
            )}
            <p className="text-slate-700 mt-1">
              <strong className="text-slate-900">Recovery Purpose:</strong> Inward Goods Return Credit Clearance
            </p>
          </div>
        </div>

        {/* ── 3. REFUND AMOUNT HIGHLIGHT BANNER ── */}
        <div className="my-6 p-6 rounded-2xl bg-emerald-50/60 border-2 border-emerald-400 text-center">
          <span className="text-xs font-black uppercase tracking-widest text-emerald-800 block mb-1">
            Total Inward Refund Recovered
          </span>
          <div className="text-3xl sm:text-4xl font-black text-emerald-950 font-mono tracking-tight">
            Rs. {formatMoney(amountReceived)}
          </div>
          <p className="text-xs font-bold text-emerald-900 mt-2 italic">
            "{amountInWords}"
          </p>
        </div>

        {/* ── 4. TRANSACTION & SETTLEMENT DETAILS ── */}
        <div className="border border-slate-300 rounded-xl overflow-hidden mb-6 text-xs font-sans">
          <div className="bg-slate-900 text-white font-bold px-4 py-2.5 uppercase tracking-wider text-[11px]">
            Payment & Settlement Breakdown
          </div>
          <div className="divide-y divide-slate-200 bg-white">
            <div className="grid grid-cols-3 p-3 items-center">
              <span className="text-slate-500 font-medium">Collection Channel:</span>
              <strong className="col-span-2 text-slate-900 font-bold">{paymentMethodDisplay}</strong>
            </div>

            {receipt.remarks && (
              <div className="grid grid-cols-3 p-3 items-center">
                <span className="text-slate-500 font-medium">Transaction Remarks:</span>
                <span className="col-span-2 text-slate-800 font-medium">{receipt.remarks}</span>
              </div>
            )}

            <div className="grid grid-cols-3 p-3 items-center">
              <span className="text-slate-500 font-medium">GL Accounting Impact:</span>
              <span className="col-span-2 text-slate-800 font-mono">
                [DR] Cash / Bank Account &nbsp;|&nbsp; [CR] Vendor Account Payable
              </span>
            </div>
          </div>
        </div>

        {/* ── 5. VERIFICATION SIGNATURES FOOTER ── */}
        <div className="grid grid-cols-3 gap-8 pt-12 mt-8 border-t-2 border-slate-300 text-center text-xs">
          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Vendor / Factory Representative
            </div>
            <span className="text-[10px] text-slate-500">(Refund Payer Signature)</span>
          </div>

          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Cashier / Receiver
            </div>
            <span className="text-[10px] text-slate-500">(Company Cash Drawer / Bank Deposit)</span>
          </div>

          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Authorized Accountant
            </div>
            <span className="text-[10px] text-slate-500">(Audited & Posted to GL)</span>
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-400 font-mono mt-8 pt-3 border-t border-slate-200">
          This is an official computer-generated Refund Collection Receipt generated by AL MUHAMMADI ERP.
        </div>

      </div>
    </div>
  );
};

export default PrintPurchaseReturnReceipt;
