import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Formik, Form, FieldArray } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';
import { logActivity } from '../../../service/auditLogger';

function AddVoucher() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);

  const [accountList, setAccountList] = useState<any[]>([]);
  const [salesmanList, setSalesmanList] = useState<any[]>([]);

  const editData = location.state?.voucher;
  const isEditMode = !!editData;

  useEffect(() => {
    const fetchVoucherMetadata = async () => {
      try {
        setMetadataLoading(true);
        const { data: coaData } = await supabase
          .from('chart_of_accounts')
          .select('account_code, account_title')
          .order('account_code', { ascending: true });
        const { data: bankData } = await supabase.from('banks').select('*');
        const { data: smData } = await supabase.from('salesmen').select('id, name');

        const accountMap: Record<string, string> = {};

        // Load actual Chart of Accounts from database
        if (coaData && Array.isArray(coaData)) {
          coaData.forEach((a: any) => {
            if (a.account_code) {
              accountMap[String(a.account_code).trim()] = a.account_title || `Account ${a.account_code}`;
            }
          });
        }

        // Seamlessly register all bank accounts so they show their real bank names
        if (bankData && Array.isArray(bankData)) {
          bankData.forEach((b: any) => {
            const accNum = b.accountNumber || b.accountnumber || b.account_no || b.id;
            const bName = b.bankName || b.bankname || 'Bank';
            const accTitle = b.accountTitle || b.accounttitle || b.account_title || accNum;
            const code = String(accNum).trim();
            if (!accountMap[code]) {
              accountMap[code] = `${bName} (${accTitle})`;
            }
          });
        }


        // If editing an existing historical voucher with an older code, preserve it in the list
        if (editData?.items && Array.isArray(editData.items)) {
          editData.items.forEach((it: any) => {
            const c = String(it.accountCode || '').trim();
            if (c && !accountMap[c]) {
              accountMap[c] = `Legacy / Auto Code (${c})`;
            }
          });
        }

        const mergedList = Object.keys(accountMap)
          .map(code => ({ account_code: code, account_title: accountMap[code] }))
          .sort((a, b) => a.account_code.localeCompare(b.account_code));

        setAccountList(mergedList);
        if (smData) setSalesmanList(smData);
      } catch (err: any) {
        toast.error('Failed to load chart codes or salesmen metadata');
      } finally {
        setMetadataLoading(false);
      }
    };
    fetchVoucherMetadata();
  }, []);

  const validationSchema = Yup.object().shape({
    voucherType: Yup.string().required('Please select a voucher type'),
    voucherDate: Yup.string().required('Required'),
    items: Yup.array().of(
      Yup.object().shape({
        accountCode: Yup.string().required('Required'),
        debit: Yup.number().min(0).required('Required'),
        credit: Yup.number().min(0).required('Required'),
      })
    ).min(2, 'Voucher entries require at least 2 balanced row lines')
  });

  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
    ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

  if (metadataLoading) return <div className="flex h-48 items-center justify-center"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-7xl text-xs">
      <div className="flex items-center gap-2 pb-4 mb-4 border-b border-stroke dark:border-strokedark text-xl font-bold text-black dark:text-white">
        <span>🧾</span> General Journal
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6">
        <h3 className="font-semibold text-gray-500 dark:text-textColor text-sm mb-6 border-b pb-2 tracking-wide">
          {isEditMode ? `Modify Voucher: ${editData.voucher_no}` : 'Add General Journal'}
        </h3>

        <Formik
          initialValues={isEditMode ? {
            voucherNo: editData.voucher_no || '',
            voucherType: editData.voucher_type || '',
            voucherDate: editData.voucher_date || '',
            notes: editData.notes || editData.narration || '',
            items: editData.items || []
          } : {
            voucherNo: `VCH-${Date.now().toString().slice(-6)}`,
            voucherType: '',
            voucherDate: new Date().toISOString().split('T')[0],
            notes: '',
            items: [
              { accountCode: '', salesman: '', description: '', debit: 0, credit: 0 },
              { accountCode: '', salesman: '', description: '', debit: 0, credit: 0 }
            ]
          }}
          enableReinitialize={true}
          validationSchema={validationSchema}
          onSubmit={async (values) => {
            let sumDebits = 0;
            let sumCredits = 0;

            values.items.forEach((item: any) => {
              sumDebits += Number(item.debit) || 0;
              sumCredits += Number(item.credit) || 0;
            });

            if (sumDebits.toFixed(2) !== sumCredits.toFixed(2)) {
              toast.error(`Unbalanced Entry! Total Debit (${sumDebits.toFixed(2)}) must match Total Credit (${sumCredits.toFixed(2)}).`);
              return;
            }

            try {
              setLoading(true);
              const databasePayload = {
                voucher_no: values.voucherNo,
                voucher_type: values.voucherType,
                voucher_date: values.voucherDate,
                narration: values.notes.trim(),
                notes: values.notes.trim(),
                total_amount: sumDebits,
                items: values.items
              };

              const { error } = isEditMode
                ? await supabase.from('financial_vouchers').update(databasePayload).eq('id', editData.id)
                : await supabase.from('financial_vouchers').insert([databasePayload]);

              if (error) throw error;

              logActivity({
                action: isEditMode ? 'UPDATE' : 'INSERT',
                tableName: 'financial_vouchers',
                details: {
                  voucher_no: values.voucherNo,
                  voucher_type: values.voucherType,
                  amount: sumDebits,
                  total_amount: sumDebits,
                  event: isEditMode ? 'Updated Financial Voucher' : 'Created Financial Voucher'
                },
                performedBy: user?.name || user?.email || 'User'
              });

              toast.success(isEditMode ? 'Voucher details updated successfully!' : 'Voucher saved successfully!');
              navigate('/Registration/Vouchers/List');
            } catch (err: any) {
              toast.error(err.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {({ handleChange, values, setFieldValue }) => {
            let totalDebits = 0;
            let totalCredits = 0;
            values.items.forEach((item: any) => {
              totalDebits += Number(item.debit) || 0;
              totalCredits += Number(item.credit) || 0;
            });

            return (
              <Form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-gray-500 mb-1 font-bold uppercase">Voucher #:</label>
                    <p className="text-gray-400 font-bold p-2 bg-gray-50 dark:bg-meta-4/10 rounded">{values.voucherNo}</p>
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1 font-bold uppercase">Voucher Type: *</label>
                    <select name="voucherType" onChange={handleChange} value={values.voucherType} className="w-full border border-stroke dark:border-strokedark rounded p-2.5 bg-transparent font-semibold dark:bg-boxdark text-black dark:text-white outline-none focus:border-primary">
                      <option value="" className="dark:bg-boxdark text-gray-400">Select Voucher Type</option>
                      <option value="Cash Payment Voucher" className="dark:bg-boxdark text-black dark:text-white">Cash Payment Voucher</option>
                      <option value="Bank Payment Voucher" className="dark:bg-boxdark text-black dark:text-white">Bank Payment Voucher</option>
                      <option value="Cash Receipt Voucher" className="dark:bg-boxdark text-black dark:text-white">Cash Receipt Voucher</option>
                      <option value="Bank Receipt Voucher" className="dark:bg-boxdark text-black dark:text-white">Bank Receipt Voucher</option>
                      <option value="Journal Voucher" className="dark:bg-boxdark text-black dark:text-white">Journal Voucher</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1 font-bold uppercase">Transaction Date: *</label>
                    <input type="date" name="voucherDate" onChange={handleChange} value={values.voucherDate} className="w-full border border-stroke dark:border-strokedark rounded p-2 bg-transparent font-bold text-black dark:text-white" />
                  </div>
                </div>

                <div className="overflow-x-auto border border-stroke dark:border-strokedark rounded p-4 bg-white dark:bg-boxdark shadow-xs">
                  <table className="w-full table-auto text-center border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-meta-4 font-bold text-gray-700 dark:text-white text-[11px] uppercase tracking-wide border-b">
                        <th className="p-2 border w-12">S.#</th>
                        <th className="p-2 border text-left min-w-[200px]">Chart Of Account *</th>
                        <th className="p-2 border min-w-[150px]">Salesman</th>
                        <th className="p-2 border min-w-[200px]">Description</th>
                        <th className="p-2 border w-32">Debit</th>
                        <th className="p-2 border w-32">Credit</th>
                        <th className="p-2 border w-10"></th>
                      </tr>
                    </thead>
                    <FieldArray name="items">
                      {({ push, remove }) => (
                        <tbody>
                          {values.items.map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2 border text-gray-400 font-medium bg-gray-50/30 dark:bg-meta-4/10">{idx + 1}</td>
                              <td className="p-2 border">
                                <select name={`items.${idx}.accountCode`} onChange={handleChange} value={String(item.accountCode || '')} className="w-full bg-transparent outline-none font-bold text-black dark:text-white dark:bg-boxdark">
                                  <option value="" className="text-gray-400 dark:bg-boxdark">-- Choose Account --</option>
                                  {accountList.map(a => <option key={a.account_code} value={String(a.account_code)} className="dark:bg-boxdark text-black dark:text-white">{`${a.account_code} - ${a.account_title}`}</option>)}
                                </select>
                              </td>
                              <td className="p-2 border">
                                <select name={`items.${idx}.salesman`} onChange={handleChange} value={item.salesman} className="w-full bg-transparent outline-none text-black dark:text-white dark:bg-boxdark font-semibold">
                                  <option value="" className="text-gray-400 dark:bg-boxdark">-- Select Salesman --</option>
                                  {salesmanList.map(s => <option key={s.id} value={s.name} className="dark:bg-boxdark text-black dark:text-white">{s.name}</option>)}
                                </select>
                              </td>
                              <td className="p-1 border">
                                <input type="text" name={`items.${idx}.description`} onChange={handleChange} value={item.description} className="w-full px-2 outline-none bg-transparent h-8 text-black dark:text-white" placeholder="Enter line details" />
                              </td>
                              <td className="p-1 border">
                                <input type="number" name={`items.${idx}.debit`} onKeyDown={blockInvalidChar} onChange={(e) => { handleChange(e); if (Number(e.target.value) > 0) setFieldValue(`items.${idx}.credit`, 0); }} value={item.debit} className="w-full text-center font-mono font-bold outline-none h-8 bg-transparent text-black dark:text-white" placeholder="0.00" />
                              </td>
                              <td className="p-1 border">
                                <input type="number" name={`items.${idx}.credit`} onKeyDown={blockInvalidChar} onChange={(e) => { handleChange(e); if (Number(e.target.value) > 0) setFieldValue(`items.${idx}.debit`, 0); }} value={item.credit} className="w-full text-center font-mono font-bold outline-none h-8 bg-transparent text-black dark:text-white" placeholder="0.00" />
                              </td>
                              <td className="p-2 border text-center">
                                {values.items.length > 2 && (
                                  <button type="button" onClick={() => remove(idx)} className="text-red-500 font-bold hover:scale-110 transition">✕</button>
                                )}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={7} className="p-2.5 text-left bg-gray-50/20">
                              <button type="button" onClick={() => push({ accountCode: '', salesman: '', description: '', debit: 0, credit: 0 })} className="text-success font-black hover:underline">+ Add Row</button>
                            </td>
                          </tr>
                          <tr className="font-bold bg-slate-50 dark:bg-meta-4/20 text-sm">
                            <td colSpan={4} className="p-3 border text-right font-bold text-black dark:text-white uppercase text-xs">Total Amount</td>
                            <td className={`p-3 border text-center font-mono ${totalDebits.toFixed(2) === totalCredits.toFixed(2) && totalDebits > 0 ? 'text-success' : 'text-danger'}`}>{totalDebits.toFixed(2)}</td>
                            <td className={`p-3 border text-center font-mono ${totalDebits.toFixed(2) === totalCredits.toFixed(2) && totalDebits > 0 ? 'text-success' : 'text-danger'}`}>{totalCredits.toFixed(2)}</td>
                            <td className="border bg-white dark:bg-boxdark"></td>
                          </tr>
                        </tbody>
                      )}
                    </FieldArray>
                  </table>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="block text-gray-500 font-bold uppercase">Voucher Note:</label>
                  <textarea name="notes" rows={3} onChange={handleChange} value={values.notes} className="w-full md:w-150 border border-stroke dark:border-strokedark rounded p-2.5 bg-transparent outline-none focus:border-primary text-black dark:text-white" placeholder="Enter overall transaction references note description summary here..." />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-stroke dark:border-strokedark">
                  <button
                    type="button"
                    onClick={() => navigate('/Registration/Vouchers/List')}
                    className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Record' : 'Add Record'}</span>}
                  </button>
                </div>
              </Form>
            );
          }}
        </Formik>
      </div>
    </div>
  );
}

export default AddVoucher;
