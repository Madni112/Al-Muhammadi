import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { FiPrinter, FiArrowLeft, FiCheckCircle } from 'react-icons/fi';

const PrintInvoiceReceipt: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { businessName, tenantId } = useAuth();
  
  const [receipt, setReceipt] = useState<any>(null);
  const [linkedInvoice, setLinkedInvoice] = useState<any>(null);
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

        // 2. Fetch linked invoice if available
        if (voucherData?.original_invoice_no) {
          const rawInv = String(voucherData.original_invoice_no).trim();
          const cleanInvId = rawInv.replace(/\D/g, '');
          
          let invQuery = supabase.from('sales_invoices').select('*');
          if (cleanInvId && !isNaN(Number(cleanInvId))) {
            invQuery = invQuery.or(`id.eq.${Number(cleanInvId)},invoice_no.ilike.${rawInv}`);
          } else {
            invQuery = invQuery.ilike('invoice_no', rawInv);
          }
          const { data: invData } = await invQuery.maybeSingle();

          if (invData) setLinkedInvoice(invData);
        }
      } catch (err: any) {
        toast.error('Error loading receipt print data: ' + err.message);
        navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/List`);
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

  const voucherNo = receipt.voucher_no || `RCP-${receipt.id}`;
  const receiptDate = receipt.voucher_date || receipt.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
  const customerName = receipt.customer_name || 'Walk-in Customer';
  const amountPaid = Number(receipt.total_amount || 0);
  const bankTitle = receipt.bank_title || receipt.linked_bank_title || '';

  const meta = receipt.metadata || {};
  const isSplit = receipt.voucher_type === 'Cash & Bank Receipt Voucher' || (meta.cashAmount && meta.bankAmount);
  const paymentMethod = isSplit
    ? `Split Payment (Cash: Rs. ${Number(meta.cashAmount || 0).toLocaleString()} + Bank: Rs. ${Number(meta.bankAmount || 0).toLocaleString()})`
    : (receipt.voucher_type === 'Bank Receipt Voucher' ? 'Bank Account Wire / Deposit' : 'Cash Counter Register');

  const cleanInvNo = linkedInvoice?.invoice_no || receipt.original_invoice_no || 'N/A';

  const invoiceBilledTotal = Number(linkedInvoice?.total_amount || 0);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 text-black bg-white min-h-screen">
      {/* ── PRINT STYLES ────────────────────────────────────────────── */}
      <style>
        {`
        @page {
          size: A4 portrait;
          margin: 15mm 15mm 15mm 15mm;
        }
        @media print {
          body, html {
            background: #ffffff !important;
            color: #000000 !important;
          }
          aside, nav, header, .no-print, button {
            display: none !important;
          }
          .print-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}
      </style>

      {/* ── NO-PRINT NAVIGATION & ACTION TOOLBAR ─────────────────────────────── */}
      <div className="no-print flex justify-between items-center mb-6 bg-slate-900 text-white p-4 rounded-xl shadow-md">
        <button
          type="button"
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/InvoiceReceipt/List`)}
          className="flex items-center gap-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition"
        >
          <FiArrowLeft size={16} /> Back to Receipts
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 text-xs font-bold bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-lg shadow-lg transition"
        >
          <FiPrinter size={16} /> Print Receipt Voucher
        </button>
      </div>

      {/* ── PRINTABLE RECEIPT VOUCHER ─────────────────────────────────────────────── */}
      <div className="print-container border border-slate-300 rounded-2xl p-8 bg-white shadow-sm">
        {/* HEADER */}
        <div className="border-b-2 border-red-600 pb-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">
                {businessName || 'AL MUHAMMADI'}
              </h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Authorized Commercial Building Materials & Ceramic Store
              </p>
              <div className="mt-2 text-[11px] text-slate-600 space-y-0.5">
                <p>Hotline: +92 312 8039911 | Enterprise Finance & Audit</p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block bg-red-100 text-red-800 font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                Official Payment Receipt
              </span>
              <p className="font-mono text-sm font-black text-slate-900">{voucherNo}</p>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Date: {receiptDate}</p>
            </div>
          </div>
        </div>

        {/* RECEIPT METRICS SUMMARY BOX */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 mb-6 text-xs">
          <div>
            <span className="text-slate-400 font-bold block uppercase text-[10px]">Customer Name</span>
            <strong className="text-slate-900 text-sm font-black">{customerName}</strong>
          </div>
          <div>
            <span className="text-slate-400 font-bold block uppercase text-[10px]">Linked Invoice</span>
            <strong className="text-primary text-sm font-black font-mono">{cleanInvNo}</strong>
          </div>
          <div>
            <span className="text-slate-400 font-bold block uppercase text-[10px]">Payment Mode</span>
            <strong className="text-slate-900 text-xs font-bold">{paymentMethod}</strong>
            {bankTitle && <p className="text-[10px] text-slate-500 truncate">{bankTitle}</p>}
          </div>
          <div className="text-right">
            <span className="text-slate-400 font-bold block uppercase text-[10px]">Amount Received</span>
            <strong className="text-red-700 text-base font-black font-mono">
              Rs. {amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </strong>
          </div>
        </div>

        {/* PAYMENT ACKNOWLEDGEMENT STATEMENT */}
        <div className="border border-slate-200 rounded-xl p-6 mb-6 space-y-4">
          <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
            <FiCheckCircle size={18} />
            <span>Payment Acknowledgement & Ledger Credit</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-700">
            Received with thanks the sum of{' '}
            <strong className="font-black text-slate-900">
              Rs. {amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </strong>{' '}
            from <strong className="font-bold text-slate-900">{customerName}</strong> against Commercial Sales Bill{' '}
            <strong className="font-mono font-bold text-primary">{cleanInvNo}</strong> via{' '}
            <strong className="font-bold">{paymentMethod}</strong>.
          </p>

          {invoiceBilledTotal > 0 && (
            <div className="flex flex-wrap gap-6 pt-3 border-t border-slate-100 text-xs font-mono">
              <div>
                <span className="text-slate-400 font-sans text-[11px] block">Invoice Total:</span>
                <span className="font-bold text-slate-800">
                  Rs. {invoiceBilledTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-sans text-[11px] block">This Payment:</span>
                <span className="font-bold text-red-700">
                  Rs. {amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {receipt.remarks && (
            <div className="pt-2 text-xs text-slate-500 italic">
              <strong>Notes / Remarks:</strong> {receipt.remarks}
            </div>
          )}
        </div>

        {/* SIGNATURE SECTION */}
        <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-slate-200 text-center text-xs text-slate-600">
          <div>
            <div className="border-b border-slate-400 w-48 mx-auto mb-2"></div>
            <p className="font-bold uppercase tracking-wider text-[10px]">Customer / Depositor Signature</p>
          </div>
          <div>
            <div className="border-b border-slate-400 w-48 mx-auto mb-2"></div>
            <p className="font-bold uppercase tracking-wider text-[10px]">Authorized Cashier / Accountant</p>
          </div>
        </div>

        {/* FOOTER AUDIT NOTE */}
        <div className="mt-12 text-center text-[10px] text-slate-400 border-t border-slate-100 pt-4">
          <p>This is a computer-generated system voucher compiled via Enterprise ERP Suite.</p>
        </div>
      </div>
    </div>
  );
};

export default PrintInvoiceReceipt;
