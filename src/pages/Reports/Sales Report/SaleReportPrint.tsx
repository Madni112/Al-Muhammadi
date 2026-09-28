import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../../Context/supabaseClient';
import { toast } from 'react-hot-toast';
import Spinner from '../../../ui/Spinner';
import { MdPrint, MdArrowBack, MdFileDownload, MdViewList, MdTableChart } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';
import { useAuth } from '../../../Context/Auth';
import { exportToExcel, ExcelColumn } from '../../../utils/excelExport';
import ReportPagination from '../../../components/ReportPagination';

const SaleReportPrint = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { businessName, tenantId } = useAuth();
  const [loading, setLoading] = useState(true);

  const [reportRows, setReportRows] = useState<any[]>([]);
  const [categoryHierarchyTree, setCategoryHierarchyTree] = useState<any[]>([]);
  const [productUomMap, setProductUomMap] = useState<Record<string, string>>({});

  const config = location.state || { type: 'sale', filters: {} };
  const { type: rType, filters = {} } = config;

  // View mode for Product Sales History ('summary' | 'detailed')
  const [activeViewMode, setActiveViewMode] = useState<'summary' | 'detailed'>(
    filters.viewMode === 'detailed' ? 'detailed' : 'summary'
  );

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(activeViewMode === 'detailed' ? 10 : 25);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const handleBefore = () => setIsPrinting(true);
    const handleAfter = () => setIsPrinting(false);
    window.addEventListener('beforeprint', handleBefore);
    window.addEventListener('afterprint', handleAfter);
    return () => {
      window.removeEventListener('beforeprint', handleBefore);
      window.removeEventListener('afterprint', handleAfter);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [rType, activeViewMode]);

  useEffect(() => {
    const originalTitle = document.title;
    if (rType === 'category-sales') {
      document.title = 'Category-Wise Sales & Volume Report - ZOAIB ALI & COMPANY';
    } else if (rType === 'product-sales-history') {
      document.title = 'Product Sales History Report - ZOAIB ALI & COMPANY';
    } else if (rType === 'sales-query') {
      document.title = 'Sales Parameter Transaction Register - ZOAIB ALI & COMPANY';
    } else if (rType === 'customer-sales') {
      document.title = 'Customer Sales & Volume Analysis - ZOAIB ALI & COMPANY';
    } else if (rType === 'return') {
      document.title = 'Sales Return & Credit Ledger - ZOAIB ALI & COMPANY';
    } else if (rType === 'invoice') {
      document.title = 'Sales Invoice Detail Audit - ZOAIB ALI & COMPANY';
    } else if (rType === 'loyalty') {
      document.title = 'Customer Financial Statement & Invoice Ledger - ZOAIB ALI & COMPANY';
    } else {
      document.title = 'Commercial Sales Audit Statement - ZOAIB ALI & COMPANY';
    }

    return () => {
      document.title = originalTitle;
    };
  }, [rType]);

  useEffect(() => {
    const compileExcelStructuredDataset = async () => {
      try {
        // Normalize customer filter if it contains [Code] prefix
        if (filters.customer) {
          const rawCustList = Array.isArray(filters.customer) ? filters.customer : [filters.customer];
          filters.customer = rawCustList.map((item: string) => String(item).replace(/^\[.*?\]\s*/, '').trim());
        }

        // Fetch products lookup for UOM, categories & brands
        const { data: prodData } = await supabase.from('products').select('*');
        const uomMapObj: Record<string, string> = {};
        if (prodData) {
          prodData.forEach((p: any) => {
            if (p.product_name) {
              const isTile = Boolean(String(p.category || '').toLowerCase().includes('tile'));
              uomMapObj[p.product_name.trim().toLowerCase()] = p.uom || (isTile ? 'BOX' : 'Nos');
            }
          });
          setProductUomMap(uomMapObj);
        }

        // ── 📂 REPORT TYPE: CATEGORY-WISE SALES & VOLUME REPORT ──
        if (rType === 'category-sales') {
          const [invRes, retRes, catRes] = await Promise.all([
            supabase.from('sales_invoices').select('*').order('id', { ascending: true }),
            supabase.from('sales_returns').select('*').order('id', { ascending: true }),
            supabase.from('inventory_categories').select('id, name, parent_id')
          ]);

          if (invRes.error) throw invRes.error;
          if (retRes.error) throw retRes.error;

          const allInvoices = invRes.data || [];
          const allReturns = retRes.data || [];
          const allProducts = prodData || [];
          const allCategories = catRes.data || [];

          const catById = new Map<number, any>();
          const catByName = new Map<string, any>();
          allCategories.forEach((c: any) => {
            if (c.id) catById.set(Number(c.id), c);
            if (c.name) catByName.set(String(c.name).trim().toLowerCase(), c);
          });

          const startTimestamp = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00').getTime() : 0;
          const endTimestamp = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59.999').getTime() : Infinity;

          const parseItems = (raw: any): any[] => {
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string') {
              try { return JSON.parse(raw); } catch { return []; }
            }
            return [];
          };

          // Filter invoices
          const filteredInvoices = allInvoices.filter((inv: any) => {
            const d = inv.sale_date || inv.created_at;
            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
            if (t < startTimestamp || t > endTimestamp) return false;

            if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) {
              if (!filters.customer.includes(inv.customer_name)) return false;
            }
            if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) {
              if (!filters.salesman.includes(inv.salesman)) return false;
            }
            if (filters.location && filters.location.length > 0 && !filters.location.includes('All')) {
              if (!filters.location.includes(inv.dispatch_warehouse)) return false;
            }
            return true;
          });

          // Filter returns
          const filteredReturns = allReturns.filter((ret: any) => {
            const d = ret.return_date || ret.created_at;
            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
            if (t < startTimestamp || t > endTimestamp) return false;

            if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) {
              if (!filters.customer.includes(ret.customer_name)) return false;
            }
            return true;
          });

          // Product lookup
          const productLookup: Record<string, any> = {};
          allProducts.forEach((p: any) => {
            if (p.product_name) {
              productLookup[p.product_name.trim().toLowerCase()] = p;
            }
          });

          const getProductCategory = (pName: string): { parentCategory: string; subCategory: string; category: string; sku: string; uom: string } => {
            const pKey = pName.trim().toLowerCase();
            const matched = productLookup[pKey] || {};

            let pCat = matched.sub_sub_category || matched.parent_category || '';
            let sCat = matched.sub_category || '';
            let lCat = matched.category || '';

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
            return { parentCategory: pCat, subCategory: sCat, category: lCat, sku, uom };
          };

          // ── 3-TIER TREE DATA CONTAINER ──
          // Parent Category -> Sub Category -> Leaf Category -> Products
          const parentCategoryTree: Record<string, any> = {};

          const getOrCreateHierarchyNodes = (pCatName: string, sCatName: string, leafCatName: string) => {
            const pKey = pCatName || 'General';
            const sKey = sCatName || 'General';
            const lKey = leafCatName || 'General';

            if (!parentCategoryTree[pKey]) {
              parentCategoryTree[pKey] = {
                parent_name: pKey,
                gross_units: 0,
                returned_units: 0,
                net_units: 0,
                gross_sales: 0,
                returned_amount: 0,
                net_revenue: 0,
                contribution_pct: 0,
                invoices_set: new Set<string>(),
                transactions: [],
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
                gross_sales: 0,
                returned_amount: 0,
                net_revenue: 0,
                transactions: [],
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
                gross_sales: 0,
                returned_amount: 0,
                net_revenue: 0,
                products_map: {},
                transactions: []
              };
            }
            const leafNode = subNode.categories_map[lKey];

            return { parentNode, subNode, leafNode };
          };

          // Pre-populate catalog if showZeroSales is explicitly enabled
          if (filters.showZeroSales === true) {
            allProducts.forEach((p: any) => {
              const pCat = p.category || 'General';
              const sCat = p.sub_category || 'General';
              const lCat = p.sub_sub_category || p.category || 'General';

              if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                if (!filters.parentCategory.includes(pCat)) return;
              }
              if (filters.subCategory && filters.subCategory.length > 0 && !filters.subCategory.includes('All')) {
                if (!filters.subCategory.includes(sCat)) return;
              }
              if (filters.subSubCategory && filters.subSubCategory.length > 0 && !filters.subSubCategory.includes('All')) {
                if (!filters.subSubCategory.includes(lCat)) return;
              }

              const { leafNode } = getOrCreateHierarchyNodes(pCat, sCat, lCat);
              const pName = (p.product_name || '').trim();
              if (pName && !leafNode.products_map[pName.toLowerCase()]) {
                const isTile = Boolean(String(pCat).toLowerCase().includes('tile') || String(sCat).toLowerCase().includes('tile'));
                leafNode.products_map[pName.toLowerCase()] = {
                  product_name: pName,
                  sku: p.sku || p.item_sr_no || '-',
                  uom: p.uom || (isTile ? 'BOX' : 'Nos'),
                  sold_qty: 0,
                  returned_qty: 0,
                  net_qty: 0,
                  gross_sales: 0,
                  returned_amount: 0,
                  net_sales: 0,
                  last_sale_date: '-'
                };
              }
            });
          }

          // Process Sales Invoices
          filteredInvoices.forEach((inv: any) => {
            const invNo = inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`;
            const invDate = inv.sale_date || String(inv.created_at || '').split('T')[0];
            const items = parseItems(inv.items);
            const salesman = inv.salesman || 'Direct';
            const customerName = inv.customer_name || 'Counter Retail Buyer';
            const paymentTerm = inv.payment_term || 'Credit';
            const freightCharges = Number(inv.additional_charges || 0) + Number(inv.transport_charges || 0);

            items.forEach((it: any) => {
              const pName = (it.itemName || it.product_name || it.name || '').trim();
              if (!pName) return;

              if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                if (!filters.product.includes(pName)) return;
              }

              const { parentCategory: pCat, subCategory: sCat, category: lCat, sku, uom } = getProductCategory(pName);

              if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                const arr = Array.isArray(filters.parentCategory) ? filters.parentCategory : [filters.parentCategory];
                const matches = arr.some((fc: string) => fc.toLowerCase() === pCat.toLowerCase() || pCat.toLowerCase().includes(fc.toLowerCase()) || fc.toLowerCase().includes(pCat.toLowerCase()));
                if (!matches) return;
              }
              if (filters.subCategory && filters.subCategory.length > 0 && !filters.subCategory.includes('All')) {
                const arr = Array.isArray(filters.subCategory) ? filters.subCategory : [filters.subCategory];
                const matches = arr.some((sc: string) => sc.toLowerCase() === sCat.toLowerCase() || sCat.toLowerCase().includes(sc.toLowerCase()) || sc.toLowerCase().includes(sCat.toLowerCase()));
                if (!matches) return;
              }
              if (filters.subSubCategory && filters.subSubCategory.length > 0 && !filters.subSubCategory.includes('All')) {
                const arr = Array.isArray(filters.subSubCategory) ? filters.subSubCategory : [filters.subSubCategory];
                const matches = arr.some((ssc: string) => ssc.toLowerCase() === lCat.toLowerCase() || lCat.toLowerCase().includes(ssc.toLowerCase()) || ssc.toLowerCase().includes(lCat.toLowerCase()));
                if (!matches) return;
              }

              const { parentNode, subNode, leafNode } = getOrCreateHierarchyNodes(pCat, sCat, lCat);
              parentNode.invoices_set.add(invNo);

              const qty = Number(it.qty || it.quantity || 1);
              const discount = Number(it.discount || it.disc || 0);
              const pKey = pName.toLowerCase();
              const matchingProd = productLookup[pKey];

              // Support all POS/ERP item price fields: rp, rate, sale_price, price, unit_price, product retail_price
              let rate = Number(it.rp ?? it.rate ?? it.sale_price ?? it.price ?? it.unit_price ?? matchingProd?.retail_price ?? matchingProd?.price ?? 0);
              let lineTotal = Number(it.total || it.amount || it.net_amount || it.subtotal || 0);
              if (!lineTotal && (qty > 0 && rate > 0)) {
                lineTotal = (qty * rate) - discount;
              } else if (lineTotal > 0 && rate === 0 && qty > 0) {
                rate = (lineTotal + discount) / qty;
              }
              const grossItemSales = (qty * rate) > 0 ? (qty * rate) : (lineTotal + discount);

              if (!leafNode.products_map[pKey]) {
                leafNode.products_map[pKey] = {
                  product_name: pName,
                  sku: it.sku || sku,
                  uom: it.uom || uom,
                  sold_qty: 0,
                  returned_qty: 0,
                  net_qty: 0,
                  gross_sales: 0,
                  returned_amount: 0,
                  net_sales: 0,
                  last_sale_date: invDate
                };
              }

              leafNode.products_map[pKey].sold_qty += qty;
              leafNode.products_map[pKey].gross_sales += grossItemSales;
              leafNode.products_map[pKey].net_sales += lineTotal;
              if (leafNode.products_map[pKey].last_sale_date === '-' || invDate > leafNode.products_map[pKey].last_sale_date) {
                leafNode.products_map[pKey].last_sale_date = invDate;
              }

              // Update Leaf
              leafNode.gross_units += qty;
              leafNode.gross_sales += grossItemSales;

              // Update Sub
              subNode.gross_units += qty;
              subNode.gross_sales += grossItemSales;

              // Update Parent
              parentNode.gross_units += qty;
              parentNode.gross_sales += grossItemSales;

              const txRecord = {
                record_type: 'invoice',
                date: invDate,
                doc_no: invNo,
                customer_name: customerName,
                salesman,
                product_name: pName,
                parent_category: pCat,
                sub_category: sCat,
                category_name: lCat,
                qty,
                uom: it.uom || uom,
                rate,
                discount,
                total_amount: lineTotal,
                payment_term: paymentTerm,
                freight_charges: freightCharges
              };

              leafNode.transactions.push(txRecord);
              subNode.transactions.push(txRecord);
              parentNode.transactions.push(txRecord);
            });
          });

          // Process Sales Returns
          filteredReturns.forEach((ret: any) => {
            const retNo = ret.return_no || `RTN-${String(ret.id).padStart(4, '0')}`;
            const retDate = ret.return_date || String(ret.created_at || '').split('T')[0];
            const items = parseItems(ret.items || ret.returned_items);
            const customerName = ret.customer_name || 'Retail Client';

            items.forEach((it: any) => {
              const pName = (it.itemName || it.product_name || it.name || '').trim();
              if (!pName) return;

              if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                if (!filters.product.includes(pName)) return;
              }

              const { parentCategory: pCat, subCategory: sCat, category: lCat, sku, uom } = getProductCategory(pName);

              if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                const arr = Array.isArray(filters.parentCategory) ? filters.parentCategory : [filters.parentCategory];
                const matches = arr.some((fc: string) => fc.toLowerCase() === pCat.toLowerCase() || pCat.toLowerCase().includes(fc.toLowerCase()) || fc.toLowerCase().includes(pCat.toLowerCase()));
                if (!matches) return;
              }
              if (filters.subCategory && filters.subCategory.length > 0 && !filters.subCategory.includes('All')) {
                const arr = Array.isArray(filters.subCategory) ? filters.subCategory : [filters.subCategory];
                const matches = arr.some((sc: string) => sc.toLowerCase() === sCat.toLowerCase() || sCat.toLowerCase().includes(sc.toLowerCase()) || sc.toLowerCase().includes(sCat.toLowerCase()));
                if (!matches) return;
              }
              if (filters.subSubCategory && filters.subSubCategory.length > 0 && !filters.subSubCategory.includes('All')) {
                const arr = Array.isArray(filters.subSubCategory) ? filters.subSubCategory : [filters.subSubCategory];
                const matches = arr.some((ssc: string) => ssc.toLowerCase() === lCat.toLowerCase() || lCat.toLowerCase().includes(ssc.toLowerCase()) || ssc.toLowerCase().includes(lCat.toLowerCase()));
                if (!matches) return;
              }

              const { parentNode, subNode, leafNode } = getOrCreateHierarchyNodes(pCat, sCat, lCat);

              const qty = Number(it.qty || it.quantity || 1);
              const discount = Number(it.discount || it.disc || 0);
              const pKey = pName.toLowerCase();
              const matchingProd = productLookup[pKey];

              let rate = Number(it.rp ?? it.rate ?? it.sale_price ?? it.price ?? it.unit_price ?? matchingProd?.retail_price ?? matchingProd?.price ?? 0);
              let lineTotal = Number(it.total || it.amount || it.net_amount || it.subtotal || 0);
              if (!lineTotal && (qty > 0 && rate > 0)) {
                lineTotal = (qty * rate) - discount;
              } else if (lineTotal > 0 && rate === 0 && qty > 0) {
                rate = (lineTotal + discount) / qty;
              }

              if (!leafNode.products_map[pKey]) {
                leafNode.products_map[pKey] = {
                  product_name: pName,
                  sku: it.sku || sku,
                  uom: it.uom || uom,
                  sold_qty: 0,
                  returned_qty: 0,
                  net_qty: 0,
                  gross_sales: 0,
                  returned_amount: 0,
                  net_sales: 0,
                  last_sale_date: '-'
                };
              }

              leafNode.products_map[pKey].returned_qty += qty;
              leafNode.products_map[pKey].returned_amount += lineTotal;
              leafNode.products_map[pKey].net_sales = Math.max(0, leafNode.products_map[pKey].net_sales - lineTotal);

              // Update Leaf
              leafNode.returned_units += qty;
              leafNode.returned_amount += lineTotal;

              // Update Sub
              subNode.returned_units += qty;
              subNode.returned_amount += lineTotal;

              // Update Parent
              parentNode.returned_units += qty;
              parentNode.returned_amount += lineTotal;

              const txRecord = {
                record_type: 'return',
                date: retDate,
                doc_no: retNo,
                customer_name: customerName,
                salesman: 'Direct Return',
                product_name: pName,
                parent_category: pCat,
                sub_category: sCat,
                category_name: lCat,
                qty,
                uom: it.uom || uom,
                rate,
                discount: 0,
                total_amount: lineTotal,
                payment_term: 'Return Credit',
                freight_charges: 0
              };

              leafNode.transactions.push(txRecord);
              subNode.transactions.push(txRecord);
              parentNode.transactions.push(txRecord);
            });
          });

          // Total revenue across all categories
          let allCategoriesRevenue = 0;
          Object.values(parentCategoryTree).forEach((p: any) => {
            Object.values(p.sub_categories_map).forEach((s: any) => {
              Object.values(s.categories_map).forEach((c: any) => {
                c.net_units = c.gross_units - c.returned_units;
                c.net_revenue = Math.max(0, c.gross_sales - c.returned_amount);
                allCategoriesRevenue += c.net_revenue;
              });
            });
          });

          // Compile flat category list with parent and sub category references
          const compiledCategoryRows: any[] = [];
          Object.values(parentCategoryTree).forEach((parentNode: any) => {
            Object.values(parentNode.sub_categories_map).forEach((subNode: any) => {
              Object.values(subNode.categories_map).forEach((leafNode: any) => {
                const productList = Object.values(leafNode.products_map).map((p: any) => {
                  const pNetQty = p.sold_qty - p.returned_qty;
                  const pNetSales = Math.max(0, p.gross_sales - p.returned_amount);
                  const pShare = leafNode.net_revenue > 0 ? (pNetSales / leafNode.net_revenue) * 100 : 0;
                  return {
                    ...p,
                    net_qty: pNetQty,
                    final_net_sales: pNetSales,
                    share_of_category: pShare
                  };
                });

                productList.sort((a, b) => b.final_net_sales - a.final_net_sales);
                leafNode.transactions.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));

                compiledCategoryRows.push({
                  category_name: leafNode.category_name,
                  parent_name: parentNode.parent_name,
                  sub_name: subNode.sub_name,
                  products_count: productList.length,
                  products: productList,
                  transactions: leafNode.transactions,
                  gross_units: leafNode.gross_units,
                  returned_units: leafNode.returned_units,
                  net_units: leafNode.net_units,
                  gross_sales: leafNode.gross_sales,
                  returned_amount: leafNode.returned_amount,
                  net_revenue: leafNode.net_revenue,
                  contribution_pct: allCategoriesRevenue > 0 ? (leafNode.net_revenue / allCategoriesRevenue) * 100 : 0
                });
              });
            });
          });

          let finalCategories = compiledCategoryRows;
          if (!filters.showZeroSales) {
            finalCategories = finalCategories.filter(c => c.gross_units > 0 || c.returned_units > 0);
          }

          finalCategories.sort((a, b) => b.net_revenue - a.net_revenue);
          setReportRows(finalCategories);

          // ── Compile Hierarchical Tree for Detailed View (Parent -> Sub -> Category -> Invoices) ──
          const compiledHierarchyTree = Object.values(parentCategoryTree).map((parentNode: any) => {
            parentNode.net_units = parentNode.gross_units - parentNode.returned_units;
            parentNode.net_revenue = Math.max(0, parentNode.gross_sales - parentNode.returned_amount);

            const subCategories = Object.values(parentNode.sub_categories_map).map((subNode: any) => {
              subNode.net_units = subNode.gross_units - subNode.returned_units;
              subNode.net_revenue = Math.max(0, subNode.gross_sales - subNode.returned_amount);

              const leafCategories = Object.values(subNode.categories_map).map((leafNode: any) => {
                leafNode.net_units = leafNode.gross_units - leafNode.returned_units;
                leafNode.net_revenue = Math.max(0, leafNode.gross_sales - leafNode.returned_amount);
                leafNode.transactions.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
                return leafNode;
              });

              return {
                ...subNode,
                categories: leafCategories
              };
            });

            return {
              ...parentNode,
              sub_categories: subCategories
            };
          });

          let finalHierarchyTree = compiledHierarchyTree;
          if (!filters.showZeroSales) {
            finalHierarchyTree = finalHierarchyTree
              .map(p => ({
                ...p,
                sub_categories: p.sub_categories
                  .map((s: any) => ({
                    ...s,
                    categories: s.categories.filter((c: any) => (c.transactions || []).length > 0)
                  }))
                  .filter((s: any) => s.categories.length > 0)
              }))
              .filter(p => p.sub_categories.length > 0);
          }

          setCategoryHierarchyTree(finalHierarchyTree);
        }

        // ── 📦 REPORT TYPE: PRODUCT SALES HISTORY REPORT ──
        else if (rType === 'product-sales-history') {
          const [invRes, retRes] = await Promise.all([
            supabase.from('sales_invoices').select('*').order('id', { ascending: true }),
            supabase.from('sales_returns').select('*').order('id', { ascending: true })
          ]);

          if (invRes.error) throw invRes.error;
          if (retRes.error) throw retRes.error;

          const allInvoices = invRes.data || [];
          const allReturns = retRes.data || [];
          const allProducts = prodData || [];

          const startTimestamp = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00').getTime() : 0;
          const endTimestamp = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59.999').getTime() : Infinity;

          // Helper to extract items safely
          const parseItems = (raw: any): any[] => {
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string') {
              try { return JSON.parse(raw); } catch { return []; }
            }
            return [];
          };

          // Filter invoices by criteria
          let filteredInvoices = allInvoices.filter((inv: any) => {
            const d = inv.sale_date || inv.created_at;
            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
            if (t < startTimestamp || t > endTimestamp) return false;

            if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) {
              if (!filters.customer.includes(inv.customer_name)) return false;
            }
            if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) {
              if (!filters.salesman.includes(inv.salesman)) return false;
            }
            if (filters.location && filters.location.length > 0 && !filters.location.includes('All')) {
              if (!filters.location.includes(inv.dispatch_warehouse)) return false;
            }
            return true;
          });

          // Filter returns by criteria
          let filteredReturns = allReturns.filter((ret: any) => {
            const d = ret.return_date || ret.created_at;
            const t = d ? new Date(String(d).includes('T') ? String(d) : String(d) + 'T12:00:00').getTime() : 0;
            if (t < startTimestamp || t > endTimestamp) return false;

            if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) {
              if (!filters.customer.includes(ret.customer_name)) return false;
            }
            return true;
          });

          // Map returns by product
          const productReturnsMap: Record<string, { returnedQty: number; returnedAmount: number }> = {};
          filteredReturns.forEach((ret: any) => {
            const items = parseItems(ret.items || ret.returned_items);
            items.forEach((it: any) => {
              const pName = (it.itemName || it.product_name || '').trim();
              if (!pName) return;
              const key = pName.toLowerCase();
              if (!productReturnsMap[key]) {
                productReturnsMap[key] = { returnedQty: 0, returnedAmount: 0 };
              }
              const q = Number(it.qty || it.quantity || 1);
              const r = Number(it.rate ?? it.price ?? 0);
              productReturnsMap[key].returnedQty += q;
              productReturnsMap[key].returnedAmount += (q * r);
            });
          });

          // Aggregate sales transactions per product (pre-populate with catalog products if showZeroSales is enabled)
          const productSummaryMap: Record<string, any> = {};

          if (filters.showZeroSales === true) {
            allProducts.forEach((p: any) => {
              const pName = (p.product_name || '').trim();
              if (!pName) return;
              const key = pName.toLowerCase();

              if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                if (!filters.product.includes(pName)) return;
              }
              const prodParentCat = p.sub_sub_category || p.parent_category || p.category || '';
              const prodSubCat = p.sub_category || '';
              const prodLeafCat = p.category || '';
              const prodBrand = p.bin || p.brand || '';

              if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                const matchP = filters.parentCategory.includes(prodParentCat) || filters.parentCategory.includes(prodLeafCat);
                if (!matchP) return;
              }
              if (filters.subCategory && filters.subCategory.length > 0 && !filters.subCategory.includes('All')) {
                if (!filters.subCategory.includes(prodSubCat)) return;
              }
              if (filters.subSubCategory && filters.subSubCategory.length > 0 && !filters.subSubCategory.includes('All')) {
                if (!filters.subSubCategory.includes(prodLeafCat)) return;
              }
              if (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All')) {
                if (!filters.bin.includes(prodBrand)) return;
              }

              productSummaryMap[key] = {
                product_name: pName,
                sku: p.item_sr_no || p.sku || '-',
                parentCategory: prodParentCat || '-',
                subCategory: prodSubCat || '-',
                category: prodLeafCat || '-',
                brand: prodBrand || '-',
                uom: p.uom || productUomMap[key] || 'Nos',
                sold_qty: 0,
                gross_sales: 0,
                total_discounts: 0,
                net_sales: 0,
                tx_count: 0,
                last_sale_date: '-',
                transactions: []
              };
            });
          }

          filteredInvoices.forEach((inv: any) => {
            const items = parseItems(inv.items);
            const invDate = inv.sale_date || String(inv.created_at || '').split('T')[0];
            const invNo = inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`;
            const custName = inv.customer_name || 'Counter Retail Buyer';
            const salesman = inv.salesman || 'Direct';
            const warehouse = inv.dispatch_warehouse || 'Main Warehouse';

            items.forEach((it: any) => {
              const pName = (it.itemName || it.product_name || '').trim();
              if (!pName) return;
              const key = pName.toLowerCase();

              // Product criteria filters
              if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                if (!filters.product.includes(pName)) return;
              }

              const matchingProd = allProducts.find(
                (p: any) => (p.product_name || '').trim().toLowerCase() === key ||
                            (it.sku && (p.item_sr_no || '').toLowerCase() === String(it.sku).toLowerCase())
              );

              const prodParentCat = matchingProd?.sub_sub_category || matchingProd?.parent_category || matchingProd?.category || '';
              const prodSubCat = matchingProd?.sub_category || '';
              const prodLeafCat = matchingProd?.category || it.category || '';
              const prodBrand = matchingProd?.bin || matchingProd?.brand || it.brand || '';

              // Category / Brand filters
              if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                const matchP = filters.parentCategory.includes(prodParentCat) || filters.parentCategory.includes(prodLeafCat);
                if (!matchP) return;
              }
              if (filters.subCategory && filters.subCategory.length > 0 && !filters.subCategory.includes('All')) {
                if (!filters.subCategory.includes(prodSubCat)) return;
              }
              if (filters.subSubCategory && filters.subSubCategory.length > 0 && !filters.subSubCategory.includes('All')) {
                if (!filters.subSubCategory.includes(prodLeafCat)) return;
              }
              if (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All')) {
                if (!filters.bin.includes(prodBrand)) return;
              }

              const qty = Number(it.qty || it.quantity || 1);
              const rate = Number(it.rp ?? it.rate ?? it.sale_price ?? it.price ?? matchingProd?.retail_price ?? 0);
              const discount = Number(it.discount || it.disc || 0);
              const lineTotal = Number(it.total || it.amount || (qty * rate) - discount);
              const uom = it.uom || matchingProd?.uom || productUomMap[key] || 'Nos';
              const sku = it.sku || matchingProd?.item_sr_no || matchingProd?.sku || '-';

              if (!productSummaryMap[key]) {
                productSummaryMap[key] = {
                  product_name: pName,
                  sku,
                  parentCategory: prodParentCat || '-',
                  subCategory: prodSubCat || '-',
                  category: prodLeafCat || '-',
                  brand: prodBrand || '-',
                  uom,
                  sold_qty: 0,
                  gross_sales: 0,
                  total_discounts: 0,
                  net_sales: 0,
                  tx_count: 0,
                  last_sale_date: invDate,
                  transactions: []
                };
              }

              productSummaryMap[key].sold_qty += qty;
              productSummaryMap[key].gross_sales += (qty * rate);
              productSummaryMap[key].total_discounts += discount;
              productSummaryMap[key].net_sales += lineTotal;
              productSummaryMap[key].tx_count += 1;
              if (productSummaryMap[key].last_sale_date === '-' || invDate > productSummaryMap[key].last_sale_date) {
                productSummaryMap[key].last_sale_date = invDate;
              }

              productSummaryMap[key].transactions.push({
                date: invDate,
                invoice_no: invNo,
                customer_name: custName,
                salesman,
                warehouse,
                qty,
                uom,
                rate,
                discount,
                total: lineTotal
              });
            });
          });

          // Compile final rows with return deductions and averages
          const compiledRows: any[] = Object.values(productSummaryMap).map((prod: any) => {
            const key = prod.product_name.toLowerCase();
            const returnsInfo = productReturnsMap[key] || { returnedQty: 0, returnedAmount: 0 };
            const netQty = prod.sold_qty - returnsInfo.returnedQty;
            const avgRate = prod.sold_qty > 0 ? (prod.gross_sales / prod.sold_qty) : 0;
            const finalNetSales = Math.max(0, prod.net_sales - returnsInfo.returnedAmount);

            return {
              ...prod,
              returned_qty: returnsInfo.returnedQty,
              returned_amount: returnsInfo.returnedAmount,
              net_qty: netQty,
              avg_rate: avgRate,
              final_net_sales: finalNetSales
            };
          });

          let finalRows = compiledRows;
          if (!filters.showZeroSales) {
            finalRows = finalRows.filter(r => r.sold_qty > 0 || r.returned_qty > 0);
          }

          finalRows.sort((a, b) => {
            if (b.final_net_sales !== a.final_net_sales) {
              return b.final_net_sales - a.final_net_sales;
            }
            return a.product_name.localeCompare(b.product_name);
          });

          setReportRows(finalRows);
        }

        // ── 📊 REPORT TYPE: COMMERCIAL SALES AUDIT LEDGER (SALESMAN-WISE) ──
        else if (rType === 'sale') {
          let invQuery = supabase.from('sales_invoices').select('*');
          if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) invQuery = invQuery.in('customer_name', filters.customer);
          if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) invQuery = invQuery.in('salesman', filters.salesman);
          if (filters.transport && filters.transport.length > 0 && !filters.transport.includes('All')) invQuery = invQuery.in('transport_name', filters.transport);
          if (filters.location && filters.location.length > 0 && !filters.location.includes('All')) invQuery = invQuery.in('dispatch_warehouse', filters.location);

          if (filters.saleType && filters.saleType !== 'All') {
            if (filters.saleType === 'Cash') invQuery = invQuery.eq('payment_term', 'Cash');
            else invQuery = invQuery.neq('payment_term', 'Cash');
          }
          if (filters.saleMethod && filters.saleMethod !== 'All') {
             if (filters.saleMethod === 'Direct') invQuery = invQuery.or('dc_no.is.null,dc_no.eq.""');
             else invQuery = invQuery.neq('dc_no', '');
          }

          let retQuery = supabase.from('sales_returns').select('*');
          if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) retQuery = retQuery.in('customer_name', filters.customer);
          if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) retQuery = retQuery.in('salesman', filters.salesman);
          if (filters.transport && filters.transport.length > 0 && !filters.transport.includes('All')) retQuery = retQuery.in('transport_name', filters.transport);
          if (filters.location && filters.location.length > 0 && !filters.location.includes('All')) retQuery = retQuery.in('dispatch_warehouse', filters.location);

          const [invRes, retRes] = await Promise.all([invQuery, retQuery]);
          if (invRes.error) throw invRes.error;
          if (retRes.error) throw retRes.error;

          let invPool = invRes.data || [];
          let retPool = retRes.data || [];

          if (filters.dateFrom && filters.dateTo) {
            const startStr = String(filters.dateFrom).split('T')[0];
            const endStr = String(filters.dateTo).split('T')[0];
            invPool = invPool.filter(i => {
              const targetDateStr = String(i.sale_date || i.created_at || '').split('T')[0];
              return targetDateStr >= startStr && targetDateStr <= endStr;
            });
            retPool = retPool.filter(r => {
              const targetDateStr = String(r.return_date || r.created_at || '').split('T')[0];
              return targetDateStr >= startStr && targetDateStr <= endStr;
            });
          }

          // Filter by product / brand / category if specified in filters
          if ((filters.product && filters.product.length > 0 && !filters.product.includes('All')) ||
              (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) ||
              (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All'))) {
            const filterItemMatch = (record: any) => {
              const items = extractItemDetails(record);
              return items.some(it => {
                const pName = it.name;
                const matchingProd = (prodData || []).find((p: any) => (p.product_name || '').trim().toLowerCase() === pName.trim().toLowerCase());
                if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                  if (!filters.product.includes(pName)) return false;
                }
                if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                  const prodCat = matchingProd?.category || matchingProd?.parent_category || '';
                  if (!filters.parentCategory.includes(prodCat)) return false;
                }
                if (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All')) {
                  const prodBrand = matchingProd?.brand || '';
                  if (!filters.bin.includes(prodBrand)) return false;
                }
                return true;
              });
            };
            invPool = invPool.filter(filterItemMatch);
            retPool = retPool.filter(filterItemMatch);
          }

          // Group invoices and returns by Salesman / Sales Officer
          const salesmanMap: Record<string, any> = {};

          invPool.forEach((inv: any) => {
            const smName = inv.salesman ? String(inv.salesman).trim() : 'Direct / House Account';
            if (!salesmanMap[smName]) {
              salesmanMap[smName] = {
                salesman_name: smName,
                invoices_count: 0,
                returns_count: 0,
                unique_customers_count: 0,
                customers_set: new Set<string>(),
                cash_sales: 0,
                credit_sales: 0,
                gross_sales: 0,
                return_amount: 0,
                returned_amount: 0,
                net_sales: 0,
                total_sales: 0,
                contribution_pct: 0,
                transactions: [],
                return_transactions: []
              };
            }

            const invTotal = Number(inv.total_amount || 0);
            const isCash = String(inv.payment_term || '').toLowerCase() === 'cash';

            salesmanMap[smName].invoices_count += 1;
            salesmanMap[smName].gross_sales += invTotal;
            if (inv.customer_name) {
              salesmanMap[smName].customers_set.add(String(inv.customer_name).trim());
            }
            if (isCash) {
              salesmanMap[smName].cash_sales += invTotal;
            } else {
              salesmanMap[smName].credit_sales += invTotal;
            }
            salesmanMap[smName].transactions.push({
              ...inv,
              record_type: 'invoice'
            });
          });

          retPool.forEach((ret: any) => {
            let smName = ret.salesman ? String(ret.salesman).trim() : '';
            if (!smName && ret.original_invoice_no) {
              const orig = invPool.find((i: any) => 
                String(i.invoice_no || '').toLowerCase() === String(ret.original_invoice_no).toLowerCase() ||
                String(i.id) === String(ret.original_invoice_no).replace(/\D/g, '')
              );
              if (orig && orig.salesman) smName = String(orig.salesman).trim();
            }
            if (!smName) smName = 'Direct / House Account';

            if (!salesmanMap[smName]) {
              salesmanMap[smName] = {
                salesman_name: smName,
                invoices_count: 0,
                returns_count: 0,
                unique_customers_count: 0,
                customers_set: new Set<string>(),
                cash_sales: 0,
                credit_sales: 0,
                gross_sales: 0,
                return_amount: 0,
                returned_amount: 0,
                net_sales: 0,
                total_sales: 0,
                contribution_pct: 0,
                transactions: [],
                return_transactions: []
              };
            }

            const retTotal = Number(ret.return_amount || ret.total_amount || 0);
            salesmanMap[smName].returns_count += 1;
            salesmanMap[smName].return_amount += retTotal;
            salesmanMap[smName].returned_amount += retTotal;
            if (ret.customer_name) {
              salesmanMap[smName].customers_set.add(String(ret.customer_name).trim());
            }
            salesmanMap[smName].return_transactions.push({
              ...ret,
              record_type: 'return'
            });
          });

          // Compute net sales and contribution percentage per salesman
          let totalAllPoolNetSales = 0;
          Object.values(salesmanMap).forEach((sm: any) => {
            sm.net_sales = sm.gross_sales - sm.return_amount;
            sm.total_sales = sm.net_sales;
            totalAllPoolNetSales += sm.net_sales;
          });

          const salesmanGroups = Object.values(salesmanMap).map((sm: any) => {
            return {
              ...sm,
              salesman: sm.salesman_name,
              unique_customers_count: sm.customers_set.size || (sm.invoices_count > 0 || sm.returns_count > 0 ? 1 : 0),
              contribution_pct: totalAllPoolNetSales > 0 ? (sm.net_sales / totalAllPoolNetSales) * 100 : 0
            };
          });

          // Sort salesmen groups by net_sales descending (leaderboard)
          salesmanGroups.sort((a, b) => b.net_sales - a.net_sales);

          setReportRows(salesmanGroups);
        }

        // ── 📊 REPORT TYPE: SALES FILTER & PARAMETER REGISTER (FLAT CHRONOLOGICAL) ──
        else if (rType === 'sales-query') {
          let query = supabase.from('sales_invoices').select('*');
          if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) query = query.in('customer_name', filters.customer);
          if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) query = query.in('salesman', filters.salesman);
          if (filters.transport && filters.transport.length > 0 && !filters.transport.includes('All')) query = query.in('transport_name', filters.transport);
          if (filters.location && filters.location.length > 0 && !filters.location.includes('All')) query = query.in('dispatch_warehouse', filters.location);

          if (filters.saleType && filters.saleType !== 'All') {
            if (filters.saleType === 'Cash') query = query.eq('payment_term', 'Cash');
            else query = query.neq('payment_term', 'Cash');
          }
          if (filters.saleMethod && filters.saleMethod !== 'All') {
             if (filters.saleMethod === 'Direct') query = query.or('dc_no.is.null,dc_no.eq.""');
             else query = query.neq('dc_no', '');
          }

          const { data: invData, error: invError } = await query;
          if (invError) throw invError;

          const { data: returnsData, error: retError } = await supabase
            .from('sales_returns')
            .select('original_invoice_no');
          if (retError) throw retError;

          const returnedNosList = (returnsData || []).map(r =>
            String(r.original_invoice_no || '').trim().toLowerCase()
          );

          let pool = invData || [];

          pool = pool.filter(i => {
            const rawId = String(i.id).trim().toLowerCase();
            const isReturnedItem = returnedNosList.some(retRef =>
              retRef === rawId ||
              retRef === `inv-${rawId}` ||
              retRef === `inv-${rawId.padStart(4, '0')}` ||
              retRef.includes(rawId)
            );
            return !isReturnedItem;
          });

          if (filters.dateFrom && filters.dateTo) {
            const startStr = String(filters.dateFrom).split('T')[0];
            const endStr = String(filters.dateTo).split('T')[0];
            pool = pool.filter(i => {
              const targetDateStr = String(i.sale_date || i.created_at || '').split('T')[0];
              return targetDateStr >= startStr && targetDateStr <= endStr;
            });
          }

          // Filter by product / brand / category if specified in filters
          if ((filters.product && filters.product.length > 0 && !filters.product.includes('All')) ||
              (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) ||
              (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All'))) {
            pool = pool.filter((inv: any) => {
              const items = extractItemDetails(inv);
              return items.some(it => {
                const pName = it.name;
                const matchingProd = (prodData || []).find((p: any) => (p.product_name || '').trim().toLowerCase() === pName.trim().toLowerCase());
                if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                  if (!filters.product.includes(pName)) return false;
                }
                if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                  const prodCat = matchingProd?.category || matchingProd?.parent_category || '';
                  if (!filters.parentCategory.includes(prodCat)) return false;
                }
                if (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All')) {
                  const prodBrand = matchingProd?.brand || '';
                  if (!filters.bin.includes(prodBrand)) return false;
                }
                return true;
              });
            });
          }

          // Sort flat invoices
          if (filters.sortBy) {
            if (filters.sortBy === 'date_asc') {
              pool.sort((a, b) => (a.sale_date || a.created_at || '').localeCompare(b.sale_date || b.created_at || ''));
            } else if (filters.sortBy === 'amount_desc') {
              pool.sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0));
            } else if (filters.sortBy === 'amount_asc') {
              pool.sort((a, b) => Number(a.total_amount || 0) - Number(b.total_amount || 0));
            } else if (filters.sortBy === 'invoice_asc') {
              pool.sort((a, b) => String(a.invoice_no || a.id).localeCompare(String(b.invoice_no || b.id)));
            } else {
              pool.sort((a, b) => (b.sale_date || b.created_at || '').localeCompare(a.sale_date || a.created_at || ''));
            }
          }

          setReportRows(pool);
        }

        // ── 📊 REPORT TYPE: CUSTOMER SALES & VOLUME ANALYSIS ──
        else if (rType === 'customer-sales') {
          let invQuery = supabase.from('sales_invoices').select('*');
          if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) invQuery = invQuery.in('customer_name', filters.customer);
          if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) invQuery = invQuery.in('salesman', filters.salesman);
          if (filters.transport && filters.transport.length > 0 && !filters.transport.includes('All')) invQuery = invQuery.in('transport_name', filters.transport);
          if (filters.location && filters.location.length > 0 && !filters.location.includes('All')) invQuery = invQuery.in('dispatch_warehouse', filters.location);

          if (filters.saleType && filters.saleType !== 'All') {
            if (filters.saleType === 'Cash') invQuery = invQuery.eq('payment_term', 'Cash');
            else invQuery = invQuery.neq('payment_term', 'Cash');
          }
          if (filters.saleMethod && filters.saleMethod !== 'All') {
            if (filters.saleMethod === 'Direct') invQuery = invQuery.or('dc_no.is.null,dc_no.eq.""');
            else invQuery = invQuery.neq('dc_no', '');
          }

          let retQuery = supabase.from('sales_returns').select('*');
          if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) retQuery = retQuery.in('customer_name', filters.customer);
          if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) retQuery = retQuery.in('salesman', filters.salesman);
          if (filters.transport && filters.transport.length > 0 && !filters.transport.includes('All')) retQuery = retQuery.in('transport_name', filters.transport);
          if (filters.location && filters.location.length > 0 && !filters.location.includes('All')) retQuery = retQuery.in('dispatch_warehouse', filters.location);

          const [invRes, retRes] = await Promise.all([invQuery, retQuery]);
          if (invRes.error) throw invRes.error;
          if (retRes.error) throw retRes.error;

          let invPool = invRes.data || [];
          let retPool = retRes.data || [];

          if (filters.dateFrom && filters.dateTo) {
            const startStr = String(filters.dateFrom).split('T')[0];
            const endStr = String(filters.dateTo).split('T')[0];
            invPool = invPool.filter(i => {
              const targetDateStr = String(i.sale_date || i.created_at || '').split('T')[0];
              return targetDateStr >= startStr && targetDateStr <= endStr;
            });
            retPool = retPool.filter(r => {
              const targetDateStr = String(r.return_date || r.created_at || '').split('T')[0];
              return targetDateStr >= startStr && targetDateStr <= endStr;
            });
          }

          // Filter by product / brand / category if specified in filters
          if ((filters.product && filters.product.length > 0 && !filters.product.includes('All')) ||
              (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) ||
              (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All'))) {
            const filterItemMatch = (record: any) => {
              const items = extractItemDetails(record);
              return items.some(it => {
                const pName = it.name;
                const matchingProd = (prodData || []).find((p: any) => (p.product_name || '').trim().toLowerCase() === pName.trim().toLowerCase());
                if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                  if (!filters.product.includes(pName)) return false;
                }
                if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                  const prodCat = matchingProd?.category || matchingProd?.parent_category || '';
                  if (!filters.parentCategory.includes(prodCat)) return false;
                }
                if (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All')) {
                  const prodBrand = matchingProd?.brand || '';
                  if (!filters.bin.includes(prodBrand)) return false;
                }
                return true;
              });
            };
            invPool = invPool.filter(filterItemMatch);
            retPool = retPool.filter(filterItemMatch);
          }

          const customerMap: Record<string, any> = {};

          invPool.forEach((inv: any) => {
            const cName = (inv.customer_name && String(inv.customer_name).trim()) ? String(inv.customer_name).trim() : 'Counter Retail Buyer';
            if (!customerMap[cName]) {
              customerMap[cName] = {
                customer_name: cName,
                invoices_count: 0,
                returns_count: 0,
                gross_units: 0,
                returned_units: 0,
                net_units: 0,
                gross_sales: 0,
                cash_sales: 0,
                credit_sales: 0,
                return_amount: 0,
                net_sales: 0,
                total_sales: 0,
                total_units: 0,
                contribution_pct: 0,
                transactions: [],
                return_transactions: []
              };
            }

            const invTotal = Number(inv.total_amount || 0);
            const isCash = String(inv.payment_term || '').toLowerCase() === 'cash';
            const invItems = extractItemDetails(inv);
            const invUnits = invItems.reduce((sum, it) => sum + Number(it.qty || 0), 0);

            customerMap[cName].invoices_count += 1;
            customerMap[cName].gross_units += invUnits;
            customerMap[cName].gross_sales += invTotal;
            if (isCash) {
              customerMap[cName].cash_sales += invTotal;
            } else {
              customerMap[cName].credit_sales += invTotal;
            }
            customerMap[cName].transactions.push({
              ...inv,
              record_type: 'invoice',
              calculated_units: invUnits,
              items_details: invItems
            });
          });

          retPool.forEach((ret: any) => {
            const cName = (ret.customer_name && String(ret.customer_name).trim()) ? String(ret.customer_name).trim() : 'Counter Retail Buyer';
            if (!customerMap[cName]) {
              customerMap[cName] = {
                customer_name: cName,
                invoices_count: 0,
                returns_count: 0,
                gross_units: 0,
                returned_units: 0,
                net_units: 0,
                gross_sales: 0,
                cash_sales: 0,
                credit_sales: 0,
                return_amount: 0,
                net_sales: 0,
                total_sales: 0,
                total_units: 0,
                contribution_pct: 0,
                transactions: [],
                return_transactions: []
              };
            }

            const retTotal = Number(ret.return_amount || ret.total_amount || 0);
            const retItems = extractItemDetails(ret);
            const retUnits = retItems.reduce((sum, it) => sum + Number(it.qty || 0), 0);

            customerMap[cName].returns_count += 1;
            customerMap[cName].returned_units += retUnits;
            customerMap[cName].return_amount += retTotal;
            customerMap[cName].return_transactions.push({
              ...ret,
              record_type: 'return',
              calculated_units: retUnits,
              items_details: retItems
            });
          });

          // Finalize net calculations
          let totalAllPoolNetSales = 0;
          Object.values(customerMap).forEach((cust: any) => {
            cust.net_units = cust.gross_units - cust.returned_units;
            cust.net_sales = cust.gross_sales - cust.return_amount;
            cust.total_sales = cust.net_sales;
            cust.total_units = cust.net_units;
            totalAllPoolNetSales += cust.net_sales;
          });

          const customerGroups = Object.values(customerMap).map((cust: any) => {
            return {
              ...cust,
              contribution_pct: totalAllPoolNetSales > 0 ? (cust.net_sales / totalAllPoolNetSales) * 100 : 0
            };
          });

          // Sort customer groups by net_sales descending (leaderboard)
          customerGroups.sort((a, b) => b.net_sales - a.net_sales);

          setReportRows(customerGroups);
        }

        // ── 📊 REPORT TYPE: SALES RETURN & CREDIT LEDGER (CUSTOMER-WISE) ──
        else if (rType === 'return') {
          let query = supabase.from('sales_returns').select('*');
          if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) query = query.in('customer_name', filters.customer);
          if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) query = query.in('salesman', filters.salesman);
          if (filters.transport && filters.transport.length > 0 && !filters.transport.includes('All')) query = query.in('transport_name', filters.transport);
          if (filters.location && filters.location.length > 0 && !filters.location.includes('All')) query = query.in('dispatch_warehouse', filters.location);

          const { data, error } = await query;
          if (error) throw error;

          let pool = data || [];
          if (filters.dateFrom && filters.dateTo) {
            const startStr = String(filters.dateFrom).split('T')[0];
            const endStr = String(filters.dateTo).split('T')[0];
            pool = pool.filter(r => {
              const targetDateStr = String(r.return_date || r.created_at || '').split('T')[0];
              return targetDateStr >= startStr && targetDateStr <= endStr;
            });
          }

          // Filter by product / brand / category if specified in filters
          if ((filters.product && filters.product.length > 0 && !filters.product.includes('All')) ||
              (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) ||
              (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All'))) {
            pool = pool.filter((ret: any) => {
              const items = extractItemDetails(ret);
              return items.some(it => {
                const pName = it.name;
                const matchingProd = (prodData || []).find((p: any) => (p.product_name || '').trim().toLowerCase() === pName.trim().toLowerCase());
                if (filters.product && filters.product.length > 0 && !filters.product.includes('All')) {
                  if (!filters.product.includes(pName)) return false;
                }
                if (filters.parentCategory && filters.parentCategory.length > 0 && !filters.parentCategory.includes('All')) {
                  const prodCat = matchingProd?.category || matchingProd?.parent_category || '';
                  if (!filters.parentCategory.includes(prodCat)) return false;
                }
                if (filters.bin && filters.bin.length > 0 && !filters.bin.includes('All')) {
                  const prodBrand = matchingProd?.brand || '';
                  if (!filters.bin.includes(prodBrand)) return false;
                }
                return true;
              });
            });
          }

          // Sort individual return records
          if (filters.sortBy) {
            if (filters.sortBy === 'date_asc') {
              pool.sort((a, b) => (a.return_date || a.created_at || '').localeCompare(b.return_date || b.created_at || ''));
            } else if (filters.sortBy === 'amount_desc') {
              pool.sort((a, b) => Number(b.return_amount || b.total_amount || 0) - Number(a.return_amount || a.total_amount || 0));
            } else if (filters.sortBy === 'amount_asc') {
              pool.sort((a, b) => Number(a.return_amount || a.total_amount || 0) - Number(b.return_amount || b.total_amount || 0));
            } else if (filters.sortBy === 'invoice_asc') {
              pool.sort((a, b) => String(a.return_no || a.id).localeCompare(String(b.return_no || b.id)));
            } else {
              pool.sort((a, b) => (b.return_date || b.created_at || '').localeCompare(a.return_date || a.created_at || ''));
            }
          }

          const totalAllReturnAmount = pool.reduce((acc, r) => acc + Number(r.return_amount || r.total_amount || 0), 0);
          const customerMap: Record<string, any> = {};

          pool.forEach((ret: any) => {
            const cName = (ret.customer_name && String(ret.customer_name).trim()) ? String(ret.customer_name).trim() : 'Counter Retail Buyer';
            if (!customerMap[cName]) {
              customerMap[cName] = {
                customer_name: cName,
                returns_count: 0,
                total_returned_qty: 0,
                total_return_amount: 0,
                contribution_pct: 0,
                transactions: []
              };
            }

            const retItems = extractItemDetails(ret);
            const retQty = retItems.reduce((sum, it) => sum + Number(it.qty || 0), 0);
            const retAmount = Number(ret.return_amount || ret.total_amount || 0);

            customerMap[cName].returns_count += 1;
            customerMap[cName].total_returned_qty += retQty;
            customerMap[cName].total_return_amount += retAmount;
            customerMap[cName].transactions.push({
              ...ret,
              calculated_qty: retQty,
              calculated_amount: retAmount
            });
          });

          const customerGroups = Object.values(customerMap).map((cust: any) => ({
            ...cust,
            contribution_pct: totalAllReturnAmount > 0 ? (cust.total_return_amount / totalAllReturnAmount) * 100 : 0
          }));

          // Sort customer groups by total_return_amount descending (leaderboard)
          customerGroups.sort((a, b) => b.total_return_amount - a.total_return_amount);

          setReportRows(customerGroups);
        }

        // ── 📊 REPORT TYPE: SALES INVOICE DETAIL REPORT ──
        else if (rType === 'invoice') {
          let query = supabase.from('sales_invoices').select('*');
          const targetInv = filters.invoiceNo || filters.invoice;
          if (targetInv && targetInv !== 'All') {
            query = query.or(`id.eq.${targetInv},invoice_no.eq.${targetInv}`);
          }
          if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) query = query.in('customer_name', filters.customer);
          if (filters.location && filters.location.length > 0 && !filters.location.includes('All')) query = query.in('dispatch_warehouse', filters.location);
          if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) query = query.in('salesman', filters.salesman);

          const { data, error } = await query;
          if (error) throw error;

          let pool = data || [];
          if (filters.dateFrom && filters.dateTo) {
            const startStr = String(filters.dateFrom).split('T')[0];
            const endStr = String(filters.dateTo).split('T')[0];
            pool = pool.filter(i => {
              const targetDateStr = String(i.sale_date || i.created_at || '').split('T')[0];
              return targetDateStr >= startStr && targetDateStr <= endStr;
            });
          }

          if (filters.sortBy) {
            if (filters.sortBy === 'date_asc') {
              pool.sort((a, b) => (a.sale_date || a.created_at || '').localeCompare(b.sale_date || b.created_at || ''));
            } else if (filters.sortBy === 'amount_desc') {
              pool.sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0));
            } else if (filters.sortBy === 'amount_asc') {
              pool.sort((a, b) => Number(a.total_amount || 0) - Number(b.total_amount || 0));
            } else if (filters.sortBy === 'invoice_asc') {
              pool.sort((a, b) => String(a.invoice_no || a.id).localeCompare(String(b.invoice_no || b.id)));
            } else {
              pool.sort((a, b) => (b.sale_date || b.created_at || '').localeCompare(a.sale_date || a.created_at || ''));
            }
          }

          setReportRows(pool);
        }

        // ── 📊 REPORT TYPE: CUSTOMER FINANCIAL STATEMENT & INVOICING LEDGER ──
        else if (rType === 'loyalty') {
          let query = supabase.from('sales_invoices').select('*').order('created_at', { ascending: true });
          if (filters.customer && filters.customer.length > 0 && !filters.customer.includes('All')) query = query.in('customer_name', filters.customer);
          if (filters.salesman && filters.salesman.length > 0 && !filters.salesman.includes('All')) query = query.in('salesman', filters.salesman);

          const { data: invData, error: invError } = await query;
          if (invError) throw invError;

          let filteredInvs = invData || [];
          if (filters.dateFrom && filters.dateTo) {
            const startStr = String(filters.dateFrom).split('T')[0];
            const endStr = String(filters.dateTo).split('T')[0];
            filteredInvs = filteredInvs.filter(i => {
              const targetDateStr = String(i.sale_date || i.created_at || '').split('T')[0];
              return targetDateStr >= startStr && targetDateStr <= endStr;
            });
          }

          // Group by customer_name
          const customerMap: Record<string, any> = {};

          filteredInvs.forEach((inv: any) => {
            const cName = inv.customer_name || 'Walking Customer';
            if (!customerMap[cName]) {
              customerMap[cName] = {
                customer_name: cName,
                transactions: [],
                total_billed: 0,
                total_paid: 0,
                net_balance: 0,
                total_sales_amount: 0,
                invoices_count: 0
              };
            }

            const billed = Number(inv.net_amount || inv.total_amount || 0);
            const paid = inv.amount_paid !== undefined && inv.amount_paid !== null 
              ? Number(inv.amount_paid) 
              : (inv.receipt_status === 'Paid' || inv.sale_status === 'Completed' ? billed : 0);
            const currentRunning = customerMap[cName].net_balance + (billed - paid);

            customerMap[cName].total_billed += billed;
            customerMap[cName].total_paid += paid;
            customerMap[cName].net_balance = currentRunning;
            customerMap[cName].total_sales_amount += billed;
            customerMap[cName].invoices_count += 1;

            customerMap[cName].transactions.push({
              id: `inv-${inv.id}`,
              date: inv.sale_date || String(inv.created_at || '').split('T')[0],
              invoice_no: inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`,
              salesman: inv.salesman || 'Direct',
              narration: `Sales Invoice #${inv.invoice_no || `INV-${String(inv.id).padStart(4, '0')}`}${inv.sale_status ? ` (${inv.sale_status})` : ''}`,
              billed_amount: billed,
              paid_amount: paid,
              balance: currentRunning,
              status: inv.receipt_status || (billed === paid ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid')
            });
          });

          const customerGroups = Object.values(customerMap).sort((a, b) => a.customer_name.localeCompare(b.customer_name));

          setReportRows(customerGroups);
        }
      } catch (err: any) {
        toast.error('Audit compilation trace failed: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    compileExcelStructuredDataset();
  }, [rType, JSON.stringify(filters)]);

  const [exporting, setExporting] = useState(false);

  // Helper function to extract line item names
  const extractItemNames = (row: any): string[] => {
    let itemsList: any[] = [];
    if (Array.isArray(row.items)) {
      itemsList = row.items;
    } else if (typeof row.items === 'string') {
      try {
        itemsList = JSON.parse(row.items);
      } catch {
        itemsList = [];
      }
    }
    return itemsList
      .map((it: any) => it.itemName || it.pDescription || it.product_name || it.name || '')
      .filter(Boolean);
  };

  // Helper function to extract line item details
  const extractItemDetails = (row: any): Array<{ name: string; qty: number | string; uom: string; price: number | string }> => {
    let itemsList: any[] = [];
    if (Array.isArray(row.items)) {
      itemsList = row.items;
    } else if (typeof row.items === 'string') {
      try {
        itemsList = JSON.parse(row.items);
      } catch {
        itemsList = [];
      }
    }
    return itemsList.map((it: any) => {
      const name = it.itemName || it.pDescription || it.product_name || it.name || 'Product';
      const cleanKey = String(name).trim().toLowerCase();
      const uom = it.uom || it.unit || productUomMap[cleanKey] || 'Nos';
      return {
        name,
        qty: it.qty ?? it.quantity ?? it.orderQty ?? 1,
        uom,
        price: it.rp ?? it.rate ?? it.price ?? 0
      };
    }).filter(it => it.name);
  };

  // ── 📥 EXCEL WORKBOOK EXPORT ──
  const handleExportExcel = async () => {
    try {
      if (!reportRows || reportRows.length === 0) {
        toast.error('No report data available to export');
        return;
      }
      setExporting(true);

      const filterMeta = {
        'Report Type': rType === 'category-sales' ? 'Category-Wise Sales & Volume Report' : rType === 'product-sales-history' ? 'Product Sales History Report' : rType === 'sales-query' ? 'Sales Parameter Transaction Register' : rType === 'customer-sales' ? 'Customer Sales & Volume Analysis' : rType === 'return' ? 'Sales Return & Credit Ledger' : String(rType).toUpperCase(),
        'Presentation Mode': (rType === 'category-sales' || rType === 'product-sales-history' || rType === 'sale' || rType === 'customer-sales' || rType === 'return') ? (activeViewMode === 'summary' ? 'Summary View' : 'Detailed View') : 'Standard',
        'Customer': filters.customer?.length > 0 ? filters.customer.join(', ') : 'All',
        'Salesman': filters.salesman?.length > 0 ? filters.salesman.join(', ') : 'All',
        'Warehouse': filters.location?.length > 0 ? filters.location.join(', ') : 'All',
        'Date Window': filters.dateFrom || filters.dateTo ? `${filters.dateFrom || 'Start'} to ${filters.dateTo || 'End'}` : 'All Time'
      };

      let columns: ExcelColumn[] = [];
      let exportData: any[] = [];

      if (rType === 'category-sales') {
        if (activeViewMode === 'summary') {
          columns = [
            { header: 'Parent Category', key: 'parent_category', width: 22 },
            { header: 'Sub Category', key: 'sub_category', width: 22 },
            { header: 'Category', key: 'category_name', width: 24 },
            { header: 'Product Name', key: 'product_name', width: 32 },
            { header: 'SKU / Code', key: 'sku', width: 16 },
            { header: 'UOM', key: 'uom', width: 10, alignment: { horizontal: 'center' } },
            { header: 'Gross Sold Qty', key: 'sold_qty', width: 14, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Returned Qty', key: 'returned_qty', width: 14, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Net Realized Qty', key: 'net_qty', width: 14, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Gross Sales (PKR)', key: 'gross_sales', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Returns Credited (PKR)', key: 'returned_amount', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Net Revenue (PKR)', key: 'final_net_sales', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: '% Category Share', key: 'share_of_category', width: 16, numFmt: '0.0%', alignment: { horizontal: 'right' } }
          ];

          exportData = [];
          reportRows.forEach((cat: any) => {
            (cat.products || []).forEach((p: any) => {
              exportData.push({
                parent_category: cat.parent_name,
                sub_category: cat.sub_name,
                category_name: cat.category_name,
                product_name: p.product_name,
                sku: p.sku || '-',
                uom: p.uom,
                sold_qty: p.sold_qty,
                returned_qty: p.returned_qty,
                net_qty: p.net_qty,
                gross_sales: p.gross_sales,
                returned_amount: p.returned_amount,
                final_net_sales: p.final_net_sales,
                share_of_category: (p.share_of_category || 0) / 100
              });
            });
          });
        } else {
          columns = [
            { header: 'S#', key: 'sno', width: 6, alignment: { horizontal: 'center' } },
            { header: 'Processing Date', key: 'date', width: 14, alignment: { horizontal: 'center' } },
            { header: 'Doc / Ref #', key: 'doc_no', width: 18 },
            { header: 'Doc Type', key: 'doc_type', width: 14, alignment: { horizontal: 'center' } },
            { header: 'Customer Name', key: 'customer_name', width: 26 },
            { header: 'Sales Officer', key: 'salesman', width: 18 },
            { header: 'Product Item', key: 'product_name', width: 30 },
            { header: 'Qty', key: 'qty', width: 12, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'UOM', key: 'uom', width: 8, alignment: { horizontal: 'center' } },
            { header: 'Unit Rate (PKR)', key: 'rate', width: 16, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Freight (PKR)', key: 'freight_charges', width: 16, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Net Amount (PKR)', key: 'total_amount', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } }
          ];

          exportData = [];
          reportRows.forEach((cat: any, cIdx: number) => {
            const bannerText = `🏢 PARENT: ${cat.parent_name || 'General'}  |  📂 SUB: ${cat.sub_name || '-'}  |  🏷️ CATEGORY: ${cat.category_name}  |  Sold: ${Number(cat.gross_units || 0).toLocaleString()}  |  Ret: ${Number(cat.returned_units || 0).toLocaleString()}  |  Net: ${Number(cat.net_units || 0).toLocaleString()} Units  |  Net Revenue: Rs. ${Number(cat.net_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            
            exportData.push({
              _isHeader: true,
              _bannerText: bannerText
            });

            const txList = cat.transactions || [];
            if (txList.length === 0) {
              exportData.push({
                sno: '-',
                date: '-',
                doc_no: '-',
                doc_type: '-',
                customer_name: 'No Transactions',
                salesman: '-',
                product_name: '-',
                qty: 0,
                uom: '-',
                rate: 0,
                freight_charges: 0,
                total_amount: 0
              });
            } else {
              txList.forEach((tx: any, tIdx: number) => {
                const isRet = tx.record_type === 'return';
                exportData.push({
                  sno: tIdx + 1,
                  date: tx.date,
                  doc_no: tx.doc_no,
                  doc_type: isRet ? 'Sales Return' : 'Sales Invoice',
                  customer_name: tx.customer_name,
                  salesman: tx.salesman,
                  product_name: tx.product_name,
                  qty: tx.qty,
                  uom: tx.uom,
                  rate: tx.rate,
                  freight_charges: tx.freight_charges || 0,
                  total_amount: isRet ? -Number(tx.total_amount || 0) : Number(tx.total_amount || 0)
                });
              });
            }

            exportData.push({
              _isSubtotal: true,
              sno: '',
              date: '',
              doc_no: '',
              doc_type: '',
              customer_name: `Subtotal (${cat.category_name} : ${txList.length} Records):`,
              salesman: '',
              product_name: `Net Vol: ${Number(cat.net_units || 0).toLocaleString()} Units`,
              qty: Number(cat.gross_units || 0),
              uom: '',
              rate: 0,
              freight_charges: 0,
              total_amount: Number(cat.net_revenue || 0)
            });
          });
        }
      } else if (rType === 'product-sales-history') {
        if (activeViewMode === 'summary') {
          columns = [
            { header: 'S#', key: 'sno', width: 8, alignment: 'center' },
            { header: 'Product / Item Name', key: 'product_name', width: 32 },
            { header: 'SKU / Code', key: 'sku', width: 16 },
            { header: 'Brand', key: 'brand', width: 16 },
            { header: 'Parent Category', key: 'parentCategory', width: 18 },
            { header: 'Sub Category', key: 'subCategory', width: 18 },
            { header: 'Leaf Category', key: 'category', width: 18 },
            { header: 'UOM', key: 'uom', width: 10, alignment: 'center' },
            { header: 'Sold Qty', key: 'sold_qty', width: 14, type: 'number', alignment: 'right' },
            { header: 'Returned Qty', key: 'returned_qty', width: 14, type: 'number', alignment: 'right' },
            { header: 'Net Sold Qty', key: 'net_qty', width: 14, type: 'number', alignment: 'right' },
            { header: 'Avg. Rate (PKR)', key: 'avg_rate', width: 18, type: 'currency', alignment: 'right' },
            { header: 'Net Sales Revenue (PKR)', key: 'final_net_sales', width: 24, type: 'currency', alignment: 'right' },
            { header: 'Last Sale Date', key: 'last_sale_date', width: 16, alignment: 'center' }
          ];

          exportData = reportRows.map((r, i) => ({
            sno: i + 1,
            product_name: r.product_name,
            sku: r.sku || '-',
            brand: r.brand || '-',
            parentCategory: r.parentCategory || '-',
            subCategory: r.subCategory || '-',
            category: r.category || '-',
            uom: r.uom,
            sold_qty: Number(r.sold_qty || 0),
            returned_qty: Number(r.returned_qty || 0),
            net_qty: Number(r.net_qty || 0),
            avg_rate: Number(Number(r.avg_rate || 0).toFixed(2)),
            final_net_sales: Number(Number(r.final_net_sales || 0).toFixed(2)),
            last_sale_date: r.last_sale_date || '-'
          }));
        } else {
          columns = [
            { header: 'S#', key: 'sno', width: 6, alignment: { horizontal: 'center' } },
            { header: 'Processing Date', key: 'date', width: 14, alignment: { horizontal: 'center' } },
            { header: 'Invoice #', key: 'invoice_no', width: 16 },
            { header: 'Customer Name', key: 'customer_name', width: 26 },
            { header: 'Salesman', key: 'salesman', width: 18 },
            { header: 'Warehouse', key: 'warehouse', width: 18 },
            { header: 'Qty Sold', key: 'qty', width: 12, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'UOM', key: 'uom', width: 8, alignment: { horizontal: 'center' } },
            { header: 'Unit Rate (PKR)', key: 'rate', width: 16, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Discount (PKR)', key: 'discount', width: 16, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Net Amount (PKR)', key: 'total', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } }
          ];

          exportData = [];
          reportRows.forEach((prod: any) => {
            const bannerText = `📦 ${prod.product_name.toUpperCase()}  |  SKU: ${prod.sku || '-'}  |  Category: ${prod.category || 'General'}  |  Sold: ${Number(prod.sold_qty || 0).toLocaleString()} ${prod.uom || ''}  |  Ret: ${Number(prod.returned_qty || 0).toLocaleString()}  |  Net Sold: ${Number(prod.net_qty || 0).toLocaleString()}  |  Avg Rate: Rs. ${Number(prod.avg_rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Net Revenue: Rs. ${Number(prod.final_net_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

            exportData.push({
              _isHeader: true,
              _bannerText: bannerText
            });

            const txList = prod.transactions || [];
            if (txList.length === 0) {
              exportData.push({
                sno: '-',
                date: '-',
                invoice_no: '-',
                customer_name: 'No Transactions',
                salesman: '-',
                warehouse: '-',
                qty: 0,
                uom: '-',
                rate: 0,
                discount: 0,
                total: 0
              });
            } else {
              txList.forEach((tx: any, tIdx: number) => {
                exportData.push({
                  sno: tIdx + 1,
                  date: tx.date,
                  invoice_no: tx.invoice_no,
                  customer_name: tx.customer_name,
                  salesman: tx.salesman,
                  warehouse: tx.warehouse,
                  qty: tx.qty,
                  uom: tx.uom,
                  rate: tx.rate,
                  discount: tx.discount,
                  total: tx.total
                });
              });
            }

            exportData.push({
              _isSubtotal: true,
              sno: '',
              date: '',
              invoice_no: '',
              customer_name: `Subtotal (${prod.product_name}):`,
              salesman: '',
              warehouse: '',
              qty: Number(prod.net_qty || 0),
              uom: prod.uom,
              rate: 0,
              discount: 0,
              total: Number(prod.final_net_sales || 0)
            });
          });
        }
      } else if (rType === 'sales-query') {
        columns = [
          { header: 'S#', key: 'sno', width: 8, alignment: { horizontal: 'center' } },
          { header: 'Processing Date', key: 'processingDate', width: 16, alignment: { horizontal: 'center' } },
          { header: 'Invoice #', key: 'docRef', width: 18 },
          { header: 'Customer Name', key: 'customerName', width: 28 },
          { header: 'Sales Officer', key: 'salesman', width: 20 },
          { header: 'Carrier Fleet', key: 'transport', width: 18 },
          { header: 'Product Line Items', key: 'products', width: 45 },
          { header: 'Warehouse', key: 'warehouse', width: 18 },
          { header: 'Payment Term', key: 'paymentTerm', width: 16, alignment: { horizontal: 'center' } },
          { header: 'Gross Matrix Amount (PKR)', key: 'totalAmount', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } }
        ];

        exportData = reportRows.map((row, i) => {
          const itemDetails = extractItemDetails(row);
          const productsFormatted = itemDetails.length > 0
            ? itemDetails.map(it => `${it.name} (${it.qty} ${it.uom} @ Rs. ${Number(it.price).toLocaleString()})`).join(' | ')
            : extractItemNames(row).join(' | ');
          return {
            sno: i + 1,
            processingDate: row.sale_date || String(row.created_at || '').split('T')[0],
            docRef: row.invoice_no || `INV-${String(row.id).padStart(4, '0')}`,
            customerName: row.customer_name || 'Counter Retail Buyer',
            salesman: row.salesman || 'Direct',
            transport: row.transport_name || 'Self Pick',
            products: productsFormatted,
            warehouse: row.dispatch_warehouse || 'Main Warehouse',
            paymentTerm: row.payment_term || 'Credit',
            totalAmount: Number(row.total_amount || 0)
          };
        });
      } else if (rType === 'customer-sales') {
        if (activeViewMode === 'summary') {
          columns = [
            { header: 'S#', key: 'sno', width: 8, alignment: { horizontal: 'center' } },
            { header: 'Customer / Client Name', key: 'customer_name', width: 28 },
            { header: 'Invoices Booked', key: 'invoices_count', width: 16, numFmt: '#,##0', alignment: { horizontal: 'right' } },
            { header: 'Returns Booked', key: 'returns_count', width: 16, numFmt: '#,##0', alignment: { horizontal: 'right' } },
            { header: 'Gross Volume', key: 'gross_units', width: 16, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Returned Volume', key: 'returned_units', width: 16, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Net Volume', key: 'net_units', width: 16, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Gross Sales (PKR)', key: 'gross_sales', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Returns Credited (PKR)', key: 'return_amount', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Net Realized Revenue (PKR)', key: 'net_sales', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Contribution (%)', key: 'contribution_pct', width: 16, numFmt: '0.00"%"', alignment: { horizontal: 'right' } }
          ];

          exportData = reportRows.map((cust, i) => ({
            sno: i + 1,
            customer_name: cust.customer_name,
            invoices_count: cust.invoices_count,
            returns_count: cust.returns_count,
            gross_units: cust.gross_units,
            returned_units: cust.returned_units,
            net_units: cust.net_units,
            gross_sales: cust.gross_sales,
            return_amount: cust.return_amount,
            net_sales: cust.net_sales,
            contribution_pct: cust.contribution_pct
          }));
        } else {
          columns = [
            { header: 'S#', key: 'sno', width: 6, alignment: { horizontal: 'center' } },
            { header: 'Date', key: 'processingDate', width: 14, alignment: { horizontal: 'center' } },
            { header: 'Doc / Ref #', key: 'docRef', width: 18 },
            { header: 'Sales Officer', key: 'salesman', width: 20 },
            { header: 'Product Line Items', key: 'products', width: 45 },
            { header: 'Doc Type / Term', key: 'paymentTerm', width: 18, alignment: { horizontal: 'center' } },
            { header: 'Freight Charges (PKR)', key: 'freightCharges', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Amount (PKR)', key: 'totalAmount', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } }
          ];

          exportData = [];
          reportRows.forEach((cust: any) => {
            const custGross = Number(cust.gross_sales || 0);
            const custReturn = Number(cust.return_amount || 0);
            const custNet = Number(cust.net_sales || custGross - custReturn);
            const custNetUnits = Number(cust.net_units || (cust.gross_units || 0) - (cust.returned_units || 0));

            const bannerText = `👤 ${cust.customer_name.toUpperCase()}  |  Invoices: ${cust.invoices_count}  |  Returns: ${cust.returns_count}  |  Net Volume: ${custNetUnits.toLocaleString()} Units  |  Gross: Rs. ${custGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Returns: -Rs. ${custReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Net Revenue: Rs. ${custNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

            exportData.push({
              _isHeader: true,
              _bannerText: bannerText
            });

            const combinedTx = [
              ...(cust.transactions || []),
              ...(cust.return_transactions || [])
            ].sort((a: any, b: any) => {
              const dateA = a.sale_date || a.return_date || a.created_at || '';
              const dateB = b.sale_date || b.return_date || b.created_at || '';
              return dateA.localeCompare(dateB);
            });

            if (combinedTx.length === 0) {
              exportData.push({
                sno: '-',
                processingDate: '-',
                docRef: '-',
                salesman: '-',
                products: 'No Transactions',
                paymentTerm: '-',
                freightCharges: 0,
                totalAmount: 0
              });
            } else {
              combinedTx.forEach((row: any, tIdx: number) => {
                const isReturn = row.record_type === 'return';
                const itemDetails = extractItemDetails(row);
                const productsFormatted = itemDetails.length > 0
                  ? itemDetails.map(it => `${it.name} (${it.qty} ${it.uom} @ Rs. ${Number(it.price).toLocaleString()})`).join(' | ')
                  : extractItemNames(row).join(' | ');
                const rowAmount = Number(isReturn ? (row.return_amount || row.total_amount || 0) : (row.total_amount || 0));
                const rowFreight = isReturn ? 0 : (Number(row.additional_charges || 0) + Number(row.transport_charges || 0));

                exportData.push({
                  sno: tIdx + 1,
                  processingDate: row.sale_date || row.return_date || String(row.created_at || '').split('T')[0],
                  docRef: isReturn ? (row.return_no || `RTN-${String(row.id).padStart(4, '0')}`) : (row.invoice_no || `INV-${String(row.id).padStart(4, '0')}`),
                  salesman: row.salesman || 'Direct',
                  products: productsFormatted,
                  paymentTerm: isReturn ? 'Return Credit' : (row.payment_term || 'Credit'),
                  freightCharges: rowFreight,
                  totalAmount: isReturn ? -rowAmount : rowAmount
                });
              });
            }

            exportData.push({
              _isSubtotal: true,
              sno: '',
              processingDate: '',
              docRef: '',
              salesman: `Subtotal (${cust.customer_name}):`,
              products: `Net Vol: ${custNetUnits.toLocaleString()} Units`,
              paymentTerm: `Gross: Rs. ${custGross.toLocaleString()} | Ret: -Rs. ${custReturn.toLocaleString()}`,
              freightCharges: 0,
              totalAmount: custNet
            });
          });
        }
      } else if (rType === 'loyalty') {
        columns = [
          { header: 'S#', key: 'sno', width: 6, alignment: { horizontal: 'center' } },
          { header: 'Date', key: 'date', width: 14, alignment: { horizontal: 'center' } },
          { header: 'Invoice Ref #', key: 'invoice_no', width: 18 },
          { header: 'Sales Officer', key: 'salesman', width: 18 },
          { header: 'Narration / Details', key: 'narration', width: 35 },
          { header: 'Billed Amount / Dr (PKR)', key: 'billed_amount', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Amount Paid / Cr (PKR)', key: 'paid_amount', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Net Dues / Balance (PKR)', key: 'balance', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
          { header: 'Status', key: 'status', width: 14, alignment: { horizontal: 'center' } }
        ];

        exportData = [];
        reportRows.forEach((cust: any) => {
          const bannerText = `👤 ${cust.customer_name.toUpperCase()}  |  Closing Balance: Rs. ${Number(cust.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

          exportData.push({
            _isHeader: true,
            _bannerText: bannerText
          });

          const txList = cust.transactions || [];
          if (txList.length === 0) {
            exportData.push({
              sno: '-',
              date: '-',
              invoice_no: '-',
              salesman: '-',
              narration: 'No Transactions',
              billed_amount: 0,
              paid_amount: 0,
              balance: Number(cust.balance || 0),
              status: '-'
            });
          } else {
            txList.forEach((tx: any, tIdx: number) => {
              exportData.push({
                sno: tIdx + 1,
                date: tx.date,
                invoice_no: tx.invoice_no,
                salesman: tx.salesman,
                narration: tx.narration,
                billed_amount: Number(tx.billed_amount || 0),
                paid_amount: Number(tx.paid_amount || 0),
                balance: Number(tx.balance || 0),
                status: tx.status || 'Paid'
              });
            });
          }

          exportData.push({
            _isSubtotal: true,
            sno: '',
            date: '',
            invoice_no: '',
            salesman: '',
            narration: `Total (${cust.customer_name}):`,
            billed_amount: Number(cust.total_billed || 0),
            paid_amount: Number(cust.total_paid || 0),
            balance: Number(cust.balance || 0),
            status: ''
          });
        });
      } else if (rType === 'sale') {
        if (activeViewMode === 'summary') {
          columns = [
            { header: 'S#', key: 'sno', width: 8, alignment: { horizontal: 'center' } },
            { header: 'Sales Officer / Salesman Name', key: 'salesman', width: 28 },
            { header: 'Invoices Booked', key: 'invoices_count', width: 16, numFmt: '#,##0', alignment: { horizontal: 'right' } },
            { header: 'Returns Booked', key: 'returns_count', width: 16, numFmt: '#,##0', alignment: { horizontal: 'right' } },
            { header: 'Unique Clients', key: 'unique_customers_count', width: 16, numFmt: '#,##0', alignment: { horizontal: 'right' } },
            { header: 'Cash Sales (PKR)', key: 'cash_sales', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Credit Sales (PKR)', key: 'credit_sales', width: 20, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Gross Sales (PKR)', key: 'gross_sales', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Returns (Dr) (PKR)', key: 'return_amount', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Net Realized Revenue (PKR)', key: 'net_sales', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Contribution (%)', key: 'contribution_pct', width: 16, numFmt: '0.00"%"', alignment: { horizontal: 'right' } }
          ];

          exportData = reportRows.map((sm, i) => ({
            sno: i + 1,
            salesman: sm.salesman,
            invoices_count: sm.invoices_count,
            returns_count: sm.returns_count,
            unique_customers_count: sm.unique_customers_count,
            cash_sales: sm.cash_sales,
            credit_sales: sm.credit_sales,
            gross_sales: sm.gross_sales,
            return_amount: sm.return_amount,
            net_sales: sm.net_sales,
            contribution_pct: sm.contribution_pct
          }));
        } else {
          columns = [
            { header: 'S#', key: 'sno', width: 6, alignment: { horizontal: 'center' } },
            { header: 'Processing Date', key: 'processingDate', width: 16, alignment: { horizontal: 'center' } },
            { header: 'Doc / Ref #', key: 'docRef', width: 18 },
            { header: 'Customer Name', key: 'customerName', width: 28 },
            { header: 'Products / Items', key: 'products', width: 42 },
            { header: 'Payment Term / Doc Type', key: 'paymentTerm', width: 20, alignment: { horizontal: 'center' } },
            { header: 'Carrier Fleet', key: 'transport', width: 18 },
            { header: 'Net Amount (PKR)', key: 'totalAmount', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } }
          ];

          exportData = [];
          reportRows.forEach((sm: any) => {
            const smGross = Number(sm.gross_sales || 0);
            const smReturn = Number(sm.return_amount || 0);
            const smNet = Number(sm.net_sales || 0);
            const smCash = Number(sm.cash_sales || 0);
            const smCredit = Number(sm.credit_sales || 0);

            const bannerText = `👔 ${sm.salesman.toUpperCase()}  |  Invoices: ${sm.invoices_count}  |  Returns: ${sm.returns_count}  |  Unique Clients: ${sm.unique_customers_count}  |  Gross: Rs. ${smGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Returns: - Rs. ${smReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Net Realized: Rs. ${smNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}  |  Share: ${Number(sm.contribution_pct || 0).toFixed(1)}%`;

            exportData.push({
              _isHeader: true,
              _bannerText: bannerText
            });

            const invList = sm.transactions || [];
            const retList = sm.return_transactions || [];

            // ── SECTION 1: SALES INVOICES ──
            if (invList.length > 0) {
              exportData.push({
                _isSubHeader: true,
                _bannerText: `📑 SALES INVOICES (${invList.length})  |  Cash: Rs. ${smCash.toLocaleString()}  |  Credit: Rs. ${smCredit.toLocaleString()}  |  Gross Invoiced: Rs. ${smGross.toLocaleString()}`
              });

              invList.forEach((row: any, tIdx: number) => {
                const itemNames = extractItemNames(row);
                exportData.push({
                  sno: tIdx + 1,
                  processingDate: row.sale_date || String(row.created_at || '').split('T')[0],
                  docRef: row.invoice_no || `INV-${String(row.id).padStart(4, '0')}`,
                  customerName: row.customer_name || 'Counter Retail Buyer',
                  products: itemNames.join(' | '),
                  paymentTerm: row.payment_term || 'Credit',
                  transport: row.transport_name || 'Self Pick',
                  totalAmount: Number(row.total_amount || 0)
                });
              });

              exportData.push({
                _isSubtotal: true,
                sno: '',
                processingDate: '',
                docRef: '',
                customerName: `Total Sales Invoices (${sm.salesman}):`,
                products: `Cash: Rs. ${smCash.toLocaleString()} | Credit: Rs. ${smCredit.toLocaleString()}`,
                paymentTerm: '',
                transport: '',
                totalAmount: smGross
              });
            }

            // ── SECTION 2: SALES RETURNS ──
            if (retList.length > 0) {
              exportData.push({
                _isSubHeader: true,
                _bannerText: `🔄 SALES RETURNS & CREDIT ADJUSTMENTS (${retList.length})  |  Total Return Deductions: - Rs. ${smReturn.toLocaleString()}`
              });

              retList.forEach((row: any, rIdx: number) => {
                const itemNames = extractItemNames(row);
                const retAmount = Number(row.return_amount || row.total_amount || 0);

                exportData.push({
                  sno: rIdx + 1,
                  processingDate: row.return_date || String(row.created_at || '').split('T')[0],
                  docRef: row.return_no || `RTN-${String(row.id).padStart(4, '0')}`,
                  customerName: row.customer_name || 'Counter Retail Buyer',
                  products: itemNames.length > 0 ? itemNames.join(' | ') : (row.reason || 'Stock Return'),
                  paymentTerm: 'Return Credit',
                  transport: row.transport_name || 'Warehouse Return',
                  totalAmount: -retAmount
                });
              });

              exportData.push({
                _isSubtotal: true,
                sno: '',
                processingDate: '',
                docRef: '',
                customerName: `Total Sales Returns (${sm.salesman}):`,
                products: `Returns Count: ${retList.length}`,
                paymentTerm: '',
                transport: '',
                totalAmount: -smReturn
              });
            }

            // ── FINAL SALESMAN NET RECONCILIATION ──
            exportData.push({
              _isSubtotal: true,
              sno: '',
              processingDate: '',
              docRef: '',
              customerName: `NET REALIZED COMMERCIAL REVENUE (${sm.salesman}):`,
              products: `Gross: Rs. ${smGross.toLocaleString()}  -  Returns: Rs. ${smReturn.toLocaleString()}`,
              paymentTerm: '',
              transport: '',
              totalAmount: smNet
            });
          });
        }
      } else if (rType === 'return') {
        if (activeViewMode === 'summary') {
          columns = [
            { header: 'S#', key: 'sno', width: 8, alignment: { horizontal: 'center' } },
            { header: 'Customer / Client Name', key: 'customer_name', width: 30 },
            { header: 'Return Notes Booked', key: 'returns_count', width: 18, numFmt: '#,##0', alignment: { horizontal: 'right' } },
            { header: 'Total Returned Units', key: 'total_returned_qty', width: 18, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: 'Total Credit Adjusted (PKR)', key: 'total_return_amount', width: 24, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
            { header: '% Share of Returns', key: 'contribution_pct', width: 18, numFmt: '0.00"%"', alignment: { horizontal: 'right' } }
          ];

          exportData = reportRows.map((cust, i) => ({
            sno: i + 1,
            customer_name: cust.customer_name,
            returns_count: cust.returns_count,
            total_returned_qty: cust.total_returned_qty,
            total_return_amount: cust.total_return_amount,
            contribution_pct: cust.contribution_pct
          }));
        } else {
          columns = [
            { header: 'S#', key: 'sno', width: 6, alignment: { horizontal: 'center' } },
            { header: 'Return Date', key: 'return_date', width: 14, alignment: { horizontal: 'center' } },
            { header: 'Return Ref #', key: 'return_no', width: 18 },
            { header: 'Original Inv Ref #', key: 'original_invoice_no', width: 18 },
            { header: 'Sales Officer', key: 'salesman', width: 20 },
            { header: 'Returned Line Items', key: 'items', width: 45 },
            { header: 'Restocked Warehouse', key: 'warehouse', width: 20 },
            { header: 'Reason / Remarks', key: 'reason', width: 25 },
            { header: 'Credit Amount (PKR)', key: 'return_amount', width: 22, numFmt: '#,##0.00', alignment: { horizontal: 'right' } }
          ];

          exportData = [];
          reportRows.forEach((cust: any) => {
            const bannerText = `👤 ${cust.customer_name.toUpperCase()}  |  Returns: ${cust.returns_count}  |  Total Returned Units: ${Number(cust.total_returned_qty || 0).toLocaleString()}  |  Total Credit Adjusted: Rs. ${Number(cust.total_return_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

            exportData.push({
              _isHeader: true,
              _bannerText: bannerText
            });

            const txList = cust.transactions || [];
            if (txList.length === 0) {
              exportData.push({
                sno: '-',
                return_date: '-',
                return_no: '-',
                original_invoice_no: '-',
                salesman: '-',
                items: 'No Returns',
                warehouse: '-',
                reason: '-',
                return_amount: 0
              });
            } else {
              txList.forEach((row: any, tIdx: number) => {
                const itemDetails = extractItemDetails(row);
                const itemsFormatted = itemDetails.length > 0
                  ? itemDetails.map(it => `${it.name} (${it.qty} ${it.uom} @ Rs. ${Number(it.price).toLocaleString()})`).join(' | ')
                  : extractItemNames(row).join(' | ');

                exportData.push({
                  sno: tIdx + 1,
                  return_date: row.return_date || String(row.created_at || '').split('T')[0],
                  return_no: row.return_no || `RTN-${String(row.id).padStart(4, '0')}`,
                  original_invoice_no: row.original_invoice_no || '-',
                  salesman: row.salesman || 'Direct',
                  items: itemsFormatted,
                  warehouse: row.dispatch_warehouse || row.location || 'Main Warehouse',
                  reason: row.reason || row.remarks || 'Stock Return',
                  return_amount: Number(row.return_amount || row.total_amount || 0)
                });
              });
            }

            exportData.push({
              _isSubtotal: true,
              sno: '',
              return_date: '',
              return_no: '',
              original_invoice_no: '',
              salesman: `Subtotal (${cust.customer_name}):`,
              items: `Total Units: ${Number(cust.total_returned_qty || 0).toLocaleString()}`,
              warehouse: '',
              reason: '',
              return_amount: Number(cust.total_return_amount || 0)
            });
          });
        }
      } else {
        columns = [
          { header: 'Processing Date', key: 'processingDate', width: 16, type: 'date' as const },
          { header: 'Invoice No', key: 'docRef', width: 18 },
          { header: 'Product', key: 'products', width: 45 },
          { header: 'Customer', key: 'customerName', width: 28 },
          { header: 'Gross Matrix Amount (Rs.)', key: 'totalAmount', width: 22, type: 'currency' as const }
        ];

        exportData = reportRows.map((row) => {
          const itemDetails = extractItemDetails(row);
          const itemNames = extractItemNames(row);
          const productsFormatted = rType === 'invoice'
            ? itemDetails.map(it => `${it.name} | ${it.qty} ${it.uom} | Rs. ${Number(it.price).toLocaleString()}`).join('\r\n')
            : itemNames.join(' | ');

          return {
            processingDate: row.sale_date || row.return_date || String(row.created_at || '').split('T')[0],
            docRef: row.invoice_no || `INV-${String(row.id).padStart(4, '0')}`,
            products: productsFormatted,
            customerName: row.customer_name || 'Counter Retail Buyer',
            totalAmount: Number(row.total_amount || row.return_amount || row.payout_amount_paid || 0)
          };
        });
      }

      const reportTitle = rType === 'product-sales-history'
        ? `Product Sales History & Market Trends Audit Report (${activeViewMode.toUpperCase()} VIEW)`
        : rType === 'sales-query'
        ? 'Sales Parameter Multi-Criteria Transaction Register'
        : rType === 'customer-sales'
        ? `Customer Sales & Volume Analysis Statement (${activeViewMode.toUpperCase()} VIEW)`
        : rType === 'sale'
        ? `Commercial Sales Audit Ledger Statement (${activeViewMode.toUpperCase()} VIEW)`
        : rType === 'return'
        ? `Sales Return & Credit Adjustment Ledger Statement (${activeViewMode.toUpperCase()} VIEW)`
        : rType === 'loyalty'
        ? 'Customer Financial Statement & Invoice Ledger'
        : 'Sales Invoice Detail Audit Report';

      await exportToExcel({
        fileName: `${rType === 'sale' ? 'Commercial_Sales_Ledger' : rType === 'product-sales-history' ? 'Product_Sales_History' : rType === 'customer-sales' ? 'Customer_Sales_Analysis' : rType === 'return' ? 'Sales_Return_Credit_Ledger' : rType === 'sales-query' ? 'Sales_Parameter_Register' : rType}_${new Date().toISOString().split('T')[0]}.xlsx`,
        sheetName: rType === 'sale' ? 'Sales Ledger' : rType === 'customer-sales' ? 'Customer Breakdown' : rType === 'return' ? 'Return Ledger' : 'Sales Report',
        companyName: businessName || 'ZOAIB ALI & COMPANY',
        reportTitle,
        filterSummary: filterMeta,
        columns,
        data: exportData,
        summaryRow: activeViewMode === 'detailed' ? false : true,
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

  // Summary Metrics calculations
  const totalGrossAmount = useMemo(() => {
    if (rType === 'category-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.net_revenue || 0), 0);
    }
    if (rType === 'product-sales-history') {
      return reportRows.reduce((acc, r) => acc + Number(r.final_net_sales || 0), 0);
    }
    if (rType === 'loyalty') {
      return reportRows.reduce((acc, r) => acc + Number(r.total_sales_amount || 0), 0);
    }
    if (rType === 'sale' || rType === 'customer-sales') {
      return reportRows.reduce((acc, s) => acc + Number(s.total_sales || 0), 0);
    }
    if (rType === 'return') {
      return reportRows.reduce((acc, r) => acc + Number(r.total_return_amount || 0), 0);
    }
    return reportRows.reduce((acc, row) => acc + Number(row.total_amount || 0), 0);
  }, [reportRows, rType]);

  const totalSoldUnits = useMemo(() => {
    if (rType === 'category-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.gross_units || 0), 0);
    }
    if (rType === 'product-sales-history') {
      return reportRows.reduce((acc, r) => acc + Number(r.sold_qty || 0), 0);
    }
    if (rType === 'customer-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.gross_units || c.total_units || 0), 0);
    }
    return 0;
  }, [reportRows, rType]);

  const totalReturnedUnits = useMemo(() => {
    if (rType === 'category-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.returned_units || 0), 0);
    }
    if (rType === 'product-sales-history') {
      return reportRows.reduce((acc, r) => acc + Number(r.returned_qty || 0), 0);
    }
    if (rType === 'return') {
      return reportRows.reduce((acc, r) => acc + Number(r.total_returned_qty || 0), 0);
    }
    if (rType === 'customer-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.returned_units || 0), 0);
    }
    return 0;
  }, [reportRows, rType]);

  const totalNetUnits = useMemo(() => {
    if (rType === 'category-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.net_units || 0), 0);
    }
    if (rType === 'product-sales-history') {
      return reportRows.reduce((acc, r) => acc + Number(r.net_qty || 0), 0);
    }
    if (rType === 'customer-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.net_units || (c.gross_units || 0) - (c.returned_units || 0)), 0);
    }
    return 0;
  }, [reportRows, rType]);

  const totalReturnsCount = useMemo(() => {
    if (rType === 'return') {
      return reportRows.reduce((acc, r) => acc + Number(r.returns_count || 0), 0);
    }
    if (rType === 'customer-sales' || rType === 'sale') {
      return reportRows.reduce((acc, c) => acc + Number(c.returns_count || 0), 0);
    }
    return 0;
  }, [reportRows, rType]);

  const totalReturnAmount = useMemo(() => {
    if (rType === 'category-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.returned_amount || 0), 0);
    }
    if (rType === 'return') {
      return reportRows.reduce((acc, r) => acc + Number(r.total_return_amount || 0), 0);
    }
    if (rType === 'customer-sales' || rType === 'sale') {
      return reportRows.reduce((acc, c) => acc + Number(c.return_amount || c.returned_amount || 0), 0);
    }
    return 0;
  }, [reportRows, rType]);

  const totalCustomerGrossSales = useMemo(() => {
    if (rType === 'category-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.gross_sales || 0), 0);
    }
    if (rType === 'customer-sales' || rType === 'sale') {
      return reportRows.reduce((acc, c) => acc + Number(c.gross_sales || c.total_sales || 0), 0);
    }
    return totalGrossAmount;
  }, [reportRows, rType, totalGrossAmount]);

  const cashAmount = useMemo(() => {
    if (rType === 'sale' || rType === 'customer-sales') {
      return reportRows.reduce((acc, s) => acc + Number(s.cash_sales || 0), 0);
    }
    return reportRows.filter(r => String(r.payment_term || '').toLowerCase() === 'cash').reduce((acc, r) => acc + Number(r.total_amount || 0), 0);
  }, [reportRows, rType]);

  const creditAmount = useMemo(() => {
    if (rType === 'sale' || rType === 'customer-sales') {
      return reportRows.reduce((acc, s) => acc + Number(s.credit_sales || 0), 0);
    }
    return totalGrossAmount - cashAmount;
  }, [reportRows, rType, totalGrossAmount, cashAmount]);

  const totalInvoicesCount = useMemo(() => {
    if (rType === 'category-sales') {
      return reportRows.reduce((acc, c) => acc + Number(c.invoices_count || 0), 0);
    }
    if (rType === 'sale' || rType === 'customer-sales') {
      return reportRows.reduce((acc, s) => acc + Number(s.invoices_count || 0), 0);
    }
    if (rType === 'return') {
      return reportRows.reduce((acc, r) => acc + Number(r.returns_count || 0), 0);
    }
    if (rType === 'loyalty') {
      return reportRows.reduce((acc, c) => acc + Number(c.invoices_count || 0), 0);
    }
    return reportRows.length;
  }, [reportRows, rType]);

  const avgOrder = totalInvoicesCount > 0 ? totalGrossAmount / totalInvoicesCount : 0;

  const paginatedRows = useMemo(() => {
    if (isPrinting || pageSize >= 10000 || pageSize === 'all') return reportRows;
    const pSize = typeof pageSize === 'number' ? pageSize : 25;
    const start = (currentPage - 1) * pSize;
    return reportRows.slice(start, start + pSize);
  }, [reportRows, currentPage, pageSize, isPrinting]);

  const displayedRows = isPrinting ? reportRows : paginatedRows;

  const displayedHierarchy = useMemo(() => {
    if (isPrinting || pageSize >= 10000 || pageSize === 'all') return categoryHierarchyTree;
    const pSize = typeof pageSize === 'number' ? pageSize : 10;
    const start = (currentPage - 1) * pSize;
    return categoryHierarchyTree.slice(start, start + pSize);
  }, [categoryHierarchyTree, currentPage, pageSize, isPrinting]);

  if (loading) return <div className="flex h-64 items-center justify-center"><Spinner /></div>;

  return (
    <div className="w-full bg-white text-black p-6 space-y-6 text-xs min-h-screen print:p-0 print:m-0 print:bg-white print:text-black print:min-h-0 print:h-auto">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page { size: portrait; margin: 6mm 4mm 6mm 4mm; }
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body, html {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * { visibility: hidden !important; }
          .print-root-container, .print-root-container * { visibility: visible !important; }
          .print-root-container {
            position: static !important;
            width: 100% !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0 1mm !important;
            background: white !important;
          }
          aside, header, nav, footer, .print-hidden-element, button {
            display: none !important;
            visibility: hidden !important;
          }
          table {
            width: 100% !important;
            box-sizing: border-box !important;
            border-collapse: collapse !important;
            border: 1.5px solid black !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
          .break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}} />

      <div className="print-root-container w-full bg-white p-4 space-y-6 print:p-0 print:space-y-4">
        {/* ── TOP ACTION BUTTON BAR ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-100 p-3 rounded border print-hidden-element print:hidden">
          <button 
            type="button" 
            onClick={() => navigate(-1)} 
            className="flex items-center gap-1.5 font-bold hover:underline cursor-pointer"
          >
            <MdArrowBack size={16} /> Back to Report Filter
          </button>
          
          <div className="flex items-center gap-2 flex-wrap">
            {(rType === 'category-sales' || rType === 'product-sales-history' || rType === 'sale' || rType === 'customer-sales' || rType === 'return') && (
              <div className="flex items-center bg-white p-0.5 rounded border border-gray-300 shadow-2xs mr-2">
                <button
                  type="button"
                  onClick={() => setActiveViewMode('summary')}
                  className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                    activeViewMode === 'summary' ? 'bg-primary text-white' : 'text-gray-600 hover:text-black'
                  }`}
                >
                  <MdTableChart size={14} /> Summary View
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewMode('detailed')}
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

        {/* ── OFFICIAL CORPORATE REPORT HEADER ── */}
        <div className="text-center space-y-1 py-4 border-b border-double border-black">
          <h1 className="text-xl font-black uppercase tracking-widest font-serif">ZOAIB ALI & COMPANY</h1>
          <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
            {rType === 'category-sales'
              ? 'Category-Wise Product Sales, Net Volume Realization & Revenue Contribution Statement'
              : rType === 'product-sales-history' 
              ? 'Product Sales History, Velocity Trends & Realized Revenue Statement'
              : rType === 'sales-query'
              ? 'Sales Filter, Multi-Criteria Parameters & Chronological Audit Register'
              : rType === 'customer-sales'
              ? 'Customer Sales Volume, Purchasing Cycle & Revenue Contribution Statement'
              : rType === 'sale'
              ? 'Commercial Sales Audit Statement & Sales Executive Ledger'
              : rType === 'loyalty'
              ? 'Customer Financial Statement & Chronological Invoicing Ledger'
              : rType === 'return'
              ? 'Sales Return, Defect Restock & Credit Ledger Statement'
              : 'Sales Invoice Detail Audit Report'}
          </p>
          <div className="text-[10px] pt-1 font-mono flex flex-wrap justify-between px-2 text-gray-600">
            <span>
              Report Categorization: <b className="text-black uppercase underline">
                {rType === 'category-sales'
                  ? `Category-Wise Sales Audit (${activeViewMode.toUpperCase()} VIEW)`
                  : rType === 'product-sales-history' 
                  ? `Product Sales History (${activeViewMode.toUpperCase()} VIEW)` 
                  : rType === 'sales-query'
                  ? 'Sales Parameter Transaction Register (CHRONOLOGICAL AUDIT)'
                  : rType === 'customer-sales'
                  ? `Customer Sales & Volume Analysis (${activeViewMode.toUpperCase()} VIEW)`
                  : rType === 'sale'
                  ? `Commercial Sales Audit Ledger (${activeViewMode.toUpperCase()} VIEW)`
                  : rType === 'return'
                  ? `Sales Return & Credit Ledger (${activeViewMode.toUpperCase()} VIEW)`
                  : rType === 'loyalty'
                  ? 'CUSTOMER FINANCIAL STATEMENT & INVOICE LEDGER'
                  : `${rType} Ledger Book`}
              </b>
            </span>
            <span>Duration Window Block: {filters.dateFrom || 'All Time'} up to {filters.dateTo || 'All Time'}</span>
          </div>
        </div>

        {/* ── VISUAL KPI STATS RIBBON ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 print-hidden-element print:hidden">
          {rType === 'category-sales' ? (
            <>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Product Categories</p>
                <p className="text-sm font-black text-slate-900 font-mono mt-0.5">{reportRows.length} Categories</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Items Sold</p>
                <p className="text-sm font-black text-indigo-700 font-mono mt-0.5">
                  {reportRows.reduce((sum: number, c: any) => sum + Number(c.products_count || 0), 0)} Products
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Net Realized Volume</p>
                <p className="text-sm font-black text-emerald-700 font-mono mt-0.5">{totalNetUnits.toLocaleString()} Units</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Net Realized Revenue</p>
                <p className="text-sm font-black text-purple-700 font-mono mt-0.5">Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </>
          ) : rType === 'product-sales-history' ? (
            <>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Product SKUs</p>
                <p className="text-sm font-black text-slate-900 font-mono mt-0.5">{reportRows.length} Items</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Units Sold (Gross)</p>
                <p className="text-sm font-black text-emerald-700 font-mono mt-0.5">{totalSoldUnits.toLocaleString()}</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Customer Returns Qty</p>
                <p className="text-sm font-black text-rose-700 font-mono mt-0.5">{totalReturnedUnits.toLocaleString()}</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Net Realized Revenue</p>
                <p className="text-sm font-black text-purple-700 font-mono mt-0.5">Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </>
          ) : rType === 'customer-sales' ? (
            <>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Target Customers</p>
                <p className="text-sm font-black text-slate-900 font-mono mt-0.5">{reportRows.length} Clients</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Invoices & Returns</p>
                <p className="text-sm font-black text-indigo-700 font-mono mt-0.5">{totalInvoicesCount} Inv | {totalReturnsCount} Rtn</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Net Realized Volume</p>
                <p className="text-sm font-black text-emerald-700 font-mono mt-0.5">{totalNetUnits.toLocaleString()} Units</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Net Realized Revenue</p>
                <p className="text-sm font-black text-purple-700 font-mono mt-0.5">Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </>
          ) : rType === 'loyalty' ? (
            <>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Target Customer(s)</p>
                <p className="text-sm font-black text-slate-900 font-mono mt-0.5 truncate">
                  {filters.customer?.length > 0 && !filters.customer.includes('All') ? filters.customer.join(', ') : `${reportRows.length} Customers`}
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Invoiced / Billed</p>
                <p className="text-sm font-black text-indigo-700 font-mono mt-0.5">
                  Rs. {reportRows.reduce((sum: number, c: any) => sum + Number(c.total_billed || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Received / Paid</p>
                <p className="text-sm font-black text-emerald-700 font-mono mt-0.5">
                  Rs. {reportRows.reduce((sum: number, c: any) => sum + Number(c.total_paid || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Net Outstanding Dues</p>
                <p className="text-sm font-black text-purple-700 font-mono mt-0.5">
                  Rs. {reportRows.reduce((sum: number, c: any) => sum + Number(c.net_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </>
          ) : rType === 'return' ? (
            <>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Affected Customers</p>
                <p className="text-sm font-black text-slate-900 font-mono mt-0.5">{reportRows.length} Clients</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Return Debit Notes</p>
                <p className="text-sm font-black text-indigo-700 font-mono mt-0.5">{totalInvoicesCount} Notes</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Returned Units</p>
                <p className="text-sm font-black text-rose-700 font-mono mt-0.5">{totalReturnedUnits.toLocaleString()} Units</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Credit Adjusted</p>
                <p className="text-sm font-black text-purple-700 font-mono mt-0.5">Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </>
          ) : rType === 'sale' ? (
            <>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Sales Officers</p>
                <p className="text-sm font-black text-slate-900 font-mono mt-0.5">{reportRows.length} Officers</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Invoices & Returns</p>
                <p className="text-sm font-black text-indigo-700 font-mono mt-0.5">{totalInvoicesCount} Inv | {totalReturnsCount} Rtn</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Gross vs Returns (Dr)</p>
                <p className="text-[11px] font-black font-mono mt-0.5">
                  <span className="text-emerald-600">Rs. {totalCustomerGrossSales.toLocaleString()}</span> / <span className="text-rose-600">-Rs. {totalReturnAmount.toLocaleString()}</span>
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Net Realized Revenue</p>
                <p className="text-sm font-black text-purple-700 font-mono mt-0.5">Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Invoices / Records</p>
                <p className="text-sm font-black text-slate-900 font-mono mt-0.5">{reportRows.length}</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Matrix Gross</p>
                <p className="text-sm font-black text-emerald-700 font-mono mt-0.5">Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Cash vs Credit Split</p>
                <p className="text-[11px] font-black font-mono mt-0.5">
                  <span className="text-emerald-600">Rs. {cashAmount.toLocaleString()}</span> / <span className="text-blue-600">Rs. {creditAmount.toLocaleString()}</span>
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center shadow-2xs">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Average Ticket Value</p>
                <p className="text-sm font-black text-purple-700 font-mono mt-0.5">Rs. {Math.round(avgOrder).toLocaleString()}</p>
              </div>
            </>
          )}
        </div>

        {/* ── TOP PAGINATION CONTROL ── */}
        <ReportPagination
          currentPage={currentPage}
          totalItems={rType === 'category-sales' && activeViewMode === 'detailed' ? categoryHierarchyTree.length : reportRows.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemLabel={rType === 'category-sales' ? (activeViewMode === 'detailed' ? 'parent categories' : 'categories') : rType === 'product-sales-history' ? 'products' : (rType === 'loyalty' || rType === 'customer-sales' || rType === 'return') ? 'customers' : rType === 'sale' ? 'salesmen' : 'records'}
        />

        {/* ── MAIN AUDIT TABLE SECTION ── */}
        <div className="w-full overflow-x-auto">
          {rType === 'category-sales' ? (
            activeViewMode === 'summary' ? (
              // ── 📂 CATEGORY-WISE PRODUCT SUMMARY VIEW (CATEGORY HEADER WITH PARENT & SUB -> DIRECT PRODUCTS TABLE) ──
              <div className="space-y-6">
                {displayedRows.length === 0 ? (
                  <div className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                    No product category sales records discovered matching chosen selection criteria.
                  </div>
                ) : (
                  displayedRows.map((cat: any, cIdx: number) => {
                    const realIndex = isPrinting || pageSize === 'all' ? cIdx + 1 : (currentPage - 1) * (pageSize as number) + cIdx + 1;
                    return (
                      <div key={cIdx} className="border-2 border-slate-900 rounded-sm overflow-hidden shadow-2xs bg-white space-y-0">
                        {/* 🏷️ CATEGORY HEADER BANNER (WITH PARENT & SUB CATEGORY MENTIONED) */}
                        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono text-xs border-b-2 border-slate-900">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="bg-emerald-500 text-black px-2 py-0.5 rounded font-black text-xs">#{realIndex}</span>
                            <span className="font-black font-sans text-sm tracking-wide uppercase text-white flex items-center gap-1.5">
                              🏷️ CATEGORY: {cat.category_name}
                            </span>
                            <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded border border-slate-700">
                              📁 Parent: <b className="text-white font-sans">{cat.parent_name}</b>
                            </span>
                            <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded border border-slate-700">
                              📂 Sub: <b className="text-white font-sans">{cat.sub_name}</b>
                            </span>
                            <span className="bg-indigo-900/70 text-indigo-200 text-[10px] px-2 py-0.5 rounded border border-indigo-700">
                              {cat.products_count || (cat.products || []).length} Products
                            </span>
                          </div>
                          <div className="text-right text-[11px] font-black font-mono flex items-center gap-2.5 flex-wrap">
                            <span className="text-emerald-400">Sold: {Number(cat.gross_units || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-rose-400">Ret: {Number(cat.returned_units || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-emerald-300">Net: {Number(cat.net_units || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} Units</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-amber-300 font-extrabold underline decoration-double">
                              Net Rev: Rs. {Number(cat.net_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-slate-600">|</span>
                            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/40">
                              {Number(cat.contribution_pct || 0).toFixed(1)}% Share
                            </span>
                          </div>
                        </div>

                        {/* 📦 PRODUCTS TABLE DIRECTLY UNDER CATEGORY HEADER */}
                        <table className="w-full table-auto border-collapse text-[11px] font-sans antialiased text-left print:w-full">
                          <thead>
                            <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9px]">
                              <th className="p-1.5 border border-black text-center w-8">S#</th>
                              <th className="p-1.5 border border-black">Product / Item Name</th>
                              <th className="p-1.5 border border-black w-28">SKU / Code</th>
                              <th className="p-1.5 border border-black text-center w-14">UOM</th>
                              <th className="p-1.5 border border-black text-right w-18">Gross Sold</th>
                              <th className="p-1.5 border border-black text-right w-16">Ret Qty</th>
                              <th className="p-1.5 border border-black text-right w-20">Net Qty</th>
                              <th className="p-1.5 border border-black text-right w-24">Gross Sales (PKR)</th>
                              <th className="p-1.5 border border-black text-right w-20">Ret Amount</th>
                              <th className="p-1.5 border border-black text-right w-26 pr-2">Net Rev (PKR)</th>
                              <th className="p-1.5 border border-black text-right w-14 pr-1">% Share</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(cat.products || []).length === 0 ? (
                              <tr>
                                <td colSpan={11} className="p-4 text-center italic text-gray-500 font-mono text-xs">
                                  No product items configured or sold under this category in selected period.
                                </td>
                              </tr>
                            ) : (
                              (cat.products || []).map((p: any, pIdx: number) => (
                                <tr key={pIdx} className="border-b border-gray-300 hover:bg-gray-50 font-semibold font-mono text-xs">
                                  <td className="p-1.5 border border-gray-300 text-center text-gray-500">{pIdx + 1}</td>
                                  <td className="p-1.5 border border-gray-300 font-sans font-bold text-black">{p.product_name}</td>
                                  <td className="p-1.5 border border-gray-300 text-gray-600 text-[10px]">{p.sku || '-'}</td>
                                  <td className="p-1.5 border border-gray-300 text-center text-gray-700 font-bold">{p.uom}</td>
                                  <td className="p-1.5 border border-gray-300 text-right text-black font-bold">
                                    {Number(p.sold_qty || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-1.5 border border-gray-300 text-right text-rose-700 font-bold">
                                    {Number(p.returned_qty || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-1.5 border border-gray-300 text-right text-primary font-black">
                                    {Number(p.net_qty || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-1.5 border border-gray-300 text-right text-gray-800">
                                    Rs. {Number(p.gross_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-1.5 border border-gray-300 text-right text-rose-700 font-bold">
                                    Rs. {Number(p.returned_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-1.5 border border-gray-300 text-right pr-2 text-emerald-700 font-black">
                                    Rs. {Number(p.final_net_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-1.5 border border-gray-300 text-right pr-1 text-purple-900 font-bold text-[10px]">
                                    {Number(p.share_of_category || 0).toFixed(1)}%
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                              <td colSpan={4} className="p-1.5 border border-black text-right uppercase tracking-wider text-gray-800">
                                Subtotal ({cat.category_name} : {(cat.products || []).length} Products):
                              </td>
                              <td className="p-1.5 border border-black text-right font-bold text-black">
                                {Number(cat.gross_units || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-1.5 border border-black text-right font-bold text-rose-700">
                                {Number(cat.returned_units || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-1.5 border border-black text-right font-black text-primary">
                                {Number(cat.net_units || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-1.5 border border-black text-right font-bold text-gray-900">
                                Rs. {Number(cat.gross_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-1.5 border border-black text-right font-bold text-rose-700">
                                Rs. {Number(cat.returned_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-1.5 border border-black text-right pr-2 text-purple-900 font-black">
                                Rs. {Number(cat.net_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-1.5 border border-black text-center text-gray-400 font-bold text-[10px]">-</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })
                )}

                {/* Grand Total Summary Box across All Categories */}
                {reportRows.length > 0 && (
                  <div className="space-y-2">
                    {!isPrinting && pageSize !== 'all' && (
                      <div className="bg-amber-50/80 p-3 rounded border border-amber-300 flex justify-between items-center font-mono font-bold text-xs text-amber-950">
                        <span className="uppercase text-amber-900">
                          Page {currentPage} Subtotal ({displayedRows.length} Categories On This Page):
                        </span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-black">Sold: {displayedRows.reduce((s: number, r: any) => s + Number(r.gross_units || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span className="text-rose-700">Ret: {displayedRows.reduce((s: number, r: any) => s + Number(r.returned_units || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span className="text-primary font-black">Net Vol: {displayedRows.reduce((s: number, r: any) => s + Number(r.net_units || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span className="text-purple-900 font-black">Page Revenue: Rs. {displayedRows.reduce((s: number, r: any) => s + Number(r.net_revenue || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}

                    <div className="bg-gray-100 p-3.5 rounded border-2 border-black flex justify-between items-center font-mono font-black text-xs">
                      <span className="uppercase text-gray-900">
                        Grand Total Category Sales Summary (All {reportRows.length} Categories):
                      </span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-black">Gross Sold: {totalSoldUnits.toLocaleString(undefined, { minimumFractionDigits: 2 })} Units</span>
                        <span className="text-rose-700">Returned: {totalReturnedUnits.toLocaleString(undefined, { minimumFractionDigits: 2 })} Units</span>
                        <span className="text-emerald-700">Net Volume: {totalNetUnits.toLocaleString(undefined, { minimumFractionDigits: 2 })} Units</span>
                        <span className="text-purple-800 text-sm underline decoration-double">
                          Grand Net Revenue: Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // ── 📑 3-TIER CATEGORY HIERARCHY TRANSACTIONS DETAILED VIEW ──
              <div className="space-y-8">
                {displayedHierarchy.length === 0 ? (
                  <div className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                    No product category sales transactions discovered matching chosen selection criteria.
                  </div>
                ) : (
                  displayedHierarchy.map((parent: any, pIdx: number) => {
                    const realParentIndex = isPrinting || pageSize === 'all' ? pIdx + 1 : (currentPage - 1) * (pageSize as number) + pIdx + 1;
                    return (
                      <div key={pIdx} className="border-2 border-slate-900 rounded-md overflow-hidden shadow-sm bg-white space-y-4 pb-4">
                        {/* 🏢 TIER 1: PARENT CATEGORY HEADER BANNER */}
                        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono text-xs border-b-2 border-slate-900">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="bg-amber-400 text-black px-2 py-0.5 rounded font-black text-xs">#{realParentIndex}</span>
                            <span className="font-black font-sans text-sm tracking-wide uppercase text-white flex items-center gap-1.5">
                              🏢 PARENT CATEGORY: {parent.parent_name}
                            </span>
                            <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded border border-slate-700">
                              {parent.sub_categories?.length || 0} Sub-Categories
                            </span>
                          </div>
                          <div className="text-right text-[11px] font-black font-mono flex items-center gap-2.5 flex-wrap">
                            <span className="text-emerald-400">Sold: {Number(parent.gross_units || 0).toLocaleString()}</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-rose-400">Ret: {Number(parent.returned_units || 0).toLocaleString()}</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-emerald-300">Net: {Number(parent.net_units || 0).toLocaleString()} Units</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-amber-300 font-extrabold underline decoration-double">
                              Net Revenue: Rs. {Number(parent.net_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        {/* 📂 TIER 2: SUB-CATEGORIES CONTAINER */}
                        <div className="px-4 space-y-6">
                          {(parent.sub_categories || []).map((sub: any, sIdx: number) => (
                            <div key={sIdx} className="border border-slate-300 rounded-sm overflow-hidden bg-slate-50/50 space-y-3 p-3">
                              {/* SUB-CATEGORY HEADER */}
                              <div className="bg-slate-200/90 text-slate-900 p-2.5 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono text-xs border border-slate-300">
                                <div className="flex items-center gap-2">
                                  <span className="bg-indigo-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Sub {sIdx + 1}</span>
                                  <span className="font-black font-sans text-xs tracking-wide uppercase text-slate-900 flex items-center gap-1">
                                    📂 SUB-CATEGORY: {sub.sub_name}
                                  </span>
                                  <span className="bg-white text-slate-700 text-[10px] px-2 py-0.5 rounded border border-slate-300">
                                    {sub.categories?.length || 0} Categories
                                  </span>
                                </div>
                                <div className="text-right text-[10px] font-black font-mono flex items-center gap-2 flex-wrap">
                                  <span className="text-slate-700">Sold: {Number(sub.gross_units || 0).toLocaleString()}</span>
                                  <span className="text-slate-400">|</span>
                                  <span className="text-rose-700">Ret: {Number(sub.returned_units || 0).toLocaleString()}</span>
                                  <span className="text-slate-400">|</span>
                                  <span className="text-emerald-800">Net: {Number(sub.net_units || 0).toLocaleString()} Units</span>
                                  <span className="text-slate-400">|</span>
                                  <span className="text-purple-900 font-extrabold">
                                    Sub Revenue: Rs. {Number(sub.net_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>

                              {/* 🏷️ TIER 3: LEAF CATEGORIES & TRANSACTIONS */}
                              <div className="space-y-4 pl-2">
                                {(sub.categories || []).map((leafCat: any, lcIdx: number) => (
                                  <div key={lcIdx} className="border border-slate-300 rounded overflow-hidden bg-white shadow-2xs">
                                    <div className="bg-slate-100 p-2 flex justify-between items-center text-xs font-mono border-b border-slate-200">
                                      <div className="flex items-center gap-2">
                                        <span className="text-slate-500 font-bold">🏷️ Category:</span>
                                        <span className="font-bold font-sans text-slate-900">{leafCat.category_name}</span>
                                        <span className="text-slate-400 text-[10px]">({(leafCat.transactions || []).length} Records)</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-[11px] font-bold">
                                        <span className="text-slate-700">Net Vol: {Number(leafCat.net_units || 0).toLocaleString()}</span>
                                        <span className="text-slate-300">|</span>
                                        <span className="text-purple-800">Net: Rs. {Number(leafCat.net_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                      </div>
                                    </div>

                                    {/* Transactions Table */}
                                    <table className="w-full table-auto border-collapse text-[11px] font-sans antialiased text-left print:w-full">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-300 font-black uppercase text-slate-800 font-mono text-[9px]">
                                          <th className="p-1.5 border border-slate-200 text-center w-8">S#</th>
                                          <th className="p-1.5 border border-slate-200 text-center w-20">Date</th>
                                          <th className="p-1.5 border border-slate-200 w-24">Doc / Ref #</th>
                                          <th className="p-1.5 border border-slate-200">Customer Name</th>
                                          <th className="p-1.5 border border-slate-200 w-24">Sales Officer</th>
                                          <th className="p-1.5 border border-slate-200">Product Item</th>
                                          <th className="p-1.5 border border-slate-200 text-right w-16">Qty</th>
                                          <th className="p-1.5 border border-slate-200 text-center w-12">UOM</th>
                                          <th className="p-1.5 border border-slate-200 text-right w-20">Rate</th>
                                          <th className="p-1.5 border border-slate-200 text-center w-20">Term</th>
                                          <th className="p-1.5 border border-slate-200 text-right w-28 pr-3">Net Amount (PKR)</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(leafCat.transactions || []).length === 0 ? (
                                          <tr>
                                            <td colSpan={11} className="p-3 text-center italic text-gray-400 font-mono text-xs">
                                              No transaction records found for this category.
                                            </td>
                                          </tr>
                                        ) : (
                                          (leafCat.transactions || []).map((tx: any, tIdx: number) => {
                                            const isRet = tx.record_type === 'return';
                                            return (
                                              <tr key={tIdx} className={`border-b border-slate-200 hover:bg-slate-50/80 font-semibold font-mono text-xs ${isRet ? 'bg-rose-50/40 text-rose-900' : ''}`}>
                                                <td className="p-1.5 border border-slate-200 text-center text-gray-500">{tIdx + 1}</td>
                                                <td className="p-1.5 border border-slate-200 text-center text-gray-600 text-[10px]">{tx.date}</td>
                                                <td className="p-1.5 border border-slate-200 text-black font-bold text-[10px]">
                                                  <span className={isRet ? 'text-rose-700 font-black' : 'text-indigo-900'}>{tx.doc_no}</span>
                                                </td>
                                                <td className="p-1.5 border border-slate-200 font-sans font-bold text-black">{tx.customer_name}</td>
                                                <td className="p-1.5 border border-slate-200 text-gray-700 text-[10px]">{tx.salesman}</td>
                                                <td className="p-1.5 border border-slate-200 font-sans font-medium text-black">{tx.product_name}</td>
                                                <td className={`p-1.5 border border-slate-200 text-right font-bold ${isRet ? 'text-rose-700' : 'text-black'}`}>
                                                  {isRet ? `-${Number(tx.qty || 0).toLocaleString()}` : Number(tx.qty || 0).toLocaleString()}
                                                </td>
                                                <td className="p-1.5 border border-slate-200 text-center text-gray-600 font-bold">{tx.uom}</td>
                                                <td className="p-1.5 border border-slate-200 text-right text-gray-700">
                                                  Rs. {Number(tx.rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="p-1.5 border border-slate-200 text-center text-[10px]">
                                                  <span className={`px-1.5 py-0.5 rounded font-bold ${isRet ? 'bg-rose-200 text-rose-800' : tx.payment_term === 'Cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                                                    {tx.payment_term}
                                                  </span>
                                                </td>
                                                <td className={`p-1.5 border border-slate-200 text-right pr-3 font-black ${isRet ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                  {isRet ? `-Rs. ${Number(tx.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `Rs. ${Number(tx.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                                </td>
                                              </tr>
                                            );
                                          })
                                        )}
                                      </tbody>
                                      <tfoot>
                                        <tr className="bg-slate-50 border-t border-slate-300 font-black font-mono text-xs">
                                          <td colSpan={6} className="p-1.5 border border-slate-200 text-right uppercase tracking-wider text-gray-600">
                                            Category Subtotal ({leafCat.category_name}):
                                          </td>
                                          <td className="p-1.5 border border-slate-200 text-right font-black text-primary">
                                            {Number(leafCat.net_units || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                          </td>
                                          <td colSpan={3} className="p-1.5 border border-slate-200 text-right text-[10px] text-gray-600">
                                            Sold: {Number(leafCat.gross_units || 0).toLocaleString()} | Ret: {Number(leafCat.returned_units || 0).toLocaleString()}
                                          </td>
                                          <td className="p-1.5 border border-slate-200 text-right pr-3 text-purple-900 font-black">
                                            Rs. {Number(leafCat.net_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Grand Total Detailed Summary */}
                {reportRows.length > 0 && (
                  <div className="bg-gray-100 p-3.5 rounded border-2 border-black flex justify-between items-center font-mono font-black text-xs">
                    <span className="uppercase text-gray-900">
                      Grand Total Category Sales Summary (All {reportRows.length} Categories):
                    </span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-black">Gross Sold: {totalSoldUnits.toLocaleString(undefined, { minimumFractionDigits: 2 })} Units</span>
                      <span className="text-rose-700">Returned: {totalReturnedUnits.toLocaleString(undefined, { minimumFractionDigits: 2 })} Units</span>
                      <span className="text-emerald-700">Net Volume: {totalNetUnits.toLocaleString(undefined, { minimumFractionDigits: 2 })} Units</span>
                      <span className="text-purple-800 text-sm underline decoration-double">
                        Grand Net Revenue: Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : rType === 'product-sales-history' ? (
            activeViewMode === 'summary' ? (
              // ── 📊 SUMMARY VIEW TABLE (1 ROW / PRODUCT) ──
              <table className="w-full table-auto border-2 border-black border-collapse text-[10px] font-sans antialiased text-left print:w-full print:text-[8.5px] print:border-2 print:border-black">
                <thead>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9.5px] print:text-[8px]">
                    <th rowSpan={2} className="p-1 border border-black text-center w-7">S#</th>
                    <th rowSpan={2} className="p-1 border border-black">Product / Item Name</th>
                    <th rowSpan={2} className="p-1 border border-black whitespace-nowrap">SKU / Code</th>
                    <th rowSpan={2} className="p-1 border border-black">Brand</th>
                    <th colSpan={3} className="p-0.5 border border-black text-center bg-gray-200">Category Classification</th>
                    <th rowSpan={2} className="p-1 border border-black text-center w-8">UOM</th>
                    <th rowSpan={2} className="p-1 border border-black text-right whitespace-nowrap">Sold Qty</th>
                    <th rowSpan={2} className="p-1 border border-black text-right whitespace-nowrap">Return Qty</th>
                    <th rowSpan={2} className="p-1 border border-black text-right whitespace-nowrap">Net Qty</th>
                    <th rowSpan={2} className="p-1 border border-black text-right whitespace-nowrap">Avg. Rate (PKR)</th>
                    <th rowSpan={2} className="p-1 border border-black text-right whitespace-nowrap">Net Sales Revenue (PKR)</th>
                    <th rowSpan={2} className="p-1 border border-black text-center whitespace-nowrap border-r-2 border-r-black">Last Sold Date</th>
                  </tr>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[8px]">
                    <th className="p-0.5 border border-black text-left">Parent</th>
                    <th className="p-0.5 border border-black text-left">Sub</th>
                    <th className="p-0.5 border border-black text-left">Leaf</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                        No product sales history records discovered matching chosen selection criteria.
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((row, idx) => {
                      const realIndex = isPrinting ? idx + 1 : (currentPage - 1) * pageSize + idx + 1;
                      return (
                        <tr key={idx} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-[10px] print:text-[8.5px]">
                          <td className="p-1 border border-black text-center text-gray-600">{realIndex}</td>
                          <td className="p-1 border border-black font-sans font-bold text-black">{row.product_name}</td>
                          <td className="p-1 border border-black text-gray-700 text-[9px] whitespace-nowrap">{row.sku || '-'}</td>
                          <td className="p-1 border border-black font-sans text-gray-600 text-[9px]">{row.brand || '-'}</td>
                          <td className="p-1 border border-black font-sans text-gray-600 text-[8.5px]">{row.parentCategory || '-'}</td>
                          <td className="p-1 border border-black font-sans text-gray-600 text-[8.5px]">{row.subCategory || '-'}</td>
                          <td className="p-1 border border-black font-sans text-gray-600 text-[8.5px]">{row.category || '-'}</td>
                          <td className="p-1 border border-black text-center text-gray-700 font-bold whitespace-nowrap">{row.uom}</td>
                          <td className="p-1 border border-black text-right text-black font-bold whitespace-nowrap">
                            {Number(row.sold_qty || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1 border border-black text-right text-rose-700 font-bold whitespace-nowrap">
                            {Number(row.returned_qty || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1 border border-black text-right text-primary font-black whitespace-nowrap">
                            {Number(row.net_qty || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1 border border-black text-right text-gray-800 whitespace-nowrap font-mono">
                            Rs. {Number(row.avg_rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1 border border-black text-right text-emerald-700 font-black whitespace-nowrap font-mono">
                            Rs. {Number(row.final_net_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1 border border-black text-center text-gray-600 text-[9px] whitespace-nowrap font-mono border-r-2 border-r-black">
                            {row.last_sale_date || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  {/* 📄 Page Subtotal Row */}
                  {!isPrinting && pageSize !== 'all' && (
                    <tr className="bg-amber-50/80 border-t border-black font-bold font-mono text-xs text-amber-950">
                      <td colSpan={8} className="p-2 border border-black text-right uppercase tracking-wider text-amber-900">
                        Page {currentPage} Subtotal ({displayedRows.length} products):
                      </td>
                      <td className="p-2 border border-black text-right text-black font-bold">
                        {displayedRows.reduce((sum, r) => sum + Number(r.sold_qty || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-right text-rose-700 font-bold">
                        {displayedRows.reduce((sum, r) => sum + Number(r.returned_qty || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-right text-primary font-bold">
                        {displayedRows.reduce((sum, r) => sum + Number(r.net_qty || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-right text-gray-400">-</td>
                      <td className="p-2 border border-black text-right text-emerald-800 font-bold whitespace-nowrap">
                        Rs. {displayedRows.reduce((sum, r) => sum + Number(r.final_net_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-center text-[10px] font-bold text-amber-800 border-r-2 border-r-black">Page {currentPage} of {Math.ceil(reportRows.length / (typeof pageSize === 'number' ? pageSize : 1))}</td>
                    </tr>
                  )}
                  {/* 📊 Overall Grand Totals Row */}
                  <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                    <td colSpan={8} className="p-2 border border-black text-right uppercase tracking-wider text-gray-900">
                      Grand Total Summary (All {reportRows.length} Products):
                    </td>
                    <td className="p-2 border border-black text-right text-black">
                      {totalSoldUnits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-right text-rose-700">
                      {totalReturnedUnits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-right text-primary">
                      {totalNetUnits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-right text-gray-400">-</td>
                    <td className="p-2 border border-black text-right text-emerald-800 text-sm font-black underline decoration-double whitespace-nowrap">
                      Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-center text-[10px] text-gray-500 border-r-2 border-r-black">{reportRows.length} SKUs</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              // ── 📑 DETAILED VIEW TABLE (GROUPED INVOICE BREAKDOWN) ──
              <div className="space-y-6">
                {displayedRows.length === 0 ? (
                  <div className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                    No product sales history records discovered matching chosen selection criteria.
                  </div>
                ) : (
                  displayedRows.map((prod, pIdx) => {
                    const realProdNum = isPrinting ? pIdx + 1 : (currentPage - 1) * pageSize + pIdx + 1;
                    const prodSubtotal = (prod.transactions || []).reduce((acc: number, t: any) => acc + Number(t.total || 0), 0);
                    const prodTotalQty = (prod.transactions || []).reduce((acc: number, t: any) => acc + Number(t.qty || 0), 0);

                    return (
                      <div key={pIdx} className="border border-black rounded-xs overflow-hidden shadow-xs">
                        {/* Product Banner */}
                        <div className="bg-slate-800 text-white p-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-emerald-500 text-black px-2 py-0.5 rounded font-black text-[10px]">#{realProdNum}</span>
                            <span className="font-bold font-sans text-sm">{prod.product_name}</span>
                            <span className="text-slate-400 text-[10px]">SKU: {prod.sku || 'N/A'}</span>
                            <span className="text-slate-400 text-[10px]">Category: {prod.category}</span>
                            <span className="text-slate-400 text-[10px]">UOM: {prod.uom}</span>
                          </div>
                          <div className="text-right text-[11px] font-black font-mono">
                            <span className="text-emerald-400">Total Sold: {prodTotalQty} {prod.uom}</span>
                            <span className="text-slate-500 mx-1.5">|</span>
                            <span className="text-emerald-300">Revenue: Rs. {prodSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>

                        {/* Transactions Sub-table */}
                        <table className="w-full table-auto border-collapse text-[11px] font-sans text-left">
                          <thead>
                            <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9.5px]">
                              <th className="p-1.5 border border-black text-center w-24">Date</th>
                              <th className="p-1.5 border border-black w-28">Invoice #</th>
                              <th className="p-1.5 border border-black">Customer Name</th>
                              <th className="p-1.5 border border-black">Salesman</th>
                              <th className="p-1.5 border border-black">Warehouse</th>
                              <th className="p-1.5 border border-black text-right w-20">Qty</th>
                              <th className="p-1.5 border border-black text-right w-24">Unit Rate</th>
                              <th className="p-1.5 border border-black text-right w-20">Discount</th>
                              <th className="p-1.5 border border-black text-right w-28">Net Amount (PKR)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(prod.transactions || []).map((tx: any, tIdx: number) => (
                              <tr key={tIdx} className="border-b border-gray-300 hover:bg-gray-50 font-mono text-xs">
                                <td className="p-1.5 border border-black text-center text-gray-700 whitespace-nowrap">{tx.date}</td>
                                <td className="p-1.5 border border-black font-black text-primary uppercase whitespace-nowrap">{tx.invoice_no}</td>
                                <td className="p-1.5 border border-black font-sans font-medium text-black">{tx.customer_name}</td>
                                <td className="p-1.5 border border-black font-sans text-gray-600">{tx.salesman}</td>
                                <td className="p-1.5 border border-black font-sans text-gray-600">{tx.warehouse}</td>
                                <td className="p-1.5 border border-black text-right font-bold text-black whitespace-nowrap">{tx.qty} {tx.uom}</td>
                                <td className="p-1.5 border border-black text-right text-gray-800 whitespace-nowrap">Rs. {Number(tx.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-1.5 border border-black text-right text-rose-600 font-semibold whitespace-nowrap">{tx.discount > 0 ? `Rs. ${Number(tx.discount).toLocaleString()}` : '-'}</td>
                                <td className="p-1.5 border border-black text-right text-emerald-700 font-bold whitespace-nowrap">Rs. {Number(tx.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50 border-t border-black font-black font-mono text-xs">
                              <td colSpan={5} className="p-1.5 border border-black text-right uppercase tracking-wider text-gray-600">
                                Subtotal ({prod.product_name}):
                              </td>
                              <td className="p-1.5 border border-black text-right text-primary font-black">
                                {prodTotalQty} {prod.uom}
                              </td>
                              <td colSpan={2} className="p-1.5 border border-black text-right text-gray-400">-</td>
                              <td className="p-1.5 border border-black text-right text-emerald-800 font-black">
                                Rs. {prodSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })
                )}

                {/* Grand Summary Across All Products */}
                {reportRows.length > 0 && (
                  <div className="bg-gray-100 p-3 rounded border-2 border-black flex justify-between items-center font-mono font-black text-xs">
                    <span className="uppercase text-gray-800">Grand Total Net Sales Velocity Across All {reportRows.length} Products:</span>
                    <span className="text-emerald-800 text-sm underline decoration-double">
                      Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            )
          ) : rType === 'loyalty' ? (
            <div className="space-y-6">
              {displayedRows.length === 0 ? (
                <div className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                  No customer financial invoice transactions discovered matching chosen selection criteria.
                </div>
              ) : (
                displayedRows.map((cust: any, cIdx: number) => {
                  const realCustNum = isPrinting || pageSize === 'all' ? cIdx + 1 : (currentPage - 1) * (pageSize as number) + cIdx + 1;
                  const custTotalBilled = Number(cust.total_billed || 0);
                  const custTotalPaid = Number(cust.total_paid || 0);
                  const custNetDue = Number(cust.net_balance || 0);

                  return (
                    <div key={cIdx} className="border border-black rounded-xs overflow-hidden shadow-xs">
                      {/* 👤 Customer Header Banner */}
                      <div className="bg-slate-800 text-white p-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-emerald-500 text-black px-2 py-0.5 rounded font-black text-[10px]">#{realCustNum}</span>
                          <span className="font-bold font-sans text-sm tracking-wide uppercase text-white">{cust.customer_name}</span>
                          <span className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded text-[10px]">Invoices: {cust.invoices_count}</span>
                        </div>
                        <div className="text-right text-[11px] font-black font-mono flex items-center gap-3">
                          <span className="text-indigo-300">Billed: Rs. {custTotalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span className="text-slate-500">|</span>
                          <span className="text-emerald-400">Paid: Rs. {custTotalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span className="text-slate-500">|</span>
                          <span className={`font-extrabold underline decoration-double ${custNetDue > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                            Balance: Rs. {custNetDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Customer Transactions Sub-table */}
                      <table className="w-full table-auto border-collapse text-[11px] font-sans text-left">
                        <thead>
                          <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9.5px]">
                            <th className="p-1.5 border border-black text-center w-10">S#</th>
                            <th className="p-1.5 border border-black text-center w-24">Date</th>
                            <th className="p-1.5 border border-black w-32">Invoice Ref #</th>
                            <th className="p-1.5 border border-black">Sales Officer</th>
                            <th className="p-1.5 border border-black">Narration / Particulars</th>
                            <th className="p-1.5 border border-black text-right w-28 text-indigo-900">Billed / Dr (PKR)</th>
                            <th className="p-1.5 border border-black text-right w-28 text-emerald-800">Paid / Cr (PKR)</th>
                            <th className="p-1.5 border border-black text-right w-28 pr-3">Balance Dues (PKR)</th>
                            <th className="p-1.5 border border-black text-center w-20">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(cust.transactions || []).map((tx: any, tIdx: number) => (
                            <tr key={tIdx} className="border-b border-gray-300 hover:bg-gray-50 font-mono text-xs">
                              <td className="p-1.5 border border-black text-center text-gray-500">{tIdx + 1}</td>
                              <td className="p-1.5 border border-black text-center text-gray-700">{tx.date}</td>
                              <td className="p-1.5 border border-black font-black text-primary uppercase">{tx.invoice_no}</td>
                              <td className="p-1.5 border border-black font-sans text-gray-600">{tx.salesman}</td>
                              <td className="p-1.5 border border-black font-sans text-gray-700">{tx.narration}</td>
                              <td className="p-1.5 border border-black text-right font-bold text-gray-900">
                                Rs. {Number(tx.billed_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-1.5 border border-black text-right text-emerald-700 font-bold">
                                Rs. {Number(tx.paid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-1.5 border border-black text-right pr-3 font-black text-slate-900">
                                Rs. {Number(tx.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-1.5 border border-black text-center font-sans">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  tx.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                                  tx.status === 'Partial' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {tx.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 border-t border-black font-black font-mono text-xs">
                            <td colSpan={5} className="p-1.5 border border-black text-right uppercase tracking-wider text-gray-600">
                              Subtotal ({cust.customer_name}):
                            </td>
                            <td className="p-1.5 border border-black text-right text-indigo-900 font-black">
                              Rs. {custTotalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-1.5 border border-black text-right text-emerald-800 font-black">
                              Rs. {custTotalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td colSpan={2} className="p-1.5 border border-black text-right pr-3 text-purple-900 font-black">
                              Rs. {custNetDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })
              )}

              {/* Grand Summary Across All Customers */}
              {reportRows.length > 0 && (
                <div className="space-y-2">
                  {!isPrinting && pageSize !== 'all' && (
                    <div className="bg-amber-50/80 p-3 rounded border border-amber-300 flex justify-between items-center font-mono font-bold text-xs text-amber-950">
                      <span className="uppercase text-amber-900">
                        Page {currentPage} Subtotal ({displayedRows.length} Customers On This Page):
                      </span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-indigo-900 font-bold">Billed: Rs. {displayedRows.reduce((s: number, c: any) => s + Number(c.total_billed || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-emerald-800 font-bold">Paid: Rs. {displayedRows.reduce((s: number, c: any) => s + Number(c.total_paid || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-purple-900 font-black">Page Balance: Rs. {displayedRows.reduce((s: number, c: any) => s + Number(c.net_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-gray-100 p-3.5 rounded border-2 border-black flex justify-between items-center font-mono font-black text-xs">
                    <span className="uppercase text-gray-900">
                      Grand Total Ledger Statement (All {reportRows.length} Customers):
                    </span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-indigo-950 font-black">Total Billed: Rs. {reportRows.reduce((s: number, c: any) => s + Number(c.total_billed || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <span className="text-emerald-800 font-black">Total Paid: Rs. {reportRows.reduce((s: number, c: any) => s + Number(c.total_paid || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <span className="text-purple-800 text-sm underline decoration-double">
                        Grand Net Dues: Rs. {reportRows.reduce((s: number, c: any) => s + Number(c.net_balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : rType === 'customer-sales' ? (
            activeViewMode === 'summary' ? (
              // ── 📊 SUMMARY VIEW TABLE (1 ROW / CUSTOMER) ──
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans antialiased text-left print:w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9.5px]">
                    <th className="p-1.5 border border-black text-center w-10">S#</th>
                    <th className="p-1.5 border border-black">Customer / Purchasing Account</th>
                    <th className="p-1.5 border border-black text-center w-24">Inv / Rtn</th>
                    <th className="p-1.5 border border-black text-right w-24">Gross Vol</th>
                    <th className="p-1.5 border border-black text-right w-20">Ret Vol</th>
                    <th className="p-1.5 border border-black text-right w-24">Net Vol</th>
                    <th className="p-1.5 border border-black text-right w-28">Gross Sales (PKR)</th>
                    <th className="p-1.5 border border-black text-right w-28 text-rose-800">Returns (PKR)</th>
                    <th className="p-1.5 border border-black text-right w-32">Net Revenue (PKR)</th>
                    <th className="p-1.5 border border-black text-center w-20">% Share</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                        No customer sales breakdown records discovered matching chosen selection criteria.
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((cust, idx) => {
                      const realIndex = isPrinting || pageSize === 'all' ? idx + 1 : (currentPage - 1) * (pageSize as number) + idx + 1;
                      const grossVol = Number(cust.gross_units || 0);
                      const retVol = Number(cust.returned_units || 0);
                      const netVol = Number(cust.net_units || grossVol - retVol);
                      const grossSales = Number(cust.gross_sales || 0);
                      const retAmt = Number(cust.return_amount || 0);
                      const netRev = Number(cust.net_sales || grossSales - retAmt);

                      return (
                        <tr key={idx} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs">
                          <td className="p-1.5 border border-black text-center text-gray-600">{realIndex}</td>
                          <td className="p-1.5 border border-black font-sans font-bold text-black">{cust.customer_name}</td>
                          <td className="p-1.5 border border-black text-center font-bold text-indigo-700">
                            {cust.invoices_count} <span className="text-gray-400 font-normal">/</span> <span className={cust.returns_count > 0 ? 'text-rose-700' : 'text-gray-400'}>{cust.returns_count}</span>
                          </td>
                          <td className="p-1.5 border border-black text-right text-gray-800">
                            {grossVol.toLocaleString()}
                          </td>
                          <td className="p-1.5 border border-black text-right text-rose-700">
                            {retVol > 0 ? `-${retVol.toLocaleString()}` : '0'}
                          </td>
                          <td className="p-1.5 border border-black text-right font-bold text-emerald-700">
                            {netVol.toLocaleString()}
                          </td>
                          <td className="p-1.5 border border-black text-right text-gray-800">
                            Rs. {grossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 border border-black text-right text-rose-700 font-bold">
                            {retAmt > 0 ? `- Rs. ${retAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Rs. 0.00'}
                          </td>
                          <td className="p-1.5 border border-black text-right text-purple-900 font-black">
                            Rs. {netRev.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 border border-black text-center text-slate-800 font-bold">
                            {Number(cust.contribution_pct || 0).toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  {/* 📄 Page Subtotal Row */}
                  {!isPrinting && pageSize !== 'all' && (
                    <tr className="bg-amber-50/80 border-t border-black font-bold font-mono text-xs text-amber-950">
                      <td colSpan={2} className="p-2 border border-black text-right uppercase tracking-wider text-amber-900">
                        Page {currentPage} Subtotal ({displayedRows.length} Customers):
                      </td>
                      <td className="p-2 border border-black text-center text-indigo-900 font-bold">
                        {displayedRows.reduce((sum, r) => sum + Number(r.invoices_count || 0), 0)} / {displayedRows.reduce((sum, r) => sum + Number(r.returns_count || 0), 0)}
                      </td>
                      <td className="p-2 border border-black text-right text-gray-800 whitespace-nowrap">
                        {displayedRows.reduce((sum, r) => sum + Number(r.gross_units || 0), 0).toLocaleString()}
                      </td>
                      <td className="p-2 border border-black text-right text-rose-700 whitespace-nowrap">
                        -{displayedRows.reduce((sum, r) => sum + Number(r.returned_units || 0), 0).toLocaleString()}
                      </td>
                      <td className="p-2 border border-black text-right text-emerald-800 font-bold whitespace-nowrap">
                        {displayedRows.reduce((sum, r) => sum + Number(r.net_units || 0), 0).toLocaleString()}
                      </td>
                      <td className="p-2 border border-black text-right text-gray-900 whitespace-nowrap">
                        Rs. {displayedRows.reduce((sum, r) => sum + Number(r.gross_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-right text-rose-800 font-bold whitespace-nowrap">
                        - Rs. {displayedRows.reduce((sum, r) => sum + Number(r.return_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-right text-purple-900 font-black whitespace-nowrap">
                        Rs. {displayedRows.reduce((sum, r) => sum + Number(r.net_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-center text-[10px] font-bold text-amber-800">
                        {displayedRows.reduce((sum, r) => sum + Number(r.contribution_pct || 0), 0).toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  {/* 📊 Overall Grand Totals Row */}
                  <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                    <td colSpan={2} className="p-2 border border-black text-right uppercase tracking-wider text-gray-900">
                      Grand Total Summary (All {reportRows.length} Customers):
                    </td>
                    <td className="p-2 border border-black text-center text-indigo-900">
                      {totalInvoicesCount} / {totalReturnsCount}
                    </td>
                    <td className="p-2 border border-black text-right text-gray-900 font-bold whitespace-nowrap">
                      {totalSoldUnits.toLocaleString()}
                    </td>
                    <td className="p-2 border border-black text-right text-rose-700 font-bold whitespace-nowrap">
                      -{totalReturnedUnits.toLocaleString()}
                    </td>
                    <td className="p-2 border border-black text-right text-emerald-800 font-bold whitespace-nowrap">
                      {totalNetUnits.toLocaleString()}
                    </td>
                    <td className="p-2 border border-black text-right text-gray-900 font-bold whitespace-nowrap">
                      Rs. {totalCustomerGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-right text-rose-700 font-bold whitespace-nowrap">
                      - Rs. {totalReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-right text-purple-900 text-sm font-black underline decoration-double whitespace-nowrap">
                      Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-center text-[10px] text-gray-600">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              // ── 📑 DETAILED VIEW TABLE (GROUPED CUSTOMER INVOICE BREAKDOWN) ──
              <div className="space-y-6">
                {displayedRows.length === 0 ? (
                  <div className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                    No customer sales breakdown records discovered matching chosen selection criteria.
                  </div>
                ) : (
                  displayedRows.map((cust: any, cIdx: number) => {
                    const realCustomerNum = isPrinting || pageSize === 'all' ? cIdx + 1 : (currentPage - 1) * (pageSize as number) + cIdx + 1;
                    const custGrossSales = Number(cust.gross_sales || 0);
                    const custReturnAmount = Number(cust.return_amount || 0);
                    const custNetRevenue = Number(cust.net_sales || custGrossSales - custReturnAmount);
                    const custGrossUnits = Number(cust.gross_units || 0);
                    const custRetUnits = Number(cust.returned_units || 0);
                    const custNetUnits = Number(cust.net_units || custGrossUnits - custRetUnits);

                    // Combine and sort all transactions
                    const combinedTx = [
                      ...(cust.transactions || []),
                      ...(cust.return_transactions || [])
                    ].sort((a: any, b: any) => {
                      const dateA = a.sale_date || a.return_date || a.created_at || '';
                      const dateB = b.sale_date || b.return_date || b.created_at || '';
                      return dateA.localeCompare(dateB);
                    });

                    return (
                      <div key={cIdx} className="border border-black rounded-xs overflow-hidden shadow-xs">
                        {/* 👤 Customer Header Banner */}
                        <div className="bg-slate-800 text-white p-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-emerald-500 text-black px-2 py-0.5 rounded font-black text-[10px]">#{realCustomerNum}</span>
                            <span className="font-bold font-sans text-sm tracking-wide uppercase text-white">{cust.customer_name}</span>
                            <span className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded text-[10px]">Invoices: {cust.invoices_count}</span>
                            <span className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded text-[10px]">Returns: {cust.returns_count}</span>
                            <span className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded text-[10px]">Net Volume: {custNetUnits.toLocaleString()} Units</span>
                            <span className="text-slate-400 text-[10px]">Share: {Number(cust.contribution_pct || 0).toFixed(1)}%</span>
                          </div>
                          <div className="text-right text-[11px] font-black font-mono flex items-center gap-3">
                            <span className="text-emerald-400">Gross: Rs. {custGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-slate-500">|</span>
                            <span className="text-rose-400">Returns: - Rs. {custReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-slate-500">|</span>
                            <span className="text-purple-300 font-extrabold underline decoration-double">Net: Rs. {custNetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>

                        {/* Customer Transactions Sub-table */}
                        <table className="w-full table-auto border-collapse text-[11px] font-sans text-left">
                          <thead>
                            <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9.5px]">
                              <th className="p-1.5 border border-black text-center w-10">S#</th>
                              <th className="p-1.5 border border-black text-center w-24">Date</th>
                              <th className="p-1.5 border border-black w-28">Doc / Ref #</th>
                              <th className="p-1.5 border border-black">Sales Officer</th>
                              <th className="p-1.5 border border-black">Product Line Items</th>
                              <th className="p-1.5 border border-black text-center w-24">Doc Type / Term</th>
                              <th className="p-1.5 border border-black text-right w-28 pr-2">Freight Charges</th>
                              <th className="p-1.5 border border-black text-right w-28 pr-3">Amount (PKR)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {combinedTx.map((row: any, tIdx: number) => {
                              const isReturn = row.record_type === 'return';
                              const displayDocPrefixId = isReturn
                                ? (row.return_no || `RTN-${String(row.id).padStart(4, '0')}`)
                                : (row.invoice_no || `INV-${String(row.id).padStart(4, '0')}`);
                              const processingDateDisplay = row.sale_date || row.return_date || String(row.created_at || '').split('T')[0];
                              const itemDetails = extractItemDetails(row);
                              const itemNames = extractItemNames(row);
                              const isCash = String(row.payment_term || '').toLowerCase() === 'cash';
                              const rowAmount = Number(isReturn ? (row.return_amount || row.total_amount || 0) : (row.total_amount || 0));
                              const rowFreight = isReturn ? 0 : (Number(row.additional_charges || 0) + Number(row.transport_charges || 0));

                              return (
                                <tr key={tIdx} className={`border-b border-gray-300 hover:bg-gray-50 font-mono text-xs ${isReturn ? 'bg-rose-50/40' : ''}`}>
                                  <td className="p-1.5 border border-black text-center text-gray-500 align-top">{tIdx + 1}</td>
                                  <td className="p-1.5 border border-black text-center text-gray-700 align-top">{processingDateDisplay}</td>
                                  <td className="p-1.5 border border-black font-black uppercase align-top">
                                    {isReturn ? (
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="text-rose-700">{displayDocPrefixId}</span>
                                        <span className="bg-rose-100 text-rose-800 text-[9px] px-1 py-0.2 rounded font-bold border border-rose-300">RETURN</span>
                                      </div>
                                    ) : (
                                      <span className="text-primary">{displayDocPrefixId}</span>
                                    )}
                                  </td>
                                  <td className="p-1.5 border border-black font-sans font-medium text-black align-top">{row.salesman || 'Direct'}</td>
                                  <td className="p-1.5 border border-black font-sans text-gray-800 text-[11px] align-top">
                                    {itemDetails.length > 0 ? (
                                      <div className="flex flex-col gap-1 py-0.5">
                                        {itemDetails.map((item, idx) => (
                                          <div key={idx} className="flex items-center text-[11px] whitespace-nowrap">
                                            <span className="font-semibold text-black">{item.name}</span>
                                            <span className={isReturn ? 'text-rose-600 font-black text-sm px-1.5 font-mono' : 'text-emerald-700 font-black text-sm px-1.5 font-mono'}>|</span>
                                            <span className={isReturn ? 'text-rose-800 font-mono font-bold' : 'text-emerald-900 font-mono font-bold'}>{item.qty} {item.uom}</span>
                                            <span className={isReturn ? 'text-rose-600 font-black text-sm px-1.5 font-mono' : 'text-emerald-700 font-black text-sm px-1.5 font-mono'}>|</span>
                                            <span className="text-gray-900 font-mono font-bold">@ Rs. {Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : itemNames.length > 0 ? (
                                      itemNames.map((name: string, i: number) => (
                                        <React.Fragment key={i}>
                                          {i > 0 && <span className="text-emerald-700 font-black text-sm px-1.5 font-mono">|</span>}
                                          <span>{name}</span>
                                        </React.Fragment>
                                      ))
                                    ) : (
                                      <span className="text-gray-400 italic">No Items</span>
                                    )}
                                  </td>
                                  <td className="p-1.5 border border-black text-center align-top">
                                    {isReturn ? (
                                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-300">
                                        Return Credit
                                      </span>
                                    ) : (
                                      <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                                        isCash ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-blue-100 text-blue-800 border border-blue-300'
                                      }`}>
                                        {row.payment_term || 'Credit'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-1.5 border border-black text-right pr-2 font-mono align-top">
                                    {rowFreight > 0 ? (
                                      <span className="text-blue-700 font-bold">Rs. {rowFreight.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    ) : (
                                      <span className="text-gray-400 font-normal">Rs. 0.00</span>
                                    )}
                                  </td>
                                  <td className={`p-1.5 border border-black text-right pr-3 font-black align-top ${isReturn ? 'text-rose-700' : 'text-emerald-700'}`}>
                                    {isReturn ? `- Rs. ${rowAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `Rs. ${rowAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50 border-t border-black font-black font-mono text-xs">
                              <td colSpan={4} className="p-1.5 border border-black text-right uppercase tracking-wider text-gray-600">
                                Subtotal ({cust.customer_name} : {cust.invoices_count} Inv / {cust.returns_count} Rtn):
                              </td>
                              <td className="p-1.5 border border-black text-center font-bold text-emerald-800">
                                Net Vol: {custNetUnits.toLocaleString()} Units <span className="text-[10px] text-gray-500 font-normal">({custGrossUnits.toLocaleString()} - {custRetUnits.toLocaleString()})</span>
                              </td>
                              <td colSpan={2} className="p-1.5 border border-black text-right text-[10px] font-bold text-gray-700">
                                Gross: Rs. {custGrossSales.toLocaleString()} | Ret: - Rs. {custReturnAmount.toLocaleString()}
                              </td>
                              <td className="p-1.5 border border-black text-right pr-3 text-purple-900 font-black">
                                Rs. {custNetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })
                )}

                {/* Grand Summary Across All Customers */}
                {reportRows.length > 0 && (
                  <div className="space-y-2">
                    {!isPrinting && pageSize !== 'all' && (
                      <div className="bg-amber-50/80 p-3 rounded border border-amber-300 flex justify-between items-center font-mono font-bold text-xs text-amber-950">
                        <span className="uppercase text-amber-900">
                          Page {currentPage} Subtotal ({displayedRows.length} Customers On This Page):
                        </span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-indigo-900">Inv: {displayedRows.reduce((s: number, r: any) => s + Number(r.invoices_count || 0), 0)} | Rtn: {displayedRows.reduce((s: number, r: any) => s + Number(r.returns_count || 0), 0)}</span>
                          <span className="text-emerald-800 font-bold">Net Vol: {displayedRows.reduce((s: number, r: any) => s + Number(r.net_units || 0), 0).toLocaleString()}</span>
                          <span className="text-emerald-800">Gross: Rs. {displayedRows.reduce((s: number, r: any) => s + Number(r.gross_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span className="text-rose-700">Ret: - Rs. {displayedRows.reduce((s: number, r: any) => s + Number(r.return_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span className="text-purple-900 font-black">Net: Rs. {displayedRows.reduce((s: number, r: any) => s + Number(r.net_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}

                    <div className="bg-gray-100 p-3.5 rounded border-2 border-black flex justify-between items-center font-mono font-black text-xs">
                      <span className="uppercase text-gray-900">
                        Grand Total Customer Breakdown Summary (All {reportRows.length} Customers):
                      </span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-indigo-900">Invoices: {totalInvoicesCount} | Returns: {totalReturnsCount}</span>
                        <span className="text-emerald-800 font-bold">Net Volume: {totalNetUnits.toLocaleString()} Units</span>
                        <span className="text-gray-900">Gross: Rs. {totalCustomerGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-rose-700">Returns: - Rs. {totalReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-purple-800 text-sm underline decoration-double">
                          Grand Net Revenue: Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : rType === 'sale' ? (
            activeViewMode === 'summary' ? (
              // ── 📊 SUMMARY VIEW TABLE (1 ROW / SALESMAN) ──
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans antialiased text-left print:w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                    <th className="p-1.5 border border-black text-center w-10">S#</th>
                    <th className="p-1.5 border border-black">Sales Officer / Salesman Name</th>
                    <th className="p-1.5 border border-black text-center">Invoices / Returns</th>
                    <th className="p-1.5 border border-black text-center">Unique Clients</th>
                    <th className="p-1.5 border border-black text-right">Cash Sales (PKR)</th>
                    <th className="p-1.5 border border-black text-right">Credit Sales (PKR)</th>
                    <th className="p-1.5 border border-black text-right">Gross Sales (PKR)</th>
                    <th className="p-1.5 border border-black text-right text-rose-700">Returns (Dr) (PKR)</th>
                    <th className="p-1.5 border border-black text-right text-purple-900">Net Realized Revenue (PKR)</th>
                    <th className="p-1.5 border border-black text-center w-24">% Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                        No commercial sales records discovered matching chosen selection criteria.
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((sm, idx) => {
                      const realIndex = isPrinting || pageSize === 'all' ? idx + 1 : (currentPage - 1) * (pageSize as number) + idx + 1;
                      return (
                        <tr key={idx} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs">
                          <td className="p-1.5 border border-black text-center text-gray-600">{realIndex}</td>
                          <td className="p-1.5 border border-black font-sans font-bold text-black">{sm.salesman}</td>
                          <td className="p-1.5 border border-black text-center font-bold text-indigo-700">
                            {sm.invoices_count} / {sm.returns_count}
                          </td>
                          <td className="p-1.5 border border-black text-center text-gray-700 font-bold">{sm.unique_customers_count}</td>
                          <td className="p-1.5 border border-black text-right text-emerald-700 font-bold">
                            Rs. {Number(sm.cash_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 border border-black text-right text-blue-700 font-bold">
                            Rs. {Number(sm.credit_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 border border-black text-right text-gray-900 font-bold">
                            Rs. {Number(sm.gross_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 border border-black text-right text-rose-700 font-bold">
                            - Rs. {Number(sm.return_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 border border-black text-right text-purple-800 font-black">
                            Rs. {Number(sm.net_sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 border border-black text-center text-slate-800 font-bold">
                            {Number(sm.contribution_pct || 0).toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  {/* 📄 Page Subtotal Row */}
                  {!isPrinting && pageSize !== 'all' && (
                    <tr className="bg-amber-50/80 border-t border-black font-bold font-mono text-xs text-amber-950">
                      <td colSpan={2} className="p-2 border border-black text-right uppercase tracking-wider text-amber-900">
                        Page {currentPage} Subtotal ({displayedRows.length} Sales Officers):
                      </td>
                      <td className="p-2 border border-black text-center text-indigo-900 font-bold">
                        {displayedRows.reduce((sum, r) => sum + Number(r.invoices_count || 0), 0)} / {displayedRows.reduce((sum, r) => sum + Number(r.returns_count || 0), 0)}
                      </td>
                      <td className="p-2 border border-black text-center text-gray-700 font-bold">
                        {displayedRows.reduce((sum, r) => sum + Number(r.unique_customers_count || 0), 0)}
                      </td>
                      <td className="p-2 border border-black text-right text-emerald-800 font-bold whitespace-nowrap">
                        Rs. {displayedRows.reduce((sum, r) => sum + Number(r.cash_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-right text-blue-800 font-bold whitespace-nowrap">
                        Rs. {displayedRows.reduce((sum, r) => sum + Number(r.credit_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-right text-gray-900 font-bold whitespace-nowrap">
                        Rs. {displayedRows.reduce((sum, r) => sum + Number(r.gross_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-right text-rose-700 font-bold whitespace-nowrap">
                        - Rs. {displayedRows.reduce((sum, r) => sum + Number(r.return_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-right text-purple-900 font-black whitespace-nowrap">
                        Rs. {displayedRows.reduce((sum, r) => sum + Number(r.net_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-center text-[10px] font-bold text-amber-800">
                        {displayedRows.reduce((sum, r) => sum + Number(r.contribution_pct || 0), 0).toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  {/* 📊 Overall Grand Totals Row */}
                  <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                    <td colSpan={2} className="p-2 border border-black text-right uppercase tracking-wider text-gray-900">
                      Grand Total Summary (All {reportRows.length} Sales Officers):
                    </td>
                    <td className="p-2 border border-black text-center text-indigo-900 font-bold">
                      {totalInvoicesCount} / {totalReturnsCount}
                    </td>
                    <td className="p-2 border border-black text-center text-gray-800">
                      {reportRows.reduce((sum, r) => sum + Number(r.unique_customers_count || 0), 0)}
                    </td>
                    <td className="p-2 border border-black text-right text-emerald-800 whitespace-nowrap">
                      Rs. {cashAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-right text-blue-800 whitespace-nowrap">
                      Rs. {creditAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-right text-gray-900 font-bold whitespace-nowrap">
                      Rs. {totalCustomerGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-right text-rose-700 font-bold whitespace-nowrap">
                      - Rs. {totalReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-right text-purple-900 text-sm font-black underline decoration-double whitespace-nowrap">
                      Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-center text-[10px] text-gray-600">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              // ── 📑 DETAILED VIEW TABLE (GROUPED SALESMAN INVOICE BREAKDOWN) ──
              <div className="space-y-6">
                {displayedRows.length === 0 ? (
                  <div className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                    No commercial sales records discovered matching chosen selection criteria.
                  </div>
                ) : (
                  displayedRows.map((sm: any, sIdx: number) => {
                    const realSalesmanNum = isPrinting || pageSize === 'all' ? sIdx + 1 : (currentPage - 1) * (pageSize as number) + sIdx + 1;
                    const smGrossSales = Number(sm.gross_sales || 0);
                    const smReturnAmount = Number(sm.return_amount || sm.returned_amount || 0);
                    const smNetRevenue = Number(sm.net_sales || smGrossSales - smReturnAmount);
                    const smCashAmount = Number(sm.cash_sales || 0);
                    const smCreditAmount = Number(sm.credit_sales || 0);

                    const invList = (sm.transactions || []).slice().sort((a: any, b: any) => {
                      const dateA = a.sale_date || a.created_at || '';
                      const dateB = b.sale_date || b.created_at || '';
                      return dateA.localeCompare(dateB);
                    });

                    const retList = (sm.return_transactions || []).slice().sort((a: any, b: any) => {
                      const dateA = a.return_date || a.created_at || '';
                      const dateB = b.return_date || b.created_at || '';
                      return dateA.localeCompare(dateB);
                    });

                    return (
                      <div key={sIdx} className="border-2 border-black rounded-xs overflow-hidden shadow-xs">
                        {/* 👔 Salesman Master Header Banner */}
                        <div className="bg-slate-900 text-white p-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-emerald-500 text-black px-2 py-0.5 rounded font-black text-[10px]">#{realSalesmanNum}</span>
                            <span className="font-bold font-sans text-sm tracking-wide uppercase text-white">{sm.salesman}</span>
                            <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px] border border-slate-700">Invoices: {sm.invoices_count}</span>
                            <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px] border border-slate-700">Returns: {sm.returns_count}</span>
                            <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px] border border-slate-700">Unique Clients: {sm.unique_customers_count}</span>
                            <span className="text-slate-400 text-[10px]">Share: {Number(sm.contribution_pct || 0).toFixed(1)}%</span>
                          </div>
                          <div className="text-right text-[11px] font-black font-mono flex items-center gap-3">
                            <span className="text-emerald-400">Gross: Rs. {smGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-slate-500">|</span>
                            <span className="text-rose-400">Returns: - Rs. {smReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-slate-500">|</span>
                            <span className="text-amber-300 font-extrabold underline decoration-double">Net Realized: Rs. {smNetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>

                        {/* ══════════════════════════════════════════════════ */}
                        {/* 📑 SUB-SECTION 1: SALES INVOICES HEADER & TABLE   */}
                        {/* ══════════════════════════════════════════════════ */}
                        <div className="bg-slate-100 border-b border-black px-3 py-1.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 text-[11px] font-mono font-bold text-slate-900">
                          <span className="uppercase text-emerald-900 font-black flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block shadow-xs"></span>
                            1. Sales Invoices Register ({invList.length} Invoices)
                          </span>
                          <div className="flex items-center gap-3 text-[10px]">
                            <span>Cash Sales: <b className="text-emerald-700">Rs. {smCashAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></span>
                            <span className="text-gray-400">|</span>
                            <span>Credit Sales: <b className="text-blue-700">Rs. {smCreditAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></span>
                            <span className="text-gray-400">|</span>
                            <span>Gross Invoiced: <b className="text-slate-900 font-black">Rs. {smGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></span>
                          </div>
                        </div>

                        <table className="w-full table-auto border-collapse text-[11px] font-sans text-left">
                          <thead>
                            <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9.5px]">
                              <th className="p-1.5 border border-black text-center w-10">S#</th>
                              <th className="p-1.5 border border-black text-center w-24">Date</th>
                              <th className="p-1.5 border border-black w-28">Invoice #</th>
                              <th className="p-1.5 border border-black">Customer Name</th>
                              <th className="p-1.5 border border-black">Products / Line Items</th>
                              <th className="p-1.5 border border-black text-center w-20">Term</th>
                              <th className="p-1.5 border border-black w-28">Carrier Fleet</th>
                              <th className="p-1.5 border border-black text-right w-28 pr-3">Gross Amount (PKR)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invList.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="p-3 text-center text-gray-400 italic font-mono border border-black">
                                  No sales invoices booked for this salesman within chosen duration.
                                </td>
                              </tr>
                            ) : (
                              invList.map((row: any, tIdx: number) => {
                                const displayDocPrefixId = row.invoice_no || `INV-${String(row.id).padStart(4, '0')}`;
                                const processingDateDisplay = row.sale_date || String(row.created_at || '').split('T')[0];
                                const itemDetails = extractItemDetails(row);
                                const itemNames = extractItemNames(row);
                                const isCash = String(row.payment_term || '').toLowerCase() === 'cash';
                                const rowAmount = Number(row.total_amount || 0);

                                return (
                                  <tr key={tIdx} className="border-b border-gray-300 hover:bg-gray-50 font-mono text-xs">
                                    <td className="p-1.5 border border-black text-center text-gray-500 align-top">{tIdx + 1}</td>
                                    <td className="p-1.5 border border-black text-center text-gray-700 align-top">{processingDateDisplay}</td>
                                    <td className="p-1.5 border border-black font-black uppercase align-top text-primary">{displayDocPrefixId}</td>
                                    <td className="p-1.5 border border-black font-sans font-medium text-black align-top">{row.customer_name || 'Counter Retail Buyer'}</td>
                                    <td className="p-1.5 border border-black font-sans text-gray-800 text-[11px] align-top">
                                      {itemDetails.length > 0 ? (
                                        <div className="flex flex-col gap-1 py-0.5">
                                          {itemDetails.map((item, idx) => (
                                            <div key={idx} className="flex items-center text-[11px] whitespace-nowrap">
                                              <span className="font-semibold text-black">{item.name}</span>
                                              <span className="text-emerald-700 font-black text-sm px-1.5 font-mono">|</span>
                                              <span className="text-emerald-900 font-mono font-bold">{item.qty} {item.uom}</span>
                                              <span className="text-emerald-700 font-black text-sm px-1.5 font-mono">|</span>
                                              <span className="text-gray-900 font-mono font-bold">@ Rs. {Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : itemNames.length > 0 ? (
                                        itemNames.map((name: string, i: number) => (
                                          <React.Fragment key={i}>
                                            {i > 0 && <span className="text-emerald-700 font-black text-sm px-1.5 font-mono">|</span>}
                                            <span>{name}</span>
                                          </React.Fragment>
                                        ))
                                      ) : (
                                        <span className="text-gray-400 italic">No Items</span>
                                      )}
                                    </td>
                                    <td className="p-1.5 border border-black text-center align-top">
                                      <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                                        isCash ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-blue-100 text-blue-800 border border-blue-300'
                                      }`}>
                                        {row.payment_term || 'Credit'}
                                      </span>
                                    </td>
                                    <td className="p-1.5 border border-black font-sans text-purple-700 font-bold align-top">{row.transport_name || 'Self Pick'}</td>
                                    <td className="p-1.5 border border-black text-right pr-3 font-black text-emerald-700 align-top">
                                      Rs. {rowAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          {invList.length > 0 && (
                            <tfoot>
                              <tr className="bg-emerald-50/70 border-t border-black font-black font-mono text-xs">
                                <td colSpan={5} className="p-1.5 border border-black text-right uppercase tracking-wider text-emerald-950">
                                  Subtotal Sales Invoiced ({sm.salesman} : {invList.length} Invoices):
                                </td>
                                <td colSpan={2} className="p-1.5 border border-black text-right text-[10px] font-bold text-gray-700">
                                  Cash: Rs. {smCashAmount.toLocaleString()} | Credit: Rs. {smCreditAmount.toLocaleString()}
                                </td>
                                <td className="p-1.5 border border-black text-right pr-3 text-emerald-900 font-black">
                                  Rs. {smGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>

                        {/* ══════════════════════════════════════════════════ */}
                        {/* 🔄 SUB-SECTION 2: SALES RETURNS HEADER & TABLE     */}
                        {/* ══════════════════════════════════════════════════ */}
                        {retList.length > 0 && (
                          <>
                            <div className="bg-rose-100 border-t-2 border-b border-black px-3 py-1.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 text-[11px] font-mono font-bold text-rose-950">
                              <span className="uppercase text-rose-900 font-black flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block shadow-xs"></span>
                                2. Sales Returns & Credit Adjustments ({retList.length} Return Notes)
                              </span>
                              <div className="flex items-center gap-3 text-[10px]">
                                <span>Total Return Deductions (Dr): <b className="text-rose-800 font-black">- Rs. {smReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></span>
                              </div>
                            </div>

                            <table className="w-full table-auto border-collapse text-[11px] font-sans text-left">
                              <thead>
                                <tr className="bg-rose-50/80 border-b border-black font-black uppercase text-rose-950 font-mono text-[9.5px]">
                                  <th className="p-1.5 border border-black text-center w-10">S#</th>
                                  <th className="p-1.5 border border-black text-center w-24">Date</th>
                                  <th className="p-1.5 border border-black w-28">Return Ref #</th>
                                  <th className="p-1.5 border border-black">Customer Name</th>
                                  <th className="p-1.5 border border-black">Returned Products / Remarks</th>
                                  <th className="p-1.5 border border-black text-center w-24">Doc Type</th>
                                  <th className="p-1.5 border border-black w-28">Restocked Wh</th>
                                  <th className="p-1.5 border border-black text-right w-28 pr-3 text-rose-900">Return Amount (PKR)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {retList.map((row: any, rIdx: number) => {
                                  const displayDocPrefixId = row.return_no || `RTN-${String(row.id).padStart(4, '0')}`;
                                  const processingDateDisplay = row.return_date || String(row.created_at || '').split('T')[0];
                                  const itemDetails = extractItemDetails(row);
                                  const itemNames = extractItemNames(row);
                                  const rowAmount = Number(row.return_amount || row.total_amount || 0);

                                  return (
                                    <tr key={rIdx} className="border-b border-gray-300 hover:bg-rose-50/40 bg-rose-50/20 font-mono text-xs">
                                      <td className="p-1.5 border border-black text-center text-gray-500 align-top">{rIdx + 1}</td>
                                      <td className="p-1.5 border border-black text-center text-gray-700 align-top">{processingDateDisplay}</td>
                                      <td className="p-1.5 border border-black font-black uppercase align-top">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <span className="text-rose-700">{displayDocPrefixId}</span>
                                          <span className="bg-rose-100 text-rose-800 text-[9px] px-1 py-0.2 rounded font-bold border border-rose-300">RETURN</span>
                                        </div>
                                      </td>
                                      <td className="p-1.5 border border-black font-sans font-medium text-black align-top">{row.customer_name || 'Counter Retail Buyer'}</td>
                                      <td className="p-1.5 border border-black font-sans text-gray-800 text-[11px] align-top">
                                        {itemDetails.length > 0 ? (
                                          <div className="flex flex-col gap-1 py-0.5">
                                            {itemDetails.map((item, idx) => (
                                              <div key={idx} className="flex items-center text-[11px] whitespace-nowrap">
                                                <span className="font-semibold text-black">{item.name}</span>
                                                <span className="text-rose-600 font-black text-sm px-1.5 font-mono">|</span>
                                                <span className="text-rose-800 font-mono font-bold">{item.qty} {item.uom}</span>
                                                <span className="text-rose-600 font-black text-sm px-1.5 font-mono">|</span>
                                                <span className="text-gray-900 font-mono font-bold">@ Rs. {Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : itemNames.length > 0 ? (
                                          itemNames.map((name: string, i: number) => (
                                            <React.Fragment key={i}>
                                              {i > 0 && <span className="text-rose-700 font-black text-sm px-1.5 font-mono">|</span>}
                                              <span>{name}</span>
                                            </React.Fragment>
                                          ))
                                        ) : (
                                          <span className="text-gray-600 italic">{row.reason || row.remarks || 'Stock Return'}</span>
                                        )}
                                      </td>
                                      <td className="p-1.5 border border-black text-center align-top">
                                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-300">
                                          Return Credit
                                        </span>
                                      </td>
                                      <td className="p-1.5 border border-black font-sans text-gray-700 font-bold align-top">{row.dispatch_warehouse || row.transport_name || 'Warehouse Return'}</td>
                                      <td className="p-1.5 border border-black text-right pr-3 font-black text-rose-700 align-top">
                                        - Rs. {rowAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-rose-50/90 border-t border-black font-black font-mono text-xs">
                                  <td colSpan={5} className="p-1.5 border border-black text-right uppercase tracking-wider text-rose-950">
                                    Subtotal Sales Returns ({sm.salesman} : {retList.length} Notes):
                                  </td>
                                  <td colSpan={2} className="p-1.5 border border-black text-right text-[10px] font-bold text-rose-900">
                                    Total Return Adjustments:
                                  </td>
                                  <td className="p-1.5 border border-black text-right pr-3 text-rose-900 font-black">
                                    - Rs. {smReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </>
                        )}

                        {/* ══════════════════════════════════════════════════ */}
                        {/* 🎯 FINAL SALESMAN NET RECONCILIATION BAR           */}
                        {/* ══════════════════════════════════════════════════ */}
                        <div className="bg-slate-900 text-white p-2.5 border-t-2 border-black flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs font-mono font-bold">
                          <span className="uppercase text-slate-300 tracking-wider">
                            Net Realized Performance for <b className="text-emerald-400 font-sans">{sm.salesman}</b>:
                          </span>
                          <div className="flex items-center gap-3 text-xs flex-wrap">
                            <span className="text-emerald-300">Gross: Rs. {smGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-slate-500">-</span>
                            <span className="text-rose-300">Returns: Rs. {smReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-slate-500">=</span>
                            <span className="text-amber-300 font-black text-sm underline decoration-double">
                              Net Commercial Revenue: Rs. {smNetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Grand Summary Across All Salesmen */}
                {reportRows.length > 0 && (
                  <div className="space-y-2">
                    {!isPrinting && pageSize !== 'all' && (
                      <div className="bg-amber-50/80 p-3 rounded border border-amber-300 flex justify-between items-center font-mono font-bold text-xs text-amber-950">
                        <span className="uppercase text-amber-900">
                          Page {currentPage} Subtotal ({displayedRows.length} Sales Officers On This Page):
                        </span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-indigo-900">Inv: {displayedRows.reduce((s: number, r: any) => s + Number(r.invoices_count || 0), 0)} | Rtn: {displayedRows.reduce((s: number, r: any) => s + Number(r.returns_count || 0), 0)}</span>
                          <span className="text-emerald-800">Gross: Rs. {displayedRows.reduce((s: number, r: any) => s + Number(r.gross_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span className="text-rose-700">Ret: - Rs. {displayedRows.reduce((s: number, r: any) => s + Number(r.return_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          <span className="text-purple-900 font-black">Net: Rs. {displayedRows.reduce((s: number, r: any) => s + Number(r.net_sales || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}

                    <div className="bg-gray-100 p-3.5 rounded border-2 border-black flex justify-between items-center font-mono font-black text-xs">
                      <span className="uppercase text-gray-900">
                        Grand Total Commercial Sales Summary (All {reportRows.length} Sales Officers):
                      </span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-indigo-900">Invoices: {totalInvoicesCount} | Returns: {totalReturnsCount}</span>
                        <span className="text-gray-900">Gross: Rs. {totalCustomerGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-rose-700">Returns: - Rs. {totalReturnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-purple-800 text-sm underline decoration-double">
                          Grand Net Revenue: Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : rType === 'return' ? (
            activeViewMode === 'summary' ? (
              // ── 📊 SUMMARY VIEW TABLE (1 ROW / CUSTOMER) ──
              <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans antialiased text-left print:w-full">
                <thead>
                  <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                    <th className="p-1.5 border border-black text-center w-10">S#</th>
                    <th className="p-1.5 border border-black">Customer / Client Name</th>
                    <th className="p-1.5 border border-black text-center w-36">Return Notes Booked</th>
                    <th className="p-1.5 border border-black text-right w-36">Total Returned Units</th>
                    <th className="p-1.5 border border-black text-right w-44">Total Credit Adjusted (PKR)</th>
                    <th className="p-1.5 border border-black text-center w-28">% Share of Returns</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                        No sales return records discovered matching chosen selection criteria.
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((cust, idx) => {
                      const realIndex = isPrinting || pageSize === 'all' ? idx + 1 : (currentPage - 1) * (pageSize as number) + idx + 1;
                      return (
                        <tr key={idx} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs">
                          <td className="p-1.5 border border-black text-center text-gray-600">{realIndex}</td>
                          <td className="p-1.5 border border-black font-sans font-bold text-black">{cust.customer_name}</td>
                          <td className="p-1.5 border border-black text-center font-bold text-indigo-700">{cust.returns_count}</td>
                          <td className="p-1.5 border border-black text-right font-bold text-rose-700">
                            {Number(cust.total_returned_qty || 0).toLocaleString()}
                          </td>
                          <td className="p-1.5 border border-black text-right text-purple-800 font-black">
                            Rs. {Number(cust.total_return_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 border border-black text-center text-slate-800 font-bold">
                            {Number(cust.contribution_pct || 0).toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  {/* 📄 Page Subtotal Row */}
                  {!isPrinting && pageSize !== 'all' && (
                    <tr className="bg-amber-50/80 border-t border-black font-bold font-mono text-xs text-amber-950">
                      <td colSpan={2} className="p-2 border border-black text-right uppercase tracking-wider text-amber-900">
                        Page {currentPage} Subtotal ({displayedRows.length} Customers):
                      </td>
                      <td className="p-2 border border-black text-center text-indigo-900 font-bold">
                        {displayedRows.reduce((sum, r) => sum + Number(r.returns_count || 0), 0)}
                      </td>
                      <td className="p-2 border border-black text-right text-rose-800 font-bold whitespace-nowrap">
                        {displayedRows.reduce((sum, r) => sum + Number(r.total_returned_qty || 0), 0).toLocaleString()}
                      </td>
                      <td className="p-2 border border-black text-right text-purple-900 font-black whitespace-nowrap">
                        Rs. {displayedRows.reduce((sum, r) => sum + Number(r.total_return_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 border border-black text-center text-[10px] font-bold text-amber-800">
                        {displayedRows.reduce((sum, r) => sum + Number(r.contribution_pct || 0), 0).toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  {/* 📊 Overall Grand Totals Row */}
                  <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                    <td colSpan={2} className="p-2 border border-black text-right uppercase tracking-wider text-gray-900">
                      Grand Total Summary (All {reportRows.length} Customers):
                    </td>
                    <td className="p-2 border border-black text-center text-indigo-900">
                      {totalInvoicesCount}
                    </td>
                    <td className="p-2 border border-black text-right text-rose-800 font-bold whitespace-nowrap">
                      {totalReturnedUnits.toLocaleString()}
                    </td>
                    <td className="p-2 border border-black text-right text-purple-900 text-sm font-black underline decoration-double whitespace-nowrap">
                      Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 border border-black text-center text-[10px] text-gray-600">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              // ── 📑 DETAILED VIEW TABLE (GROUPED CUSTOMER RETURN BREAKDOWN) ──
              <div className="space-y-6">
                {displayedRows.length === 0 ? (
                  <div className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                    No sales return records discovered matching chosen selection criteria.
                  </div>
                ) : (
                  displayedRows.map((cust: any, cIdx: number) => {
                    const realCustomerNum = isPrinting || pageSize === 'all' ? cIdx + 1 : (currentPage - 1) * (pageSize as number) + cIdx + 1;
                    const custTotalAmount = Number(cust.total_return_amount || 0);
                    const custTotalUnits = Number(cust.total_returned_qty || 0);

                    return (
                      <div key={cIdx} className="border border-black rounded-xs overflow-hidden shadow-xs">
                        {/* 👤 Customer Header Banner */}
                        <div className="bg-slate-800 text-white p-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-rose-500 text-white px-2 py-0.5 rounded font-black text-[10px]">#{realCustomerNum}</span>
                            <span className="font-bold font-sans text-sm tracking-wide uppercase text-white">{cust.customer_name}</span>
                            <span className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded text-[10px]">Return Notes: {cust.returns_count}</span>
                            <span className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded text-[10px]">Units Returned: {custTotalUnits.toLocaleString()}</span>
                            <span className="text-slate-400 text-[10px]">Share: {Number(cust.contribution_pct || 0).toFixed(1)}%</span>
                          </div>
                          <div className="text-right text-[11px] font-black font-mono flex items-center gap-3">
                            <span className="text-purple-300 font-extrabold underline decoration-double">
                              Total Credit Adjusted: Rs. {custTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        {/* Customer Return Transactions Sub-table */}
                        <table className="w-full table-auto border-collapse text-[11px] font-sans text-left">
                          <thead>
                            <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9.5px]">
                              <th className="p-1.5 border border-black text-center w-10">S#</th>
                              <th className="p-1.5 border border-black text-center w-24">Date</th>
                              <th className="p-1.5 border border-black w-28">Return Ref #</th>
                              <th className="p-1.5 border border-black w-28">Original Inv #</th>
                              <th className="p-1.5 border border-black">Sales Officer</th>
                              <th className="p-1.5 border border-black">Returned Line Items</th>
                              <th className="p-1.5 border border-black w-28">Restocked Warehouse</th>
                              <th className="p-1.5 border border-black w-28">Reason / Remarks</th>
                              <th className="p-1.5 border border-black text-right w-28 pr-3">Credit Amount (PKR)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(cust.transactions || []).map((row: any, tIdx: number) => {
                              const displayDocPrefixId = row.return_no || `RTN-${String(row.id).padStart(4, '0')}`;
                              const processingDateDisplay = row.return_date || String(row.created_at || '').split('T')[0];
                              const originalInvDisplay = row.original_invoice_no || '-';
                              const itemDetails = extractItemDetails(row);
                              const itemNames = extractItemNames(row);

                              return (
                                <tr key={tIdx} className="border-b border-gray-300 hover:bg-gray-50 font-mono text-xs">
                                  <td className="p-1.5 border border-black text-center text-gray-500 align-top">{tIdx + 1}</td>
                                  <td className="p-1.5 border border-black text-center text-gray-700 align-top">{processingDateDisplay}</td>
                                  <td className="p-1.5 border border-black font-black text-rose-700 uppercase align-top">{displayDocPrefixId}</td>
                                  <td className="p-1.5 border border-black font-bold text-primary uppercase align-top">{originalInvDisplay}</td>
                                  <td className="p-1.5 border border-black font-sans font-medium text-black align-top">{row.salesman || 'Direct'}</td>
                                  <td className="p-1.5 border border-black font-sans text-gray-800 text-[11px] align-top">
                                    {itemDetails.length > 0 ? (
                                      <div className="flex flex-col gap-1 py-0.5">
                                        {itemDetails.map((item, idx) => (
                                          <div key={idx} className="flex items-center text-[11px] whitespace-nowrap">
                                            <span className="font-semibold text-black">{item.name}</span>
                                            <span className="text-rose-700 font-black text-sm px-1.5 font-mono">|</span>
                                            <span className="text-rose-900 font-mono font-bold">{item.qty} {item.uom}</span>
                                            <span className="text-rose-700 font-black text-sm px-1.5 font-mono">|</span>
                                            <span className="text-gray-900 font-mono font-bold">@ Rs. {Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : itemNames.length > 0 ? (
                                      itemNames.map((name: string, i: number) => (
                                        <React.Fragment key={i}>
                                          {i > 0 && <span className="text-rose-700 font-black text-sm px-1.5 font-mono">|</span>}
                                          <span>{name}</span>
                                        </React.Fragment>
                                      ))
                                    ) : (
                                      <span className="text-gray-400 italic">No Items Listed</span>
                                    )}
                                  </td>
                                  <td className="p-1.5 border border-black font-sans text-gray-700 align-top">{row.dispatch_warehouse || row.location || 'Main Warehouse'}</td>
                                  <td className="p-1.5 border border-black font-sans text-gray-600 text-[10px] align-top">{row.reason || row.remarks || 'Standard Return'}</td>
                                  <td className="p-1.5 border border-black text-right pr-3 font-black text-purple-900 align-top">
                                    Rs. {Number(row.return_amount || row.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50 border-t border-black font-black font-mono text-xs">
                              <td colSpan={5} className="p-1.5 border border-black text-right uppercase tracking-wider text-gray-600">
                                Subtotal ({cust.customer_name} : {cust.returns_count} Return Notes):
                              </td>
                              <td colSpan={3} className="p-1.5 border border-black text-right text-[10px] font-bold text-rose-800">
                                Units Returned: {custTotalUnits.toLocaleString()}
                              </td>
                              <td className="p-1.5 border border-black text-right pr-3 text-purple-900 font-black">
                                Rs. {custTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })
                )}

                {/* Grand Summary Across All Customers */}
                {reportRows.length > 0 && (
                  <div className="space-y-2">
                    {!isPrinting && pageSize !== 'all' && (
                      <div className="bg-amber-50/80 p-3 rounded border border-amber-300 flex justify-between items-center font-mono font-bold text-xs text-amber-950">
                        <span className="uppercase text-amber-900">
                          Page {currentPage} Subtotal ({displayedRows.length} Customers On This Page):
                        </span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-indigo-900">Return Notes: {displayedRows.reduce((s: number, r: any) => s + Number(r.returns_count || 0), 0)}</span>
                          <span className="text-rose-800 font-bold">Units Returned: {displayedRows.reduce((s: number, r: any) => s + Number(r.total_returned_qty || 0), 0).toLocaleString()}</span>
                          <span className="text-purple-900 font-black">Page Credit Total: Rs. {displayedRows.reduce((s: number, r: any) => s + Number(r.total_return_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}

                    <div className="bg-gray-100 p-3.5 rounded border-2 border-black flex justify-between items-center font-mono font-black text-xs">
                      <span className="uppercase text-gray-900">
                        Grand Total Customer Return Breakdown Summary (All {reportRows.length} Customers):
                      </span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-indigo-900">Total Return Notes: {totalInvoicesCount}</span>
                        <span className="text-rose-800 font-bold">Total Units Returned: {totalReturnedUnits.toLocaleString()}</span>
                        <span className="text-purple-800 text-sm underline decoration-double">
                          Grand Credit Adjusted: Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : rType === 'sales-query' ? (
            // ── 📊 SALES PARAMETER MULTI-CRITERIA REGISTER (10-COLUMN FLAT AUDIT) ──
            <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans antialiased text-left print:w-full">
              <thead>
                <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[9.5px]">
                  <th className="p-1.5 border border-black text-center w-10">S#</th>
                  <th className="p-1.5 border border-black text-center w-24">Date</th>
                  <th className="p-1.5 border border-black w-28">Invoice #</th>
                  <th className="p-1.5 border border-black">Customer Name</th>
                  <th className="p-1.5 border border-black">Sales Officer</th>
                  <th className="p-1.5 border border-black w-24">Carrier</th>
                  <th className="p-1.5 border border-black">Product Items</th>
                  <th className="p-1.5 border border-black w-24">Warehouse</th>
                  <th className="p-1.5 border border-black text-center w-16">Term</th>
                  <th className="p-1.5 border border-black text-right pr-3 w-28">Matrix Gross</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                      No sales parameter records discovered matching chosen multi-criteria query parameters.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row, idx) => {
                    const realIndex = isPrinting || pageSize === 'all' ? idx + 1 : (currentPage - 1) * (pageSize as number) + idx + 1;
                    const displayDocPrefixId = row.invoice_no || `INV-${String(row.id).padStart(4, '0')}`;
                    const processingDateDisplay = row.sale_date || String(row.created_at || '').split('T')[0];
                    const itemNames = extractItemNames(row);
                    const isCash = String(row.payment_term || '').toLowerCase() === 'cash';

                    return (
                      <tr key={row.id || idx} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs">
                        <td className="p-1.5 border border-black text-center text-gray-600 align-top">{realIndex}</td>
                        <td className="p-1.5 border border-black text-center text-gray-700 align-top">{processingDateDisplay}</td>
                        <td className="p-1.5 border border-black font-black text-primary uppercase whitespace-nowrap align-top">{displayDocPrefixId}</td>
                        <td className="p-1.5 border border-black font-sans font-medium text-black align-top">{row.customer_name || 'Counter Retail Buyer'}</td>
                        <td className="p-1.5 border border-black font-sans text-gray-700 align-top">{row.salesman || 'Direct'}</td>
                        <td className="p-1.5 border border-black font-sans text-purple-700 font-bold align-top">{row.transport_name || 'Self Pick'}</td>
                        <td className="p-1.5 border border-black font-sans text-gray-800 text-[11px] align-top">
                          {itemNames.length > 0 ? (
                            itemNames.map((name: string, i: number) => (
                              <React.Fragment key={i}>
                                {i > 0 && <span className="text-emerald-700 font-black text-sm px-1.5 font-mono">|</span>}
                                <span>{name}</span>
                              </React.Fragment>
                            ))
                          ) : (
                            <span className="text-gray-400 italic">No Items</span>
                          )}
                        </td>
                        <td className="p-1.5 border border-black font-sans text-gray-600 align-top">{row.dispatch_warehouse || 'Main Warehouse'}</td>
                        <td className="p-1.5 border border-black text-center align-top">
                          <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                            isCash ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}>
                            {row.payment_term || 'Credit'}
                          </span>
                        </td>
                        <td className="p-1.5 border border-black text-right pr-3 font-black text-emerald-700 whitespace-nowrap align-top">
                          Rs. {Number(row.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                {/* 📄 Page Subtotal Row */}
                {!isPrinting && pageSize !== 'all' && (
                  <tr className="bg-amber-50/80 border-t border-black font-bold font-mono text-xs text-amber-950">
                    <td colSpan={9} className="p-2 border border-black text-right uppercase tracking-wider text-amber-900">
                      Page {currentPage} Subtotal ({displayedRows.length} transactions):
                    </td>
                    <td className="p-2 border border-black text-right pr-3 text-emerald-800 font-bold whitespace-nowrap">
                      Rs. {displayedRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
                {/* 📊 Overall Grand Totals Row */}
                <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                  <td colSpan={9} className="p-2 border border-black text-right uppercase tracking-wider text-gray-900">
                    Grand Total Summary (All {reportRows.length} Parameter Records):
                  </td>
                  <td className="p-2 border border-black text-right pr-3 text-success underline decoration-double text-sm whitespace-nowrap font-black">
                    Rs. {totalGrossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="w-full table-auto border border-collapse border-black text-[11px] font-sans antialiased text-left print:w-full">
              <thead>
                <tr className="bg-gray-100 border-b border-black font-black uppercase text-black font-mono text-[10px]">
                  <th className="p-1.5 border border-black text-center">Processing Date</th>
                  <th className="p-1.5 border border-black">Document Ref #</th>
                  <th className="p-1.5 border border-black">Product</th>
                  <th className="p-1.5 border border-black">Customer</th>
                  <th className="p-1.5 border border-black text-right pr-3">Gross Matrix Amount</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 font-bold italic border border-black text-gray-400 bg-gray-50/50">
                      No rows fetched matching the isolated active report criteria token keys.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => {
                    const displayDocPrefixId = row.invoice_no || (rType === 'return' ? `RTN-${String(row.id).padStart(4, '0')}` : `INV-${String(row.id).padStart(4, '0')}`);
                    const processingDateDisplay = row.sale_date || row.return_date || String(row.created_at || '').split('T')[0];
                    const itemNames = extractItemNames(row);
                    const itemDetails = extractItemDetails(row);

                    return (
                      <tr key={row.id} className="border-b border-black hover:bg-gray-50 font-semibold font-mono text-xs">
                        <td className="p-1.5 border border-black text-center text-gray-600 align-top">{processingDateDisplay}</td>
                        <td className="p-1.5 border border-black text-primary font-black uppercase whitespace-nowrap align-top">{displayDocPrefixId}</td>
                        <td className="p-1.5 border border-black font-sans text-black text-[11px] align-top">
                          {rType === 'invoice' ? (
                            itemDetails.length > 0 ? (
                              <div className="flex flex-col gap-1 py-0.5">
                                {itemDetails.map((item, idx) => (
                                  <div key={idx} className="flex items-center text-[11px] whitespace-nowrap">
                                    <span className="font-semibold text-black">{item.name}</span>
                                    <span className="text-emerald-700 font-black text-sm px-1.5 font-mono">|</span>
                                    <span className="text-gray-700 font-mono font-bold">{item.qty} {item.uom}</span>
                                    <span className="text-emerald-700 font-black text-sm px-1.5 font-mono">|</span>
                                    <span className="text-gray-900 font-mono font-bold">Rs. {Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">No Items</span>
                            )
                          ) : (
                            itemNames.length > 0 ? (
                              itemNames.map((name: string, i: number) => (
                                <React.Fragment key={i}>
                                  {i > 0 && <span className="text-emerald-700 font-black text-sm px-1.5 font-mono">|</span>}
                                  <span className="font-medium">{name}</span>
                                </React.Fragment>
                              ))
                            ) : (
                              <span className="text-gray-400 italic">No Items</span>
                            )
                          )}
                        </td>
                        <td className="p-1.5 border border-black text-black font-sans align-top">{row.customer_name || 'Counter Retail Buyer'}</td>
                        <td className="p-1.5 border border-black text-right pr-3 text-success font-black whitespace-nowrap align-top">Rs. {Number(row.total_amount || row.return_amount || row.payout_amount_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                {/* 📄 Page Subtotal Row */}
                {!isPrinting && pageSize !== 'all' && (
                  <tr className="bg-amber-50/80 border-t border-black font-bold font-mono text-xs text-amber-950">
                    <td colSpan={4} className="p-2 border border-black text-right uppercase tracking-wider text-amber-900">
                      Page {currentPage} Subtotal ({displayedRows.length} records):
                    </td>
                    <td className="p-2 border border-black text-right pr-3 text-emerald-800 font-bold whitespace-nowrap">
                      Rs. {displayedRows.reduce((sum, r) => sum + (Number(r.total_amount || r.return_amount || r.payout_amount_paid || 0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
                {/* 📊 Overall Grand Totals Row */}
                <tr className="bg-gray-100 border-t-2 border-black font-black font-mono text-xs">
                  <td colSpan={4} className="p-2 border border-black text-right uppercase tracking-wider text-gray-900">
                    Grand Total Summary (All {reportRows.length} Records):
                  </td>
                  <td className="p-2 border border-black text-right pr-3 text-success underline decoration-double text-sm whitespace-nowrap">
                    Rs. {reportRows.reduce((sum, r) => sum + (Number(r.total_amount || r.return_amount || r.payout_amount_paid || 0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* ── BOTTOM PAGINATION CONTROL ── */}
        <ReportPagination
          currentPage={currentPage}
          totalItems={rType === 'category-sales' && activeViewMode === 'detailed' ? categoryHierarchyTree.length : reportRows.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemLabel={rType === 'category-sales' ? (activeViewMode === 'detailed' ? 'parent categories' : 'categories') : rType === 'product-sales-history' ? 'products' : (rType === 'loyalty' || rType === 'customer-sales' || rType === 'return') ? 'customers' : rType === 'sale' ? 'salesmen' : 'records'}
        />

        {/* ✍️ Formal Multi-Level Executive Verification & Signature Block */}
        <div className="mt-16 grid grid-cols-3 gap-10 text-center text-[10px] font-sans font-black uppercase tracking-wider text-slate-800 break-inside-avoid">
          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">PREPARED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Sales Operations &amp; Audit Officer</div>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="signature-spacer h-20 min-h-[80px]" style={{ height: '80px', minHeight: '80px' }}></div>
            <div className="border-t-2 border-black pt-2">
              <div className="text-black font-extrabold text-[10px]">VERIFIED BY</div>
              <div className="text-[8.5px] font-semibold text-gray-500 normal-case">Corporate Accounts Auditor &amp; Billing Lead</div>
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

        {/* 🏢 Software & Corporate Provider Footer */}
        <div className="mt-8 pt-3 border-t border-gray-300 flex justify-between items-center text-[10px] text-gray-600 font-sans print:border-gray-400 break-inside-avoid">
          <div className="flex items-center gap-2 font-bold">
            <span className="text-black font-black uppercase">ZOAIB ALI &amp; COMPANY</span>
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

export default SaleReportPrint;
