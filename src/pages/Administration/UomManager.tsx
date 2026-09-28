import React, { useEffect, useState } from 'react';
import { supabase } from '../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../ui/Spinner';
import { useAuth } from '../../Context/Auth';
import { MdAdd, MdCheckCircle, MdLayers, MdClose, MdEdit, MdDelete } from 'react-icons/md';

const DEFAULT_UOM_TEMPLATES = [
  { short_code: 'BOX', full_name: 'Box / Carton', category: 'Packaging & Containers', is_active: true },
  { short_code: 'PCS', full_name: 'Pieces', category: 'Count & Units', is_active: true },
  { short_code: 'NOS', full_name: 'Numbers', category: 'Count & Units', is_active: true },
  { short_code: 'EACH', full_name: 'Each', category: 'Count & Units', is_active: true },
  { short_code: 'SET', full_name: 'Sets', category: 'Count & Units', is_active: true },
  { short_code: 'PAIR', full_name: 'Pairs', category: 'Count & Units', is_active: true },
  { short_code: 'DOZ', full_name: 'Dozen (12 Pcs)', category: 'Count & Units', is_active: true },
  { short_code: 'CTN', full_name: 'Carton', category: 'Packaging & Containers', is_active: true },
  { short_code: 'PKT', full_name: 'Packet / Pack', category: 'Packaging & Containers', is_active: true },
  { short_code: 'BAG', full_name: 'Bag / Sack', category: 'Packaging & Containers', is_active: true },
  { short_code: 'BNDL', full_name: 'Bundle', category: 'Packaging & Containers', is_active: true },
  { short_code: 'ROLL', full_name: 'Roll', category: 'Packaging & Containers', is_active: true },
  { short_code: 'SQFT', full_name: 'Square Feet (Sq. Ft)', category: 'Area & Surface', is_active: true },
  { short_code: 'SQM', full_name: 'Square Meter (Sq. Mtr)', category: 'Area & Surface', is_active: true },
  { short_code: 'SQYD', full_name: 'Square Yard (Guz)', category: 'Area & Surface', is_active: false },
  { short_code: 'MTR', full_name: 'Meter (Linear Mtr)', category: 'Length & Distance', is_active: true },
  { short_code: 'FT', full_name: 'Foot / Feet', category: 'Length & Distance', is_active: true },
  { short_code: 'INCH', full_name: 'Inches', category: 'Length & Distance', is_active: true },
  { short_code: 'MM', full_name: 'Millimeter', category: 'Length & Distance', is_active: false },
  { short_code: 'YD', full_name: 'Yard (Guz)', category: 'Length & Distance', is_active: false },
  { short_code: 'KG', full_name: 'Kilogram (Kg)', category: 'Weight & Mass', is_active: true },
  { short_code: 'GM', full_name: 'Gram (g)', category: 'Weight & Mass', is_active: false },
  { short_code: 'TON', full_name: 'Metric Ton', category: 'Weight & Mass', is_active: true },
  { short_code: 'LBS', full_name: 'Pound (lb)', category: 'Weight & Mass', is_active: false },
  { short_code: 'LTR', full_name: 'Liter (Ltr)', category: 'Volume & Liquid', is_active: true },
  { short_code: 'ML', full_name: 'Milliliter (ml)', category: 'Volume & Liquid', is_active: false },
  { short_code: 'GAL', full_name: 'Gallon', category: 'Volume & Liquid', is_active: false }
];

const CATEGORY_OPTIONS = [
  'Count & Units',
  'Packaging & Containers',
  'Area & Surface',
  'Length & Distance',
  'Weight & Mass',
  'Volume & Liquid'
];

