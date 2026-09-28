import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';



interface ChallanItem {
  pDescription: string;
  qty: number;
  location?: string;
  [key: string]: any;
}

interface ChallanData {
  id: number;
  challan_no?: string;
  invoice_no?: string;
  customer_name: string;
  transport_name?: string;
  transportation?: string;
  po_no?: string;
  po_date?: string;
  dc_date?: string;
  vehicle_no?: string;
  driver_name?: string;
  dispatch_warehouse?: string;
  remarks?: string;
  status?: string;
  items: ChallanItem[];
  created_at: string;
}

const PrintChallan = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { businessName, tenantId } = useAuth();
  const [challan, setChallan] = useState<ChallanData | null>(null);

  const [productsMaster, setProductsMaster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChallanDetails = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('delivery_challans')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        if (data) setChallan(data);

        const { data: prodData } = await supabase
          .from('products')
          .select('product_name, category, scenario_name, pieces_per_box, pcs_per_box, pieces_per_packing');
        if (prodData) setProductsMaster(prodData);
      } catch (err: any) {
        toast.error('Error loading print data: ' + err.message);
        navigate('/Delivery-Challan/List');
      } finally {
        setLoading(false);
      }
    };

    fetchChallanDetails();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (!challan) return null;

  const formatPrintDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const challanTitle = challan.challan_no || `DC-${String(challan.id).padStart(4, '0')}`;

  let totalBoxes = 0;
  let totalPcs = 0;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8 bg-white text-black font-sans min-h-screen relative">
      
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 15mm 15mm 15mm 15mm;
          }
          aside, nav, header, .no-print, button {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
          }
          html, body, #root, .flex, main, div {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            position: static !important;
            overflow: visible !important;
            background: white !important;
            color: black !important;
            transform: none !important;
            box-shadow: none !important;
          }
          .print-voucher {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            min-height: 250mm !important;
            justify-content: space-between !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          table {
            width: 100% !important;
            table-layout: auto !important;
            border-collapse: collapse !important;
            margin-top: 15px !important;
          }
          th, td {
            padding: 10px 8px !important;
            border: 1px solid #000000 !important;
            font-size: 13px !important;
            text-align: center !important;
          }
        }
      `}</style>

      <div className="no-print flex justify-between items-center mb-6 bg-slate-50 p-4 rounded border border-stroke">
        <button
          onClick={() => navigate('/Delivery-Challan/List')}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-black transition"
        >
          ← Return to History
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded bg-emerald-600 py-2 px-5 text-sm font-bold text-white hover:bg-emerald-700 transition shadow-sm cursor-pointer"
        >
          🖨️ Print Gate Pass Document
        </button>
      </div>

      <div className="print-voucher bg-white border border-gray-300 p-8 rounded shadow-sm">
        <div>
          {/* Official Document Banner */}
          <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-black">AL MUHAMMADI</h1>
              <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider">Goods Transit & Warehouse Gate Pass Voucher</p>
            </div>
            <div className="text-right">
              <span className="inline-block bg-black text-white text-xs font-mono font-black uppercase px-3 py-1 rounded">
                Official Gate Pass
              </span>
              <p className="text-sm font-mono font-bold mt-1 text-black">{challanTitle}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 border-b border-gray-300 pb-4 mb-6 text-xs uppercase tracking-wider font-semibold">
            <div>
              <span className="text-gray-500 block mb-0.5">System DC #:</span>
              <strong className="text-sm font-black text-black font-mono">
                {challanTitle}
              </strong>
            </div>
            <div>
              <span className="text-gray-500 block mb-0.5">Gate Pass #:</span>
              <strong className="text-sm font-black text-emerald-800 font-mono">
                {challan.gate_pass_no || challanTitle}
              </strong>
            </div>
            <div>
              <span className="text-gray-500 block mb-0.5">Linked Invoice:</span>
              <span className="text-red-600 text-sm font-mono font-black">{challan.invoice_no || 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-0.5">Dispatch Date:</span>
              <span className="text-black text-sm font-bold">{formatPrintDate(challan.dc_date || challan.created_at)}</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-0.5">Vehicle Plate:</span>
              <strong className="text-black text-sm font-bold">{challan.vehicle_no || 'Direct Handover'}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-gray-300 pb-6 mb-6 text-xs">
            <div>
              <h4 className="font-bold text-gray-500 mb-2 uppercase tracking-wide text-[11px]">Dispatch Warehouse Source:</h4>
              <div className="space-y-1 text-black font-medium">
                <p className="text-sm font-extrabold text-emerald-800">{challan.dispatch_warehouse || 'Main Warehouse'}</p>
                <p className="text-gray-600">Carrier / Driver: <span className="font-bold text-black">{challan.driver_name || 'Counter Delivery'}</span></p>
                <p className="italic text-gray-600">Transit Method: {challan.transport_name || challan.transportation || 'By Road Delivery'}</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-gray-500 mb-2 uppercase tracking-wide text-[11px]">Consignee / Customer:</h4>
              <div className="space-y-1 text-black font-medium">
                <p className="text-sm font-extrabold text-black">{challan.customer_name}</p>
                {challan.shipping_address && <p className="text-xs text-gray-800 break-words mt-1 whitespace-pre-wrap">{challan.shipping_address}</p>}
                {challan.remarks && <p className="mt-2 text-gray-700 bg-gray-100 p-2 rounded text-[11px] font-sans">Remarks: {challan.remarks}</p>}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <table className="w-full border-collapse border border-gray-300 text-xs text-left">
              <thead>
                <tr className="bg-gray-100 text-black font-bold uppercase tracking-wider border-b border-gray-300 text-center">
                  <th className="border border-gray-300 p-2.5 w-12">S#</th>
                  <th className="border border-gray-300 p-2.5 w-32">Code</th>
                  <th className="border border-gray-300 p-2.5 text-left">Description</th>
                  <th className="border border-gray-300 p-2.5 w-32">Qty</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const printedItems = challan.items ? challan.items.filter((item: any) => Number(item.dispatchedQty ?? item.qty ?? 0) > 0) : [];
                  return (
                    <>
                      {printedItems.map((item: any, idx: number) => {
                        const dispatchedQty = Number(item.dispatchedQty ?? item.qty ?? 0);
                        
                        let pcsPerBox = 1;
                        const prodName = String(item.pDescription || item.itemName || '').trim().toLowerCase();
                        const prod = productsMaster.find(p => String(p?.product_name || '').trim().toLowerCase() === prodName);
                        if (prod) {
                           const rawPcs = Number(prod.pieces_per_box || prod.pcs_per_box || prod.pieces_per_packing || 0);
                           const isTile = Boolean(String(prod.category || '').toLowerCase().includes('tile') || String(prod.scenario_name || '').toLowerCase().includes('tile'));
                           if (isTile) {
                             pcsPerBox = rawPcs > 1 ? rawPcs : 4;
                           }
                        }

                        let displayQty = String(dispatchedQty);
                        if (pcsPerBox > 1) {
                          const totPcs = Math.round(dispatchedQty * pcsPerBox);
                          const b = Math.floor(totPcs / pcsPerBox);
                          const p = totPcs % pcsPerBox;
                          totalBoxes += b;
                          totalPcs += p;
                          if (p === 0) displayQty = `${b} Boxes`;
                          else if (b === 0) displayQty = `${p} Pcs`;
                          else displayQty = `${b} Boxes + ${p} Pcs`;
                        } else {
                          totalBoxes += dispatchedQty;
                          displayQty = String(dispatchedQty);
                        }

                        return (
                          <tr key={idx} className="font-medium text-center">
                            <td className="border border-gray-300 p-2 text-center bg-gray-50/50">{idx + 1}</td>
                            <td className="border border-gray-300 p-2 text-center font-mono">{item.skuCode || item.pCode}</td>
                            <td className="border border-gray-300 p-2 text-black font-semibold text-left">{item.pDescription}</td>
                            <td className="border border-gray-300 p-2 text-center font-black text-sm text-black bg-gray-100 font-mono">
                              {displayQty}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-gray-50 font-bold border-t-2 border-gray-400 text-center">
                        <td colSpan={3} className="border border-gray-300 p-2.5 text-right uppercase tracking-wider text-gray-600">
                          Total Qty:
                        </td>
                        <td className="border border-gray-300 p-2.5 text-center text-sm font-black text-black bg-gray-200 whitespace-nowrap">
                          {totalPcs > 0 ? `${totalBoxes} Boxes + ${totalPcs} Pcs` : `${totalBoxes}`}
                        </td>
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* COMPLIANT SPACED OUT SIGNATURE LINES GRID BLOCK */}
        <div className="grid grid-cols-3 gap-8 pt-24 text-center text-[11px] font-bold uppercase tracking-wider text-gray-600 mt-auto">
          <div><div className="border-t border-black pt-2">Prepared By</div></div>
          <div><div className="border-t border-black pt-2">Checked By</div></div>
          <div><div className="border-t border-black pt-2">Receiver's Signature</div></div>
        </div>

      </div>
    </div>
  );
};

export default PrintChallan;
