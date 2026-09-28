import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { useAuth } from '../../../Context/Auth';

const AddCustomer = () => {
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const { tenantId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract customer data if passed via navigation (Edit Mode) 
  const editData = location.state?.customer;
  const isEditMode = !!editData;

  useEffect(() => {
    const fetchCompanies = async () => {
      const { data } = await supabase.from('companies').select('id, name');
      if (data) setCompanies(data);
    };
    fetchCompanies();
  }, []);

  const validationSchema = Yup.object().shape({
    customerName: Yup.string().required('Customer / Business Name is required'),
    primaryPhone: Yup.string().required('Primary Contact Phone is required'),
  });

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      // --- DYNAMIC DUPLICATE VALIDATION CHECK ENGINE ---
      let query = supabase
        .from('customers')
        .select('id')
        .eq('customerName', values.customerName.trim())
        .eq('company', values.company || '');

      if (isEditMode) {
        query = query.neq('id', editData.id);
      }

      const { data: existingRecords, error: checkError } = await query;
      if (checkError) throw checkError;

      if (existingRecords && existingRecords.length > 0) {
        toast.error('A customer with this exact name and company selection already exists!');
        setLoading(false);
        return;
      }

      const payload = {
        ...values,
        customerName: values.customerName.trim(),
        customer_code: values.customer_code ? values.customer_code.trim() : (values.customerCode ? values.customerCode.trim() : ''),
        customerCode: values.customer_code ? values.customer_code.trim() : (values.customerCode ? values.customerCode.trim() : ''),
        ntnNo: values.ntnNo ? values.ntnNo.trim() : '',
        cnicNo: values.cnicNo ? values.cnicNo.trim() : '',
        stRegNo: values.stRegNo ? values.stRegNo.trim() : '',
        address: values.address ? values.address.trim() : '',
      };

      if (isEditMode) {
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editData.id);

        if (error) throw error;
        toast.success('Customer profile updated successfully!');
        navigate(`${tenantId ? `/${tenantId}` : ''}/Customers/list`);
      } else {
        const { error } = await supabase.from('customers').insert([payload]);
        if (error) throw error;
        toast.success('Customer registered successfully!');
        navigate(`${tenantId ? `/${tenantId}` : ''}/Customers/list`);
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
          <h3 className="font-semibold text-black dark:text-white text-base">
            {isEditMode ? `Edit Customer: ${editData.customerName}` : 'New Customer Registration'}
          </h3>
          <button
            type="button"
            onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Customers/list`)}
            className="text-sm text-primary hover:underline font-medium cursor-pointer"
          >
            {isEditMode ? 'Back to List' : 'See List'}
          </button>
        </div>

        <Formik
          initialValues={editData ? {
            ...editData,
            customer_code: editData.customer_code || editData.customerCode || '',
          } : {
            customerName: '',
            customer_code: '',
            registrationType: 'Retail / General',
            ntnNo: '',
            cnicNo: '',
            stRegNo: '',
            primaryPhone: '',
            email: '',
            address: '',
            province: 'Sindh',
            company: '',
            website: '',
            notes: '',
            followUpDate: ''
          }}
          enableReinitialize={true}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ handleChange, values, errors, touched, setFieldValue }) => (
            <Form className="p-6.5">
              {/* Primary Fast Customer Registration Info */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-black dark:text-white">
                    Customer / Business Name *
                  </label>
                  <input
                    name="customerName"
                    onChange={handleChange}
                    value={values.customerName}
                    placeholder="e.g. Haji Muhammad / Al-Madina Trading"
                    className={`w-full rounded border bg-transparent text-black dark:text-white p-3 outline-none text-xs font-semibold focus:border-primary ${touched.customerName && errors.customerName ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}
                  />
                  {touched.customerName && errors.customerName && (
                    <p className="text-red-500 text-[11px] mt-1">{errors.customerName as string}</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-black dark:text-white">
                    Customer Code (Optional)
                  </label>
                  <input
                    name="customer_code"
                    onChange={handleChange}
                    value={values.customer_code || values.customerCode || ''}
                    placeholder="e.g. CUST-001 or 1020-001"
                    className="w-full rounded border border-stroke dark:border-strokedark bg-transparent text-black dark:text-white p-3 outline-none text-xs font-mono focus:border-primary"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-black dark:text-white">
                    Primary Contact Phone *
                  </label>
                  <input
                    name="primaryPhone"
                    onChange={handleChange}
                    value={values.primaryPhone}
                    placeholder="0300-1234567"
                    className={`w-full rounded border bg-transparent text-black dark:text-white p-3 outline-none text-xs focus:border-primary ${touched.primaryPhone && errors.primaryPhone ? 'border-red-500' : 'border-stroke dark:border-strokedark'}`}
                  />
                  {touched.primaryPhone && errors.primaryPhone && (
                    <p className="text-red-500 text-[11px] mt-1">{errors.primaryPhone as string}</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-black dark:text-white">
                    Customer Category / Type
                  </label>
                  <select
                    name="registrationType"
                    onChange={handleChange}
                    value={values.registrationType || 'Retail / General'}
                    className="w-full rounded border border-stroke dark:border-strokedark bg-transparent text-black dark:text-white p-3 outline-none text-xs font-semibold focus:border-primary dark:bg-boxdark"
                  >
                    <option value="Retail / General">Retail / Walk-in Customer (Standard)</option>
                    <option value="Contractor / Builder">Contractor / Builder / Architect</option>
                    <option value="Wholesaler / Dealer">Wholesaler / Distributor</option>
                    <option value="Registered Corporate">Corporate / Registered Tax Filer</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-black dark:text-white">
                    Province / Region
                  </label>
                  <select
                    name="province"
                    onChange={handleChange}
                    value={values.province || 'Sindh'}
                    className="w-full rounded border border-stroke dark:border-strokedark bg-transparent text-black dark:text-white p-3 outline-none text-xs font-semibold focus:border-primary dark:bg-boxdark"
                  >
                    <option value="Sindh">Sindh</option>
                    <option value="Punjab">Punjab</option>
                    <option value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa</option>
                    <option value="Balochistan">Balochistan</option>
                    <option value="Islamabad">Islamabad (ICT)</option>
                    <option value="Azad Jammu and Kashmir">Azad Jammu and Kashmir (AJK)</option>
                    <option value="Gilgit-Baltistan">Gilgit-Baltistan (GB)</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-black dark:text-white">
                    Delivery Address / Location
                  </label>
                  <textarea
                    name="address"
                    rows={2}
                    onChange={handleChange}
                    value={values.address}
                    placeholder="Shop #, Street, Area / City (e.g. Saddar, Hyderabad)"
                    className="w-full rounded border border-stroke dark:border-strokedark bg-transparent text-black dark:text-white p-3 outline-none text-xs focus:border-primary"
                  />
                </div>
              </div>

              {/* Optional Corporate & Tax ID Section */}
              <div className="mt-6 p-4 rounded-lg bg-slate-50 dark:bg-meta-4/10 border border-stroke dark:border-strokedark space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Additional Identity & Tax Details (Optional)
                  </span>
                  <span className="text-[11px] text-gray-400 font-sans">
                    For corporate accounts, CNIC, or NTN records
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold text-gray-500 dark:text-gray-400">
                      CNIC No. (Optional)
                    </label>
                    <input
                      name="cnicNo"
                      onChange={handleChange}
                      value={values.cnicNo}
                      placeholder="e.g. 41303-1234567-1"
                      className="w-full rounded border border-stroke dark:border-strokedark bg-white dark:bg-boxdark text-black dark:text-white p-2.5 outline-none text-xs font-mono focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold text-gray-500 dark:text-gray-400">
                      NTN No. (Optional)
                    </label>
                    <input
                      name="ntnNo"
                      onChange={handleChange}
                      value={values.ntnNo}
                      placeholder="e.g. 1234567-8"
                      className="w-full rounded border border-stroke dark:border-strokedark bg-white dark:bg-boxdark text-black dark:text-white p-2.5 outline-none text-xs font-mono focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold text-gray-500 dark:text-gray-400">
                      Sales Tax STRN (Optional)
                    </label>
                    <input
                      name="stRegNo"
                      onChange={handleChange}
                      value={values.stRegNo}
                      placeholder="e.g. 17-00-1234-567-89"
                      className="w-full rounded border border-stroke dark:border-strokedark bg-white dark:bg-boxdark text-black dark:text-white p-2.5 outline-none text-xs font-mono focus:border-primary"
                    />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mt-6">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-black dark:text-white">
                    Client Business Entity / Branch
                  </label>
                  <select
                    name="company"
                    onChange={handleChange}
                    value={values.company}
                    className="w-full rounded border border-stroke dark:border-strokedark bg-transparent text-black dark:text-white p-3 outline-none text-xs focus:border-primary dark:bg-boxdark"
                  >
                    <option value="">-- General Customer --</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-black dark:text-white">
                    Follow-up Date
                  </label>
                  <input
                    type="date"
                    name="followUpDate"
                    onChange={handleChange}
                    value={values.followUpDate}
                    className="w-full rounded border border-stroke dark:border-strokedark bg-transparent text-black dark:text-white p-3 outline-none text-xs focus:border-primary dark:bg-boxdark"
                  />
                </div>
              </div>

              <div className="pt-5 mt-6 border-t border-stroke dark:border-strokedark flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`${tenantId ? `/${tenantId}` : ''}/Customers/list`)}
                  className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                >
                  {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Customer Profile' : 'Save Customer Profile'}</span>}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default AddCustomer;

