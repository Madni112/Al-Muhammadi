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
  MdSquareFoot,
  MdCategory,
  MdBlock,
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
  // Tile-specific attributes
  print?: string;
  tileWidth?: number;
  tileHeight?: number;
  piecesPerBox?: number;
  sqMPerPiece?: number;
  sqMPerBox?: number;
  purchasePerSqM?: number;
  salePerSqM?: number;
  profitPerBox?: number;
  profitMarginPercent?: string;
  // Status
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

// Visual badge indicating whether a master category/brand/print already exists or will be created
const MasterBadge = ({ exists }: { exists: boolean }) => {
  if (exists) {
    return (
      <span
        title="Already exists in database master catalog"
        className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 whitespace-nowrap"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
        <span>Already</span>
      </span>
    );
  }
  return (
    <span
      title="Will be auto-created in master catalog during upload"
      className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 whitespace-nowrap"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
      <span>Will create</span>
    </span>
  );
};

const BulkProductUpload = () => {
  const { userName, userEmail, tenantId } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab: 'OTHER' = Upload Other Products, 'TILES' = Upload Tile Products
  const [activeTab, setActiveTab] = useState<'OTHER' | 'TILES'>('OTHER');

  const [fileName, setFileName] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; stage: string } | null>(null);

  // Master Data Hierarchy State (Parent -> Sub -> Category, Brands, Prints)
  const [autoCreateMasters, setAutoCreateMasters] = useState(true);
  const [existingCategories, setExistingCategories] = useState<any[]>([]);
  const [existingBrands, setExistingBrands] = useState<any[]>([]);
  const [existingPrints, setExistingPrints] = useState<any[]>([]);

  // Separate rows for each tab from the uploaded file
  const [otherRows, setOtherRows] = useState<ProcessedRow[]>([]);
  const [tileRows, setTileRows] = useState<ProcessedRow[]>([]);

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
    mastersCount?: number;
  } | null>(null);

  // Determine which dataset is currently active
  const processedRows = useMemo(() => {
    return activeTab === 'TILES' ? tileRows : otherRows;
  }, [activeTab, tileRows, otherRows]);

  const setProcessedRows = (updater: React.SetStateAction<ProcessedRow[]>) => {
    if (activeTab === 'TILES') {
      setTileRows(updater);
    } else {
      setOtherRows(updater);
    }
  };

  const hasFileLoaded = otherRows.length > 0 || tileRows.length > 0;
  const isMixedFile = otherRows.length > 0 && tileRows.length > 0;

  // Pending missing master data computed against DB
  const pendingMasters = useMemo(() => {
    const parentSet = new Set<string>();
    const subSet = new Set<string>();
    const catSet = new Set<string>();
    const brandSet = new Set<string>();
    const printSet = new Set<string>();

    const allRows = [...otherRows, ...tileRows];
    if (allRows.length === 0) {
      return { parents: [], subs: [], cats: [], brands: [], prints: [], total: 0 };
    }

    // Build lookup maps from existing DB categories
    const dbParentMap = new Map<string, any>();
    const dbSubMap = new Map<string, any>(); // `${parentId}:::${subName}`
    const dbCatMap = new Map<string, any>(); // `${subId}:::${catName}`

    (existingCategories || []).forEach((c: any) => {
      const cName = String(c.name || '').trim().toLowerCase();
      if (c.parent_id === null || c.parent_id === undefined) {
        dbParentMap.set(cName, c);
      }
    });

    (existingCategories || []).forEach((c: any) => {
      const cName = String(c.name || '').trim().toLowerCase();
      if (c.parent_id !== null && c.parent_id !== undefined) {
        const isParentRoot = Array.from(dbParentMap.values()).some((p: any) => p.id === c.parent_id);
        if (isParentRoot) {
          dbSubMap.set(`${c.parent_id}:::${cName}`, c);
        }
      }
    });

    (existingCategories || []).forEach((c: any) => {
      const cName = String(c.name || '').trim().toLowerCase();
      if (c.parent_id !== null && c.parent_id !== undefined) {
        const isParentSub = Array.from(dbSubMap.values()).some((s: any) => s.id === c.parent_id);
        if (isParentSub) {
          dbCatMap.set(`${c.parent_id}:::${cName}`, c);
        }
      }
    });

    const dbBrandSet = new Set((existingBrands || []).map((b: any) => String(b.name || '').trim().toLowerCase()));
    const dbPrintSet = new Set((existingPrints || []).map((p: any) => String(p.name || '').trim().toLowerCase()));

    allRows.forEach((r) => {
      const p = (r.parentCat || '').trim();
      const s = (r.subCategory || '').trim();
      const c = (r.category || '').trim();
      const b = (r.brand || '').trim();
      const pr = (r.print || '').trim();

      if (p && !dbParentMap.has(p.toLowerCase())) {
        parentSet.add(p);
      }
      if (s) {
        const pObj = dbParentMap.get(p.toLowerCase());
        const subKey = pObj ? `${pObj.id}:::${s.toLowerCase()}` : '';
        if (!subKey || !dbSubMap.has(subKey)) {
          subSet.add(s);
        }
      }
      if (c) {
        catSet.add(c);
      }
      if (b && !dbBrandSet.has(b.toLowerCase())) {
        brandSet.add(b);
      }
      if (pr && !dbPrintSet.has(pr.toLowerCase())) {
        printSet.add(pr);
      }
    });

    return {
      parents: Array.from(parentSet),
      subs: Array.from(subSet),
      cats: Array.from(catSet),
      brands: Array.from(brandSet),
      prints: Array.from(printSet),
      total: parentSet.size + subSet.size + brandSet.size + printSet.size,
    };
  }, [otherRows, tileRows, existingCategories, existingBrands, existingPrints]);

  // Fast lookup structure for individual row badges (Already vs Will create)
  const masterLookup = useMemo(() => {
    const parentSet = new Set<string>();
    const subSet = new Map<string, Set<string>>(); // parentLower -> Set of subLower
    const catSet = new Map<string, Set<string>>(); // `${parentLower}:::${subLower}` -> Set of catLower

    const dbParentIdMap = new Map<number | string, string>(); // id -> parentLower
    const dbSubIdMap = new Map<number | string, { parentLower: string; subLower: string }>();

    (existingCategories || []).forEach((c: any) => {
      const nameLower = String(c.name || '').trim().toLowerCase();
      if (c.parent_id === null || c.parent_id === undefined) {
        parentSet.add(nameLower);
        dbParentIdMap.set(c.id, nameLower);
      }
    });

    (existingCategories || []).forEach((c: any) => {
      const nameLower = String(c.name || '').trim().toLowerCase();
      if (c.parent_id !== null && c.parent_id !== undefined && dbParentIdMap.has(c.parent_id)) {
        const parentLower = dbParentIdMap.get(c.parent_id)!;
        if (!subSet.has(parentLower)) subSet.set(parentLower, new Set());
        subSet.get(parentLower)!.add(nameLower);
        dbSubIdMap.set(c.id, { parentLower, subLower: nameLower });
      }
    });

    (existingCategories || []).forEach((c: any) => {
      const nameLower = String(c.name || '').trim().toLowerCase();
      if (c.parent_id !== null && c.parent_id !== undefined && dbSubIdMap.has(c.parent_id)) {
        const { parentLower, subLower } = dbSubIdMap.get(c.parent_id)!;
        const key = `${parentLower}:::${subLower}`;
        if (!catSet.has(key)) catSet.set(key, new Set());
        catSet.get(key)!.add(nameLower);
      }
    });

    const brandSet = new Set(
      (existingBrands || []).map((b: any) => String(b.name || '').trim().toLowerCase())
    );

    const printSet = new Set(
      (existingPrints || []).map((p: any) => String(p.name || '').trim().toLowerCase())
    );

    return {
      isParentExists: (name?: string) => {
        if (!name || !name.trim()) return false;
        return parentSet.has(name.trim().toLowerCase());
      },
      isSubExists: (parentName?: string, subName?: string) => {
        if (!subName || !subName.trim()) return false;
        const pLower = (parentName || '').trim().toLowerCase();
        if (subSet.has(pLower) && subSet.get(pLower)!.has(subName.trim().toLowerCase())) return true;
        // Fallback: check if sub exists anywhere in categories
        return (existingCategories || []).some(
          c => c.parent_id !== null && String(c.name || '').trim().toLowerCase() === subName.trim().toLowerCase()
        );
      },
      isCatExists: (parentName?: string, subName?: string, catName?: string) => {
        if (!catName || !catName.trim()) return false;
        const pLower = (parentName || '').trim().toLowerCase();
        const sLower = (subName || '').trim().toLowerCase();
        const key = `${pLower}:::${sLower}`;
        if (catSet.has(key) && catSet.get(key)!.has(catName.trim().toLowerCase())) return true;
        return (existingCategories || []).some(
          c => String(c.name || '').trim().toLowerCase() === catName.trim().toLowerCase()
        );
      },
      isBrandExists: (brandName?: string) => {
        if (!brandName || !brandName.trim()) return false;
        return brandSet.has(brandName.trim().toLowerCase());
      },
      isPrintExists: (printName?: string) => {
        if (!printName || !printName.trim()) return false;
        return printSet.has(printName.trim().toLowerCase());
      },
    };
  }, [existingCategories, existingBrands, existingPrints]);

  // Handle Tab Switch (Preserves parsed rows for both tabs)
  const handleTabChange = (newTab: 'OTHER' | 'TILES') => {
    if (newTab === activeTab) return;
    setActiveTab(newTab);
    setCurrentPage(1);
    setActiveFilterTab('ALL');
  };

  // Download sample template for Other Products
  const handleDownloadOtherTemplate = () => {
    const sampleData = [
      {
        'CODE': 'G-SANIT-01',
        'DESCRIPTION': 'Porta Ceramic Basin Vanity',
        'PARENT CATEGORY': 'Sanitary Ware',
        'SUB CATEGORY': 'Basins',
        'CATEGORY': 'Vanity Basins',
        'BRAND': 'Porta',
        'PURCHASE PRICE': 8500,
        'SALES PRICE': 11000,
        'UOM': 'PCS',
        'MINIMUM': 5,
      },
      {
        'CODE': 'G-PIPE-02',
        'DESCRIPTION': 'PPRC Pipe 25mm 4m Class A',
        'PARENT CATEGORY': 'Pipes & Fittings',
        'SUB CATEGORY': 'PPRC Pipes',
        'CATEGORY': '25mm Pipes',
        'BRAND': 'Popular',
        'PURCHASE PRICE': 650,
        'SALES PRICE': 850,
        'UOM': 'LENGTH',
        'MINIMUM': 20,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Other Products Template');
    XLSX.writeFile(wb, 'other-products-template.xlsx');
    toast.success('Downloaded Other Products Excel template!');
  };

  // Download sample template for Tile Products
  const handleDownloadTileTemplate = () => {
    const sampleData = [
      {
        'Code': 'PT-60120-01',
        'Description': 'Calacatta Gold Glazed Polished Porcelain',
        'Brand': 'Master',
        'Parent Category': 'Pak Tiles',
        'Sub Category': 'Porcelain',
        'Category': '60x120',
        'Print': 'Glazed Polished',
        'UOM': 'BOX',
        'Pieces Per Box': 2,
        'width': 60,
        'height': 120,
        'Purchase Price (Per Box)': 3200,
        'Sale Price (Per Box)': 4000,
        'Min': 20,
      },
      {
        'Code': 'CT-6060-05',
        'Description': 'Carrara White Matte Floor Tile',
        'Brand': 'Sonex',
        'Parent Category': 'Ch Tiles',
        'Sub Category': 'Ceramic',
        'Category': '60x60',
        'Print': 'Matt',
        'UOM': 'BOX',
        'Pieces Per Box': 4,
        'width': 60,
        'height': 60,
        'Purchase Price (Per Box)': 2400,
        'Sale Price (Per Box)': 3000,
        'Min': 15,
      },
      {
        'Code': 'ST-3090-09',
        'Description': 'Nero Marquina Wall Glossy Tile',
        'Brand': 'Stile',
        'Parent Category': 'Spain Tiles',
        'Sub Category': 'Ceramic',
        'Category': '30x90',
        'Print': 'Polished',
        'UOM': 'BOX',
        'Pieces Per Box': 4,
        'width': 30,
        'height': 90,
        'Purchase Price (Per Box)': 2800,
        'Sale Price (Per Box)': 3500,
        'Min': 10,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tile Products Template');
    XLSX.writeFile(wb, 'tile-products-template.xlsx');
    toast.success('Downloaded Tile Products Excel template!');
  };

  // Parse Excel file, auto-classify tiles vs other products, apply redirects and dual-tab mapping
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
        const rawGrid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        // Auto-propagate merged cells down to all child cells in the merged range
        if (sheet['!merges'] && Array.isArray(sheet['!merges'])) {
          sheet['!merges'].forEach((merge: any) => {
            const startVal = rawGrid[merge.s.r]?.[merge.s.c];
            if (startVal !== undefined && startVal !== '') {
              for (let r = merge.s.r; r <= merge.e.r; r++) {
                for (let c = merge.s.c; c <= merge.e.c; c++) {
                  if (rawGrid[r]) {
                    rawGrid[r][c] = startVal;
                  }
                }
              }
            }
          });
        }

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
          'PRINT',
          'PIECES',
          'WIDTH',
          'HEIGHT',
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

        // Normalize data rows to objects, filtering out completely blank rows or spacer rows without code & name
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

          // Check if this row is just an empty spacer row (no code and no description)
          const checkCode = String(rowObj['CODE'] || rowObj['ITEM CODE'] || rowObj['ITEM_CODE'] || rowObj['ITEM SR NO'] || rowObj['SKU'] || '').trim();
          const checkName = String(rowObj['DESCRIPTION'] || rowObj['PRODUCT NAME'] || rowObj['PRODUCT_NAME'] || rowObj['NAME'] || '').trim();
          if (!checkCode && !checkName) {
            return; // Skip empty separator/spacer row
          }

          normalizedData.push(rowObj);
        });

        if (normalizedData.length === 0) {
          toast.error('No product data rows found under the header row.');
          setAnalyzing(false);
          return;
        }

        // 1. Fetch current database catalog, categories, brands, and prints for comparison
        const [productsRes, catsRes, brandsRes, printsRes] = await Promise.all([
          supabase
            .from('products')
            .select('id, product_name, item_sr_no, purchase_price, retail_price, category'),
          tenantId
            ? supabase.from('inventory_categories').select('*').eq('tenant_id', tenantId)
            : supabase.from('inventory_categories').select('*'),
          supabase.from('inventory_brands').select('*'),
          supabase.from('inventory_prints').select('*'),
        ]);

        if (productsRes.error) throw productsRes.error;
        const dbProducts = productsRes.data || [];
        setExistingCategories(catsRes.data || []);
        setExistingBrands(brandsRes.data || []);
        setExistingPrints(printsRes.data || []);

        // Build database lookup maps (lowercase trimmed 2-layer composite: Code + Name)
        const dbByComposite = new Map<string, any>();

        (dbProducts || []).forEach((p: any) => {
          const codeKey = String(p.item_sr_no || '').trim().toLowerCase();
          const nameKey = String(p.product_name || '').replace(/\s+/g, ' ').trim().toLowerCase();
          if (codeKey || nameKey) {
            dbByComposite.set(`${codeKey}:::${nameKey}`, p);
          }
        });

        const suffixRegex = /[\.\-\s]*(a39|shop)\s*$/i;

        // In-file duplicate tracking map (2-Layer: Code + Description)
        const fileSeenComposite = new Map<string, number>(); // compositeKey -> first 1-based row index

        const parsedTileList: ProcessedRow[] = [];
        const parsedOtherList: ProcessedRow[] = [];

        normalizedData.forEach((row, i) => {
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
          const compositeKey = `${codeKey}:::${nameKey}`;

          // Brand extraction
          const rawBrand = String(
            row['BRAND'] || row['BRAND / BIN'] || row['BIN'] || ''
          ).trim();

          // Category fields (tolerant to typos like Pareent category / Sub Categry)
          const rawParentCat = String(
            row['PARENT CATEGORY'] || row['PAREENT CATEGORY'] || row['PARENT_CATEGORY'] || row['PARENT'] || ''
          ).trim();
          const rawSubCat = String(
            row['SUB CATEGORY'] || row['SUB CATEGRY'] || row['SUB_CATEGORY'] || row['SUB'] || ''
          ).trim();
          const rawCat = String(
            row['CATEGORY'] || row['SIZE'] || ''
          ).trim();

          // Tile-specific columns
          const rawPrint = String(
            row['PRINT'] || row['FINISH'] || row['SURFACE'] || ''
          ).trim();
          const rawPcs = Number(
            row['PIECES PER BOX'] || row['PIECES_PER_BOX'] || row['PCS PER BOX'] || row['PCS/BOX'] || row['PACKING'] || 0
          );
          const piecesPerBox = rawPcs > 0 ? rawPcs : 1;

          const rawW = Number(row['WIDTH'] || row['W'] || 0);
          const rawH = Number(row['HEIGHT'] || row['H'] || 0);

          // Numeric prices and minimum
          const rawPur = parseFloat(
            String(row['PURCHASE PRICE (PER BOX)'] || row['PURCHASE PRICE'] || row['PURCHASE'] || row['BUY RATE'] || 0).replace(/[^\d.]/g, '')
          ) || 0;
          const rawRet = parseFloat(
            String(row['SALE PRICE (PER BOX)'] || row['SALE PRICE'] || row['SALES PRICE'] || row['RETAIL PRICE'] || row['SALE RATE'] || 0).replace(/[^\d.]/g, '')
          ) || 0;
          const rawMin = parseInt(
            String(row['MIN'] || row['MINIMUM'] || row['MINIMUM STOCK'] || row['MIN STOCK'] || 0).replace(/[^\d]/g, ''),
            10
          ) || 0;

          // Check if this row is a tile product:
          const isTileRow = rawParentCat.toLowerCase().includes('tile');
          const rawUom = String(row['UOM'] || (isTileRow ? 'BOX' : 'PCS')).trim() || (isTileRow ? 'BOX' : 'PCS');

          // Tile metric calculations (width & height in cm)
          let sqMPerPiece = 0;
          let sqMPerBox = 0;
          let purchasePerSqM = 0;
          let salePerSqM = 0;
          let profitPerBox = rawRet - rawPur;
          let profitMarginPercent = rawPur > 0 ? ((profitPerBox / rawPur) * 100).toFixed(1) : '0';

          if (rawW > 0 && rawH > 0) {
            sqMPerPiece = (rawW / 100) * (rawH / 100);
            sqMPerBox = sqMPerPiece * piecesPerBox;
            if (sqMPerBox > 0) {
              purchasePerSqM = rawPur / sqMPerBox;
              salePerSqM = rawRet / sqMPerBox;
            }
          }

          let status: DuplicateStatus = 'ready';
          let statusReason = isTileRow
            ? 'New unique tile product — ready to upload'
            : 'New unique product — ready to upload';
          let matchedDbProduct: any = undefined;
          let matchedFileRowIndex: number | undefined = undefined;

          // Check 1: Missing Required Description / Name
          if (!cleanName) {
            status = 'invalid';
            statusReason = 'Missing product description / name';
          }
          // Check 2: Duplicate in File (2-Layer: Code AND Description both duplicate)
          else if (fileSeenComposite.has(compositeKey)) {
            status = 'duplicate_in_file';
            matchedFileRowIndex = fileSeenComposite.get(compositeKey);
            statusReason = `Duplicate: Both Code ("${cleanCode || 'None'}") and Description match Row #${matchedFileRowIndex} in this file`;
          }
          // Check 3: Duplicate in Database (2-Layer: Code AND Description both duplicate)
          else if (dbByComposite.has(compositeKey)) {
            const matched = dbByComposite.get(compositeKey);
            status = 'duplicate_in_db';
            matchedDbProduct = matched;
            statusReason = `Already in Database: Both Code and Description match "${matched.product_name}" (DB ID #${matched.id})`;
          }

          // Register in seen map if clean
          if (status !== 'duplicate_in_file' && status !== 'invalid') {
            fileSeenComposite.set(compositeKey, rowIndex);
          }

          const processedItem: ProcessedRow = {
            id: `row-${rowIndex}`,
            rowIndex,
            code: cleanCode,
            productName: cleanName,
            category: rawCat,
            subCategory: rawSubCat,
            parentCat: rawParentCat,
            brand: rawBrand,
            purchasePrice: rawPur,
            retailPrice: rawRet,
            uom: rawUom,
            minimumStock: rawMin,
            // Tile specific
            print: rawPrint,
            tileWidth: rawW > 0 ? rawW : undefined,
            tileHeight: rawH > 0 ? rawH : undefined,
            piecesPerBox,
            sqMPerPiece,
            sqMPerBox,
            purchasePerSqM,
            salePerSqM,
            profitPerBox,
            profitMarginPercent,
            // Status
            status,
            statusReason,
            matchedDbProduct,
            matchedFileRowIndex,
            selected: status === 'ready',
            rawRow: row,
          };

          if (isTileRow) {
            parsedTileList.push(processedItem);
          } else {
            parsedOtherList.push(processedItem);
          }
        });

        setTileRows(parsedTileList);
        setOtherRows(parsedOtherList);
        setCurrentPage(1);
        setActiveFilterTab('ALL');

        // --- SMART TAB REDIRECTION RULES ---
        const tileCount = parsedTileList.length;
        const otherCount = parsedOtherList.length;

        // Rule 1: Uploaded in OTHER tab, but contains Tiles list (or predominantly tiles)
        if (activeTab === 'OTHER') {
          if ((tileCount > 0 && otherCount === 0) || (tileCount > 2 && otherCount <= 2)) {
            setActiveTab('TILES');
            toast('Tiles list detected! Automatically redirected to "Upload Tile Products" tab.', {
              icon: '🔄',
            });
          } else if (tileCount > 0 && otherCount > 0) {
            if (tileCount > otherCount) {
              setActiveTab('TILES');
            }
            toast.success(
              `Mixed file: Detected ${tileCount} Tile products & ${otherCount} Other products separated across tabs.`
            );
          } else {
            toast.success(`Parsed ${otherCount} products in Other Products tab.`);
          }
        }
        // Rule 2: Uploaded in TILE tab, but contains >2 non-tile items (or purely non-tiles)
        else if (activeTab === 'TILES') {
          if ((otherCount > 0 && tileCount === 0) || (otherCount > 2 && tileCount <= 2)) {
            setActiveTab('OTHER');
            toast(
              `Non-tile list detected (${otherCount} items)! Automatically redirected to "Upload Other Products" tab.`,
              { icon: '🔄' }
            );
          } else if (tileCount > 0 && otherCount > 0) {
            toast.success(
              `Mixed file: Detected ${tileCount} Tile products & ${otherCount} Other products separated across tabs.`
            );
          } else {
            toast.success(`Parsed ${tileCount} tile products in Tile Products tab.`);
          }
        }
      } catch (err: any) {
        toast.error('Failed to parse file: ' + err.message);
      } finally {
        setAnalyzing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Metrics calculation for the currently active tab
  const metrics = useMemo(() => {
    const total = processedRows.length;
    const ready = processedRows.filter(r => r.status === 'ready').length;
    const fileDup = processedRows.filter(r => r.status === 'duplicate_in_file').length;
    const dbDup = processedRows.filter(r => r.status === 'duplicate_in_db').length;
    const invalid = processedRows.filter(r => r.status === 'invalid').length;
    const selectedCount = processedRows.filter(r => r.selected).length;

    return { total, ready, fileDup, dbDup, invalid, selectedCount };
  }, [processedRows]);

  // Filtered rows for the preview table
  const filteredRows = useMemo(() => {
    return processedRows.filter((r) => {
      // 1. Filter Tab
      if (activeFilterTab === 'READY' && r.status !== 'ready') return false;
      if (activeFilterTab === 'FILE_DUP' && r.status !== 'duplicate_in_file') return false;
      if (activeFilterTab === 'DB_DUP' && r.status !== 'duplicate_in_db') return false;
      if (activeFilterTab === 'INVALID' && r.status !== 'invalid') return false;

      // 2. Search query
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const inCode = (r.code || '').toLowerCase().includes(query);
        const inName = (r.productName || '').toLowerCase().includes(query);
        const inCat = (r.category || '').toLowerCase().includes(query);
        const inParent = (r.parentCat || '').toLowerCase().includes(query);
        const inBrand = (r.brand || '').toLowerCase().includes(query);
        const inPrint = (r.print || '').toLowerCase().includes(query);
        if (!inCode && !inName && !inCat && !inParent && !inBrand && !inPrint) return false;
      }

      return true;
    });
  }, [processedRows, activeFilterTab, searchTerm]);

  // Paginated Rows
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Row selection handlers
  const toggleRowSelect = (id: string) => {
    setProcessedRows(prev =>
      prev.map(r => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const selectAllFiltered = () => {
    const ids = new Set(filteredRows.map(r => r.id));
    setProcessedRows(prev =>
      prev.map(r => (ids.has(r.id) ? { ...r, selected: true } : r))
    );
  };

  const deselectAllFiltered = () => {
    const ids = new Set(filteredRows.map(r => r.id));
    setProcessedRows(prev =>
      prev.map(r => (ids.has(r.id) ? { ...r, selected: false } : r))
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

  // Remove Rejected / Invalid rows only
  const removeInvalidRows = () => {
    const count = processedRows.filter(r => r.status === 'invalid').length;
    if (count === 0) {
      toast('No rejected rows to remove.');
      return;
    }
    setProcessedRows(prev => prev.filter(r => r.status !== 'invalid'));
    toast.success(`Removed ${count} rejected rows from the list.`);
  };

  // Export duplicates or current filtered list as Excel
  const handleExportFiltered = (type: 'ALL' | 'DUPLICATES' | 'REJECTED' = 'DUPLICATES') => {
    let rowsToExport: ProcessedRow[] = [];
    if (type === 'DUPLICATES') {
      rowsToExport = processedRows.filter(r => r.status === 'duplicate_in_file' || r.status === 'duplicate_in_db');
    } else if (type === 'REJECTED') {
      rowsToExport = processedRows.filter(r => r.status === 'invalid');
    } else {
      rowsToExport = filteredRows;
    }

    if (rowsToExport.length === 0) {
      toast('No rows to export.');
      return;
    }

    const exportData = rowsToExport.map(r => ({
      'Row #': r.rowIndex,
      'Status': r.status === 'ready' ? 'New Product' : r.status === 'duplicate_in_file' ? 'Duplicate in File' : r.status === 'duplicate_in_db' ? 'Already in Database' : 'Rejected / Invalid',
      'Reason': r.statusReason,
      'Item Code': r.code,
      'Product Name': r.productName,
      'Brand': r.brand,
      'Parent Category': r.parentCat,
      'Sub Category': r.subCategory,
      'Category': r.category,
      'Print / Finish': r.print || '',
      'Width (cm)': r.tileWidth || '',
      'Height (cm)': r.tileHeight || '',
      'Pieces Per Box': r.piecesPerBox || 1,
      'Sq.m Per Box': r.sqMPerBox ? r.sqMPerBox.toFixed(4) : '',
      'Purchase Price': r.purchasePrice,
      'Sales Price': r.retailPrice,
      'UOM': r.uom,
      'Minimum Stock': r.minimumStock,
      'Matched Existing DB ID': r.matchedDbProduct ? r.matchedDbProduct.id : '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    const sheetName = type === 'REJECTED' ? 'Rejected Items' : type === 'DUPLICATES' ? 'Duplicates' : 'Exported Products';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `product-${type.toLowerCase()}-report-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Downloaded ${sheetName} spreadsheet!`);
  };

  // Auto-Provision Master Data Hierarchy (Parent -> Sub -> Category, Brands, Prints)
  const syncMasterHierarchy = async (rowsToProcess: ProcessedRow[]) => {
    let createdParents = 0;
    let createdSubs = 0;
    let createdCats = 0;
    let createdBrands = 0;
    let createdPrints = 0;

    // 1. Fetch latest categories
    let catQuery = supabase.from('inventory_categories').select('*');
    if (tenantId) catQuery = catQuery.eq('tenant_id', tenantId);
    const { data: latestCats } = await catQuery;
    const catList: any[] = latestCats ? [...latestCats] : [];

    // In-memory maps for hierarchy tracking
    const parentMap = new Map<string, any>(); // lowerName -> cat
    const subMap = new Map<string, any>(); // `${parentId}:::${lowerName}` -> cat
    const catMap = new Map<string, any>(); // `${subId}:::${lowerName}` -> cat

    catList.forEach(c => {
      const lower = String(c.name || '').trim().toLowerCase();
      if (c.parent_id === null || c.parent_id === undefined) {
        parentMap.set(lower, c);
      }
    });

    catList.forEach(c => {
      const lower = String(c.name || '').trim().toLowerCase();
      if (c.parent_id !== null && c.parent_id !== undefined) {
        subMap.set(`${c.parent_id}:::${lower}`, c);
      }
    });

    catList.forEach(c => {
      const lower = String(c.name || '').trim().toLowerCase();
      if (c.parent_id !== null && c.parent_id !== undefined) {
        catMap.set(`${c.parent_id}:::${lower}`, c);
      }
    });

    // 2. Fetch latest brands
    const { data: latestBrands } = await supabase.from('inventory_brands').select('*');
    const brandMap = new Map<string, any>();
    (latestBrands || []).forEach(b => {
      brandMap.set(String(b.name || '').trim().toLowerCase(), b);
    });

    // 3. Fetch latest prints
    const printMap = new Map<string, any>();
    try {
      const { data: latestPrints } = await supabase.from('inventory_prints').select('*');
      (latestPrints || []).forEach(p => {
        const lower = String(p.name || '').trim().toLowerCase();
        if (p.category_id) {
          printMap.set(`${p.category_id}:::${lower}`, p);
        }
        printMap.set(lower, p);
      });
    } catch (e) { }

    // Process every row's master data hierarchy
    for (const r of rowsToProcess) {
      const cleanParent = (r.parentCat || '').trim();
      const cleanSub = (r.subCategory || '').trim();
      const cleanCat = (r.category || '').trim();
      const cleanBrand = (r.brand || '').trim();
      const cleanPrint = (r.print || '').trim();

      let parentId: number | string | null = null;
      let subId: number | string | null = null;

      // --- STEP 1: PARENT CATEGORY ---
      if (cleanParent) {
        const lowerParent = cleanParent.toLowerCase();
        if (parentMap.has(lowerParent)) {
          parentId = parentMap.get(lowerParent).id;
        } else {
          const payload: any = { name: cleanParent, parent_id: null };
          if (tenantId) payload.tenant_id = tenantId;
          const { data: newParent, error } = await supabase
            .from('inventory_categories')
            .insert([payload])
            .select()
            .single();

          if (!error && newParent) {
            parentId = newParent.id;
            parentMap.set(lowerParent, newParent);
            createdParents++;
          }
        }
      }

      // --- STEP 2: SUB CATEGORY (Linked to Parent) ---
      if (cleanSub && parentId) {
        const lowerSub = cleanSub.toLowerCase();
        const subKey = `${parentId}:::${lowerSub}`;
        if (subMap.has(subKey)) {
          subId = subMap.get(subKey).id;
        } else {
          const payload: any = { name: cleanSub, parent_id: parentId };
          if (tenantId) payload.tenant_id = tenantId;
          const { data: newSub, error } = await supabase
            .from('inventory_categories')
            .insert([payload])
            .select()
            .single();

          if (!error && newSub) {
            subId = newSub.id;
            subMap.set(subKey, newSub);
            createdSubs++;
          }
        }
      }

      // --- STEP 3: CATEGORY / SIZE (Linked to Sub Category or Parent) ---
      if (cleanCat && subId) {
        const lowerCat = cleanCat.toLowerCase();
        const catKey = `${subId}:::${lowerCat}`;
        if (!catMap.has(catKey)) {
          const payload: any = { name: cleanCat, parent_id: subId };
          if (tenantId) payload.tenant_id = tenantId;
          const { data: newCat, error } = await supabase
            .from('inventory_categories')
            .insert([payload])
            .select()
            .single();

          if (!error && newCat) {
            catMap.set(catKey, newCat);
            createdCats++;
          }
        }
      } else if (cleanCat && parentId && !subId) {
        const lowerCat = cleanCat.toLowerCase();
        const catKey = `${parentId}:::${lowerCat}`;
        if (!catMap.has(catKey)) {
          const payload: any = { name: cleanCat, parent_id: parentId };
          if (tenantId) payload.tenant_id = tenantId;
          const { data: newCat, error } = await supabase
            .from('inventory_categories')
            .insert([payload])
            .select()
            .single();

          if (!error && newCat) {
            catMap.set(catKey, newCat);
            createdCats++;
          }
        }
      }

      // --- STEP 4: BRAND ---
      if (cleanBrand) {
        const lowerBrand = cleanBrand.toLowerCase();
        if (!brandMap.has(lowerBrand)) {
          const { data: newBrand, error } = await supabase
            .from('inventory_brands')
            .insert([{ name: cleanBrand }])
            .select()
            .single();

          if (!error && newBrand) {
            brandMap.set(lowerBrand, newBrand);
            createdBrands++;
          }
        }
      }

      // --- STEP 5: PRINT (Linked to Parent Category if available) ---
      if (cleanPrint) {
        const lowerPrint = cleanPrint.toLowerCase();
        const printKey = parentId ? `${parentId}:::${lowerPrint}` : lowerPrint;
        if (!printMap.has(printKey) && !printMap.has(lowerPrint)) {
          try {
            const { data: newPrint, error } = await supabase
              .from('inventory_prints')
              .insert([{ name: cleanPrint, category_id: parentId || null }])
              .select()
              .single();

            if (!error && newPrint) {
              printMap.set(printKey, newPrint);
              printMap.set(lowerPrint, newPrint);
              createdPrints++;
            }
          } catch (e) { }
        }
      }
    }

    // Refresh existing states in component
    try {
      let finalCatQuery = supabase.from('inventory_categories').select('*');
      if (tenantId) finalCatQuery = finalCatQuery.eq('tenant_id', tenantId);
      const { data: refreshedCats } = await finalCatQuery;
      if (refreshedCats) setExistingCategories(refreshedCats);

      const { data: refreshedBrands } = await supabase.from('inventory_brands').select('*');
      if (refreshedBrands) setExistingBrands(refreshedBrands);

      const { data: refreshedPrints } = await supabase.from('inventory_prints').select('*');
      if (refreshedPrints) setExistingPrints(refreshedPrints);
    } catch (e) { }

    return {
      createdParents,
      createdSubs,
      createdCats,
      createdBrands,
      createdPrints,
      totalCreated: createdParents + createdSubs + createdCats + createdBrands + createdPrints,
    };
  };

  // Helper to execute upload for specific rows
  const executeRowsUpload = async (rowsToProcess: ProcessedRow[], mode: 'TILES' | 'OTHER') => {
    const rowsToInsert = rowsToProcess.filter(r => r.status === 'ready' && r.selected);
    const rowsToUpdate =
      uploadMode === 'UPDATE_EXISTING'
        ? rowsToProcess.filter(r => r.status === 'duplicate_in_db' && r.selected && r.matchedDbProduct?.id)
        : [];

    let inserted = 0;
    let updated = 0;

    // 1. INSERT CHUNK
    if (rowsToInsert.length > 0) {
      const payloads = rowsToInsert.map(r => {
        if (mode === 'TILES') {
          const w = r.tileWidth || 0;
          const h = r.tileHeight || 0;
          const pcs = r.piecesPerBox || 1;
          const sqMPerPiece = (w > 0 && h > 0) ? (w / 100) * (h / 100) : 0;
          const sqMPerBox = sqMPerPiece * pcs;
          const sizeStr = (w > 0 && h > 0) ? `${w}×${h} cm` : (r.category || '');

          return {
            product_name: r.productName,
            item_sr_no: r.code || sizeStr,
            bin: r.print || r.brand || '',
            brand: r.brand || '',
            category: r.category || '',
            sub_category: r.subCategory || '',
            sub_sub_category: r.parentCat || '',
            uom: r.uom || 'BOX',
            purchase_price: r.purchasePrice,
            retail_price: r.retailPrice,
            mrp: r.retailPrice,
            min_stock_alert: r.minimumStock,
            pieces_per_box: pcs,
            pcs_per_box: pcs,
            pieces_per_packing: pcs,
            profit: Math.max(0, r.retailPrice - r.purchasePrice),
            item_type: 'goods',
            scenario_name: 'Tile Metric',
            product_description: `[TILE PRODUCT] Size: ${sizeStr} | Box: ${pcs} pcs (${sqMPerBox.toFixed(4)} sq.m / box) | Finish/Print: ${r.print || ''} | Brand: ${r.brand || ''}`,
          };
        } else {
          return {
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
          };
        }
      });

      const chunkSize = 250;
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const chunk = payloads.slice(i, i + chunkSize);
        const { error } = await supabase.from('products').insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
      }
    }

    // 2. UPDATE CHUNK
    if (rowsToUpdate.length > 0) {
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
        if (r.parentCat) updatePayload.sub_sub_category = r.parentCat;
        if (r.brand) {
          updatePayload.brand = r.brand;
          updatePayload.bin = r.print || r.brand;
        }
        if (r.minimumStock > 0) updatePayload.min_stock_alert = r.minimumStock;
        if (mode === 'TILES' && r.piecesPerBox) {
          updatePayload.pieces_per_box = r.piecesPerBox;
          updatePayload.pcs_per_box = r.piecesPerBox;
          updatePayload.pieces_per_packing = r.piecesPerBox;
        }

        if (Object.keys(updatePayload).length > 0) {
          const { error: upError } = await supabase.from('products').update(updatePayload).eq('id', dbId);
          if (!upError) updated++;
        }
      }
    }

    return { inserted, updated };
  };

  // Upload active tab
  const handleExecuteUpload = async () => {
    const rowsToUpload = processedRows.filter(
      r => (r.status === 'ready' && r.selected) || (uploadMode === 'UPDATE_EXISTING' && r.status === 'duplicate_in_db' && r.selected)
    );

    if (rowsToUpload.length === 0) {
      toast.error('No products selected for upload in this tab.');
      return;
    }

    setLoading(true);
    setUploadProgress({ current: 0, total: rowsToUpload.length, stage: `Starting upload...` });

    try {
      let mastersCreated = 0;
      if (autoCreateMasters) {
        setUploadProgress({ current: 0, total: rowsToUpload.length, stage: 'Auto-syncing missing categories, brands & prints...' });
        const syncRes = await syncMasterHierarchy(rowsToUpload);
        mastersCreated = syncRes.totalCreated;
        if (mastersCreated > 0) {
          toast.success(
            `Master Data: Created ${syncRes.createdParents} Parents, ${syncRes.createdSubs} Subs, ${syncRes.createdCats} Sizes, ${syncRes.createdBrands} Brands, ${syncRes.createdPrints} Prints in database!`
          );
        }
      }

      setUploadProgress({ current: 0, total: rowsToUpload.length, stage: `Uploading ${activeTab === 'TILES' ? 'tile' : 'general'} products...` });
      const { inserted, updated } = await executeRowsUpload(processedRows, activeTab);
      const skipped = processedRows.length - (inserted + updated);

      setUploadResult({
        newCount: inserted,
        updatedCount: updated,
        skippedCount: skipped,
        totalRows: processedRows.length,
        mastersCount: mastersCreated,
      });

      toast.success(
        `Successfully uploaded: ${inserted} added, ${updated} updated, ${skipped} skipped.`
      );
    } catch (err: any) {
      toast.error('Upload halted: ' + err.message);
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  // Upload both tabs at once
  const handleExecuteUploadBoth = async () => {
    const totalSelected =
      otherRows.filter(r => (r.status === 'ready' && r.selected) || (uploadMode === 'UPDATE_EXISTING' && r.status === 'duplicate_in_db' && r.selected)).length +
      tileRows.filter(r => (r.status === 'ready' && r.selected) || (uploadMode === 'UPDATE_EXISTING' && r.status === 'duplicate_in_db' && r.selected)).length;

    if (totalSelected === 0) {
      toast.error('No products selected for upload across either tab.');
      return;
    }

    setLoading(true);
    try {
      let mastersCreated = 0;
      if (autoCreateMasters) {
        const allRowsToUpload = [
          ...otherRows.filter(r => (r.status === 'ready' && r.selected) || (uploadMode === 'UPDATE_EXISTING' && r.status === 'duplicate_in_db' && r.selected)),
          ...tileRows.filter(r => (r.status === 'ready' && r.selected) || (uploadMode === 'UPDATE_EXISTING' && r.status === 'duplicate_in_db' && r.selected)),
        ];
        setUploadProgress({ current: 0, total: allRowsToUpload.length, stage: 'Auto-syncing master categories, brands & prints for both tabs...' });
        const syncRes = await syncMasterHierarchy(allRowsToUpload);
        mastersCreated = syncRes.totalCreated;
        if (mastersCreated > 0) {
          toast.success(
            `Master Data: Created ${syncRes.createdParents} Parents, ${syncRes.createdSubs} Subs, ${syncRes.createdCats} Sizes, ${syncRes.createdBrands} Brands, ${syncRes.createdPrints} Prints in database!`
          );
        }
      }

      setUploadProgress({ current: 0, total: totalSelected, stage: 'Uploading all products from both tabs...' });
      const otherRes = await executeRowsUpload(otherRows, 'OTHER');
      const tileRes = await executeRowsUpload(tileRows, 'TILES');

      const totalInserted = otherRes.inserted + tileRes.inserted;
      const totalUpdated = otherRes.updated + tileRes.updated;
      const totalSkipped = (otherRows.length + tileRows.length) - (totalInserted + totalUpdated);

      setUploadResult({
        newCount: totalInserted,
        updatedCount: totalUpdated,
        skippedCount: totalSkipped,
        totalRows: otherRows.length + tileRows.length,
        mastersCount: mastersCreated,
      });

      toast.success(
        `Successfully uploaded both tabs: ${totalInserted} added, ${totalUpdated} updated, ${totalSkipped} skipped.`
      );
    } catch (err: any) {
      toast.error('Upload halted: ' + err.message);
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const handleReset = () => {
    setOtherRows([]);
    setTileRows([]);
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
            Imports Excel/CSV files with auto-detection of tiles vs standard products and full duplicate protection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasFileLoaded && (
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

      {/* TOP TABS: OTHER PRODUCTS vs TILE PRODUCTS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stroke dark:border-strokedark pb-2">
        <button
          type="button"
          onClick={() => handleTabChange('OTHER')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${activeTab === 'OTHER'
            ? 'bg-emerald-600 text-white shadow-md'
            : 'bg-white dark:bg-boxdark border border-stroke dark:border-strokedark text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
        >
          <MdLayers className="text-base" />
          <span>Upload Other Products</span>
          {otherRows.length > 0 && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${activeTab === 'OTHER' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
              {otherRows.length} items
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('TILES')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${activeTab === 'TILES'
            ? 'bg-emerald-600 text-white shadow-md'
            : 'bg-white dark:bg-boxdark border border-stroke dark:border-strokedark text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
        >
          <MdSquareFoot className="text-base" />
          <span>Upload Tile Products</span>
          {tileRows.length > 0 && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${activeTab === 'TILES' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}>
              {tileRows.length} items
            </span>
          )}
        </button>

        {isMixedFile && (
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 ml-auto flex items-center gap-1.5">
            <span>💡</span> Both categories separated: <strong>{otherRows.length} Other</strong> & <strong>{tileRows.length} Tiles</strong>
          </span>
        )}
      </div>

      {/* STEP 1: FILE PICKER / DROPZONE (Shown prominently if no file selected) */}
      {!hasFileLoaded && (
        <div className="bg-white dark:bg-boxdark rounded-3xl shadow-sm border border-slate-200 dark:border-strokedark p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-3xl mx-auto border border-emerald-200 dark:border-emerald-800">
            <MdUploadFile />
          </div>

          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-black dark:text-white">
              {activeTab === 'TILES'
                ? 'Upload Tile Products Excel or CSV Sheet'
                : 'Upload General Products Excel or CSV Sheet'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Smart auto-routing: If you upload tiles under Other Products (or non-tiles under Tiles), the system will automatically redirect and separate them across both tabs!
            </p>
          </div>

          {/* TEMPLATE INFO BOX */}
          <div className="max-w-2xl mx-auto bg-slate-50 dark:bg-meta-4/20 p-5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Supported Columns in {activeTab === 'TILES' ? 'Tile' : 'Standard'} Excel:
              </span>
              <button
                type="button"
                onClick={activeTab === 'TILES' ? handleDownloadTileTemplate : handleDownloadOtherTemplate}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <MdFileDownload className="text-sm" /> Download Sample Template
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-1.5 text-[11px]">
              {activeTab === 'TILES' ? (
                [
                  'Code',
                  'Description',
                  'Brand',
                  'Parent Category',
                  'Sub Category',
                  'Category',
                  'Print',
                  'UOM',
                  'Pieces Per Box',
                  'width',
                  'height',
                  'Purchase Price (Per Box)',
                  'Sale Price (Per Box)',
                  'Min',
                ].map((col) => (
                  <span
                    key={col}
                    className="bg-white dark:bg-boxdark border border-stroke dark:border-strokedark px-2.5 py-1 rounded-lg font-mono font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {col}
                  </span>
                ))
              ) : (
                ['CODE', 'DESCRIPTION', 'PARENT CATEGORY', 'SUB CATEGORY', 'CATEGORY', 'BRAND', 'PURCHASE PRICE', 'SALES PRICE', 'UOM', 'MINIMUM'].map((col) => (
                  <span
                    key={col}
                    className="bg-white dark:bg-boxdark border border-stroke dark:border-strokedark px-2.5 py-1 rounded-lg font-mono font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {col}
                  </span>
                ))
              )}
            </div>

            <div className="text-[11px] text-teal-700 dark:text-teal-300 bg-teal-50/80 dark:bg-teal-950/40 p-2.5 rounded-xl border border-teal-200 dark:border-teal-800/50 text-left space-y-1">
              <div className="font-bold flex items-center gap-1">
                <span>⚡</span> Intelligent Auto-Routing & Mixed Lists:
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[10px] text-slate-600 dark:text-slate-300 pl-1">
                <li>If you mistakenly upload a <strong>Tile file</strong> in the Other Products tab, it will automatically redirect to the <strong>Tile Products</strong> tab.</li>
                <li>If a file contains <strong>both tiles and other products</strong> (e.g. 5 others & 5 tiles), it automatically places each in its respective tab!</li>
                <li>2-Layer Duplicate Protection: Duplicate is triggered only if <strong>both Code AND Description match</strong>.</li>
              </ul>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
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

              <button
                type="button"
                onClick={activeTab === 'TILES' ? handleDownloadTileTemplate : handleDownloadOtherTemplate}
                className="inline-flex items-center gap-1.5 px-4 py-3 bg-white dark:bg-boxdark hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-stroke dark:border-strokedark text-xs font-bold rounded-xl transition cursor-pointer shadow-2xs"
              >
                <MdFileDownload className="text-base text-emerald-600" /> Download Template
              </button>
            </div>
          </div>

          {analyzing && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 max-w-sm mx-auto flex items-center justify-center gap-3 text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
              <Spinner />
              <span>Analyzing file and routing categories...</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: DUPLICATE ANALYSIS & UPLOAD CONTROLS (Shown once file is parsed) */}
      {hasFileLoaded && (
        <div className="space-y-5">
          {/* MASTER HIERARCHY AUTO-PROVISIONING BANNER */}
          {pendingMasters.total > 0 && (
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-200">
                  <span className="text-base">✨</span>
                  <span>New Master Hierarchy Detected in File ({pendingMasters.total} items):</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                  {pendingMasters.parents.length > 0 && (
                    <span className="bg-white dark:bg-boxdark px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 font-semibold text-emerald-800 dark:text-emerald-300">
                      📁 {pendingMasters.parents.length} Parent Categories ({pendingMasters.parents.slice(0, 3).join(', ')}{pendingMasters.parents.length > 3 ? '...' : ''})
                    </span>
                  )}
                  {pendingMasters.subs.length > 0 && (
                    <span className="bg-white dark:bg-boxdark px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 font-semibold text-emerald-800 dark:text-emerald-300">
                      📂 {pendingMasters.subs.length} Sub Categories
                    </span>
                  )}
                  {pendingMasters.brands.length > 0 && (
                    <span className="bg-white dark:bg-boxdark px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 font-semibold text-emerald-800 dark:text-emerald-300">
                      🏢 {pendingMasters.brands.length} Brands ({pendingMasters.brands.slice(0, 3).join(', ')}{pendingMasters.brands.length > 3 ? '...' : ''})
                    </span>
                  )}
                  {pendingMasters.prints.length > 0 && (
                    <span className="bg-white dark:bg-boxdark px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 font-semibold text-emerald-800 dark:text-emerald-300">
                      🎨 {pendingMasters.prints.length} Prints ({pendingMasters.prints.slice(0, 3).join(', ')}{pendingMasters.prints.length > 3 ? '...' : ''})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-boxdark px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 font-bold text-emerald-800 dark:text-emerald-200 text-xs shadow-2xs hover:bg-emerald-50 dark:hover:bg-meta-4 transition">
                  <input
                    type="checkbox"
                    checked={autoCreateMasters}
                    onChange={(e) => setAutoCreateMasters(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Auto-create on upload</span>
                </label>
              </div>
            </div>
          )}

          {/* FILE INFO & QUICK STATS FOR CURRENT TAB */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Total In Current Tab */}
            <div className="bg-white dark:bg-boxdark p-4 rounded-2xl border border-stroke dark:border-strokedark shadow-2xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                {activeTab === 'TILES' ? 'Tiles In Tab' : 'Others In Tab'}
              </span>
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
              className={`p-4 rounded-2xl border transition cursor-pointer shadow-2xs ${activeFilterTab === 'READY'
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
              className={`p-4 rounded-2xl border transition cursor-pointer shadow-2xs ${activeFilterTab === 'FILE_DUP'
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
                Repeated Code + Description
              </span>
            </div>

            {/* In Database (Blue) */}
            <div
              onClick={() => { setActiveFilterTab('DB_DUP'); setCurrentPage(1); }}
              className={`p-4 rounded-2xl border transition cursor-pointer shadow-2xs ${activeFilterTab === 'DB_DUP'
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500'
                : 'bg-white dark:bg-boxdark border-stroke dark:border-strokedark hover:border-blue-400'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-blue-700 dark:text-blue-400 font-bold uppercase tracking-wider">
                  Already in Catalog
                </span>
                <span className="text-base">🔵</span>
              </div>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {metrics.dbDup.toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Matches existing DB ID
              </span>
            </div>

            {/* Rejected / Invalid (Rose/Red) */}
            <div
              onClick={() => { setActiveFilterTab('INVALID'); setCurrentPage(1); }}
              className={`p-4 rounded-2xl border transition cursor-pointer shadow-2xs ${activeFilterTab === 'INVALID'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500'
                : 'bg-white dark:bg-boxdark border-stroke dark:border-strokedark hover:border-rose-400'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-rose-700 dark:text-rose-400 font-bold uppercase tracking-wider">
                  Rejected / Invalid
                </span>
                <span className="text-base">⛔</span>
              </div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {metrics.invalid.toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Missing required data
              </span>
            </div>
          </div>

          {/* ACTION TOOLBAR & CONTROLS */}
          <div className="bg-white dark:bg-boxdark p-4 rounded-2xl border border-stroke dark:border-strokedark shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* FILTER PILLS */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => { setActiveFilterTab('ALL'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${activeFilterTab === 'ALL'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                >
                  All Rows ({metrics.total})
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveFilterTab('READY'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${activeFilterTab === 'READY'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                    }`}
                >
                  🟢 Ready to Add ({metrics.ready})
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveFilterTab('FILE_DUP'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${activeFilterTab === 'FILE_DUP'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                    }`}
                >
                  🟡 File Duplicates ({metrics.fileDup})
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveFilterTab('DB_DUP'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${activeFilterTab === 'DB_DUP'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100'
                    }`}
                >
                  🔵 Already in DB ({metrics.dbDup})
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveFilterTab('INVALID'); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${activeFilterTab === 'INVALID'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                    }`}
                >
                  ⛔ Rejected ({metrics.invalid})
                </button>
              </div>

              {/* SEARCH BOX */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Filter by Code, Name, Brand..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full text-xs rounded-xl border border-stroke dark:border-strokedark py-2 pl-8 pr-3 bg-transparent outline-none focus:border-emerald-600 text-black dark:text-white"
                />
                <MdSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <MdClose className="text-xs" />
                  </button>
                )}
              </div>
            </div>

            {/* SELECTION ACTIONS & DUPLICATE CLEANUP BAR */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stroke dark:border-strokedark text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-500 dark:text-slate-400">
                  Selected: <strong className="text-black dark:text-white">{metrics.selectedCount}</strong>
                </span>
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="px-2.5 py-1 rounded-lg border border-stroke dark:border-strokedark hover:bg-slate-100 dark:hover:bg-meta-4 font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer"
                >
                  Select All Filtered
                </button>
                <button
                  type="button"
                  onClick={deselectAllFiltered}
                  className="px-2.5 py-1 rounded-lg border border-stroke dark:border-strokedark hover:bg-slate-100 dark:hover:bg-meta-4 font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer"
                >
                  Deselect All
                </button>

                {metrics.invalid > 0 && (
                  <button
                    type="button"
                    onClick={removeInvalidRows}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 hover:bg-rose-100 font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <MdBlock className="text-xs" /> Remove All Rejected ({metrics.invalid})
                  </button>
                )}

                {(metrics.fileDup > 0 || metrics.dbDup > 0) && (
                  <button
                    type="button"
                    onClick={removeAllDuplicates}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 hover:bg-amber-100 font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <MdDeleteOutline className="text-xs" /> Remove All Duplicates
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Catalog Master Status Legend */}
                <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-meta-4/30 px-3 py-1.5 rounded-xl border border-stroke dark:border-strokedark">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Catalog Master:</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Already Exists
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Will Create
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleExportFiltered('DUPLICATES')}
                  className="px-3 py-1.5 rounded-xl border border-stroke dark:border-strokedark hover:bg-slate-100 dark:hover:bg-meta-4 font-bold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 cursor-pointer"
                >
                  <MdFileDownload className="text-sm text-amber-600" /> Export Duplicates
                </button>

                {metrics.invalid > 0 && (
                  <button
                    type="button"
                    onClick={() => handleExportFiltered('REJECTED')}
                    className="px-3 py-1.5 rounded-xl border border-stroke dark:border-strokedark hover:bg-slate-100 dark:hover:bg-meta-4 font-bold text-slate-700 dark:text-slate-300 transition flex items-center gap-1 cursor-pointer"
                  >
                    <MdFileDownload className="text-sm text-rose-600" /> Export Rejected
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* MAIN PREVIEW TABLE */}
          <div className="bg-white dark:bg-boxdark rounded-2xl border border-stroke dark:border-strokedark shadow-sm overflow-hidden">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full table-auto border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-meta-4/40 text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-stroke dark:border-strokedark">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredRows.length > 0 && filteredRows.every(r => r.selected)}
                        onChange={(e) => (e.target.checked ? selectAllFiltered() : deselectAllFiltered())}
                        className="cursor-pointer"
                      />
                    </th>
                    <th className="p-3 w-14">Row #</th>
                    <th className="p-3">Status & Reason</th>
                    <th className="p-3">Code / SKU</th>
                    <th className="p-3">Description / Name</th>
                    <th className="p-3">Brand</th>
                    <th className="p-3">Parent / Sub / Category</th>
                    {activeTab === 'TILES' && (
                      <>
                        <th className="p-3">Finish / Print</th>
                        <th className="p-3">Tile Size & Area</th>
                        <th className="p-3">Box Coverage</th>
                        <th className="p-3">Rate / sq.m</th>
                      </>
                    )}
                    <th className="p-3">Purchase Price</th>
                    <th className="p-3">Sale Price</th>
                    <th className="p-3 w-14">UOM</th>
                    <th className="p-3 w-14">Min</th>
                    <th className="p-3 w-12 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-strokedark">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={activeTab === 'TILES' ? 15 : 11} className="p-10 text-center text-slate-400">
                        No rows found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((r) => {
                      const isReady = r.status === 'ready';
                      const isFileDup = r.status === 'duplicate_in_file';
                      const isDbDup = r.status === 'duplicate_in_db';
                      const isInvalid = r.status === 'invalid';

                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-slate-50/70 dark:hover:bg-meta-4/20 transition duration-75 ${!r.selected ? 'opacity-60 bg-slate-50/30' : ''
                            }`}
                        >
                          {/* Checkbox */}
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={r.selected}
                              disabled={isInvalid}
                              onChange={() => toggleRowSelect(r.id)}
                              className="cursor-pointer"
                            />
                          </td>

                          {/* Row # */}
                          <td className="p-3 font-mono font-bold text-slate-500">#{r.rowIndex}</td>

                          {/* Status Badge & Reason */}
                          <td className="p-3 min-w-[200px]">
                            {isReady && (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  🟢 Ready to Add
                                </span>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">{r.statusReason}</p>
                              </div>
                            )}

                            {isFileDup && (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                  🟡 Duplicate in File
                                </span>
                                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                                  {r.statusReason}
                                </p>
                              </div>
                            )}

                            {isDbDup && (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                  🔵 In Database (ID #{r.matchedDbProduct?.id})
                                </span>
                                <p className="text-[10px] text-blue-700 dark:text-blue-400 font-medium">
                                  {r.statusReason}
                                </p>
                              </div>
                            )}

                            {isInvalid && (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                  ⛔ Rejected / Invalid
                                </span>
                                <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                                  {r.statusReason}
                                </p>
                              </div>
                            )}
                          </td>

                          {/* Code */}
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {r.code || <span className="text-slate-400 italic font-normal">Auto</span>}
                          </td>

                          {/* Product Name */}
                          <td className="p-3 font-bold text-slate-900 dark:text-white min-w-[180px]">
                            {r.productName}
                          </td>

                          {/* Brand */}
                          <td className="p-3 text-slate-700 dark:text-slate-300 whitespace-nowrap font-medium">
                            {r.brand ? (
                              <div className="flex items-center gap-1.5">
                                <span>{r.brand}</span>
                                <MasterBadge exists={masterLookup.isBrandExists(r.brand)} />
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* Category hierarchy */}
                          <td className="p-3 text-[11px] text-slate-600 dark:text-slate-300 min-w-[230px]">
                            <div className="space-y-1">
                              {/* Parent Category */}
                              <div className="flex items-center flex-wrap gap-1">
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {r.parentCat || <span className="text-slate-400 italic font-normal text-[10px]">No Parent</span>}
                                </span>
                                {r.parentCat && (
                                  <MasterBadge exists={masterLookup.isParentExists(r.parentCat)} />
                                )}
                              </div>

                              {/* Sub Category */}
                              {r.subCategory && (
                                <div className="flex items-center flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                                  <span>›</span>
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">{r.subCategory}</span>
                                  <MasterBadge exists={masterLookup.isSubExists(r.parentCat, r.subCategory)} />
                                </div>
                              )}

                              {/* Category / Size */}
                              {r.category && (
                                <div className="flex items-center flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                                  <span>›</span>
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">{r.category}</span>
                                  <MasterBadge exists={masterLookup.isCatExists(r.parentCat, r.subCategory, r.category)} />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Tile Columns */}
                          {activeTab === 'TILES' && (
                            <>
                              {/* Print / Finish */}
                              <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                {r.print ? (
                                  <div className="flex items-center gap-1.5">
                                    <span>{r.print}</span>
                                    <MasterBadge exists={masterLookup.isPrintExists(r.print)} />
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* Tile Size & Area Per Piece */}
                              <td className="p-3 whitespace-nowrap">
                                {r.tileWidth && r.tileHeight ? (
                                  <div>
                                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                                      {r.tileWidth} × {r.tileHeight} cm
                                    </span>
                                    <span className="block text-[10px] text-teal-700 dark:text-teal-400 font-mono font-semibold">
                                      {r.sqMPerPiece ? `${r.sqMPerPiece.toFixed(4)} sq.m/pc` : '-'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* Box Coverage */}
                              <td className="p-3 whitespace-nowrap">
                                {r.sqMPerBox ? (
                                  <div className="bg-teal-50 dark:bg-teal-950/40 px-2 py-1 rounded-lg border border-teal-200 dark:border-teal-800/60 inline-block">
                                    <strong className="text-teal-800 dark:text-teal-300 font-mono font-black text-xs block">
                                      {r.sqMPerBox.toFixed(4)} sq.m
                                    </strong>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">
                                      {r.piecesPerBox} pcs / box
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* Rates per sq.m */}
                              <td className="p-3 whitespace-nowrap text-[11px] font-mono">
                                {r.salePerSqM ? (
                                  <div>
                                    <span className="text-emerald-700 dark:text-emerald-400 font-bold block">
                                      Sale: Rs. {r.salePerSqM.toFixed(2)}/sq.m
                                    </span>
                                    {r.purchasePerSqM ? (
                                      <span className="text-slate-500 block text-[10px]">
                                        Buy: Rs. {r.purchasePerSqM.toFixed(2)}/sq.m
                                      </span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                            </>
                          )}

                          {/* Purchase Price */}
                          <td className="p-3 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            Rs. {r.purchasePrice.toLocaleString()}
                          </td>

                          {/* Sale Price */}
                          <td className="p-3 font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                            Rs. {r.retailPrice.toLocaleString()}
                          </td>

                          {/* UOM */}
                          <td className="p-3 font-bold text-slate-700 dark:text-slate-300 uppercase whitespace-nowrap">
                            {r.uom}
                          </td>

                          {/* Min */}
                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                            {r.minimumStock || '-'}
                          </td>

                          {/* Action */}
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeRow(r.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                              title="Remove Row"
                            >
                              <MdClose className="text-sm" />
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
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-stroke dark:border-strokedark text-xs text-slate-500 gap-3">
              <span>
                Showing {paginatedRows.length} of {filteredRows.length} filtered items (Current tab: {processedRows.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1 rounded border border-stroke dark:border-strokedark disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-meta-4 transition"
                >
                  Prev
                </button>
                <span className="font-bold text-black dark:text-white px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1 rounded border border-stroke dark:border-strokedark disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-meta-4 transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* STEP 3: UPLOAD CONFIGURATION & CONFIRMATION DOCK */}
          <div className="bg-white dark:bg-boxdark p-5 rounded-3xl border border-stroke dark:border-strokedark shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-black dark:text-white flex items-center gap-2">
                <MdTune className="text-emerald-600 text-base" /> Duplicate Handling Strategy:
              </h4>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="uploadMode"
                    value="SKIP_DUPLICATES"
                    checked={uploadMode === 'SKIP_DUPLICATES'}
                    onChange={() => setUploadMode('SKIP_DUPLICATES')}
                    className="cursor-pointer"
                  />
                  <span>Skip existing catalog duplicates (Insert clean only)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="uploadMode"
                    value="UPDATE_EXISTING"
                    checked={uploadMode === 'UPDATE_EXISTING'}
                    onChange={() => setUploadMode('UPDATE_EXISTING')}
                    className="cursor-pointer"
                  />
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                    Update existing catalog items if matched in database
                  </span>
                </label>
              </div>

              {/* Master Hierarchy Provisioning Toggle */}
              <div className="pt-2 border-t border-slate-100 dark:border-strokedark/60 space-y-0.5">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={autoCreateMasters}
                    onChange={(e) => setAutoCreateMasters(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5">
                    <MdCategory className="text-emerald-600 text-sm" />
                    <span>Auto-create missing Categories, Subcategories, Brands & Prints in master lists</span>
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 pl-5">
                  Builds the 3-level tree (Parent Category → Sub Category → Category/Size) and registers Brands & Prints so dropdowns stay fully synchronized.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 text-xs font-bold rounded-xl border border-stroke dark:border-strokedark hover:bg-slate-100 dark:hover:bg-meta-4 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                Cancel & Clear
              </button>

              {/* Upload current tab */}
              <button
                type="button"
                disabled={loading || metrics.selectedCount === 0}
                onClick={handleExecuteUpload}
                className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Spinner />
                    <span>Processing {uploadProgress?.current || 0}/{uploadProgress?.total || metrics.selectedCount}...</span>
                  </>
                ) : (
                  <>
                    <MdCloudUpload className="text-base" />
                    <span>Upload {metrics.selectedCount} {activeTab === 'TILES' ? 'Tile' : 'Other'} Products</span>
                  </>
                )}
              </button>

              {/* Upload both tabs if mixed file */}
              {isMixedFile && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleExecuteUploadBoth}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 active:scale-95 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
                >
                  <MdCloudUpload className="text-base text-emerald-400" />
                  <span>Upload Both Tabs ({otherRows.length + tileRows.length} Total)</span>
                </button>
              )}
            </div>
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

            <div className="grid grid-cols-4 gap-2 bg-slate-50 dark:bg-meta-4/20 p-3 rounded-2xl border border-stroke dark:border-strokedark text-xs">
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
              <div className="p-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Masters</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5" title="New Categories, Brands & Prints created">
                  {uploadResult.mastersCount || 0}
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
