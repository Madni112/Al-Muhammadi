import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { FiPrinter, FiArrowLeft, FiPhone, FiMapPin, FiCheckCircle, FiDollarSign } from 'react-icons/fi';

const PrintPurchaseReceipt: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  
  const [receipt, setReceipt] = useState<any>(null);
  const [linkedPurchase, setLinkedPurchase] = useState<any>(null);
  const [vendorInfo, setVendorInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReceiptData = async () => {
      try {
        setLoading(true);
        if (!id) return;

        // 1. Fetch voucher from financial_vouchers
        const { data: voucherData, error: voucherError } = await supabase
          .from('financial_vouchers')
          .select('*')
          .eq('id', id)
          .single();

        if (voucherError) throw voucherError;
        setReceipt(voucherData);

        // 2. Fetch linked purchase if available
        const poRef = voucherData?.original_invoice_no || voucherData?.metadata?.linkedPurchaseNo;
        if (poRef) {
          const cleanPoId = String(poRef).replace(/\D/g, '');
          const { data: purData } = await supabase
            .from('supplier_purchases')
            .select('*')
            .or(`id.eq.${cleanPoId || 0},purchase_no.eq.${poRef}`)
            .maybeSingle();

          if (purData) setLinkedPurchase(purData);
        }

        // 3. Fetch vendor info
        const vName = voucherData?.customer_name || voucherData?.customerName;
        if (vName) {
          const { data: vData } = await supabase
            .from('vendors')
            .select('*')
            .or(`vendor_name.ilike.${vName},name.ilike.${vName}`)
            .maybeSingle();
          if (vData) setVendorInfo(vData);
        }
      } catch (err: any) {
        toast.error('Error loading purchase receipt: ' + err.message);
        navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Receipt/List`);
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

  const voucherNo = receipt.voucher_no || `PRC-${receipt.id}`;
  const receiptDate = receipt.voucher_date || receipt.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
  const vendorName = receipt.customer_name || receipt.customerName || 'General Vendor';
  const amountPaid = Number(receipt.total_amount || 0);
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

  const isSplit = receipt.voucher_type === 'Cash & Bank Payment Voucher' || (meta.cashAmount && meta.bankAmount);
  const isBank = receipt.voucher_type === 'Bank Payment Voucher';
  const bankTitle = meta.selectedBankTitle || receipt.selected_bank_title || meta.selectedBankId || '';
  const paymentMethod = isSplit
    ? `Split Payment (Cash: Rs. ${formatMoney(meta.cashAmount || 0)} + Bank: Rs. ${formatMoney(meta.bankAmount || 0)} - ${bankTitle || 'Bank'})`
    : (isBank 
      ? `Bank Account Outflow (${bankTitle || 'Online Wire'})` 
      : 'Cash Drawer Disbursement');

  const poDisplay = receipt.original_invoice_no || meta.linkedPurchaseNo || 'General Vendor Clearing';

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

  const amountInWords = numberToWords(Math.round(amountPaid));

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
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Purchase/Purchase-Receipt/List`)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition cursor-pointer"
          >
            <FiArrowLeft size={14} /> Back to Receipts List
          </button>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Vendor Outflow Payment Voucher</h1>
            <p className="text-[11px] text-slate-400 font-mono">Ref: {voucherNo}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2.5 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg shadow-md transition cursor-pointer"
        >
          <FiPrinter size={16} /> Print Payment Voucher
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
            <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Vendor Payment Voucher</div>
            <div className="text-lg sm:text-xl font-black text-slate-950 tracking-tight mt-0.5">{voucherNo}</div>
            <div className="text-xs text-slate-600 font-sans mt-1">
              Payment Date: <strong className="text-slate-900 font-mono">{receiptDate}</strong>
            </div>
            <div className="mt-1.5">
              <span className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                {isSplit ? 'Split Payment Voucher' : (isBank ? 'Bank Payment Voucher' : 'Cash Payment Voucher')}
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. VENDOR & TRANSACTION COORDINATES ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Vendor Details */}
          <div className="bg-slate-50/80 border border-slate-300 rounded-xl p-4 text-xs">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FiCheckCircle className="text-emerald-700" size={13} /> Payee / Wholesale Vendor Profile
            </div>
            <h3 className="font-black text-slate-900 text-sm">{vendorName}</h3>
            {vendorInfo?.contact_name && (
              <p className="text-slate-700 mt-1"><strong className="text-slate-900">Contact Person:</strong> {vendorInfo.contact_name}</p>
            )}
            {(vendorInfo?.cell_no || vendorInfo?.phone_no || vendorInfo?.phone) && (
              <p className="text-slate-700 mt-0.5 font-mono"><strong className="text-slate-900">Phone:</strong> {vendorInfo.cell_no || vendorInfo.phone_no || vendorInfo.phone}</p>
            )}
            {vendorInfo?.address && (
              <p className="text-slate-600 mt-0.5"><strong className="text-slate-900">Address:</strong> {vendorInfo.address} {vendorInfo?.city ? `(${vendorInfo.city})` : ''}</p>
            )}
          </div>

          {/* Payment & PO Allocation */}
          <div className="bg-slate-50/80 border border-slate-300 rounded-xl p-4 text-xs">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
              Disbursement Details & Allocation
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Linked Purchase Bill:</span>
                <strong className="text-slate-950 font-mono font-bold">{poDisplay}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Disbursement Mode:</span>
                <strong className="text-slate-900 font-medium">{paymentMethod}</strong>
              </div>
              {linkedPurchase && (
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Target Warehouse:</span>
                  <strong className="text-slate-900 font-bold">{linkedPurchase.target_warehouse || 'Main Warehouse'}</strong>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Voucher Status:</span>
                <strong className="text-emerald-800 font-bold inline-flex items-center gap-1">
                  <FiCheckCircle size={12} className="text-emerald-700" /> Settled & Posted
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. FINANCIAL PAYMENT BREAKDOWN CARD ── */}
        <div className="border border-slate-300 rounded-xl overflow-hidden mb-6">
          <div className="bg-slate-900 text-white py-2.5 px-4 text-xs font-black uppercase tracking-wider flex justify-between items-center">
            <span>Payment Summary & Settlement Details</span>
            <span>Voucher Currency: PKR</span>
          </div>

          <div className="p-4 bg-slate-50/60 divide-y divide-slate-200 font-mono text-xs">
            {linkedPurchase && (
              <>
                <div className="flex justify-between py-2 text-slate-700">
                  <span className="font-sans font-bold">Total Purchase Bill (Gross):</span>
                  <strong className="text-slate-950 font-black text-sm">Rs. {formatMoney(linkedPurchase.total_amount)}</strong>
                </div>
                <div className="flex justify-between py-2 text-slate-600">
                  <span className="font-sans">Initial Paid Upfront:</span>
                  <span>Rs. {formatMoney(linkedPurchase.cash_amount_paid || linkedPurchase.amount_paid || 0)}</span>
                </div>
              </>
            )}

            <div className="flex justify-between py-3 items-center text-emerald-900 bg-emerald-50/80 px-3 rounded-lg my-1 font-bold">
              <span className="font-sans flex items-center gap-1.5 text-sm font-black">
                <FiDollarSign className="text-emerald-700" size={16} /> Amount Disbursed in this Voucher:
              </span>
              <strong className="text-lg font-black text-emerald-950">Rs. {formatMoney(amountPaid)}</strong>
            </div>

            {linkedPurchase && (
              <div className="flex justify-between py-2 text-slate-700 pt-3 font-bold">
                <span className="font-sans">Remaining Vendor Payable After Settlement:</span>
                <strong className="font-black text-sm text-slate-900">
                  Rs. {formatMoney(Math.max(0, (Number(linkedPurchase.total_amount) || 0) - ((Number(linkedPurchase.amount_paid) || 0) + amountPaid)))}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* ── 4. AMOUNT IN WORDS & REMARKS ── */}
        <div className="space-y-3 mb-8">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Amount Disbursed in Words:</span>
            <p className="font-bold text-slate-900 italic text-xs">{amountInWords}</p>
          </div>

          {(receipt.narration || receipt.notes) && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Transaction Remarks / Reference:</span>
              <p className="text-slate-800 font-medium">{receipt.narration || receipt.notes}</p>
            </div>
          )}
        </div>

        {/* ── 5. VERIFICATION SIGNATURES ── */}
        <div className="grid grid-cols-3 gap-8 pt-10 mt-6 border-t-2 border-slate-300 text-center text-xs">
          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Disbursed By
            </div>
            <span className="text-[10px] text-slate-500">(Cashier / Accounts Officer)</span>
          </div>

          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Accounts Verification
            </div>
            <span className="text-[10px] text-slate-500">(Chief Accountant / Ledger Audit)</span>
          </div>

          <div>
            <div className="border-t border-slate-700 pt-1.5 font-bold text-slate-900">
              Vendor / Payee Acknowledgment
            </div>
            <span className="text-[10px] text-slate-500">(Authorized Signatory)</span>
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-400 font-mono mt-8 pt-3 border-t border-slate-200">
          This is an official computer-generated Vendor Payment Voucher issued by AL MUHAMMADI ERP.
        </div>

      </div>
    </div>
  );
};

export default PrintPurchaseReceipt;
