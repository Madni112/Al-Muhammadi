import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';

const AddDeliveryChallan = () => {
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  // Route state evaluation to determine if the workflow represents Edit Mode
  const editData = location.state?.challan;
  const isEditMode = !!editData;

  // Track state definitions for initial values object model loading rules
  const [initialFormValues, setInitialFormValues] = useState({
    invoiceNo: '',
    customerName: '',
    dispatchWarehouse: 'Main Warehouse',
    transportation: '',
    poNo: '',
    poDate: '',
    dcDate: new Date().toISOString().split('T')[0], // Defaults dynamically to today's timestamp
    vehicleNo: '',
    driverName: '',
    gatePassNo: '',
    status: 'Pending Dispatch',
    remarks: '',
    items: [{ poNoSub: '', pDescription: '', location: '', rate: 0, orderQty: 1, dispatchedQty: 1, holdQty: 0, qty: 1, disAmt: 0, distPer: 0, discount: 0, notes: '' }]
  });

  // Fetch dynamic customers dataset array + pull target record payload properties if in Edit mode
  useEffect(() => {
    const initializeFormMetadata = async () => {
      try {
        setFetchingData(isEditMode);

        // 1. Load active customers directory lists
        const { data: custData } = await supabase.from('customers').select('id, customerName, customer_code, customerCode');
        if (custData) setCustomers(custData);

        // 2. Hydrate form values with existing dataset properties if updating
        if (isEditMode && editData?.id) {
          const { data: challanRecord, error } = await supabase
            .from('delivery_challans')
            .select('*')
            .eq('id', editData.id)
            .single();

          if (error) throw error;
          if (challanRecord) {
            const rawItems = (challanRecord.items || []).map((item: any) => {
              const orderQty = Number(item.orderQty ?? item.qty ?? 0);
              const dispatchedQty = Number(item.dispatchedQty ?? item.qty ?? 0);
              const holdQty = Number(item.holdQty ?? Math.max(0, orderQty - dispatchedQty));
              return {
                ...item,
                orderQty,
                dispatchedQty,
                holdQty,
                qty: dispatchedQty
              };
            });

            setInitialFormValues({
              invoiceNo: challanRecord.invoice_no || '',
              customerName: challanRecord.customer_name || '',
              dispatchWarehouse: challanRecord.dispatch_warehouse || 'Main Warehouse',
              transportation: challanRecord.transportation || challanRecord.transport_name || '',
              poNo: challanRecord.po_no || '',
              poDate: challanRecord.po_date || '',
              dcDate: challanRecord.challan_date || challanRecord.dc_date || challanRecord.created_at?.split('T')[0],
              vehicleNo: challanRecord.vehicle_no || '',
              driverName: challanRecord.driver_name || '',
              gatePassNo: challanRecord.gate_pass_no || '',
              status: challanRecord.status || 'Dispatched',
              remarks: challanRecord.remarks || '',
              items: rawItems.length > 0 ? rawItems : [{ poNoSub: '', pDescription: '', location: '', rate: 0, orderQty: 1, dispatchedQty: 1, holdQty: 0, qty: 1, disAmt: 0, distPer: 0, discount: 0, notes: '' }]
            });
          }
        }
      } catch (err: any) {
        toast.error('Initialization failure: ' + err.message);
      } finally {
        setFetchingData(false);
      }
    };

    initializeFormMetadata();
  }, [editData, isEditMode]);

  const validationSchema = Yup.object().shape({
    customerName: Yup.string().required('Customer selection is mandatory'),
    items: Yup.array().of(
      Yup.object().shape({
        pDescription: Yup.string().required('Required'),
        orderQty: Yup.number().typeError('Must be numeric').min(0, 'Min 0').required('Required'),
        dispatchedQty: Yup.number().typeError('Must be numeric').min(0, 'Min 0').required('Required'),
        rate: Yup.number().typeError('Must be numeric').min(0, 'Min 0').required('Required'),
      })
    ).min(1)
  });

  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
    ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

  if (fetchingData) {
    return (
      <div className="flex h-48 items-center justify-center bg-white dark:bg-boxdark rounded-sm border border-stroke dark:border-strokedark">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-full">
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">

        {/* Dynamic Context Form Header Header Section */}
        <div className="flex justify-between border-b border-stroke py-4 px-6.5 dark:border-strokedark">
          <div>
            <h3 className="font-semibold text-black dark:text-white text-base">
              {isEditMode ? `Approve & Dispatch Delivery Challan` : 'Add Delivery Challan'}
            </h3>
            {isEditMode && initialFormValues.invoiceNo && (
              <p className="text-xs text-gray-500 mt-0.5">Linked Sales Invoice: <span className="font-mono font-bold text-danger uppercase">{initialFormValues.invoiceNo}</span></p>
            )}
          </div>
          <button
            onClick={() => navigate('/Delivery-Challan/List')}
            className="text-sm text-primary hover:underline font-medium"
          >
            {isEditMode ? 'Back to List' : 'See List'}
          </button>
        </div>

        <Formik
          initialValues={initialFormValues}
          enableReinitialize={true}
          validationSchema={validationSchema}
          onSubmit={async (values) => {
            setLoading(true);

            // Row-level totals calculation loop mappings to map to overall data summary cards
            const totalOrderQty = values.items.reduce((acc, item) => acc + (Number(item.orderQty ?? item.qty) || 0), 0);
            const totalDispatchedQty = values.items.reduce((acc, item) => acc + (Number(item.dispatchedQty ?? item.qty) || 0), 0);
            const totalHoldQty = values.items.reduce((acc, item) => acc + (Number(item.holdQty) || 0), 0);

            const baseAmount = values.items.reduce((acc, item) => acc + ((Number(item.rate) || 0) * (Number(item.dispatchedQty ?? item.qty) || 0)), 0);
            const totalDisc = values.items.reduce((acc, item) => {
              const rowGross = (Number(item.rate) || 0) * (Number(item.dispatchedQty ?? item.qty) || 0);
              const fixedDisc = Number(item.disAmt) || 0;
              const perDisc = (rowGross / 100) * (Number(item.distPer) || 0);
              const calculatedDiscount = Number(item.discount) || 0;
              return acc + fixedDisc + perDisc + calculatedDiscount;
            }, 0);
            const netAmount = baseAmount - totalDisc;

            let computedStatus = 'Fully Dispatched';
            if (totalDispatchedQty === 0) {
              computedStatus = 'On Hold';
            } else if (totalHoldQty > 0 || totalDispatchedQty < totalOrderQty) {
              computedStatus = 'Partially Dispatched (Hold Items)';
            } else {
              computedStatus = 'Fully Dispatched';
            }

            const processedItems = values.items.map(item => ({
              ...item,
              qty: Number(item.dispatchedQty ?? item.qty ?? 0),
              dispatchedQty: Number(item.dispatchedQty ?? item.qty ?? 0),
              orderQty: Number(item.orderQty ?? item.qty ?? 0),
              holdQty: Number(item.holdQty ?? Math.max(0, Number(item.orderQty ?? item.qty ?? 0) - Number(item.dispatchedQty ?? item.qty ?? 0)))
            }));

            // Structure data block matching database tracking layouts exactly
            const databasePayload = {
              invoice_no: values.invoiceNo || null,
              customer_name: values.customerName,
              dispatch_warehouse: values.dispatchWarehouse || 'Main Warehouse',
              transportation: values.transportation,
              transport_name: values.transportation,
              po_no: values.poNo,
              po_date: values.poDate || null,
              challan_date: values.dcDate,
              vehicle_no: values.vehicleNo,
              driver_name: values.driverName,
              gate_pass_no: values.gatePassNo,
              remarks: values.remarks,
              total_quantity: totalDispatchedQty,
              total_amount: baseAmount,
              total_discount: totalDisc,
              total_net_amount: netAmount,
              status: computedStatus,
              items: processedItems
            };

            try {
              if (isEditMode) {
                const { error } = await supabase
                  .from('delivery_challans')
                  .update(databasePayload)
                  .eq('id', editData.id);

                if (error) throw error;
                toast.success(`Challan updated: ${computedStatus}`);
              } else {
                const safePrefix = (values.dispatchWarehouse || 'Main Warehouse').toUpperCase().replace(/[^A-Z0-9]/g, '');
                const { data: allDcs } = await supabase
                  .from('delivery_challans')
                  .select('challan_no')
                  .ilike('challan_no', `${safePrefix}-%`);

                let nextNum = 1;
                if (allDcs && allDcs.length > 0) {
                  const maxNum = allDcs.reduce((max, dc) => {
                    const match = (dc.challan_no || '').match(new RegExp(`^${safePrefix}-(\\d+)`));
                    if (match && match[1]) {
                      const num = parseInt(match[1], 10);
                      return num > max ? num : max;
                    }
                    return max;
                  }, 0);
                  nextNum = maxNum + 1;
                }
                const newChallanNo = `${safePrefix}-${String(nextNum).padStart(4, '0')}`;

                const { error } = await supabase
                  .from('delivery_challans')
                  .insert([{ ...databasePayload, challan_no: newChallanNo }]);

                if (error) throw error;
                toast.success('Challan logged successfully!');
              }
              navigate('/Delivery-Challan/List'); // Redirect back straight to historical records grid
            } catch (err: any) {
              toast.error(err.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {({ values, handleChange }) => (
            <Form className="p-6">

              {/* ===== SECTION 1: SYSTEM INPUT CONTROLS ROW MATRIX OVERVIEW ===== */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4 mb-6 text-sm">

                {/* Field 1: DC # Index identifier code view wrapper */}
                <div>
                  <label className="block font-medium text-black dark:text-white mb-1.5 text-xs uppercase tracking-wide">DC #:</label>
                  <p className="text-primary font-bold text-sm">
                    {isEditMode ? `DC-ID-${editData.id}` : '(Auto Generated)'}
                  </p>
                </div>

                {/* Field 2: Customer drop-down picker parameter block */}
                <div>
                  <label className="block font-medium text-black dark:text-white mb-1.5 text-xs uppercase tracking-wide">Customer / Business Name: *</label>
                  <select name="customerName" onChange={handleChange} value={values.customerName} className="w-full rounded border border-stroke p-2 bg-transparent dark:border-strokedark text-black dark:bg-meta-4 dark:text-white outline-none focus:border-primary text-xs">
                    <option value="">Select Reference</option>
                    {customers.map(c => {
                      const code = c.customer_code || c.customerCode;
                      return (
                        <option key={c.id} value={c.customerName}>
                          {code ? `[${code}] ${c.customerName}` : c.customerName}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Field 3: Transportation selector mapping */}
                <div>
                  <label className="block font-medium text-black dark:text-white mb-1.5 text-xs uppercase tracking-wide">Transportation:</label>
                  <select name="transportation" onChange={handleChange} value={values.transportation} className="w-full rounded border border-stroke p-2 bg-white text-black dark:bg-meta-4 dark:text-white dark:border-strokedark outline-none focus:border-primary text-xs">
                    <option value="">Select Reference</option>
                    <option value="By Road Transport">By Road Transport</option>
                    <option value="Self Pickup">Self Pickup</option>
                    <option value="Third-Party Courier">Third-Party Courier</option>
                  </select>
                </div>

                {/* Field 4: P.O Number label context tracking */}
                <div>
                  <label className="block font-medium text-black dark:text-white mb-1.5 text-xs uppercase tracking-wide">P.O No:</label>
                  <input type="text" name="poNo" onChange={handleChange} value={values.poNo} className="w-full rounded border border-stroke p-2 bg-transparent dark:border-strokedark text-black dark:text-white outline-none focus:border-primary text-xs" placeholder="Enter P.O reference Code" />
                </div>

                {/* Field 5: P.O Date registration element picker */}
                <div>
                  <label className="block font-medium text-black dark:text-white mb-1.5 text-xs uppercase tracking-wide">P.O Date:</label>
                  <input type="date" name="poDate" onChange={handleChange} value={values.poDate} className="w-full rounded border border-stroke p-2 bg-transparent dark:border-strokedark text-black dark:bg-meta-4 dark:text-white outline-none focus:border-primary text-xs" />
                </div>

                {/* Field 6: DC Document log execution timestamp date */}
                <div>
                  <label className="block font-medium text-black dark:text-white mb-1.5 text-xs uppercase tracking-wide">DC Date:</label>
                  <input type="date" name="dcDate" onChange={handleChange} value={values.dcDate} className="w-full rounded border border-stroke p-2 bg-transparent dark:border-strokedark text-black dark:bg-meta-4 dark:text-white outline-none focus:border-primary text-xs" />
                </div>

                {/* Field 7: Vehicle identification number plate tracking box */}
                <div>
                  <label className="block font-medium text-black dark:text-white mb-1.5 text-xs uppercase tracking-wide">Vehicle No:</label>
                  <input type="text" name="vehicleNo" onChange={handleChange} value={values.vehicleNo} className="w-full rounded border border-stroke p-2 bg-transparent dark:border-strokedark text-black dark:text-white outline-none focus:border-primary text-xs" placeholder="e.g. LES-1122" />
                </div>

                {/* Field 8: Remarks description textbox logger block */}
                <div>
                  <label className="block font-medium text-black dark:text-white mb-1.5 text-xs uppercase tracking-wide">Remarks:</label>
                  <input type="text" name="remarks" onChange={handleChange} value={values.remarks} className="w-full rounded border border-stroke p-2 bg-transparent dark:border-strokedark text-black dark:text-white outline-none focus:border-primary text-xs" placeholder="Enter general annotations..." />
                </div>

                {/* Field 9: Gate Pass No tracker */}
                <div>
                  <label className="block font-medium text-black dark:text-white mb-1.5 text-xs uppercase tracking-wide">Gate Pass No:</label>
                  <input type="text" name="gatePassNo" onChange={handleChange} value={values.gatePassNo} className="w-full rounded border border-stroke p-2 bg-transparent dark:border-strokedark text-black dark:text-white outline-none focus:border-primary text-xs" placeholder="Manual Gate Pass No." />
                </div>
              </div>

              {/* ===== SECTION 2: DATATABLE ROW SPREADSHEET INPUT FIELDS BLOCK ===== */}
              <div className="overflow-x-auto mb-6 border border-stroke dark:border-strokedark rounded-sm">
                <table className="w-full border-collapse text-[11px] text-center min-w-[1200px]">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-meta-4 text-black dark:text-white font-bold uppercase tracking-wider border-b border-stroke dark:border-strokedark">
                      <th className="p-2 border-r border-stroke dark:border-strokedark w-10">S.#</th>
                      <th className="p-2 border-r border-stroke dark:border-strokedark w-24">P.O No#</th>
                      <th className="p-2 border-r border-stroke dark:border-strokedark text-left">Product / Description</th>
                      <th className="p-2 border-r border-stroke dark:border-strokedark w-24">Warehouse</th>
                      <th className="p-2 border-r border-stroke dark:border-strokedark w-20">Ordered</th>
                      <th className="p-2 border-r border-stroke dark:border-strokedark w-24 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">Dispatched</th>
                      <th className="p-2 border-r border-stroke dark:border-strokedark w-20 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">On Hold</th>
                      <th className="p-2 border-r border-stroke dark:border-strokedark w-24">Rate (PKR)</th>
                      <th className="p-2 border-r border-stroke dark:border-strokedark w-24">Dispatched Amount</th>
                      <th className="p-2 border-r border-stroke dark:border-strokedark">Notes</th>
                      <th className="p-2 w-10"> 🗑️ </th>
                    </tr>
                  </thead>
                  <FieldArray name="items">
                    {({ push, remove }) => (
                      <tbody className="bg-white dark:bg-boxdark">
                        {values.items.map((item: any, index: number) => {
                          const orderQty = Number(item.orderQty ?? item.qty ?? 0);
                          const dispatchedQty = Number(item.dispatchedQty ?? item.qty ?? 0);
                          const holdQty = Number(item.holdQty ?? Math.max(0, orderQty - dispatchedQty));
                          const rate = Number(item.rate) || 0;
                          const rowAmount = rate * dispatchedQty;

                          return (
                            <tr key={index} className="border-b border-stroke dark:border-strokedark font-medium">
                              <td className="p-1 border-r border-stroke dark:border-strokedark bg-gray-50 dark:bg-meta-4/20 dark:text-white text-black font-sans">{index + 1}</td>
                              <td className="p-1 border-r border-stroke dark:border-strokedark font-mono">
                                <input name={`items.${index}.poNoSub`} onChange={handleChange} value={item.poNoSub} className="w-full p-1 border border-stroke dark:border-strokedark dark:text-white text-black rounded-xs text-center bg-transparent" placeholder="P.O #" />
                              </td>
                              <td className="p-1 border-r border-stroke dark:border-strokedark text-left">
                                <input name={`items.${index}.pDescription`} onChange={handleChange} value={item.pDescription} className="w-full p-1 font-bold border border-stroke dark:border-strokedark dark:text-white text-black rounded-xs bg-transparent" placeholder="Enter Product Description" required />
                              </td>
                              <td className="p-1 border-r border-stroke dark:border-strokedark font-mono text-xs">
                                <input name={`items.${index}.location`} onChange={handleChange} value={item.location} className="w-full p-1 border border-stroke dark:border-strokedark dark:text-white text-black rounded-xs text-center bg-transparent" placeholder="Warehouse" />
                              </td>
                              {/* ORDERED QUANTITY */}
                              <td className="p-1 border-r border-stroke dark:border-strokedark bg-slate-50 dark:bg-slate-800/40">
                                <input
                                  type="number"
                                  name={`items.${index}.orderQty`}
                                  value={item.orderQty ?? item.qty ?? 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    const curDispatched = Number(item.dispatchedQty ?? item.qty ?? 0);
                                    const newHold = Math.max(0, val - curDispatched);
                                    handleChange(e);
                                    values.items[index].holdQty = newHold;
                                  }}
                                  className="w-full p-1 text-center font-bold font-mono text-slate-700 dark:text-slate-300 bg-transparent outline-none"
                                />
                              </td>
                              {/* DISPATCHED QUANTITY (APPROVED BY WAREHOUSE MANAGER) */}
                              <td className="p-1 border-r border-stroke dark:border-strokedark bg-emerald-50/50 dark:bg-emerald-950/20">
                                <input
                                  type="number"
                                  name={`items.${index}.dispatchedQty`}
                                  value={item.dispatchedQty ?? item.qty ?? 0}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    const curOrder = Number(item.orderQty ?? item.qty ?? 0);
                                    const cappedDispatched = Math.min(val, curOrder > 0 ? curOrder : val);
                                    const newHold = Math.max(0, (curOrder > 0 ? curOrder : val) - cappedDispatched);
                                    values.items[index].dispatchedQty = cappedDispatched;
                                    values.items[index].qty = cappedDispatched;
                                    values.items[index].holdQty = newHold;
                                    handleChange(e);
                                  }}
                                  className="w-full p-1 text-center font-black font-mono text-emerald-600 dark:text-emerald-400 bg-white dark:bg-boxdark border border-emerald-300 dark:border-emerald-700 rounded shadow-inner outline-none"
                                />
                              </td>
                              {/* HOLD QUANTITY (REMAINING ON HOLD) */}
                              <td className="p-1 border-r border-stroke dark:border-strokedark bg-amber-50/50 dark:bg-amber-950/20 font-mono font-bold text-amber-600 dark:text-amber-400 text-center">
                                {holdQty > 0 ? (
                                  <span className="inline-flex px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-xs">
                                    {holdQty} Hold
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs font-normal">0</span>
                                )}
                              </td>
                              {/* RATE */}
                              <td className="p-1 border-r border-stroke dark:border-strokedark">
                                <input type="number" name={`items.${index}.rate`} onKeyDown={blockInvalidChar} onChange={handleChange} value={item.rate} className="w-full p-1 border border-stroke dark:border-strokedark dark:text-white text-black rounded-xs text-center bg-transparent" />
                              </td>
                              {/* DISPATCHED AMOUNT */}
                              <td className="p-1 border-r border-stroke dark:border-strokedark font-mono font-bold text-success text-right pr-2">
                                Rs. {rowAmount.toFixed(2)}
                              </td>
                              <td className="p-1 border-r border-stroke dark:border-strokedark">
                                <input name={`items.${index}.notes`} onChange={handleChange} value={item.notes} className="w-full p-1 border border-stroke dark:border-strokedark dark:text-white text-black rounded-xs bg-transparent" placeholder="Line notes" />
                              </td>
                              <td className="p-1 text-center">
                                <button type="button" disabled={values.items.length === 1} onClick={() => remove(index)} className="text-red-500 font-bold hover:text-red-700 transition disabled:opacity-20">✕</button>
                              </td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td colSpan={11} className="p-2 text-left bg-gray-50 dark:bg-meta-4/10">
                            <button type="button" onClick={() => push({ poNoSub: '', pDescription: '', location: '', rate: 0, orderQty: 1, dispatchedQty: 1, holdQty: 0, qty: 1, disAmt: 0, distPer: 0, discount: 0, notes: '' })} className="text-success font-bold text-xs tracking-wide hover:underline">+ Add Item Row</button>
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </FieldArray>
                </table>
              </div>

              {/* ===== SECTION 3: CALCULATION TOTALS PANEL GRID LAYOUT SUMMARY ===== */}
              <div className="flex flex-col md:flex-row justify-end gap-10 mt-6 px-4 pb-6">
                <div className="w-full md:w-1/3 space-y-2 text-xs border border-stroke dark:border-strokedark rounded-sm p-4 bg-gray-50/50 dark:bg-meta-4/10">
                  <div className="flex justify-between border-b border-stroke pb-1.5 dark:border-strokedark">
                    <span className="font-medium text-gray-600 dark:text-gray-400">Total Ordered Quantity:</span>
                    <b className="text-black dark:text-white font-bold font-mono">{(values.items.reduce((acc, item) => acc + (Number(item.orderQty ?? item.qty) || 0), 0)).toFixed(2)}</b>
                  </div>
                  <div className="flex justify-between border-b border-stroke pb-1.5 dark:border-strokedark">
                    <span className="font-medium text-gray-600 dark:text-gray-400">Total Approved / Dispatched:</span>
                    <b className="text-success text-sm font-bold font-mono">{(values.items.reduce((acc, item) => acc + (Number(item.dispatchedQty ?? item.qty) || 0), 0)).toFixed(2)}</b>
                  </div>
                  <div className="flex justify-between border-b border-stroke pb-1.5 dark:border-strokedark">
                    <span className="font-medium text-gray-600 dark:text-gray-400">Total Quantity On Hold:</span>
                    <b className="text-amber-600 text-sm font-bold font-mono">{(values.items.reduce((acc, item) => acc + (Number(item.holdQty ?? Math.max(0, Number(item.orderQty ?? item.qty ?? 0) - Number(item.dispatchedQty ?? item.qty ?? 0))) || 0), 0)).toFixed(2)}</b>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="font-bold text-black dark:text-white">Total Dispatched Value:</span>
                    <b className="text-success text-sm font-black font-mono">Rs. {(values.items.reduce((acc, item) => acc + ((Number(item.rate) || 0) * (Number(item.dispatchedQty ?? item.qty) || 0)), 0)).toFixed(2)}</b>
                  </div>
                </div>
              </div>

              {/* ===== SECTION 4: GLOBAL FORM ACTIONS FOOTER ROW CONTROLS ===== */}
              <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-stroke dark:border-strokedark">
                <button
                  type="button"
                  onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Sales/Delivery-Challans/List`)}
                  className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                >
                  {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Record' : 'Save Record'}</span>}
                </button>
              </div>

            </Form>
          )}
        </Formik>

      </div>
    </div>
  );
};

export default AddDeliveryChallan;
