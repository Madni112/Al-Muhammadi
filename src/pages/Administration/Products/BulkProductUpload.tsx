import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { useAuth } from '../../../Context/Auth';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import Spinner from '../../../ui/Spinner';
import {
  MdUploadFile,
  MdCheckCircle,
  MdWarning,
  MdInfo,
  MdError,
  MdRefresh,
  MdSearch,
  MdClose,
  MdArrowBack,
  MdLayers,
  MdCheck,
  MdDeleteOutline,
  MdCloudUpload,
  MdFilterList,
  MdFileDownload,
  MdEditNote,
  MdSync,
  MdTune,
} from 'react-icons/md';

export type DuplicateStatus = 'ready' | 'duplicate_in_file' | 'duplicate_in_db' | 'invalid';

export interface ProcessedRow {
  id: string;
  rowIndex: number;
  code: string;
  productName: string;
  category: string;
  subCategory: string;
  parentCat: string;
  brand: string;
  purchasePrice: number;
  retailPrice: number;
  uom: string;
  minimumStock: number;
  status: DuplicateStatus;
  statusReason: string;
  matchedDbProduct?: {
    id: number | string;
    product_name: string;
    item_sr_no: string;
    purchase_price: number;
    retail_price: number;
    category?: string;
  };
  matchedFileRowIndex?: number;
  selected: boolean;
  rawRow: any;
}

