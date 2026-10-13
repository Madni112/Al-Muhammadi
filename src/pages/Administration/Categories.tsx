import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../ui/Spinner';
import { MdDelete, MdCategory, MdClose, MdSave, MdEdit, MdCheck } from 'react-icons/md';
import { useAuth } from '../../Context/Auth';

const Categories = () => {
    const { tenantId } = useAuth();
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Parent Category combobox state
    const [selectedParentId, setSelectedParentId] = useState<string | number>('');
    const [parentInput, setParentInput] = useState('');
    const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);
    const [highlightedParentIndex, setHighlightedParentIndex] = useState(0);
    const [editingParentId, setEditingParentId] = useState<string | number | null>(null);
    const [editParentInput, setEditParentInput] = useState('');

    // Sub Category combobox state
    const [selectedSubId, setSelectedSubId] = useState<string | number>('');
    const [subInput, setSubInput] = useState('');
    const [isSubDropdownOpen, setIsSubDropdownOpen] = useState(false);
    const [highlightedSubIndex, setHighlightedSubIndex] = useState(0);
    const [editingSubId, setEditingSubId] = useState<string | number | null>(null);
    const [editSubInput, setEditSubInput] = useState('');

    // Bottom category form state
    const [categoryName, setCategoryName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [editCategoryId, setEditCategoryId] = useState<string | number | null>(null);

    // Delete modal confirmation state
    const [deletingCategoryItem, setDeletingCategoryItem] = useState<{
        id: string | number;
        name: string;
        type: 'Parent' | 'Sub' | 'Category';
    } | null>(null);

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

    // --- Inline Parent Category Actions ---
    const handleAddParentInline = async (rawName: string) => {
        const clean = rawName.trim();
        if (!clean) {
            toast.error('Parent category name cannot be empty');
            return;
        }

        const isDuplicate = parentCategories.some(c => c.name?.toLowerCase() === clean.toLowerCase());
        if (isDuplicate) {
            toast.error('Parent category already exists');
            return;
        }

        try {
            const payload: any = { name: clean, parent_id: null };
            if (tenantId) payload.tenant_id = tenantId;

            const { data, error } = await supabase.from('inventory_categories').insert([payload]).select().single();
            if (error) throw error;

            toast.success(`Parent Category "${clean}" created!`);
            await fetchCategories();
            if (data) {
                setSelectedParentId(data.id);
                setParentInput(data.name);
            }
            setSelectedSubId('');
            setSubInput('');
            setIsParentDropdownOpen(false);
        } catch (err: any) {
            toast.error('Failed to create parent: ' + err.message);
        }
    };

    const handleSaveEditParent = async (e: React.MouseEvent | React.KeyboardEvent, cat: any) => {
        e.preventDefault();
        e.stopPropagation();
        const clean = editParentInput.trim();
        if (!clean) {
            toast.error('Name cannot be empty');
            return;
        }
        if (clean.toLowerCase() !== cat.name.toLowerCase() && parentCategories.some(c => c.name?.toLowerCase() === clean.toLowerCase())) {
            toast.error('Parent category with this name already exists');
            return;
        }

        try {
            const { error } = await supabase.from('inventory_categories').update({ name: clean }).eq('id', cat.id);
            if (error) throw error;
            toast.success(`Parent Category updated to "${clean}"`);
            await fetchCategories();
            if (selectedParentId.toString() === cat.id.toString()) {
                setParentInput(clean);
            }
            setEditingParentId(null);
            setEditParentInput('');
        } catch (err: any) {
            toast.error('Failed to update: ' + err.message);
        }
    };

    // --- Inline Sub Category Actions ---
    const handleAddSubInline = async (rawName: string) => {
        const clean = rawName.trim();
        if (!clean) {
            toast.error('Sub category name cannot be empty');
            return;
        }
        if (!selectedParentId) {
            toast.error('Please select a Parent Category first');
            return;
        }

        const isDuplicate = subCategories.some(c => c.name?.toLowerCase() === clean.toLowerCase());
        if (isDuplicate) {
            toast.error('Sub category already exists under this parent');
            return;
        }

        try {
            const payload: any = { name: clean, parent_id: Number(selectedParentId) };
            if (tenantId) payload.tenant_id = tenantId;

            const { data, error } = await supabase.from('inventory_categories').insert([payload]).select().single();
            if (error) throw error;

            toast.success(`Sub Category "${clean}" created!`);
            await fetchCategories();
            if (data) {
                setSelectedSubId(data.id);
                setSubInput(data.name);
            }
            setIsSubDropdownOpen(false);
        } catch (err: any) {
            toast.error('Failed to create sub category: ' + err.message);
        }
    };

    const handleSaveEditSub = async (e: React.MouseEvent | React.KeyboardEvent, cat: any) => {
        e.preventDefault();
        e.stopPropagation();
        const clean = editSubInput.trim();
        if (!clean) {
            toast.error('Name cannot be empty');
            return;
        }
        if (clean.toLowerCase() !== cat.name.toLowerCase() && subCategories.some(c => c.name?.toLowerCase() === clean.toLowerCase())) {
            toast.error('Sub category with this name already exists under this parent');
            return;
        }

        try {
            const { error } = await supabase.from('inventory_categories').update({ name: clean }).eq('id', cat.id);
            if (error) throw error;
            toast.success(`Sub Category updated to "${clean}"`);
            await fetchCategories();
            if (selectedSubId.toString() === cat.id.toString()) {
                setSubInput(clean);
            }
            setEditingSubId(null);
            setEditSubInput('');
        } catch (err: any) {
            toast.error('Failed to update: ' + err.message);
        }
    };

    // --- Delete Action (via Modal) ---
    const handleConfirmDeleteCategory = async () => {
        if (!deletingCategoryItem) return;
        const { id, name, type } = deletingCategoryItem;

        try {
            const { error } = await supabase.from('inventory_categories').delete().eq('id', id);
            if (error) throw error;
            toast.success(`${type} Category "${name}" deleted.`);

            if (type === 'Parent' && id.toString() === selectedParentId.toString()) {
                setSelectedParentId('');
                setParentInput('');
                setSelectedSubId('');
                setSubInput('');
            } else if (type === 'Sub' && id.toString() === selectedSubId.toString()) {
                setSelectedSubId('');
                setSubInput('');
            } else if (type === 'Category' && editCategoryId === id) {
                setEditCategoryId(null);
                setCategoryName('');
            }

            await fetchCategories();
        } catch (err: any) {
            toast.error('Could not delete: ' + err.message);
        } finally {
            setDeletingCategoryItem(null);
        }
    };

    // --- Create / Update Bottom Category Form ---
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
            setSubInput(subCat.name);
            const parentCat = categories.find(c => c.id === subCat.parent_id);
            if (parentCat) {
                setSelectedParentId(parentCat.id);
                setParentInput(parentCat.name);
            } else {
                setSelectedParentId('');
                setParentInput('');
            }
        } else {
            setSelectedSubId('');
            setSubInput('');
            setSelectedParentId('');
            setParentInput('');
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
                        <div className="relative">
                            <input
                                type="text"
                                autoComplete="off"
                                value={parentInput}
                                onChange={(e) => {
                                    setParentInput(e.target.value);
                                    setIsParentDropdownOpen(true);
                                    setHighlightedParentIndex(0);
                                    const match = parentCategories.find(c => c.name?.toLowerCase() === e.target.value.toLowerCase().trim());
                                    if (match) {
                                        setSelectedParentId(match.id);
                                    } else if (selectedParentId) {
                                        setSelectedParentId('');
                                        setSelectedSubId('');
                                        setSubInput('');
                                    }
                                }}
                                onFocus={() => {
                                    setIsParentDropdownOpen(true);
                                    setHighlightedParentIndex(0);
                                }}
                                onBlur={() => {
                                    setTimeout(() => {
                                        if (!editingParentId && !deletingCategoryItem) {
                                            setIsParentDropdownOpen(false);
                                            const curr = parentCategories.find(c => c.id.toString() === selectedParentId.toString());
                                            setParentInput(curr ? curr.name : '');
                                        }
                                    }, 250);
                                }}
                                onKeyDown={(e) => {
                                    const filteredParents = parentCategories.filter((c) =>
                                        (c.name || '').toLowerCase().includes(parentInput.toLowerCase().trim())
                                    );
                                    const showAddOption = !!(parentInput.trim() && !parentCategories.some(c => c.name?.toLowerCase() === parentInput.trim().toLowerCase()));
                                    const totalOptions = filteredParents.length + (showAddOption ? 1 : 0);

                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        if (totalOptions > 0) {
                                            setHighlightedParentIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
                                        }
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        if (totalOptions > 0) {
                                            setHighlightedParentIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
                                        }
                                    } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (showAddOption && highlightedParentIndex === filteredParents.length) {
                                            handleAddParentInline(parentInput.trim());
                                        } else if (filteredParents.length > 0) {
                                            const selected = filteredParents[highlightedParentIndex] || filteredParents[0];
                                            setSelectedParentId(selected.id);
                                            setParentInput(selected.name);
                                            setSelectedSubId('');
                                            setSubInput('');
                                            setIsParentDropdownOpen(false);
                                        } else if (parentInput && parentInput.trim()) {
                                            handleAddParentInline(parentInput.trim());
                                        }
                                    } else if (e.key === 'Tab' || e.key === 'Escape') {
                                        setIsParentDropdownOpen(false);
                                    }
                                }}
                                className="w-full border border-stroke rounded-lg p-2.5 pr-8 bg-transparent dark:border-strokedark outline-none focus:border-emerald-600 text-black dark:text-white font-semibold text-xs h-[42px]"
                                placeholder="Search or enter parent category..."
                            />

                            {/* Clear (x) button when a value is selected */}
                            {selectedParentId && (
                                <button
                                    type="button"
                                    title="Clear Parent Category"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedParentId('');
                                        setParentInput('');
                                        setSelectedSubId('');
                                        setSubInput('');
                                        setIsParentDropdownOpen(true);
                                    }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                                >
                                    <MdClose className="text-sm" />
                                </button>
                            )}

                            {isParentDropdownOpen && (
                                <div className="absolute left-0 top-full mt-1.5 z-[99999] w-full min-w-[200px] max-h-[250px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                                    {(() => {
                                        const filteredParents = parentCategories.filter((c) =>
                                            (c.name || '').toLowerCase().includes(parentInput.toLowerCase().trim())
                                        );

                                        return (
                                            <>
                                                {filteredParents.length > 0 ? (
                                                    filteredParents.map((pItem, idx) => {
                                                        const isHighlighted = idx === highlightedParentIndex;
                                                        const isEditing = editingParentId === pItem.id;

                                                        if (isEditing) {
                                                            return (
                                                                <div
                                                                    key={pItem.id}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                    }}
                                                                    className="p-2 bg-emerald-50/90 dark:bg-emerald-950/50 border-l-4 border-emerald-500 flex items-center gap-1.5"
                                                                >
                                                                    <input
                                                                        type="text"
                                                                        autoFocus
                                                                        value={editParentInput}
                                                                        onChange={(e) => setEditParentInput(e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            e.stopPropagation();
                                                                            if (e.key === 'Enter') {
                                                                                handleSaveEditParent(e, pItem);
                                                                            } else if (e.key === 'Escape') {
                                                                                e.preventDefault();
                                                                                setEditingParentId(null);
                                                                                setEditParentInput('');
                                                                            }
                                                                        }}
                                                                        className="flex-1 min-w-0 px-2 py-1 text-xs font-semibold rounded-lg border border-emerald-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        title="Save"
                                                                        onMouseDown={(e) => e.preventDefault()}
                                                                        onClick={(e) => handleSaveEditParent(e, pItem)}
                                                                        className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition shrink-0"
                                                                    >
                                                                        <MdCheck className="text-sm" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        title="Cancel"
                                                                        onMouseDown={(e) => e.preventDefault()}
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            setEditingParentId(null);
                                                                            setEditParentInput('');
                                                                        }}
                                                                        className="p-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer transition shrink-0"
                                                                    >
                                                                        <MdClose className="text-sm" />
                                                                    </button>
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <div
                                                                key={pItem.id}
                                                                onMouseEnter={() => setHighlightedParentIndex(idx)}
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setSelectedParentId(pItem.id);
                                                                    setParentInput(pItem.name);
                                                                    setSelectedSubId('');
                                                                    setSubInput('');
                                                                    setIsParentDropdownOpen(false);
                                                                }}
                                                                className={`p-2.5 px-3 cursor-pointer transition text-xs font-bold flex items-center justify-between group ${
                                                                    isHighlighted 
                                                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 text-emerald-700 dark:text-emerald-400' 
                                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                                                                }`}
                                                            >
                                                                <span className="truncate mr-2">{pItem.name}</span>
                                                                <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                                    {selectedParentId.toString() === pItem.id.toString() && (
                                                                        <span className="text-[10px] text-emerald-600 font-semibold mr-1">Selected</span>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        title="Edit Parent Category"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                        }}
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            setEditingParentId(pItem.id);
                                                                            setEditParentInput(pItem.name);
                                                                        }}
                                                                        className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
                                                                    >
                                                                        <MdEdit className="text-sm" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        title="Delete Parent Category"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                        }}
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            setIsParentDropdownOpen(false);
                                                                            setDeletingCategoryItem({ id: pItem.id, name: pItem.name, type: 'Parent' });
                                                                        }}
                                                                        className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                                                                    >
                                                                        <MdDelete className="text-sm" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : null}

                                                {/* Show + Add if typed query is not empty and does not match any existing item */}
                                                {parentInput.trim() && !parentCategories.some(c => c.name?.toLowerCase() === parentInput.trim().toLowerCase()) && (
                                                    <div 
                                                        onMouseEnter={() => setHighlightedParentIndex(filteredParents.length)}
                                                        className={`p-3 text-center text-xs font-semibold cursor-pointer border-t border-slate-100 dark:border-slate-800 transition ${
                                                            highlightedParentIndex === filteredParents.length
                                                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold'
                                                                : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                                        }`}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            handleAddParentInline(parentInput.trim());
                                                        }}
                                                    >
                                                        + Add "{parentInput.trim()}"
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sub Category */}
                    <div>
                        <label className="block text-gray-500 mb-1.5 text-xs font-bold">
                            Sub Category
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                autoComplete="off"
                                disabled={!selectedParentId}
                                value={subInput}
                                onChange={(e) => {
                                    setSubInput(e.target.value);
                                    setIsSubDropdownOpen(true);
                                    setHighlightedSubIndex(0);
                                    const match = subCategories.find(c => c.name?.toLowerCase() === e.target.value.toLowerCase().trim());
                                    if (match) {
                                        setSelectedSubId(match.id);
                                    } else if (selectedSubId) {
                                        setSelectedSubId('');
                                    }
                                }}
                                onFocus={() => {
                                    if (selectedParentId) {
                                        setIsSubDropdownOpen(true);
                                        setHighlightedSubIndex(0);
                                    }
                                }}
                                onBlur={() => {
                                    setTimeout(() => {
                                        if (!editingSubId && !deletingCategoryItem) {
                                            setIsSubDropdownOpen(false);
                                            const curr = subCategories.find(c => c.id.toString() === selectedSubId.toString());
                                            setSubInput(curr ? curr.name : '');
                                        }
                                    }, 250);
                                }}
                                onKeyDown={(e) => {
                                    const filteredSubs = subCategories.filter((c) =>
                                        (c.name || '').toLowerCase().includes(subInput.toLowerCase().trim())
                                    );
                                    const showAddOption = !!(subInput.trim() && !subCategories.some(c => c.name?.toLowerCase() === subInput.trim().toLowerCase()));
                                    const totalOptions = filteredSubs.length + (showAddOption ? 1 : 0);

                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        if (totalOptions > 0) {
                                            setHighlightedSubIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
                                        }
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        if (totalOptions > 0) {
                                            setHighlightedSubIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
                                        }
                                    } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (showAddOption && highlightedSubIndex === filteredSubs.length) {
                                            handleAddSubInline(subInput.trim());
                                        } else if (filteredSubs.length > 0) {
                                            const selected = filteredSubs[highlightedSubIndex] || filteredSubs[0];
                                            setSelectedSubId(selected.id);
                                            setSubInput(selected.name);
                                            setIsSubDropdownOpen(false);
                                        } else if (subInput && subInput.trim()) {
                                            handleAddSubInline(subInput.trim());
                                        }
                                    } else if (e.key === 'Tab' || e.key === 'Escape') {
                                        setIsSubDropdownOpen(false);
                                    }
                                }}
                                className="w-full border border-stroke rounded-lg p-2.5 pr-8 bg-transparent dark:border-strokedark outline-none focus:border-emerald-600 text-black dark:text-white font-semibold text-xs h-[42px] disabled:opacity-50 disabled:cursor-not-allowed"
                                placeholder={!selectedParentId ? "Select Parent Category first..." : "Search or enter sub category..."}
                            />

                            {/* Clear (x) button when a value is selected */}
                            {selectedSubId && (
                                <button
                                    type="button"
                                    title="Clear Sub Category"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedSubId('');
                                        setSubInput('');
                                        setIsSubDropdownOpen(true);
                                    }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                                >
                                    <MdClose className="text-sm" />
                                </button>
                            )}

                            {isSubDropdownOpen && selectedParentId && (
                                <div className="absolute left-0 top-full mt-1.5 z-[99999] w-full min-w-[200px] max-h-[250px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A222C] shadow-2xl divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                                    {(() => {
                                        const filteredSubs = subCategories.filter((c) =>
                                            (c.name || '').toLowerCase().includes(subInput.toLowerCase().trim())
                                        );

                                        return (
                                            <>
                                                {filteredSubs.length > 0 ? (
                                                    filteredSubs.map((sItem, idx) => {
                                                        const isHighlighted = idx === highlightedSubIndex;
                                                        const isEditing = editingSubId === sItem.id;

                                                        if (isEditing) {
                                                            return (
                                                                <div
                                                                    key={sItem.id}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                    }}
                                                                    className="p-2 bg-emerald-50/90 dark:bg-emerald-950/50 border-l-4 border-emerald-500 flex items-center gap-1.5"
                                                                >
                                                                    <input
                                                                        type="text"
                                                                        autoFocus
                                                                        value={editSubInput}
                                                                        onChange={(e) => setEditSubInput(e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            e.stopPropagation();
                                                                            if (e.key === 'Enter') {
                                                                                handleSaveEditSub(e, sItem);
                                                                            } else if (e.key === 'Escape') {
                                                                                e.preventDefault();
                                                                                setEditingSubId(null);
                                                                                setEditSubInput('');
                                                                            }
                                                                        }}
                                                                        className="flex-1 min-w-0 px-2 py-1 text-xs font-semibold rounded-lg border border-emerald-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        title="Save"
                                                                        onMouseDown={(e) => e.preventDefault()}
                                                                        onClick={(e) => handleSaveEditSub(e, sItem)}
                                                                        className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition shrink-0"
                                                                    >
                                                                        <MdCheck className="text-sm" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        title="Cancel"
                                                                        onMouseDown={(e) => e.preventDefault()}
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            setEditingSubId(null);
                                                                            setEditSubInput('');
                                                                        }}
                                                                        className="p-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer transition shrink-0"
                                                                    >
                                                                        <MdClose className="text-sm" />
                                                                    </button>
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <div
                                                                key={sItem.id}
                                                                onMouseEnter={() => setHighlightedSubIndex(idx)}
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setSelectedSubId(sItem.id);
                                                                    setSubInput(sItem.name);
                                                                    setIsSubDropdownOpen(false);
                                                                }}
                                                                className={`p-2.5 px-3 cursor-pointer transition text-xs font-bold flex items-center justify-between group ${
                                                                    isHighlighted 
                                                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 text-emerald-700 dark:text-emerald-400' 
                                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                                                                }`}
                                                            >
                                                                <span className="truncate mr-2">{sItem.name}</span>
                                                                <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                                    {selectedSubId.toString() === sItem.id.toString() && (
                                                                        <span className="text-[10px] text-emerald-600 font-semibold mr-1">Selected</span>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        title="Edit Sub Category"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                        }}
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            setEditingSubId(sItem.id);
                                                                            setEditSubInput(sItem.name);
                                                                        }}
                                                                        className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
                                                                    >
                                                                        <MdEdit className="text-sm" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        title="Delete Sub Category"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                        }}
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            setIsSubDropdownOpen(false);
                                                                            setDeletingCategoryItem({ id: sItem.id, name: sItem.name, type: 'Sub' });
                                                                        }}
                                                                        className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                                                                    >
                                                                        <MdDelete className="text-sm" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : null}

                                                {/* Show + Add if typed query is not empty and does not match any existing item under parent */}
                                                {subInput.trim() && !subCategories.some(c => c.name?.toLowerCase() === subInput.trim().toLowerCase()) && (
                                                    <div 
                                                        onMouseEnter={() => setHighlightedSubIndex(filteredSubs.length)}
                                                        className={`p-3 text-center text-xs font-semibold cursor-pointer border-t border-slate-100 dark:border-slate-800 transition ${
                                                            highlightedSubIndex === filteredSubs.length
                                                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold'
                                                                : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                                        }`}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            handleAddSubInline(subInput.trim());
                                                        }}
                                                    >
                                                        + Add "{subInput.trim()}"
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
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
                                        setSubInput('');
                                        setSelectedParentId('');
                                        setParentInput('');
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
                                                        onClick={() => setDeletingCategoryItem({ id: cat.id, name: cat.name, type: 'Category' })}
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

            {/* DELETE CATEGORY CONFIRMATION MODAL POPUP */}
            {deletingCategoryItem && (
                <div
                    role="dialog"
                    aria-modal="true"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            setDeletingCategoryItem(null);
                        }
                    }}
                    className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
                >
                    <div
                        className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-sm w-full overflow-hidden p-5 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 shrink-0">
                                <MdDelete className="text-xl" />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">Delete {deletingCategoryItem.type} Category</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Are you sure you want to delete <span className="font-bold text-slate-800 dark:text-slate-200">"{deletingCategoryItem.name}"</span>?
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                autoFocus
                                ref={(btn) => btn && btn.focus()}
                                onClick={() => setDeletingCategoryItem(null)}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer border border-transparent focus:ring-2 focus:ring-slate-400 focus:outline-none"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDeleteCategory}
                                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 rounded-xl shadow-sm transition flex items-center gap-1 cursor-pointer focus:ring-2 focus:ring-rose-400 focus:outline-none"
                            >
                                <MdDelete className="text-sm" />
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Categories;