const UomManager = () => {
  const { tenantId } = useAuth();
  const [uoms, setUoms] = useState<any[]>([]);
  const [uomUsageCounts, setUomUsageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Count & Units');
  const [savingNew, setSavingNew] = useState(false);

  // Edit Modal State
  const [editingUom, setEditingUom] = useState<any>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Count & Units');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchUomCatalog();
  }, [tenantId]);

  const fetchUomCatalog = async () => {
    try {
      setLoading(true);
      const activeTenant = tenantId || 'bashir';

      const [uomRes, prodRes] = await Promise.all([
        supabase
          .from('inventory_uom')
          .select('*')
          .eq('tenant_id', activeTenant)
          .order('id', { ascending: true }),
        supabase
          .from('products')
          .select('uom')
      ]);

      if (uomRes.error) throw uomRes.error;

      // Calculate usage counts across products
      const counts: Record<string, number> = {};
      if (prodRes.data) {
        prodRes.data.forEach((p: any) => {
          if (p.uom) {
            const code = String(p.uom).trim().toUpperCase();
            counts[code] = (counts[code] || 0) + 1;
          }
        });
      }
      setUomUsageCounts(counts);

      let data = uomRes.data;

      // If tenant doesn't have UOM rows yet, seed from template
      if (!data || data.length === 0) {
        const newRows = DEFAULT_UOM_TEMPLATES.map(t => ({
          ...t,
          tenant_id: activeTenant
        }));

        const { data: inserted, error: insertErr } = await supabase
          .from('inventory_uom')
          .upsert(newRows, { onConflict: 'tenant_id,short_code' })
          .select('*')
          .order('id', { ascending: true });

        if (!insertErr && inserted) {
          data = inserted;
        } else {
          data = newRows.map((r, i) => ({ ...r, id: i + 1 }));
        }
      }

      setUoms(data || []);
    } catch (err: any) {
      toast.error('Failed to load units list from Supabase: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleState = async (unit: any) => {
    const code = String(unit.short_code || '').trim().toUpperCase();
    const count = uomUsageCounts[code] || 0;

    // Rule: Cannot disable currently using UOM
    if (unit.is_active && count > 0) {
      toast.error(`Cannot disable "${unit.short_code}": Currently used by ${count} product(s). Please reassign those products first.`);
      return;
    }

    const nextStatus = !unit.is_active;
    try {
      setUoms(prev => prev.map(u => u.id === unit.id ? { ...u, is_active: nextStatus } : u));

      const { error } = await supabase
        .from('inventory_uom')
        .update({ is_active: nextStatus })
        .eq('id', unit.id);

      if (error) throw error;
      toast.success(`UOM '${unit.short_code}' ${nextStatus ? 'Turned ON' : 'Turned OFF'}`);
    } catch (err: any) {
      toast.error('Database Sync Failure: ' + err.message);
      fetchUomCatalog();
    }
  };

  const handleAddCustomUom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      toast.error('Please enter both Short Code and Full Name.');
      return;
    }

    setSavingNew(true);
    try {
      const activeTenant = tenantId || 'bashir';
      const formattedCode = newCode.trim().toUpperCase();

      const { data, error } = await supabase
        .from('inventory_uom')
        .insert([{
          short_code: formattedCode,
          full_name: newName.trim(),
          category: newCategory,
          tenant_id: activeTenant,
          is_active: true
        }])
        .select('*')
        .single();

      if (error) throw error;

      toast.success(`Unit '${formattedCode}' added successfully!`);
      setUoms(prev => [...prev, data]);
      setShowAddModal(false);
      setNewCode('');
      setNewName('');
    } catch (err: any) {
      toast.error('Failed to add custom unit: ' + err.message);
    } finally {
      setSavingNew(false);
    }
  };

  const openEditModal = (uom: any) => {
    setEditingUom(uom);
    setEditCode(uom.short_code || '');
    setEditName(uom.full_name || '');
    setEditCategory(uom.category || 'Count & Units');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUom) return;
    if (!editCode.trim() || !editName.trim()) {
      toast.error('Please enter both Short Code and Full Name.');
      return;
    }

    setSavingEdit(true);
    try {
      const formattedCode = editCode.trim().toUpperCase();
      const oldCode = editingUom.short_code;
      const updatedFields = {
        short_code: formattedCode,
        full_name: editName.trim(),
        category: editCategory
      };

      const { error } = await supabase
        .from('inventory_uom')
        .update(updatedFields)
        .eq('id', editingUom.id);

      if (error) throw error;

      // Automatically cascade update to existing products using this UOM code
      if (oldCode && oldCode !== formattedCode) {
        await supabase
          .from('products')
          .update({ uom: formattedCode })
          .ilike('uom', oldCode);
      }

      toast.success(`Unit '${formattedCode}' updated and cascaded successfully!`);
      setUoms(prev => prev.map(u => u.id === editingUom.id ? { ...u, ...updatedFields } : u));
      setEditingUom(null);
    } catch (err: any) {
      toast.error('Failed to update unit: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteUom = async (uom: any) => {
    const code = String(uom.short_code || '').trim().toUpperCase();
    const count = uomUsageCounts[code] || 0;

    if (count > 0) {
      toast.error(`Cannot delete "${uom.short_code}": Currently in use by ${count} product(s). Please reassign those products before deleting.`);
      return;
    }

    const confirmDelete = window.confirm(`Are you sure you want to delete the unit "${uom.short_code} - ${uom.full_name}"?`);
    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from('inventory_uom')
        .delete()
        .eq('id', uom.id);

      if (error) throw error;

      toast.success(`Unit '${uom.short_code}' deleted successfully!`);
      setUoms(prev => prev.filter(u => u.id !== uom.id));
    } catch (err: any) {
      toast.error('Failed to delete unit: ' + err.message);
    }
  };

  const filteredUoms = uoms.filter(u =>
    u.short_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedUoms = filteredUoms.reduce((acc: any, curr: any) => {
    const cat = curr.category || 'Count & Units';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(curr);
    return acc;
  }, {});

  const activeCount = uoms.filter(u => u.is_active).length;

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-xs">
      {/* Component Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-black dark:text-white flex items-center gap-2">
            <MdLayers className="text-primary" size={24} />
            Units of Measurement (UOM) Switchboard
          </h2>
          <p className="text-gray-400 mt-0.5 text-xs">
            Turn individual units On or Off, edit names, or delete unwanted custom units across active ERP forms.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search unit codes, names..."
            className="w-full sm:w-64 rounded-lg border border-stroke py-2 px-3 bg-white dark:bg-boxdark dark:border-strokedark outline-none focus:border-primary text-black dark:text-white shadow-xs"
          />
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 bg-primary hover:bg-opacity-90 text-white px-4 py-2 rounded-lg font-bold transition whitespace-nowrap shadow-sm cursor-pointer"
          >
            <MdAdd size={16} /> Add Unit
          </button>
        </div>
      </div>

      {/* Summary Stat Pills */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="bg-slate-100 dark:bg-meta-4 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-full font-bold text-xs">
          Total Units: <strong className="text-black dark:text-white">{uoms.length}</strong>
        </span>
        <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-full font-bold text-xs flex items-center gap-1">
          <MdCheckCircle size={14} /> Active Units: <strong>{activeCount}</strong>
        </span>
        <span className="bg-gray-100 dark:bg-meta-4 text-gray-500 px-3 py-1 rounded-full font-bold text-xs">
          Inactive Units: <strong>{uoms.length - activeCount}</strong>
        </span>
      </div>

      {loading && uoms.length === 0 ? (
        <div className="flex h-48 items-center justify-center bg-white dark:bg-boxdark rounded border border-stroke dark:border-strokedark"><Spinner /></div>
      ) : Object.keys(groupedUoms).length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-boxdark rounded border border-stroke text-gray-500 font-medium">No active units located matching search parameters keywords.</div>
      ) : (
        /* Accordion Categorized Groups */
        <div className="space-y-6">
          {Object.keys(groupedUoms).map((categoryName) => (
            <div key={categoryName} className="rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark overflow-hidden shadow-xs">
              {/* Category Header */}
              <div className="bg-slate-100 dark:bg-meta-4 px-5 py-3 border-b border-stroke dark:border-strokedark flex items-center justify-between">
                <h3 className="font-extrabold text-black dark:text-white tracking-wider text-[11px] uppercase">
                  {categoryName}
                </h3>
                <span className="text-[10px] font-bold text-gray-500">
                  {groupedUoms[categoryName].filter((u: any) => u.is_active).length} / {groupedUoms[categoryName].length} Active
                </span>
              </div>

              {/* Units Grid */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedUoms[categoryName].map((unit: any) => {
                  const code = String(unit.short_code || '').trim().toUpperCase();
                  const inUseCount = uomUsageCounts[code] || 0;
                  return (
                    <div
                      key={unit.id || unit.short_code}
                      className={`flex items-center justify-between p-3 rounded-lg border duration-150 transition group ${
                        unit.is_active
                          ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 text-black dark:text-white font-semibold'
                          : 'border-stroke bg-white dark:border-strokedark dark:bg-boxdark text-gray-400 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="truncate pr-2 flex-1 flex items-center gap-1.5 flex-wrap">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                          unit.is_active 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' 
                            : 'bg-gray-100 dark:bg-meta-4 text-gray-400'
                        }`}>
                          {unit.short_code}
                        </span>
                        <span className="text-xs truncate">{unit.full_name}</span>
                        {inUseCount > 0 && (
                          <span 
                            className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 whitespace-nowrap"
                            title={`${inUseCount} active product(s) use this unit`}
                          >
                            In Use ({inUseCount})
                          </span>
                        )}
                      </div>

                      {/* Action Buttons: Edit, Delete, and Toggle Switch */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(unit)}
                          className="p-1 rounded text-gray-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-meta-4 transition cursor-pointer"
                          title={`Edit ${unit.short_code}`}
                        >
                          <MdEdit size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteUom(unit)}
                          className={`p-1 rounded transition cursor-pointer ${
                            inUseCount > 0
                              ? 'text-gray-300 dark:text-gray-600 hover:text-rose-500'
                              : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                          }`}
                          title={inUseCount > 0 ? `Cannot delete: used by ${inUseCount} product(s)` : `Delete ${unit.short_code}`}
                        >
                          <MdDelete size={15} />
                        </button>

                        {/* iOS Toggle Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleState(unit)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                            unit.is_active ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-meta-4'
                          }`}
                          title={
                            unit.is_active && inUseCount > 0
                              ? `In use by ${inUseCount} product(s) (Cannot disable)`
                              : unit.is_active
                              ? 'Click to turn OFF'
                              : 'Click to turn ON'
                          }
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                              unit.is_active ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Custom UOM Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-999 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-boxdark rounded-2xl p-6 shadow-2xl border border-stroke dark:border-strokedark">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-stroke dark:border-strokedark">
              <h3 className="font-bold text-base text-black dark:text-white flex items-center gap-2">
                <MdAdd className="text-primary" size={20} /> Add Custom Unit (UOM)
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-black dark:hover:text-white"
              >
                <MdClose size={20} />
              </button>
            </div>

            <form onSubmit={handleAddCustomUom} className="space-y-4">
              <div>
                <label className="block font-bold text-xs mb-1">Unit Short Code <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BDL, COIL, TIN"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent py-2 px-3 text-xs outline-none focus:border-primary uppercase font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-xs mb-1">Full Description / Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bundle / Coils"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent py-2 px-3 text-xs outline-none focus:border-primary font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-xs mb-1">Category Group</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent py-2 px-3 text-xs outline-none focus:border-primary dark:bg-boxdark"
                >
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-stroke dark:border-strokedark">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-stroke font-bold hover:bg-slate-50 dark:border-strokedark dark:hover:bg-meta-4 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNew}
                  className="px-5 py-2 rounded-lg bg-primary hover:bg-opacity-90 text-white font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {savingNew ? <Spinner /> : 'Save Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit UOM Modal */}
      {editingUom && (
        <div className="fixed inset-0 z-999 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-boxdark rounded-2xl p-6 shadow-2xl border border-stroke dark:border-strokedark">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-stroke dark:border-strokedark">
              <h3 className="font-bold text-base text-black dark:text-white flex items-center gap-2">
                <MdEdit className="text-primary" size={20} /> Edit Unit ({editingUom.short_code})
              </h3>
              <button
                onClick={() => setEditingUom(null)}
                className="text-gray-400 hover:text-black dark:hover:text-white"
              >
                <MdClose size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block font-bold text-xs mb-1">Unit Short Code <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent py-2 px-3 text-xs outline-none focus:border-primary uppercase font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-xs mb-1">Full Description / Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent py-2 px-3 text-xs outline-none focus:border-primary font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-xs mb-1">Category Group</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-lg border border-stroke bg-transparent py-2 px-3 text-xs outline-none focus:border-primary dark:bg-boxdark"
                >
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-stroke dark:border-strokedark">
                <button
                  type="button"
                  onClick={() => setEditingUom(null)}
                  className="px-4 py-2 rounded-lg border border-stroke font-bold hover:bg-slate-50 dark:border-strokedark dark:hover:bg-meta-4 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-lg bg-primary hover:bg-opacity-90 text-white font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? <Spinner /> : 'Update Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UomManager;