const BulkProductUpload = () => {
  const { userName, userEmail } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; stage: string } | null>(null);

  const [processedRows, setProcessedRows] = useState<ProcessedRow[]>([]);
  const [activeFilterTab, setActiveFilterTab] = useState<'ALL' | 'READY' | 'FILE_DUP' | 'DB_DUP' | 'INVALID'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadMode, setUploadMode] = useState<'SKIP_DUPLICATES' | 'UPDATE_EXISTING'>('SKIP_DUPLICATES');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);

  // Result dialog after upload
  const [uploadResult, setUploadResult] = useState<{
    newCount: number;
    updatedCount: number;
    skippedCount: number;
    totalRows: number;
  } | null>(null);

  // Parse Excel file and run 2-tier duplicate analysis
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setAnalyzing(true);
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const bstr = event.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        // Read sheet as raw 2D grid of rows
        const rawGrid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!rawGrid || rawGrid.length === 0) {
          toast.error('The selected file has no data rows.');
          setAnalyzing(false);
          return;
        }

        // Smart Header Auto-Detection (Scans first 10 rows for known column keywords)
        const headerKeywords = [
          'CODE',
          'ITEM',
          'DESCRIPTION',
          'PRODUCT',
          'NAME',
          'CATEGORY',
          'PRICE',
          'SALES',
          'PURCHASE',
          'BRAND',
          'UOM',
          'MINIMUM',
        ];

        let headerRowIdx = 0;
        let highestMatches = 0;

        for (let r = 0; r < Math.min(rawGrid.length, 10); r++) {
          const row = rawGrid[r] || [];
          const matchCount = row.filter((cell: any) => {
            const cellStr = String(cell || '').trim().toUpperCase();
            return headerKeywords.some((kw) => cellStr.includes(kw));
          }).length;

          if (matchCount > highestMatches && matchCount >= 2) {
            highestMatches = matchCount;
            headerRowIdx = r;
          }
        }

        const headerRow = (rawGrid[headerRowIdx] || []).map((h: any) =>
          String(h || '').trim().toUpperCase()
        );
        const dataGrid = rawGrid.slice(headerRowIdx + 1);

        // Normalize data rows to objects, filtering out completely blank rows
        const normalizedData: any[] = [];
        dataGrid.forEach((row) => {
          const hasData = row.some((cell: any) => String(cell || '').trim() !== '');
          if (!hasData) return;

          const rowObj: any = {};
          headerRow.forEach((colName, idx) => {
            if (colName) {
              rowObj[colName] = row[idx];
            }
          });
          normalizedData.push(rowObj);
        });

        if (normalizedData.length === 0) {
          toast.error('No product data rows found under the header row.');
          setAnalyzing(false);
          return;
        }

        // 1. Fetch current database catalog for comparison
        const { data: dbProducts, error: dbError } = await supabase
          .from('products')
          .select('id, product_name, item_sr_no, purchase_price, retail_price, category');

        if (dbError) throw dbError;

        // Build database lookup maps (lowercase trimmed)
        const dbByCode = new Map<string, any>();
        const dbByName = new Map<string, any>();

        (dbProducts || []).forEach((p: any) => {
          const codeKey = String(p.item_sr_no || '').trim().toLowerCase();
          const nameKey = String(p.product_name || '').replace(/\s+/g, ' ').trim().toLowerCase();
          if (codeKey) dbByCode.set(codeKey, p);
          if (nameKey) dbByName.set(nameKey, p);
        });

        const suffixRegex = /[\.\-\s]*(a39|shop)\s*$/i;

        // In-file duplicate tracking maps
        const fileSeenCodes = new Map<string, number>(); // code -> first 1-based row index
        const fileSeenNames = new Map<string, number>(); // name -> first 1-based row index

        const processed: ProcessedRow[] = normalizedData.map((row, i) => {
          const rowIndex = i + 1;
          const rawCode = String(
            row['CODE'] || row['ITEM CODE'] || row['ITEM_CODE'] || row['ITEM SR NO'] || row['SKU'] || ''
          );
          const rawName = String(
            row['DESCRIPTION'] || row['PRODUCT NAME'] || row['PRODUCT_NAME'] || row['NAME'] || ''
          );

          const cleanCode = rawCode.replace(suffixRegex, '').trim();
          const cleanName = rawName.replace(suffixRegex, '').replace(/\s+/g, ' ').trim();

          const codeKey = cleanCode.toLowerCase();
          const nameKey = cleanName.toLowerCase();

          let status: DuplicateStatus = 'ready';
          let statusReason = 'New unique product — ready to upload';
          let matchedDbProduct: any = undefined;
          let matchedFileRowIndex: number | undefined = undefined;

          // Check 1: Missing Required Name
          if (!cleanName) {
            status = 'invalid';
            statusReason = 'Missing product description / name';
          }
          // Check 2: Duplicate Code within the file
          else if (codeKey && fileSeenCodes.has(codeKey)) {
            status = 'duplicate_in_file';
            matchedFileRowIndex = fileSeenCodes.get(codeKey);
            statusReason = `Duplicate Code: Same code as Row #${matchedFileRowIndex} in this file ("${cleanCode}")`;
          }
          // Check 3: Duplicate Name within the file
          else if (fileSeenNames.has(nameKey)) {
            status = 'duplicate_in_file';
            matchedFileRowIndex = fileSeenNames.get(nameKey);
            statusReason = `Duplicate Name: Same description as Row #${matchedFileRowIndex} in this file`;
          }
          // Check 4: Duplicate Code in Database
          else if (codeKey && dbByCode.has(codeKey)) {
            const matched = dbByCode.get(codeKey);
            status = 'duplicate_in_db';
            matchedDbProduct = matched;
            statusReason = `Code already in Database: Matches "${matched.product_name}" (DB ID #${matched.id})`;
          }
          // Check 5: Duplicate Name in Database
          else if (dbByName.has(nameKey)) {
            const matched = dbByName.get(nameKey);
            status = 'duplicate_in_db';
            matchedDbProduct = matched;
            statusReason = `Name already in Database: Matches existing product (DB ID #${matched.id})`;
          }

          // Register first occurrence in file
          if (cleanName && !fileSeenNames.has(nameKey)) {
            fileSeenNames.set(nameKey, rowIndex);
          }
          if (cleanCode && !fileSeenCodes.has(codeKey)) {
            fileSeenCodes.set(codeKey, rowIndex);
          }

          const pPrice = Number(row['PURCHASE PRICE'] || row['PURCHASE_PRICE'] || row['PURCHASE'] || row['COST'] || 0);
          const rPrice = Number(row['SALES PRICE'] || row['SALE PRICE'] || row['RETAIL PRICE'] || row['RETAIL_PRICE'] || row['PRICE'] || 0);

          return {
            id: `row-${rowIndex}-${cleanCode || cleanName || Math.random()}`,
            rowIndex,
            code: cleanCode,
            productName: cleanName,
            category: String(row['CATEGORY'] || row['LEAF CATEGORY'] || row['LEAF_CATEGORY'] || '').trim(),
            subCategory: String(row['SUB CATEGORY'] || row['SUB CAT'] || row['SUB_CATEGORY'] || '').trim(),
            parentCat: String(row['PARENT CAT'] || row['PARENT CATEGORY'] || row['PARENT_CAT'] || row['PARENT_CATEGORY'] || row['SUB SUB CATEGORY'] || '').trim(),
            brand: String(row['BRAND'] || row['BIN'] || '').trim(),
            purchasePrice: isNaN(pPrice) ? 0 : pPrice,
            retailPrice: isNaN(rPrice) ? 0 : rPrice,
            uom: String(row['UOM'] || 'PCS').trim(),
            minimumStock: Number(row['MINIMUM'] || row['MIN_STOCK'] || 0) || 0,
            status,
            statusReason,
            matchedDbProduct,
            matchedFileRowIndex,
            selected: status === 'ready', // Default: only check new ready items
            rawRow: row,
          };
        });

        setProcessedRows(processed);
        setCurrentPage(1);
        setActiveFilterTab('ALL');

        const readyCount = processed.filter(r => r.status === 'ready').length;
        const fileDupCount = processed.filter(r => r.status === 'duplicate_in_file').length;
        const dbDupCount = processed.filter(r => r.status === 'duplicate_in_db').length;

        toast.success(
          `Analysis complete: ${readyCount} new, ${fileDupCount} file duplicates, ${dbDupCount} already in DB.`
        );
      } catch (err: any) {
        toast.error('Failed to parse and analyze file: ' + err.message);
      } finally {
        setAnalyzing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = processedRows.length;
    const ready = processedRows.filter(r => r.status === 'ready').length;
    const fileDup = processedRows.filter(r => r.status === 'duplicate_in_file').length;
    const dbDup = processedRows.filter(r => r.status === 'duplicate_in_db').length;
    const invalid = processedRows.filter(r => r.status === 'invalid').length;
    const selectedCount = processedRows.filter(r => r.selected).length;
    return { total, ready, fileDup, dbDup, invalid, selectedCount };
  }, [processedRows]);

  // Filtered rows for table
  const filteredRows = useMemo(() => {
    return processedRows.filter((r) => {
      // Tab filter
      if (activeFilterTab === 'READY' && r.status !== 'ready') return false;
      if (activeFilterTab === 'FILE_DUP' && r.status !== 'duplicate_in_file') return false;
      if (activeFilterTab === 'DB_DUP' && r.status !== 'duplicate_in_db') return false;
      if (activeFilterTab === 'INVALID' && r.status !== 'invalid') return false;

      // Search filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const codeMatch = r.code.toLowerCase().includes(query);
        const nameMatch = r.productName.toLowerCase().includes(query);
        const catMatch = r.category.toLowerCase().includes(query);
        const brandMatch = r.brand.toLowerCase().includes(query);
        return codeMatch || nameMatch || catMatch || brandMatch;
      }
      return true;
    });
  }, [processedRows, activeFilterTab, searchTerm]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Toggle selection for a single row
  const toggleRowSelection = (id: string) => {
    setProcessedRows(prev =>
      prev.map(r => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  // Toggle selection for all currently filtered rows
  const toggleSelectAllFiltered = (selectAll: boolean) => {
    const idsToToggle = new Set(filteredRows.map(r => r.id));
    setProcessedRows(prev =>
      prev.map(r => (idsToToggle.has(r.id) ? { ...r, selected: selectAll } : r))
    );
  };

  // Remove row from list
  const removeRow = (id: string) => {
    setProcessedRows(prev => prev.filter(r => r.id !== id));
  };

  // Remove all duplicates (both file and DB)
  const removeAllDuplicates = () => {
    const dupsCount = processedRows.filter(r => r.status === 'duplicate_in_file' || r.status === 'duplicate_in_db').length;
    if (dupsCount === 0) {
      toast('No duplicate rows to remove.');
      return;
    }
    setProcessedRows(prev => prev.filter(r => r.status === 'ready' || r.status === 'invalid'));
    toast.success(`Removed ${dupsCount} duplicate rows from the list.`);
  };

  // Remove DB / Software duplicates only
  const removeDbDuplicates = () => {
    const count = processedRows.filter(r => r.status === 'duplicate_in_db').length;
    if (count === 0) {
      toast('No software duplicates to remove.');
      return;
    }
    setProcessedRows(prev => prev.filter(r => r.status !== 'duplicate_in_db'));
    toast.success(`Removed ${count} software duplicates from the list.`);
  };

  // Remove in-file duplicates only
  const removeFileDuplicates = () => {
    const count = processedRows.filter(r => r.status === 'duplicate_in_file').length;
    if (count === 0) {
      toast('No in-file duplicates to remove.');
      return;
    }
    setProcessedRows(prev => prev.filter(r => r.status !== 'duplicate_in_file'));
    toast.success(`Removed ${count} in-file duplicates from the list.`);
  };

  // Export duplicates or current filtered list as Excel
  const handleExportFiltered = (type: 'ALL' | 'DUPLICATES' = 'DUPLICATES') => {
    const rowsToExport =
      type === 'DUPLICATES'
        ? processedRows.filter(r => r.status === 'duplicate_in_file' || r.status === 'duplicate_in_db')
        : filteredRows;

    if (rowsToExport.length === 0) {
      toast('No rows to export.');
      return;
    }

    const exportData = rowsToExport.map(r => ({
      'Row #': r.rowIndex,
      'Status': r.status === 'ready' ? 'New Product' : r.status === 'duplicate_in_file' ? 'Duplicate in File' : r.status === 'duplicate_in_db' ? 'Already in Database' : 'Invalid',
      'Reason': r.statusReason,
      'Item Code': r.code,
      'Product Name': r.productName,
      'Category': r.category,
      'Sub Category': r.subCategory,
      'Brand / Bin': r.brand,
      'Purchase Price': r.purchasePrice,
      'Sales Price': r.retailPrice,
      'UOM': r.uom,
      'Minimum Stock': r.minimumStock,
      'Matched Existing DB ID': r.matchedDbProduct ? r.matchedDbProduct.id : '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product Duplicates');
    XLSX.writeFile(wb, `product-duplicates-report-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Downloaded duplicate report spreadsheet!');
  };

  // Confirm and execute upload
  const handleExecuteUpload = async () => {
    // 1. Identify which rows to upload
    const rowsToInsert = processedRows.filter(r => r.status === 'ready' && r.selected);
    const rowsToUpdate =
      uploadMode === 'UPDATE_EXISTING'
        ? processedRows.filter(r => r.status === 'duplicate_in_db' && r.selected && r.matchedDbProduct?.id)
        : [];

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0) {
      toast.error('No products selected for upload.');
      return;
    }

    setLoading(true);
    let insertedCount = 0;
    let updatedCount = 0;
    let errorMsg = '';

    try {
      // 1. INSERT NEW PRODUCTS IN CHUNKS
      if (rowsToInsert.length > 0) {
        setUploadProgress({ current: 0, total: rowsToInsert.length, stage: 'Inserting new products...' });

        const payloads = rowsToInsert.map(r => ({
          product_name: r.productName,
          item_sr_no: r.code || '',
          bin: r.brand || '',
          brand: r.brand || '',
          purchase_price: r.purchasePrice,
          retail_price: r.retailPrice,
          mrp: r.retailPrice,
          uom: r.uom || 'PCS',
          min_stock_alert: r.minimumStock,
          category: r.category || '',
          sub_category: r.subCategory || '',
          sub_sub_category: r.parentCat || '',
          pieces_per_box: 1,
          pcs_per_box: 1,
          pieces_per_packing: 1,
          item_type: 'goods',
          profit: Math.max(0, r.retailPrice - r.purchasePrice),
        }));

        const chunkSize = 250;
        for (let i = 0; i < payloads.length; i += chunkSize) {
          const chunk = payloads.slice(i, i + chunkSize);
          const { error } = await supabase.from('products').insert(chunk);
          if (error) throw error;
          insertedCount += chunk.length;
          setUploadProgress({ current: insertedCount, total: rowsToInsert.length, stage: 'Inserting new products...' });
        }
      }

      // 2. UPDATE EXISTING PRODUCTS IF MODE ENABLED
      if (rowsToUpdate.length > 0) {
        setUploadProgress({ current: 0, total: rowsToUpdate.length, stage: 'Updating existing catalog products...' });

        for (let i = 0; i < rowsToUpdate.length; i++) {
          const r = rowsToUpdate[i];
          const dbId = r.matchedDbProduct!.id;

          const updatePayload: any = {};
          if (r.purchasePrice > 0) updatePayload.purchase_price = r.purchasePrice;
          if (r.retailPrice > 0) {
            updatePayload.retail_price = r.retailPrice;
            updatePayload.mrp = r.retailPrice;
          }
          if (r.category) updatePayload.category = r.category;
          if (r.subCategory) updatePayload.sub_category = r.subCategory;
          if (r.brand) {
            updatePayload.bin = r.brand;
            updatePayload.brand = r.brand;
          }
          if (r.minimumStock > 0) updatePayload.min_stock_alert = r.minimumStock;

          if (Object.keys(updatePayload).length > 0) {
            const { error: upError } = await supabase.from('products').update(updatePayload).eq('id', dbId);
            if (!upError) updatedCount++;
          }
          if ((i + 1) % 25 === 0 || i === rowsToUpdate.length - 1) {
            setUploadProgress({ current: i + 1, total: rowsToUpdate.length, stage: 'Updating existing catalog products...' });
          }
        }
      }

      // 3. RECORD AUDIT LOG FOR DEV CONSOLE
      const skippedCount = processedRows.length - (insertedCount + updatedCount);
      try {
        await supabase.from('audit_logs').insert({
          action_type: 'INSERT',
          table_name: 'products',
          performed_by: userName || userEmail || 'Super Admin',
          details: {
            event: 'Bulk Product Upload',
            file_name: fileName,
            total_rows_in_file: processedRows.length,
            new_products_added: insertedCount,
            existing_products_updated: updatedCount,
            skipped_duplicates: skippedCount,
            upload_strategy: uploadMode === 'SKIP_DUPLICATES' ? 'Skip Duplicates (New Only)' : 'New & Update Existing',
            sample_imported: rowsToInsert.slice(0, 5).map(r => `${r.productName} (${r.code || 'No Code'})`),
          },
        });
      } catch (auditErr) {
        console.warn('Audit log write error:', auditErr);
      }

      setUploadResult({
        newCount: insertedCount,
        updatedCount,
        skippedCount,
        totalRows: processedRows.length,
      });

      toast.success(`Success! Added ${insertedCount} new products.`);
    } catch (err: any) {
      errorMsg = err.message;
      toast.error('Upload interrupted: ' + errorMsg);
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const handleReset = () => {
    setProcessedRows([]);
    setFileName(null);
    setUploadResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="mx-auto max-w-7xl flex flex-col gap-6 relative text-slate-800 dark:text-slate-100">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <MdCloudUpload className="text-emerald-600 text-2xl" />
            Bulk Product Upload with Smart Duplicate Protection
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Imports Excel/CSV files while detecting duplicates within your file and against current catalog items.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {processedRows.length > 0 && (
            <button
              onClick={handleReset}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-stroke dark:border-strokedark hover:bg-slate-100 dark:hover:bg-meta-4 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5 cursor-pointer"
            >
              <MdRefresh className="text-sm" /> Choose Another File
            </button>
          )}
          <button
            onClick={() => navigate('/Administration/Products/List')}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition flex items-center gap-1.5 cursor-pointer"
          >
            <MdArrowBack /> Products List
          </button>
        </div>
      </div>

      {/* STEP 1: FILE PICKER / DROPZONE (Shown prominently if no file selected) */}
      {processedRows.length === 0 && (
        <div className="bg-white dark:bg-boxdark rounded-3xl shadow-sm border border-slate-200 dark:border-strokedark p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-3xl mx-auto border border-emerald-200 dark:border-emerald-800">
            <MdUploadFile />
          </div>

          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-black dark:text-white">
              Upload Your Product Excel or CSV Sheet
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The system will automatically cross-check every product code and description to prevent duplicate inventory.
            </p>
          </div>

          <div className="max-w-xl mx-auto bg-slate-50 dark:bg-meta-4/20 p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Supported Columns in Excel:
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 text-[11px]">
              {['CODE', 'DESCRIPTION', 'CATEGORY', 'SUB CATEGORY', 'BRAND / BIN', 'PURCHASE PRICE', 'SALES PRICE', 'UOM', 'MINIMUM'].map(col => (
                <span key={col} className="bg-white dark:bg-boxdark border border-stroke dark:border-strokedark px-2.5 py-1 rounded-lg font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {col}
                </span>
              ))}
            </div>

            <div className="pt-2">
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-md">
                <MdCloudUpload className="text-base" /> Browse Excel File (.xlsx, .csv)
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {analyzing && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 max-w-sm mx-auto flex items-center justify-center gap-3 text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
              <Spinner />
              <span>Analyzing file and checking for catalog duplicates...</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: DUPLICATE ANALYSIS & UPLOAD CONTROLS (Shown once file is parsed) */}
      {processedRows.length > 0 && (
        <div className="space-y-5">
          {/* FILE INFO & QUICK STATS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total In File */}
            <div className="bg-white dark:bg-boxdark p-4 rounded-2xl border border-stroke dark:border-strokedark shadow-2xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total In File</span>
              <div className="text-2xl font-black text-black dark:text-white mt-1">
                {metrics.total.toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block mt-0.5" title={fileName || ''}>
                📄 {fileName}
              </span>
            </div>

            {/* Ready to Upload (Green) */}
            <div
              onClick={() => { setActiveFilterTab('READY'); setCurrentPage(1); }}
              className={`p-4 rounded-2xl border transition cursor-pointer shadow-2xs ${
                activeFilterTab === 'READY'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500'
                  : 'bg-white dark:bg-boxdark border-stroke dark:border-strokedark hover:border-emerald-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">
                  Ready to Add (New)
                </span>
                <span className="text-base">🟢</span>
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {metrics.ready.toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Clean unique items
              </span>
            </div>

            {/* Duplicates in File (Yellow/Amber) */}
            <div
              onClick={() => { setActiveFilterTab('FILE_DUP'); setCurrentPage(1); }}
              className={`p-4 rounded-2xl border transition cursor-pointer shadow-2xs ${
                activeFilterTab === 'FILE_DUP'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500'
                  : 'bg-white dark:bg-boxdark border-stroke dark:border-strokedark hover:border-amber-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wider">
                  Duplicates in File
                </span>
                <span className="text-base">🟡</span>
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                {metrics.fileDup.toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Repeated rows in sheet
              </span>
            </div>

            {/* Already in System (Blue) */}
            <div
              onClick={() => { setActiveFilterTab('DB_DUP'); setCurrentPage(1); }}
              className={`p-4 rounded-2xl border transition cursor-pointer shadow-2xs ${
                activeFilterTab === 'DB_DUP'
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500'
                  : 'bg-white dark:bg-boxdark border-stroke dark:border-strokedark hover:border-blue-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-blue-700 dark:text-blue-400 font-bold uppercase tracking-wider">
                  Duplicates in Software
                </span>
                <span className="text-base">🔵</span>
              </div>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {metrics.dbDup.toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Matches existing catalog
              </span>
            </div>
          </div>

          {/* UPLOAD ACTION CARD */}
          <div className="bg-white dark:bg-boxdark p-5 rounded-2xl border border-stroke dark:border-strokedark shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Duplicate Strategy Option */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-black dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <MdTune className="text-emerald-600" /> Duplicate Handling Strategy:
                </label>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadMode('SKIP_DUPLICATES');
                      setProcessedRows(prev =>
                        prev.map(r => ({ ...r, selected: r.status === 'ready' }))
                      );
                    }}
                    className={`px-3.5 py-2 rounded-xl border font-bold flex items-center gap-2 transition cursor-pointer ${
                      uploadMode === 'SKIP_DUPLICATES'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-gray-50 dark:bg-meta-4/20 text-gray-700 dark:text-gray-300 border-stroke dark:border-strokedark hover:border-emerald-500'
                    }`}
                  >
                    <MdCheckCircle className="text-sm" />
                    <span>Skip Duplicates & Upload New Only</span>
                    <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-mono">
                      Safest
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUploadMode('UPDATE_EXISTING');
                      setProcessedRows(prev =>
                        prev.map(r => ({ ...r, selected: r.status === 'ready' || r.status === 'duplicate_in_db' }))
                      );
                    }}
                    className={`px-3.5 py-2 rounded-xl border font-bold flex items-center gap-2 transition cursor-pointer ${
                      uploadMode === 'UPDATE_EXISTING'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-gray-50 dark:bg-meta-4/20 text-gray-700 dark:text-gray-300 border-stroke dark:border-strokedark hover:border-blue-500'
                    }`}
                  >
                    <MdSync className="text-sm" />
                    <span>Upload New & Update Existing in Database</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center flex-wrap gap-2 shrink-0">
                {(metrics.fileDup > 0 || metrics.dbDup > 0) && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleExportFiltered('DUPLICATES')}
                      className="px-3 py-2 text-xs font-bold rounded-xl border border-stroke dark:border-strokedark bg-white dark:bg-boxdark hover:bg-slate-50 dark:hover:bg-meta-4 text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                      title="Export duplicate rows to Excel"
                    >
                      <MdFileDownload className="text-sm text-amber-600" /> Export Duplicates
                    </button>

                    <button
                      type="button"
                      onClick={removeAllDuplicates}
                      className="px-3 py-2 text-xs font-bold rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 transition flex items-center gap-1.5 cursor-pointer"
                      title="Remove all duplicate rows from this upload list"
                    >
                      <MdDeleteOutline className="text-sm" /> Remove All Duplicates ({metrics.fileDup + metrics.dbDup})
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleExecuteUpload}
                  disabled={loading || metrics.selectedCount === 0}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Spinner /> {uploadProgress?.stage || 'Uploading...'} ({uploadProgress?.current} / {uploadProgress?.total})
                    </>
                  ) : uploadMode === 'SKIP_DUPLICATES' ? (
                    <>
                      <MdCloudUpload className="text-base" /> Confirm & Upload {metrics.ready} New Products
                    </>
                  ) : (
                    <>
                      <MdSync className="text-base" /> Upload {metrics.ready} New & Update {metrics.dbDup} Existing
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Explanatory Note */}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-meta-4/20 p-2.5 rounded-xl border border-stroke dark:border-strokedark flex items-center gap-2">
              <MdInfo className="text-emerald-600 text-sm shrink-0" />
              <span>
                {uploadMode === 'SKIP_DUPLICATES'
                  ? `Only the ${metrics.ready} brand-new unique items will be added to your database catalog. All ${metrics.fileDup + metrics.dbDup} repeating rows are automatically protected and skipped.`
                  : `The ${metrics.ready} new items will be created, and the ${metrics.dbDup} existing products will be refreshed with latest prices & categories without creating duplicate catalog records.`}
              </span>
            </div>
          </div>

          {/* TABLE PREVIEW & FILTER TOOLBAR */}
          <div className="bg-white dark:bg-boxdark rounded-2xl border border-stroke dark:border-strokedark shadow-xs overflow-hidden">
            {/* Filter Tabs & Search Bar */}
            <div className="p-4 border-b border-stroke dark:border-strokedark flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              {/* Category Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[
                  { id: 'ALL', label: 'All Rows', count: metrics.total },
                  { id: 'READY', label: 'Ready to Add', count: metrics.ready, badge: '🟢' },
                  { id: 'FILE_DUP', label: 'Duplicates in File', count: metrics.fileDup, badge: '🟡' },
                  { id: 'DB_DUP', label: 'Duplicates in Software', count: metrics.dbDup, badge: '🔵' },
                  metrics.invalid > 0
                    ? { id: 'INVALID', label: 'Missing Info', count: metrics.invalid, badge: '🔴' }
                    : null,
                ]
                  .filter(Boolean)
                  .map((tab: any) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveFilterTab(tab.id);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                        activeFilterTab === tab.id
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-meta-4/30 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-meta-4'
                      }`}
                    >
                      {tab.badge && <span>{tab.badge}</span>}
                      <span>{tab.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        activeFilterTab === tab.id ? 'bg-white/20 text-white' : 'bg-white dark:bg-boxdark text-gray-500'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
              </div>

              {/* Search & Bulk Select */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <MdSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search Code or Name..."
                    className="pl-8 pr-7 py-1.5 text-xs rounded-xl border border-stroke dark:border-strokedark bg-transparent text-black dark:text-white outline-none focus:border-emerald-500 w-48 sm:w-56"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black dark:hover:text-white"
                    >
                      <MdClose className="text-xs" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => toggleSelectAllFiltered(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4 text-[11px] font-bold transition cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAllFiltered(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-stroke dark:border-strokedark hover:bg-slate-50 dark:hover:bg-meta-4 text-[11px] font-bold text-slate-500 transition cursor-pointer"
                >
                  Deselect
                </button>

                {activeFilterTab === 'DB_DUP' && metrics.dbDup > 0 && (
                  <button
                    type="button"
                    onClick={removeDbDuplicates}
                    className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <MdDeleteOutline /> Remove Software Duplicates ({metrics.dbDup})
                  </button>
                )}

                {activeFilterTab === 'FILE_DUP' && metrics.fileDup > 0 && (
                  <button
                    type="button"
                    onClick={removeFileDuplicates}
                    className="px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <MdDeleteOutline /> Remove File Duplicates ({metrics.fileDup})
                  </button>
                )}
              </div>
            </div>

            {/* PREVIEW TABLE */}
            <div className="overflow-x-auto max-h-[60vh] scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-100 dark:bg-meta-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shadow-2xs z-10">
                  <tr>
                    <th className="py-3 px-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={paginatedRows.length > 0 && paginatedRows.every(r => r.selected)}
                        onChange={(e) => {
                          const check = e.target.checked;
                          const ids = new Set(paginatedRows.map(r => r.id));
                          setProcessedRows(prev =>
                            prev.map(r => (ids.has(r.id) ? { ...r, selected: check } : r))
                          );
                        }}
                        className="rounded cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-2 w-12 text-center">Row #</th>
                    <th className="py-3 px-3">Duplicate Status</th>
                    <th className="py-3 px-3">Product Code / SKU</th>
                    <th className="py-3 px-4">Product Description / Name</th>
                    <th className="py-3 px-3">Parent Category</th>
                    <th className="py-3 px-3">Sub Category</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Brand / Bin</th>
                    <th className="py-3 px-3 text-right">Purchase Price</th>
                    <th className="py-3 px-3 text-right">Sales Price</th>
                    <th className="py-3 px-3">UOM</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-strokedark">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-slate-400 text-xs">
                        No rows found matching current filter or search criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row) => {
                      const isReady = row.status === 'ready';
                      const isFileDup = row.status === 'duplicate_in_file';
                      const isDbDup = row.status === 'duplicate_in_db';
                      const isInvalid = row.status === 'invalid';

                      return (
                        <tr
                          key={row.id}
                          className={`transition ${
                            row.selected ? 'bg-white dark:bg-boxdark' : 'opacity-60 bg-gray-50/50 dark:bg-meta-4/5'
                          } ${
                            isFileDup ? 'hover:bg-amber-50/40 dark:hover:bg-amber-950/20' : isDbDup ? 'hover:bg-blue-50/40 dark:hover:bg-blue-950/20' : 'hover:bg-slate-50 dark:hover:bg-meta-4/20'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => toggleRowSelection(row.id)}
                              className="rounded cursor-pointer"
                            />
                          </td>

                          {/* Row Index */}
                          <td className="py-2.5 px-2 text-center font-mono text-[11px] text-slate-400 font-semibold">
                            #{row.rowIndex}
                          </td>

                          {/* Duplicate Status Badge & Note */}
                          <td className="py-2.5 px-3 max-w-xs">
                            {isReady && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                🟢 Ready to Add
                              </span>
                            )}
                            {isFileDup && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                  🟡 Duplicate in File
                                </span>
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium truncate max-w-[220px]" title={row.statusReason}>
                                  {row.statusReason}
                                </div>
                              </div>
                            )}
                            {isDbDup && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                                  🔵 In Database (ID #{row.matchedDbProduct?.id})
                                </span>
                                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate max-w-[220px]" title={row.statusReason}>
                                  {row.statusReason}
                                </div>
                              </div>
                            )}
                            {isInvalid && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-300 dark:border-red-800">
                                  🔴 Missing Info
                                </span>
                                <div className="text-[10px] text-red-500 font-medium">{row.statusReason}</div>
                              </div>
                            )}
                          </td>

                          {/* Code */}
                          <td className="py-2.5 px-3 font-mono font-bold text-black dark:text-white">
                            <span className={isFileDup || isDbDup ? 'bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded' : ''}>
                              {row.code || '—'}
                            </span>
                          </td>

                          {/* Description */}
                          <td className="py-2.5 px-4 font-semibold text-black dark:text-white max-w-sm truncate" title={row.productName}>
                            {row.productName || <span className="text-red-400 italic">No name provided</span>}
                          </td>

                          {/* Parent Category */}
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-[130px] truncate" title={row.parentCat}>
                            {row.parentCat || '—'}
                          </td>

                          {/* Sub Category */}
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-[130px] truncate" title={row.subCategory}>
                            {row.subCategory || '—'}
                          </td>

                          {/* Category */}
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-[130px] truncate" title={row.category}>
                            {row.category || '—'}
                          </td>

                          {/* Brand */}
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                            {row.brand || '—'}
                          </td>

                          {/* Purchase Price */}
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                            Rs. {(Number(row.purchasePrice) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Sales Price */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            Rs. {(Number(row.retailPrice) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* UOM */}
                          <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                            {row.uom || 'PCS'}
                          </td>

                          {/* Action */}
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeRow(row.id)}
                              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                              title="Remove row from this upload"
                            >
                              <MdDeleteOutline className="text-sm" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION BAR */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-stroke dark:border-strokedark flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Showing {Math.min(filteredRows.length, (currentPage - 1) * pageSize + 1)} -{' '}
                  {Math.min(filteredRows.length, currentPage * pageSize)} of {filteredRows.length} rows
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-stroke dark:border-strokedark disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-meta-4 transition"
                  >
                    Prev
                  </button>
                  <span className="px-2 font-mono font-bold text-black dark:text-white">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-stroke dark:border-strokedark disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-meta-4 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULT MODAL UPON SUCCESSFUL UPLOAD */}
      {uploadResult && (
        <div className="fixed inset-0 bg-black/60 z-99999 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-boxdark w-full max-w-md rounded-3xl border border-stroke dark:border-strokedark p-6 shadow-2xl space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-3xl mx-auto">
              <MdCheckCircle />
            </div>

            <div className="space-y-1">
              <h4 className="text-lg font-black text-black dark:text-white">
                Bulk Upload Successfully Completed!
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Your product catalog has been safely updated with full duplicate protection.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-meta-4/20 p-3 rounded-2xl border border-stroke dark:border-strokedark text-xs">
              <div className="p-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">New Added</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  {uploadResult.newCount}
                </span>
              </div>
              <div className="p-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Updated</span>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400 block mt-0.5">
                  {uploadResult.updatedCount}
                </span>
              </div>
              <div className="p-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Skipped</span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400 block mt-0.5">
                  {uploadResult.skippedCount}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-stroke dark:border-strokedark text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-meta-4 transition cursor-pointer"
              >
                Upload Another File
              </button>
              <button
                type="button"
                onClick={() => navigate('/Administration/Products/List')}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-md cursor-pointer"
              >
                View Products List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkProductUpload;
