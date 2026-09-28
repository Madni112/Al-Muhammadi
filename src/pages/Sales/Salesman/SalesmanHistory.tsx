import React, { useEffect, useState } from 'react'; 
import { useNavigate } from 'react-router-dom'; 
import { supabase } from '../../../Context/supabaseClient'; 
import { toast } from 'react-hot-toast'; 
import Spinner from '../../../ui/Spinner'; 
import TableActions from '../../../ui/TableActions';
import { useAuth } from '../../../Context/Auth';
import { MdAdd, MdClose, MdCheck, MdPersonAdd, MdReceiptLong, MdDelete, MdEdit } from 'react-icons/md';

const SalesmanHistory = () => { 
  const [salesmen, setSalesmen] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true); 
  const navigate = useNavigate(); 

  // Datatable search and page handlers
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Inline Add Invoice Name State
  const [activeAddId, setActiveAddId] = useState<string | number | null>(null);
  const [newInvoiceName, setNewInvoiceName] = useState('');
  const [savingId, setSavingId] = useState<string | number | null>(null);

  useEffect(() => { 
    fetchSalesmen(); 
  }, []); 

  const fetchSalesmen = async () => { 
    setLoading(true); 
    try { 
      const { data, error } = await supabase 
        .from('salesmen') 
        .select('*') 
        .order('name', { ascending: true }); 
      
      if (error) throw error; 
      setSalesmen(data || []); 
    } catch (err: any) { 
      toast.error(err.message); 
    } finally { 
      setLoading(false); 
    } 
  }; 

  // Add/Save Single Invoice Name handler for a salesman
  const handleAddInvoiceName = async (salesman: any) => {
    const trimmed = newInvoiceName.trim();
    if (!trimmed) {
      toast.error('Please enter an invoice name');
      return;
    }

    setSavingId(salesman.id);

    try {
      const { error } = await supabase
        .from('salesmen')
        .update({
          invoice_names: [trimmed],
          invoice_name: trimmed
        })
        .eq('id', salesman.id);

      if (error) throw error;

      setSalesmen(prev => prev.map(s => {
        if (s.id === salesman.id) {
          return {
            ...s,
            invoice_names: [trimmed],
            invoice_name: trimmed
          };
        }
        return s;
      }));

      toast.success(`Invoice name "${trimmed}" saved!`);
      setActiveAddId(null);
      setNewInvoiceName('');
    } catch (err: any) {
      toast.error('Failed to save invoice name: ' + err.message);
    } finally {
      setSavingId(null);
    }
  };

  // Delete/Remove single Invoice Name from a salesman
  const handleDeleteInvoiceName = async (salesman: any, nameToDelete: string) => {
    if (!window.confirm(`Are you sure you want to remove invoice name "${nameToDelete}"?`)) {
      return;
    }

    setSavingId(salesman.id);

    try {
      const { error } = await supabase
        .from('salesmen')
        .update({
          invoice_names: [],
          invoice_name: null
        })
        .eq('id', salesman.id);

      if (error) throw error;

      setSalesmen(prev => prev.map(s => {
        if (s.id === salesman.id) {
          return {
            ...s,
            invoice_names: [],
            invoice_name: null
          };
        }
        return s;
      }));

      toast.success(`Removed invoice name "${nameToDelete}"`);
    } catch (err: any) {
      toast.error('Failed to remove invoice name: ' + err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => { 
    if (window.confirm('Are you sure you want to delete this salesman record?')) { 
      try { 
        const { error } = await supabase.from('salesmen').delete().eq('id', id); 
        if (error) throw error; 
        toast.success('Salesman record deleted successfully'); 
        fetchSalesmen(); 
      } catch (err: any) { 
        toast.error(err.message); 
      } 
    } 
  }; 

  // Live query filter match (including invoice name lookup)
  const filteredSalesmen = salesmen.filter(s => {
    const term = searchTerm.toLowerCase();
    const invoiceNamesStr = (s.invoice_names || []).join(' ').toLowerCase() + ' ' + (s.invoice_name || '').toLowerCase();
    return (
      s.name?.toLowerCase().includes(term) ||
      s.phone?.includes(term) ||
      s.area?.toLowerCase().includes(term) ||
      invoiceNamesStr.includes(term)
    );
  });

  // Pagination parameters math bounds
  const totalEntries = filteredSalesmen.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedSalesmen = filteredSalesmen.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  return ( 
    <div className="rounded-sm border border-stroke bg-white px-5 pt-6 pb-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5"> 
      
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6"> 
        <div>
          <h4 className="text-xl font-semibold text-black dark:text-white">Sales Team Directory</h4> 
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage salesmen and their assigned invoice display names.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/Sales/Salesman/Add')}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          <MdPersonAdd size={16} />
          <span>Add New Salesman</span>
        </button>
      </div> 

      {/* Filter and Input line controllers */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-stroke py-1 px-2 bg-transparent dark:border-strokedark outline-none focus:border-primary text-sm font-medium text-black dark:text-white"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size} className="dark:bg-boxdark">{size}</option>
            ))}
          </select>
          <span>entries</span>
        </div>

        <div className="flex items-center gap-2 text-sm w-full sm:w-auto text-gray-500 dark:text-gray-400">
          <span>Search:</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search salesman, invoice name, area..."
            className="w-full sm:w-72 rounded border border-stroke py-1.5 px-3 bg-transparent dark:border-strokedark outline-none focus:border-primary text-sm text-black dark:text-white"
          />
        </div>
      </div>

      {/* Main Table Output Wireframe Container */}
      <div className="max-w-full overflow-x-auto"> 
        <table className="w-full table-auto border-collapse"> 
          <thead> 
            <tr className="bg-gray-2 text-left dark:bg-meta-4"> 
              <th className="py-4 px-4 font-medium text-black dark:text-white text-sm w-14">S#</th>
              <th className="min-w-[180px] py-4 px-4 font-medium text-black dark:text-white text-sm">Salesman Name</th> 
              <th className="min-w-[200px] py-4 px-4 font-medium text-black dark:text-white text-sm">Invoice Name</th> 
              <th className="min-w-[140px] py-4 px-4 font-medium text-black dark:text-white text-sm">Phone</th> 
              <th className="min-w-[120px] py-4 px-4 font-medium text-black dark:text-white text-sm">Area</th> 
            </tr> 
          </thead> 
          <tbody> 
            {loading ? ( 
              <tr><td colSpan={5} className="py-12 text-center"><Spinner /></td></tr> 
            ) : paginatedSalesmen.length === 0 ? ( 
              <tr><td colSpan={5} className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">No salesman records found.</td></tr> 
            ) : ( 
              paginatedSalesmen.map((salesman, idx) => {
                const serialNumber = startIndex + idx + 1;
                const isAddingThis = activeAddId === salesman.id;
                const isSavingThis = savingId === salesman.id;
                
                const invoiceName: string = Array.isArray(salesman.invoice_names) && salesman.invoice_names.length > 0
                  ? salesman.invoice_names[0]
                  : (salesman.invoice_name || '');

                return ( 
                  <tr key={salesman.id} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/10 duration-150"> 
                    <td className="py-3.5 px-4 text-sm text-black dark:text-white font-mono">{serialNumber}</td>
                    
                    {/* Salesman Name */}
                    <td className="py-3.5 px-4 text-sm font-semibold text-black dark:text-white"> 
                      {salesman.name}
                    </td> 

                    {/* Invoice Name Column with 1 Name Limit & Dynamic Add/Delete logic */}
                    <td className="py-3.5 px-4 text-sm">
                      <div className="flex items-center gap-1.5 min-h-[32px]">
                        {/* If an Invoice Name is present: Show single badge with delete button (Add button is gone) */}
                        {invoiceName ? (
                          <span
                            className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs group"
                          >
                            <MdReceiptLong size={14} className="text-emerald-600 dark:text-emerald-400" />
                            <span>{invoiceName}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteInvoiceName(salesman, invoiceName)}
                              disabled={isSavingThis}
                              title={`Delete invoice name "${invoiceName}"`}
                              className="text-emerald-600 hover:text-rose-600 dark:hover:text-rose-400 p-0.5 rounded transition cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            >
                              <MdClose size={13} />
                            </button>
                          </span>
                        ) : isAddingThis ? (
                          /* Inline Input when operator clicks Add */
                          <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-emerald-500 rounded-lg p-1 shadow-sm">
                            <input
                              type="text"
                              autoFocus
                              placeholder="Invoice name..."
                              value={newInvoiceName}
                              onChange={(e) => setNewInvoiceName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddInvoiceName(salesman);
                                } else if (e.key === 'Escape') {
                                  setActiveAddId(null);
                                  setNewInvoiceName('');
                                }
                              }}
                              className="px-2 py-0.5 text-xs text-black dark:text-white bg-transparent outline-none w-32 font-medium"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddInvoiceName(salesman)}
                              disabled={isSavingThis}
                              className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer transition disabled:opacity-50"
                              title="Save Invoice Name"
                            >
                              {isSavingThis ? <Spinner color="border-white" size="w-3 h-3" /> : <MdCheck size={14} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveAddId(null);
                                setNewInvoiceName('');
                              }}
                              className="p-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded cursor-pointer transition"
                              title="Cancel"
                            >
                              <MdClose size={14} />
                            </button>
                          </div>
                        ) : (
                          /* Only show Add button if NO invoice name is set */
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAddId(salesman.id);
                              setNewInvoiceName('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-2xs hover:border-emerald-300"
                          >
                            <MdAdd size={14} className="text-emerald-600" />
                            <span>Add</span>
                          </button>
                        )}
                      </div>
                    </td> 

                    {/* Phone */}
                    <td className="py-3.5 px-4 text-sm text-black dark:text-white"> 
                      {salesman.phone || 'N/A'}
                    </td> 

                    {/* Area */}
                    <td className="py-3.5 px-4 text-sm"> 
                      <p className="inline-flex rounded-full bg-success bg-opacity-10 py-1 px-3 text-xs font-medium text-success"> 
                        {salesman.area || 'General'} 
                      </p> 
                    </td> 
                  </tr> 
                );
              }) 
            )} 
          </tbody> 
        </table> 
      </div> 

      {/* Pagination control footer strip */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-stroke dark:border-strokedark">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing {startIndex + 1} to {endIndex} of {totalEntries} entries
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold disabled:opacity-40 cursor-pointer text-xs"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 font-bold text-teal-600 text-xs">
            Page {currentPage} of {totalPages || 1}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold disabled:opacity-40 cursor-pointer text-xs"
          >
            Next
          </button>
        </div>
      </div>

    </div> 
  ); 
}; 

export default SalesmanHistory;
