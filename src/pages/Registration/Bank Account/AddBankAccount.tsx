import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';

const AddBank = () => {
    const { tenantId } = useAuth();
    const [loading, setLoading] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const editData = location.state?.bank;
    const isEditMode = !!editData;

    const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
        ['-', 'e', 'E', '+'].includes(e.key) && e.preventDefault();

    const validationSchema = Yup.object().shape({
        bankName: Yup.string().required('Required'),
        accountTitle: Yup.string().required('Required'),
        accountNumber: Yup.string().required('Required'),
        branchName: Yup.string().required('Required'),
        branchNumber: Yup.string().required('Required'),
        branchCode: Yup.string().required('Required'),
        contactPerson: Yup.string().required('Required'),
        phoneNumber: Yup.string().required('Required'),
        openingBalance: Yup.number().min(0, 'Min 0').required('Required'),
        openingBalanceDate: Yup.string().required('Required'),
        address: Yup.string().required('Required'),
    });

    const handleSubmit = async (values: any) => {
        setLoading(true);
        try {
            // 1. CHECK FOR DUPLICATES (Querying Supabase by Account Number)
            let query = supabase
                .from('banks')
                .select('id')
                .eq('accountNumber', values.accountNumber.trim());

            // If editing, ignore the current record's own ID
            if (isEditMode) {
                query = query.neq('id', editData.id);
            }

            const { data: existingAccount, error: checkError } = await query;

            if (checkError) throw checkError;

            // 2. STOP EXECUTION IF DUPLICATE FOUND
            if (existingAccount && existingAccount.length > 0) {
                toast.error('Error: A bank account with this Account Number already exists!');
                setLoading(false);
                return; // Stops form from saving
            }

            // 3. PROCEED TO SAVE IF UNIQUE
            if (isEditMode) {
                const { error } = await supabase
                    .from('banks')
                    .update(values)
                    .eq('id', editData.id);
                if (error) throw error;

                // Sync update in Chart of Accounts
                await supabase
                    .from('chart_of_accounts')
                    .update({
                        account_code: values.accountNumber.trim(),
                        account_title: `${values.bankName.trim()} (A/C: ${values.accountNumber.trim()})`,
                    })
                    .eq('linked_bank_id', String(editData.id));

                toast.success('Account Details Updated Successfully!');
                navigate(`${tenantId ? `/${tenantId}` : ''}/Registration/Bank-Account/BankAccountList`);
            } else {
                const { data: insertedBank, error } = await supabase.from('banks').insert([values]).select('id').single();
                if (error) throw error;

                // Auto-create corresponding Asset ledger in Chart of Accounts
                await supabase.from('chart_of_accounts').insert([{
                    account_code: values.accountNumber.trim(),
                    account_title: `${values.bankName.trim()} (A/C: ${values.accountNumber.trim()})`,
                    category_code: '1. ASSETS',
                    sub_category_code: 'Current Assets',
                    control_code: 'Banks',
                    linked_bank_id: String(insertedBank?.id || ''),
                    notes: `Auto-linked bank ledger for ${values.accountTitle}`
                }]);

                toast.success('Bank Account Registered Successfully!');
                navigate(`${tenantId ? `/${tenantId}` : ''}/Registration/Bank-Account/BankAccountList`);
            }
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };



    return (
        <div className="mx-auto max-w-270">
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">

                <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark flex justify-between items-center">
                    <h3 className="font-medium text-black dark:text-white">
                        {isEditMode ? `Modify Account Details: ${editData.accountTitle}` : 'Register Bank Account / Cash Box'}
                    </h3>

                    {isEditMode ? (
                        <span
                            onClick={() => navigate('/Registration/Bank-Account/BankAccountList')}
                            className="text-sm text-primary font-medium hover:underline cursor-pointer"
                        >
                            ← Back to List
                        </span>
                    ) : (
                        <span
                            onClick={() => navigate('/Registration/Bank-Account/BankAccountList')}
                            className="text-sm text-primary font-medium hover:underline cursor-pointer"
                        >
                            👁 See List
                        </span>
                    )}
                </div>
                <Formik
                    initialValues={editData || {
                        bankName: '', accountTitle: '', accountNumber: '', branchName: '',
                        branchNumber: '', branchCode: '', contactPerson: '', address: '',
                        phoneNumber: '', openingBalance: 0, openingBalanceDate: new Date().toISOString().split('T')[0]
                    }}
                    enableReinitialize={true}
                    validationSchema={validationSchema}
                    onSubmit={handleSubmit}
                >
                    {({ handleChange, values, errors, touched }) => (
                        <Form className="p-6.5">
                            <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Bank Name *</label>
                                    <input
                                        name="bankName"
                                        onChange={handleChange}
                                        value={values.bankName}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-mono font-bold text-xs outline-none focus:border-primary ${touched.bankName && errors.bankName ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.bankName && errors.bankName && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.bankName)}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Account Title *</label>
                                    <input
                                        name="accountTitle"
                                        onChange={handleChange}
                                        value={values.accountTitle}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-bold text-xs outline-none focus:border-primary ${touched.accountTitle && errors.accountTitle ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.accountTitle && errors.accountTitle && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.accountTitle)}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Account Number *</label>
                                    <input
                                        name="accountNumber"
                                        onChange={handleChange}
                                        value={values.accountNumber}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-bold text-xs outline-none focus:border-primary ${touched.accountNumber && errors.accountNumber ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.accountNumber && errors.accountNumber && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.accountNumber)}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Branch Name *</label>
                                    <input
                                        name="branchName"
                                        onChange={handleChange}
                                        value={values.branchName}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-mono font-bold text-xs outline-none focus:border-primary ${touched.branchName && errors.branchName ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.branchName && errors.branchName && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.branchName)}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Branch Number *</label>
                                    <input
                                        name="branchNumber"
                                        onChange={handleChange}
                                        value={values.branchNumber}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-mono font-bold text-xs outline-none focus:border-primary ${touched.branchNumber && errors.branchNumber ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.branchNumber && errors.branchNumber && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.branchNumber)}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Branch Code *</label>
                                    <input
                                        name="branchCode"
                                        onChange={handleChange}
                                        value={values.branchCode}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-mono font-bold text-xs outline-none focus:border-primary ${touched.branchCode && errors.branchCode ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.branchCode && errors.branchCode && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.branchCode)}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Contact Person *</label>
                                    <input
                                        name="contactPerson"
                                        onChange={handleChange}
                                        value={values.contactPerson}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-mono font-bold text-xs outline-none focus:border-primary ${touched.contactPerson && errors.contactPerson ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.contactPerson && errors.contactPerson && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.contactPerson)}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Phone Number *</label>
                                    <input
                                        name="phoneNumber"
                                        onChange={handleChange}
                                        value={values.phoneNumber}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-mono font-bold text-xs outline-none focus:border-primary ${touched.phoneNumber && errors.phoneNumber ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.phoneNumber && errors.phoneNumber && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.phoneNumber)}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Opening Balance *</label>
                                    <input
                                        type="number"
                                        name="openingBalance"
                                        min="0"
                                        onKeyDown={blockInvalidChar}
                                        onChange={handleChange}
                                        value={values.openingBalance}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-mono font-bold text-xs outline-none focus:border-primary ${touched.openingBalance && errors.openingBalance ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.openingBalance && errors.openingBalance && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.openingBalance)}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Opening Balance Date *</label>
                                    <input
                                        type="date"
                                        name="openingBalanceDate"
                                        onChange={handleChange}
                                        value={values.openingBalanceDate}
                                        className={`w-full rounded border px-3 h-10 bg-transparent font-mono font-bold text-xs outline-none focus:border-primary ${touched.openingBalanceDate && errors.openingBalanceDate ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    />
                                    {touched.openingBalanceDate && errors.openingBalanceDate && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.openingBalanceDate)}</p>
                                    )}
                                </div>

                                <div className="md:col-span-2">
                                    <label className="mb-2 block text-xs font-semibold text-black dark:text-white">Address *</label>
                                    <textarea
                                        name="address"
                                        rows={2}
                                        onChange={handleChange}
                                        value={values.address}
                                        className={`w-full rounded border px-3 py-2 bg-transparent font-mono font-bold text-xs outline-none focus:border-primary h-auto ${touched.address && errors.address ? 'border-red-500' : 'border-stroke dark:border-strokedark'
                                            }`}
                                    ></textarea>
                                    {touched.address && errors.address && (
                                        <p className="text-red-500 text-[10px] mt-1 font-semibold">{String(errors.address)}</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-stroke dark:border-strokedark">
                                <button
                                    type="button"
                                    onClick={() => navigate('/Registration/Bank-Account/BankAccountList')}
                                    className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                                >
                                    {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Details' : 'Save Bank Account'}</span>}
                                </button>
                            </div>
                        </Form>
                    )}
                </Formik>
            </div>
        </div>
    );
};

export default AddBank;
