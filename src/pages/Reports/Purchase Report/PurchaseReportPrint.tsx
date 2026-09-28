import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import {
  MdPrint,
  MdArrowBack,
  MdFileDownload,
  MdTableChart,
  MdViewList,
  MdExpandMore,
  MdChevronRight,
  MdUnfoldMore,
  MdUnfoldLess,
  MdCategory,
  MdLocalMall,
  MdInventory,
  MdReceiptLong
} from 'react-icons/md';
import { useAuth } from '../../../Context/Auth';
import { exportToExcel, ExcelColumn } from '../../../utils/excelExport';
import ReportPagination from '../../../components/ReportPagination';

const PurchaseReportPrint = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { businessName, tenantId } = useAuth();
  const [loading, setLoading] = useState(true);

  const [reportRows, setReportRows] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(25);
  const [isPrinting, setIsPrinting] = useState(false);

  const [activeViewMode, setActiveViewMode] = useState<'summary' | 'detailed'>('summary');
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string | number>>(new Set());
  const [categoryHierarchyTree, setCategoryHierarchyTree] = useState<any[]>([]);
  const [productLookupMap, setProductLookupMap] = useState<Record<string, any>>({});

  const config = location.state || { type: 'purchase', filters: {} };
  const { type: rType, filters = {} } = config;

  // Helper to format line item quantity as Boxes + Pcs if it's a tile
  const formatItemLineQty = (pName: string, rawQty: number, explicitUom?: string) => {
    try {
      const safeName = String(pName || '').trim();
      const meta = productLookupMap && safeName ? productLookupMap[safeName.toLowerCase()] : null;
      const pCat = meta?.category || '';
      const sCat = meta?.sub_category || '';
      const pcsPerBox = Number(meta?.pieces_per_box || meta?.pcs_per_box || meta?.pieces_per_packing || 0);
      const isTile = Boolean(
        String(pCat).toLowerCase().includes('tile') || 
        String(sCat).toLowerCase().includes('tile') ||
        String(meta?.scenario_name || '').toLowerCase().includes('tile') ||
        pcsPerBox > 1
      );

      const packPcs = pcsPerBox > 1 ? pcsPerBox : 5;
      const numQty = Number(rawQty || 0);
      if (isTile) {
        const boxes = Math.floor(numQty);
        const loose = Math.round((numQty - boxes) * packPcs);
        if (boxes > 0 && loose > 0) {
          return `${boxes} Box + ${loose} Pcs`;
        } else if (boxes > 0) {
          return `${boxes} Box${boxes > 1 ? 'es' : ''}`;
        } else if (loose > 0) {
          return `${loose} Pcs`;
        }
        return `0 Box`;
      }
      return `${numQty} ${explicitUom || meta?.uom || 'Units'}`;
    } catch {
      return `${rawQty || 0} ${explicitUom || 'Units'}`;
    }
  };

  // Helper to compile consignment quantities grouped by UOM (e.g. ['10 Boxes + 5 Pcs', '5 EACH'])
  const getConsignmentQtyBreakdown = (itemsRaw: any): string[] => {
    try {
      const items = parseItems(itemsRaw);
      if (!Array.isArray(items) || items.length === 0) return ['-'];

      let totalBoxes = 0;
      let totalLoosePcs = 0;
      let hasTile = false;
      const nonTileMap: Record<string, number> = {};

      items.forEach((it: any) => {
        if (!it || typeof it !== 'object') return;
        const pName = String(it.itemName || it.product_name || it.name || '').trim();
        const meta = productLookupMap && pName ? productLookupMap[pName.toLowerCase()] : null;
        const pCat = meta?.category || '';
        const sCat = meta?.sub_category || '';
        const pcsPerBox = Number(meta?.pieces_per_box || meta?.pcs_per_box || meta?.pieces_per_packing || 0);
        const isTile = Boolean(
          String(pCat).toLowerCase().includes('tile') || 
          String(sCat).toLowerCase().includes('tile') ||
          String(meta?.scenario_name || '').toLowerCase().includes('tile') ||
          pcsPerBox > 1
        );
        const packPcs = pcsPerBox > 1 ? pcsPerBox : 5;
        const q = Number(it.qty || it.quantity || 0);

        if (isTile) {
          hasTile = true;
          const b = Math.floor(q);
          const l = Math.round((q - b) * packPcs);
          totalBoxes += b;
          totalLoosePcs += l;
        } else {
          const uom = String(it.uom || meta?.uom || 'EACH').toUpperCase();
          nonTileMap[uom] = (nonTileMap[uom] || 0) + q;
        }
      });

      const lines: string[] = [];
      if (hasTile) {
        const defaultPack = 5;
        const extraBoxes = Math.floor(totalLoosePcs / defaultPack);
        const remLoose = totalLoosePcs % defaultPack;
        const finalBoxes = totalBoxes + extraBoxes;

        if (finalBoxes > 0 && remLoose > 0) {
          lines.push(`${finalBoxes} Box${finalBoxes > 1 ? 'es' : ''} + ${remLoose} Pcs`);
        } else if (finalBoxes > 0) {
          lines.push(`${finalBoxes} Box${finalBoxes > 1 ? 'es' : ''}`);
        } else if (remLoose > 0) {
          lines.push(`${remLoose} Pcs`);
        }
      }

      Object.entries(nonTileMap).forEach(([uom, sum]) => {
        if (sum > 0) {
          lines.push(`${sum.toLocaleString()} ${uom}`);
        }
      });

      return lines.length > 0 ? lines : ['-'];
    } catch {
      return ['-'];
    }
  };

  // Set dynamic document title
  useEffect(() => {
    const originalTitle = document.title;
    let titlePrefix = 'Purchase Invoice Register';
    if (rType === 'category-purchases') titlePrefix = 'Category-Wise Purchases & Volume Report';
    else if (rType === 'product-purchase-history') titlePrefix = 'Product Purchase History & Price Trend';
    else if (rType === 'purchase-invoice-detail') titlePrefix = 'Purchase Invoice Itemized Detail Report';
    else if (rType === 'return') titlePrefix = 'Purchase Returns & Debit Ledger';
    else if (rType === 'purchase-query') titlePrefix = 'Purchase Parameter Transaction Register';

    document.title = `${titlePrefix} - ${businessName || 'ZOAIB ALI & COMPANY'}`;

    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      document.title = originalTitle;
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [rType, businessName]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rType, JSON.stringify(filters)]);

  const toggleRowExpanded = (key: string | number) => {
    setExpandedRowKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllExpanded = () => {
    if (expandedRowKeys.size > 0) {
      setExpandedRowKeys(new Set());
    } else {
      const allKeys = new Set<string | number>();
      if (rType === 'category-purchases') {
        categoryHierarchyTree.forEach((p, pIdx) => {
          allKeys.add(`parent-${pIdx}`);
          (p.sub_categories || []).forEach((s: any, sIdx: number) => {
            allKeys.add(`sub-${pIdx}-${sIdx}`);
          });
        });
      } else if (rType === 'product-purchase-history') {
        reportRows.forEach(r => allKeys.add(r.product_name));
      } else if (rType === 'purchase-invoice-detail') {
        reportRows.forEach(r => allKeys.add(r.id || r.purchase_no));
      }
      setExpandedRowKeys(allKeys);
    }
  };

  const handleViewModeChange = (mode: 'summary' | 'detailed') => {
    setActiveViewMode(mode);
    if (mode === 'detailed') {
      const allKeys = new Set<string | number>();
      if (rType === 'category-purchases') {
        categoryHierarchyTree.forEach((p, pIdx) => {
          allKeys.add(`parent-${pIdx}`);
          (p.sub_categories || []).forEach((s: any, sIdx: number) => {
            allKeys.add(`sub-${pIdx}-${sIdx}`);
          });
        });
      } else if (rType === 'product-purchase-history') {
        reportRows.forEach(r => allKeys.add(r.product_name));
      } else if (rType === 'purchase-invoice-detail') {
        reportRows.forEach(r => allKeys.add(r.id || r.purchase_no));
      }
      setExpandedRowKeys(allKeys);
    } else {
      setExpandedRowKeys(new Set());
    }
  };

  // Helper to parse items safely from JSON or array
  const parseItems = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return [];
  };

  useEffect(() => {
    const compilePurchaseStructuredDataset = async () => {
      try {
        setLoading(true);

        const [prodRes, purRes, retRes, catRes] = await Promise.all([
          supabase.from('products').select('*'),
          supabase.from('supplier_purchases').select('*').order('id', { ascending: true }),
          supabase.from('purchase_returns').select('*').order('id', { ascending: true }),
          supabase.from('inventory_categories').select('id, name, parent_id')
        ]);

        const allProducts = prodRes.data || [];
        const allPurchases = purRes.data || [];
        const allReturns = retRes.data || [];
        const allCategories = catRes.data || [];

        // Build category lookup and ancestor map
        const catById = new Map<number, any>();
        const catByName = new Map<string, any>();
        allCategories.forEach((c: any) => {
          if (c.id) catById.set(Number(c.id), c);
          if (c.name) catByName.set(String(c.name).trim().toLowerCase(), c);
        });

        const getCategoryAncestors = (catName: string): string[] => {
          const names: string[] = [];
          let cur = catByName.get(String(catName || '').trim().toLowerCase());
          let depth = 0;
          while (cur && depth < 10) {
            names.push(String(cur.name || '').trim().toLowerCase());
            if (cur.parent_id) {
              cur = catById.get(Number(cur.parent_id));
            } else {
              break;
            }
            depth++;
          }
          if (catName && !names.includes(String(catName).trim().toLowerCase())) {
            names.push(String(catName).trim().toLowerCase());
          }
          return names;
        };

        // Product lookup map
        const productLookup: Record<string, any> = {};
        allProducts.forEach((p: any) => {
          if (p.product_name) {
            productLookup[p.product_name.trim().toLowerCase()] = p;
          }
        });
        setProductLookupMap(productLookup);

        const getProductMeta = (pName: string) => {
          const pKey = (pName || '').trim().toLowerCase();
          const matched = productLookup[pKey] || {};

          let pCat = matched.sub_sub_category || matched.parent_category || '';
          let sCat = matched.sub_category || '';
          let lCat = matched.category || '';

          // Dynamically verify and align 3-tier hierarchy from master category tables if needed
          if (!pCat || (catByName.has(pCat.toLowerCase()) && catByName.get(pCat.toLowerCase())?.parent_id !== null)) {
            if (lCat && catByName.get(lCat.toLowerCase())?.parent_id === null) {
              pCat = matched.category;
              lCat = matched.sub_sub_category || matched.sub_category || 'General';
            } else if (matched.category && catByName.has(matched.category.toLowerCase())) {
              const leafObj = catByName.get(matched.category.toLowerCase());
              if (leafObj?.parent_id) {
                const subObj = catById.get(Number(leafObj.parent_id));
                if (subObj) {
                  sCat = subObj.name;
                  if (subObj.parent_id) {
                    const parentObj = catById.get(Number(subObj.parent_id));
                    if (parentObj) pCat = parentObj.name;
                  } else {
                    pCat = subObj.name;
                  }
                }
              } else if (leafObj) {
                pCat = leafObj.name;
              }
            }
          }

          pCat = pCat || 'General';
          sCat = sCat || 'General';
          lCat = lCat || pCat;

          const sku = matched?.sku || matched?.item_sr_no || '-';
          const isTile = Boolean(
            String(pCat).toLowerCase().includes('tile') || 
            String(sCat).toLowerCase().includes('tile') || 
            String(lCat).toLowerCase().includes('tile') ||
            Number(matched?.pieces_per_box || matched?.pcs_per_box || 0) > 1
          );
          const uom = matched?.uom || (isTile ? 'BOX' : 'Nos');
          const brand = matched?.brand || matched?.bin || '-';
          return { parentCategory: pCat, subCategory: sCat, category: lCat, sku, uom, brand };
        };

        const startTimestamp = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00').getTime() : 0;
        const endTimestamp = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59.999').getTime() : Infinity;

        const normalizeFilterList = (val: any): string[] => {
          if (!val) return [];
          const arr = Array.isArray(val) ? val : [val];
          return arr
            .map((x: any) => String(x || '').trim().toLowerCase())
            .filter((x: string) => x && x !== 'all' && !x.startsWith('all '));
        };

        const vendorList = normalizeFilterList(filters.supplier || filters.vendor);
        const locList = normalizeFilterList(filters.location);
        const parentCatList = normalizeFilterList(filters.parentCategory || filters.category);
        const subCatList = normalizeFilterList(filters.subCategory);
        const subSubCatList = normalizeFilterList(filters.subSubCategory || filters.category);
        const prodList = normalizeFilterList(filters.product);
        const brandList = normalizeFilterList(filters.brand || filters.bin);
        const uomList = normalizeFilterList(filters.uom);
        const pMode = String(filters.purchaseType || filters.saleType || '').trim().toLowerCase();

        const doesItemMatchCriteria = (it: any, purchaseHeader?: any) => {
          if (!it) return false;
          const pName = String(it.itemName || it.product_name || it.name || '').trim();
          const pKey = pName.toLowerCase();
          const { parentCategory: pCat, subCategory: sCat, category: lCat, brand, uom } = getProductMeta(pName);
          const itemWh = String(it.warehouse || it.target_warehouse || purchaseHeader?.target_warehouse || purchaseHeader?.warehouse || '').trim().toLowerCase();

          // Compile all category tags and ancestors for this product
          const allCatTags = new Set<string>();
          if (pCat) {
            getCategoryAncestors(pCat).forEach(c => allCatTags.add(c));
          }
          if (sCat) {
            getCategoryAncestors(sCat).forEach(c => allCatTags.add(c));
          }
          if (lCat) {
            getCategoryAncestors(lCat).forEach(c => allCatTags.add(c));
          }
          if (pCat.toLowerCase().includes('tile') || sCat.toLowerCase().includes('tile') || lCat.toLowerCase().includes('tile')) {
            allCatTags.add('tile');
            allCatTags.add('tiles');
          }

          if (locList.length > 0) {
            if (!itemWh || !locList.includes(itemWh)) return false;
          }
          if (prodList.length > 0) {
            if (!prodList.includes(pKey)) return false;
          }
          if (parentCatList.length > 0) {
            const matchesParent = parentCatList.some(pc => allCatTags.has(pc) || pc.includes(pCat.toLowerCase()) || pCat.toLowerCase().includes(pc));
            if (!matchesParent) return false;
          }
          if (subCatList.length > 0) {
            const matchesSub = subCatList.some(sc => allCatTags.has(sc) || sc.includes(sCat.toLowerCase()) || sCat.toLowerCase().includes(sc));
            if (!matchesSub) return false;
          }
          if (subSubCatList.length > 0) {
            const matchesSubSub = subSubCatList.some(ssc => allCatTags.has(ssc) || ssc.includes(lCat.toLowerCase()) || lCat.toLowerCase().includes(ssc));
            if (!matchesSubSub) return false;
          }
          if (brandList.length > 0) {
            const matchesBrand = brandList.some(b => 
              brand.toLowerCase().includes(b) || 
              b.includes(brand.toLowerCase()) || 
              pKey.includes(b)
            );
            if (!matchesBrand) return false;
          }
          if (uomList.length > 0) {
            if (!uomList.includes(uom.toLowerCase())) return false;
          }
          return true;
        };

        // Common purchase filter logic
        const filterPurchaseRecord = (p: any) => {
          const rawDate = p.purchase_date || p.created_at;
          const t = rawDate ? new Date(String(rawDate).includes('T') ? String(rawDate) : String(rawDate) + 'T12:00:00').getTime() : 0;
          if (t < startTimestamp || t > endTimestamp) return false;

          // Vendor filter
          if (vendorList.length > 0) {
            const pSup = String(p.supplier_name || p.vendor_name || '').trim().toLowerCase();
            if (!vendorList.includes(pSup)) return false;
          }

          // Payment mode filter
          if (pMode && pMode !== 'all') {
            const rawTerm = String(p.payment_term || '').toLowerCase();
            const isCash = rawTerm.includes('cash');
            if (pMode === 'cash' && !isCash) return false;
            if (pMode === 'credit' && isCash) return false;
          }

          const items = parseItems(p.items);

          // Location filter check
          if (locList.length > 0) {
            const headerLoc = String(p.target_warehouse || p.warehouse || '').trim().toLowerCase();
            const matchesHeader = headerLoc && locList.includes(headerLoc);
            const matchesItem = items.some((it: any) => {
              const itemLoc = String(it.warehouse || it.target_warehouse || '').trim().toLowerCase();
              return itemLoc && locList.includes(itemLoc);
            });
            if (!matchesHeader && !matchesItem) return false;
          }

          // Line item criteria check
          const hasLineItemFilters = prodList.length > 0 || parentCatList.length > 0 || subCatList.length > 0 || subSubCatList.length > 0 || brandList.length > 0 || uomList.length > 0;
          if (hasLineItemFilters) {
            if (!items.some((it: any) => doesItemMatchCriteria(it, p))) return false;
          }

          return true;
        };

        // Common return filter logic
        const filterReturnRecord = (r: any) => {
          const rawDate = r.return_date || r.created_at;
          const t = rawDate ? new Date(String(rawDate).includes('T') ? String(rawDate) : String(rawDate) + 'T12:00:00').getTime() : 0;
          if (t < startTimestamp || t > endTimestamp) return false;

          if (vendorList.length > 0) {
            const rSup = String(r.supplier_name || r.vendor_name || '').trim().toLowerCase();
            if (!vendorList.includes(rSup)) return false;
          }

          const items = parseItems(r.returned_items || r.items);
          if (locList.length > 0) {
            const headerLoc = String(r.source_warehouse || r.warehouse || '').trim().toLowerCase();
            const matchesHeader = headerLoc && locList.includes(headerLoc);
            const matchesItem = items.some((it: any) => {
              const itemLoc = String(it.warehouse || it.source_warehouse || '').trim().toLowerCase();
              return itemLoc && locList.includes(itemLoc);
            });
            if (!matchesHeader && !matchesItem) return false;
          }

          const hasLineItemFilters = prodList.length > 0 || parentCatList.length > 0 || subCatList.length > 0 || subSubCatList.length > 0 || brandList.length > 0 || uomList.length > 0;
          if (hasLineItemFilters) {
            if (!items.some((it: any) => doesItemMatchCriteria(it, r))) return false;
          }

          return true;
        };

        // ══════════════════════════════════════════════════════════════
        // 1. REPORT: CATEGORY-WISE PURCHASES & VOLUME REPORT
        // ══════════════════════════════════════════════════════════════
        if (rType === 'category-purchases') {
          const filteredPurchases = allPurchases.filter(filterPurchaseRecord);
          const filteredReturns = allReturns.filter(filterReturnRecord);

          // 3-Tier Hierarchy Tree: Parent -> Sub -> Category -> Products
          const parentCategoryTree: Record<string, any> = {};

          const getOrCreateNodes = (pCatName: string, sCatName: string, leafCatName: string) => {
            const pKey = pCatName || 'General';
            const sKey = sCatName || 'General';
            const lKey = leafCatName || 'General';

            if (!parentCategoryTree[pKey]) {
              parentCategoryTree[pKey] = {
                parent_name: pKey,
                gross_units: 0,
                returned_units: 0,
                net_units: 0,
                gross_purchases: 0,
                returned_amount: 0,
                net_expenditure: 0,
                contribution_pct: 0,
                sub_categories_map: {}
              };
            }
            const parentNode = parentCategoryTree[pKey];

            if (!parentNode.sub_categories_map[sKey]) {
              parentNode.sub_categories_map[sKey] = {
                sub_name: sKey,
                gross_units: 0,
                returned_units: 0,
                net_units: 0,
                gross_purchases: 0,
                returned_amount: 0,
                net_expenditure: 0,
                categories_map: {}
              };
            }
            const subNode = parentNode.sub_categories_map[sKey];

            if (!subNode.categories_map[lKey]) {
              subNode.categories_map[lKey] = {
                category_name: lKey,
                gross_units: 0,
                returned_units: 0,
                net_units: 0,
                gross_purchases: 0,
                returned_amount: 0,
                net_expenditure: 0,
                products_map: {}
              };
            }
            const leafNode = subNode.categories_map[lKey];

            return { parentNode, subNode, leafNode };
          };

          // Aggregate Purchases
          filteredPurchases.forEach((pur: any) => {
            const items = parseItems(pur.items);
            const pDate = String(pur.purchase_date || pur.created_at || '').split('T')[0];
            const pNo = pur.purchase_no || `PUR-${pur.id}`;
            const sName = pur.supplier_name || pur.vendor_name || 'Generic Wholesaler';

            items.forEach((it: any) => {
              const pName = (it.itemName || it.product_name || it.name || '').trim();
              if (!pName) return;

              if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                if (!filters.product.includes(pName)) return;
              }

              const { parentCategory: pCat, subCategory: sCat, category: lCat, sku, uom, brand } = getProductMeta(pName);

              if (parentCatList.length > 0) {
                const matches = parentCatList.some(fc => pCat.toLowerCase() === fc || pCat.toLowerCase().includes(fc) || fc.includes(pCat.toLowerCase()));
                if (!matches) return;
              }
              if (subCatList.length > 0) {
                const matches = subCatList.some(sc => sCat.toLowerCase() === sc || sCat.toLowerCase().includes(sc) || sc.includes(sCat.toLowerCase()));
                if (!matches) return;
              }
              if (subSubCatList.length > 0) {
                const matches = subSubCatList.some(ssc => lCat.toLowerCase() === ssc || lCat.toLowerCase().includes(ssc) || ssc.includes(lCat.toLowerCase()));
                if (!matches) return;
              }
              if (brandList.length > 0) {
                const matches = brandList.some(b => brand.toLowerCase().includes(b) || b.includes(brand.toLowerCase()) || pName.toLowerCase().includes(b));
                if (!matches) return;
              }
              if (uomList.length > 0) {
                if (!uomList.includes(uom.toLowerCase())) return;
              }

              const { parentNode, subNode, leafNode } = getOrCreateNodes(pCat, sCat, lCat);
              const qty = Number(it.qty || it.quantity || 1);
              const rate = Number(it.purchase_price ?? it.cost_price ?? it.unit_price ?? it.rate ?? it.price ?? 0);
              const lineTotal = Number(it.total || it.amount || it.subtotal || (qty * rate) || 0);

              const pKey = pName.toLowerCase();
              if (!leafNode.products_map[pKey]) {
                leafNode.products_map[pKey] = {
                  product_name: pName,
                  sku: it.sku || sku,
                  uom: it.uom || uom,
                  brand: it.brand || brand,
                  bought_qty: 0,
                  returned_qty: 0,
                  net_qty: 0,
                  gross_spend: 0,
                  returned_amount: 0,
                  net_spend: 0,
                  last_purchase_date: pDate,
                  last_supplier: sName
                };
              }

              const pEntry = leafNode.products_map[pKey];
              pEntry.bought_qty += qty;
              pEntry.gross_spend += lineTotal;
              pEntry.net_spend += lineTotal;
              pEntry.last_purchase_date = pDate;
              pEntry.last_supplier = sName;

              leafNode.gross_units += qty;
              leafNode.gross_purchases += lineTotal;
              subNode.gross_units += qty;
              subNode.gross_purchases += lineTotal;
              parentNode.gross_units += qty;
              parentNode.gross_purchases += lineTotal;
            });
          });

          // Aggregate Returns
          filteredReturns.forEach((ret: any) => {
            const items = parseItems(ret.items || ret.returned_items);
            items.forEach((it: any) => {
              const pName = (it.itemName || it.product_name || it.name || '').trim();
              if (!pName) return;

              if (prodList.length > 0) {
                if (!prodList.includes(pName.toLowerCase())) return;
              }

              const { parentCategory: pCat, subCategory: sCat, category: lCat, brand, uom } = getProductMeta(pName);

              if (parentCatList.length > 0) {
                const matches = parentCatList.some(fc => pCat.toLowerCase() === fc || pCat.toLowerCase().includes(fc) || fc.includes(pCat.toLowerCase()));
                if (!matches) return;
              }
              if (subCatList.length > 0) {
                const matches = subCatList.some(sc => sCat.toLowerCase() === sc || sCat.toLowerCase().includes(sc) || sc.includes(sCat.toLowerCase()));
                if (!matches) return;
              }
              if (subSubCatList.length > 0) {
                const matches = subSubCatList.some(ssc => lCat.toLowerCase() === ssc || lCat.toLowerCase().includes(ssc) || ssc.includes(lCat.toLowerCase()));
                if (!matches) return;
              }
              if (brandList.length > 0) {
                const matches = brandList.some(b => brand.toLowerCase().includes(b) || b.includes(brand.toLowerCase()) || pName.toLowerCase().includes(b));
                if (!matches) return;
              }
              if (uomList.length > 0) {
                if (!uomList.includes(uom.toLowerCase())) return;
              }

              const { parentNode, subNode, leafNode } = getOrCreateNodes(pCat, sCat, lCat);
              const qty = Number(it.qty || it.quantity || 1);
              const rate = Number(it.purchase_price ?? it.cost_price ?? it.unit_price ?? it.rate ?? 0);
              const lineTotal = Number(it.total || it.amount || (qty * rate) || 0);

              const pKey = pName.toLowerCase();
              if (leafNode.products_map[pKey]) {
                leafNode.products_map[pKey].returned_qty += qty;
                leafNode.products_map[pKey].returned_amount += lineTotal;
                leafNode.products_map[pKey].net_qty = leafNode.products_map[pKey].bought_qty - leafNode.products_map[pKey].returned_qty;
                leafNode.products_map[pKey].net_spend = Math.max(0, leafNode.products_map[pKey].gross_spend - leafNode.products_map[pKey].returned_amount);
              }

              leafNode.returned_units += qty;
              leafNode.returned_amount += lineTotal;
              subNode.returned_units += qty;
              subNode.returned_amount += lineTotal;
              parentNode.returned_units += qty;
              parentNode.returned_amount += lineTotal;
            });
          });

          let totalNetExpenditureAll = 0;
          Object.values(parentCategoryTree).forEach((p: any) => {
            Object.values(p.sub_categories_map).forEach((s: any) => {
              Object.values(s.categories_map).forEach((c: any) => {
                c.net_units = c.gross_units - c.returned_units;
                c.net_expenditure = Math.max(0, c.gross_purchases - c.returned_amount);
                totalNetExpenditureAll += c.net_expenditure;
              });
            });
          });

          // Compile flat rows & hierarchical tree
          const flatCategoryRows: any[] = [];
          const hierarchyTree: any[] = [];

          Object.values(parentCategoryTree).forEach((pNode: any) => {
            pNode.net_units = pNode.gross_units - pNode.returned_units;
            pNode.net_expenditure = Math.max(0, pNode.gross_purchases - pNode.returned_amount);

            const subCatList: any[] = [];

            Object.values(pNode.sub_categories_map).forEach((sNode: any) => {
              sNode.net_units = sNode.gross_units - sNode.returned_units;
              sNode.net_expenditure = Math.max(0, sNode.gross_purchases - sNode.returned_amount);

              const leafCatList: any[] = [];

              Object.values(sNode.categories_map).forEach((lNode: any) => {
                const prodList = Object.values(lNode.products_map).map((p: any) => {
                  const netQ = p.bought_qty - p.returned_qty;
                  const netS = Math.max(0, p.gross_spend - p.returned_amount);
                  const share = lNode.net_expenditure > 0 ? (netS / lNode.net_expenditure) * 100 : 0;
                  return {
                    ...p,
                    net_qty: netQ,
                    final_net_spend: netS,
                    share_of_category: share
                  };
                });

                prodList.sort((a, b) => b.final_net_spend - a.final_net_spend);

                flatCategoryRows.push({
                  category_name: lNode.category_name,
                  parent_name: pNode.parent_name,
                  sub_name: sNode.sub_name,
                  products_count: prodList.length,
                  products: prodList,
                  gross_units: lNode.gross_units,
                  returned_units: lNode.returned_units,
                  net_units: lNode.net_units,
                  gross_purchases: lNode.gross_purchases,
                  returned_amount: lNode.returned_amount,
                  net_expenditure: lNode.net_expenditure,
                  contribution_pct: totalNetExpenditureAll > 0 ? (lNode.net_expenditure / totalNetExpenditureAll) * 100 : 0
                });

                leafCatList.push({
                  ...lNode,
                  products: prodList
                });
              });

              subCatList.push({
                ...sNode,
                categories: leafCatList
              });
            });

            hierarchyTree.push({
              ...pNode,
              sub_categories: subCatList
            });
          });

          flatCategoryRows.sort((a, b) => b.net_expenditure - a.net_expenditure);
          setReportRows(flatCategoryRows);
          setCategoryHierarchyTree(hierarchyTree);
        }

        // ══════════════════════════════════════════════════════════════
        // 2. REPORT: PRODUCT PURCHASE HISTORY & PRICE TREND
        // ══════════════════════════════════════════════════════════════
        else if (rType === 'product-purchase-history') {
          const filteredPurchases = allPurchases.filter(filterPurchaseRecord);
          const productHistoryMap: Record<string, any> = {};

          filteredPurchases.forEach((pur: any) => {
            const items = parseItems(pur.items);
            const pDate = String(pur.purchase_date || pur.created_at || '').split('T')[0];
            const pNo = pur.purchase_no || `PUR-${pur.id}`;
            const sName = pur.supplier_name || pur.vendor_name || 'Generic Wholesaler';
            const warehouse = pur.target_warehouse || pur.warehouse || 'Main Warehouse';

            items.forEach((it: any) => {
              const pName = (it.itemName || it.product_name || it.name || '').trim();
              if (!pName) return;

              if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                if (!filters.product.includes(pName)) return;
              }

              const { parentCategory: pCat, subCategory: sCat, category: lCat, sku, uom, brand } = getProductMeta(pName);

              if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                if (!filters.parentCategory.includes(pCat)) return;
              }
              if (filters.subCategory && filters.subCategory.length > 0 && !filters.subCategory.includes('All')) {
                if (!filters.subCategory.includes(sCat)) return;
              }
              if (filters.subSubCategory && filters.subSubCategory.length > 0 && !filters.subSubCategory.includes('All')) {
                if (!filters.subSubCategory.includes(lCat)) return;
              }
              if (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All')) {
                if (!filters.bin.includes(brand)) return;
              }

              const qty = Number(it.qty || it.quantity || 1);
              const rate = Number(it.purchase_price ?? it.cost_price ?? it.unit_price ?? it.rate ?? it.price ?? 0);
              const lineTotal = Number(it.total || it.amount || it.subtotal || (qty * rate) || 0);

              const pKey = pName.toLowerCase();
              if (!productHistoryMap[pKey]) {
                productHistoryMap[pKey] = {
                  product_name: pName,
                  sku: it.sku || sku,
                  parent_category: pCat,
                  sub_category: sCat,
                  category: lCat,
                  brand: it.brand || brand,
                  uom: it.uom || uom,
                  total_purchased_qty: 0,
                  total_procurement_cost: 0,
                  min_unit_rate: rate > 0 ? rate : Infinity,
                  max_unit_rate: rate > 0 ? rate : 0,
                  latest_purchase_rate: rate,
                  latest_purchase_date: pDate,
                  transactions: []
                };
              }

              const pEntry = productHistoryMap[pKey];
              pEntry.total_purchased_qty += qty;
              pEntry.total_procurement_cost += lineTotal;
              if (rate > 0 && rate < pEntry.min_unit_rate) pEntry.min_unit_rate = rate;
              if (rate > pEntry.max_unit_rate) pEntry.max_unit_rate = rate;
              pEntry.latest_purchase_rate = rate;
              pEntry.latest_purchase_date = pDate;

              pEntry.transactions.push({
                purchase_no: pNo,
                date: pDate,
                supplier_name: sName,
                warehouse,
                qty,
                uom: it.uom || uom,
                rate,
                total_amount: lineTotal,
                payment_term: pur.payment_term || 'Settle'
              });
            });
          });

          const compiledProductHistory = Object.values(productHistoryMap).map((p: any) => {
            if (p.min_unit_rate === Infinity) p.min_unit_rate = 0;
            const avgRate = p.total_purchased_qty > 0 ? p.total_procurement_cost / p.total_purchased_qty : 0;
            p.transactions.sort((a: any, b: any) => b.date.localeCompare(a.date));
            return {
              ...p,
              avg_unit_rate: avgRate
            };
          });

          compiledProductHistory.sort((a, b) => b.total_procurement_cost - a.total_procurement_cost);
          setReportRows(compiledProductHistory);
        }

        // ══════════════════════════════════════════════════════════════
        // 3. REPORT: PURCHASE INVOICE ITEMIZED DETAIL REPORT
        // ══════════════════════════════════════════════════════════════
        else if (rType === 'purchase-invoice-detail') {
          let pool = allPurchases.filter(filterPurchaseRecord);

          const targetInv = filters.invoiceNo || filters.invoice;
          if (targetInv && targetInv !== 'All') {
            const list = Array.isArray(targetInv) ? targetInv : [targetInv];
            pool = pool.filter(p => list.some(inv => String(p.purchase_no || `PUR-${p.id}`).toLowerCase().includes(String(inv).toLowerCase())));
          }

          const compiledInvoices = pool.map(pur => {
            const items = parseItems(pur.items);
            const pDate = String(pur.purchase_date || pur.created_at || '').split('T')[0];
            const pNo = pur.purchase_no || `PUR-${pur.id}`;
            const sName = pur.supplier_name || pur.vendor_name || 'Generic Wholesaler';
            const warehouse = pur.target_warehouse || pur.warehouse || 'Main Warehouse';

            const lineItems = items.map((it: any, iIdx: number) => {
              const pName = (it.itemName || it.product_name || it.name || `Item ${iIdx + 1}`).trim();
              const { parentCategory, subCategory, category, brand, uom, sku } = getProductMeta(pName);
              const qty = Number(it.qty || it.quantity || 1);
              const rate = Number(it.purchase_price ?? it.cost_price ?? it.unit_price ?? it.rate ?? it.price ?? 0);
              const lineTotal = Number(it.total || it.amount || it.subtotal || (qty * rate) || 0);

              return {
                sno: iIdx + 1,
                product_name: pName,
                sku: it.sku || sku,
                parent_category: parentCategory,
                sub_category: subCategory,
                category: category,
                brand: it.brand || brand,
                uom: it.uom || uom,
                qty,
                rate,
                total_amount: lineTotal
              };
            });

            const invoiceTotalUnits = lineItems.reduce((sum: number, it: any) => sum + it.qty, 0);

            return {
              id: pur.id,
              purchase_no: pNo,
              supplier_name: sName,
              purchase_date: pDate,
              warehouse,
              payment_term: pur.payment_term || 'Settle',
              total_amount: Number(pur.total_amount || 0),
              total_units: invoiceTotalUnits,
              items_count: lineItems.length,
              line_items: lineItems
            };
          });

          compiledInvoices.sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
          setReportRows(compiledInvoices);
        }

        // ══════════════════════════════════════════════════════════════
        // 4. REPORT: PURCHASE RETURNS & DEBIT LEDGER
        // ══════════════════════════════════════════════════════════════
        else if (rType === 'return') {
          let pool = allReturns.filter(filterReturnRecord);
          const hasLineItemFilters = prodList.length > 0 || parentCatList.length > 0 || subCatList.length > 0 || subSubCatList.length > 0 || brandList.length > 0 || uomList.length > 0 || locList.length > 0;
          if (hasLineItemFilters) {
            pool = pool.map(r => {
              const allItems = parseItems(r.returned_items || r.items);
              const matchingItems = allItems.filter(it => doesItemMatchCriteria(it, r));
              const filteredTotal = matchingItems.reduce((sum: number, it: any) => {
                const qty = Number(it.qty || it.quantity || 1);
                const rate = Number(it.purchase_price ?? it.cost_price ?? it.unit_price ?? it.rate ?? it.price ?? 0);
                return sum + Number(it.total || it.amount || it.subtotal || (qty * rate) || 0);
              }, 0);
              return {
                ...r,
                returned_items: matchingItems,
                items: matchingItems,
                total_amount: filteredTotal,
                original_total_amount: r.total_amount
              };
            }).filter(r => r.items.length > 0);
          }
          setReportRows(pool);
        }

        // ══════════════════════════════════════════════════════════════
        // 5. REPORT: PURCHASE INVOICE REGISTER & PARAMETER QUERY
        // ══════════════════════════════════════════════════════════════
        else {
          let pool = allPurchases.filter(filterPurchaseRecord);
          const hasLineItemFilters = prodList.length > 0 || parentCatList.length > 0 || subCatList.length > 0 || subSubCatList.length > 0 || brandList.length > 0 || uomList.length > 0 || locList.length > 0;
          if (hasLineItemFilters) {
            pool = pool.map(p => {
              const allItems = parseItems(p.items);
              const matchingItems = allItems.filter(it => doesItemMatchCriteria(it, p));
              const filteredTotal = matchingItems.reduce((sum: number, it: any) => {
                const qty = Number(it.qty || it.quantity || 1);
                const rate = Number(it.purchase_price ?? it.cost_price ?? it.unit_price ?? it.rate ?? it.price ?? 0);
                return sum + Number(it.total || it.amount || it.subtotal || (qty * rate) || 0);
              }, 0);
              return {
                ...p,
                items: matchingItems,
                total_amount: filteredTotal,
                original_total_amount: p.total_amount
              };
            }).filter(p => p.items.length > 0);
          }
          setReportRows(pool);
        }
      } catch (err: any) {
        toast.error('Procurement auditing trace failure: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    compilePurchaseStructuredDataset();
  }, [rType, JSON.stringify(filters)]);

  const [exporting, setExporting] = useState(false);

  // ══════════════════════════════════════════════════════════════
  // EXCEL EXPORT ENGINE
  // ══════════════════════════════════════════════════════════════
  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const filterMeta = {
        'Report Type': String(rType).toUpperCase(),
        'Supplier / Vendor': filters.supplier?.length > 0 ? (Array.isArray(filters.supplier) ? filters.supplier.join(', ') : filters.supplier) : 'All',
        'Warehouse': filters.location?.length > 0 ? (Array.isArray(filters.location) ? filters.location.join(', ') : filters.location) : 'All',
        'Date Window': filters.dateFrom || filters.dateTo ? `${filters.dateFrom || 'Start'} to ${filters.dateTo || 'End'}` : 'All Time'
      };

      let columns: ExcelColumn[] = [];
      let exportData: any[] = [];
      let filename = `Purchase_Report_${rType}_${new Date().toISOString().split('T')[0]}`;

      if (rType === 'category-purchases') {
        filename = `Category_Purchases_Report_${new Date().toISOString().split('T')[0]}`;
        columns = [
          { header: 'S#', key: 'idx', width: 8, alignment: { horizontal: 'center' } },
          { header: 'Parent Category', key: 'parentCategory', width: 25 },
          { header: 'Sub-Category', key: 'subCategory', width: 25 },
          { header: 'Leaf Category', key: 'leafCategory', width: 28 },
          { header: 'SKU Count', key: 'skuCount', width: 14, alignment: { horizontal: 'center' } },
          { header: 'Inward Units', key: 'grossUnits', width: 16, numFmt: '#,##0', alignment: { horizontal: 'right' } },
          { header: 'Returned Units', key: 'returnedUnits', width: 16, numFmt: '#,##0', alignment: { horizontal: 'right' } },
          { header: 'Net Units', key: 'netUnits', width: 16, numFmt: '#,##0', alignment: { horizontal: 'right' } },
          { header: 'Gross Purchases (PKR)', key: 'grossSpend', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Returns (PKR)', key: 'returnedAmount', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Net Expenditure (PKR)', key: 'netExpenditure', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Spend Share %', key: 'sharePct', width: 16, numFmt: '0.00"%"', alignment: { horizontal: 'right' } }
        ];

        exportData = reportRows.map((r, idx) => ({
          idx: idx + 1,
          parentCategory: r.parent_name,
          subCategory: r.sub_name,
          leafCategory: r.category_name,
          skuCount: r.products_count,
          grossUnits: r.gross_units,
          returnedUnits: r.returned_units,
          netUnits: r.net_units,
          grossSpend: r.gross_purchases,
          returnedAmount: r.returned_amount,
          netExpenditure: r.net_expenditure,
          sharePct: r.contribution_pct
        }));
      } else if (rType === 'product-purchase-history') {
        filename = `Product_Purchase_History_${new Date().toISOString().split('T')[0]}`;
        columns = [
          { header: 'S#', key: 'idx', width: 8, alignment: { horizontal: 'center' } },
          { header: 'Product Name', key: 'productName', width: 35 },
          { header: 'SKU', key: 'sku', width: 18 },
          { header: 'Brand', key: 'brand', width: 18 },
          { header: 'Parent Category', key: 'parentCategory', width: 22 },
          { header: 'Sub Category', key: 'subCategory', width: 22 },
          { header: 'Leaf Category', key: 'category', width: 22 },
          { header: 'UOM', key: 'uom', width: 12, alignment: { horizontal: 'center' } },
          { header: 'Total Purchased Qty', key: 'totalQty', width: 20, numFmt: '#,##0', alignment: { horizontal: 'right' } },
          { header: 'Min Rate (PKR)', key: 'minRate', width: 18, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Max Rate (PKR)', key: 'maxRate', width: 18, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Avg Rate (PKR)', key: 'avgRate', width: 18, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Total Spend (PKR)', key: 'totalSpend', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Last Supplier', key: 'lastSupplier', width: 28 },
          { header: 'Last Purchase Date', key: 'lastDate', width: 18, alignment: { horizontal: 'center' } }
        ];

        exportData = reportRows.map((r, idx) => ({
          idx: idx + 1,
          productName: r.product_name,
          sku: r.sku,
          brand: r.brand,
          parentCategory: r.parent_category,
          subCategory: r.sub_category,
          category: r.category,
          uom: r.uom,
          totalQty: r.total_purchased_qty,
          minRate: r.min_unit_rate,
          maxRate: r.max_unit_rate,
          avgRate: r.avg_unit_rate,
          totalSpend: r.total_procurement_cost,
          lastSupplier: r.transactions?.[0]?.supplier_name || '-',
          lastDate: r.latest_purchase_date
        }));
      } else if (rType === 'purchase-invoice-detail') {
        filename = `Purchase_Detail_${new Date().toISOString().split('T')[0]}`;
        columns = [
          { header: 'Purchase No', key: 'invoiceNo', width: 20 },
          { header: 'Supplier Name', key: 'supplierName', width: 30 },
          { header: 'Date', key: 'date', width: 16, alignment: { horizontal: 'center' } },
          { header: 'Warehouse', key: 'warehouse', width: 20 },
          { header: 'Item Name', key: 'itemName', width: 32 },
          { header: 'Brand', key: 'brand', width: 18 },
          { header: 'UOM', key: 'uom', width: 12, alignment: { horizontal: 'center' } },
          { header: 'Qty', key: 'qty', width: 14, numFmt: '#,##0', alignment: { horizontal: 'right' } },
          { header: 'Unit Cost (PKR)', key: 'rate', width: 18, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Line Total (PKR)', key: 'lineTotal', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } }
        ];

        const flatItems: any[] = [];
        reportRows.forEach(inv => {
          (inv.line_items || []).forEach((it: any) => {
            flatItems.push({
              invoiceNo: inv.purchase_no,
              supplierName: inv.supplier_name,
              date: inv.purchase_date,
              warehouse: inv.warehouse,
              itemName: it.product_name,
              brand: it.brand,
              uom: it.uom,
              qty: it.qty,
              rate: it.rate,
              lineTotal: it.total_amount
            });
          });
        });
        exportData = flatItems;
      } else {
        columns = [
          { header: 'S#', key: 'idx', width: 8, alignment: { horizontal: 'center' } },
          { header: 'Processing Date', key: 'processingDate', width: 16, alignment: { horizontal: 'center' } },
          { header: rType === 'return' ? 'Return No' : 'Purchase No', key: 'docRef', width: 20 },
          { header: 'Supplier / Vendor Name', key: 'vendorName', width: 32 },
          { header: 'Purchased Line Items / Products', key: 'productDetails', width: 50 },
          { header: 'Total Consignment Qty', key: 'totalQty', width: 22, alignment: { horizontal: 'center' } },
          { header: 'Payment Term', key: 'status', width: 18, alignment: { horizontal: 'center' } },
          { header: rType === 'return' ? 'Gross Return Amount (PKR)' : 'Gross Purchase Amount (PKR)', key: 'totalAmount', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } }
        ];

        exportData = reportRows.map((row, idx) => {
          const items = parseItems(row.items || row.returned_items);
          const totalQtyStr = getConsignmentQtyBreakdown(items).join(', ');
          const productDetails = items.map((it: any) => {
            const pName = (it.itemName || it.product_name || it.name || 'Item').trim();
            const qStr = formatItemLineQty(pName, Number(it.qty || it.quantity || 1), it.uom);
            const r = Number(it.purchase_price ?? it.cost_price ?? it.rate ?? 0);
            const wh = it.warehouse || it.target_warehouse;
            return `${pName}${wh ? ` [${wh}]` : ''} (${qStr}${r > 0 ? ` @ Rs. ${r}` : ''})`;
          }).join('; ');

          return {
            idx: idx + 1,
            docRef: row.purchase_no || row.return_no || `PUR-${String(row.id).padStart(4, '0')}`,
            processingDate: row.purchase_date || row.return_date || String(row.created_at || '').split('T')[0],
            vendorName: row.supplier_name || row.vendor_name || 'Generic Wholesaler',
            productDetails: productDetails || 'No line items recorded',
            totalQty: totalQtyStr || '-',
            status: row.payment_term || row.status || 'Confirmed',
            totalAmount: Number(row.total_amount || row.return_amount || 0)
          };
        });
      }

      await exportToExcel({
        fileName: `${filename}.xlsx`,
        sheetName: `Procurement Audit`,
        companyName: businessName || 'ZOAIB ALI & COMPANY',
        reportTitle: `Master Procurement Accounting Statement (${String(rType).toUpperCase()})`,
        filterSummary: filterMeta,
        columns,
        data: exportData,
        theme: 'emerald'
      });

      toast.success('Excel workbook exported successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const paginatedRows = useMemo(() => {
    if (isPrinting || pageSize === 'all') return reportRows;
    const start = (currentPage - 1) * pageSize;
    return reportRows.slice(start, start + pageSize);
  }, [reportRows, currentPage, pageSize, isPrinting]);

  const startIndex = (currentPage - 1) * (pageSize === 'all' ? 0 : (pageSize as number));

  // High-level Metrics
  const summaryMetrics = useMemo(() => {
    if (rType === 'category-purchases') {
      const grossSpend = reportRows.reduce((s, r) => s + Number(r.gross_purchases || 0), 0);
      const retSpend = reportRows.reduce((s, r) => s + Number(r.returned_amount || 0), 0);
      const netSpend = reportRows.reduce((s, r) => s + Number(r.net_expenditure || 0), 0);
      const totalUnits = reportRows.reduce((s, r) => s + Number(r.net_units || 0), 0);
      return { grossSpend, retSpend, netSpend, totalUnits, count: reportRows.length };
    } else if (rType === 'product-purchase-history') {
      const totalSpend = reportRows.reduce((s, r) => s + Number(r.total_procurement_cost || 0), 0);
      const totalUnits = reportRows.reduce((s, r) => s + Number(r.total_purchased_qty || 0), 0);
      return { totalSpend, totalUnits, count: reportRows.length };
    } else if (rType === 'purchase-invoice-detail') {
      const totalSpend = reportRows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const totalUnits = reportRows.reduce((s, r) => s + Number(r.total_units || 0), 0);
      return { totalSpend, totalUnits, count: reportRows.length };
    } else {
      const totalSpend = reportRows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      return { totalSpend, count: reportRows.length };
    }
  }, [reportRows, rType]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full bg-white text-black p-6 space-y-6 text-xs min-h-screen print:p-0 print:m-0 print:bg-white print:text-black print:min-h-0 print:h-auto">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page { size: auto; margin: 12mm 10mm 12mm 10mm; }
          body, html { height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; }
          body * { visibility: hidden !important; }
          .print-root-container, .print-root-container * { visibility: visible !important; }
          .print-root-container { position: static !important; width: 100% !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; padding: 0 !important; margin: 0 !important; }
          aside, header, nav, footer, .print-hidden-element, button { display: none !important; visibility: hidden !important; }
          table { page-break-inside: auto !important; }
          tr, td, th { page-break-inside: avoid !important; break-inside: avoid !important; }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
        }
      `}} />

      <div className="print-root-container w-full bg-white p-4 space-y-6 print:p-0 print:space-y-4">
        {/* ── TOP ACTION BAR ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-100 p-3 rounded border print-hidden-element print:hidden">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 font-bold hover:underline cursor-pointer"
          >
            <MdArrowBack size={16} /> Back to Report Filter
          </button>
          
          <div className="flex items-center gap-2 flex-wrap">
            {(rType === 'category-purchases' || rType === 'product-purchase-history' || rType === 'purchase-invoice-detail') && (
              <div className="flex items-center bg-white p-0.5 rounded border border-gray-300 shadow-2xs mr-2">
                <button
                  type="button"
                  onClick={() => handleViewModeChange('summary')}
                  className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                    activeViewMode === 'summary' ? 'bg-primary text-white' : 'text-gray-600 hover:text-black'
                  }`}
                >
                  <MdTableChart size={14} /> Summary View
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('detailed')}
                  className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                    activeViewMode === 'detailed' ? 'bg-primary text-white' : 'text-gray-600 hover:text-black'
                  }`}
                >
                  <MdViewList size={14} /> Detailed View
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={exporting}
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white py-1.5 px-3.5 rounded font-bold cursor-pointer transition shadow-sm disabled:opacity-50"
            >
              <MdFileDownload size={16} /> {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-primary text-white py-1.5 px-4 rounded font-black cursor-pointer hover:bg-opacity-90 transition shadow-sm"
            >
              <MdPrint size={16} /> Print Report
            </button>
          </div>
        </div>

        {/* ── REPORT FORMAL HEADER BANNER ── */}
        <div className="text-center space-y-1 py-4 border-b border-double border-black">
          <h1 className="text-xl font-black uppercase tracking-widest font-serif">
            {businessName || 'ZOAIB ALI & COMPANY'}
          </h1>
          <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
            Master Corporate Procurement Audit &amp; Supplier Accounts Workbook
          </p>
          <div className="text-[10px] pt-1 font-mono flex justify-between px-2 text-gray-600">
            <span>
              Audit Sub-Categorization:{' '}
              <b className="text-black uppercase underline">
                {rType === 'category-purchases' && `Category-Wise Purchases & Volume Report${activeViewMode === 'detailed' ? ' (Hierarchical Tree Breakdown)' : ' (Summary Matrix)'}`}
                {rType === 'product-purchase-history' && `Product Purchase History & Price Trend${activeViewMode === 'detailed' ? ' (Itemized Batch Logs)' : ' (SKU Summary)'}`}
                {rType === 'purchase-invoice-detail' && `Purchase Invoice Itemized Detail Report${activeViewMode === 'detailed' ? ' (All Line Items)' : ' (Invoice Headers)'}`}
                {rType === 'return' && 'Purchase Returns & Debit Ledger'}
                {rType === 'purchase-query' && 'Purchase Parameter Query Register'}
                {rType === 'purchase' && 'Purchase Invoice Register'}
              </b>
            </span>
            <span>Duration Window Block: {filters.dateFrom || 'Initial'} up to {filters.dateTo || 'Today'}</span>
          </div>
        </div>

        {/* ── HIGH-LEVEL SUMMARY KPIS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded border border-slate-200 print:bg-white print:border-black font-mono">
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Total Records</div>
            <div className="text-sm font-black text-slate-900">{summaryMetrics.count} Entries</div>
          </div>
          {rType === 'category-purchases' && (
            <>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Gross Procurement</div>
                <div className="text-sm font-black text-slate-900">Rs. {Number(summaryMetrics.grossSpend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Return Credits (Dr)</div>
                <div className="text-sm font-black text-rose-700">Rs. {Number(summaryMetrics.retSpend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Net Total Spend</div>
                <div className="text-sm font-black text-emerald-800 underline decoration-double">Rs. {Number(summaryMetrics.netSpend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
            </>
          )}
          {(rType === 'product-purchase-history' || rType === 'purchase-invoice-detail') && (
            <>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Total Inward Units</div>
                <div className="text-sm font-black text-slate-900">{Number(summaryMetrics.totalUnits || 0).toLocaleString()} Units</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Total Procurement Value</div>
                <div className="text-sm font-black text-emerald-800 underline decoration-double">Rs. {Number(summaryMetrics.totalSpend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
            </>
          )}
          {(rType === 'purchase' || rType === 'return' || rType === 'purchase-query') && (
            <div className="col-span-3 text-right">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Aggregated Gross Valuation</div>
              <div className="text-sm font-black text-emerald-800 underline decoration-double">Rs. {Number(summaryMetrics.totalSpend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
          )}
        </div>

        {/* ── APPLIED MULTI-PARAMETER CONSTRAINTS (FOR PARAMETER BUILDER) ── */}
        {rType === 'purchase-query' && (
          <div className="bg-slate-50 border border-slate-300 rounded p-3 font-mono text-[10.5px] print:border-black space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                🔍 APPLIED QUERY CONSTRAINTS &amp; SELECTION CRITERIA:
              </span>
              <span className="text-[9.5px] text-slate-500 font-bold">
                {reportRows.length} Matching Consignment(s) Found
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-slate-700">
              <span className="bg-white px-2 py-0.5 rounded border border-slate-300">
                <b>Vendor:</b> {filters.supplier?.length > 0 && !filters.supplier.includes('All') ? (Array.isArray(filters.supplier) ? filters.supplier.join(', ') : filters.supplier) : filters.vendor?.length > 0 && !filters.vendor.includes('All') ? (Array.isArray(filters.vendor) ? filters.vendor.join(', ') : filters.vendor) : 'All Vendors'}
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-300">
                <b>Warehouse:</b> {filters.location?.length > 0 && !filters.location.includes('All') ? (Array.isArray(filters.location) ? filters.location.join(', ') : filters.location) : 'All Facilities'}
              </span>
              {filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All') && (
                <span className="bg-emerald-50 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded font-bold">
                  <b>Category:</b> {Array.isArray(filters.parentCategory) ? filters.parentCategory.join(', ') : filters.parentCategory}
                </span>
              )}
              {filters.subCategory && filters.subCategory.length > 0 && !filters.subCategory.includes('All') && (
                <span className="bg-emerald-50 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded font-bold">
                  <b>Sub-Category:</b> {Array.isArray(filters.subCategory) ? filters.subCategory.join(', ') : filters.subCategory}
                </span>
              )}
              {filters.product && filters.product.length > 0 && !filters.product.includes('All') && (
                <span className="bg-emerald-50 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded font-bold">
                  <b>Queried Product:</b> {Array.isArray(filters.product) ? filters.product.join(', ') : filters.product}
                </span>
              )}
              {(filters.brand || filters.bin) && ((filters.brand?.length > 0 && !filters.brand.includes('All')) || (filters.bin?.length > 0 && !filters.bin.includes('All'))) && (
                <span className="bg-blue-50 text-blue-900 border border-blue-300 px-2 py-0.5 rounded font-bold">
                  <b>Brand:</b> {Array.isArray(filters.brand || filters.bin) ? (filters.brand || filters.bin).join(', ') : (filters.brand || filters.bin)}
                </span>
              )}
              {(filters.purchaseType || filters.saleType) && (filters.purchaseType !== 'All' && filters.saleType !== 'All') && (
                <span className="bg-purple-50 text-purple-900 border border-purple-300 px-2 py-0.5 rounded font-bold">
                  <b>Payment Term:</b> {filters.purchaseType || filters.saleType}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── PAGINATION ── */}
        <ReportPagination
          totalItems={reportRows.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
        />

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* VIEW 1: CATEGORY-WISE PURCHASES & VOLUME REPORT */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {rType === 'category-purchases' && (
          <div className="w-full space-y-4">
            {activeViewMode === 'summary' ? (
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
                <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                  <tr>
                    <th className="p-1.5 border border-black text-center w-12">S#</th>
                    <th className="p-1.5 border border-black">Parent Category</th>
                    <th className="p-1.5 border border-black">Sub-Category</th>
                    <th className="p-1.5 border border-black">Leaf Category Title</th>
                    <th className="p-1.5 border border-black text-center w-20">SKUs</th>
                    <th className="p-1.5 border border-black text-right w-24">Inward Qty</th>
                    <th className="p-1.5 border border-black text-right w-24">Return Qty</th>
                    <th className="p-1.5 border border-black text-right w-24">Net Qty</th>
                    <th className="p-1.5 border border-black text-right w-36">Gross Spend (PKR)</th>
                    <th className="p-1.5 border border-black text-right w-32">Returns (PKR)</th>
                    <th className="p-1.5 border border-black text-right w-36">Net Spend (PKR)</th>
                    <th className="p-1.5 border border-black text-right pr-2 w-20">Share %</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50">
                        No category purchase records found matching selected criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((cat, idx) => (
                      <tr key={idx} className="border-b border-black hover:bg-gray-50 font-mono text-xs">
                        <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + idx + 1}</td>
                        <td className="p-1.5 border border-black font-sans uppercase font-bold text-slate-800">{cat.parent_name}</td>
                        <td className="p-1.5 border border-black font-sans text-slate-700">{cat.sub_name}</td>
                        <td className="p-1.5 border border-black font-sans font-semibold text-slate-900">{cat.category_name}</td>
                        <td className="p-1.5 border border-black text-center font-bold text-slate-600">{cat.products_count}</td>
                        <td className="p-1.5 border border-black text-right text-slate-800">{Number(cat.gross_units).toLocaleString()}</td>
                        <td className="p-1.5 border border-black text-right text-rose-700">{Number(cat.returned_units).toLocaleString()}</td>
                        <td className="p-1.5 border border-black text-right font-bold text-slate-900">{Number(cat.net_units).toLocaleString()}</td>
                        <td className="p-1.5 border border-black text-right text-slate-800">Rs. {Number(cat.gross_purchases).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-1.5 border border-black text-right text-rose-700">Rs. {Number(cat.returned_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-1.5 border border-black text-right font-black text-emerald-800">Rs. {Number(cat.net_expenditure).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-1.5 border border-black text-right pr-2 font-bold text-slate-700">{Number(cat.contribution_pct || 0).toFixed(1)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                    <td colSpan={5} className="p-2 border border-black text-right uppercase">
                      Total Spend Aggregations ({reportRows.length} Categories):
                    </td>
                    <td className="p-2 border border-black text-right font-black">{reportRows.reduce((s, r) => s + Number(r.gross_units || 0), 0).toLocaleString()}</td>
                    <td className="p-2 border border-black text-right text-rose-700 font-black">{reportRows.reduce((s, r) => s + Number(r.returned_units || 0), 0).toLocaleString()}</td>
                    <td className="p-2 border border-black text-right font-black">{reportRows.reduce((s, r) => s + Number(r.net_units || 0), 0).toLocaleString()}</td>
                    <td className="p-2 border border-black text-right font-black">Rs. {reportRows.reduce((s, r) => s + Number(r.gross_purchases || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 border border-black text-right text-rose-700 font-black">Rs. {reportRows.reduce((s, r) => s + Number(r.returned_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 border border-black text-right text-emerald-800 underline decoration-double font-black">Rs. {reportRows.reduce((s, r) => s + Number(r.net_expenditure || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 border border-black text-right pr-2 font-black">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              /* Detailed Hierarchical Tree View */
              <div className="space-y-4">
                <div className="flex justify-end mb-2 print:hidden">
                  <button
                    type="button"
                    onClick={toggleAllExpanded}
                    className="text-[11px] font-bold px-3 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded cursor-pointer"
                  >
                    {expandedRowKeys.size > 0 ? 'Collapse All Categories' : 'Expand All Categories'}
                  </button>
                </div>

                {categoryHierarchyTree.map((pNode, pIdx) => {
                  const pKey = `parent-${pIdx}`;
                  const isPExpanded = expandedRowKeys.has(pKey);

                  return (
                    <div key={pKey} className="border-2 border-black rounded overflow-hidden shadow-xs print:break-inside-avoid">
                      {/* Parent Category Banner */}
                      <div
                        onClick={() => toggleRowExpanded(pKey)}
                        className="bg-slate-800 text-white p-2.5 flex justify-between items-center cursor-pointer select-none hover:bg-slate-700 transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-emerald-400">{isPExpanded ? '▼' : '▶'}</span>
                          <span className="font-mono font-black uppercase text-xs tracking-wider">
                            1000 • {pNode.parent_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-6 font-mono text-xs">
                          <span>Net Inward: <b>{pNode.net_units.toLocaleString()} Units</b></span>
                          <span className="text-emerald-300 font-black">Net Spend: Rs. {Number(pNode.net_expenditure).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      {/* Sub Categories */}
                      {isPExpanded && (
                        <div className="p-2 space-y-3 bg-slate-50">
                          {pNode.sub_categories.map((sNode: any, sIdx: number) => {
                            const sKey = `sub-${pIdx}-${sIdx}`;
                            const isSExpanded = expandedRowKeys.has(sKey);

                            return (
                              <div key={sKey} className="border border-slate-300 rounded bg-white overflow-hidden">
                                <div
                                  onClick={() => toggleRowExpanded(sKey)}
                                  className="bg-slate-100 p-2 flex justify-between items-center cursor-pointer select-none hover:bg-slate-200 transition font-mono text-xs"
                                >
                                  <div className="flex items-center gap-2 pl-2">
                                    <span className="text-slate-500">{isSExpanded ? '▼' : '▶'}</span>
                                    <span className="font-bold uppercase text-slate-800">
                                      ↳ Sub-Category: {sNode.sub_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs font-semibold">
                                    <span>{sNode.net_units.toLocaleString()} Units</span>
                                    <span className="font-bold text-slate-900">Rs. {Number(sNode.net_expenditure).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                  </div>
                                </div>

                                {isSExpanded && (
                                  <div className="p-2">
                                    {sNode.categories.map((lNode: any, lIdx: number) => (
                                      <div key={lIdx} className="mb-3 last:mb-0">
                                        <div className="text-[11px] font-bold text-slate-700 bg-slate-50 px-2 py-1 border-b border-slate-200 flex justify-between font-mono">
                                          <span>• {lNode.category_name} ({lNode.products.length} SKUs)</span>
                                          <span>Total: Rs. {Number(lNode.net_expenditure).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>

                                        <table className="w-full table-auto border border-collapse border-slate-300 text-[10.5px] font-sans text-left mt-1">
                                          <thead className="bg-slate-100 border-b border-slate-300 font-mono text-[9.5px] text-slate-700 uppercase">
                                            <tr>
                                              <th className="p-1 border border-slate-300">Product / SKU Name</th>
                                              <th className="p-1 border border-slate-300 w-24">Brand</th>
                                              <th className="p-1 border border-slate-300 text-center w-16">UOM</th>
                                              <th className="p-1 border border-slate-300 text-right w-24">Bought Qty</th>
                                              <th className="p-1 border border-slate-300 text-right w-24">Returned</th>
                                              <th className="p-1 border border-slate-300 text-right w-24">Net Qty</th>
                                              <th className="p-1 border border-slate-300 text-right w-32">Gross Spend</th>
                                              <th className="p-1 border border-slate-300 text-right w-32">Net Spend (PKR)</th>
                                              <th className="p-1 border border-slate-300 text-right pr-2 w-20">Share %</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {lNode.products.map((p: any, pItemIdx: number) => (
                                              <tr key={pItemIdx} className="border-b border-slate-200 hover:bg-slate-50 font-mono text-[10px]">
                                                <td className="p-1 border border-slate-300 font-sans font-medium text-slate-900">{p.product_name}</td>
                                                <td className="p-1 border border-slate-300 font-sans text-slate-600">{p.brand}</td>
                                                <td className="p-1 border border-slate-300 text-center uppercase text-slate-500">{p.uom}</td>
                                                <td className="p-1 border border-slate-300 text-right">{p.bought_qty.toLocaleString()}</td>
                                                <td className="p-1 border border-slate-300 text-right text-rose-700">{p.returned_qty.toLocaleString()}</td>
                                                <td className="p-1 border border-slate-300 text-right font-bold text-slate-900">{p.net_qty.toLocaleString()}</td>
                                                <td className="p-1 border border-slate-300 text-right text-slate-700">Rs. {Number(p.gross_spend).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                <td className="p-1 border border-slate-300 text-right font-black text-emerald-800">Rs. {Number(p.final_net_spend).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                <td className="p-1 border border-slate-300 text-right pr-2 font-bold text-slate-600">{Number(p.share_of_category || 0).toFixed(1)}%</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* VIEW 2: PRODUCT PURCHASE HISTORY & PRICE TREND */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {rType === 'product-purchase-history' && (
          <div className="w-full space-y-4">
            <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans text-left print:w-full">
              <thead className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                <tr>
                  <th rowSpan={2} className="p-1.5 border border-black text-center w-12">S#</th>
                  <th rowSpan={2} className="p-1.5 border border-black">Target Product Description / SKU</th>
                  <th rowSpan={2} className="p-1.5 border border-black w-24">Brand</th>
                  <th colSpan={3} className="p-1 border border-black text-center bg-gray-200">Category Classification</th>
                  <th rowSpan={2} className="p-1.5 border border-black text-center w-16">UOM</th>
                  <th rowSpan={2} className="p-1.5 border border-black text-right w-24">Inward Qty</th>
                  <th rowSpan={2} className="p-1.5 border border-black text-right w-28">Min Rate (PKR)</th>
                  <th rowSpan={2} className="p-1.5 border border-black text-right w-28">Max Rate (PKR)</th>
                  <th rowSpan={2} className="p-1.5 border border-black text-right w-28">Avg Rate (PKR)</th>
                  <th rowSpan={2} className="p-1.5 border border-black text-right pr-3 w-36">Total Spend (PKR)</th>
                </tr>
                <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9px]">
                  <th className="p-1 border border-black text-left">Parent</th>
                  <th className="p-1 border border-black text-left">Sub</th>
                  <th className="p-1 border border-black text-left">Leaf</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50">
                      No product purchase history records found.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((prod, idx) => {
                    const isExpanded = activeViewMode === 'detailed' || expandedRowKeys.has(prod.product_name);

                    return (
                      <React.Fragment key={prod.product_name || idx}>
                        <tr className={`border-b border-black font-mono text-xs ${isExpanded ? 'bg-slate-100 font-bold' : 'hover:bg-gray-50'}`}>
                          <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + idx + 1}</td>
                          <td className="p-1.5 border border-black font-sans uppercase font-bold text-slate-900">
                            {prod.product_name}
                            {prod.sku && prod.sku !== '-' && <span className="ml-2 text-[10px] text-slate-500 font-mono">[{prod.sku}]</span>}
                          </td>
                          <td className="p-1.5 border border-black font-sans text-slate-600">{prod.brand || '-'}</td>
                          <td className="p-1.5 border border-black font-sans text-slate-700">{prod.parent_category || '-'}</td>
                          <td className="p-1.5 border border-black font-sans text-slate-700">{prod.sub_category || '-'}</td>
                          <td className="p-1.5 border border-black font-sans text-slate-700">{prod.category || '-'}</td>
                          <td className="p-1.5 border border-black text-center uppercase text-slate-500">{prod.uom}</td>
                          <td className="p-1.5 border border-black text-right font-bold text-slate-900">{Number(prod.total_purchased_qty).toLocaleString()}</td>
                          <td className="p-1.5 border border-black text-right text-slate-700">Rs. {Number(prod.min_unit_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="p-1.5 border border-black text-right text-slate-700">Rs. {Number(prod.max_unit_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="p-1.5 border border-black text-right font-bold text-slate-800">Rs. {Number(prod.avg_unit_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="p-1.5 border border-black text-right pr-3 font-black text-emerald-800">Rs. {Number(prod.total_procurement_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>

                        {/* Expandable batch transaction history */}
                        {isExpanded && (
                          <tr className="bg-slate-50 border-b-2 border-black">
                            <td colSpan={12} className="p-3 border border-black">
                              <div className="text-[11px] font-black uppercase text-slate-800 mb-2 font-mono flex justify-between">
                                <span>Batch Inward Procurement Audit for {prod.product_name}</span>
                                <span>{prod.transactions.length} Inward Batch(es) Logged</span>
                              </div>

                              <table className="w-full table-auto border border-collapse border-slate-300 text-[10px] font-sans text-left bg-white">
                                <thead className="bg-slate-100 border-b border-slate-300 font-mono text-[9.5px] uppercase text-slate-700">
                                  <tr>
                                    <th className="p-1 border border-slate-300 text-center w-10">S#</th>
                                    <th className="p-1 border border-slate-300 w-24 text-center">Date</th>
                                    <th className="p-1 border border-slate-300 w-28">Purchase No</th>
                                    <th className="p-1 border border-slate-300">Supplier / Vendor</th>
                                    <th className="p-1 border border-slate-300 w-32">Warehouse</th>
                                    <th className="p-1 border border-slate-300 text-right w-20">Batch Qty</th>
                                    <th className="p-1 border border-slate-300 text-right w-24">Unit Rate</th>
                                    <th className="p-1 border border-slate-300 text-right pr-2 w-32">Total Value</th>
                                    <th className="p-1 border border-slate-300 text-center w-20">Payment Term</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {prod.transactions.map((tx: any, tIdx: number) => (
                                    <tr key={tIdx} className="border-b border-slate-200 hover:bg-slate-50 font-mono">
                                      <td className="p-1 border border-slate-300 text-center text-slate-400">{tIdx + 1}</td>
                                      <td className="p-1 border border-slate-300 text-center text-slate-600">{tx.date}</td>
                                      <td className="p-1 border border-slate-300 font-bold text-primary">{tx.purchase_no}</td>
                                      <td className="p-1 border border-slate-300 font-sans font-semibold text-slate-800">{tx.supplier_name}</td>
                                      <td className="p-1 border border-slate-300 font-sans text-slate-600">{tx.warehouse}</td>
                                      <td className="p-1 border border-slate-300 text-right font-bold text-slate-900">{tx.qty.toLocaleString()} {tx.uom}</td>
                                      <td className="p-1 border border-slate-300 text-right font-semibold text-slate-700">Rs. {Number(tx.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                      <td className="p-1 border border-slate-300 text-right pr-2 font-black text-emerald-800">Rs. {Number(tx.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                      <td className="p-1 border border-slate-300 text-center uppercase text-[9px] font-bold text-slate-600">{tx.payment_term}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                  <td colSpan={7} className="p-2 border border-black text-right uppercase">
                    Grand Total ({reportRows.length} Products):
                  </td>
                  <td className="p-2 border border-black text-right font-black">
                    {reportRows.reduce((s, r) => s + Number(r.total_purchased_qty || 0), 0).toLocaleString()}
                  </td>
                  <td colSpan={3} className="p-2 border border-black"></td>
                  <td className="p-2 border border-black text-right pr-3 text-emerald-800 underline decoration-double font-black text-sm">
                    Rs. {reportRows.reduce((s, r) => s + Number(r.total_procurement_cost || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 border border-black print-hidden-element print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* VIEW 3: PURCHASE INVOICE ITEMIZED DETAIL REPORT */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {rType === 'purchase-invoice-detail' && (
          activeViewMode === 'summary' ? (
            <div className="w-full overflow-x-auto">
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans antialiased text-left print:w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                    <th className="p-1.5 border border-black text-center w-10">S#</th>
                    <th className="p-1.5 border border-black text-center w-24">Date</th>
                    <th className="p-1.5 border border-black w-32 font-mono">Purchase No</th>
                    <th className="p-1.5 border border-black">Supplier / Vendor</th>
                    <th className="p-1.5 border border-black w-28">Warehouse</th>
                    <th className="p-1.5 border border-black text-center w-24">Items Count</th>
                    <th className="p-1.5 border border-black text-right w-28">Total Units</th>
                    <th className="p-1.5 border border-black text-right pr-3 w-36">Total Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50">
                        No purchase invoices found matching active report parameters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((inv, idx) => (
                      <tr key={inv.id || inv.purchase_no} className="border-b border-black font-mono text-xs hover:bg-gray-50">
                        <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + idx + 1}</td>
                        <td className="p-1.5 border border-black text-center text-slate-700">{inv.purchase_date}</td>
                        <td className="p-1.5 border border-black font-bold uppercase text-slate-900">{inv.purchase_no}</td>
                        <td className="p-1.5 border border-black font-sans font-bold text-slate-800">{inv.supplier_name}</td>
                        <td className="p-1.5 border border-black font-sans text-slate-600">{inv.warehouse}</td>
                        <td className="p-1.5 border border-black text-center font-bold text-slate-700">{inv.line_items?.length || 0}</td>
                        <td className="p-1.5 border border-black text-right font-bold text-slate-900">{Number(inv.total_units || 0).toLocaleString()}</td>
                        <td className="p-1.5 border border-black text-right pr-3 font-black text-emerald-800">
                          Rs. {Number(inv.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-gray-200 border-t-2 border-black font-black text-xs font-mono">
                  <tr>
                    <td colSpan={6} className="p-2 border border-black text-right uppercase">Total Procurement Spend:</td>
                    <td className="p-2 border border-black text-right">
                      {reportRows.reduce((s, r) => s + Number(r.total_units || 0), 0).toLocaleString()}
                    </td>
                    <td className="p-2 border border-black text-right pr-3 text-emerald-900 font-black">
                      Rs. {reportRows.reduce((s, r) => s + Number(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="w-full space-y-4">
              {paginatedRows.length === 0 ? (
                <div className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50">
                  No purchase invoices found matching active report parameters.
                </div>
              ) : (
                paginatedRows.map((inv, idx) => {
                  const invKey = inv.id || inv.purchase_no;

                  return (
                    <div key={invKey} className="border-2 border-black rounded overflow-hidden shadow-xs print:break-inside-avoid">
                      {/* Invoice Header Banner */}
                      <div className="bg-slate-100 p-2.5 border-b border-black flex justify-between items-center font-mono">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold bg-primary text-white px-2 py-0.5 rounded">
                            #{startIndex + idx + 1}
                          </span>
                          <span className="text-xs font-black uppercase text-slate-900 tracking-wide">
                            {inv.purchase_no}
                          </span>
                          <span className="text-xs font-sans font-bold text-slate-700">
                            • {inv.supplier_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-slate-600 font-sans">Warehouse: <b>{inv.warehouse}</b></span>
                          <span className="text-slate-600">Date: <b>{inv.purchase_date}</b></span>
                          <span className="font-black text-emerald-800 text-sm">Total: Rs. {Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      {/* Line Items Table */}
                      <div className="p-3 bg-white">
                        <table className="w-full table-auto border border-collapse border-slate-300 text-[10.5px] font-sans text-left">
                          <thead className="bg-slate-100 border-b border-slate-300 font-mono text-[9.5px] uppercase text-slate-700">
                            <tr>
                              <th rowSpan={2} className="p-1 border border-slate-300 text-center w-10">S#</th>
                              <th rowSpan={2} className="p-1 border border-slate-300">Merchandise Item / SKU Description</th>
                              <th rowSpan={2} className="p-1 border border-slate-300 w-24">Brand</th>
                              <th colSpan={3} className="p-1 border border-slate-300 text-center bg-slate-200">Category Classification</th>
                              <th rowSpan={2} className="p-1 border border-slate-300 text-center w-16">UOM</th>
                              <th rowSpan={2} className="p-1 border border-slate-300 text-right w-20">Inward Qty</th>
                              <th rowSpan={2} className="p-1 border border-slate-300 text-right w-28">Unit Cost (PKR)</th>
                              <th rowSpan={2} className="p-1 border border-slate-300 text-right pr-2 w-36">Line Total (PKR)</th>
                            </tr>
                            <tr className="bg-slate-100 border-b border-slate-300 font-mono text-[8.5px] uppercase text-slate-700">
                              <th className="p-1 border border-slate-300 text-left">Parent</th>
                              <th className="p-1 border border-slate-300 text-left">Sub</th>
                              <th className="p-1 border border-slate-300 text-left">Leaf</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inv.line_items.map((it: any) => (
                              <tr key={it.sno} className="border-b border-slate-200 hover:bg-slate-50 font-mono">
                                <td className="p-1 border border-slate-300 text-center text-slate-400">{it.sno}</td>
                                <td className="p-1 border border-slate-300 font-sans font-medium text-slate-900">{it.product_name}</td>
                                <td className="p-1 border border-slate-300 font-sans text-slate-600">{it.brand || '-'}</td>
                                <td className="p-1 border border-slate-300 font-sans text-slate-600">{it.parent_category || '-'}</td>
                                <td className="p-1 border border-slate-300 font-sans text-slate-600">{it.sub_category || '-'}</td>
                                <td className="p-1 border border-slate-300 font-sans text-slate-600">{it.category || '-'}</td>
                                <td className="p-1 border border-slate-300 text-center uppercase text-slate-500">{it.uom}</td>
                                <td className="p-1 border border-slate-300 text-right font-bold text-slate-900">{Number(it.qty).toLocaleString()}</td>
                                <td className="p-1 border border-slate-300 text-right text-slate-700">Rs. {Number(it.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-1 border border-slate-300 text-right pr-2 font-black text-emerald-800">Rs. {Number(it.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-50 font-mono font-bold text-xs border-t border-slate-300">
                            <tr>
                              <td colSpan={7} className="p-1.5 border border-slate-300 text-right uppercase text-slate-700">
                                Bill Subtotal ({inv.line_items.length} Items):
                              </td>
                              <td className="p-1.5 border border-slate-300 text-right text-slate-900 font-black">
                                {inv.total_units.toLocaleString()}
                              </td>
                              <td className="p-1.5 border border-slate-300"></td>
                              <td className="p-1.5 border border-slate-300 text-right pr-2 font-black text-emerald-800">
                                Rs. {Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* VIEW 4: STANDARD PURCHASE REGISTER, RETURNS & QUERY LEDGER */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {(rType === 'purchase' || rType === 'return' || rType === 'purchase-query') && (
          <div className="w-full overflow-x-auto">
            <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans antialiased text-left print:w-full">
              <thead>
                <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                  <th className="p-1.5 border border-black text-center w-10">S#</th>
                  <th className="p-1.5 border border-black text-center w-24">Date</th>
                  <th className="p-1.5 border border-black w-24">{rType === 'return' ? 'Return No' : 'Purchase No'}</th>
                  <th className="p-1.5 border border-black w-40">Supplier / Vendor</th>
                  <th className="p-1.5 border border-black">{rType === 'return' ? 'Returned Merchandise / Line Items' : 'Purchased Product Details / Line Items'}</th>
                  <th className="p-1.5 border border-black text-right w-32">Total Qty</th>
                  <th className="p-1.5 border border-black text-center w-24">{rType === 'return' ? 'Adjustment Term' : 'Payment Term'}</th>
                  <th className="p-1.5 border border-black text-right pr-3 w-36">{rType === 'return' ? 'Debit Amount' : 'Gross Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                      No rows matching active report criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, idx) => {
                    const displayDocRef = row.purchase_no || row.return_no || `ID: ${row.id}`;
                    const displayAccountTitle = row.supplier_name || row.vendor_name || 'Generic Wholesaler';
                    const displayProcessingDate = String(row.purchase_date || row.return_date || row.created_at || '').split('T')[0];
                    const items = parseItems(row.items || row.returned_items);

                    return (
                      <tr key={row.id || idx} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs">
                        <td className="p-1.5 border border-black text-center text-gray-400">{startIndex + idx + 1}</td>
                        <td className="p-1.5 border border-black text-center text-gray-600 whitespace-nowrap text-[10.5px]">{displayProcessingDate}</td>
                        <td className="p-1.5 border border-black text-primary font-black uppercase whitespace-nowrap">{displayDocRef}</td>
                        <td className="p-1.5 border border-black text-black font-sans font-bold">{displayAccountTitle}</td>
                        <td className="p-1.5 border border-black font-sans">
                          {items.length === 0 ? (
                            <span className="text-gray-400 italic text-[10px]">No line items recorded</span>
                          ) : (
                            <div className="space-y-1">
                              {items.map((it: any, iIdx: number) => {
                                const pName = (it.itemName || it.product_name || it.name || `Item ${iIdx + 1}`).trim();
                                const qtyFormatted = formatItemLineQty(pName, Number(it.qty || it.quantity || 1), it.uom);
                                const rate = Number(it.purchase_price ?? it.cost_price ?? it.unit_price ?? it.rate ?? it.price ?? 0);
                                const itemWh = it.warehouse || it.target_warehouse || row.target_warehouse;

                                return (
                                  <div
                                    key={iIdx}
                                    className="flex items-center justify-between gap-3 text-[10.5px] border-b border-slate-100 last:border-0 pb-0.5 last:pb-0 font-mono"
                                  >
                                    <span className="font-sans font-semibold text-slate-900 truncate flex items-center gap-1">
                                      {pName}
                                      {itemWh && (
                                        <span className="ml-1 text-[9.5px] text-teal-800 font-bold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                                          [{itemWh}]
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-slate-700 whitespace-nowrap text-[10px] font-bold">
                                      {qtyFormatted} {rate > 0 && <span className="text-slate-400 font-medium">@ Rs. {rate.toLocaleString()}</span>}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="p-1.5 border border-black text-right font-black font-mono text-slate-900 whitespace-nowrap text-[11px]">
                          <div className="flex flex-col items-end space-y-0.5">
                            {getConsignmentQtyBreakdown(items).map((qLine, qIdx) => (
                              <span key={qIdx} className="leading-tight">
                                {qLine}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-2 border border-black text-center uppercase text-[10px] font-black whitespace-nowrap">{row.payment_term || 'Settled'}</td>
                        <td className="p-1.5 border border-black text-right pr-3 text-success font-black whitespace-nowrap">
                          Rs. {Number(row.total_amount || row.return_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                {!isPrinting && pageSize !== 'all' && (
                  <tr className="bg-amber-50/80 border-t border-black font-bold font-mono text-xs text-amber-950">
                    <td colSpan={7} className="p-2 border border-black text-right uppercase tracking-wider text-amber-900">
                      Page {currentPage} Subtotal ({paginatedRows.length} records):
                    </td>
                    <td className="p-2 border border-black text-right pr-3 text-emerald-800 font-bold whitespace-nowrap">
                      Rs. {paginatedRows.reduce((sum, r) => sum + Number(r.total_amount || r.return_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
                <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                  <td colSpan={7} className="p-2 border border-black text-right uppercase tracking-wider text-gray-900">
                    Grand Total Summary (All {reportRows.length} Records):
                  </td>
                  <td className="p-2 border border-black text-right pr-3 text-success underline decoration-double text-sm whitespace-nowrap">
                    Rs. {reportRows.reduce((sum, r) => sum + Number(r.total_amount || r.return_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── FORMAL MULTI-LEVEL EXECUTIVE SIGNATURE BLOCK ── */}
        <div className="mt-16 grid grid-cols-3 gap-10 text-center text-[10px] font-sans font-black uppercase tracking-wider text-slate-800 break-inside-avoid">
          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">PREPARED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Procurement &amp; Supply Chain Manager</div>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">VERIFIED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Accounts Payable &amp; Vendor Ledger Auditor</div>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">AUTHORIZED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Managing Executive Director &amp; Official Seal</div>
            </div>
          </div>
        </div>

        {/* ── SOFTWARE PROVIDER FOOTER ── */}
        <div className="mt-8 pt-3 border-t border-gray-300 flex justify-between items-center text-[10px] text-gray-600 font-sans print:border-gray-400 break-inside-avoid">
          <div className="flex items-center gap-2 font-bold">
            <span className="text-black font-black uppercase">{businessName || 'ZOAIB ALI & COMPANY'}</span>
          </div>
          <div className="text-[9.5px] text-gray-600 font-mono font-medium text-right">
            Software Solution &amp; Cloud Infrastructure by <b className="text-black font-bold">NHT ENTERPRISES (Noor Horizon Technologies)</b>
            <span className="text-gray-400 mx-1.5">•</span>
            <span>Contact: <b className="text-black font-bold">03128039911</b></span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseReportPrint;
