import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { FiPrinter, FiArrowLeft, FiPhone, FiMapPin, FiCheckCircle, FiDollarSign, FiRotateCcw } from 'react-icons/fi';

const PrintSalesReturnReceipt: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  
  const [receipt, setReceipt] = useState<any>(null);
  const [linkedReturn, setLinkedReturn] = useState<any>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReceiptData = async () => {
      try {
        setLoading(true);
        if (!id) return;

        // 1. Fetch receipt record from sales_return_receipts
        const { data: recData, error: recError } = await supabase
          .from('sales_return_receipts')
          .select('*')
          .eq('id', id)
          .single();

        if (recError) throw recError;
        setReceipt(recData);

        // 2. Fetch linked sales return if available
        const returnRef = recData?.sales_return_id || recData?.return_no || recData?.invoice_no;
        if (returnRef) {
          const { data: retData } = await supabase
            .from('sales_returns')
            .select('*')
            .or(`id.eq.${recData?.sales_return_id || 0},return_no.eq.${returnRef},invoice_no.eq.${returnRef}`)
            .maybeSingle();

          if (retData) setLinkedReturn(retData);
        }

        // 3. Fetch customer info
        const cName = recData?.customer_name;
        if (cName) {
          const { data: cData } = await supabase
            .from('customers')
            .select('*')
            .or(`name.ilike.${cName},customer_name.ilike.${cName}`)
            .maybeSingle();
          if (cData) setCustomerInfo(cData);
        }
      } catch (err: any) {
        toast.error('Error loading sales return receipt: ' + err.message);
        navigate(`${tenantId ? `/${tenantId}` : ''}/sales/sales-return-receipt/list`);
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

  const receiptNo = receipt.receipt_no || `SRR-${String(receipt.id).padStart(4, '0')}`;
  const receiptDate = receipt.payment_date 
    ? new Date(receipt.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date(receipt.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  
  const customerName = receipt.customer_name || 'General Customer';
  const amountPaid = Number(receipt.amount_paid || 0);
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
  const isBank = receipt.payment_method === 'By Bank' || receipt.settlement_mode === 'Bank' || receipt.payment_mode === 'Bank';
  const bankTitle = meta.selectedBankTitle || meta.selectedBankId || receipt.bank_name || '';
  const paymentMethodDisplay = isSplit
    ? 'Split Disbursement (Cash + Bank Wire)'
    : (isBank ? `Bank Wire Transfer (${bankTitle})` : 'Cash Drawer / Vault');

  // Simple number to words function
  const numberToWords = (num: number): string => {
    if (num === 0) return 'Zero Rupees Only';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n: number): string => {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
      if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
      if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
      if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
      return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
    };

    return inWords(Math.floor(num)) + ' Rupees Only';
  };

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 lg:px-8 text-slate-800 print:p-0 print:bg-white print:text-black">
      
      {/* Top Action Bar - Hidden in Print */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between print:hidden">
        <button
          onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/sales/sales-return-receipt/list`)}
          className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 font-bold rounded-xl border border-slate-300 hover:bg-slate-50 transition shadow-xs"
        >
          <FiArrowLeft size={16} /> Back to Return Payouts
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-700 text-white font-bold rounded-xl hover:bg-emerald-800 transition shadow-md cursor-pointer"
          >
            <FiPrinter size={16} /> Print Official Voucher
          </button>
        </div>
      </div>

      {/* Printable Voucher Paper (A4 Style) */}
      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 shadow-xl print:shadow-none print:border-none print:p-0 print:max-w-full">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-emerald-700 pb-6 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight uppercase">
              AL MUHAMMADI
            </h1>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Wholesale Ceramic Tiles, Sanitary Ware & Building Materials
            </p>
            <p className="text-xs text-slate-500 font-medium">
              National Highway / Main Warehouse, Hyderabad, Sindh
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Tel: +92 312 8039911 | Email: support@almuhammadi.com
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-black uppercase tracking-wider mb-2">
              Official Refund Payout Slip
            </span>
            <div className="font-mono text-sm font-black text-slate-900">
              VOUCHER #: {receiptNo}
            </div>
            <div className="text-xs text-slate-500 font-bold mt-1">
              DATE: {receiptDate}
            </div>
          </div>
        </div>

        {/* Title Bar */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-6 flex justify-between items-center">
          <span className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
            <FiRotateCcw className="text-emerald-700" size={16} /> Customer Sales Return Refund Settlement
          </span>
          <span className="text-xs font-bold text-emerald-800 font-mono">
            REFUND STATUS: POSTED & DISBURSED
          </span>
        </div>

        {/* Customer & Return Metadata Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          
          {/* Customer Info Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
              <FiCheckCircle className="text-emerald-600" /> Beneficiary Customer Account
            </div>
            <div className="text-sm font-black text-slate-900">{customerName}</div>
            {customerInfo?.contact_name && (
              <div className="text-xs text-slate-600 font-medium">
                Attention: <span className="font-bold text-slate-800">{customerInfo.contact_name}</span>
              </div>
            )}
            {(customerInfo?.cell_no || customerInfo?.phone_no || customerInfo?.phone) && (
              <div className="text-xs text-slate-600 font-mono flex items-center gap-1">
                <FiPhone size={12} className="text-slate-400" />
                {customerInfo.cell_no || customerInfo.phone_no || customerInfo.phone}
              </div>
            )}
            {customerInfo?.address && (
              <div className="text-xs text-slate-600 flex items-start gap-1">
                <FiMapPin size={12} className="text-slate-400 shrink-0 mt-0.5" />
                <span>{customerInfo.address}{customerInfo.city ? `, ${customerInfo.city}` : ''}</span>
              </div>
            )}
          </div>

          {/* Return Info Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
              <FiRotateCcw className="text-emerald-600" /> Associated Sales Return Note
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">Return Reference:</span>
              <span className="font-mono font-black text-emerald-800">
                {receipt.return_no || receipt.invoice_no || (receipt.sales_return_id ? `SRTN-${receipt.sales_return_id}` : 'General Customer Ledger Settlement')}
              </span>
            </div>
            {linkedReturn && (
              <>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Return Date:</span>
                  <span className="font-medium text-slate-800">{linkedReturn.return_date || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Warehouse:</span>
                  <span className="font-medium text-slate-800">{linkedReturn.warehouse || linkedReturn.source_warehouse || 'Main Warehouse'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Gross Return Credit:</span>
                  <span className="font-mono font-bold text-slate-900">Rs. {formatMoney(linkedReturn.total_amount || linkedReturn.total_net_amount)}</span>
                </div>
              </>
            )}
          </div>

        </div>

        {/* Financial Disbursement Breakdown Table */}
        <div className="mb-6 border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Description / Ledger Line</th>
                <th className="py-2.5 px-4">Disbursement Mode / Route</th>
                <th className="py-2.5 px-4 text-right">Disbursed Amount (PKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isSplit ? (
                <>
                  <tr>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      Cash Payout from Drawer / Vault
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      Cash Drawer Ledger
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      Rs. {formatMoney(meta.cashAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      Bank Wire / Online Refund Transfer
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {bankTitle || 'Company Bank Account'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      Rs. {formatMoney(meta.bankAmount)}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td className="py-3.5 px-4 font-bold text-slate-800">
                    Customer Sales Return Refund Payout ({customerName})
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600">
                    {paymentMethodDisplay}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-black text-sm text-emerald-800">
                    Rs. {formatMoney(amountPaid)}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-emerald-50/70 border-t-2 border-emerald-600 font-bold">
              <tr>
                <td colSpan={2} className="py-3 px-4 text-right font-black uppercase text-xs text-emerald-950">
                  Total Refund Disbursed to Customer:
                </td>
                <td className="py-3 px-4 text-right font-mono font-black text-base text-emerald-900">
                  Rs. {formatMoney(amountPaid)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Amount in Words */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
            Amount Disbursed in Words:
          </div>
          <div className="font-serif italic font-bold text-slate-800 text-sm">
            {numberToWords(amountPaid)}
          </div>
        </div>

        {/* Remarks / Notes */}
        {receipt.notes && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-8">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
              Voucher Remarks / Notes:
            </div>
            <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap">
              {receipt.notes}
            </p>
          </div>
        )}

        {/* Signatures Footer */}
        <div className="grid grid-cols-3 gap-8 pt-10 border-t border-slate-200 text-center text-xs">
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-700">
              Prepared By
            </div>
            <span className="text-[10px] text-slate-400 font-medium">Accounts Dept.</span>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-700">
              Authorized Signature
            </div>
            <span className="text-[10px] text-slate-400 font-medium">Finance Manager</span>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-700">
              Customer Signature
            </div>
            <span className="text-[10px] text-slate-400 font-medium">Received By Customer</span>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center text-[10px] text-slate-400 print:mt-12 font-medium">
          This is a computer-generated official refund settlement voucher from AL MUHAMMADI ERP System.
        </div>

      </div>

    </div>
  );
};

export default PrintSalesReturnReceipt;
