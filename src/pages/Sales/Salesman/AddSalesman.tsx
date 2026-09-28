import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';

const AddSalesman = () => {
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Extract salesman data if passed via navigation (Edit Mode) 
  const editData = location.state?.salesman;
  const isEditMode = !!editData;

  const validationSchema = Yup.object().shape({
    name: Yup.string().required('Salesman name is required'),
    phone: Yup.string().required('Phone number is required'),
  });

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      // --- DYNAMIC DUPLICATE VALIDATION CHECK ENGINE ---
      // Scans database for matching name + phone combinations
      let query = supabase
        .from('salesmen')
        .select('id')
        .eq('name', values.name.trim())
        .eq('phone', values.phone.trim());

      if (isEditMode) {
        query = query.neq('id', editData.id);
      }

      const { data: existingRecords, error: checkError } = await query;

      if (checkError) throw checkError;

      // If a match is found, halt execution and warn the operator
      if (existingRecords && existingRecords.length > 0) {
        toast.error('A salesman with this exact name and phone number already exists!');
        setLoading(false);
        return;
      }

      const payload: any = {
        name: values.name.trim(),
        phone: values.phone.trim(),
        area: values.area ? values.area.trim() : null,
        invoice_name: values.invoice_name ? values.invoice_name.trim() : null,
        invoice_names: values.invoice_name ? [values.invoice_name.trim()] : []
      };

      if (isEditMode) {
        // Retain existing invoice_names array if editing and adding
        if (editData.invoice_names && Array.isArray(editData.invoice_names) && editData.invoice_names.length > 0) {
          const invTrimmed = values.invoice_name ? values.invoice_name.trim() : null;
          const merged = invTrimmed && !editData.invoice_names.includes(invTrimmed)
            ? [...editData.invoice_names, invTrimmed]
            : editData.invoice_names;
          payload.invoice_names = merged;
          payload.invoice_name = merged[0] || invTrimmed;
        }

        // UPDATE EXISTING SALESMAN 
        const { error } = await supabase
          .from('salesmen')
          .update(payload)
          .eq('id', editData.id);

        if (error) throw error;
        toast.success('Salesman updated successfully!');
        navigate('/Salesman/list');
      } else {
        // INSERT NEW SALESMAN 
        const { error } = await supabase.from('salesmen').insert([payload]);
        if (error) throw error;
        toast.success('Salesman registered successfully!');
        navigate('/Salesman/list');
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
            {isEditMode ? `Edit Salesman: ${editData.name}` : 'Add New Salesman'}
          </h3>
          <button
            onClick={() => navigate('/Salesman/list')}
            className="text-sm text-primary hover:underline font-medium cursor-pointer"
          >
            {isEditMode ? 'Back to List' : 'See List'}
          </button>
        </div>

        <Formik
          initialValues={editData || { name: '', phone: '', area: '', invoice_name: '', commissionRate: 0 }}
          enableReinitialize={true}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ handleChange, values, errors, touched }) => (
            <Form className="p-6.5">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-3 block text-sm font-medium text-black dark:text-white">Full Name *</label>
                  <input name="name" onChange={handleChange} value={values.name} className={`w-full rounded border bg-transparent text-black dark:text-white p-3 outline-none focus:border-primary ${touched.name && errors.name ? 'border-red-500' : 'border-stroke'}`} />
                </div>
                <div>
                  <label className="mb-3 block text-sm font-medium text-black dark:text-white">Invoice Display Name</label>
                  <input name="invoice_name" onChange={handleChange} value={values.invoice_name || ''} placeholder="e.g. Ahmed" className="w-full rounded border bg-transparent text-black dark:text-white border-stroke p-3 outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-3 block text-sm font-medium text-black dark:text-white">Phone Number *</label>
                  <input name="phone" onChange={handleChange} value={values.phone} className={`w-full rounded border bg-transparent text-black dark:text-white p-3 outline-none focus:border-primary ${touched.phone && errors.phone ? 'border-red-500' : 'border-stroke'}`} />
                </div>
                <div>
                  <label className="mb-3 block text-sm font-medium text-black dark:text-white">Assigned Area</label>
                  <input name="area" onChange={handleChange} value={values.area} placeholder="e.g. Hyderabad" className="w-full rounded border bg-transparent text-black dark:text-white border-stroke p-3 outline-none focus:border-primary" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-stroke dark:border-strokedark">
                <button
                  type="button"
                  onClick={() => navigate('/Salesman/list')}
                  className="rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-3 px-6 font-bold text-slate-700 dark:text-slate-300 transition shadow-sm text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 px-8 font-bold text-white transition disabled:opacity-50 shadow-md text-xs cursor-pointer flex items-center gap-2"
                >
                  {loading ? <Spinner color="border-white" size="w-4 h-4" /> : <span>{isEditMode ? 'Update Salesman' : 'Save Salesman'}</span>}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default AddSalesman;
