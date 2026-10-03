import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../ui/Spinner';
import TableActions from '../../ui/TableActions';
import { MdDelete, MdAdd, MdCategory, MdClose, MdChevronRight, MdFolder, MdSave, MdEdit } from 'react-icons/md';
import SearchableDropdown from '../../components/SearchableDropdown';
import { useAuth } from '../../Context/Auth';

const Categories = () => {
    const { tenantId } = useAuth();
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Form states
    const [selectedParentId, setSelectedParentId] = useState<string | number>('');
    const [selectedSubId, setSelectedSubId] = useState<string | number>('');
    const [categoryName, setCategoryName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [editCategoryId, setEditCategoryId] = useState<string | number | null>(null);

    // Modal states
    const [isParentModalOpen, setIsParentModalOpen] = useState(false);
    const [newParentName, setNewParentName] = useState('');
    const [isSubModalOpen, setIsSubModalOpen] = useState(false);
    const [newSubName, setNewSubName] = useState('');
    const [modalSubmitting, setModalSubmitting] = useState(false);

    // Pagination and Lookup filters control parameters
    const [searchTerm, setSearchTerm] = useState('');
    const [pageSize, setPageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        fetchCategories();
    }, [tenantId]);

    const fetchCategories = async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('inventory_categories')
                .select('*')
                .order('name', { ascending: true });

            if (tenantId) {
                query = query.eq('tenant_id', tenantId);
            }

            const { data, error } = await query;
            if (error) throw error;
            setCategories(data || []);
        } catch (err: any) {
            toast.error('Failed to load categories: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- Computed Hierarchies ---
    const parentCategories = useMemo(() => categories.filter(c => c.parent_id === null), [categories]);

    const subCategories = useMemo(() => {
        if (!selectedParentId) return [];
        return categories.filter(c => c.parent_id === Number(selectedParentId));
    }, [categories, selectedParentId]);

    const bottomCategories = useMemo(() => {
        // A bottom category is one whose parent is a subCategory
        const subCatIds = new Set(categories.filter(c => c.parent_id && categories.find(p => p.id === c.parent_id)?.parent_id === null).map(c => c.id));
        return categories.filter(c => c.parent_id && subCatIds.has(c.parent_id));
    }, [categories]);

    // Handle cascading resets
    // (Removed useEffect to prevent clearing during edit mode auto-fill)

    // --- Actions ---
    const handleCreateParent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newParentName.trim()) return toast.error('Name is required');

        try {
            setModalSubmitting(true);
            const isDuplicate = categories.some(c => c.name?.toLowerCase() === newParentName.trim().toLowerCase() && c.parent_id === null);
            if (isDuplicate) return toast.error('Parent category already exists');

            const payload: any = { name: newParentName.trim(), parent_id: null };
            if (tenantId) payload.tenant_id = tenantId;

            const { data, error } = await supabase.from('inventory_categories').insert([payload]).select();
            if (error) throw error;

            toast.success('Parent Category created!');
            setNewParentName('');
            setIsParentModalOpen(false);
            await fetchCategories();
            if (data && data.length > 0) setSelectedParentId(data[0].id);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setModalSubmitting(false);
        }
    };

    const handleCreateSub = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSubName.trim()) return toast.error('Name is required');
        if (!selectedParentId) return toast.error('Please select a Parent Category first');

        try {
            setModalSubmitting(true);
            const isDuplicate = subCategories.some(c => c.name?.toLowerCase() === newSubName.trim().toLowerCase());
            if (isDuplicate) return toast.error('Sub category already exists under this parent');

            const payload: any = { name: newSubName.trim(), parent_id: selectedParentId };
            if (tenantId) payload.tenant_id = tenantId;

            const { data, error } = await supabase.from('inventory_categories').insert([payload]).select();
            if (error) throw error;

            toast.success('Sub Category created!');
            setNewSubName('');
            setIsSubModalOpen(false);
            await fetchCategories();
            if (data && data.length > 0) setSelectedSubId(data[0].id);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setModalSubmitting(false);
        }
    };

    const handleCreateCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!categoryName.trim()) return toast.error('Category Name is required');
        if (!selectedSubId) return toast.error('Please select a Sub Category');

        try {
            setSubmitting(true);
            const isDuplicate = categories
                .filter(c => c.parent_id === Number(selectedSubId) && c.id !== editCategoryId)
                .some(c => c.name?.toLowerCase() === categoryName.trim().toLowerCase());
            if (isDuplicate) return toast.error('Category already exists under this sub category');

            const payload: any = { name: categoryName.trim(), parent_id: selectedSubId };
            if (tenantId) payload.tenant_id = tenantId;

            if (editCategoryId) {
                const { error } = await supabase.from('inventory_categories').update(payload).eq('id', editCategoryId);
                if (error) throw error;
                toast.success('Category updated successfully!');
            } else {
                const { error } = await supabase.from('inventory_categories').insert([payload]);
                if (error) throw error;
                toast.success('Category created successfully!');
            }

            setCategoryName('');
            setEditCategoryId(null);
            fetchCategories();
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditCategory = (cat: any) => {
        setEditCategoryId(cat.id);
        setCategoryName(cat.name);
        
        const subCat = categories.find(c => c.id === cat.parent_id);
        if (subCat) {
            setSelectedSubId(subCat.id);
            const parentCat = categories.find(c => c.id === subCat.parent_id);
            if (parentCat) {
                setSelectedParentId(parentCat.id);
            } else {
                setSelectedParentId('');
            }
        } else {
            setSelectedSubId('');
            setSelectedParentId('');
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string | number, type: 'Parent' | 'Sub' | 'Category') => {
        if (!window.confirm(`Are you sure you want to delete this ${type} Category? This may affect items tied to it.`)) return;

        try {
            const { error } = await supabase.from('inventory_categories').delete().eq('id', id);
            if (error) throw error;
            toast.success(`${type} Category deleted cleanly.`);

            if (type === 'Parent' && id == selectedParentId) setSelectedParentId('');
            if (type === 'Sub' && id == selectedSubId) setSelectedSubId('');

            fetchCategories();
        } catch (err: any) {
            toast.error('Could not delete: ' + err.message);
        }
    };

    // Filter only bottom categories for the table
    const filteredCategories = bottomCategories.filter((c) =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalEntries = filteredCategories.length;
    const totalPages = Math.ceil(totalEntries / pageSize);
    const startIndex = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalEntries);
    const paginatedCategories = filteredCategories.slice(startIndex, startIndex + pageSize);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, pageSize]);

    return (
        <div className="mx-auto max-w-7xl flex flex-col gap-6 relative">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-black dark:text-white flex items-center gap-2">
                    Categories
                </h2>
            </div>

            {/* CREATION FORM */}
            <div className="rounded-xl border shadow-xs p-5 transition duration-150 border-slate-200/80 bg-white dark:border-slate-800 dark:bg-boxdark">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                        <MdCategory className="text-emerald-600 text-lg" />
                        <span>{editCategoryId ? 'Edit Category Structure' : 'Register New Category Structure'}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">

                    {/* Parent Category */}
                    <div>
                        <label className="block text-gray-500 mb-1.5 text-xs font-bold">
                            Parent Category (e.g. Tiles)
                        </label>
                        <div className="flex items-center gap-2">
                            <SearchableDropdown
                                value={parentCategories.find(c => c.id.toString() === selectedParentId.toString())?.name || ''}
                                onChange={(val) => {
                                    if (!val) {
                                        setSelectedParentId('');
                                        setSelectedSubId('');
                                        return;
                                    }
                                    const cat = parentCategories.find(c => c.name === val);
                                    setSelectedParentId(cat ? cat.id.toString() : '');
                                    setSelectedSubId('');
                                }}
                                options={parentCategories.map(c => c.name)}
                                placeholder="Parent Category"
                                allowAll={false}
                                className="flex-1"
                            />
                            {selectedParentId ? (
                                <button type="button" onClick={() => handleDelete(selectedParentId, 'Parent')} className="h-[42px] w-[42px] flex shrink-0 items-center justify-center bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 text-rose-500 rounded-lg transition" title="Delete Parent Category">
                                    <MdDelete size={20} />
                                </button>
                            ) : (
                                <button type="button" onClick={() => setIsParentModalOpen(true)} className="h-[42px] w-[42px] flex shrink-0 items-center justify-center bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 rounded-lg transition" title="Create New Parent Category">
                                    <MdAdd size={24} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Sub Category */}
                    <div>
                        <label className="block text-gray-500 mb-1.5 text-xs font-bold">
                            Sub Category
                        </label>
                        <div className="flex items-center gap-2">
                            <SearchableDropdown
                                value={subCategories.find(c => c.id.toString() === selectedSubId.toString())?.name || ''}
                                onChange={(val) => {
                                    if (!val) {
                                        setSelectedSubId('');
                                        return;
                                    }
                                    const cat = subCategories.find(c => c.name === val);
                                    setSelectedSubId(cat ? cat.id.toString() : '');
                                }}
                                options={subCategories.map(c => c.name)}
                                placeholder="Sub Category"
                                allowAll={false}
                                disabled={!selectedParentId}
                                className="flex-1"
                            />
                            {selectedSubId ? (
                                <button type="button" onClick={() => handleDelete(selectedSubId, 'Sub')} className="h-[42px] w-[42px] flex shrink-0 items-center justify-center bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 text-rose-500 rounded-lg transition" title="Delete Sub Category">
                                    <MdDelete size={20} />
                                </button>
                            ) : (
                                <button type="button" disabled={!selectedParentId} onClick={() => setIsSubModalOpen(true)} className="h-[42px] w-[42px] flex shrink-0 items-center justify-center bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed" title="Create New Sub Category">
                                    <MdAdd size={24} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Category (Bottom Level) */}
                    <form onSubmit={handleCreateCategory} className="flex items-center gap-2">
                        <div className="flex-1">
                            <label className="block text-gray-500 mb-1.5 text-xs font-bold">
                                Category *
                            </label>
                            <input
                                type="text"
                                value={categoryName}
                                onChange={(e) => setCategoryName(e.target.value)}
                                disabled={!selectedSubId}
                                className="w-full border border-stroke rounded-lg p-2 bg-transparent dark:border-strokedark outline-none focus:border-primary text-black dark:text-white font-bold text-xs h-[42px] disabled:opacity-50"
                                placeholder="Enter category..."
                                required
                            />
                        </div>
                        <div className="flex items-center gap-2 mt-[22px]">
                            <button
                                type="submit"
                                disabled={!selectedSubId || submitting}
                                className="h-[42px] px-6 flex shrink-0 items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm gap-2"
                            >
                                {submitting ? <Spinner /> : <><MdSave size={16} /> {editCategoryId ? 'Update' : 'Save'}</>}
                            </button>
                            {editCategoryId && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditCategoryId(null);
                                        setCategoryName('');
                                        setSelectedSubId('');
                                        setSelectedParentId('');
                                    }}
                                    className="h-[42px] px-4 flex shrink-0 items-center justify-center bg-slate-200 hover:bg-slate-300 dark:bg-meta-4 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-bold text-xs rounded-lg transition shadow-sm"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>

                </div>
            </div>

            {/* TABLE */}
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark p-6">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>Show</span>
                        <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="rounded border border-stroke py-1 px-2 bg-transparent dark:border-strokedark outline-none focus:border-primary text-xs font-semibold text-black dark:text-white"
                        >
                            {[5, 10, 25, 50].map((size) => (
                                <option key={size} value={size} className="dark:bg-boxdark">{size}</option>
                            ))}
                        </select>
                        <span>entries</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs w-full sm:w-auto text-gray-500 dark:text-gray-400">
                        <span>Search:</span>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search categories..."
                            className="w-full sm:w-64 rounded border border-stroke py-1.5 px-3 bg-transparent dark:border-strokedark outline-none focus:border-primary text-xs text-black dark:text-white"
                        />
                    </div>
                </div>

                <div className="max-w-full overflow-x-auto">
                    <table className="w-full table-auto border-collapse">
                        <thead>
                            <tr className="bg-gray-2 text-left dark:bg-meta-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white border-b border-stroke dark:border-snakedark">
                                <th className="py-4 px-4 font-semibold text-xs w-20">S#</th>
                                <th className="py-4 px-4 font-semibold text-xs">Category (Bottom)</th>
                                <th className="py-4 px-4 font-semibold text-xs">Sub Category (Middle)</th>
                                <th className="py-4 px-4 font-semibold text-xs">Parent Category (Top)</th>
                                <th className="py-4 px-4 font-semibold text-xs w-32 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-12 text-xs">
                                        <div className="flex justify-center items-center"><Spinner /></div>
                                    </td>
                                </tr>
                            ) : paginatedCategories.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-xs text-gray-500 dark:text-gray-400">
                                        No categories found.
                                    </td>
                                </tr>
                            ) : (
                                paginatedCategories.map((cat, idx) => {
                                    const serialNumber = startIndex + idx + 1;
                                    const subCat = categories.find(c => c.id === cat.parent_id);
                                    const parentCat = subCat ? categories.find(c => c.id === subCat.parent_id) : null;

                                    return (
                                        <tr key={cat.id} className="border-b border-stroke dark:border-strokedark duration-150 text-xs hover:bg-gray-50 dark:hover:bg-meta-4/30">
                                            <td className="py-3.5 px-4 text-black dark:text-white font-medium">{serialNumber}</td>
                                            <td className="py-3.5 px-4 text-black dark:text-white font-bold uppercase tracking-tight">{cat.name || '-'}</td>
                                            <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300 uppercase tracking-tight">{subCat?.name || '-'}</td>
                                            <td className="py-3.5 px-4 text-gray-500 dark:text-gray-400 uppercase tracking-tight">{parentCat?.name || '-'}</td>
                                            <td className="py-3.5 px-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleEditCategory(cat)}
                                                        className="inline-flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-500 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 p-1.5 rounded transition"
                                                        title="Edit Category"
                                                    >
                                                        <MdEdit size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(cat.id, 'Category')}
                                                        className="inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-500 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 p-1.5 rounded transition"
                                                        title="Delete Category"
                                                    >
                                                        <MdDelete size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 pt-4 border-t border-stroke dark:border-strokedark">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
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
                            Page {currentPage} of {totalPages}
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

            {/* MODALS */}

            {/* Create Parent Category Modal */}
            {isParentModalOpen && (
                <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                    <div className="bg-white dark:bg-boxdark w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
                                <MdAdd className="text-emerald-600 text-lg" /> Create Parent Category
                            </h3>
                            <button onClick={() => setIsParentModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition">
                                <MdClose size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateParent} className="p-5">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                                Parent Name (e.g. Tiles)
                            </label>
                            <input
                                type="text"
                                autoFocus
                                value={newParentName}
                                onChange={(e) => setNewParentName(e.target.value)}
                                className="w-full border border-stroke rounded-lg p-2.5 bg-transparent dark:border-strokedark outline-none focus:border-emerald-500 text-black dark:text-white font-bold text-sm mb-6"
                                placeholder="Enter parent category name..."
                                required
                            />
                            <div className="flex gap-3 justify-end">
                                <button type="button" onClick={() => setIsParentModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition">
                                    Cancel
                                </button>
                                <button type="submit" disabled={modalSubmitting} className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition flex items-center gap-2 disabled:opacity-50">
                                    {modalSubmitting ? <Spinner /> : 'Save Parent'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create Sub Category Modal */}
            {isSubModalOpen && (
                <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                    <div className="bg-white dark:bg-boxdark w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
                                <MdAdd className="text-emerald-600 text-lg" /> Create Sub Category
                            </h3>
                            <button onClick={() => setIsSubModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition">
                                <MdClose size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateSub} className="p-5">
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                                    Under Parent
                                </label>
                                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                                    {parentCategories.find(c => c.id === Number(selectedParentId))?.name || 'Unknown'}
                                </div>
                            </div>

                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                                Sub Category Name (e.g. Ceramic Tiles)
                            </label>
                            <input
                                type="text"
                                autoFocus
                                value={newSubName}
                                onChange={(e) => setNewSubName(e.target.value)}
                                className="w-full border border-stroke rounded-lg p-2.5 bg-transparent dark:border-strokedark outline-none focus:border-emerald-500 text-black dark:text-white font-bold text-sm mb-6"
                                placeholder="Enter sub category name..."
                                required
                            />
                            <div className="flex gap-3 justify-end">
                                <button type="button" onClick={() => setIsSubModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition">
                                    Cancel
                                </button>
                                <button type="submit" disabled={modalSubmitting} className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition flex items-center gap-2 disabled:opacity-50">
                                    {modalSubmitting ? <Spinner /> : 'Save Sub Category'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Categories;
