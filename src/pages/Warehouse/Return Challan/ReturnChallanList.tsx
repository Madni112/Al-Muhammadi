import React, { useEffect, useState } from 'react';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { MdInbox, MdHistory } from 'react-icons/md';
import { useModal } from '../../../Context/Modal';
import VerifyReturnChallan from './VerifyReturnChallan';
import ReturnChallanHistory from './ReturnChallanHistory';
import { isShopLocation } from '../../../utils/locationUtils';
import { useAuth } from '../../../Context/Auth';

interface ReturnChallanListProps {
  locationFilter?: 'SHOP' | 'WAREHOUSE' | 'ALL';
}

const ReturnChallanList: React.FC<ReturnChallanListProps> = ({ locationFilter = 'ALL' }) => {
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage] = useState(10);
  const { userLocationName } = useAuth();
  const { showModal, hideModal } = useModal();

  const openHistoryModal = () => {
    showModal(
      <ReturnChallanHistory 
        onView={(id) => {
          showModal(
            <VerifyReturnChallan 
              returnId={id} 
              readonly={true}
              onCancel={() => openHistoryModal()} 
            />,
            "View Return Receipt Details",
            undefined,
            "max-w-5xl"
          );
        }}
      />,
      "Processed Return Receipts",
      undefined,
      "max-w-5xl"
    );
  };

  useEffect(() => {
    fetchPendingReturns();
  }, [locationFilter]);

  const fetchPendingReturns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales_returns')
        .select('*')
        .in('inward_status', ['Pending Inward', 'Partially Received'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      let filteredData = data || [];
      if (userLocationName) {
        filteredData = filteredData.filter(ret => {
          return String(ret.warehouse_name || '').toUpperCase() === String(userLocationName).toUpperCase();
        });
      } else if (locationFilter !== 'ALL') {
        filteredData = filteredData.filter(ret => {
          const isShop = isShopLocation(ret.warehouse_name);
          return locationFilter === 'SHOP' ? isShop : !isShop;
        });
      }
      
      setReturns(filteredData);
    } catch (err: any) {
      toast.error('Failed to load pending returns.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = returns.filter(r =>
    String(r.return_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(r.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(r.invoice_no || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / entriesPerPage);
  const currentData = filtered.slice((currentPage - 1) * entriesPerPage, currentPage * entriesPerPage);

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 text-black dark:text-white text-xs p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-black dark:text-white flex items-center gap-2">
            <MdInbox size={24} className="text-primary" />
            Customer Returns Receiving
          </h2>
          <p className="text-gray-400 mt-0.5">Verify and receive customer returned goods into physical inventory</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={openHistoryModal}
            className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-meta-4 dark:hover:bg-meta-4/80 px-4 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 transition w-full sm:w-auto"
          >
            <MdHistory size={18} />
            History
          </button>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search return no, customer..."
            className="w-full sm:w-64 rounded-xl border border-stroke py-2 px-3 bg-white dark:bg-boxdark outline-none focus:border-primary font-semibold text-black dark:text-white text-xs shadow-xs"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6 overflow-hidden">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full table-auto border-collapse text-left">
            <thead>
              <tr className="bg-slate-100 dark:bg-meta-4 text-[10px] font-black uppercase tracking-wider border-b border-stroke text-slate-700 dark:text-white">
                <th className="py-3.5 px-4 whitespace-nowrap">Return Note #</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Invoice #</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Gate Pass #</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Return Date</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Customer Name</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-center">Location</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-center">Status</th>
                <th className="py-3.5 px-4 text-center w-28 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Spinner /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500 font-bold italic">No pending customer returns.</td></tr>
              ) : (
                currentData.map((ret) => (
                  <tr key={ret.id} className="border-b border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4/10 duration-150 font-semibold text-xs text-black dark:text-white">
                    <td className="py-3 px-4 font-bold font-mono whitespace-nowrap">
                      <span className="text-primary">{ret.return_no || `SR-${String(ret.id).padStart(4, '0')}`}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-500 whitespace-nowrap">{ret.invoice_no || '-'}</td>
                    <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap font-bold">{ret.gate_pass_no || '-'}</td>
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{ret.return_date}</td>
                    <td className="py-3 px-4 font-sans font-bold whitespace-nowrap">{ret.customer_name}</td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">{ret.warehouse_name}</td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className="inline-flex rounded-md py-0.5 px-2.5 text-[9px] font-black uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-300">
                        {ret.inward_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => {
                          showModal(
                            <VerifyReturnChallan 
                              returnId={ret.id} 
                              locationFilter={locationFilter}
                              onSuccess={() => {
                                hideModal();
                                fetchPendingReturns();
                              }} 
                              onCancel={() => hideModal()}
                            />,
                            "Verify Return Receipt",
                            undefined,
                            "max-w-5xl"
                          );
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold transition shadow-sm cursor-pointer"
                      >
                        Verify & Receive
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <div>
            Showing {filtered.length > 0 ? (currentPage - 1) * entriesPerPage + 1 : 0} to {Math.min(currentPage * entriesPerPage, filtered.length)} of {filtered.length} entries
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
    </div>
  );
};

export default ReturnChallanList;
